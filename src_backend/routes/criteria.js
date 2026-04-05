import { withClient } from "../db.js";
import { badRequest } from "../utils/httpErrors.js";
import { suggestWeights } from "../services/autoWeightsService.js";
export default async function criteriaRoutes(app) {
    app.get("/:vacancyId/criteria", {
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
                "SELECT id, vacancy_id, name, weight, calc_type, config, is_enabled FROM criteria WHERE vacancy_id=$1 ORDER BY id",
                [String(vacancyId)]
            );
            return rows;
        });
    });

    app.put("/:vacancyId/criteria", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            },
            body: {
                type: "object",
                required: ["items"],
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            required: ["name", "weight", "calc_type"],
                            properties: {
                                name: { type: "string", minLength: 1 },
                                weight: { type: "number" },
                                calc_type: { type: "string", minLength: 1 },
                                config: { type: "object", additionalProperties: true },
                                is_enabled: { type: "boolean" }
                            }
                        }
                    }
                }
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;
        const items = req.body.items;

        if (!Array.isArray(items)) {
            throw badRequest("body.items must be array");
        }

        return await withClient(async (client) => {
            await client.query("BEGIN");
            try {
                await client.query("DELETE FROM criteria WHERE vacancy_id=$1", [String(vacancyId)]);

                for (const it of items) {
                    const normalizedEnabled = Boolean(it.is_enabled);
                    const normalizedConfig = {
                        ...(it.config ?? {}),
                        required: normalizedEnabled ? Boolean(it?.config?.required) : false
                    };

                    await client.query(
                        `INSERT INTO criteria (vacancy_id, name, weight, calc_type, config, is_enabled)
                         VALUES ($1,$2,$3,$4,$5::jsonb, $6)`,
                        [
                            String(vacancyId),
                            it.name ?? "",
                            Number(it.weight ?? 1),
                            it.calc_type ?? "custom",
                            JSON.stringify(normalizedConfig),
                            normalizedEnabled
                        ]
                    );
                }

                await client.query("COMMIT");
                return { ok: true, count: items.length };
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        });
    });

    app.post("/:vacancyId/criteria/auto-weights", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            },
            body: {
                type: "object",
                properties: {
                    calcTypes: { type: "array", items: { type: "string" } }
                }
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;
        const { calcTypes = [] } = req.body;

        return await withClient(async (client) => {
            const { rows } = await client.query(
                "SELECT title, description_text FROM vacancies WHERE id=$1",
                [String(vacancyId)]
            );
            if (!rows[0]) throw badRequest("Vacancy not found");

            try {
                const weights = await suggestWeights(
                    rows[0].title || "",
                    rows[0].description_text || "",
                    calcTypes
                );
                return { weights };
            } catch (err) {
                throw badRequest(err.message || "Failed to suggest weights");
            }
        });
    });
}