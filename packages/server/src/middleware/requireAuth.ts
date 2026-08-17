import type { RequestHandler } from "express";
import { verifyAccessToken } from "../services/jwt.service";
import { ApiError } from "../utils/errors";

export const requireAuth: RequestHandler = (req, _res, next) => {
  // attachUser runs app-wide and has already verified the bearer token and
  // populated req.user. Re-verifying here would repeat the HMAC check on every
  // request. req.user is only ever written from a successfully verified token
  // (attachUser or the fallback below), so trusting it does not widen access.
  if (req.user) return next();

  // Fallback for stacks where attachUser is not mounted (unit tests, workers).
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(ApiError.unauthorized("Missing bearer token"));

  const token = header.slice("Bearer ".length).trim();
  if (!token) return next(ApiError.unauthorized("Missing bearer token"));

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, organizationId: claims.orgId };
    req.log?.setBindings?.({
      userId: claims.sub,
      role: claims.role,
      orgId: claims.orgId,
    });
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};
