import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { fileURLToPath } from "node:url";

import vacanciesRoutes from "./routes/vacancies.js";
import criteriaRoutes from "./routes/criteria.js";
import scoringRoutes from "./routes/scoring.js";
import resultsRoutes from "./routes/results.js";
import { badRequest } from "./utils/httpErrors.js";
export function buildApp() {
    const app = Fastify({ logger: true });

    app.register(cors, {
        origin: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    });

    app.setErrorHandler((error, req, reply) => {
        if (error.validation) {
            return reply.code(400).send({
                ok: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Request validation failed",
                    details: error.validation
                }
            });
        }

        const statusCode =
            Number.isInteger(error.statusCode) && error.statusCode >= 400
                ? error.statusCode
                : 500;

        return reply.code(statusCode).send({
            ok: false,
            error: {
                code: error.code || "INTERNAL_ERROR",
                message: error.message || "Internal server error",
                details: error.details ?? null
            }
        });
    });

    app.get("/health", async () => ({ ok: true }));

    app.register(vacanciesRoutes, { prefix: "/vacancies" });
    app.register(criteriaRoutes, { prefix: "/vacancies" });
    app.register(scoringRoutes, { prefix: "/vacancies" });
    app.register(resultsRoutes, { prefix: "/vacancies" });

    app.setNotFoundHandler((req, reply) => {
        return reply.code(404).send({
            ok: false,
            error: {
                code: "NOT_FOUND",
                message: "Route not found",
                details: null
            }
        });
    });

    return app;
}

async function start() {
    const app = buildApp();
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || "0.0.0.0";

    try {
        const address = await app.listen({ port, host });
        app.log.info(`listening on ${address}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    start();
}