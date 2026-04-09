"""
Для резюме без ESCO ембедингів — реалізує підхід як у CVWeightedMapper викладача:
1. Кодуємо всі ESCO навички sentence-transformers → будуємо матрицю
2. Для кожного резюме кодуємо title + витягуємо ключові слова з markdown
3. Косинусний пошук по ESCO матриці → top-K найближчих навичок
4. Зберігаємо в cv_skill_mappings з ембедингами

Run:
    python map_resumes_embedding_search.py
"""

import csv
import re
import numpy as np
import psycopg2
from sentence_transformers import SentenceTransformer

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV      = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
ФTOP_K         = 5      # скільки ESCO навичок брати для кожного сигналу
SIM_THRESHOLD = 0.55   # мінімальна косинусна схожість
BATCH_SIZE    = 128


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_esco(csv_path: str) -> tuple[list[str], list[str]]:
    """Повертає (labels, uris)."""
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
    print(f"[esco] {len(labels)} preferred labels loaded")
    return labels, uris


def extract_signals_from_markdown(markdown: str) -> list[str]:
    """Витягує ключові фрази з markdown тексту резюме."""
    if not markdown:
        return []
    signals = []

    # Шукаємо рядки після ключових слів
    patterns = [
        r"(?:Посада|Должность|Position)[:\s]+([^\n]{3,80})",
        r"(?:Обов'язки|Обязанности|Responsibilities)[:\s]+([^\n]{3,150})",
        r"(?:Навички|Навыки|Skills)[:\s]+([^\n]{3,150})",
        r"(?:Спеціальність|Специальность)[:\s]+([^\n]{3,80})",
        r"(?:Розглядає посади|Рассматривает должности)[:\s]+([^\n]{3,150})",
    ]
    for pat in patterns:
        for m in re.finditer(pat, markdown, re.IGNORECASE):
            text = m.group(1).strip()
            # Розбиваємо через кому/крапку з комою
            for part in re.split(r"[,;]", text):
                part = part.strip()
                if 3 < len(part) < 80:
                    signals.append(part)

    return signals[:10]  # обмежуємо кількість сигналів


def cosine_search(query_vec: np.ndarray, esco_matrix: np.ndarray,
                  labels: list[str], uris: list[str],
                  top_k: int, threshold: float) -> list[dict]:
    """Косинусний пошук по ESCO матриці."""
    sims = esco_matrix @ query_vec  # вектори вже нормалізовані
    idx = np.argsort(sims)[::-1][:top_k]
    results = []
    for i in idx:
        score = float(sims[i])
        if score >= threshold:
            results.append({
                "esco_label": labels[i],
                "esco_uri":   uris[i],
                "confidence": round(score, 4),
            })
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    model = SentenceTransformer(MODEL_NAME)

    # 1. Завантаження ESCO
    print("[esco] loading skills...")
    esco_labels, esco_uris = load_esco(ESCO_CSV)

    print(f"[esco] encoding {len(esco_labels)} labels (one-time)...")
    esco_matrix = model.encode(
        esco_labels, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    print(f"[esco] matrix shape: {esco_matrix.shape}")

    # 2. Отримати резюме без ембедингів
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.id, r.title, r.markdown
            FROM resumes r
            WHERE NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l
                JOIN cv_skill_mappings m ON m.document_id = l.mapping_document_id
                WHERE l.resume_id = r.id AND m.embedding IS NOT NULL
            )
        """)
        resumes = cur.fetchall()
    print(f"[db] {len(resumes)} resumes still without embeddings")

    if not resumes:
        print("[done] all resumes have embeddings!")
        conn.close()
        return

    # 3. Для кожного резюме будуємо сигнали і шукаємо в ESCO
    all_mappings: list[dict] = []
    ids_mapped: set[str] = set()

    for resume_id, title, markdown in resumes:
        signals = []

        # Сигнал 1: title (найважливіший, як position у викладача)
        if title and len(title.strip()) > 2:
            signals.append(title.strip())

        # Сигнал 2: ключові фрази з markdown (як responsibilities у викладача)
        signals += extract_signals_from_markdown(markdown or "")

        if not signals:
            # Останній fallback — просто "загальний працівник"
            signals = ["працівник"]

        # Дедуплікація
        signals = list(dict.fromkeys(signals))

        # Кодуємо всі сигнали батчем
        signal_vecs = model.encode(
            signals, batch_size=BATCH_SIZE, normalize_embeddings=True
        ).astype(np.float32)

        # Збираємо результати по всіх сигналах, дедуплікуємо по URI
        best_by_uri: dict[str, dict] = {}
        for sig, vec in zip(signals, signal_vecs):
            hits = cosine_search(vec, esco_matrix, esco_labels, esco_uris,
                                 top_k=TOP_K, threshold=SIM_THRESHOLD)
            for hit in hits:
                uri = hit["esco_uri"]
                if uri not in best_by_uri or hit["confidence"] > best_by_uri[uri]["confidence"]:
                    best_by_uri[uri] = {**hit, "raw_skill": sig}

        if not best_by_uri:
            # Якщо нічого не знайшли — беремо топ-1 без порогу
            vec = signal_vecs[0]
            sims = esco_matrix @ vec
            best_idx = int(np.argmax(sims))
            best_by_uri[esco_uris[best_idx]] = {
                "esco_label": esco_labels[best_idx],
                "esco_uri":   esco_uris[best_idx],
                "confidence": round(float(sims[best_idx]), 4),
                "raw_skill":  signals[0],
            }

        for hit in best_by_uri.values():
            all_mappings.append({
                "resume_id":   resume_id,
                "raw_skill":   hit["raw_skill"],
                "esco_uri":    hit["esco_uri"],
                "esco_label":  hit["esco_label"],
                "confidence":  hit["confidence"],
            })
            ids_mapped.add(resume_id)

    print(f"[search] {len(all_mappings)} mappings for {len(ids_mapped)} resumes")

    # 4. Кодуємо ESCO labels для знайдених маппінгів
    unique_labels = list({m["esco_label"] for m in all_mappings})
    print(f"[embed] encoding {len(unique_labels)} unique labels for DB storage...")
    label_vecs = model.encode(
        unique_labels, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    )
    label_to_vec = {l: v.tolist() for l, v in zip(unique_labels, label_vecs)}
    for m in all_mappings:
        m["embedding"] = label_to_vec[m["esco_label"]]

    # 5. Вставка в БД
    print("[db] inserting cv_skill_mappings...")
    with conn.cursor() as cur:
        inserted = 0
        for m in all_mappings:
            emb_str = f"[{','.join(str(x) for x in m['embedding'])}]"
            cur.execute("""
                INSERT INTO cv_skill_mappings
                    (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
                ON CONFLICT DO NOTHING
            """, [m["resume_id"], m["raw_skill"], m["esco_uri"], m["esco_label"],
                  m["confidence"], "embedding_search", False, emb_str])
            inserted += 1

        for resume_id in ids_mapped:
            cur.execute("""
                INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                VALUES (%s, %s)
                ON CONFLICT (resume_id) DO UPDATE SET mapping_document_id = EXCLUDED.mapping_document_id
            """, [resume_id, resume_id])

        conn.commit()

    print(f"[done] inserted {inserted} rows for {len(ids_mapped)} resumes")

    # Фінальна перевірка
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM resumes r
            WHERE NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l
                JOIN cv_skill_mappings m ON m.document_id = l.mapping_document_id
                WHERE l.resume_id = r.id AND m.embedding IS NOT NULL
            )
        """)
        remaining = cur.fetchone()[0]
    print(f"[check] resumes still without embeddings: {remaining}")
    conn.close()


if __name__ == "__main__":
    main()
