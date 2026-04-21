import type { RequestHandler } from "express";
import type { UserRole } from "@application/shared";
import { ApiError } from "../utils/errors";

export const requireRole =
  (...allowed: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) return next(ApiError.forbidden("Insufficient permissions"));
    next();
  };
