import fs from "fs";
import readline from "readline";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function getReasoning(details) {
    if (!details) return null;
    if (typeof details === "string") return details;
    if (typeof details.reasoning === "string") return details.reasoning;
    return null;
}

async function importFile({
                              filePath,
                              mappingTable,
                              unmappedTable
                          }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: "utf-8" }),
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!line.trim()) continue;

            const row = JSON.parse(line);

            const documentId = String(row.document_id ?? "");
            const metadata = row.metadata ?? {};

            const mappings = [
                ...(Array.isArray(row.direct_mappings) ? row.direct_mappings : []),
                ...(Array.isArray(row.graph_mappings) ? row.graph_mappings : [])
            ];

            for (const item of mappings) {
                await client.query(
                    `INSERT INTO ${mappingTable}
                    (document_id, raw_skill, esco_uri, esco_label, confidence, method, via_graph, reasoning, details, metadata)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
                    [
                        documentId,
                        item.raw_skill ?? null,
                        item.esco_uri ?? null,
                        item.esco_label ?? null,
                        item.confidence ?? null,
                        item.method ?? null,
                        Boolean(item.via_graph),
                        getReasoning(item.details),
                        JSON.stringify(item.details ?? {}),
                        JSON.stringify(metadata)
                    ]
                );
            }

            const unmapped = Array.isArray(row.unmapped_skills) ? row.unmapped_skills : [];
            for (const rawSkill of unmapped) {
                await client.query(
                    `INSERT INTO ${unmappedTable}
                    (document_id, raw_skill, metadata)
                    VALUES ($1,$2,$3::jsonb)`,
                    [
                        documentId,
                        String(rawSkill),
                        JSON.stringify(metadata)
                    ]
                );
            }
        }

        await client.query("COMMIT");
        console.log(`Imported: ${filePath}`);
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    await importFile({
        filePath: "./data/cv_results_weight_llm_two_stage.jsonl",
        mappingTable: "cv_skill_mappings",
        unmappedTable: "cv_unmapped_skills"
    });

    await importFile({
        filePath: "./data/vac_results_weight_llm_two_stage.jsonl",
        mappingTable: "vac_skill_mappings",
        unmappedTable: "vac_unmapped_skills"
    });

    await pool.end();
    console.log("DONE");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});