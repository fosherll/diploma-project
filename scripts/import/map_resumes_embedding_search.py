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
import time
import numpy as np
import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
ESCO_CSV      = "E:/Диплом/skills2-main-extracted/skills2-main/esco/ESCO dataset - v1.2.1 - classification - uk - csv/skills_uk.csv"
TOP_K         = 5      # скільки ESCO навичок брати для кожного сигналу
SIM_THRESHOLD = 0.62   # мінімальна косинусна схожість
BATCH_SIZE    = 128
MODEL_NAME    = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
CHUNK         = 200    # кількість резюме за один цикл
SAVE_EVERY    = 500    # зберігаємо в БД кожні N маппінгів

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_esco(csv_path: str) -> tuple[list[str], list[str], dict[str, str]]:
    """Повертає (labels, uris, label_to_uri)."""
    labels, uris = [], []
    label_to_uri: dict[str, str] = {}
    seen = set()
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            label = row["preferredLabel"].strip()
            uri   = row["conceptUri"]
            if label and label not in seen:
                labels.append(label)
                uris.append(uri)
                label_to_uri[label] = uri
                seen.add(label)
    print(f"[esco] {len(labels)} preferred labels loaded")
    return labels, uris, label_to_uri


# ESCO мітки що ніколи не є правильним маппінгом для людської навички
# (агрономічні, галванічні тощо терміни з низькою семантикою для HR)
_BAD_ESCO_LABELS = re.compile(
    r"(добрив|гальван|розкидати|вносити добр|підживлен|компост|ґрунт|"
    r"епіграфіка|транскреація|ідиш|біжутерія|vyper|staf\b|педіатрія|"
    r"столярство|іврит|нашіптуванням|шушу|термінологія)",
    re.IGNORECASE | re.UNICODE
)

# Слова-маркери що вказують на посаду (не навичку) — такі сигнали пропускаємо
_OCCUPATION_WORDS = re.compile(
    r"^(менеджер|директор|спеціаліст|керівник|начальник|завідувач|головний|"
    r"старший|молодший|помічник|асистент|провідний|провідній|оператор|"
    r"адміністратор|інспектор|інженер|технік|робітник|прибиральни|кур'єр|"
    r"водій|касир|продавець|бухгалтер|економіст|юрист|лікар|вчитель|викладач|"
    r"монтажник|слюсар|зварник|токар|фрезерувальник|електрик|охоронник|"
    r"кухар|офіціант|бариста|флорист|перукар|косметолог|масажист|нянька|"
    r"секретар|діловод|архіваріус|логіст|диспетчер|аналітик|програміст|"
    r"дизайнер|маркетолог|pr|hr|it|web|smm|seo)",
    re.IGNORECASE | re.UNICODE
)


def is_skill_like(text: str) -> bool:
    """Перевіряє чи текст схожий на навичку (а не посаду чи шум)."""
    t = text.strip()
    if len(t) < 3 or len(t) > 80:
        return False
    # Відкидаємо чисті роздільники
    if re.fullmatch(r"[-=_\s\|\.]{2,}", t):
        return False
    # Відкидаємо рядки що складаються тільки з цифр / дат
    if re.fullmatch(r"[\d\s\-\/\.]+", t):
        return False
    # Відкидаємо однослівні назви посад (вони не є навичками)
    words = t.split()
    if len(words) <= 2 and _OCCUPATION_WORDS.match(t):
        return False
    return True


def extract_signals_from_markdown(markdown: str) -> list[str]:
    """Витягує ключові фрази-НАВИЧКИ з markdown тексту резюме.

    Пріоритет: секція «Навички» > «Обов'язки» > «Спеціальність».
    Назви посад (Посада / Розглядає посади) виключені — це occupations, не skills.
    """
    if not markdown:
        return []

    signals = []

    # 1. Пріоритет — явні навички (найточніший сигнал)
    skills_patterns = [
        r"(?:Навички|Навыки|Skills|Ключові навички|Профессиональные навыки)"
        r"[:\s]*\n?((?:[^\n]+\n?){1,10})",
        r"(?:Навички|Навыки|Skills)[:\s]+([^\n]{3,200})",
    ]
    for pat in skills_patterns:
        for m in re.finditer(pat, markdown, re.IGNORECASE):
            block = m.group(1)
            for part in re.split(r"[,;\n•\-–]", block):
                part = part.strip().strip("*#").strip()
                if is_skill_like(part):
                    signals.append(part)

    # 2. Обов'язки / Responsibilities — конкретні дії
    for m in re.finditer(
        r"(?:Обов'язки|Обязанности|Responsibilities)[:\s]+([^\n]{5,200})",
        markdown, re.IGNORECASE
    ):
        for part in re.split(r"[,;]", m.group(1)):
            part = part.strip()
            if is_skill_like(part) and len(part.split()) >= 2:
                signals.append(part)

    # 3. Спеціальність (тільки якщо містить кілька слів — описово)
    for m in re.finditer(
        r"(?:Спеціальність|Специальность)[:\s]+([^\n]{5,80})",
        markdown, re.IGNORECASE
    ):
        part = m.group(1).strip()
        if is_skill_like(part) and len(part.split()) >= 2:
            signals.append(part)

    # Дедуплікація з збереженням порядку
    seen = set()
    unique = []
    for s in signals:
        if s not in seen:
            seen.add(s)
            unique.append(s)

    return unique[:15]  # до 15 сигналів


# ── Soft-skill whitelist ──────────────────────────────────────────────────────
# Для поширених м'яких навичок embedding-пошук дає хибні результати (MiniLM не знає HR контексту).
# Використовуємо заздалегідь визначений маппінг: pattern → preferred ESCO label.
# Якщо сигнал збігається — використовуємо whitelist, confidence=1.0, cosine пошук пропускаємо.

_SOFT_SKILL_WHITELIST: list[tuple[re.Pattern, str]] = [
    # Комунікація
    (re.compile(r"комунікабельн|комунікативн|комуникабельн|коммуникабельн|комунікаційн", re.I | re.U), "спілкування"),
    (re.compile(r"ведення переговор|навички переговор|переговорн|negotiat", re.I | re.U), "проведення переговорів"),
    (re.compile(r"публічн.{0,10}виступ|презентаційн|public speak", re.I | re.U), "проведення презентацій"),
    (re.compile(r"ділов.{0,5}листування|ділов.{0,5}переписк|business writing", re.I | re.U), "ділове листування"),

    # Стресостійкість / емоції
    (re.compile(r"стресостійк|стрессоустойч|стресс.{0,5}стійк|stress.{0,5}resistan", re.I | re.U), "витримувати стрес"),
    (re.compile(r"емоційн.{0,10}інтелект|емоційн.{0,10}стійк|emotional intelligence", re.I | re.U), "демонструвати емоційний інтелект"),
    (re.compile(r"конфліктостійк|безконфліктн|неконфліктн", re.I | re.U), "вирішення конфліктів"),

    # Навчання / розвиток
    (re.compile(r"здатн.{0,10}навчан|навчаємість|навчальн|быстро обучаем|швидко навча|легко навча|жажда знан", re.I | re.U), "самонавчання"),
    (re.compile(r"самоорганіз|самоорганизац|self.{0,5}organ", re.I | re.U), "самоорганізація"),
    (re.compile(r"саморозвит|самовдосконален|особистісн.{0,10}розвит|профес.{0,10}розвит", re.I | re.U), "самонавчання"),

    # Відповідальність / надійність
    (re.compile(r"відповідальн|ответственн|accountab|reliab", re.I | re.U), "нести відповідальність"),
    (re.compile(r"пунктуальн|punctual", re.I | re.U), "дотримуватися розкладів"),
    (re.compile(r"дисциплінован|дисциплин|disciplin", re.I | re.U), "проявляти дисципліну"),
    (re.compile(r"добросовісн|сумлінн|integrity|чесн.{0,5}(робот|прац)", re.I | re.U), "нести відповідальність"),

    # Робота в команді / лідерство
    (re.compile(r"команд.{0,10}(робот|гравец|player|spirit)|робот.{0,10}команд|team.{0,5}(work|player)", re.I | re.U), "робота в команді"),
    (re.compile(r"лідерськ|лидерск|leadership", re.I | re.U), "демонструвати лідерство"),
    (re.compile(r"мотивац.{0,10}(команд|персонал|співробіт)|motivat.{0,10}team", re.I | re.U), "мотивування персоналу"),
    (re.compile(r"наставництв|менторств|coaching|наставник", re.I | re.U), "наставництво"),

    # Аналітика / мислення
    (re.compile(r"аналітичн.{0,10}(мисленн|склад|мышлен)|analytical thinking", re.I | re.U), "аналітичне мислення"),
    (re.compile(r"критичн.{0,10}мисленн|critical thinking", re.I | re.U), "критичне мислення"),
    (re.compile(r"вирішенн.{0,10}проблем|розв.{0,5}(завдань|задач)|problem.{0,5}solv", re.I | re.U), "вирішення проблем"),
    (re.compile(r"увага.{0,10}деталей|уважн|attention.{0,5}detail", re.I | re.U), "приділяти увагу деталям"),
    (re.compile(r"системн.{0,10}(мисленн|підхід|підход)|системн.{0,5}погляд", re.I | re.U), "системне мислення"),

    # Організація / час
    (re.compile(r"тайм.{0,5}менеджмент|управлін.{0,10}часом|time.{0,5}manag", re.I | re.U), "ефективне використання часу"),
    (re.compile(r"мультизадачн|багатозадачн|multitask", re.I | re.U), "виконувати кілька завдань одночасно"),
    (re.compile(r"організаційн.{0,10}навич|організованість|organizat", re.I | re.U), "організаційні навички"),
    (re.compile(r"планування.{0,10}(робот|час|задач|проект)|planning", re.I | re.U), "планування"),

    # Ініціативність / проактивність
    (re.compile(r"ініціативн|инициативн|proactiv", re.I | re.U), "виявляти ініціативу"),
    (re.compile(r"цілеспрямован|целеустремлен|goal.{0,5}orient", re.I | re.U), "переслідувати цілі"),
    (re.compile(r"творч.{0,5}(мисленн|підхід|здібност)|креативн|creativit", re.I | re.U), "творче мислення"),
    (re.compile(r"гнучк.{0,10}(мисленн|підхід|робот)|адаптивн|flexib|adaptab", re.I | re.U), "демонструвати гнучкість"),

    # Клієнтоорієнтованість
    (re.compile(r"клієнтоорієнтован|клієнтоорієнтованість|customer.{0,5}orient|орієнтаці.{0,10}клієнт", re.I | re.U), "орієнтація на клієнта"),
    (re.compile(r"сервісн.{0,10}орієнтац|обслуговуванн.{0,10}клієнт|customer service", re.I | re.U), "обслуговування клієнтів"),

    # Мови
    (re.compile(r"англійськ.{0,5}(мов|мовн)|english.{0,5}(language|profic|skill)", re.I | re.U), "англійська мова"),
    (re.compile(r"німецьк.{0,5}(мов|мовн)|deutsch|german.{0,5}(language|profic)", re.I | re.U), "німецька мова"),
    (re.compile(r"французьк.{0,5}(мов|мовн)|french.{0,5}(language|profic)", re.I | re.U), "французька мова"),
    (re.compile(r"польськ.{0,5}(мов|мовн)|polish.{0,5}(language|profic)", re.I | re.U), "польська мова"),
]


def soft_skill_lookup(raw_skill: str, label_to_uri: dict[str, str]) -> dict | None:
    """Якщо raw_skill збігається з whitelisted soft skill — повертає готовий hit.
    label_to_uri: {esco_label: esco_uri} словник.
    """
    t = raw_skill.strip()
    for pattern, esco_label in _SOFT_SKILL_WHITELIST:
        if pattern.search(t):
            uri = label_to_uri.get(esco_label)
            if uri:
                return {"esco_label": esco_label, "esco_uri": uri, "confidence": 1.0}
    return None


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
            label = labels[i]
            # Відкидаємо явно безглузді ESCO мітки для HR контексту
            if _BAD_ESCO_LABELS.search(label):
                continue
            results.append({
                "esco_label": label,
                "esco_uri":   uris[i],
                "confidence": round(score, 4),
            })
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    model = SentenceTransformer(MODEL_NAME)

    # 1. Завантаження ESCO
    print("[esco] loading skills...")
    esco_labels, esco_uris, label_to_uri = load_esco(ESCO_CSV)

    print(f"[esco] encoding {len(esco_labels)} labels (one-time)...")
    esco_matrix = model.encode(
        esco_labels, batch_size=BATCH_SIZE,
        show_progress_bar=True, normalize_embeddings=True
    ).astype(np.float32)
    print(f"[esco] matrix shape: {esco_matrix.shape}")

    # 2. Підрахунок резюме без маппінгів
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    with conn.cursor() as cnt_cur:
        cnt_cur.execute("""
            SELECT COUNT(*) FROM resumes r
            WHERE NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l WHERE l.resume_id = r.id
            )
        """)
        total_unmapped = cnt_cur.fetchone()[0]
    print(f"[db] {total_unmapped} resumes without mapping links")

    if total_unmapped == 0:
        print("[done] all resumes already have mapping links!")
        conn.close()
        return

    # 3. Ітеруємо по чанках без завантаження всіх рядків у пам'ять
    t0 = time.time()
    processed = 0
    total_inserted = 0
    total_mapped = 0

    # Кеш векторів ESCO label (щоб не кодувати одне й те саме двічі)
    label_vec_cache: dict[str, list] = {}

    def get_label_vec(lbl: str) -> list:
        if lbl not in label_vec_cache:
            v = model.encode([lbl], normalize_embeddings=True)[0]
            label_vec_cache[lbl] = v.tolist()
        return label_vec_cache[lbl]

    def flush_batch(batch_mappings: list[dict], batch_ids: set) -> int:
        """Записати пакет маппінгів у БД, повернути кількість вставлених рядків."""
        if not batch_mappings and not batch_ids:
            return 0
        with conn.cursor() as wcur:
            rows = []
            if batch_mappings:
                for m in batch_mappings:
                    emb_str = f"[{','.join(str(x) for x in m['embedding'])}]"
                    rows.append((m["resume_id"], m["raw_skill"], m["esco_uri"],
                                 m["esco_label"], m["confidence"],
                                 "embedding_search", False, emb_str))
                psycopg2.extras.execute_values(wcur, """
                    INSERT INTO cv_skill_mappings
                        (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, embedding)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                """, rows, template="(%s,%s,%s,%s,%s,%s,%s,%s::vector)")

            if batch_ids:
                psycopg2.extras.execute_values(wcur, """
                    INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                    VALUES %s
                    ON CONFLICT (resume_id) DO UPDATE SET mapping_document_id = EXCLUDED.mapping_document_id
                """, [(rid, rid) for rid in batch_ids])

            conn.commit()
        return len(rows)

    # Буфер поточного пакету
    batch_mappings: list[dict] = []
    batch_ids: set = set()

    while True:
        # Завантажуємо CHUNK рядків за раз — завжди OFFSET 0,
        # бо WHERE вже фільтрує оброблені (датасет скорочується)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.id, r.title, r.markdown
                FROM resumes r
                WHERE NOT EXISTS (
                    SELECT 1 FROM resume_mapping_links l WHERE l.resume_id = r.id
                )
                ORDER BY r.id
                LIMIT %s
            """, (CHUNK,))
            rows = cur.fetchall()

        if not rows:
            break

        # Крок 1: збираємо сигнали для всіх резюме в чанку
        chunk_items = [
            (resume_id, extract_signals_from_markdown(markdown or ""))
            for resume_id, _title, markdown in rows
        ]

        # Крок 2: один виклик model.encode на весь чанк замість окремого на кожне резюме
        all_signals = [sig for _, sigs in chunk_items for sig in sigs]
        if all_signals:
            all_vecs = model.encode(
                all_signals, batch_size=BATCH_SIZE, normalize_embeddings=True
            ).astype(np.float32)
        else:
            all_vecs = np.empty((0, esco_matrix.shape[1]), dtype=np.float32)

        # Крок 3: розподіляємо вектори назад по резюме та будуємо маппінги
        vec_idx = 0
        for resume_id, signals in chunk_items:
            if not signals:
                batch_ids.add(resume_id)
                processed += 1
                continue

            signal_vecs = all_vecs[vec_idx:vec_idx + len(signals)]
            vec_idx += len(signals)

            best_by_uri: dict[str, dict] = {}
            for sig, vec in zip(signals, signal_vecs):
                wl_hit = soft_skill_lookup(sig, label_to_uri)
                if wl_hit:
                    uri = wl_hit["esco_uri"]
                    if uri not in best_by_uri or wl_hit["confidence"] > best_by_uri[uri]["confidence"]:
                        best_by_uri[uri] = {**wl_hit, "raw_skill": sig}
                    continue

                hits = cosine_search(vec, esco_matrix, esco_labels, esco_uris,
                                     top_k=TOP_K, threshold=SIM_THRESHOLD)
                for hit in hits:
                    uri = hit["esco_uri"]
                    if uri not in best_by_uri or hit["confidence"] > best_by_uri[uri]["confidence"]:
                        best_by_uri[uri] = {**hit, "raw_skill": sig}

            if best_by_uri:
                for hit in best_by_uri.values():
                    batch_mappings.append({
                        "resume_id":  resume_id,
                        "raw_skill":  hit["raw_skill"],
                        "esco_uri":   hit["esco_uri"],
                        "esco_label": hit["esco_label"],
                        "confidence": hit["confidence"],
                        "embedding":  get_label_vec(hit["esco_label"]),
                    })
                total_mapped += 1

            # Завжди додаємо лінк — щоб резюме не потрапляло в чергу знову
            batch_ids.add(resume_id)
            processed += 1

        # Зберігаємо якщо накопичилось достатньо
        if len(batch_mappings) >= SAVE_EVERY or (len(batch_ids) >= CHUNK and not batch_mappings):
            ins = flush_batch(batch_mappings, batch_ids)
            total_inserted += ins
            elapsed = time.time() - t0
            print(f"[progress] processed={processed}/{total_unmapped} mapped={total_mapped} "
                  f"inserted={total_inserted} time={elapsed:.0f}s", flush=True)
            batch_mappings = []
            batch_ids = set()

    # Залишок
    if batch_mappings or batch_ids:
        ins = flush_batch(batch_mappings, batch_ids)
        total_inserted += ins

    elapsed = time.time() - t0
    print(f"[done] processed={processed} mapped={total_mapped} inserted={total_inserted} time={elapsed:.0f}s")

    # Фінальна перевірка
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM resumes r
            WHERE NOT EXISTS (
                SELECT 1 FROM resume_mapping_links l WHERE l.resume_id = r.id
            )
        """)
        remaining = cur.fetchone()[0]
    print(f"[check] resumes still without mapping links: {remaining}")
    conn.close()


if __name__ == "__main__":
    main()
