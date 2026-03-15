import fs from "fs";
import readline from "readline";
import pg from "pg";
import "dotenv/config";

const FILE = process.env.HTML_JSONL_PATH || "E:/Диплом/vacances/batch1_html_only.jsonl";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const client = await pool.connect();
    try {
        console.log("[html-import] file:", FILE);

        // upsert
        const upsertSql = `
      insert into vacancies_html(id, url, raw_html)
      values ($1, $2, $3)
      on conflict (id) do update
      set url = excluded.url,
          raw_html = excluded.raw_html
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
                const obj = JSON.parse(s); // важно: файл должен быть реально JSONL (1 объект = 1 строка)
                const id = Number(obj.id);
                if (!Number.isFinite(id)) throw new Error("bad id");

                await client.query(upsertSql, [id, obj.url ?? null, obj.raw_html ?? null]);
                ok++;
            } catch (e) {
                bad++;
                // если хочешь — можно логировать первые ошибки
                if (bad <= 5) console.log("[html-import] bad line sample:", s.slice(0, 120));
            }

            processed++;
            if (processed % 1000 === 0) {
                await client.query("commit");
                await client.query("begin");
                console.log(`[html-import] processed=${processed} ok=${ok} bad=${bad}`);
            }
        }

        await client.query("commit");
        console.log(`[html-import] DONE processed=${processed} ok=${ok} bad=${bad}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});