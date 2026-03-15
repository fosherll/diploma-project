import { withClient } from "../db.js";
import { notFound } from "../utils/httpErrors.js";
export default async function vacanciesRoutes(app) {
    app.get("/", {
        schema: {
            querystring: {
                type: "object",
                properties: {
                    limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
                    offset: { type: "integer", minimum: 0, default: 0 }
                }
            }
        }
    },
        async (req) => {
            const { limit = 20, offset = 0 } = req.query;

        return await withClient(async (client) => {
            const { rows } = await client.query(
                "SELECT id, title, location, employment_type FROM vacancies ORDER BY id DESC LIMIT $1 OFFSET $2",
                [limit, offset]
            );
            return rows;
        });
    });

    app.get("/:vacancyId", {
        schema: {
            params: {
                type: "object",
                required: ["vacancyId"],
                properties: {
                    vacancyId: { type: "string", minLength: 1 }
                }
            }
        }
    },
        async (req) => {
        const { vacancyId } = req.params;
        return await withClient(async (client) => {
            const { rows } = await client.query("SELECT * FROM vacancies WHERE id=$1", [String(vacancyId)]);
            if (!rows[0]) {
                throw notFound("Vacancy not found", { vacancyId: String(vacancyId) });
            }

            if (!rows[0]) {
                throw notFound("Vacancy not found", { vacancyId: String(vacancyId) });
            }

            return rows[0];
        });
    });
}