"""
Оцінка якості ESCO маппінгів трьома способами:

  Спосіб 1 — Статистика по методах (avg confidence, coverage)
  Спосіб 2 — Аналіз рівнів впевненості по методах (замість перетину)
  Спосіб 3 — Мінівибірка тільки з confidence >= 0.75 (висока точність)

Run:
    python evaluate_quality.py

    або тільки один спосіб:
    python evaluate_quality.py --method 1
    python evaluate_quality.py --method 2
    python evaluate_quality.py --method 3

    очистити orphaned links перед запуском:
    python evaluate_quality.py --fix-links
"""

import argparse
import psycopg2
import psycopg2.extras

DATABASE_URL    = "postgres://diploma:diploma@localhost:5432/diploma_db"
SAMPLE_SIZE     = 20
CONF_THRESHOLD  = 0.75   # поріг для "якісного" маппінгу


def get_conn():
    return psycopg2.connect(DATABASE_URL)


# ─────────────────────────────────────────────────────────────
# ВИПРАВЛЕННЯ ORPHANED LINKS
# ─────────────────────────────────────────────────────────────

def fix_orphaned_links(conn):
    print("\n[fix] Перевірка orphaned resume_mapping_links...")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM resume_mapping_links l
            WHERE NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = l.resume_id)
        """)
        count = cur.fetchone()[0]
        print(f"  Знайдено orphaned links: {count}")

        if count > 0:
            cur.execute("""
                DELETE FROM resume_mapping_links l
                WHERE NOT EXISTS (SELECT 1 FROM resumes r WHERE r.id = l.resume_id)
            """)
            conn.commit()
            print(f"  Видалено {count} orphaned links")
        else:
            print("  Все чисто, нічого видаляти")


# ─────────────────────────────────────────────────────────────
# СПОСІБ 1 — статистика по методах
# ─────────────────────────────────────────────────────────────

def method_1_stats(conn):
    print("\n" + "=" * 60)
    print("  СПОСІБ 1 — Статистика по методах маппінгу")
    print("=" * 60)

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

        # --- Резюме ---
        print("\n[РЕЗЮМЕ] cv_skill_mappings:")
        cur.execute("""
            SELECT
                method,
                COUNT(*)                                              AS total,
                ROUND(AVG(confidence)::numeric, 4)                    AS avg_conf,
                COUNT(*) FILTER (WHERE confidence >= 0.7)             AS above_07,
                COUNT(*) FILTER (WHERE confidence >= 0.75)            AS above_075,
                COUNT(*) FILTER (WHERE confidence >= 0.9)             AS above_09,
                ROUND(
                    COUNT(*) FILTER (WHERE confidence >= 0.75)::numeric
                    / NULLIF(COUNT(*), 0) * 100, 1
                )                                                     AS pct_075
            FROM cv_skill_mappings
            WHERE method IS NOT NULL
            GROUP BY method
            ORDER BY avg_conf DESC
        """)
        rows = cur.fetchall()
        print(f"  {'Метод':<22} {'Всього':>8} {'Avg':>7} {'≥0.70':>7} {'≥0.75':>7} {'≥0.90':>7} {'≥0.75%':>8}")
        print("  " + "-" * 72)
        for r in rows:
            print(f"  {r['method']:<22} {r['total']:>8} {r['avg_conf']:>7} "
                  f"{r['above_07']:>7} {r['above_075']:>7} {r['above_09']:>7} {r['pct_075']:>7}%")

        # --- Вакансії ---
        print("\n[ВАКАНСІЇ] vac_skill_mappings:")
        cur.execute("""
            SELECT
                method,
                COUNT(*)                                              AS total,
                ROUND(AVG(confidence)::numeric, 4)                    AS avg_conf,
                COUNT(*) FILTER (WHERE confidence >= 0.7)             AS above_07,
                COUNT(*) FILTER (WHERE confidence >= 0.75)            AS above_075,
                COUNT(*) FILTER (WHERE confidence >= 0.9)             AS above_09,
                ROUND(
                    COUNT(*) FILTER (WHERE confidence >= 0.75)::numeric
                    / NULLIF(COUNT(*), 0) * 100, 1
                )                                                     AS pct_075
            FROM vac_skill_mappings
            WHERE method IS NOT NULL
            GROUP BY method
            ORDER BY avg_conf DESC
        """)
        rows = cur.fetchall()
        print(f"  {'Метод':<22} {'Всього':>8} {'Avg':>7} {'≥0.70':>7} {'≥0.75':>7} {'≥0.90':>7} {'≥0.75%':>8}")
        print("  " + "-" * 72)
        for r in rows:
            print(f"  {r['method']:<22} {r['total']:>8} {r['avg_conf']:>7} "
                  f"{r['above_07']:>7} {r['above_075']:>7} {r['above_09']:>7} {r['pct_075']:>7}%")

        # --- Покриття (виправлено: тільки реальні резюме) ---
        print("\n[ПОКРИТТЯ]")
        cur.execute("SELECT COUNT(*) FROM resumes")
        total_res = cur.fetchone()[0]
        cur.execute("""
            SELECT COUNT(DISTINCT l.resume_id)
            FROM resume_mapping_links l
            WHERE EXISTS (SELECT 1 FROM resumes r WHERE r.id = l.resume_id)
        """)
        mapped_res = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM vacancies")
        total_vac = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT vacancy_id) FROM vacancy_mapping_links")
        mapped_vac = cur.fetchone()[0]

        res_pct = round(mapped_res / total_res * 100, 1) if total_res else 0
        vac_pct = round(mapped_vac / total_vac * 100, 1) if total_vac else 0

        print(f"  Резюме з маппінгами:   {mapped_res}/{total_res} ({res_pct}%)")
        print(f"  Вакансії з маппінгами: {mapped_vac}/{total_vac} ({vac_pct}%)")


# ─────────────────────────────────────────────────────────────
# СПОСІБ 2 — аналіз якості по рівнях confidence
# ─────────────────────────────────────────────────────────────

def method_2_confidence_analysis(conn):
    print("\n" + "=" * 60)
    print("  СПОСІБ 2 — Аналіз якості по рівнях confidence")
    print("=" * 60)

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

        # Розподіл по діапазонах для резюме
        print("\n[РЕЗЮМЕ] Розподіл маппінгів по рівнях:")
        cur.execute("""
            SELECT
                method,
                COUNT(*) FILTER (WHERE confidence < 0.6)          AS low,
                COUNT(*) FILTER (WHERE confidence >= 0.6
                                   AND confidence < 0.75)          AS medium,
                COUNT(*) FILTER (WHERE confidence >= 0.75
                                   AND confidence < 0.9)           AS good,
                COUNT(*) FILTER (WHERE confidence >= 0.9)          AS excellent,
                COUNT(*)                                           AS total
            FROM cv_skill_mappings
            WHERE method IS NOT NULL
            GROUP BY method
            ORDER BY method
        """)
        rows = cur.fetchall()
        print(f"  {'Метод':<22} {'<0.60':>8} {'0.60-0.75':>10} {'0.75-0.90':>10} {'≥0.90':>8} {'Всього':>8}")
        print("  " + "-" * 72)
        for r in rows:
            print(f"  {r['method']:<22} {r['low']:>8} {r['medium']:>10} "
                  f"{r['good']:>10} {r['excellent']:>8} {r['total']:>8}")

        # Якщо використовувати тільки confidence >= 0.75
        print(f"\n[ФІЛЬТР ≥ 0.75] Якщо залишити тільки якісні маппінги:")
        cur.execute("""
            SELECT
                method,
                COUNT(*) FILTER (WHERE confidence >= 0.75) AS kept,
                COUNT(*)                                    AS total,
                ROUND(
                    COUNT(*) FILTER (WHERE confidence >= 0.75)::numeric
                    / NULLIF(COUNT(*), 0) * 100, 1
                )                                          AS kept_pct,
                COUNT(DISTINCT document_id) FILTER (WHERE confidence >= 0.75) AS docs_kept,
                COUNT(DISTINCT document_id)                AS docs_total
            FROM cv_skill_mappings
            WHERE method IS NOT NULL
            GROUP BY method
            ORDER BY method
        """)
        rows = cur.fetchall()
        print(f"  {'Метод':<22} {'Залишається':>12} {'з':>5} {'%':>6} {'Резюме':>8} {'з':>5}")
        print("  " + "-" * 65)
        for r in rows:
            print(f"  {r['method']:<22} {r['kept']:>12} {r['total']:>5} {r['kept_pct']:>5}% "
                  f"{r['docs_kept']:>8} {r['docs_total']:>5}")

        # Топ-15 ESCO навичок з найвищою впевненістю
        print(f"\n[ТОП-15] Найчастіші ESCO навички (confidence >= 0.75):")
        cur.execute("""
            SELECT
                esco_label,
                COUNT(DISTINCT document_id)             AS resume_count,
                ROUND(AVG(confidence)::numeric, 3)      AS avg_conf
            FROM cv_skill_mappings
            WHERE confidence >= 0.75
              AND esco_label IS NOT NULL
            GROUP BY esco_label
            ORDER BY resume_count DESC
            LIMIT 15
        """)
        rows = cur.fetchall()
        print(f"  {'#':<4} {'ESCO навичка':<45} {'Резюме':>8} {'Avg conf':>10}")
        print("  " + "-" * 72)
        for i, r in enumerate(rows, 1):
            label = (r['esco_label'] or '')[:43]
            print(f"  {i:<4} {label:<45} {r['resume_count']:>8} {r['avg_conf']:>10}")


# ─────────────────────────────────────────────────────────────
# СПОСІБ 3 — мінівибірка ТІЛЬКИ з confidence >= 0.75
# ─────────────────────────────────────────────────────────────

def method_3_sample(conn):
    print("\n" + "=" * 60)
    print(f"  СПОСІБ 3 — Мінівибірка (confidence >= {CONF_THRESHOLD})")
    print("=" * 60)

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

        cur.execute(f"""
            SELECT
                r.id            AS resume_id,
                r.title         AS resume_title,
                m.raw_skill,
                m.esco_label,
                m.confidence,
                m.method
            FROM resumes r
            JOIN resume_mapping_links l ON l.resume_id = r.id
            JOIN cv_skill_mappings m    ON m.document_id = l.mapping_document_id
            WHERE m.embedding IS NOT NULL
              AND m.confidence >= {CONF_THRESHOLD}
              AND r.title IS NOT NULL
              AND r.title != ''
            ORDER BY RANDOM()
            LIMIT {SAMPLE_SIZE}
        """)
        rows = cur.fetchall()

    print(f"\n  Показано {len(rows)} прикладів з confidence >= {CONF_THRESHOLD}.")
    print("  Постав + якщо маппінг правильний, - якщо ні.\n")
    print(f"  {'#':<4} {'Резюме title':<28} {'Raw skill':<25} {'ESCO label':<40} {'Conf':>6} {'Метод'}")
    print("  " + "-" * 120)

    for i, r in enumerate(rows, 1):
        resume_title = (r["resume_title"] or "—")[:26]
        raw_skill    = (r["raw_skill"]    or "—")[:23]
        esco_label   = (r["esco_label"]   or "—")[:38]
        conf         = float(r["confidence"] or 0)
        method       = (r["method"]       or "—")[:18]
        print(f"  {i:<4} {resume_title:<28} {raw_skill:<25} {esco_label:<40} {conf:>6.3f} {method}")

    print(f"""
  ─────────────────────────────────────────────
  Як порахувати Precision:
  Precision = правильних / {len(rows)}

  При confidence >= {CONF_THRESHOLD} очікувана точність: 85-95%
  ─────────────────────────────────────────────
""")


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Оцінка якості ESCO маппінгів")
    parser.add_argument("--method", type=int, choices=[1, 2, 3],
                        help="Запустити тільки один спосіб: 1, 2 або 3")
    parser.add_argument("--fix-links", action="store_true",
                        help="Видалити orphaned resume_mapping_links і вийти")
    args = parser.parse_args()

    conn = get_conn()
    try:
        if args.fix_links:
            fix_orphaned_links(conn)
            return

        if args.method == 1:
            method_1_stats(conn)
        elif args.method == 2:
            method_2_confidence_analysis(conn)
        elif args.method == 3:
            method_3_sample(conn)
        else:
            method_1_stats(conn)
            method_2_confidence_analysis(conn)
            method_3_sample(conn)
    finally:
        conn.close()

    print("\n[done]")


if __name__ == "__main__":
    main()
