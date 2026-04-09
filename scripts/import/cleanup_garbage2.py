import psycopg2

conn = psycopg2.connect('postgres://diploma:diploma@localhost:5432/diploma_db')
cur = conn.cursor()

# 1. "кадрове управління" — залишати тільки якщо conf >= 0.85
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'кадрове управління'
      AND confidence < 0.85
""")
print('кадрове управління (низька якість) видалено:', cur.rowcount)

# 2. "столярство" у резюме — залишати тільки якщо raw_skill явно пов'язаний з деревообробкою
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'столярство'
      AND raw_skill NOT ILIKE '%столяр%'
      AND raw_skill NOT ILIKE '%дерево%'
      AND raw_skill NOT ILIKE '%меблі%'
      AND raw_skill NOT ILIKE '%тесл%'
""")
print('столярство (невалідні) видалено:', cur.rowcount)

# 3. "ремісництво" — дуже загальний термін, видалити все з низькою впевненістю
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'ремісництво'
      AND confidence < 0.90
""")
print('ремісництво (низька якість) видалено:', cur.rowcount)

# 4. "педіатрія" — залишати тільки медичні резюме
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'педіатрія'
      AND raw_skill NOT ILIKE '%педіатр%'
      AND raw_skill NOT ILIKE '%дитяч%'
      AND raw_skill NOT ILIKE '%лікар%'
      AND raw_skill NOT ILIKE '%медик%'
""")
print('педіатрія (невалідні) видалено:', cur.rowcount)

# 5. "геріатрія" — залишати тільки медичні
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'геріатрія'
      AND raw_skill NOT ILIKE '%геріатр%'
      AND raw_skill NOT ILIKE '%літн%'
      AND raw_skill NOT ILIKE '%медик%'
""")
print('геріатрія (невалідні) видалено:', cur.rowcount)

# 6. "вносити добрива" — явно не навичка для більшості резюме
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label = 'вносити добрива'
      AND raw_skill NOT ILIKE '%добрив%'
      AND raw_skill NOT ILIKE '%агроном%'
      AND raw_skill NOT ILIKE '%земле%'
""")
print('вносити добрива (невалідні) видалено:', cur.rowcount)

# 7. "клепальна машина", "склоформувальні машини" та подібне вузькопромислове
cur.execute("""
    DELETE FROM cv_skill_mappings
    WHERE esco_label IN (
        'обслуговувати клепальну машину',
        'обслуговувати склоформувальні машини',
        'обслуговувати трастові операції',
        'керувати дорожніми катками',
        'порушення рівноваги'
    )
""")
print('Вузькопромислові абсурдні маппінги видалено:', cur.rowcount)

conn.commit()

# Підсумок
cur.execute("SELECT COUNT(*) FROM cv_skill_mappings")
total_cv = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM vac_skill_mappings")
total_vac = cur.fetchone()[0]
print(f'\nПісля очищення:')
print(f'  cv_skill_mappings:  {total_cv}')
print(f'  vac_skill_mappings: {total_vac}')

cur.close()
conn.close()
print('Готово')
