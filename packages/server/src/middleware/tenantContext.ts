import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { API_PREFIX } from "@application/shared";
import { pool, tenantContextStorage } from "../db";
import { ApiError } from "../utils/errors";

/**
 * Pins an RLS tenant to a dedicated connection for the rest of the request.
 *
 * Two callers derive the tenant differently: `setTenantContext` takes it from
 * the verified JWT, `shareTenantContext` from an unguessable share token. The
 * transaction/cleanup machinery below is identical for both, so it lives here.
 */
export async function runInTenantContext(
  req: Request,
  res: Response,
  next: NextFunction,
  orgId: string,
  userId: string,
): Promise<void> {
  // Never nest: if an outer middleware already pinned a tenant, reuse it.
  if (tenantContextStorage.getStore()) {
    return next();
  }

  // Dedicated connection for the lifetime of this request. RLS's
  // `SET LOCAL app.current_tenant` only survives within a single
  // transaction on a single connection — it must NOT be released back to
  // the pool (and reused by another request) until this request finishes.
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    // Pool exhaustion or bad APP_DATABASE_URL credentials land here. Log the
    // real driver error: errorHandler masks 5xx bodies in production, so this
    // is the only place the cause is recoverable from.
    req.log?.error({ error, orgId }, "Failed to acquire tenant connection");
    return next(ApiError.internal("Database unavailable"));
  }

  try {
    await client.query("BEGIN");
    // Sets both the tenant scope and the requesting user's own id. The
    // latter is used by users_tenant_isolation's self-visibility branch
    // (a user can see their own row even before joining an org) without
    // exposing every other tenant's unassigned users — see migration
    // 0002_narrow_users_tenant_isolation.sql.
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true), set_config('app.current_user_id', $2, true)",
      [orgId, userId]
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    req.log?.error({ error, orgId }, "Failed to set tenant context");
    return next(ApiError.internal("Failed to set tenant context"));
  }

  const tx = drizzle(client, { schema: (await import("../db/schema")) as any });

  let finished = false;
  const cleanup = async (commit: boolean) => {
    if (finished) return;
    finished = true;
    try {
      await client.query(commit ? "COMMIT" : "ROLLBACK");
    } catch (err) {
      req.log?.warn({ err, orgId }, "Failed to finalize tenant transaction");
    } finally {
      client.release();
    }
  };

  // Commit on a normal response completion; roll back if the connection
  // errors out mid-request so a half-finished transaction never lingers.
  res.on("finish", () => void cleanup(true));
  res.on("close", () => void cleanup(res.writableFinished));
  client.on("error", () => void cleanup(false));

  tenantContextStorage.run(tx, () => next());
}

/**
 * Routes that must never pin a pooled connection, because their response does
 * not end: `runInTenantContext` releases its client on `res.on("finish")`, and
 * a stream never finishes. One open browser tab would hold one connection —
 * and one open transaction, which also blocks autovacuum — for as long as the
 * tab stays open, so ~10 tabs exhaust the default pool (DB_POOL_MAX = 10) and
 * every other request then waits for a connection that is not coming back.
 *
 * Raising the pool size is not the fix; it only moves the cliff.
 *
 * ⚠️ A handler on this list runs with NO tenant context. `app.current_tenant`
 * is unset, so any RLS-scoped query it makes matches **zero rows silently** —
 * no error, no exception, just empty results. If you add a database read to
 * one of these handlers, either fetch it in a normal request before the
 * stream opens, or wrap it in `runInBackgroundTenantContext(orgId, userId, fn)`
 * from `db/backgroundTenantContext.ts`.
 *
 * Full paths, matched against `req.path` — this middleware is app-level, so it
 * sees the API prefix. Keep in sync with the route declarations; the
 * accompanying test asserts each entry still resolves to a mounted route.
 */
export const TENANT_CONTEXT_EXEMPT_PATHS: readonly string[] = [
  // GET /notifications/stream — SSE. Needs req.user.id (attachUser has already
  // set it) and Redis pub/sub, and runs no database query at all.
  `${API_PREFIX}/notifications/stream`,
];

export const isTenantContextExempt = (path: string): boolean =>
  TENANT_CONTEXT_EXEMPT_PATHS.includes(path);

/**
 * Tenant context for authenticated requests. Depends on `attachUser` having
 * populated req.user earlier in the app-level chain — `requireAuth` runs later,
 * inside the routers, which is too late for this middleware.
 */
export async function setTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = req.user?.organizationId;
  if (!orgId) return next();

  // Checked before acquiring anything — see TENANT_CONTEXT_EXEMPT_PATHS.
  if (isTenantContextExempt(req.path)) return next();

  return runInTenantContext(req, res, next, orgId, req.user?.id ?? "");
}