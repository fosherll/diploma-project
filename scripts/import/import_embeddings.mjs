import fs from "fs";
import readline from "readline";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function importEscoEmbeddings(client, filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`[skip] file not found: ${filePath}`);
        return 0;
    }
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
    });
    let count = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        const embeddingStr = `[${row.embedding.join(",")}]`;
        await client.query(
            `INSERT INTO esco_skill_embeddings (esco_uri, esco_label, embedding, model_name, semantic_group)
             VALUES ($1, $2, $3::vector, $4, $5)
             ON CONFLICT (esco_uri) DO UPDATE SET
                 esco_label = EXCLUDED.esco_label,
                 embedding = EXCLUDED.embedding,
                 model_name = EXCLUDED.model_name,
                 semantic_group = EXCLUDED.semantic_group`,
            [row.esco_uri, row.esco_label, embeddingStr, row.model_name || "all-MiniLM-L6-v2", row.semantic_group || null]
        );
        count++;
    }
    return count;
}

async function importSkillMappingsWithEmbeddings(client, filePath, tableName) {
    if (!fs.existsSync(filePath)) {
        console.log(`[skip] file not found: ${filePath}`);
        return 0;
    }
    const unmappedTable = tableName.replace("_skill_mappings", "_unmapped_skills");
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
    });
    let count = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const doc = JSON.parse(line);
        const documentId = String(doc.document_id ?? "");
        const metadata = doc.metadata ?? {};
        const mappings = [
            ...(Array.isArray(doc.direct_mappings) ? doc.direct_mappings : []),
            ...(Array.isArray(doc.graph_mappings) ? doc.graph_mappings : []),
        ];
        for (const item of mappings) {
            const embeddingArr = item.embedding;
            const embeddingStr = embeddingArr ? `[${embeddingArr.join(",")}]` : null;
            const reasoning =
                typeof item.details === "string" ? item.details
                    : typeof item.details?.reasoning === "string" ? item.details.reasoning
                        : null;
            await client.query(
                `INSERT INTO ${tableName}
                    (document_id, raw_skill, esco_uri, esco_label, confidence,
                     method, via_graph, reasoning, details, metadata, embedding)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::vector)`,
                [documentId, item.raw_skill ?? null, item.esco_uri ?? null,
                    item.esco_label ?? null, item.confidence ?? null,
                    item.method ?? null, Boolean(item.via_graph), reasoning,
                    JSON.stringify(item.details ?? {}), JSON.stringify(metadata), embeddingStr]
            );
            count++;
        }
        const unmapped = Array.isArray(doc.unmapped_skills) ? doc.unmapped_skills : [];
        for (const rawSkill of unmapped) {
            await client.query(
                `INSERT INTO ${unmappedTable} (document_id, raw_skill, metadata)
                 VALUES ($1, $2, $3::jsonb)`,
                [documentId, String(rawSkill), JSON.stringify(metadata)]
            );
        }
    }
    return count;
}

async function updateEmbeddingsFromEscoTable(client, tableName) {
    const result = await client.query(
        `UPDATE ${tableName} AS m
         SET embedding = e.embedding
         FROM esco_skill_embeddings AS e
         WHERE m.esco_uri = e.esco_uri AND m.embedding IS NULL`
    );
    return result.rowCount;
}

async function main() {
    const client = await pool.connect();
    try {
        console.log("[import_embeddings] Starting...");
        await client.query("BEGIN");

        const escoCount = await importEscoEmbeddings(client, "./data/esco_embeddings.jsonl");
        console.log(`[esco_embeddings] imported: ${escoCount}`);

        await client.query("DELETE FROM cv_skill_mappings");
        await client.query("DELETE FROM vac_skill_mappings");
        await client.query("DELETE FROM cv_unmapped_skills");
        await client.query("DELETE FROM vac_unmapped_skills");
        console.log("[cleanup] cleared old skill mappings");

        const cvCount = await importSkillMappingsWithEmbeddings(client, "./data/cv_results_with_embeddings.jsonl", "cv_skill_mappings");
        console.log(`[cv_skill_mappings] imported: ${cvCount}`);

        const vacCount = await importSkillMappingsWithEmbeddings(client, "./data/vac_results_with_embeddings.jsonl", "vac_skill_mappings");
        console.log(`[vac_skill_mappings] imported: ${vacCount}`);

        const cvUpdated = await updateEmbeddingsFromEscoTable(client, "cv_skill_mappings");
        const vacUpdated = await updateEmbeddingsFromEscoTable(client, "vac_skill_mappings");
        console.log(`[backfill] cv=${cvUpdated}, vac=${vacUpdated}`);

        await client.query("COMMIT");
        console.log("[import_embeddings] DONE");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[error]", err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });