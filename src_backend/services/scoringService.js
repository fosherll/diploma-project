import { randomUUID } from "crypto";
import { SCORING_RULES } from "../domain/scoringRules.js";
import { resolveVacancyMappingDocumentId } from "../utils/resolveVacancyMapping.js";
import { resolveResumeMappingDocumentId } from "../utils/resolveResumeMapping.js";
import { round4 } from "../utils/math.js";

// ── Налаштування скорингу (порогові значення) ────────────────────────────────
/** Макс. допустиме перевищення зарплати без штрафу (1.2 = +20%) */
const SALARY_OVER_RATIO_TOLERANCE = 1.2;
/** Частка стажу від мінімуму, яка дає частковий залік (0.7 = 70%) */
const EXPERIENCE_PARTIAL_THRESHOLD = 0.7;
/** Бали за свіжість резюме залежно від віку */
const RECENCY_SCORE_FRESH      = 1.0;
const RECENCY_SCORE_ACCEPTABLE = 0.6;
const RECENCY_SCORE_STALE      = 0.25;

/**
 * @typedef {Object} Criterion
 * @property {string|number} id
 * @property {string|number} vacancy_id
 * @property {string} name
 * @property {number|string|null} weight
 * @property {string} calc_type
 * @property {Object|string|null} config
 * @property {boolean} [is_enabled]
 */

/**
 * @typedef {Object} EvaluationDetailRow
 * @property {string|number} criteriaId
 * @property {number} rawScore
 * @property {number} weightedScore
 * @property {string} explanation
 * @property {Object} details
 */

/**
 * @typedef {Object} RequiredState
 * @property {number} requiredTotal
 * @property {number} requiredPassed
 * @property {number} requiredPassRate
 * @property {boolean} passedAllRequired
 * @property {Array<{name: string, calc_type: string}>} failedRequiredCriteria
 * @property {boolean} excludedByRequired
 * @property {EvaluationDetailRow[]} detailsRows
 */

/**
 * @typedef {Object} OptionalState
 * @property {number} totalScore
 * @property {EvaluationDetailRow[]} detailsRows
 */

/**
 * @typedef {Object} ScoringContext
 * @property {Criterion[]} criteria
 * @property {Array<Object>} resumes
 */

/**
 * @typedef {Object} SaveEvaluationParams
 * @property {string|number} vacancyId
 * @property {string} runId
 * @property {Object} resume
 * @property {Criterion[]} criteria
 * @property {number} totalScore
 * @property {RequiredState} requiredState
 * @property {EvaluationDetailRow[]} detailsRows
 */

function normalizeText(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function parseConfig(config) {
    if (!config) return {};
    if (typeof config === "object") return config;
    try {
        return JSON.parse(config);
    } catch {
        return {};
    }
}

/**
 * @typedef {Object} CriterionEvaluationResult
 * @property {boolean} passed
 * @property {number} rawScore
 * @property {string} explanation
 * @property {Object} details
 */

function buildCriterionResult({
                                  criterion,
                                  passed = false,
                                  rawScore = 0,
                                  explanation = "",
                                  details = {}
                              }) {
    return {
        passed: Boolean(passed),
        rawScore: round4(Number(rawScore) || 0),
        explanation: explanation || "",
        details: {
            criterion_name: criterion?.name ?? null,
            calc_type: criterion?.calc_type ?? null,
            ...details
        }
    };
}

function normalizeCity(value) {
    const city = normalizeText(value);

    const aliases = {
        kyiv: "kyiv",
        київ: "kyiv",
        kiev: "kyiv",
        киев: "kyiv",
        lviv: "lviv",
        львів: "lviv",
        львов: "lviv",
        odessa: "odesa",
        odesa: "odesa",
        одеса: "odesa",
        одесса: "odesa",
        dnipro: "dnipro",
        дніпро: "dnipro",
        днепр: "dnipro",
        kharkiv: "kharkiv",
        харків: "kharkiv",
        харьков: "kharkiv"
    };

    return aliases[city] ?? city;
}

function extractNumber(value) {
    if (value === null || value === undefined) return null;

    const str = String(value).replace(/\s+/g, "").replace(",", ".");
    const match = str.match(/-?\d+(\.\d+)?/);

    if (!match) return null;

    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
}

function extractYearsOfExperience(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "number") {
        return value >= 0 && value <= 40 ? value : null;
    }

    const str = String(value).toLowerCase().trim();
    if (!str) return null;

    const patterns = [
        /^\s*(\d+(\.\d+)?)\s*(year|years|yr|рок|роки|років|года|лет)?\s*$/i,
        /(?:досвід|experience).{0,20}?(\d+(\.\d+)?)\s*(year|years|yr|рок|роки|років|года|лет)/i
    ];

    for (const pattern of patterns) {
        const match = str.match(pattern);
        if (match?.[1]) {
            const num = Number(match[1]);
            if (Number.isFinite(num) && num >= 0 && num <= 40) return num;
        }
    }

    return null;
}
function tokenizeText(value) {
    return normalizeText(value)
        .split(/[^a-zа-яіїєґ0-9+#]+/iu)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
}

function normalizeEmploymentValue(value) {
    const text = normalizeText(value);

    const result = [];
    if (!text) return result;

    if (text.includes("повна") || text.includes("full-time") || text.includes("full time")) result.push("full");
    if (text.includes("неповна") || text.includes("part-time") || text.includes("part time")) result.push("part");
    if (text.includes("віддален") || text.includes("remote")) result.push("remote");
    if (text.includes("гібрид") || text.includes("hybrid")) result.push("hybrid");
    if (text.includes("вечір") || text.includes("вечер")) result.push("evening");
    if (text.includes("вихідн") || text.includes("weekend")) result.push("weekend");
    if (text.includes("змін") || text.includes("смен")) result.push("shift");

    return [...new Set(result)];
}

function detectLanguages(text) {
    const src = normalizeText(text);
    const langs = [];

    const groups = [
        ["english", ["english", "англій", "англий"]],
        ["ukrainian", ["ukrain", "україн", "украин"]],
        ["polish", ["polish", "польсь", "польск"]],
        ["german", ["german", "німець", "немец"]],
        ["french", ["french", "француз"]],
        ["spanish", ["spanish", "іспан", "испан"]]
    ];

    for (const [label, variants] of groups) {
        if (variants.some((v) => src.includes(v))) langs.push(label);
    }

    return [...new Set(langs)];
}

function detectEducationLevels(text) {
    const src = normalizeText(text);
    const levels = [];

    if (src.includes("вища") || src.includes("higher education") || src.includes("degree")) levels.push("higher");
    if (src.includes("середня спеціальна") || src.includes("vocational") || src.includes("college")) levels.push("vocational");
    if (src.includes("студент") || src.includes("student")) levels.push("student");
    if (src.includes("середня") || src.includes("secondary")) levels.push("secondary");

    return [...new Set(levels)];
}

function scoreSalaryMatch(resume, criterion, config) {
    const actualSalary = extractNumber(resume.desired_salary);
    const maxSalary = extractNumber(config.max_salary);
    const minSalary = extractNumber(config.min_salary);

    if (actualSalary === null) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "candidate desired_salary is empty",
            details: {
                expected: {
                    min_salary: config.min_salary ?? null,
                    max_salary: config.max_salary ?? null
                },
                actual: resume.desired_salary ?? null,
                matched: false
            }
        });
    }

    if (minSalary !== null && actualSalary < minSalary) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: `salary below minimum: ${actualSalary} < ${minSalary}`,
            details: {
                expected: {
                    min_salary: minSalary,
                    max_salary: maxSalary
                },
                actual: actualSalary,
                matched: false
            }
        });
    }

    if (maxSalary !== null && actualSalary <= maxSalary) {
        return buildCriterionResult({
            criterion,
            passed: true,
            rawScore: 1,
            explanation: `salary matched: ${actualSalary} <= ${maxSalary}`,
            details: {
                expected: {
                    min_salary: minSalary,
                    max_salary: maxSalary
                },
                actual: actualSalary,
                matched: true
            }
        });
    }

    if (maxSalary !== null && actualSalary > maxSalary) {
        const overRatio = actualSalary / maxSalary;

        if (overRatio <= SALARY_OVER_RATIO_TOLERANCE) {
            return buildCriterionResult({
                criterion,
                passed: false,
                rawScore: 0.5,
                explanation: `salary slightly above maximum: ${actualSalary} > ${maxSalary}`,
                details: {
                    expected: {
                        min_salary: minSalary,
                        max_salary: maxSalary
                    },
                    actual: actualSalary,
                    matched: false,
                    partialMatch: true
                }
            });
        }

        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: `salary too high: ${actualSalary} > ${maxSalary}`,
            details: {
                expected: {
                    min_salary: minSalary,
                    max_salary: maxSalary
                },
                actual: actualSalary,
                matched: false
            }
        });
    }

    return buildCriterionResult({
        criterion,
        passed: true,
        rawScore: 1,
        explanation: `salary accepted: ${actualSalary}`,
        details: {
            expected: {
                min_salary: minSalary,
                max_salary: maxSalary
            },
            actual: actualSalary,
            matched: true
        }
    });
}

function scoreExperienceMatch(resume, criterion, config) {
    const actualYears =
        extractYearsOfExperience(resume.experience_years) ??
        extractYearsOfExperience(resume.experience) ??
        extractYearsOfExperience(resume.markdown);

    const minYears = extractNumber(config.min_years);

    if (minYears === null) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "config.min_years is empty",
            details: {
                expected: config.min_years ?? null,
                actual: actualYears,
                matched: false
            }
        });
    }

    if (actualYears === null) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "candidate experience was not detected",
            details: {
                expected: minYears,
                actual: null,
                matched: false
            }
        });
    }

    if (actualYears >= minYears) {
        return buildCriterionResult({
            criterion,
            passed: true,
            rawScore: 1,
            explanation: `experience matched: ${actualYears} >= ${minYears}`,
            details: {
                expected: minYears,
                actual: actualYears,
                matched: true
            }
        });
    }

    const ratio = actualYears / minYears;
    const partialMatch = ratio >= EXPERIENCE_PARTIAL_THRESHOLD;
    const rawScore = partialMatch ? 0.5 : 0;

    return buildCriterionResult({
        criterion,
        passed: false,
        rawScore,
        explanation: partialMatch
            ? `experience partially matched: ${actualYears} < ${minYears}`
            : `experience did not match: ${actualYears} < ${minYears}`,
        details: {
            expected: minYears,
            actual: actualYears,
            matched: false,
            partialMatch
        }
    });
}


function cosineSimilarityJS(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
}

function parseVector(vec) {
    if (!vec) return null;
    if (Array.isArray(vec)) return vec;
    if (typeof vec === "string") {
        const cleaned = vec.replace(/^\[/, "").replace(/\]$/, "");
        return cleaned.split(",").map(Number);
    }
    return null;
}

async function scoreSemanticSkillMatch(client, resume, criterion, vacancyId, config) {
    const minConfidence = Number(config.min_confidence ?? 0.7);

    const [resumeDocId, vacDocId] = await Promise.all([
        resolveResumeMappingDocumentId(client, resume.id),
        resolveVacancyMappingDocumentId(client, vacancyId)
    ]);

    if (!resumeDocId || !vacDocId) {
        return buildCriterionResult({
            criterion, passed: false, rawScore: 0,
            explanation: !resumeDocId
                ? "resume mapping link was not found"
                : "vacancy mapping link was not found",
            details: { method: "average_best_match", resumeDocId, vacDocId,
                skillDetails: [], vacSkillCount: 0, cvSkillCount: 0 }
        });
    }

    // pgvector LATERAL знаходить найближчу CV навичку для кожної vacancy навички
    // через HNSW індекс — O(N × log M) замість O(N × M).
    // countRows запускається лише коли matchRows порожній — економимо round-trip в нормальному випадку.
    const { rows: matchRows } = await client.query(
        `SELECT
             v.esco_label                          AS vac_label,
             nearest.esco_label                    AS cv_label,
             1 - (v.embedding <=> nearest.embedding) AS similarity
         FROM vac_skill_mappings v
         CROSS JOIN LATERAL (
             SELECT c.esco_label, c.embedding
             FROM cv_skill_mappings c
             WHERE c.document_id = $2
               AND c.esco_label IS NOT NULL
               AND c.confidence >= $3
               AND c.embedding IS NOT NULL
             ORDER BY c.embedding <=> v.embedding
             LIMIT 1
         ) nearest
         WHERE v.document_id = $1
           AND v.esco_label IS NOT NULL
           AND v.confidence >= $3
           AND v.embedding IS NOT NULL`,
        [vacDocId, resumeDocId, minConfidence]
    );

    if (matchRows.length === 0) {
        // Lazy diagnostic: find out WHY there are no matches
        const { rows: countRows } = await client.query(
            `SELECT
                 (SELECT COUNT(DISTINCT esco_label) FROM vac_skill_mappings
                  WHERE document_id=$1 AND esco_label IS NOT NULL AND confidence>=$3) AS vac_count,
                 (SELECT COUNT(DISTINCT esco_label) FROM cv_skill_mappings
                  WHERE document_id=$2 AND esco_label IS NOT NULL AND confidence>=$3) AS cv_count`,
            [vacDocId, resumeDocId, minConfidence]
        );
        const vacSkillCount = Number(countRows[0]?.vac_count ?? 0);
        const cvSkillCount  = Number(countRows[0]?.cv_count  ?? 0);

        const explanation = vacSkillCount === 0
            ? "vacancy has no skill mappings"
            : cvSkillCount === 0
                ? "resume has no skill mappings"
                : "no skill pairs above similarity threshold";

        return buildCriterionResult({
            criterion, passed: false, rawScore: 0,
            explanation,
            details: { method: "average_best_match", cvSkillCount, vacSkillCount, skillDetails: [] }
        });
    }

    // Compute counts from matchRows for the details object (no extra query needed)
    const vacSkillCount = matchRows.length;
    const cvSkillCount  = new Set(matchRows.map(r => String(r.cv_label).trim())).size;

    const skillDetails = matchRows.map(r => ({
        vacancy_skill:    String(r.vac_label).trim(),
        nearest_cv_skill: String(r.cv_label).trim(),
        best_similarity:  round4(Number(r.similarity)),
        match_type: String(r.vac_label).trim() === String(r.cv_label).trim()
            ? "exact" : "semantic"
    }));

    const sumBestSim = skillDetails.reduce((s, r) => s + r.best_similarity, 0);

    // Фінальний score = середнє арифметичне найкращих відстаней
    const rawScore      = skillDetails.length > 0 ? round4(sumBestSim / skillDetails.length) : 0;
    const exactCount    = skillDetails.filter(s => s.match_type === "exact").length;
    const semanticCount = skillDetails.filter(s => s.match_type === "semantic").length;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `average best match: ${round4(rawScore * 100)}% `
            + `(${exactCount} exact + ${semanticCount} semantic / ${skillDetails.length} vacancy skills)`,
        details: {
            method:        "average_best_match",
            minConfidence,
            resumeDocId,
            vacDocId,
            cvSkillCount,
            vacSkillCount,
            exactCount,
            semanticCount,
            skillDetails
        }
    });
}


async function scoreSkillMappingMatch(client, resume, criterion, vacancyId, config) {
    const minConfidence = Number(config.min_confidence ?? 0.7);

    const [resumeMappingDocumentId, vacancyMappingDocumentId] = await Promise.all([
        resolveResumeMappingDocumentId(client, resume.id),
        resolveVacancyMappingDocumentId(client, vacancyId)
    ]);

    if (!resumeMappingDocumentId) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "resume mapping link was not found",
            details: {
                expected: { vacancyId: String(vacancyId), minConfidence },
                actual: { resumeId: String(resume.id) },
                resumeMappingDocumentId: null,
                vacancyMappingDocumentId,
                cvSkills: [],
                vacSkills: [],
                matchedSkills: [],
                matchedCount: 0,
                totalVacancySkills: 0,
                weightedMatchedConfidence: 0,
                weightedVacancyConfidence: 0
            }
        });
    }

    if (!vacancyMappingDocumentId) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "vacancy mapping link was not found",
            details: {
                expected: { vacancyId: String(vacancyId), minConfidence },
                actual: { resumeId: String(resume.id) },
                resumeMappingDocumentId,
                vacancyMappingDocumentId: null,
                cvSkills: [],
                vacSkills: [],
                matchedSkills: [],
                matchedCount: 0,
                totalVacancySkills: 0,
                weightedMatchedConfidence: 0,
                weightedVacancyConfidence: 0
            }
        });
    }

    const { rows: cvRows } = await client.query(
        `SELECT DISTINCT esco_label, confidence
         FROM cv_skill_mappings
         WHERE document_id=$1
           AND esco_label IS NOT NULL
           AND confidence >= $2`,
        [resumeMappingDocumentId, minConfidence]
    );

    const { rows: vacRows } = await client.query(
        `SELECT DISTINCT esco_label, confidence
         FROM vac_skill_mappings
         WHERE document_id=$1
           AND esco_label IS NOT NULL
           AND confidence >= $2`,
        [vacancyMappingDocumentId, minConfidence]
    );

    const cvSkills = cvRows.map((r) => ({
        esco_label: String(r.esco_label).trim(),
        confidence: Number(r.confidence ?? 0)
    }));

    const vacSkills = vacRows.map((r) => ({
        esco_label: String(r.esco_label).trim(),
        confidence: Number(r.confidence ?? 0)
    }));

    if (vacSkills.length === 0) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "vacancy skill mappings are empty",
            details: {
                expected: { vacancyId: String(vacancyId), minConfidence },
                actual: { resumeId: String(resume.id) },
                resumeMappingDocumentId,
                vacancyMappingDocumentId,
                cvSkills,
                vacSkills,
                matchedSkills: [],
                matchedCount: 0,
                totalVacancySkills: 0,
                weightedMatchedConfidence: 0,
                weightedVacancyConfidence: 0
            }
        });
    }

    const cvMap = new Map(cvSkills.map((s) => [s.esco_label, s.confidence]));
    const matchedSkills = vacSkills
        .filter((s) => cvMap.has(s.esco_label))
        .map((s) => ({
            esco_label: s.esco_label,
            vacancy_confidence: s.confidence,
            cv_confidence: cvMap.get(s.esco_label)
        }));

    const weightedMatchedConfidence = matchedSkills.reduce(
        (sum, s) => sum + Math.min(Number(s.vacancy_confidence), Number(s.cv_confidence)),
        0
    );

    const weightedVacancyConfidence = vacSkills.reduce(
        (sum, s) => sum + Number(s.confidence),
        0
    );

    const rawScore =
        weightedVacancyConfidence > 0
            ? weightedMatchedConfidence / weightedVacancyConfidence
            : 0;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `matched ${matchedSkills.length} of ${vacSkills.length} mapped ESCO skills`,
        details: {
            expected: { vacancyId: String(vacancyId), minConfidence },
            actual: { resumeId: String(resume.id) },
            resumeMappingDocumentId,
            vacancyMappingDocumentId,
            cvSkills,
            vacSkills,
            matchedSkills,
            matchedCount: matchedSkills.length,
            totalVacancySkills: vacSkills.length,
            weightedMatchedConfidence,
            weightedVacancyConfidence
        }
    });
}
function scoreCityMatch(resume, criterion, config) {
    const expectedCity = normalizeCity(config.city);
    const actualCity = normalizeCity(resume.city);

    if (!expectedCity) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "config.city is empty",
            details: {
                expected: config.city ?? null,
                actual: resume.city ?? null,
                matched: false
            }
        });
    }

    if (!actualCity) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: `city did not match: expected ${config.city ?? "unknown"}, got empty city`,
            details: {
                expected: config.city ?? null,
                actual: resume.city ?? null,
                matched: false
            }
        });
    }

    const matched =
        actualCity === expectedCity ||
        actualCity.includes(expectedCity) ||
        expectedCity.includes(actualCity);

    return buildCriterionResult({
        criterion,
        passed: matched,
        rawScore: matched ? 1 : 0,
        explanation: matched
            ? `city matched: ${resume.city ?? "unknown"}`
            : `city did not match: expected ${config.city ?? "unknown"}, got ${resume.city ?? "unknown"}`,
        details: {
            expected: config.city ?? null,
            actual: resume.city ?? null,
            matched
        }
    });
}

function scoreRegionMatch(resume, criterion, config) {
    const aliases = Array.isArray(config.aliases) ? config.aliases.map(normalizeCity) : [];
    const actualCity = normalizeCity(resume.city);

    if (!aliases.length) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "config.aliases is empty",
            details: {
                expected: aliases,
                actual: resume.city ?? null,
                matched: false
            }
        });
    }

    if (!actualCity) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "candidate city is empty",
            details: {
                expected: aliases,
                actual: resume.city ?? null,
                matched: false
            }
        });
    }

    const matched = aliases.some((alias) => {
        return actualCity === alias || actualCity.includes(alias) || alias.includes(actualCity);
    });

    return buildCriterionResult({
        criterion,
        passed: matched,
        rawScore: matched ? 1 : 0,
        explanation: matched
            ? `region matched: ${resume.city ?? "unknown"}`
            : `region did not match: ${resume.city ?? "unknown"}`,
        details: {
            expected: aliases,
            actual: resume.city ?? null,
            matched
        }
    });
}

function scoreKeywordMatch(resume, criterion, config) {
    const keywords = Array.isArray(config.keywords) ? config.keywords : [];
    const text = normalizeText(resume.markdown);

    if (keywords.length === 0) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "config.keywords is empty",
            details: {
                expected: keywords,
                actual: [],
                matchedKeywords: [],
                matchedCount: 0,
                totalKeywords: 0
            }
        });
    }

    const matchedKeywords = [];

    for (const keyword of keywords) {
        const normalizedKeyword = normalizeText(keyword);
        if (normalizedKeyword && text.includes(normalizedKeyword)) {
            matchedKeywords.push(keyword);
        }
    }

    const rawScore = matchedKeywords.length / keywords.length;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `matched ${matchedKeywords.length} of ${keywords.length} keywords`,
        details: {
            expected: keywords,
            actual: matchedKeywords,
            matchedKeywords,
            matchedCount: matchedKeywords.length,
            totalKeywords: keywords.length
        }
    });
}

function scoreBoolMatch(resume, criterion, config) {
    const field = String(config.field ?? "").trim();
    const truthy = Array.isArray(config.truthy)
        ? config.truthy.map((v) => normalizeText(v))
        : ["true", "yes", "1"];

    if (!field) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "config.field is empty",
            details: {
                expected: truthy,
                actual: null,
                field: null,
                matched: false
            }
        });
    }

    const actualValue = resume[field];
    const normalizedActualValue = normalizeText(actualValue);
    const matched = truthy.includes(normalizedActualValue);

    return buildCriterionResult({
        criterion,
        passed: matched,
        rawScore: matched ? 1 : 0,
        explanation: matched ? `${field} matched` : `${field} did not match`,
        details: {
            expected: truthy,
            actual: actualValue ?? null,
            field,
            matched
        }
    });
}
function scoreRecencyMatch(resume, criterion, config) {
    const freshDays = Number(config.fresh_days ?? 90);
    const acceptableDays = Number(config.acceptable_days ?? 180);
    const staleDays = Number(config.stale_days ?? 365);

    if (!resume.creation_date) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "candidate creation_date is empty",
            details: {
                expected: { freshDays, acceptableDays, staleDays },
                actual: null,
                creationDate: null,
                ageDays: null
            }
        });
    }

    const createdAt = new Date(resume.creation_date);
    const now = new Date();
    const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    if (!Number.isFinite(ageDays) || ageDays < 0) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "candidate creation_date is invalid",
            details: {
                expected: { freshDays, acceptableDays, staleDays },
                actual: resume.creation_date,
                creationDate: resume.creation_date,
                ageDays: null
            }
        });
    }

    let rawScore = 0;
    if (ageDays <= freshDays)          rawScore = RECENCY_SCORE_FRESH;
    else if (ageDays <= acceptableDays) rawScore = RECENCY_SCORE_ACCEPTABLE;
    else if (ageDays <= staleDays)      rawScore = RECENCY_SCORE_STALE;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `resume age is ${ageDays} days`,
        details: {
            expected: { freshDays, acceptableDays, staleDays },
            actual: ageDays,
            creationDate: resume.creation_date,
            ageDays
        }
    });
}
function scoreCompletenessMatch(resume, criterion, config) {
    const minMarkdownLength = Number(config.min_markdown_length ?? 400);
    const markdownLength = String(resume.markdown ?? "").trim().length;

    const checks = [
        !!normalizeText(resume.candidate_name),
        !!normalizeText(resume.city),
        extractNumber(resume.desired_salary) !== null,
        !!normalizeText(resume.driver_license),
        markdownLength >= minMarkdownLength,
        !!normalizeText(resume.title),
        !!normalizeText(resume.employment_type)
    ];

    const matchedCount = checks.filter(Boolean).length;
    const totalChecks = checks.length;
    const rawScore = totalChecks > 0 ? matchedCount / totalChecks : 0;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `resume completeness: ${matchedCount} of ${totalChecks} checks passed`,
        details: {
            expected: {
                min_markdown_length: minMarkdownLength,
                total_checks: totalChecks
            },
            actual: {
                markdown_length: markdownLength,
                matched_checks: matchedCount
            },
            candidateNameFilled: !!normalizeText(resume.candidate_name),
            cityFilled: !!normalizeText(resume.city),
            desiredSalaryFilled: extractNumber(resume.desired_salary) !== null,
            driverLicenseFilled: !!normalizeText(resume.driver_license),
            titleFilled: !!normalizeText(resume.title),
            employmentTypeFilled: !!normalizeText(resume.employment_type)
        }
    });
}
function scoreEmploymentTypeMatch(resume, criterion, config) {
    const expectedValues = Array.isArray(config.expected_values) ? config.expected_values : [];
    const actualValues = [
        ...normalizeEmploymentValue(resume.employment_type),
        ...normalizeEmploymentValue(resume.work_location_preference),
        ...normalizeEmploymentValue(resume.markdown)
    ];

    const uniqueActual = [...new Set(actualValues)];

    if (!expectedValues.length) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "employment expectations are empty",
            details: {
                expected: [],
                actual: uniqueActual,
                matchedValues: []
            }
        });
    }

    const matchedValues = expectedValues.filter((value) => uniqueActual.includes(value));
    const rawScore = matchedValues.length > 0 ? matchedValues.length / expectedValues.length : 0;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `employment match: ${matchedValues.length} of ${expectedValues.length}`,
        details: {
            expected: expectedValues,
            actual: uniqueActual,
            matchedValues
        }
    });
}

function scoreLanguageMatch(resume, criterion, config) {
    const requiredLanguages = Array.isArray(config.required_languages) ? config.required_languages : [];
    const actualLanguages = detectLanguages(`${resume.markdown ?? ""} ${resume.title ?? ""}`);

    if (!requiredLanguages.length) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "required languages are empty",
            details: {
                expected: [],
                actual: actualLanguages,
                matchedLanguages: []
            }
        });
    }

    const matched = requiredLanguages.filter((lang) => actualLanguages.includes(lang));
    const rawScore = matched.length / requiredLanguages.length;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `language match: ${matched.length} of ${requiredLanguages.length}`,
        details: {
            expected: requiredLanguages,
            actual: actualLanguages,
            matchedLanguages: matched
        }
    });
}

function scoreTitleSimilarityMatch(resume, criterion, config) {
    const titleKeywords = Array.isArray(config.title_keywords) ? config.title_keywords : [];
    const textTokens = [
        ...tokenizeText(resume.title),
        ...tokenizeText(resume.markdown).slice(0, 200)
    ];

    const actualSet = new Set(textTokens.map(normalizeText));

    if (!titleKeywords.length) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "title keywords are empty",
            details: {
                expected: [],
                actual: [],
                matchedKeywords: []
            }
        });
    }

    const matchedKeywords = titleKeywords.filter((keyword) =>
        actualSet.has(normalizeText(keyword))
    );

    const rawScore = matchedKeywords.length / titleKeywords.length;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `title similarity: ${matchedKeywords.length} of ${titleKeywords.length}`,
        details: {
            expected: titleKeywords,
            actual: [...actualSet],
            matchedKeywords
        }
    });
}

function scoreEducationMatch(resume, criterion, config) {
    const requiredLevels = Array.isArray(config.required_levels) ? config.required_levels : [];
    const actualLevels = detectEducationLevels(`${resume.markdown ?? ""} ${resume.title ?? ""}`);

    if (!requiredLevels.length) {
        return buildCriterionResult({
            criterion,
            passed: false,
            rawScore: 0,
            explanation: "required education levels are empty",
            details: {
                expected: [],
                actual: actualLevels,
                matchedLevels: []
            }
        });
    }

    const matched = requiredLevels.filter((level) => actualLevels.includes(level));
    const rawScore = matched.length > 0 ? matched.length / requiredLevels.length : 0;

    return buildCriterionResult({
        criterion,
        passed: rawScore > 0,
        rawScore,
        explanation: `education match: ${matched.length} of ${requiredLevels.length}`,
        details: {
            expected: requiredLevels,
            actual: actualLevels,
            matchedLevels: matched
        }
    });
}
/**
 * @param {import("pg").PoolClient} client
 * @param {Object} resume
 * @param {Criterion} criterion
 * @param {string|number} vacancyId
 * @returns {Promise<CriterionEvaluationResult>}
 */
async function evaluateCriterion(client, resume, criterion, vacancyId) {
    const config = parseConfig(criterion.config);
    const calcType = String(criterion.calc_type ?? "").trim();

    switch (calcType) {
        case "city_match":
            return scoreCityMatch(resume, criterion, config);

        case "region_match":
            return scoreRegionMatch(resume, criterion, config);

        case "keyword_match":
            return scoreKeywordMatch(resume, criterion, config);

        case "bool_match":
            return scoreBoolMatch(resume, criterion, config);

        case "salary_match":
            return scoreSalaryMatch(resume, criterion, config);

        case "experience_match":
            return scoreExperienceMatch(resume, criterion, config);

        case "employment_type_match":
            return scoreEmploymentTypeMatch(resume, criterion, config);

        case "language_match":
            return scoreLanguageMatch(resume, criterion, config);

        case "title_similarity_match":
            return scoreTitleSimilarityMatch(resume, criterion, config);

        case "education_match":
            return scoreEducationMatch(resume, criterion, config);

        case "recency_match":
            return scoreRecencyMatch(resume, criterion, config);

        case "completeness_match":
            return scoreCompletenessMatch(resume, criterion, config);

        case "skill_mapping_match":
            return await scoreSkillMappingMatch(client, resume, criterion, vacancyId, config);

        case "semantic_skill_match":
            return await scoreSemanticSkillMatch(client, resume, criterion, vacancyId, config);

        default:
            return buildCriterionResult({
                criterion,
                passed: false,
                rawScore: 0,
                explanation: `calc_type "${calcType}" is not supported`,
                details: {
                    expected: null,
                    actual: null,
                    config
                }
            });
    }
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string|number} vacancyId
 * @param {number} analyzeCount
 * @returns {Promise<ScoringContext>}
 */
/**
 * Вибирає кандидатів для скорингу.
 * Стратегія 1: сортування за косинусною схожістю ESCO-векторів (pgvector avg).
 * Стратегія 2 (fallback): перші N резюме за id, якщо ESCO маппінгів немає.
 *
 * @param {import("pg").PoolClient} client
 * @param {string|number} vacancyId
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function selectResumes(client, vacancyId, limit) {
    const vacDocId = await resolveVacancyMappingDocumentId(client, String(vacancyId));

    if (vacDocId) {
        const { rows: avgRows } = await client.query(
            `SELECT avg(embedding) AS avg_vec
             FROM vac_skill_mappings
             WHERE document_id = $1 AND embedding IS NOT NULL AND esco_label IS NOT NULL`,
            [vacDocId]
        );
        const vacAvgVec = avgRows[0]?.avg_vec;

        if (vacAvgVec) {
            const { rows } = await client.query(
                `SELECT r.id, r.candidate_name, r.city, r.driver_license,
                        r.desired_salary,
                        NULL::text    AS experience,
                        NULL::numeric AS experience_years,
                        r.markdown, r.creation_date,
                        1 - (avg(m.embedding) <=> $2::vector) AS skill_sim
                 FROM resumes r
                 JOIN resume_mapping_links l ON l.resume_id = r.id
                 JOIN cv_skill_mappings m    ON m.document_id = l.mapping_document_id
                 WHERE m.embedding IS NOT NULL AND m.esco_label IS NOT NULL
                 GROUP BY r.id, r.candidate_name, r.city, r.driver_license,
                          r.desired_salary, r.markdown, r.creation_date
                 ORDER BY skill_sim DESC
                 LIMIT $1`,
                [limit, vacAvgVec]
            );
            if (rows.length > 0) return rows;
        }
    }

    // Fallback: немає ESCO маппінгів для вакансії — беремо перші N за id
    const { rows } = await client.query(
        `SELECT id, candidate_name, city, driver_license, desired_salary,
                NULL::text AS experience, NULL::numeric AS experience_years,
                markdown, creation_date
         FROM resumes ORDER BY id LIMIT $1`,
        [limit]
    );
    return rows;
}

async function loadScoringContext(client, vacancyId, analyzeCount) {
    const [{ rows: criteria }, resumes] = await Promise.all([
        client.query(
            `SELECT id, vacancy_id, name, weight, calc_type, config, is_enabled
             FROM criteria
             WHERE vacancy_id=$1 AND is_enabled=true
             ORDER BY id`,
            [String(vacancyId)]
        ),
        selectResumes(client, vacancyId, analyzeCount)
    ]);

    return { criteria, resumes };
}
function isCriterionRequired(criterion) {
    const config = parseConfig(criterion.config);

    if (typeof config.required === "boolean") return config.required;
    if (typeof config.required === "string") {
        return ["true", "1", "yes", "on"].includes(config.required.trim().toLowerCase());
    }
    if (typeof config.required === "number") return config.required !== 0;

    return false;
}

/**
 * @param {Criterion[]} criteria
 * @returns {{ requiredCriteria: Criterion[], optionalCriteria: Criterion[] }}
 */
function splitCriteria(criteria) {
    return {
        requiredCriteria: criteria.filter(isCriterionRequired),
        optionalCriteria: criteria.filter((criterion) => !isCriterionRequired(criterion))
    };
}
/**
 * @param {import("pg").PoolClient} client
 * @param {Object} resume
 * @param {Criterion[]} requiredCriteria
 * @param {string|number} vacancyId
 * @returns {Promise<RequiredState>}
 */
async function evaluateRequiredCriteria(client, resume, requiredCriteria, vacancyId) {
    const detailsRows = [];
    let requiredPassed = 0;
    const requiredTotal = requiredCriteria.length;
    const failedRequiredCriteria = [];

    for (const criterion of requiredCriteria) {
        const result = await evaluateCriterion(client, resume, criterion, vacancyId);
        const rawScore = round4(result.rawScore ?? 0);

        if (result.passed) {
            requiredPassed += 1;
        } else {
            failedRequiredCriteria.push({
                name: criterion.name,
                calc_type: criterion.calc_type
            });
        }

        detailsRows.push({
            criteriaId: criterion.id,
            rawScore,
            weightedScore: 0,
            explanation: result.explanation ?? "",
            details: {
                ...(result.details ?? {}),
                is_required: true,
                passed: result.passed,
                excluded_by_required: !result.passed
            }
        });
    }

    const passedAllRequired =
        requiredTotal > 0 ? requiredPassed === requiredTotal : true;

    const requiredPassRate =
        requiredTotal > 0 ? round4(requiredPassed / requiredTotal) : 1;

    const excludedByRequired =
        SCORING_RULES.requiredCriteriaActAsHardFilter &&
        requiredTotal > 0 &&
        !passedAllRequired;

    return {
        requiredTotal,
        requiredPassed,
        requiredPassRate,
        passedAllRequired,
        failedRequiredCriteria,
        excludedByRequired,
        detailsRows
    };
}
async function evaluateOptionalCriteria(client, resume, optionalCriteria, vacancyId) {
    let totalScore = 0;
    const detailsRows = [];

    for (const criterion of optionalCriteria) {
        const result = await evaluateCriterion(client, resume, criterion, vacancyId);
        const weight = Number(criterion.weight ?? 0);
        const rawScore = round4(result.rawScore ?? 0);
        const weightedScore = round4(rawScore * weight);

        totalScore += weightedScore;

        detailsRows.push({
            criteriaId: criterion.id,
            rawScore,
            weightedScore,
            explanation: result.explanation ?? "",
            details: {
                ...(result.details ?? {}),
                is_required: false,
                passed: result.passed
            }
        });
    }

    return {
        totalScore: round4(totalScore),
        detailsRows
    };
}
/**
 * @param {import("pg").PoolClient} client
 * @param {SaveEvaluationParams} params
 * @returns {Promise<string|number>}
 */
async function saveEvaluationWithDetails(client, {
    vacancyId,
    runId,
    resume,
    criteria,
    totalScore,
    requiredState,
    detailsRows
}) {
    const { rows: evalRows } = await client.query(
        `INSERT INTO evaluations (vacancy_id, resume_id, run_id, total_score, meta)
         VALUES ($1,$2,$3,$4,$5::jsonb)
             RETURNING id`,
        [
            String(vacancyId),
            String(resume.id),
            runId,
            totalScore,
            JSON.stringify({
                candidate_name: resume.candidate_name ?? null,
                city: resume.city ?? null,
                creation_date: resume.creation_date ?? null,
                criteria_count: criteria.length,
                required_total: requiredState.requiredTotal,
                required_passed: requiredState.requiredPassed,
                required_pass_rate: requiredState.requiredPassRate,
                passed_all_required: requiredState.passedAllRequired,
                required_penalty: SCORING_RULES.excludedCandidateScore,
                failed_required_criteria: requiredState.failedRequiredCriteria,
                excluded_by_required: requiredState.excludedByRequired,
                esco_skill_sim: resume.skill_sim != null ? Math.round(Number(resume.skill_sim) * 100) / 100 : null
            })
        ]
    );

    const evaluationId = evalRows[0].id;

    // Batch INSERT замість N окремих запитів (N = кількість критеріїв)
    if (detailsRows.length > 0) {
        const values = [];
        const placeholders = detailsRows.map((row, i) => {
            const base = i * 6;
            values.push(
                evaluationId, row.criteriaId, row.rawScore,
                row.weightedScore, row.explanation, JSON.stringify(row.details)
            );
            return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6}::jsonb)`;
        });
        await client.query(
            `INSERT INTO evaluation_details
             (evaluation_id, criteria_id, raw_score, weighted_score, explanation, details)
             VALUES ${placeholders.join(",")}`,
            values
        );
    }

    return evaluationId;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{ vacancyId: string|number, analyzeCount?: number }} params
 * @returns {Promise<{ runId: string, resumesCount: number, criteriaCount: number }>}
 */
export async function runScoring(client, { vacancyId, analyzeCount = 100 }) {
    const runId = randomUUID();

    const context = await loadScoringContext(client, vacancyId, analyzeCount);
    const { requiredCriteria, optionalCriteria } = splitCriteria(context.criteria);

    await client.query("BEGIN");
    try {
        for (const resume of context.resumes) {
            const requiredState = await evaluateRequiredCriteria(
                client,
                resume,
                requiredCriteria,
                vacancyId
            );

            if (requiredState.excludedByRequired) {
                await saveEvaluationWithDetails(client, {
                    vacancyId,
                    runId,
                    resume,
                    criteria: context.criteria,
                    totalScore: SCORING_RULES.excludedCandidateScore,
                    requiredState,
                    detailsRows: requiredState.detailsRows
                });
                continue;
            }

            const optionalState = await evaluateOptionalCriteria(
                client,
                resume,
                optionalCriteria,
                vacancyId
            );

            await saveEvaluationWithDetails(client, {
                vacancyId,
                runId,
                resume,
                criteria: context.criteria,
                totalScore: optionalState.totalScore,
                requiredState,
                detailsRows: [
                    ...requiredState.detailsRows,
                    ...optionalState.detailsRows
                ]
            });
        }

        await client.query("COMMIT");
        return {
            runId,
            resumesCount: context.resumes.length,
            criteriaCount: context.criteria.length
        };
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
}