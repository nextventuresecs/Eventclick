import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

export async function setTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const orgId = req.user?.organizationId;

  if (!orgId) {
    return next();
  }

  try {
    await db.execute(sql`SET app.current_tenant = ${orgId}`);
  } catch (error) {
    req.log?.warn({ error, orgId }, "Failed to set tenant context");
  }

  next();
}
