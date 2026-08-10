import type { Request, Response, NextFunction } from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool, tenantContextStorage } from "../db";
import { ApiError } from "../utils/errors";

export async function setTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = req.user?.organizationId;

  if (!orgId) {
    return next();
  }

  // Dedicated connection for the lifetime of this request. RLS's
  // `SET LOCAL app.current_tenant` only survives within a single
  // transaction on a single connection — it must NOT be released back to
  // the pool (and reused by another request) until this request finishes.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [orgId]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    req.log?.warn({ error, orgId }, "Failed to set tenant context");
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