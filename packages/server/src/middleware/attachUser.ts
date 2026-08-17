import type { RequestHandler } from "express";
import { verifyAccessToken } from "../services/jwt.service";

/**
 * Best-effort access-token decode, mounted app-wide BEFORE `setTenantContext`.
 *
 * `requireAuth` is stacked per-route inside the routers, which only run once
 * the app-level middleware chain has finished. That left `req.user` undefined
 * at the moment `setTenantContext` executed, so it always took its
 * `if (!orgId) return next()` branch and never issued
 * `SET LOCAL app.current_tenant`. Under RLS that silently reduces every
 * tenant-scoped SELECT to zero rows and makes every INSERT fail its
 * WITH CHECK predicate ("new row violates row-level security policy").
 *
 * This middleware only *populates* `req.user`; it never rejects. A missing,
 * malformed, or expired token leaves `req.user` undefined and the request
 * continues, so `requireAuth` remains the single place that returns 401 and
 * the authorization surface is unchanged.
 */
export const attachUser: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice("Bearer ".length).trim();
  if (!token) return next();

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, organizationId: claims.orgId };
  } catch {
    // Invalid or expired token: leave req.user unset. requireAuth issues the
    // 401 on protected routes; public routes are unaffected.
  }

  next();
};
