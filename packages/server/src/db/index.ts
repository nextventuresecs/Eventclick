import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "async_hooks";
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

// Base drizzle instance bound to the plain pool. Used for anything running
// outside a tenant-scoped request: migrations, background jobs (SQS worker,
// session cleanup), health checks, and any request where no org context
// applies yet (e.g. pre-auth routes).
const basePoolDb = drizzle(pool, { schema, logger: env.NODE_ENV === "development" });

export const authDb = env.AUTH_DATABASE_URL
  ? drizzle(authPool, { schema, logger: env.NODE_ENV === "development" })
  : basePoolDb;

// ── Tenant-scoped request context ──────────────────────────────────────
// RLS depends on `current_setting('app.current_tenant', true)`, which is
// SET LOCAL (transaction-scoped). Under connection pooling, a bare
// `db.execute(SELECT set_config(...))` outside a transaction loses that
// setting the instant the call returns — the next query grabs a *different*
// pooled connection with no tenant context, so RLS policies silently match
// nothing (or worse, a reused connection could retain stale context from a
// prior request). See tenantContext.ts for where this is populated.
//
// tenantContextStorage holds the per-request drizzle instance, bound to the
// single dedicated connection that has BEGIN + SET LOCAL app.current_tenant
// applied for the lifetime of that request. Every downstream `db.<method>`
// call within that request transparently proxies to it via the Proxy below —
// no caller needs to change how it imports or uses `db`.
export const tenantContextStorage = new AsyncLocalStorage<NodePgDatabase<typeof schema>>();

export const db = new Proxy(basePoolDb, {
  get(target, prop, receiver) {
    const scoped = tenantContextStorage.getStore();
    const active = scoped ?? target;
    return Reflect.get(active, prop, receiver);
  },
}) as NodePgDatabase<typeof schema>;

export type Database = typeof db;
export { schema };