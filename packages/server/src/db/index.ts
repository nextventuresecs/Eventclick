import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
});

export const authPool = env.AUTH_DATABASE_URL
  ? new Pool({
      connectionString: env.AUTH_DATABASE_URL,
      max: Math.max(2, Math.floor((env.DB_POOL_MAX || 10) / 2)),
      idleTimeoutMillis: 30_000,
    })
  : pool;

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === "development" });
export const authDb = env.AUTH_DATABASE_URL
  ? drizzle(authPool, { schema, logger: env.NODE_ENV === "development" })
  : db;

export type Database = typeof db;
export { schema };
