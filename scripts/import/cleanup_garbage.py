import psycopg2

conn = psycopg2.connect('postgres://diploma:diploma@localhost:5432/diploma_db')
cur = conn.cursor()

# Видалити SPARK
cur.execute("DELETE FROM cv_skill_mappings WHERE esco_label = 'SPARK'")
print('SPARK видалено з резюме:', cur.rowcount)

cur.execute("DELETE FROM vac_skill_mappings WHERE esco_label = 'SPARK'")
print('SPARK видалено з вакансій:', cur.rowcount)

# Видалити markdown-сміття (raw_skill починається з ** або \-)
cur.execute(r"DELETE FROM cv_skill_mappings WHERE raw_skill LIKE '\*\*%' OR raw_skill LIKE '\-%'")
print('Markdown ** та \- видалено:', cur.rowcount)

# Видалити soft skills що дають абсурдні маппінги через embedding
soft = [
    'Чесність', 'Порядність', 'Неконфліктність', 'Організованість',
    'Відповідальність', 'Комунікабельність', 'Стресостійкість', 'Пунктуальність',
    'Ініціативність', 'Цілеспрямованість', 'Відповідальність', 'Уважність',
    'Дисциплінованість', 'Старанність', 'Наполегливість',
]
cur.execute(
    'DELETE FROM cv_skill_mappings WHERE raw_skill = ANY(%s) AND method = %s',
    (soft, 'embedding_search')
)
print('Soft skills (embedding) видалено:', cur.rowcount)

conn.commit()
cur.close()
conn.close()
print('Готово')
