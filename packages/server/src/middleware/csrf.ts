import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    return next(ApiError.forbidden("CSRF protection: missing Origin or Referer header"));
  }

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
  
  const isAllowedOrigin = allowedOrigins.some((allowedOrigin) => origin.startsWith(allowedOrigin));
  
  const isDevLocalhost = env.NODE_ENV === "development" && (origin.includes("localhost") || origin.includes("127.0.0.1"));

  if (!isAllowedOrigin && !isDevLocalhost) {
    return next(ApiError.forbidden("CSRF protection: invalid Origin or Referer"));
  }

  next();
};
