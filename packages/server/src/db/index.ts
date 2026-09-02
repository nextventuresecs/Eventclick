import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { AsyncLocalStorage } from "async_hooks";
import { env } from "../config/env";
import * as schema from "./schema";

/**
 * Server-side timeouts, applied per connection at session start.
 *
 * Deliberately set here rather than with `ALTER ROLE ... SET`: the runtime
 * pools are the only connections built from this module, so the migration and
 * tooling connection (`DATABASE_URL`, used by `db/migrate.ts` and
 * `drizzle.config.ts`) is excluded *structurally* — there is no role list to
 * keep correct, and no way to accidentally time out a migration that is
 * legitimately rewriting a table for minutes. It also needs no privilege:
 * `ALTER ROLE` on another role requires superuser, which the migration
 * credential is not guaranteed to hold.
 *
 * - statement_timeout: a query that outruns a web request is already a
 *   failure. Cancel it (SQLSTATE 57014) instead of letting it hold a
 *   connection.
 * - idle_in_transaction_session_timeout: an abandoned transaction pins a
 *   connection *and* blocks autovacuum. Safe to enforce only because the SSE
 *   stream no longer opens a hours-long transaction (see #78 /
 *   TENANT_CONTEXT_EXEMPT_PATHS) — it would have been killed by this.
 */
const sessionOptions = [
  `-c statement_timeout=${env.DB_STATEMENT_TIMEOUT}`,
  `-c idle_in_transaction_session_timeout=${env.DB_IDLE_TX_TIMEOUT}`,
].join(" ");

export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  // Bounds the wait for a free connection. Without it `pool.connect()` never
  // rejects, so tenantContext's error path is unreachable and exhaustion
  // presents as an unexplained 30s hang instead of a logged failure.
  connectionTimeoutMillis: env.DB_ACQUIRE_TIMEOUT_MS,
  options: sessionOptions,
});

export const authPool = env.AUTH_DATABASE_URL
  ? new Pool({
      connectionString: env.AUTH_DATABASE_URL,
      max: Math.max(2, Math.floor((env.DB_POOL_MAX || 10) / 2)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: env.DB_ACQUIRE_TIMEOUT_MS,
      options: sessionOptions,
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

// Postgres interval literal — digits plus a unit, nothing else. The value is
// operator-supplied via env and is interpolated raw below (SET does not take
// bind parameters), so it is validated rather than trusted.
const INTERVAL_PATTERN = /^\d+(ms|s|min|h)?$/;

/**
 * Runs `fn` in a transaction whose statement_timeout is raised to
 * DB_JOB_STATEMENT_TIMEOUT.
 *
 * The pool default (DB_STATEMENT_TIMEOUT, 15s) is sized for web requests. A
 * background job doing bulk deletes over a year of rows legitimately outruns
 * it and would be cancelled with SQLSTATE 57014. The fix is for that one job
 * to raise the limit for its own session — not to loosen the default for
 * every request in the process, which is what makes a 15s ceiling worth
 * having at all.
 *
 * SET LOCAL, so the raised limit dies with the transaction and cannot leak
 * back into the pool for the next borrower.
 */
export const withJobStatementTimeout = async <T>(
  database: NodePgDatabase<typeof schema>,
  fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> => {
  const timeout = env.DB_JOB_STATEMENT_TIMEOUT;
  if (!INTERVAL_PATTERN.test(timeout)) {
    throw new Error(`Invalid DB_JOB_STATEMENT_TIMEOUT: ${timeout}`);
  }

  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${timeout}'`));
    return fn(tx as unknown as NodePgDatabase<typeof schema>);
  });
};

export { schema };