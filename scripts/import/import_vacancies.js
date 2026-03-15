import fs from "fs";
import readline from "readline";
import pg from "pg";
import "dotenv/config";

const FILE_PATH = process.env.JSONL_PATH || "E:/Диплом/vacances/batch1.jsonl";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const client = await pool.connect();
    try {
        console.log("[import] file:", FILE_PATH);

        const rl = readline.createInterface({
            input: fs.createReadStream(FILE_PATH, { encoding: "utf8" }),
            crlfDelay: Infinity
        });

        let ok = 0;
        let bad = 0;

        // батч, чтобы не делать insert по одной строке
        const okBatch = [];
        const badBatch = [];
        const FLUSH_EVERY = 500;

        async function flush() {
            if (okBatch.length) {
                const values = okBatch.map((_, i) => `($${i + 1}::jsonb)`).join(",");
                const params = okBatch;
                await client.query(`insert into vacancies_raw(data) values ${values}`, params);
                okBatch.length = 0;
            }
            if (badBatch.length) {
                const values = badBatch.map((_, i) => `($${i + 1})`).join(",");
                const params = badBatch;
                await client.query(`insert into vacancies_bad(line) values ${values}`, params);
                badBatch.length = 0;
            }
        }

        for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // убираем реальные переносы (на всякий)
            const safe = trimmed.replace(/\r/g, "").replace(/\n/g, "\\n");

            try {
                // JSON.parse проверит валидность
                const obj = JSON.parse(safe);
                okBatch.push(JSON.stringify(obj));
                ok++;
            } catch (e) {
                badBatch.push(trimmed.slice(0, 20000)); // ограничим размер строки в БД
                bad++;
            }

            if ((ok + bad) % FLUSH_EVERY === 0) {
                await flush();
                console.log(`[import] processed=${ok + bad} ok=${ok} bad=${bad}`);
            }
        }

        await flush();
        console.log(`[import] DONE processed=${ok + bad} ok=${ok} bad=${bad}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});