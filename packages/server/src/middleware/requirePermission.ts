import type { RequestHandler } from "express";
import type { RolePermission } from "@application/shared";
import { hasRolePermission } from "@application/shared";
import { ApiError } from "../utils/errors";

export const requirePermission =
  (permission: RolePermission): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!hasRolePermission(req.user.role, permission)) {
      return next(ApiError.forbidden("Insufficient permissions"));
    }
    next();
  };
