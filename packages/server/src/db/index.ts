import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "production" ? 20 : 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === "development" });

export type Database = typeof db;
export { schema };
