/**
 * Резолвить resume_id → mapping_document_id через resume_mapping_links.
 *
 * Кеш в пам'яті (без TTL): коректний для поточної реалізації де маппінги
 * змінюються лише через скрипти імпорту, а не під час роботи сервера.
 * При необхідності інвалідації — перезапустіть процес.
 */
const _resumeMappingCache = new Map();

/**
 * @param {import("pg").PoolClient} client
 * @param {string} resumeId
 * @returns {Promise<string|null>}
 */
export async function resolveResumeMappingDocumentId(client, resumeId) {
    const key = String(resumeId);

    if (_resumeMappingCache.has(key)) {
        return _resumeMappingCache.get(key);
    }

    const { rows } = await client.query(
        `SELECT mapping_document_id
         FROM resume_mapping_links
         WHERE resume_id = $1
         LIMIT 1`,
        [key]
    );

    const result = rows.length > 0 ? String(rows[0].mapping_document_id) : null;
    _resumeMappingCache.set(key, result);
    return result;
}

/** Очищає кеш (для тестів). */
export function clearResumeMappingCache() {
    _resumeMappingCache.clear();
}
