/**
 * Резолвить vacancy_id → mapping_document_id через vacancy_mapping_links.
 * Якщо прямого зв'язку немає — шукає по metadata->>'title' в vac_skill_mappings
 * (точний збіг → нормалізований → частковий) і зберігає знайдений зв'язок.
 *
 * Кеш в пам'яті (без TTL): коректний поки маппінги змінюються лише через
 * скрипти імпорту. При необхідності інвалідації — перезапустіть процес.
 */

/** @type {Map<string, string|null>} */
const _vacancyMappingCache = new Map();

/**
 * Зберігає зв'язок vacancy→document у БД і кеші, повертає documentId.
 * @param {import("pg").PoolClient} client
 * @param {string} vacancyId
 * @param {string} documentId
 */
async function saveAndCache(client, vacancyId, documentId) {
    await client.query(
        `INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
         VALUES ($1, $2)
         ON CONFLICT (vacancy_id) DO NOTHING`,
        [vacancyId, documentId]
    );
    _vacancyMappingCache.set(vacancyId, documentId);
    return documentId;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string|number} vacancyId
 * @returns {Promise<string|null>}
 */
export async function resolveVacancyMappingDocumentId(client, vacancyId) {
    const key = String(vacancyId);

    if (_vacancyMappingCache.has(key)) {
        return _vacancyMappingCache.get(key);
    }

    // 1. Прямий зв'язок у vacancy_mapping_links
    const { rows: linkRows } = await client.query(
        `SELECT mapping_document_id FROM vacancy_mapping_links WHERE vacancy_id=$1 LIMIT 1`,
        [key]
    );
    if (linkRows.length > 0) {
        const result = String(linkRows[0].mapping_document_id);
        _vacancyMappingCache.set(key, result);
        return result;
    }

    // 2. Дістаємо заголовок вакансії
    const { rows: vacancyRows } = await client.query(
        `SELECT title FROM vacancies WHERE id=$1 LIMIT 1`,
        [key]
    );
    const vacancyTitle = vacancyRows[0]?.title ? String(vacancyRows[0].title).trim() : null;
    if (!vacancyTitle) {
        _vacancyMappingCache.set(key, null);
        return null;
    }

    // 3. Точний збіг по title
    const { rows: exactRows } = await client.query(
        `SELECT document_id FROM vac_skill_mappings
         WHERE metadata->>'title' = $1
         GROUP BY document_id ORDER BY COUNT(*) DESC LIMIT 1`,
        [vacancyTitle]
    );
    if (exactRows.length > 0) return saveAndCache(client, key, String(exactRows[0].document_id));

    // 4. Нормалізований збіг (пробіли, регістр)
    const { rows: normRows } = await client.query(
        `SELECT document_id FROM vac_skill_mappings
         WHERE lower(regexp_replace(trim(metadata->>'title'), '\\s+', ' ', 'g'))
             = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
         GROUP BY document_id ORDER BY COUNT(*) DESC LIMIT 1`,
        [vacancyTitle]
    );
    if (normRows.length > 0) return saveAndCache(client, key, String(normRows[0].document_id));

    // 5. Частковий збіг (LIKE)
    const { rows: looseRows } = await client.query(
        `SELECT document_id FROM vac_skill_mappings
         WHERE lower(metadata->>'title') LIKE '%' || lower($1) || '%'
            OR lower($1) LIKE '%' || lower(metadata->>'title') || '%'
         GROUP BY document_id ORDER BY COUNT(*) DESC LIMIT 1`,
        [vacancyTitle]
    );
    if (looseRows.length > 0) return saveAndCache(client, key, String(looseRows[0].document_id));

    _vacancyMappingCache.set(key, null);
    return null;
}

/** Очищає кеш (для тестів). */
export function clearVacancyMappingCache() {
    _vacancyMappingCache.clear();
}
