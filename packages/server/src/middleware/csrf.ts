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
  if (!allowedOrigins.includes(env.APP_URL)) {
    allowedOrigins.push(env.APP_URL);
  }

  const originUrl = (() => {
    try {
      return new URL(origin).origin;
    } catch {
      return null;
    }
  })();

  const isAllowedOrigin =
    !!originUrl &&
    allowedOrigins.some((allowedOrigin) => {
      try {
        return new URL(allowedOrigin).origin === originUrl;
      } catch {
        return origin === allowedOrigin;
      }
    });
  
  const isDevOrTestLocalhost =
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    (origin.includes("localhost") || origin.includes("127.0.0.1"));

  if (!isAllowedOrigin && !isDevOrTestLocalhost) {
    return next(ApiError.forbidden("CSRF protection: invalid Origin or Referer"));
  }

  next();
};
