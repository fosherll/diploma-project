"""
Для резюме без ESCO ембедингів — витягує навички з поля title (назва посади)
через fuzzy matching проти ESCO таксономії, як це робить CVWeightedMapper у викладача.

Run:
    pip install rapidfuzz psycopg2-binary sentence-transformers
    python map_resumes_by_title.py
"""

import csv
import re
from pathlib import Path

import psycopg2
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer

DATABASE_URL = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV     = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
MODEL_NAME   = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
FUZZY_THRESHOLD = 65.0   # нижчий поріг бо title — менш точний сигнал
BATCH_SIZE   = 64


def load_esco(csv_path: str) -> dict[str, str]:
    labels = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uri = row["conceptUri"]
            pref = row["preferredLabel"].strip()
            labels[pref.lower()] = uri
            for alt in (row.get("altLabels") or "").split("\n"):
                alt = alt.strip()
                if alt:
                    labels[alt.lower()] = uri
    print(f"[esco] loaded {len(labels)} labels")
    return labels


def fuzzy_map(skill: str, labels: dict, label_list: list, threshold: float):
    result = process.extractOne(skill.lower(), label_list, scorer=fuzz.token_sort_ratio)
    if result is None:
        return None
    matched_label, score, _ = result
    if score < threshold:
        return None
    return labels[matched_label], matched_label, score / 100.0


def split_title_to_tokens(title: str) -> list[str]:
    """Розбиває назву посади на окремі слова/фрази для пошуку."""
    # Повна назва + окремі слова довше 3 символів
    tokens = [title.strip()]
    words = re.split(r"[\s,/\-–—]+", title)
    for w in words:
        w = w.strip()
        if len(w) > 3:
            tokens.append(w)
    return list(set(tokens))


def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    print("[db] fetching resumes without embeddings...")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.id, r.title
            FROM resumes r
            WHERE r.title IS NOT NULL AND r.title != ''
              AND NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l
                JOIN cv_skill_mappings m ON m.document_id = l.mapping_document_id
                WHERE l.resume_id = r.id AND m.embedding IS NOT NULL
              )
        """)
        resumes = cur.fetchall()

    print(f"[db] {len(resumes)} resumes need mapping via title")

    if not resumes:
        print("[done] all resumes already have embeddings")
        conn.close()
        return

    print("[esco] loading ESCO skills...")
    esco_labels = load_esco(ESCO_CSV)
    label_list = list(esco_labels.keys())

    print(f"[model] loading {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    all_mappings = []
    ids_with_mapping = set()

    print("[fuzzy] matching titles to ESCO...")
    for resume_id, title in resumes:
        tokens = split_title_to_tokens(title)
        matched_this = False

        for token in tokens:
            result = fuzzy_map(token, esco_labels, label_list, FUZZY_THRESHOLD)
            if result:
                uri, matched_label, score = result
                pref_label = next(
                    (k for k, v in esco_labels.items() if v == uri), matched_label
                )
                all_mappings.append({
                    "resume_id": resume_id,
                    "raw_skill": token,
                    "esco_uri": uri,
                    "esco_label": pref_label,
                    "confidence": score,
                })
                ids_with_mapping.add(resume_id)
                matched_this = True

    print(f"[fuzzy] {len(all_mappings)} mappings for {len(ids_with_mapping)} resumes")

    if not all_mappings:
        print("[done] no new mappings found")
        conn.close()
        return

    # Batch encode embeddings
    unique_labels = list({m["esco_label"] for m in all_mappings})
    print(f"[embed] encoding {len(unique_labels)} unique ESCO labels...")
    vectors = model.encode(unique_labels, batch_size=BATCH_SIZE,
                           show_progress_bar=True, normalize_embeddings=True)
    label_to_vec = {label: vec.tolist() for label, vec in zip(unique_labels, vectors)}

    for m in all_mappings:
        m["embedding"] = label_to_vec.get(m["esco_label"])

    # Insert into DB
    print("[db] inserting cv_skill_mappings...")
    with conn.cursor() as cur:
        inserted = 0
        for m in all_mappings:
            emb_str = f"[{','.join(str(x) for x in m['embedding'])}]" if m["embedding"] else None
            cur.execute("""
                INSERT INTO cv_skill_mappings
                   (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
                ON CONFLICT DO NOTHING
            """, [m["resume_id"], m["raw_skill"], m["esco_uri"], m["esco_label"],
                  m["confidence"], "fuzzy_title", False, emb_str])
            inserted += 1

        print(f"[db] inserted {inserted} rows")

        # Update mapping links for those that didn't have any mappings before
        print("[db] updating resume_mapping_links...")
        for resume_id in ids_with_mapping:
            cur.execute("""
                INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                VALUES (%s, %s) ON CONFLICT (resume_id) DO UPDATE
                SET mapping_document_id = EXCLUDED.mapping_document_id
            """, [resume_id, resume_id])

        conn.commit()

    print(f"[done] {len(ids_with_mapping)} resumes now have embeddings via title matching")
    conn.close()


if __name__ == "__main__":
    main()
