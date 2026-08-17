import type { Request, Response, NextFunction } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { authDb } from "../db";
import { eventRooms } from "../db/schema";
import { runInTenantContext } from "./tenantContext";

// Share tokens are nanoid-generated: URL-safe alphabet, fixed length. Rejecting
// anything else keeps junk path segments from reaching the database at all.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Express `param` handler for the public share routes.
 *
 * Share links carry no JWT, so `req.user` is undefined and `setTenantContext`
 * skips — leaving RLS with no tenant, which makes every share lookup return
 * zero rows and surface as "Room not found".
 *
 * Here the share token itself is the credential. We resolve it to an
 * organization through `authDb` (BYPASSRLS) in a single narrow query that
 * returns nothing but the org id, then pin that tenant for the remainder of the
 * request. Every subsequent read still goes through the RLS-enforced pool, so a
 * bug in a share query cannot leak another tenant's rows.
 *
 * Never rejects: an unknown or malformed token simply leaves the tenant unset,
 * and the service layer produces its usual 404. That keeps the response
 * indistinguishable from a valid-token-but-missing-room, so this middleware
 * cannot be used to enumerate tokens.
 */
export async function shareTenantContext(
  req: Request,
  res: Response,
  next: NextFunction,
  token: string,
): Promise<void> {
  if (typeof token !== "string" || !SHARE_TOKEN_PATTERN.test(token)) {
    return next();
  }

  try {
    const [row] = await authDb
      .select({ organizationId: eventRooms.organizationId })
      .from(eventRooms)
      .where(and(eq(eventRooms.shareToken, token), isNull(eventRooms.deletedAt)))
      .limit(1);

    if (!row?.organizationId) return next();

    return runInTenantContext(req, res, next, row.organizationId, "");
  } catch (error) {
    // A failed lookup must not take the endpoint down; fall through to the
    // service layer's 404 and leave a trace for operators.
    req.log?.error({ error }, "share tenant lookup failed");
    return next();
  }
}
