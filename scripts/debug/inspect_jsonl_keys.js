// import_resumes.js
// Usage:
//   node import_resumes.js "E:\Диплом\resumes\resumes_batch_001.jsonl" 1000
// де 1000 — розмір пачки (опціонально)

require("dotenv").config();

const fs = require("fs");
const readline = require("readline");
const { Pool } = require("pg");

const FILE = process.argv[2];
const BATCH_SIZE = Number(process.argv[3] || 500);

if (!FILE) {
    console.error('Usage: node import_resumes.js "<path_to_jsonl>" [batchSize]');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// приведення типів під ключі
function toInt(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "так", "да"].includes(s)) return true;
    if (["false", "0", "no", "n", "ні", "нет"].includes(s)) return false;
    return null;
}

function toDate(v) {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString(); // ISO строка
}

async function ensureSchema(client) {
    await client.query(`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      url TEXT,
      title TEXT,
      candidate_name TEXT,
      age INT,
      city TEXT,
      desired_salary TEXT,
      employment_type TEXT,
      work_location_preference TEXT,
      driver_license TEXT,
      own_car BOOLEAN,
      creation_date TIMESTAMP,
      markdown TEXT,
      other_resumes JSONB,
      raw_html TEXT
    );
  `);

    await client.query(`
    CREATE INDEX IF NOT EXISTS resumes_creation_date_idx
    ON resumes (creation_date);
  `);
}

function buildInsert(rows) {
    const cols = [
        "id",
        "url",
        "title",
        "candidate_name",
        "age",
        "city",
        "desired_salary",
        "employment_type",
        "work_location_preference",
        "driver_license",
        "own_car",
        "creation_date",
        "markdown",
        "other_resumes",
        "raw_html",
    ];

    const values = [];
    const placeholders = [];

    let p = 1;
    for (const r of rows) {
        const rowPlaceholders = [];
        for (const c of cols) {
            values.push(r[c]);
            rowPlaceholders.push(`$${p++}`);
        }
        placeholders.push(`(${rowPlaceholders.join(", ")})`);
    }

    const updates = cols
        .filter((c) => c !== "id")
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(", ");

    const sql = `
    INSERT INTO resumes (${cols.join(", ")})
    VALUES ${placeholders.join(",\n")}
    ON CONFLICT (id) DO UPDATE SET
      ${updates};
  `;

    return { sql, values };
}

async function flushBatch(client, batch) {
    if (!batch.length) return { inserted: 0 };

    const { sql, values } = buildInsert(batch);
    await client.query("BEGIN");
    try {
        await client.query(sql, values);
        await client.query("COMMIT");
        return { inserted: batch.length };
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
}

async function main() {
    const client = await pool.connect();
    try {
        await ensureSchema(client);

        const rl = readline.createInterface({
            input: fs.createReadStream(FILE, { encoding: "utf8" }),
            crlfDelay: Infinity,
        });

        let ok = 0;
        let bad = 0;
        let total = 0;
        let batch = [];
        const startedAt = Date.now();

        for await (const line of rl) {
            const s = line.trim();
            if (!s) continue;
            total++;

            let obj;
            try {
                obj = JSON.parse(s);
            } catch {
                bad++;
                continue;
            }

            if (!obj.id) {
                bad++;
                continue;
            }

            const row = {
                id: String(obj.id),
                url: obj.url ?? null,
                title: obj.title ?? null,
                candidate_name: obj.candidate_name ?? null,
                age: toInt(obj.age),
                city: obj.city ?? null,
                desired_salary: obj.desired_salary ?? null,
                employment_type: obj.employment_type ?? null,
                work_location_preference: obj.work_location_preference ?? null,
                driver_license: obj.driver_license ?? null,
                own_car: toBool(obj.own_car),
                creation_date: toDate(obj.creation_date),
                markdown: obj.markdown ?? null,
                other_resumes: obj.other_resumes ? JSON.stringify(obj.other_resumes) : null,
                raw_html: obj.raw_html ?? null,
            };

            batch.push(row);
            ok++;

            if (batch.length >= BATCH_SIZE) {
                await flushBatch(client, batch);
                batch = [];

                if (ok % (BATCH_SIZE * 5) === 0) {
                    const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
                    console.log(`[progress] ok=${ok} bad=${bad} total=${total} time=${sec}s`);
                }
            }
        }

        if (batch.length) {
            await flushBatch(client, batch);
        }

        const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[done] ok=${ok} bad=${bad} total=${total} time=${sec}s`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error("[error]", e);
    process.exit(1);
});