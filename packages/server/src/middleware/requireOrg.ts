import type { RequestHandler } from "express";
import { ApiError } from "../utils/errors";

export const requireOrg: RequestHandler = (req, _res, next) => {
  if (!req.user?.organizationId) {
    return next(ApiError.forbidden("User is not associated with an organization"));
  }
  next();
};
