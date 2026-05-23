"""
Gold Standard оцінка через OpenAI GPT (найточніший суддя для ESCO).

Модель: gpt-4o-mini (найкраще співвідношення ціна/якість)
Ціна:   ~$0.01-0.03 за 40 маппінгів (практично безкоштовно)

Run:
    pip install openai
    set OPENAI_API_KEY=sk-...
    python -X utf8 evaluate_gold_gpt.py
    python -X utf8 evaluate_gold_gpt.py --sample 50 --source cv
    python -X utf8 evaluate_gold_gpt.py --min-conf 0.62 --model gpt-4o
"""

import argparse
import json
import os
import sys
import time
import psycopg2
import psycopg2.extras

# Автоматично завантажуємо .env файл якщо є
def _load_dotenv():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key   = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value

_load_dotenv()

DATABASE_URL  = "postgres://diploma:diploma@localhost:5432/diploma_db"
DEFAULT_MODEL = "gpt-4o-mini"   # дешево і точно; або "gpt-4o" для максимуму
SLEEP_BETWEEN = 0.3             # сек між запитами


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def fetch_sample(conn, source, sample_size, min_conf):
    rows = []
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

        if source in ("cv", "both"):
            limit = sample_size // 2 if source == "both" else sample_size
            cur.execute("""
                SELECT 'cv' AS source, r.title AS doc_title,
                       m.raw_skill, m.esco_label, m.confidence, m.method
                FROM resumes r
                JOIN resume_mapping_links l ON l.resume_id = r.id
                JOIN cv_skill_mappings m    ON m.document_id = l.mapping_document_id
                WHERE m.confidence >= %s
                  AND m.esco_label IS NOT NULL AND m.raw_skill IS NOT NULL
                  AND length(m.raw_skill) > 1  AND length(m.esco_label) > 1
                  AND m.method NOT IN ('esco_occupation_essential', 'esco_occupation_optional')
                ORDER BY RANDOM() LIMIT %s
            """, (min_conf, limit))
            rows += cur.fetchall()

        if source in ("vac", "both"):
            limit = sample_size // 2 if source == "both" else sample_size
            cur.execute("""
                SELECT 'vac' AS source, v.title AS doc_title,
                       m.raw_skill, m.esco_label, m.confidence, m.method
                FROM vacancies v
                JOIN vacancy_mapping_links l ON l.vacancy_id = v.id
                JOIN vac_skill_mappings m    ON m.document_id = l.mapping_document_id
                WHERE m.confidence >= %s
                  AND m.esco_label IS NOT NULL AND m.raw_skill IS NOT NULL
                  AND length(m.raw_skill) > 1  AND length(m.esco_label) > 1
                  AND m.method NOT IN ('esco_occupation_essential', 'esco_occupation_optional')
                ORDER BY RANDOM() LIMIT %s
            """, (min_conf, limit))
            rows += cur.fetchall()

    return [dict(r) for r in rows]


SYSTEM_PROMPT = """Ти — експерт з ESCO (European Skills, Competences, Qualifications and Occupations).
Твоя задача: оцінити чи маппінг навички в ESCO категорію є правильним.

Правила:
- "correct": true  — якщо raw_skill є прикладом, синонімом або підвидом esco_label
- "correct": false — якщо це назва посади (а не навичка), або немає логічного зв'язку

Приклади правильних маппінгів:
  "Excel"             → "використовувати електронні таблиці"  ✓
  "Python"            → "програмування"                       ✓
  "водіння авто"      → "керувати транспортними засобами"     ✓
  "customer service"  → "обслуговувати клієнтів"              ✓
  "AutoCAD"           → "використовувати САПР"                ✓

Приклади неправильних:
  "Водій"             → "мити автомобілі"          ✗ (посада, не та навичка)
  "Бухгалтер"         → "столярство"               ✗ (немає зв'язку)
  "Менеджер"          → "управляти запасами"        ✗ (посада надто загальна)
  "------------"      → "іврит"                    ✗ (шум)

Відповідай ВИКЛЮЧНО у форматі JSON:
{"correct": true/false, "reason": "коротке пояснення одним реченням"}"""


def annotate_gpt(api_key: str, rows: list, model: str) -> list:
    try:
        from openai import OpenAI
    except ImportError:
        print("[error] Встанови: pip install openai")
        sys.exit(1)

    client  = OpenAI(api_key=api_key)
    results = []
    errors  = 0
    total_tokens = 0

    print(f"  Перевіряю {len(rows)} маппінгів через {model}...")
    print(f"  Очікувана ціна: ~${len(rows) * 0.0003:.3f} (gpt-4o-mini)\n")

    for i, row in enumerate(rows, 1):
        raw  = row["raw_skill"]
        esco = row["esco_label"]

        user_msg = f'raw_skill: "{raw}"\nesco_label: "{esco}"'

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg},
                ],
                temperature=0.0,
                max_tokens=80,
                response_format={"type": "json_object"},  # гарантує JSON відповідь
            )
            text   = response.choices[0].message.content.strip()
            parsed = json.loads(text)
            correct = bool(parsed.get("correct", False))
            reason  = str(parsed.get("reason", ""))
            total_tokens += response.usage.total_tokens

        except json.JSONDecodeError:
            correct = None
            reason  = f"JSON parse error: {text[:60]}"
            errors += 1
        except Exception as e:
            correct = None
            reason  = str(e)[:80]
            errors += 1
            time.sleep(5)

        results.append({
            **row,
            "llm_correct":  correct,
            "llm_reason":   reason,
            "entail_score": 1.0 if correct else 0.0,
        })

        if i % 10 == 0:
            cost_usd = total_tokens * 0.00000015  # gpt-4o-mini: $0.15/1M tokens
            print(f"    [{i}/{len(rows)}] оброблено | токени: {total_tokens} | ~${cost_usd:.4f}")

        time.sleep(SLEEP_BETWEEN)

    print(f"\n  Всього токенів: {total_tokens} | Вартість: ~${total_tokens * 0.00000015:.4f}")
    if errors:
        print(f"  Помилок: {errors}")

    return results


def print_results(results, min_conf, model):
    valid     = [r for r in results if r["llm_correct"] is not None]
    correct   = [r for r in valid if r["llm_correct"]]
    incorrect = [r for r in valid if not r["llm_correct"]]
    precision = len(correct) / len(valid) * 100 if valid else 0

    print()
    print("=" * 65)
    print(f"  РЕЗУЛЬТАТИ (суддя: {model})")
    print("=" * 65)
    print(f"\n  Всього перевірено  : {len(valid)}")
    print(f"  Правильних         : {len(correct)}")
    print(f"  Неправильних       : {len(incorrect)}")
    print(f"\n  * PRECISION        : {precision:.1f}%")

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

    # Неправильні з поясненням GPT
    if incorrect:
        print(f"\n  НЕПРАВИЛЬНІ маппінги:")
        print(f"  {'Raw skill':<25} {'ESCO label':<30} {'Conf':>6}  GPT пояснення")
        print("  " + "-" * 95)
        for r in incorrect[:20]:
            raw    = (r["raw_skill"]  or "")[:23]
            esco   = (r["esco_label"] or "")[:28]
            conf   = float(r["confidence"] or 0)
            reason = (r["llm_reason"] or "")[:38]
            print(f"  {raw:<25} {esco:<30} {conf:>6.3f}  {reason}")

    # Правильні
    if correct:
        print(f"\n  ПРАВИЛЬНІ маппінги (перші 10):")
        print(f"  {'Raw skill':<25} {'ESCO label':<30} {'Conf':>6}  GPT пояснення")
        print("  " + "-" * 95)
        for r in correct[:10]:
            raw    = (r["raw_skill"]  or "")[:23]
            esco   = (r["esco_label"] or "")[:28]
            conf   = float(r["confidence"] or 0)
            reason = (r["llm_reason"] or "")[:38]
            print(f"  {raw:<25} {esco:<30} {conf:>6.3f}  {reason}")

    # Зберігаємо
    out = "gold_standard_gpt_results.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)

    print(f"""
  -----------------------------------------------------------
  Висновок:
  При confidence >= {min_conf} система досягає точності {precision:.1f}%
  (перевірено GPT LLM на {len(valid)} маппінгах)

  Модель суддя : {model}
  Файл         : {out}
  -----------------------------------------------------------
""")


def main():
    parser = argparse.ArgumentParser(description="Gold Standard через GPT")
    parser.add_argument("--sample",   type=int,   default=50)
    parser.add_argument("--source",   choices=["cv", "vac", "both"], default="both")
    parser.add_argument("--min-conf", type=float, default=0.75)
    parser.add_argument("--model",    type=str,   default=DEFAULT_MODEL,
                        help="gpt-4o-mini (дешево) або gpt-4o (точніше)")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("[error] Потрібен OPENAI_API_KEY")
        print()
        print("  Як отримати:")
        print("  1. Зайди на https://platform.openai.com/api-keys")
        print("  2. Create new secret key")
        print("  3. set OPENAI_API_KEY=sk-proj-...")
        print()
        print("  Ціна за запуск (~50 маппінгів на gpt-4o-mini): < $0.01")
        sys.exit(1)

    print("=" * 65)
    print("  GOLD STANDARD — GPT LLM суддя")
    print("=" * 65)
    print(f"  Вибірка    : {args.sample}")
    print(f"  Джерело    : {args.source}")
    print(f"  Min conf   : {args.min_conf}")
    print(f"  Модель     : {args.model}")
    print()

    conn = get_conn()
    try:
        rows = fetch_sample(conn, args.source, args.sample, args.min_conf)
    finally:
        conn.close()

    if not rows:
        print("[error] Немає маппінгів у БД")
        sys.exit(1)

    print(f"  Завантажено з БД: {len(rows)} маппінгів\n")
    results = annotate_gpt(api_key, rows, args.model)
    print_results(results, args.min_conf, args.model)


if __name__ == "__main__":
    main()
