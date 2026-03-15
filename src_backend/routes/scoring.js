import { withClient } from "../db.js";
import { runScoring } from "../services/scoringService.js";
import { ensureDefaultCriteria } from "../services/criteriaBootstrapService.js";
import { badRequest } from "../utils/httpErrors.js";

export default async function scoringRoutes(app) {
    app.post("/:vacancyId/score", {
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
                    analyzeCount: { type: "integer", minimum: 1, maximum: 10000 }
                },
                additionalProperties: true
            }
        }
    }, async (req) => {
        const { vacancyId } = req.params;

        const analyzeCountRaw = req.body?.analyzeCount;

        if (
            analyzeCountRaw !== undefined &&
            (!Number.isInteger(analyzeCountRaw) || analyzeCountRaw <= 0)
        ) {
            throw badRequest("analyzeCount must be a positive integer");
        }

        const analyzeCount = analyzeCountRaw ?? 100;

        return await withClient(async (client) => {
            const bootstrap = await ensureDefaultCriteria(client, vacancyId);
            const res = await runScoring(client, {
                vacancyId,
                analyzeCount
            });

            return {
                ok: true,
                ...res,
                analyzeCount,
                criteriaBootstrapped: bootstrap.created,
                criteriaCountAfterBootstrap: bootstrap.count
            };
        });
    });
}