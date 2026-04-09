import psycopg2

conn = psycopg2.connect('postgres://diploma:diploma@localhost:5432/diploma_db')
cur = conn.cursor()

# Видалити всі рядки де raw_skill містить \ (backslash) - залишки markdown екранування
cur.execute(r"DELETE FROM cv_skill_mappings WHERE raw_skill LIKE '%\%'")
print('Backslash в raw_skill видалено (cv):', cur.rowcount)

cur.execute(r"DELETE FROM vac_skill_mappings WHERE raw_skill LIKE '%\%'")
print('Backslash в raw_skill видалено (vac):', cur.rowcount)

# Також видалити де raw_skill містить ** де б воно не було
cur.execute("DELETE FROM cv_skill_mappings WHERE raw_skill LIKE '%**%'")
print('** в raw_skill видалено (cv):', cur.rowcount)

cur.execute("DELETE FROM vac_skill_mappings WHERE raw_skill LIKE '%**%'")
print('** в raw_skill видалено (vac):', cur.rowcount)

conn.commit()
cur.close()
conn.close()
print('Готово')
