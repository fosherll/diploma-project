"""
Для вакансій без ESCO ембедингів — embedding search по title вакансії.
Аналогічно map_resumes_embedding_search.py але для вакансій.

Run:
    python map_vacancies_embedding_search.py
"""

import csv
import numpy as np
import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV      = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
MODEL_NAME    = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
TOP_K         = 3       # топ-3 ESCO навички на вакансію
SIM_THRESHOLD = 0.50
BATCH_SIZE    = 256     # більший батч для швидкості
INSERT_BATCH  = 500     # вставка пачками


def load_esco(csv_path):
    labels, uris = [], []
    seen = set()
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            label = row["preferredLabel"].strip()
            uri   = row["conceptUri"]
            if label and label not in seen:
                labels.append(label)
                uris.append(uri)
                seen.add(label)
    print(f"[esco] {len(labels)} labels loaded")
    return labels, uris


def main():
    model = SentenceTransformer(MODEL_NAME)

    # 1. ESCO матриця
    print("[esco] loading and encoding ESCO skills...")
    esco_labels, esco_uris = load_esco(ESCO_CSV)
    esco_matrix = model.encode(
        esco_labels, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    print(f"[esco] matrix: {esco_matrix.shape}")

    # Кешуємо ембединги ESCO labels для вставки в БД
    label_to_vec = {l: esco_matrix[i].tolist() for i, l in enumerate(esco_labels)}

    # 2. Вакансії без маппінгів
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("""
            SELECT v.id, v.title FROM vacancies v
            WHERE v.title IS NOT NULL AND v.title != ''
              AND NOT EXISTS (
                SELECT 1 FROM vacancy_mapping_links l WHERE l.vacancy_id = v.id
              )
        """)
        vacancies = cur.fetchall()
    print(f"[db] {len(vacancies)} vacancies without mappings")

    if not vacancies:
        print("[done] all vacancies have mappings!")
        conn.close()
        return

    # 3. Кодуємо всі title одним великим батчем
    ids    = [v[0] for v in vacancies]
    titles = [v[1] for v in vacancies]

    print(f"[encode] encoding {len(titles)} vacancy titles...")
    title_vecs = model.encode(
        titles, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)

    # 4. Косинусний пошук для всіх вакансій (матричне множення — швидко)
    print("[search] cosine search against ESCO matrix...")
    # sims shape: (n_vacancies, n_esco)
    sims = title_vecs @ esco_matrix.T

    all_mappings = []
    for i, (vac_id, title) in enumerate(zip(ids, titles)):
        row_sims = sims[i]
        top_idx = np.argsort(row_sims)[::-1][:TOP_K]

        added = False
        for idx in top_idx:
            score = float(row_sims[idx])
            if score >= SIM_THRESHOLD:
                all_mappings.append((
                    vac_id, title,
                    esco_uris[idx], esco_labels[idx],
                    round(score, 4),
                    label_to_vec[esco_labels[idx]]
                ))
                added = True

        if not added:
            # Fallback — завжди беремо топ-1
            best = int(np.argmax(row_sims))
            all_mappings.append((
                vac_id, title,
                esco_uris[best], esco_labels[best],
                round(float(row_sims[best]), 4),
                label_to_vec[esco_labels[best]]
            ))

    print(f"[search] {len(all_mappings)} total mappings for {len(ids)} vacancies")

    # 5. Вставка в БД пачками
    print("[db] inserting vac_skill_mappings...")
    inserted = 0
    vac_ids_done = set()

    with conn.cursor() as cur:
        for start in range(0, len(all_mappings), INSERT_BATCH):
            batch = all_mappings[start:start + INSERT_BATCH]
            for vac_id, raw_skill, uri, label, conf, emb in batch:
                emb_str = f"[{','.join(str(x) for x in emb)}]"
                cur.execute("""
                    INSERT INTO vac_skill_mappings
                        (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
                    ON CONFLICT DO NOTHING
                """, [vac_id, raw_skill, uri, label, conf, "embedding_search", False, emb_str])
                vac_ids_done.add(vac_id)
                inserted += 1

            # Mapping links
            link_data = [(vid, vid) for vid in {b[0] for b in batch}]
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
                VALUES %s ON CONFLICT DO NOTHING
            """, link_data)

            conn.commit()
            print(f"  inserted {min(start + INSERT_BATCH, len(all_mappings))}/{len(all_mappings)}", end="\r")

    print(f"\n[done] inserted {inserted} rows for {len(vac_ids_done)} vacancies")

    # Фінальна перевірка
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM vacancies v
            WHERE NOT EXISTS (
                SELECT 1 FROM vacancy_mapping_links l WHERE l.vacancy_id = v.id
            )
        """)
        remaining = cur.fetchone()[0]
    print(f"[check] vacancies still without mappings: {remaining}")
    conn.close()


if __name__ == "__main__":
    main()
