import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/recon_dev";

export const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema });
