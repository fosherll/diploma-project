import { withClient } from "../db.js";
import { badRequest, notFound } from "../utils/httpErrors.js";


/**
 * @typedef {Object} EnrichedRequiredMeta
 * @property {number} required_total
 * @property {number} required_passed
 * @property {number} required_pass_rate
 * @property {boolean} passed_all_required
 * @property {number} required_penalty
 * @property {Array<{name: string, calc_type: string}>} failed_required_criteria
 * @property {boolean} excluded_by_required
 */

/**
 * @typedef {Object} SkillsPreviewResponse
 * @property {string|number} vacancy_id
 * @property {string|number} resume_id
 * @property {boolean} available
 * @property {string} [reason]
 * @property {string|null} [resume_mapping_document_id]
 * @property {string|null} [vacancy_mapping_document_id]
 * @property {Array<Object>} [matched]
 * @property {Array<Object>} [missing]
 * @property {string} [source]
 */
function toBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
    }

    return Boolean(value);
}

function round4(value) {
    return Math.round(Number(value) * 10000) / 10000;
}
/**
 * @param {Object|null|undefined} meta
 * @returns {EnrichedRequiredMeta & Object}
 */
function enrichRequiredMeta(meta, detailRows) {
    const baseMeta =
        meta && typeof meta === "object" && !Array.isArray(meta) ? { ...meta } : {};

    const requiredRows = (detailRows || []).filter((row) =>
        toBoolean(row?.details?.is_required)
    );

    if (requiredRows.length === 0) {
        const requiredTotal = Number(baseMeta.required_total ?? 0);
        const requiredPassed = Number(baseMeta.required_passed ?? 0);
        const requiredPenalty = Number(baseMeta.required_penalty ?? 0);
        const passedAllRequired =
            baseMeta.passed_all_required !== undefined
                ? toBoolean(baseMeta.passed_all_required)
                : requiredTotal > 0
                    ? requiredPassed >= requiredTotal
                    : false;

        return {
            ...baseMeta,
            required_total: requiredTotal,
            required_passed: requiredPassed,
            required_pass_rate:
                baseMeta.required_pass_rate !== undefined
                    ? Number(baseMeta.required_pass_rate)
                    : requiredTotal > 0
                        ? round4(requiredPassed / requiredTotal)
                        : 1,
            passed_all_required: passedAllRequired,
            required_penalty: requiredPenalty,
            failed_required_criteria: Array.isArray(baseMeta.failed_required_criteria)
                ? baseMeta.failed_required_criteria
                : []
        };
    }

    const failedRequiredCriteria = requiredRows
        .filter((row) => Number(row.raw_score ?? 0) <= 0)
        .map((row) => ({
            name: row.name,
            calc_type: row.calc_type
        }));

    const requiredTotal = requiredRows.length;
    const requiredPassed = requiredTotal - failedRequiredCriteria.length;
    const passedAllRequired = failedRequiredCriteria.length === 0;
    const requiredPenalty =
        baseMeta.required_penalty !== undefined
            ? Number(baseMeta.required_penalty)
            : SCORING_RULES.excludedCandidateScore;


    return {
        ...baseMeta,
        required_total: requiredTotal,
        required_passed: requiredPassed,
        required_pass_rate: requiredTotal > 0 ? round4(requiredPassed / requiredTotal) : 1,
        passed_all_required: passedAllRequired,
        required_penalty: requiredPenalty,
        failed_required_criteria: failedRequiredCriteria
    };
}

async function resolveVacancyMappingDocumentId(client, vacancyId) {
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
         WHERE lower(regexp_replace(trim(metadata->>'title'), '\s+', ' ', 'g')) =
               lower(regexp_replace(trim($1), '\s+', ' ', 'g'))
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

export default async function resultsRoutes(app) {
    app.get("/:vacancyId/runs", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;

        return await withClient(async (client) => {
            const { rows } = await client.query(
                `SELECT run_id,
                        COUNT(*) AS cnt,
                        MIN(created_at) AS started_at,
                        MAX(created_at) AS finished_at
                 FROM evaluations
                 WHERE vacancy_id=$1
                 GROUP BY run_id
                 ORDER BY started_at DESC`,
                [String(vacancyId)]
            );

            return rows;
        });
    });

    app.get("/:vacancyId/results", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                required: ["run_id"],
                properties: {
                    run_id: { type: "string", minLength: 1 },
                    limit: { type: "integer", minimum: 1, maximum: 500, default: 50 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;
        const { run_id: runId, limit = 50 } = req.query;

        return await withClient(async (client) => {
            const { rows } = await client.query(
                `SELECT e.resume_id,
                        r.candidate_name,
                        r.city,
                        e.total_score,
                        r.creation_date
                 FROM evaluations e
                          JOIN resumes r ON r.id = e.resume_id
                 WHERE e.vacancy_id=$1
                   AND e.run_id=$2
                   AND COALESCE((e.meta->>'excluded_by_required')::boolean, false) = false
                 ORDER BY
                     e.total_score DESC,
                     r.creation_date DESC NULLS LAST
                     LIMIT $3`,
                [String(vacancyId), String(runId), limit]
            );

            return rows;
        });
    });

    app.get("/:vacancyId/results/:resumeId", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId", "resumeId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 },
                    resumeId: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                required: ["run_id"],
                properties: {
                    run_id: { type: "string", minLength: 1 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId, resumeId } = req.params;
        const runId = req.query.run_id;

        return reply.code(404).send({ error: "evaluation not found" });

        return await withClient(async (client) => {
            const { rows: evaluationRows } = await client.query(
                `SELECT e.id, e.resume_id, e.run_id, e.total_score, e.meta
                 FROM evaluations e
                 WHERE e.vacancy_id=$1
                   AND e.run_id=$2
                   AND e.resume_id=$3
                     LIMIT 1`,
                [String(vacancyId), String(runId), String(resumeId)]
            );

            if (evaluationRows.length === 0) {
                throw notFound("Evaluation not found", {
                    vacancyId: String(vacancyId),
                    resumeId: String(resumeId),
                    runId: String(runId)
                });
            }

            const evaluation = evaluationRows[0];

            const { rows: detailRows } = await client.query(
                `SELECT c.id AS criteria_id,
                        c.name,
                        c.weight,
                        c.calc_type,
                        d.raw_score,
                        d.weighted_score,
                        d.explanation,
                        d.details
                 FROM evaluation_details d
                          JOIN criteria c ON c.id = d.criteria_id
                 WHERE d.evaluation_id=$1
                 ORDER BY c.id`,
                [evaluation.id]
            );

            return {
                resume_id: evaluation.resume_id,
                run_id: evaluation.run_id,
                total_score: evaluation.total_score,
                meta: enrichRequiredMeta(evaluation.meta, detailRows),
                details: detailRows
            };
        });
    });

    app.get("/:vacancyId/top", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                properties: {
                    limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;
        const { limit = 10 } = req.query;

        return await withClient(async (client) => {
            const { rows: latestRunRows } = await client.query(
                `SELECT run_id
                 FROM evaluations
                 WHERE vacancy_id=$1
                 GROUP BY run_id
                 ORDER BY MIN(created_at) DESC
                     LIMIT 1`,
                [String(vacancyId)]
            );

            if (latestRunRows.length === 0) {
                throw notFound("No runs found for vacancy", {
                    vacancyId: String(vacancyId)
                });
            }

            const latestRunId = String(latestRunRows[0].run_id);

            const { rows } = await client.query(
                `SELECT e.resume_id,
                        r.candidate_name,
                        r.city,
                        e.total_score,
                        r.creation_date,
                        e.run_id
                 FROM evaluations e
                          JOIN resumes r ON r.id = e.resume_id
                 WHERE e.vacancy_id=$1
                   AND e.run_id=$2
                   AND COALESCE((e.meta->>'excluded_by_required')::boolean, false) = false
                 ORDER BY
                     e.total_score DESC,
                     r.creation_date DESC NULLS LAST
                     LIMIT $3`,
                [String(vacancyId), latestRunId, limit]
            );

            return {
                vacancy_id: String(vacancyId),
                run_id: latestRunId,
                items: rows
            };
        });
    });
    app.get("/:vacancyId/skills-preview/:resumeId", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId", "resumeId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 },
                    resumeId: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                properties: {
                    run_id: { type: "string", minLength: 1 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId, resumeId } = req.params;
        const runId = req.query.run_id;

        return await withClient(async (client) => {
            const { rows: resumeLinkRows } = await client.query(
                `SELECT mapping_document_id
                 FROM resume_mapping_links
                 WHERE resume_id=$1
                     LIMIT 1`,
                [String(resumeId)]
            );

            const resumeMappingDocumentId =
                resumeLinkRows.length > 0 ? String(resumeLinkRows[0].mapping_document_id) : null;

            const vacancyMappingDocumentId = await resolveVacancyMappingDocumentId(
                client,
                vacancyId
            );

            // 1. Preferred source: direct mapping tables
            if (resumeMappingDocumentId && vacancyMappingDocumentId) {
                const { rows: cvRows } = await client.query(
                    `SELECT esco_label, MAX(confidence) AS confidence
                 FROM cv_skill_mappings
                 WHERE document_id=$1
                   AND esco_label IS NOT NULL
                 GROUP BY esco_label
                 ORDER BY esco_label`,
                    [resumeMappingDocumentId]
                );

                const { rows: vacRows } = await client.query(
                    `SELECT esco_label, MAX(confidence) AS confidence
                 FROM vac_skill_mappings
                 WHERE document_id=$1
                   AND esco_label IS NOT NULL
                 GROUP BY esco_label
                 ORDER BY esco_label`,
                    [vacancyMappingDocumentId]
                );

                const cvMap = new Map(
                    cvRows.map((row) => [
                        String(row.esco_label).trim(),
                        Number(row.confidence ?? 0)
                    ])
                );

                const matched = vacRows
                    .filter((row) => cvMap.has(String(row.esco_label).trim()))
                    .map((row) => ({
                        esco_label: String(row.esco_label).trim(),
                        vacancy_confidence: Number(row.confidence ?? 0),
                        cv_confidence: cvMap.get(String(row.esco_label).trim())
                    }));

                const missing = vacRows
                    .filter((row) => !cvMap.has(String(row.esco_label).trim()))
                    .map((row) => ({
                        esco_label: String(row.esco_label).trim(),
                        vacancy_confidence: Number(row.confidence ?? 0)
                    }));

                return {
                    vacancy_id: String(vacancyId),
                    resume_id: String(resumeId),
                    available: true,
                    reason: null,
                    source: "mapping_tables",
                    resume_mapping_document_id: resumeMappingDocumentId,
                    vacancy_mapping_document_id: vacancyMappingDocumentId,
                    matched,
                    missing
                };
            }

            // 2. Fallback source: skill_mapping_match result from evaluation_details
            const fallbackParams = [String(vacancyId), String(resumeId)];
            let fallbackSql = `
            SELECT ed.details
            FROM evaluation_details ed
            JOIN evaluations e ON e.id = ed.evaluation_id
            JOIN criteria c ON c.id = ed.criteria_id
            WHERE e.vacancy_id = $1
              AND e.resume_id = $2
              AND c.calc_type = 'skill_mapping_match'
        `;

            if (runId) {
                fallbackSql += ` AND e.run_id = $3 ORDER BY ed.id DESC LIMIT 1`;
                fallbackParams.push(String(runId));
            } else {
                fallbackSql += ` ORDER BY ed.id DESC LIMIT 1`;
            }

            if (SCORING_RULES.allowSkillsPreviewFallback) {
                const fallbackResult = await client.query(fallbackSql, fallbackParams);

                if (fallbackResult.rows.length > 0 && fallbackResult.rows[0].details) {
                    const details = fallbackResult.rows[0].details || {};

                    // дальше оставляешь свой текущий fallback-код без изменений
                }

                const matchedSkills = Array.isArray(details.matchedSkills)
                    ? details.matchedSkills
                    : Array.isArray(details.matched)
                        ? details.matched
                        : [];

                const vacSkills = Array.isArray(details.vacSkills)
                    ? details.vacSkills
                    : Array.isArray(details.missing)
                        ? details.missing
                        : [];

                const matchedSet = new Set(
                    matchedSkills
                        .map((item) => String(item.esco_label || "").trim())
                        .filter(Boolean)
                );

                const matched = matchedSkills
                    .map((item) => ({
                        esco_label: String(item.esco_label || "").trim(),
                        vacancy_confidence: Number(
                            item.vacancy_confidence ?? item.confidence ?? 0
                        ),
                        cv_confidence: Number(item.cv_confidence ?? 0)
                    }))
                    .filter((item) => item.esco_label);

                const missing = vacSkills
                    .filter((item) => {
                        const label = String(item.esco_label || "").trim();
                        return label && !matchedSet.has(label);
                    })
                    .map((item) => ({
                        esco_label: String(item.esco_label || "").trim(),
                        vacancy_confidence: Number(
                            item.confidence ?? item.vacancy_confidence ?? 0
                        )
                    }));

                return {
                    vacancy_id: String(vacancyId),
                    resume_id: String(resumeId),
                    available: true,
                    reason: null,
                    source: "evaluation_details_fallback",
                    resume_mapping_document_id: resumeMappingDocumentId,
                    vacancy_mapping_document_id: vacancyMappingDocumentId,
                    matched,
                    missing
                };
            }

            return {
                vacancy_id: String(vacancyId),
                resume_id: String(resumeId),
                available: false,
                reason:
                    !resumeMappingDocumentId && !vacancyMappingDocumentId
                        ? "resume_and_vacancy_mapping_not_found"
                        : !resumeMappingDocumentId
                            ? "resume_mapping_not_found"
                            : "vacancy_mapping_not_found",
                resume_mapping_document_id: resumeMappingDocumentId,
                vacancy_mapping_document_id: vacancyMappingDocumentId,
                matched: [],
                missing: []
            };
        });
    });

    app.get("/:vacancyId/compare/:resumeId1/:resumeId2", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId", "resumeId1", "resumeId2"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 },
                    resumeId1: { type: "string", minLength: 1 },
                    resumeId2: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                required: ["run_id"],
                properties: {
                    run_id: { type: "string", minLength: 1 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId, resumeId1, resumeId2 } = req.params;
        const runId = req.query.run_id;


        return await withClient(async (client) => {
            const { rows } = await client.query(
                `SELECT e.resume_id,
                        r.candidate_name,
                        r.city,
                        e.total_score,
                        e.meta
                 FROM evaluations e
                          JOIN resumes r ON r.id = e.resume_id
                 WHERE e.vacancy_id=$1
                   AND e.run_id=$2
                   AND e.resume_id IN ($3, $4)
                   AND COALESCE((e.meta->>'excluded_by_required')::boolean, false) = false
                 ORDER BY e.total_score DESC`,
                [String(vacancyId), String(runId), String(resumeId1), String(resumeId2)]
            );

            if (rows.length === 0) {
                throw notFound("Candidates not found in this run", {
                    vacancyId: String(vacancyId),
                    runId: String(runId),
                    resumeId1: String(resumeId1),
                    resumeId2: String(resumeId2)
                });
            }

            const comparison = [];

            for (const row of rows) {
                const { rows: detailRows } = await client.query(
                    `SELECT c.name,
                            c.calc_type,
                            d.raw_score,
                            d.weighted_score,
                            d.explanation,
                            d.details
                     FROM evaluations e
                     JOIN evaluation_details d ON d.evaluation_id = e.id
                     JOIN criteria c ON c.id = d.criteria_id
                     WHERE e.vacancy_id=$1
                       AND e.run_id=$2
                       AND e.resume_id=$3
                     ORDER BY d.weighted_score DESC, c.id`,
                    [String(vacancyId), String(runId), String(row.resume_id)]
                );

                comparison.push({
                    resume_id: row.resume_id,
                    candidate_name: row.candidate_name,
                    city: row.city,
                    total_score: Number(row.total_score),
                    meta: enrichRequiredMeta(row.meta, detailRows),
                    details: detailRows.map((item) => ({
                        name: item.name,
                        calc_type: item.calc_type,
                        raw_score: Number(item.raw_score),
                        weighted_score: Number(item.weighted_score),
                        explanation: item.explanation,
                        details: item.details
                    }))
                });
            }

            return {
                vacancy_id: String(vacancyId),
                run_id: String(runId),
                items: comparison
            };
        });
    });

    app.get("/:vacancyId/summary/:resumeId", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId", "resumeId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 },
                    resumeId: { type: "string", minLength: 1 }
                }
            },
            querystring: {
                type: "object",
                required: ["run_id"],
                properties: {
                    run_id: { type: "string", minLength: 1 }
                }
            }
        }
    }, async (req) => {
        const { vacancyId, resumeId } = req.params;
        const runId = req.query.run_id;

        return await withClient(async (client) => {
            const { rows: evaluationRows } = await client.query(
                `SELECT e.id, e.total_score, e.meta
                 FROM evaluations e
                 WHERE e.vacancy_id=$1
                   AND e.resume_id=$2
                   AND e.run_id=$3
                 LIMIT 1`,
                [String(vacancyId), String(resumeId), String(runId)]
            );

            if (evaluationRows.length === 0) {
                throw notFound("Evaluation not found", {
                    vacancyId: String(vacancyId),
                    resumeId: String(resumeId),
                    runId: String(runId)
                });
            }

            const evaluation = evaluationRows[0];

            const { rows: detailRows } = await client.query(
                `SELECT c.name,
                        c.calc_type,
                        d.raw_score,
                        d.weighted_score,
                        d.explanation,
                        d.details
                 FROM evaluation_details d
                 JOIN criteria c ON c.id = d.criteria_id
                 WHERE d.evaluation_id=$1
                 ORDER BY d.weighted_score DESC, c.id`,
                [evaluation.id]
            );

            const strengths = detailRows
                .filter((row) => Number(row.weighted_score) > 0)
                .slice(0, 3)
                .map((row) => ({
                    name: row.name,
                    calc_type: row.calc_type,
                    weighted_score: Number(row.weighted_score),
                    explanation: row.explanation
                }));

            const weaknesses = detailRows
                .filter((row) => Number(row.weighted_score) === 0)
                .slice(0, 3)
                .map((row) => ({
                    name: row.name,
                    calc_type: row.calc_type,
                    weighted_score: Number(row.weighted_score),
                    explanation: row.explanation
                }));

            return {
                vacancy_id: String(vacancyId),
                resume_id: String(resumeId),
                run_id: String(runId),
                total_score: Number(evaluation.total_score),
                meta: enrichRequiredMeta(evaluation.meta, detailRows),
                strengths,
                weaknesses
            };
        });
    });
}