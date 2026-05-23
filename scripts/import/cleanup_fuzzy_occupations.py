"""Видаляє посади та сміття з fuzzy/fuzzy_title маппінгів резюме."""
import psycopg2

conn = psycopg2.connect("postgres://diploma:diploma@localhost:5432/diploma_db")
cur = conn.cursor()

cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE method IN ('fuzzy', 'fuzzy_title')
    AND (
        raw_skill ~* '^(електрик|логіст|медична сестра|менеджер|директор|касир|
            охоронець|кухар|водій|бухгалтер|юрист|лікар|інженер|програміст|
            дизайнер|аналітик|рекрутер|секретар|бухгалтер|економіст|
            адміністратор|оператор|монтажник|зварник|слюсар|електромонтер|
            охоронник|офіціант|перукар|косметолог|нянька|архіваріус|
            логіст|диспетчер|художник|сценарист|контролер|фасувальник|
            вантажник|прибиральни|кур.?єр|педагог|інкасатор|промоутер|
            перекладач|маляр|штукатур|обліковець|обвалювальник|експедитор|
            фармацевт|стоматолог|хірург|терапевт|психолог|актор|журналіст)'
    )
    RETURNING id
""")
print(f"Видалено occupation з fuzzy: {cur.rowcount}")

cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE method IN ('fuzzy', 'fuzzy_title')
    AND (
        length(trim(raw_skill)) <= 3
        OR raw_skill ~ '^[[:space:]]*$'
    )
    RETURNING id
""")
print(f"Видалено порожніх/коротких: {cur.rowcount}")

conn.commit()
conn.close()
print("Готово.")
