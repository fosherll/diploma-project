/**
 * Vacancy Recommendations for a Resume:
 * Finds vacancies whose skill embeddings are most similar
 * to the resume's skill embeddings using pgvector cosine similarity.
 */
export async function recommendVacanciesForResume(client, resumeId, limit = 5) {
    // Get average embedding for resume's skills
    const { rows: avgRows } = await client.query(`
        SELECT AVG(m.embedding) AS avg_embedding
        FROM cv_skill_mappings m
        JOIN resume_mapping_links l ON l.mapping_document_id = m.document_id
        WHERE l.resume_id = $1 AND m.embedding IS NOT NULL
    `, [String(resumeId)]);

    if (!avgRows[0]?.avg_embedding) {
        return { available: false, reason: "This resume has no ESCO skill embeddings" };
    }

    const resumeVec = avgRows[0].avg_embedding;

    // Find vacancies with most similar average skill embedding
    const { rows: recommendations } = await client.query(`
        WITH vac_avg AS (
            SELECT
                l.vacancy_id,
                AVG(m.embedding) AS avg_embedding
            FROM vac_skill_mappings m
            JOIN vacancy_mapping_links l ON l.mapping_document_id = m.document_id
            WHERE m.embedding IS NOT NULL
            GROUP BY l.vacancy_id
        )
        SELECT
            va.vacancy_id,
            v.title,
            v.location,
            v.employment_type,
            1 - (va.avg_embedding <=> $1::vector) AS similarity
        FROM vac_avg va
        JOIN vacancies v ON v.id = va.vacancy_id
        ORDER BY va.avg_embedding <=> $1::vector
        LIMIT $2
    `, [resumeVec, limit]);

    return {
        available: true,
        resume_id: resumeId,
        recommendations: recommendations.map(r => ({
            vacancy_id: r.vacancy_id,
            title: r.title || "—",
            location: r.location || "—",
            employment_type: r.employment_type || "—",
            similarity: Math.round(Number(r.similarity) * 1000) / 1000
        }))
    };
}
