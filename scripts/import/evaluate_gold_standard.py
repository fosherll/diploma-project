"""
Gold Standard оцінка якості ESCO маппінгів.

Використовує локальну cross-encoder NLI модель (без API ключів).
Модель завантажується автоматично ~170MB при першому запуску.

Run:
    python -X utf8 evaluate_gold_standard.py
    python -X utf8 evaluate_gold_standard.py --sample 100
    python -X utf8 evaluate_gold_standard.py --source cv
    python -X utf8 evaluate_gold_standard.py --source vac
    python -X utf8 evaluate_gold_standard.py --min-conf 0.6
"""

import argparse
import json
import sys
import psycopg2
import psycopg2.extras

DATABASE_URL   = "postgres://diploma:diploma@localhost:5432/diploma_db"
# Мультимовна NLI модель (~278MB) — логічне міркування, не схожість векторів
# Підтримує українську, тренувалась на MNLI+XNLI датасетах
MODEL_NAME     = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
ENTAIL_THRESH  = 0.35   # поріг entailment probability (0.35 краще для укр. однослів)


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def fetch_sample(conn, source, sample_size, min_conf):
    rows = []
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

        if source in ("cv", "both"):
            limit = sample_size // 2 if source == "both" else sample_size
            cur.execute("""
                SELECT
                    'cv'       AS source,
                    r.title    AS doc_title,
                    m.raw_skill,
                    m.esco_label,
                    m.confidence,
                    m.method
                FROM resumes r
                JOIN resume_mapping_links l ON l.resume_id = r.id
                JOIN cv_skill_mappings m    ON m.document_id = l.mapping_document_id
                WHERE m.confidence >= %s
                  AND m.esco_label IS NOT NULL
                  AND m.raw_skill  IS NOT NULL
                  AND length(m.raw_skill) > 1
                  AND length(m.esco_label) > 1
                ORDER BY RANDOM()
                LIMIT %s
            """, (min_conf, limit))
            rows += cur.fetchall()

        if source in ("vac", "both"):
            limit = sample_size // 2 if source == "both" else sample_size
            cur.execute("""
                SELECT
                    'vac'      AS source,
                    v.title    AS doc_title,
                    m.raw_skill,
                    m.esco_label,
                    m.confidence,
                    m.method
                FROM vacancies v
                JOIN vacancy_mapping_links l ON l.vacancy_id = v.id
                JOIN vac_skill_mappings m    ON m.document_id = l.mapping_document_id
                WHERE m.confidence >= %s
                  AND m.esco_label IS NOT NULL
                  AND m.raw_skill  IS NOT NULL
                  AND length(m.raw_skill) > 1
                  AND length(m.esco_label) > 1
                ORDER BY RANDOM()
                LIMIT %s
            """, (min_conf, limit))
            rows += cur.fetchall()

    return [dict(r) for r in rows]


def load_model():
    print("  Завантаження NLI моделі (~278MB)...", end=" ", flush=True)
    from transformers import pipeline
    # zero-shot-classification використовує NLI логіку
    classifier = pipeline(
        "zero-shot-classification",
        model=MODEL_NAME,
        device=-1  # CPU
    )
    print("OK")
    return classifier


def annotate(model, rows):
    """
    Zero-shot NLI: перевіряє чи raw_skill відповідає esco_label.
    Hypothesis: "Ця навичка є: {esco_label}"
    Якщо entailment probability >= ENTAIL_THRESH → правильно.
    """
    results = []
    print(f"  Перевіряю {len(rows)} маппінгів через NLI...", flush=True)

    for i, row in enumerate(rows, 1):
        raw   = row["raw_skill"]
        esco  = row["esco_label"]
        # Перевіряємо чи raw_skill відповідає ESCO категорії
        hypothesis = f"Навичка відноситься до категорії: {esco}"
        out = model(raw, candidate_labels=[esco, "інша навичка"], hypothesis_template="{}")
        # Перший лейбл — esco, другий — "інша навичка"
        entail_score = out["scores"][0] if out["labels"][0] == esco else out["scores"][1]
        correct      = entail_score >= ENTAIL_THRESH

        results.append({
            **row,
            "entail_score": round(float(entail_score), 4),
            "llm_correct":  correct,
            "llm_reason":   f"nli_score={entail_score:.3f}"
        })

        if i % 10 == 0:
            print(f"    [{i}/{len(rows)}] оброблено...", flush=True)

    return results


def print_results(results, min_conf):
    valid     = [r for r in results if r["llm_correct"] is not None]
    correct   = [r for r in valid if r["llm_correct"]]
    incorrect = [r for r in valid if not r["llm_correct"]]
    precision = len(correct) / len(valid) * 100 if valid else 0

    print()
    print("=" * 65)
    print("  РЕЗУЛЬТАТИ")
    print("=" * 65)
    print(f"\n  Всього перевірено  : {len(valid)}")
    print(f"  Правильних         : {len(correct)}")
    print(f"  Неправильних       : {len(incorrect)}")
    print(f"\n  ★ PRECISION        : {precision:.1f}%")

    # По методах
    methods = {}
    for r in valid:
        m = r.get("method") or "unknown"
        methods.setdefault(m, {"correct": 0, "total": 0})
        methods[m]["total"] += 1
        if r["llm_correct"]:
            methods[m]["correct"] += 1

    print(f"\n  Точність по методах:")
    print(f"  {'Метод':<28} {'Правильно':>10} {'Всього':>8} {'Precision':>10}")
    print("  " + "-" * 60)
    for m, s in sorted(methods.items()):
        p = s["correct"] / s["total"] * 100 if s["total"] else 0
        print(f"  {m:<28} {s['correct']:>10} {s['total']:>8} {p:>9.1f}%")

    # По джерелах
    srcs = {}
    for r in valid:
        s = r.get("source") or "?"
        srcs.setdefault(s, {"correct": 0, "total": 0})
        srcs[s]["total"] += 1
        if r["llm_correct"]:
            srcs[s]["correct"] += 1

    if len(srcs) > 1:
        print(f"\n  Точність по джерелах:")
        for src, s in srcs.items():
            label = "Резюме" if src == "cv" else "Вакансії"
            p = s["correct"] / s["total"] * 100 if s["total"] else 0
            print(f"  {label:<12}: {s['correct']}/{s['total']} = {p:.1f}%")

    # Неправильні
    if incorrect:
        print(f"\n  НЕПРАВИЛЬНІ маппінги (топ {min(20, len(incorrect))}):")
        print(f"  {'Raw skill':<28} {'ESCO label':<35} {'Conf':>6} {'Score':>6}")
        print("  " + "-" * 82)
        for r in incorrect[:20]:
            raw  = (r["raw_skill"]  or "")[:26]
            esco = (r["esco_label"] or "")[:33]
            conf = float(r["confidence"] or 0)
            sc   = r["entail_score"]
            print(f"  {raw:<28} {esco:<35} {conf:>6.3f} {sc:>6.3f}")

    # Зберігаємо
    out = "gold_standard_results.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)

    print(f"""
  ─────────────────────────────────────────────────────────────
  Висновок:
  При confidence >= {min_conf} система досягає точності {precision:.1f}%
  (перевірено cross-encoder на {len(valid)} маппінгах)

  Модель  : {MODEL_NAME}
  Поріг   : nli_entailment >= {ENTAIL_THRESH}
  Файл    : {out}
  ─────────────────────────────────────────────────────────────
""")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample",   type=int,   default=50)
    parser.add_argument("--source",   choices=["cv", "vac", "both"], default="both")
    parser.add_argument("--min-conf", type=float, default=0.75)
    args = parser.parse_args()

    print("=" * 65)
    print("  GOLD STANDARD — cross-encoder NLI (локальна модель)")
    print("=" * 65)
    print(f"  Вибірка    : {args.sample}")
    print(f"  Джерело    : {args.source}")
    print(f"  Min conf   : {args.min_conf}")
    print(f"  Модель     : {MODEL_NAME}")
    print()

    conn = get_conn()
    try:
        rows = fetch_sample(conn, args.source, args.sample, args.min_conf)
    finally:
        conn.close()

    if not rows:
        print("[error] Немає маппінгів у БД для заданих параметрів")
        sys.exit(1)

    print(f"  Завантажено з БД: {len(rows)} маппінгів")
    print()

    model   = load_model()
    results = annotate(model, rows)
    print_results(results, args.min_conf)


if __name__ == "__main__":
    main()
