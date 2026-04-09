/**
 * Резолвить vacancy_id → mapping_document_id через vacancy_mapping_links.
 * Якщо прямого зв'язку немає — шукає по metadata->>'title' в vac_skill_mappings
 * і зберігає знайдений зв'язок для майбутніх запитів.
 */
export async function resolveVacancyMappingDocumentId(client, vacancyId) {
    const normalizedVacancyId = String(vacancyId);

    const { rows: linkRows } = await client.query(
        `SELECT mapping_document_id
         FROM vacancy_mapping_links
         WHERE vacancy_id=$1
             LIMIT 1`,
        [normalizedVacancyId]
    );

    if (linkRows.length > 0) {
        return String(linkRows[0].mapping_document_id);
    }

    const { rows: vacancyRows } = await client.query(
        `SELECT id, title
         FROM vacancies
         WHERE id=$1
             LIMIT 1`,
        [normalizedVacancyId]
    );

    const vacancy = vacancyRows[0];
    const vacancyTitle = vacancy?.title ? String(vacancy.title).trim() : null;

    if (!vacancyTitle) {
        return null;
    }

    const exactRows = await client.query(
        `SELECT document_id
         FROM vac_skill_mappings
         WHERE metadata->>'title' = $1
         GROUP BY document_id
         ORDER BY COUNT(*) DESC
             LIMIT 1`,
        [vacancyTitle]
    );

    if (exactRows.rows.length > 0) {
        const documentId = String(exactRows.rows[0].document_id);
        await client.query(
            `INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
             VALUES ($1, $2)
                 ON CONFLICT (vacancy_id) DO NOTHING`,
            [normalizedVacancyId, documentId]
        );
        return documentId;
    }

    const normalizedRows = await client.query(
        `SELECT document_id
         FROM vac_skill_mappings
         WHERE lower(regexp_replace(trim(metadata->>'title'), '\\s+', ' ', 'g')) =
               lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
         GROUP BY document_id
         ORDER BY COUNT(*) DESC
             LIMIT 1`,
        [vacancyTitle]
    );

    if (normalizedRows.rows.length > 0) {
        const documentId = String(normalizedRows.rows[0].document_id);
        await client.query(
            `INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
             VALUES ($1, $2)
                 ON CONFLICT (vacancy_id) DO NOTHING`,
            [normalizedVacancyId, documentId]
        );
        return documentId;
    }

    const looseRows = await client.query(
        `SELECT document_id, COUNT(*) AS cnt
         FROM vac_skill_mappings
         WHERE lower(metadata->>'title') LIKE '%' || lower($1) || '%'
            OR lower($1) LIKE '%' || lower(metadata->>'title') || '%'
         GROUP BY document_id
         ORDER BY cnt DESC
             LIMIT 1`,
        [vacancyTitle]
    );

    if (looseRows.rows.length > 0) {
        const documentId = String(looseRows.rows[0].document_id);
        await client.query(
            `INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
             VALUES ($1, $2)
                 ON CONFLICT (vacancy_id) DO NOTHING`,
            [normalizedVacancyId, documentId]
        );
        return documentId;
    }

    return null;
}
