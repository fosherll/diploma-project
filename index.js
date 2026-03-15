import Fastify from "fastify";
import cors from "@fastify/cors";
import env from "@fastify/env";
import pg from "pg";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(env, {
    schema: {
        type: "object",
        required: ["DATABASE_URL"],
        properties: {
            DATABASE_URL: { type: "string" }
        }
    },
    dotenv: true
});

const pool = new pg.Pool({
    connectionString: app.config.DATABASE_URL
});

app.get("/health", async () => {
    return { ok: true };
});

app.listen({ port: 3000, host: "0.0.0.0" });