/**
 * Imports HuggingFace vacancies and resumes (that were processed by the skills pipeline)
 * into our vacancies/resumes tables and creates mapping links.
 *
 * Usage (from scripts/import/):
 *   $env:DATABASE_URL="postgres://diploma:diploma@localhost:5432/diploma_db"
 *   node import_hf_data.mjs
 */
import fs from "fs";
import readline from "readline";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VAC_PIPELINE = "E:/Диплом/skills2-main-extracted/skills2-main/output/vac_200_fuzzy.jsonl";
const CV_PIPELINE  = "E:/Диплом/skills2-main-extracted/skills2-main/output/cv_200_fuzzy.jsonl";
const VAC_NDJSON   = "C:/Users/foshe/.cache/huggingface/hub/datasets--KSE-RESEARCH-Group--Work_UA_vacancies/snapshots/7613690629d81f34eccc5bb7c76d02aaa66cd39d/vacancies.ndjson";
const CV_NDJSON    = "C:/Users/foshe/.cache/huggingface/hub/datasets--KSE-RESEARCH-Group--Work_UA_resumes/snapshots/7c3b6df1d74721f1ef102e49a581e08a804b21bd/resumes.ndjson";

async function readPipelineIds(filePath) {
    const ids = new Set();
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf-8" }) });
    for await (const line of rl) {
        if (!line.trim()) continue;
        const doc = JSON.parse(line);
        if (doc.document_id) ids.add(String(doc.document_id));
    }
    return ids;
}

async function readNdjsonByIds(filePath, ids) {
    const rows = new Map();
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf-8" }) });
    for await (const line of rl) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        const id = String(row.id || "");
        if (ids.has(id)) rows.set(id, row);
    }
    return rows;
}

async function main() {
    const client = await pool.connect();
    try {
        console.log("[import_hf_data] Starting...");

        // --- Vacancies ---
        console.log("[vacancies] Reading pipeline IDs...");
        const vacIds = await readPipelineIds(VAC_PIPELINE);
        console.log(`[vacancies] ${vacIds.size} IDs from pipeline`);

        console.log("[vacancies] Loading from HuggingFace cache...");
        const vacRows = await readNdjsonByIds(VAC_NDJSON, vacIds);
        console.log(`[vacancies] ${vacRows.size} records found in cache`);

        let vacInserted = 0, vacLinked = 0;
        for (const [id, row] of vacRows) {
            const skills = Array.isArray(row.skills) ? row.skills : [];
            const payload = { skills, employment_type: row.employment_type, is_remote: row.is_remote, company_id: row.company_id };
            await client.query(
                `INSERT INTO vacancies (id, title, location, employment_type, description_text, payload)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                 ON CONFLICT (id) DO NOTHING`,
                [id, row.title || "", row.location_details || "", row.employment_type || "", row.description_text || "", JSON.stringify(payload)]
            );
            vacInserted++;

            await client.query(
                `INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
                 VALUES ($1, $2)
                 ON CONFLICT (vacancy_id) DO NOTHING`,
                [id, id]
            );
            vacLinked++;
        }
        console.log(`[vacancies] inserted=${vacInserted}, links=${vacLinked}`);

        // --- Resumes ---
        console.log("[resumes] Reading pipeline IDs...");
        const cvIds = await readPipelineIds(CV_PIPELINE);
        console.log(`[resumes] ${cvIds.size} IDs from pipeline`);

        console.log("[resumes] Loading from HuggingFace cache...");
        const cvRows = await readNdjsonByIds(CV_NDJSON, cvIds);
        console.log(`[resumes] ${cvRows.size} records found in cache`);

        let cvInserted = 0, cvLinked = 0;
        for (const [id, row] of cvRows) {
            const skills = Array.isArray(row.skills) ? row.skills.join(", ") : "";
            const markdown = [
                row.title ? `# ${row.title}` : "",
                row.city ? `**Місто:** ${row.city}` : "",
                row.desired_salary ? `**Зарплата:** ${row.desired_salary}` : "",
                skills ? `**Навички:** ${skills}` : "",
                row.additional_info ? `\n${row.additional_info}` : "",
            ].filter(Boolean).join("\n");

            await client.query(
                `INSERT INTO resumes (id, title, candidate_name, city, desired_salary, employment_type, age, markdown)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO NOTHING`,
                [id, row.title || "", row.candidate_name || "", row.city || "",
                 String(row.desired_salary || ""), row.employment_type || "",
                 row.age || null, markdown]
            );
            cvInserted++;

            await client.query(
                `INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
                 VALUES ($1, $2)
                 ON CONFLICT (resume_id) DO NOTHING`,
                [id, id]
            );
            cvLinked++;
        }
        console.log(`[resumes] inserted=${cvInserted}, links=${cvLinked}`);

        console.log("[import_hf_data] DONE");
    } catch (err) {
        console.error("[error]", err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
