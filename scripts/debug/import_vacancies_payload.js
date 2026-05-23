import fs from "fs";
import readline from "readline";
import pg from "pg";
import "dotenv/config";

const FILE = process.env.VACANCIES_JSONL_PATH || "E:/Диплом/vacances/batch1.jsonl";
const SOURCE = "batch1.jsonl";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const client = await pool.connect();
    try {
        console.log("[import-payload] file:", FILE);

        const sql = `
      insert into vacancies_raw (source_file, payload)
      values ($1, $2::jsonb)
    `;

        const rl = readline.createInterface({
            input: fs.createReadStream(FILE, { encoding: "utf8" }),
            crlfDelay: Infinity,
        });

        let processed = 0;
        let ok = 0;
        let bad = 0;

        await client.query("begin");

        for await (const line of rl) {
            const s = line.trim();
            if (!s) continue;

            try {
                JSON.parse(s);
                await client.query(sql, [SOURCE, s]);
                ok++;
            } catch {
                bad++;
            }

            processed++;
            if (processed % 500 === 0) {
                await client.query("commit");
                await client.query("begin");
                console.log(`[import-payload] processed=${processed} ok=${ok} bad=${bad}`);
            }
        }

        await client.query("commit");
        console.log(`[import-payload] DONE processed=${processed} ok=${ok} bad=${bad}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});