"""
Маппінг вакансій по назві посади → ESCO навички через офіційні зв'язки ESCO.

Алгоритм (найточніший можливий без повного опису вакансії):
  1. Завантажуємо ESCO occupations (Ukrainian labels)
  2. Кодуємо назви посад у embedding простір
  3. Для кожної вакансії: title → nearest ESCO occupation (cosine search)
  4. Для знайденої occupation → беремо офіційний список skills
     з occupationSkillRelations (essential > optional)
  5. Skills → Ukrainian labels з skills_uk.csv
  6. Зберігаємо в БД (method = 'esco_occupation')

Переваги над прямим embedding title→skill:
  - Використовує офіційні зв'язки ESCO, а не вигадані моделлю
  - Essential skills мають пріоритет над optional
  - Набагато вища точність (ESCO це і є джерело правди)

Run:
    python -X utf8 map_vacancies_by_title.py --dry-run         # приклади без запису
    python -X utf8 map_vacancies_by_title.py --limit 500       # тест
    python -X utf8 map_vacancies_by_title.py                   # повний маппінг (~20 хв)
"""

import argparse
import csv
import re
import numpy as np
import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer
from collections import defaultdict

DATABASE_URL = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_DIR     = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv"

MODEL_NAME    = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
OCC_THRESHOLD = 0.60   # поріг для title → occupation (менший бо ми хочемо знайти найближчу посаду)
TOP_SKILLS    = 8      # максимум skills на вакансію (essential спочатку)
BATCH_SIZE    = 256
INSERT_BATCH  = 500


# ── Завантаження ESCO ──────────────────────────────────────────────────────────

def load_occupations(esco_dir: str):
    """Завантажує ESCO occupations з Ukrainian labels."""
    path = f"{esco_dir}/occupations_uk.csv"
    occ_uri_to_label = {}   # uri → preferredLabel (uk)
    occ_uri_to_alts  = {}   # uri → [altLabel, ...]

    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            uri   = row["conceptUri"]
            label = row["preferredLabel"].strip()
            alts  = [a.strip() for a in (row.get("altLabels") or "").split("\n") if a.strip()]
            if uri and label:
                occ_uri_to_label[uri] = label
                occ_uri_to_alts[uri]  = alts

    print(f"[esco] {len(occ_uri_to_label)} occupations loaded")
    return occ_uri_to_label, occ_uri_to_alts


def load_skills(esco_dir: str):
    """Завантажує Ukrainian labels для ESCO skills."""
    path = f"{esco_dir}/skills_uk.csv"
    skill_uri_to_label = {}
    skill_uri_to_emb   = {}   # заповнимо пізніше

    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            uri   = row["conceptUri"]
            label = row["preferredLabel"].strip()
            if uri and label:
                skill_uri_to_label[uri] = label

    print(f"[esco] {len(skill_uri_to_label)} skills loaded")
    return skill_uri_to_label


def load_occ_skill_relations(esco_dir: str):
    """
    Завантажує зв'язки occupation → [skills].
    Повертає dict: occupation_uri → [(skill_uri, relationType), ...]
    Відсортовано: essential спочатку, потім optional.
    """
    path = f"{esco_dir}/occupationSkillRelations_uk.csv"
    relations = defaultdict(list)

    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            occ_uri   = row["occupationUri"]
            skill_uri = row["skillUri"]
            rel_type  = row["relationType"]   # 'essential' або 'optional'
            if occ_uri and skill_uri:
                relations[occ_uri].append((skill_uri, rel_type))

    # Сортуємо: essential спочатку
    for uri in relations:
        relations[uri].sort(key=lambda x: (0 if x[1] == "essential" else 1))

    print(f"[esco] {len(relations)} occupations мають skill relations")
    total = sum(len(v) for v in relations.values())
    print(f"[esco] {total} зв'язків occupation→skill загалом")
    return dict(relations)


# ── Підготовка title ───────────────────────────────────────────────────────────

def clean_title(title: str) -> str:
    """Очищає vacancy title для пошуку."""
    if not title:
        return ""
    # Видаляємо вміст дужок: "Менеджер (Київ, досвід 2р)" → "Менеджер"
    t = re.sub(r"\([^)]*\)", "", title)
    # Прибираємо спецсимволи
    t = re.sub(r"[\"'«»/\\|*•·]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    # Якщо більше 6 слів — скорочуємо (зазвичай це опис, не назва посади)
    words = t.split()
    if len(words) > 6:
        t = " ".join(words[:6])
    return t


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",     type=int,   default=None,
                        help="Обмежити кількість вакансій (для тесту)")
    parser.add_argument("--dry-run",   action="store_true",
                        help="Показати приклади без запису в БД")
    parser.add_argument("--threshold", type=float, default=OCC_THRESHOLD,
                        help=f"Поріг title→occupation (default: {OCC_THRESHOLD})")
    parser.add_argument("--top-skills", type=int,  default=TOP_SKILLS,
                        help=f"Макс. skills на вакансію (default: {TOP_SKILLS})")
    args = parser.parse_args()

    print("=" * 65)
    print("  МАППІНГ ВАКАНСІЙ: title → ESCO occupation → skills")
    print("=" * 65)
    print(f"  Поріг occupation : {args.threshold}")
    print(f"  Top skills       : {args.top_skills}")
    print(f"  Dry-run          : {'так' if args.dry_run else 'ні'}")
    if args.limit:
        print(f"  Ліміт            : {args.limit} вакансій")
    print()

    # ── 1. Завантаження ESCO ──────────────────────────────────────────────────
    print("[1] Завантаження ESCO даних...")
    occ_label, occ_alts = load_occupations(ESCO_DIR)
    skill_label          = load_skills(ESCO_DIR)
    occ_skill_rel        = load_occ_skill_relations(ESCO_DIR)
    print()

    # ── 2. Кодування occupation labels ────────────────────────────────────────
    print("[2] Кодування ESCO occupations...")
    model = SentenceTransformer(MODEL_NAME)

    occ_uris   = list(occ_label.keys())
    occ_labels = [occ_label[u] for u in occ_uris]

    # Для пошуку кодуємо preferredLabel + altLabels (беремо перший altLabel якщо є)
    occ_search_texts = []
    for uri in occ_uris:
        label = occ_label[uri]
        alts  = occ_alts.get(uri, [])
        # Об'єднуємо label + перший alt для кращого матчінгу
        text  = label if not alts else f"{label} {alts[0]}"
        occ_search_texts.append(text)

    occ_matrix = model.encode(
        occ_search_texts, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    print(f"    occupation matrix: {occ_matrix.shape}")
    print()

    # ── 3. Кодування skill labels (для embedding в БД) ─────────────────────────
    print("[3] Кодування ESCO skills (для збереження embeddings)...")
    skill_uris_list   = list(skill_label.keys())
    skill_labels_list = [skill_label[u] for u in skill_uris_list]

    skill_matrix = model.encode(
        skill_labels_list, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)

    skill_uri_to_vec = {u: skill_matrix[i].tolist()
                        for i, u in enumerate(skill_uris_list)}
    print(f"    skill matrix: {skill_matrix.shape}")
    print()

    # ── 4. Завантаження вакансій ───────────────────────────────────────────────
    print("[4] Завантаження вакансій з БД...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    limit_clause = f"LIMIT {args.limit}" if args.limit else ""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT v.id, v.title FROM vacancies v
            WHERE NOT EXISTS (
                SELECT 1 FROM vacancy_mapping_links l WHERE l.vacancy_id = v.id
            )
            AND v.title IS NOT NULL AND length(trim(v.title)) >= 3
            ORDER BY v.id
            {limit_clause}
        """)
        vacancies = cur.fetchall()
    print(f"    Знайдено {len(vacancies)} вакансій без маппінгів\n")

    if not vacancies:
        print("[done] Всі вакансії вже замаппені!")
        conn.close()
        return

    # Групуємо по clean_title
    title_to_ids: dict[str, list] = {}
    skipped = 0
    for vac_id, title in vacancies:
        cleaned = clean_title(title or "")
        if len(cleaned) < 3:
            skipped += 1
            continue
        title_to_ids.setdefault(cleaned, []).append(vac_id)

    unique_titles = list(title_to_ids.keys())
    print(f"    Унікальних назв посад  : {len(unique_titles)}")
    print(f"    Пропущено (немає title): {skipped}\n")

    # ── 5. Кодування vacancy titles ───────────────────────────────────────────
    print(f"[5] Кодування {len(unique_titles)} унікальних назв посад...")
    title_vecs = model.encode(
        unique_titles, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    print()

    # ── 6. Пошук: title → occupation → skills ─────────────────────────────────
    print("[6] Пошук occupation + збір skills...")
    all_mappings  = []
    ids_mapped    = set()
    no_occ_match  = 0
    no_skills     = 0

    # Збираємо приклади для таблиці (і dry-run і звичайний режим)
    examples = []

    for title, vec in zip(unique_titles, title_vecs):
        # Знаходимо найближчу ESCO occupation
        sims     = occ_matrix @ vec
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])

        if best_sim < args.threshold:
            no_occ_match += 1
            continue

        occ_uri       = occ_uris[best_idx]
        occ_lbl       = occ_labels[best_idx]
        skills_for_occ = occ_skill_rel.get(occ_uri, [])

        if not skills_for_occ:
            no_skills += 1
            continue

        # Беремо top N skills (essential спочатку)
        top_skills = skills_for_occ[:args.top_skills]

        # Збираємо приклади для таблиці
        if len(examples) < 15:
            skill_names = [skill_label.get(s_uri, "?") for s_uri, _ in top_skills[:3]]
            examples.append((title, occ_lbl, best_sim, skill_names))

        for vac_id in title_to_ids[title]:
            for skill_uri, rel_type in top_skills:
                s_label = skill_label.get(skill_uri)
                if not s_label:
                    continue
                s_vec = skill_uri_to_vec.get(skill_uri)
                if not s_vec:
                    continue
                # confidence = similarity title→occupation (як міра впевненості)
                conf = round(best_sim, 4)
                all_mappings.append((vac_id, title, skill_uri, s_label, conf, s_vec, rel_type))
                ids_mapped.add(vac_id)

    print(f"    Знайдено occupation   : {len(unique_titles) - no_occ_match - no_skills}/{len(unique_titles)}")
    print(f"    Без occupation match  : {no_occ_match}")
    print(f"    Без skills у ESCO     : {no_skills}")
    print(f"    Всього маппінгів      : {len(all_mappings)}")
    print(f"    Вакансій замаппено    : {len(ids_mapped)}\n")

    # ── Таблиця прикладів ──────────────────────────────────────────────────────
    print("=" * 65)
    print("  ПРИКЛАДИ (title → ESCO occupation → топ-3 навички)")
    print("=" * 65)

    for title, occ_lbl, sim, skills in examples:
        t = (title[:32] + "..") if len(title) > 34 else title
        o = (occ_lbl[:32] + "..") if len(str(occ_lbl)) > 34 else str(occ_lbl)
        print(f"\n  Вакансія : {t}")
        print(f"  Occupation: {o}  (sim={sim:.3f})")
        print(f"  Skills   :", " | ".join(skills[:3]))

    print()

    if args.dry_run:
        print("[dry-run] Нічого не записано в БД.")
        conn.close()
        return

    if not all_mappings:
        print("[done] Немає маппінгів для запису.")
        conn.close()
        return

    # ── 7. Вставка в БД ───────────────────────────────────────────────────────
    print(f"[7] Запис {len(all_mappings)} маппінгів у БД...")
    inserted     = 0
    vac_ids_done = set()

    with conn.cursor() as cur:
        for start in range(0, len(all_mappings), INSERT_BATCH):
            batch = all_mappings[start:start + INSERT_BATCH]
            for vac_id, raw_skill, uri, label, conf, emb, rel_type in batch:
                emb_str = f"[{','.join(str(x) for x in emb)}]"
                # Зберігаємо relationType у полі method для прозорості
                method = f"esco_occupation_{rel_type}"
                cur.execute("""
                    INSERT INTO vac_skill_mappings
                        (document_id, raw_skill, esco_uri, esco_label,
                         confidence, method, via_graph, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
                    ON CONFLICT DO NOTHING
                """, [vac_id, raw_skill, uri, label, conf,
                      method, False, emb_str])
                vac_ids_done.add(vac_id)
                inserted += 1

            link_data = [(b[0], b[0]) for b in batch]
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
                VALUES %s ON CONFLICT DO NOTHING
            """, link_data)

            conn.commit()
            done = min(start + INSERT_BATCH, len(all_mappings))
            pct  = done * 100 // len(all_mappings)
            bar  = "█" * (pct // 5) + "░" * (20 - pct // 5)
            print(f"\r    [{bar}] {pct:3d}%  {done}/{len(all_mappings)}", end="", flush=True)

    print(f"\n\n[done] Вставлено {inserted} рядків для {len(vac_ids_done)} вакансій")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM vacancies v
            WHERE NOT EXISTS (
                SELECT 1 FROM vacancy_mapping_links l WHERE l.vacancy_id = v.id
            )
        """)
        remaining = cur.fetchone()[0]
    print(f"[check] Залишилось без маппінгу: {remaining} вакансій")
    conn.close()


if __name__ == "__main__":
    main()
