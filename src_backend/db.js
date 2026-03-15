import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in .env");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function withClient(fn) {
    const client = await pool.connect();
    try {
        return await fn(client);
    } finally {
        client.release();
    }
}