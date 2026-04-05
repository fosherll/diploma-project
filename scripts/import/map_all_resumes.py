"""
Runs ESCO fuzzy skill mapping + sentence-transformer embeddings
for ALL resumes in the DB that don't yet have mapping links.

Run from E:\Диплом\programm\app\scripts\import\:
    pip install rapidfuzz psycopg2-binary sentence-transformers
    python map_all_resumes.py
"""

import csv
import json
import os
import sys
from pathlib import Path

import psycopg2
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer

# ── Config ────────────────────────────────────────────────────────────────────
DATABASE_URL = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV     = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
RESUME_NDJSON = "C:/Users/foshe/.cache/huggingface/hub/datasets--KSE-RESEARCH-Group--Work_UA_resumes/snapshots/7c3b6df1d74721f1ef102e49a581e08a804b21bd/resumes.ndjson"
MODEL_NAME   = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
FUZZY_THRESHOLD = 80.0
BATCH_SIZE   = 64
# ─────────────────────────────────────────────────────────────────────────────


def load_esco(csv_path: str) -> dict[str, str]:
    """Returns {label_lower: uri} from ESCO skills CSV."""
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


def fuzzy_map(skill: str, labels: dict, label_list: list) -> tuple[str, str, float] | None:
    """Returns (uri, matched_label, score) or None."""
    result = process.extractOne(skill.lower(), label_list, scorer=fuzz.token_sort_ratio)
    if result is None:
        return None
    matched_label, score, _ = result
    if score < FUZZY_THRESHOLD:
        return None
    return labels[matched_label], matched_label, score / 100.0


def get_resume_ids_without_mappings(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.id FROM resumes r
            WHERE NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l WHERE l.resume_id = r.id
            )
        """)
        return [row[0] for row in cur.fetchall()]


def load_resumes_from_cache(ids: set[str]) -> dict[str, dict]:
    """Reads the HuggingFace ndjson and returns {id: row} for requested IDs."""
    result = {}
    with open(RESUME_NDJSON, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            rid = str(row.get("id", ""))
            if rid in ids:
                result[rid] = row
    return result


def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    print("[db] fetching resume IDs without mappings...")
    ids = get_resume_ids_without_mappings(conn)
    print(f"[db] {len(ids)} resumes need mapping")

    if not ids:
        print("[done] all resumes already have mappings")
        conn.close()
        return

    print("[cache] loading resumes from HuggingFace cache...")
    resume_data = load_resumes_from_cache(set(ids))
    print(f"[cache] found {len(resume_data)} resumes in cache")

    print("[esco] loading ESCO skills...")
    esco_labels = load_esco(ESCO_CSV)
    label_list = list(esco_labels.keys())

    print(f"[model] loading {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # ── Process each resume ───────────────────────────────────────────────────
    # Collect all mappings first, then batch-encode embeddings
    all_mappings: list[dict] = []   # {resume_id, raw_skill, esco_uri, esco_label, confidence}
    ids_with_any_mapping: set[str] = set()
    ids_no_match: set[str] = set()  # resumes whose skills had no fuzzy match

    print("[fuzzy] running fuzzy matching...")
    for resume_id, row in resume_data.items():
        skills = row.get("skills") or []
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(",") if s.strip()]

        # Also try skills from work_experiences
        for exp in (row.get("work_experiences") or []):
            if isinstance(exp, dict):
                resp = exp.get("responsibilities") or ""
                # We don't split responsibilities into individual skills — too noisy

        if not skills:
            ids_no_match.add(resume_id)
            continue

        matched = False
        for skill in skills:
            skill = str(skill).strip()
            if not skill:
                continue
            result = fuzzy_map(skill, esco_labels, label_list)
            if result:
                uri, matched_label, score = result
                # Get preferred label from URI
                pref_label = next(
                    (k for k, v in esco_labels.items() if v == uri), matched_label
                )
                all_mappings.append({
                    "resume_id": resume_id,
                    "raw_skill": skill,
                    "esco_uri": uri,
                    "esco_label": pref_label,
                    "confidence": score,
                })
                matched = True
                ids_with_any_mapping.add(resume_id)

        if not matched:
            ids_no_match.add(resume_id)

    print(f"[fuzzy] {len(all_mappings)} mappings for {len(ids_with_any_mapping)} resumes")
    print(f"[fuzzy] {len(ids_no_match)} resumes had no matching skills")

    # ── Batch-encode embeddings ───────────────────────────────────────────────
    unique_labels = list({m["esco_label"] for m in all_mappings})
    print(f"[embed] encoding {len(unique_labels)} unique ESCO labels...")
    vectors = model.encode(unique_labels, batch_size=BATCH_SIZE, show_progress_bar=True, normalize_embeddings=True)
    label_to_vec = {label: vec.tolist() for label, vec in zip(unique_labels, vectors)}

    for m in all_mappings:
        m["embedding"] = label_to_vec.get(m["esco_label"])

    # ── Insert into DB ────────────────────────────────────────────────────────
    print("[db] inserting cv_skill_mappings...")
    with conn.cursor() as cur:
        inserted = 0
        for m in all_mappings:
            emb_str = f"[{','.join(str(x) for x in m['embedding'])}]" if m["embedding"] else None
            cur.execute(
                """INSERT INTO cv_skill_mappings
                   (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)""",
                [m["resume_id"], m["raw_skill"], m["esco_uri"], m["esco_label"],
                 m["confidence"], "fuzzy", False, emb_str]
            )
            inserted += 1
        print(f"[db] inserted {inserted} skill mapping rows")

        print("[db] creating resume_mapping_links...")
        linked = 0
        for resume_id in ids_with_any_mapping:
            cur.execute(
                """INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                   VALUES (%s, %s) ON CONFLICT (resume_id) DO NOTHING""",
                [resume_id, resume_id]
            )
            linked += 1

        # For resumes with no skills matched — still create a link so we don't reprocess
        for resume_id in ids_no_match:
            cur.execute(
                """INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                   VALUES (%s, %s) ON CONFLICT (resume_id) DO NOTHING""",
                [resume_id, resume_id]
            )

        conn.commit()
        print(f"[db] created {linked} mapping links ({len(ids_no_match)} with no skills)")

    conn.close()
    print("[done] all resumes processed!")


if __name__ == "__main__":
    main()
