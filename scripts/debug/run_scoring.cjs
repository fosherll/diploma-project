require("dotenv").config();

const { Pool } = require("pg");
const crypto = require("crypto");

const VACANCY_ID = process.argv[2];
const LIMIT = Number(process.argv[3] || 1000);
const RESUME_OFFSET = Number(process.argv[4] || 0);

if (!process.env.DATABASE_URL) {
    console.error("[fatal] DATABASE_URL is missing in .env");
    process.exit(1);
}
if (!VACANCY_ID) {
    console.error('Usage: node run_scoring.cjs "<vacancy_id>" [limit] [offset]');
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function norm(s) {
    return (s ?? "").toString().toLowerCase();
}

function safeText(obj) {
    return [
        obj.title,
        obj.candidate_name,
        obj.city,
        obj.employment_type,
        obj.work_location_preference,
        obj.desired_salary,
        obj.driver_license,
        obj.markdown,
        obj.raw_html,
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
}

function score_city_match(resume, cfg) {
    const target = norm(cfg.city);
    if (!target) return { raw: 0, why: "no target city in config" };

    const city = norm(resume.city);
    if (!city) return { raw: 0, why: "resume.city is empty" };

    const ok = city.includes(target) || target.includes(city);
    return { raw: ok ? 1 : 0, why: ok ? `city matched: ${resume.city}` : `city mismatch: ${resume.city}` };
}

function score_keyword_match(resume, cfg) {
    const keywords = Array.isArray(cfg.keywords) ? cfg.keywords.map(norm).filter(Boolean) : [];
    if (!keywords.length) return { raw: 0, why: "no keywords in config" };

    const text = safeText(resume);
    if (!text) return { raw: 0, why: "no text to search in resume" };

    let hit = 0;
    const hits = [];
    for (const kw of keywords) {
        if (text.includes(kw)) {
            hit++;
            hits.push(kw);
        }
    }
    // нормируем: доля найденных
    const raw = hit / keywords.length;
    return { raw, why: hits.length ? `hits: ${hits.join(", ")}` : "no keyword hits" };
}

function score_bool_match(resume, cfg) {
    const field = cfg.field;
    const truthy = Array.isArray(cfg.truthy) ? cfg.truthy.map(norm) : ["true", "1", "yes"];
    if (!field) return { raw: 0, why: "no field in config" };

    const val = resume[field];
    if (val === null || val === undefined) return { raw: 0, why: `resume.${field} is empty` };

    const s = norm(val);
    const ok = truthy.includes(s);
    return { raw: ok ? 1 : 0, why: ok ? `${field} matched (${val})` : `${field} not matched (${val})` };
}

function computeRaw(resume, criterion) {
    const cfg = criterion.config || {};
    switch (criterion.calc_type) {
        case "city_match":
            return score_city_match(resume, cfg);
        case "keyword_match":
            return score_keyword_match(resume, cfg);
        case "bool_match":
            return score_bool_match(resume, cfg);
        default:
            return { raw: 0, why: `unknown calc_type: ${criterion.calc_type}` };
    }
}

async function main() {
    const runId = crypto.randomUUID();
    console.log("[start] vacancy_id =", VACANCY_ID);
    console.log("[start] limit =", LIMIT, "offset =", RESUME_OFFSET);
    console.log("[start] run_id =", runId);

    const client = await pool.connect();
    try {
        // 1) читаем критерии
        const critRes = await client.query(
            `SELECT id, vacancy_id, name, weight, calc_type, config
       FROM criteria
       WHERE vacancy_id = $1 AND is_enabled = TRUE
       ORDER BY id`,
            [VACANCY_ID]
        );
        const criteria = critRes.rows;
        if (!criteria.length) {
            console.error("[fatal] no enabled criteria for vacancy", VACANCY_ID);
            process.exit(1);
        }
        console.log("[db] criteria =", criteria.length);

        // 2) читаем резюме (партией)
        const resumesRes = await client.query(
            `SELECT id, url, title, candidate_name, age, city, desired_salary,
              employment_type, work_location_preference, driver_license, own_car,
              creation_date, markdown, raw_html
       FROM resumes
       ORDER BY id
       LIMIT $1 OFFSET $2`,
            [LIMIT, RESUME_OFFSET]
        );
        const resumes = resumesRes.rows;
        console.log("[db] resumes loaded =", resumes.length);

        if (!resumes.length) {
            console.log("[done] no resumes for this range");
            return;
        }

        // 3) считаем и пишем в БД
        let inserted = 0;

        for (const r of resumes) {
            // total = сумма(weight * raw)
            let total = 0;
            const details = [];

            for (const c of criteria) {
                const { raw, why } = computeRaw(r, c);
                const w = Number(c.weight || 0);
                const weighted = raw * w;
                total += weighted;

                details.push({
                    criteria_id: c.id,
                    raw_score: raw,
                    weighted_score: weighted,
                    explanation: why,
                    details: { calc_type: c.calc_type, config: c.config, criterion_name: c.name },
                });
            }

            await client.query("BEGIN");
            try {
                // upsert evaluation
                const ev = await client.query(
                    `INSERT INTO evaluations (vacancy_id, resume_id, run_id, total_score, meta)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (vacancy_id, resume_id, run_id) DO UPDATE
             SET total_score = EXCLUDED.total_score,
                 meta = EXCLUDED.meta
           RETURNING id`,
                    [
                        VACANCY_ID,
                        r.id,
                        runId,
                        total,
                        JSON.stringify({ source: "run_scoring.cjs", resume_city: r.city, resume_title: r.title }),
                    ]
                );

                const evaluationId = ev.rows[0].id;

                // чтобы не копить мусор при повторном запуске с тем же run_id
                await client.query(`DELETE FROM evaluation_details WHERE evaluation_id = $1`, [evaluationId]);

                // insert details пачкой
                const cols = ["evaluation_id", "criteria_id", "raw_score", "weighted_score", "explanation", "details"];
                const vals = [];
                const ph = [];
                let p = 1;

                for (const d of details) {
                    ph.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb)`);
                    vals.push(
                        evaluationId,
                        d.criteria_id,
                        d.raw_score,
                        d.weighted_score,
                        d.explanation,
                        JSON.stringify(d.details)
                    );
                }

                await client.query(
                    `INSERT INTO evaluation_details (${cols.join(", ")})
           VALUES ${ph.join(", ")}`,
                    vals
                );

                await client.query("COMMIT");
                inserted++;

                if (inserted % 100 === 0) {
                    console.log(`[progress] processed=${inserted}/${resumes.length}`);
                }
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        }

        console.log("[done] inserted evaluations =", inserted);
        console.log("[done] run_id =", runId);
        console.log("Next: check results with SQL below");
        console.log(`Top: SELECT resume_id, total_score FROM evaluations WHERE vacancy_id='${VACANCY_ID}' AND run_id='${runId}' ORDER BY total_score DESC LIMIT 20;`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error("[error]", e);
    process.exit(1);
});

