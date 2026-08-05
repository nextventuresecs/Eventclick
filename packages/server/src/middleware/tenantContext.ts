import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { ApiError } from "../utils/errors";

export async function setTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const orgId = req.user?.organizationId;

  if (!orgId) {
    return next();
  }

  try {
    await db.execute(sql`SELECT set_config('app.current_tenant', ${orgId}, true)`);
  } catch (error) {
    req.log?.warn({ error, orgId }, "Failed to set tenant context");
    return next(ApiError.internal("Failed to set tenant context"));
  }

  next();
}
