"""
Для вакансій без ESCO ембедингів — embedding search по вимогах/навичках вакансії.

Логіка:
  - Витягуємо ключові слова-навички з description_text (секції "Вимоги", "Обов'язки", "Навички")
  - НЕ маппимо title напряму — це назва посади (occupation), а не навичка
  - Якщо опис відсутній — пропускаємо вакансію

Run:
    python map_vacancies_embedding_search.py
"""

import csv
import re
import time
import numpy as np
import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV      = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
MODEL_NAME    = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
TOP_K         = 3       # топ-3 ESCO навички на сигнал
SIM_THRESHOLD = 0.70    # підвищено з 0.62 → зменшує кількість хибних маппінгів
BATCH_SIZE    = 256
INSERT_BATCH  = 500


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


def extract_skill_signals(text: str) -> list[str]:
    """Витягує навички/вимоги з тексту опису вакансії.

    Шукає секції «Вимоги», «Навички», «Обов'язки» і витягує конкретні фрази.
    Назву вакансії (посаду) НЕ використовуємо — це occupation, не skill.
    """
    if not text or len(text.strip()) < 10:
        return []

    signals = []

    # Пріоритет 1 — явні вимоги до навичок
    skill_pats = [
        r"(?:Вимоги|Требования|Requirements|Must have|Nice to have)"
        r"[:\s]*\n?((?:[^\n]+\n?){1,15})",
        r"(?:Навички|Навыки|Skills|Технічні навички|Hard skills|Soft skills)"
        r"[:\s]*\n?((?:[^\n]+\n?){1,15})",
        r"(?:Знання|Знание|Knowledge)[:\s]*\n?((?:[^\n]+\n?){1,10})",
        r"(?:Вміння|Умение|Умения)[:\s]*\n?((?:[^\n]+\n?){1,10})",
    ]
    for pat in skill_pats:
        for m in re.finditer(pat, text, re.IGNORECASE):
            block = m.group(1)
            for part in re.split(r"[;\n•\-–·▪▸]", block):
                part = re.sub(r"^\s*[\*\#\d\.]+\s*", "", part).strip()
                # Розбиваємо по комі тільки якщо коротко
                if "," in part and len(part) < 120:
                    for sub in part.split(","):
                        sub = sub.strip()
                        if _is_skill(sub):
                            signals.append(sub)
                elif _is_skill(part):
                    signals.append(part)

    # Пріоритет 2 — обов'язки (дієслівні фрази = конкретні дії)
    duty_pats = [
        r"(?:Обов'язки|Обязанности|Responsibilities|Завдання|Задачи)"
        r"[:\s]*\n?((?:[^\n]+\n?){1,15})",
    ]
    for pat in duty_pats:
        for m in re.finditer(pat, text, re.IGNORECASE):
            block = m.group(1)
            for part in re.split(r"[;\n•\-–·▪▸]", block):
                part = re.sub(r"^\s*[\*\#\d\.]+\s*", "", part).strip()
                if _is_skill(part) and len(part.split()) >= 2:  # мінімум 2 слова
                    signals.append(part)

    # Дедуплікація
    seen: set = set()
    unique = []
    for s in signals:
        if s.lower() not in seen:
            seen.add(s.lower())
            unique.append(s)

    return unique[:20]


# ESCO мітки що ніколи не є правильним маппінгом для людської навички
_BAD_ESCO_LABELS = re.compile(
    r"(добрив|гальван|розкидати|вносити добр|підживлен|компост|ґрунт|"
    r"епіграфіка|транскреація|ідиш|біжутерія|vyper|staf\b|педіатрія|"
    r"столярство|іврит|нашіптуванням|шушу|термінологія)",
    re.IGNORECASE | re.UNICODE
)

# Слова-маркери що вказують на посаду (не навичку) — такі сигнали пропускаємо
# Охоплює: українські, російські варіанти + англійські
_OCCUPATION_WORDS = re.compile(
    r"^(менеджер|директор|спеціаліст|керівник|начальник|завідувач|завідуючий|"
    r"головний|старший|молодший|помічник|асистент|провідний|оператор|адміністратор|"
    r"інспектор|інженер|технік|робітник|різноробочий|підсобний|прибиральни|"
    r"кур[''`є]р|водій|водитель|касир|продавець|бухгалтер|економіст|юрист|"
    r"лікар|медсестр|медбрат|вчитель|викладач|монтажник|слюсар|зварник|токар|"
    r"фрезерувальник|електрик|охоронник|охоронець|охорона|охранник|"
    r"кухар|офіціант|официант|бариста|флорист|перукар|косметолог|масажист|нянька|"
    r"секретар|діловод|архіваріус|логіст|диспетчер|аналітик|програміст|"
    r"дизайнер|маркетолог|рекрутер|тренер|редактор|художник|сценарист|"
    r"контролер|командир|комірник|фасувальник|пакувальник|складальник|"
    r"заступник|представник|виконавець|консультант|координатор|супервайзер|"
    # Русизми
    r"менеджер|инженер|специалист|руководитель|начальник|заведующий|"
    r"главный|старший|помощник|оператор|администратор|водитель|бухгалтер|"
    r"юрист|врач|учитель|охранник|официант|кассир|продавец|аналитик|"
    r"программист|дизайнер|маркетолог|рекрутер|контролер|командир|"
    # Англійські
    r"coordinator|manager|engineer|specialist|director|officer|supervisor|"
    r"assistant|developer|designer|analyst|recruiter|controller|commander|"
    r"consultant|representative|inspector)",
    re.IGNORECASE | re.UNICODE
)

# Прикметники що часто передують назві посади (pattern: "Фінансовий аналітик")
_OCCUPATION_ADJECTIVES = re.compile(
    r"^(фінансовий|технічний|головний|старший|молодший|провідний|генеральний|"
    r"виконавчий|комерційний|операційний|регіональний|національний|"
    r"финансовый|технический|главный|старший|коммерческий|операционный)",
    re.IGNORECASE | re.UNICODE
)


def _is_skill(text: str) -> bool:
    """Перевіряє чи текст є валідною навичкою (не шум, не назва посади)."""
    t = text.strip()
    if len(t) < 3 or len(t) > 120:
        return False
    # Відкидаємо обривки що закінчуються на ")" або починаються з ")" — фрагменти
    if t.endswith(")") and "(" not in t:
        return False
    if re.fullmatch(r"[-=_\s\|\.]{2,}", t):
        return False
    if re.fullmatch(r"[\d\s\-\/\.]+", t):
        return False

    words = t.split()
    first = words[0] if words else ""

    # Відкидаємо посади: до 5 слів що починаються з маркера (включно з дефісними)
    # "Водій-експедитор" → перша частина до дефісу теж перевіряється
    first_stem = re.split(r"[-–]", first)[0]
    if len(words) <= 5 and (_OCCUPATION_WORDS.match(first) or _OCCUPATION_WORDS.match(first_stem)):
        return False

    # Pattern "прикметник + посада": "Фінансовий аналітик", "Старший менеджер"
    if len(words) == 2 and _OCCUPATION_ADJECTIVES.match(words[0]) and _OCCUPATION_WORDS.match(words[1]):
        return False

    return True


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

    label_to_vec = {l: esco_matrix[i].tolist() for i, l in enumerate(esco_labels)}

    # 2. Вакансії без маппінгів — беремо і title і description_text
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("""
            SELECT v.id, v.title, v.description_text FROM vacancies v
            WHERE NOT EXISTS (
                SELECT 1 FROM vacancy_mapping_links l WHERE l.vacancy_id = v.id
            )
        """)
        vacancies = cur.fetchall()
    print(f"[db] {len(vacancies)} vacancies without mappings")

    if not vacancies:
        print("[done] all vacancies have mappings!")
        conn.close()
        return

    # 3. Витягуємо сигнали навичок з опису (не з title!)
    vac_signals: list[tuple[int, str, list[str]]] = []
    skipped = 0
    for vac_id, title, desc in vacancies:
        signals = extract_skill_signals(desc or "")
        if not signals:
            skipped += 1
            continue
        vac_signals.append((vac_id, title, signals))

    print(f"[signals] {len(vac_signals)} вакансій з навичками, {skipped} пропущено (немає опису/навичок)")

    if not vac_signals:
        print("[done] nothing to map")
        conn.close()
        return

    # 4. Кодуємо всі унікальні сигнали батчем
    all_signal_texts = list({s for _, _, sigs in vac_signals for s in sigs})
    print(f"[encode] encoding {len(all_signal_texts)} unique skill phrases...")
    sig_vecs = model.encode(
        all_signal_texts, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    sig_to_vec = {s: sig_vecs[i] for i, s in enumerate(all_signal_texts)}

    # 5. Косинусний пошук для кожного сигналу
    print("[search] cosine search against ESCO matrix...")
    all_mappings = []

    for vac_id, title, signals in vac_signals:
        best_by_uri: dict[str, tuple] = {}
        for sig in signals:
            vec = sig_to_vec[sig]
            row_sims = esco_matrix @ vec
            top_idx = np.argsort(row_sims)[::-1][:TOP_K]
            for idx in top_idx:
                score = float(row_sims[idx])
                if score >= SIM_THRESHOLD:
                    if _BAD_ESCO_LABELS.search(esco_labels[idx]):
                        continue
                    uri = esco_uris[idx]
                    if uri not in best_by_uri or score > best_by_uri[uri][3]:
                        best_by_uri[uri] = (
                            vac_id, sig,
                            esco_labels[idx], score,
                            label_to_vec[esco_labels[idx]]
                        )
        for uri, (vid, raw, label, conf, emb) in best_by_uri.items():
            all_mappings.append((vid, raw, uri, label, round(conf, 4), emb))

    print(f"[search] {len(all_mappings)} total mappings for {len(vac_signals)} vacancies")

    # 6. Вставка в БД пачками
    print("[db] inserting vac_skill_mappings...")
    t0 = time.time()
    inserted = 0
    vac_ids_done = set()

    with conn.cursor() as cur:
        for start in range(0, len(all_mappings), INSERT_BATCH):
            batch = all_mappings[start:start + INSERT_BATCH]

            skill_rows = [
                (vac_id, raw_skill, uri, label, conf,
                 "embedding_search", False,
                 f"[{','.join(str(x) for x in emb)}]")
                for vac_id, raw_skill, uri, label, conf, emb in batch
            ]
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vac_skill_mappings
                    (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                VALUES %s
                ON CONFLICT DO NOTHING
            """, skill_rows, template="(%s,%s,%s,%s,%s,%s,%s,%s::vector)")

            for vac_id, *_ in batch:
                vac_ids_done.add(vac_id)
            inserted += len(batch)

            psycopg2.extras.execute_values(cur, """
                INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
                VALUES %s ON CONFLICT DO NOTHING
            """, [(b[0], b[0]) for b in batch])

            conn.commit()
            elapsed = time.time() - t0
            print(f"  inserted {min(start + INSERT_BATCH, len(all_mappings))}/{len(all_mappings)} time={elapsed:.0f}s", end="\r")

    print(f"\n[done] inserted {inserted} rows for {len(vac_ids_done)} vacancies, time={time.time()-t0:.0f}s")

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
