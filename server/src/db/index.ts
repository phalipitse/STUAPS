import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/recon_dev";

// Small pool cap: in a serverless deployment each warm function instance holds
// its own pool, and a serverless-tier Postgres (e.g. Neon free tier) caps total
// concurrent connections — a handful of instances at the default max (10) would
// exhaust that quickly.
export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 5),
});

export const db = drizzle(pool, { schema });
