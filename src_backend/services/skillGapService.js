/**
 * Skill Gap Analysis:
 * Shows which skills the vacancy requires but top candidates don't cover.
 */
export async function getSkillGap(client, vacancyId, runId, topN = 20) {
    // Get vacancy skill mappings
    const { rows: vacSkills } = await client.query(`
        SELECT DISTINCT m.esco_uri, m.esco_label, m.raw_skill
        FROM vac_skill_mappings m
        JOIN vacancy_mapping_links l ON l.mapping_document_id = m.document_id
        WHERE l.vacancy_id = $1 AND m.esco_uri IS NOT NULL
    `, [String(vacancyId)]);

    if (!vacSkills.length) {
        return { available: false, reason: "No ESCO skill mappings found for this vacancy" };
    }

    // Get top candidates from latest/selected run
    let evalQuery = `
        SELECT e.resume_id
        FROM evaluations e
        WHERE e.vacancy_id = $1
    `;
    const params = [String(vacancyId)];

    if (runId) {
        evalQuery += ` AND e.run_id = $2 ORDER BY e.total_score DESC LIMIT $3`;
        params.push(String(runId), topN);
    } else {
        evalQuery += ` AND e.run_id = (
            SELECT run_id FROM evaluations WHERE vacancy_id = $1
            GROUP BY run_id ORDER BY MAX(created_at) DESC LIMIT 1
        ) ORDER BY e.total_score DESC LIMIT $2`;
        params.push(topN);
    }

    const { rows: topCandidates } = await client.query(evalQuery, params);

    if (!topCandidates.length) {
        return { available: false, reason: "No candidates found. Run scoring first." };
    }

    const resumeIds = topCandidates.map(r => r.resume_id);

    // Get all skills that top candidates have (by ESCO URI)
    const { rows: cvSkills } = await client.query(`
        SELECT DISTINCT m.esco_uri, l.resume_id
        FROM cv_skill_mappings m
        JOIN resume_mapping_links l ON l.mapping_document_id = m.document_id
        WHERE l.resume_id = ANY($1) AND m.esco_uri IS NOT NULL
    `, [resumeIds]);

    // Build map: esco_uri -> set of resume_ids that have it
    const coverageMap = {};
    for (const row of cvSkills) {
        if (!coverageMap[row.esco_uri]) coverageMap[row.esco_uri] = new Set();
        coverageMap[row.esco_uri].add(row.resume_id);
    }

    const total = resumeIds.length;

    // Analyze each vacancy skill
    const skills = vacSkills.map(vs => {
        const covered = coverageMap[vs.esco_uri] ? coverageMap[vs.esco_uri].size : 0;
        return {
            esco_uri: vs.esco_uri,
            esco_label: vs.esco_label,
            raw_skill: vs.raw_skill,
            covered_by: covered,
            total_candidates: total,
            coverage_pct: Math.round((covered / total) * 100)
        };
    }).sort((a, b) => a.coverage_pct - b.coverage_pct);

    const missing = skills.filter(s => s.coverage_pct === 0);
    const partial = skills.filter(s => s.coverage_pct > 0 && s.coverage_pct < 50);
    const covered = skills.filter(s => s.coverage_pct >= 50);

    return {
        available: true,
        total_candidates: total,
        total_skills: skills.length,
        missing,
        partial,
        covered,
        skills
    };
}
