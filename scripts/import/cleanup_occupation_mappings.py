"""
Очищення БД від некоректних маппінгів, де raw_skill є назвою посади (occupation),
а не конкретною навичкою.

Також видаляє маппінги з низькою confidence (нижче нового порогу 0.70).

Run:
    python cleanup_occupation_mappings.py
    python cleanup_occupation_mappings.py --dry-run
    python cleanup_occupation_mappings.py --min-conf 0.70
"""

import argparse
import re
import psycopg2

# ESCO мітки що явно не мають сенсу для HR контексту
_BAD_ESCO_LABELS = re.compile(
    r"(добрив|гальван|розкидати|вносити добр|підживлен|компост|ґрунт|"
    r"епіграфіка|транскреація|ідиш|біжутерія|vyper|staf\b|педіатрія|"
    r"столярство|іврит|нашіптуванням|шушу|термінологія|"
    r"іригаційн|постредагування|grovo|інтубац|"
    r"стоматологічні хвороби|законодавство про авторське|"
    r"зважувати вантаж|спільне використання автомоб|"
    r"труднощі у навчанн|концесія на надання|"
    r"змінювати етикетки|бути напоготові)",
    re.IGNORECASE | re.UNICODE
)

DATABASE_URL = "postgres://diploma:diploma@localhost:5432/diploma_db"

# Маркери назв посад — такі raw_skill не є навичками
_OCCUPATION_WORDS = re.compile(
    r"^(менеджер|директор|спеціаліст|керівник|начальник|завідувач|завідуючий|"
    r"головний|старший|молодший|помічник|асистент|провідний|оператор|адміністратор|"
    r"інспектор|інженер|технік|робітник|різноробочий|підсобний|прибиральни|"
    r"кур.?єр|кур.?ер|водій|водитель|касир|продавець|бухгалтер|економіст|юрист|"
    r"лікар|медсестр|медбрат|медична сестра|медичний брат|вчитель|викладач|педагог|"
    r"монтажник|слюсар|зварник|токар|фрезерувальник|електрик|електромонтер|"
    r"охоронник|охоронець|охорона|охранник|"
    r"кухар|офіціант|официант|бариста|флорист|перукар|косметолог|масажист|нянька|"
    r"секретар|діловод|архіваріус|логіст|диспетчер|аналітик|програміст|"
    r"дизайнер|маркетолог|рекрутер|тренер|редактор|художник|сценарист|"
    r"контролер|командир|комірник|фасувальник|пакувальник|складальник|"
    r"заступник|представник|виконавець|консультант|координатор|супервайзер|"
    r"інкасатор|промоутер|перекладач|переводчик|перевізник|"
    r"маляр|штукатур|плиточник|плотник|тесля|сантехнік|зварювальник|"
    r"єгер|мисливець|рибалка|"
    r"обліковець|обвалювальник|різник|пакувальниц|"
    r"експедитор|комірник|вантажник|підйомник|"
    r"нотаріус|адвокат|прокурор|суддя|слідчий|"
    r"архітектор|геодезист|картограф|"
    r"фармацевт|провізор|стоматолог|хірург|терапевт|педіатр|психолог|"
    r"актор|режисер|журналіст|фотограф|"
    r"касир|юрисконсульт|хімік|військовослужб|"
    r"помічник|кухар|охоронець|охоронник|"
    # Русизми
    r"инженер|специалист|руководитель|заведующий|главный|помощник|"
    r"водитель|юрист|врач|учитель|охранник|официант|кассир|"
    r"продавец|аналитик|программист|маркетолог|рекрутер|переводчик|"
    r"педагог|инкассатор|промоутер|экспедитор|кладовщик|грузчик|"
    r"штукатур|маляр|плотник|сварщик|электрик|слесарь|токарь|"
    r"бухгалтер|экономист|юрист|нотариус|адвокат|"
    # Англійські
    r"coordinator|manager|engineer|specialist|director|officer|supervisor|"
    r"assistant|developer|designer|analyst|recruiter|controller|commander|"
    r"consultant|representative|inspector|translator|interpreter|"
    r"teacher|doctor|nurse|driver|accountant|lawyer|architect)",
    re.IGNORECASE | re.UNICODE
)

_OCCUPATION_ADJECTIVES = re.compile(
    r"^(фінансовий|технічний|головний|старший|молодший|провідний|генеральний|"
    r"виконавчий|комерційний|операційний|регіональний|національний|"
    r"финансовый|технический|главный|старший|коммерческий|операционный)",
    re.IGNORECASE | re.UNICODE
)


def is_occupation_skill(raw_skill: str) -> bool:
    """Повертає True якщо raw_skill схожий на назву посади."""
    t = raw_skill.strip()
    # Також відловлюємо "** Слово" (форматування)
    clean = re.sub(r"^\*+\s*", "", t)
    words = clean.split()
    if not words:
        return False

    first = words[0]
    first_stem = re.split(r"[-–]", first)[0]

    # До 5 слів з маркером посади (враховуємо дефісні: "Водій-експедитор")
    if len(words) <= 5 and (_OCCUPATION_WORDS.match(first) or _OCCUPATION_WORDS.match(first_stem)):
        return True

    # Pattern "прикметник + посада": "Фінансовий аналітик"
    if len(words) == 2 and _OCCUPATION_ADJECTIVES.match(words[0]) and _OCCUPATION_WORDS.match(words[1]):
        return True

    return False


_NOISE_RAW_SKILL = re.compile(
    r"(^responsibilities\s*:|^duties\s*:|^skills\s*:|^requirements\s*:|"  # заголовки секцій
    r"^\w+\.$|"                          # одне слово з крапкою: "Allure.", "тренінгів.", "системами."
    r"^[a-zа-яіїєґ]{1,4}\.$|"          # дуже короткий з крапкою: "СЕВ."
    r"^\w+:$)",                          # слово з двокрапкою: "Turkish:"
    re.IGNORECASE | re.UNICODE
)


def is_noise_raw_skill(raw_skill: str) -> bool:
    """Відфільтровує явне сміття: заголовки секцій, фрагменти, одиночні слова з крапкою."""
    rs = raw_skill.strip()
    if not rs:
        return True
    # Закінчується крапкою без пробілів (обривок: "тренінгів.", "Allure.", "личный автомобиль.")
    if rs.endswith(".") and len(rs.split()) <= 4:
        return True
    # Заголовки секцій резюме
    if _NOISE_RAW_SKILL.search(rs):
        return True
    # Одне слово що є службовим: "системами", "консультант" (без контексту)
    if len(rs.split()) == 1 and len(rs) <= 10 and rs.islower():
        return True
    return False


def cleanup(dry_run: bool, min_conf: float):
    conn = psycopg2.connect(DATABASE_URL)

    # --- Вакансії ---
    print("\n=== VAC_SKILL_MAPPINGS ===")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, raw_skill, esco_label, confidence
            FROM vac_skill_mappings
            WHERE method = 'embedding_search'
        """)
        rows = cur.fetchall()

    occupation_ids = []
    low_conf_ids = []
    for row_id, raw_skill, esco_label, confidence in rows:
        rs = (raw_skill or "").strip()
        el = (esco_label or "").strip()
        is_fragment = rs.endswith(")") and "(" not in rs
        is_bad_esco = bool(_BAD_ESCO_LABELS.search(el))
        if is_fragment or is_bad_esco or is_noise_raw_skill(rs) or is_occupation_skill(rs):
            occupation_ids.append(row_id)
        elif confidence < min_conf:
            low_conf_ids.append(row_id)

    print(f"  Знайдено посад (occupation raw_skill): {len(occupation_ids)}")
    print(f"  Знайдено низька confidence (<{min_conf}):  {len(low_conf_ids)}")

    if not dry_run:
        with conn.cursor() as cur:
            if occupation_ids:
                cur.execute("DELETE FROM vac_skill_mappings WHERE id = ANY(%s)", (occupation_ids,))
                print(f"  Видалено occupation маппінгів: {cur.rowcount}")
            if low_conf_ids:
                cur.execute("DELETE FROM vac_skill_mappings WHERE id = ANY(%s)", (low_conf_ids,))
                print(f"  Видалено low-conf маппінгів:  {cur.rowcount}")
        conn.commit()

    # --- Резюме ---
    print("\n=== CV_SKILL_MAPPINGS ===")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, raw_skill, esco_label, confidence
            FROM cv_skill_mappings
            WHERE method = 'embedding_search'
        """)
        rows = cur.fetchall()

    occupation_ids_cv = []
    low_conf_ids_cv = []
    for row_id, raw_skill, esco_label, confidence in rows:
        rs = (raw_skill or "").strip()
        el = (esco_label or "").strip()
        is_fragment = rs.endswith(")") and "(" not in rs
        is_bad_esco = bool(_BAD_ESCO_LABELS.search(el))
        if is_fragment or is_bad_esco or is_noise_raw_skill(rs) or is_occupation_skill(rs):
            occupation_ids_cv.append(row_id)
        elif confidence < min_conf:
            low_conf_ids_cv.append(row_id)

    print(f"  Знайдено посад (occupation raw_skill): {len(occupation_ids_cv)}")
    print(f"  Знайдено низька confidence (<{min_conf}):  {len(low_conf_ids_cv)}")

    if not dry_run:
        with conn.cursor() as cur:
            if occupation_ids_cv:
                cur.execute("DELETE FROM cv_skill_mappings WHERE id = ANY(%s)", (occupation_ids_cv,))
                print(f"  Видалено occupation маппінгів: {cur.rowcount}")
            if low_conf_ids_cv:
                cur.execute("DELETE FROM cv_skill_mappings WHERE id = ANY(%s)", (low_conf_ids_cv,))
                print(f"  Видалено low-conf маппінгів:  {cur.rowcount}")
        conn.commit()

    conn.close()

    if dry_run:
        print("\n[dry-run] Нічого не видалено. Запустіть без --dry-run щоб застосувати.")
    else:
        print("\n[done] Очищення завершено.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Показати що буде видалено без реального видалення")
    parser.add_argument("--min-conf", type=float, default=0.70,
                        help="Мінімальний поріг confidence (default: 0.70)")
    args = parser.parse_args()

    cleanup(dry_run=args.dry_run, min_conf=args.min_conf)
