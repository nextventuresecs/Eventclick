import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { ZodError } from "zod";
import * as Sentry from "@sentry/node";
import { ApiError } from "../utils/errors";
import { logger, type Logger } from "../utils/logger";
import { env } from "../config/env";

const reqLogger = (req: Request): Logger => req.log ?? logger;

export const notFoundHandler: RequestHandler = (req, res) => {
  reqLogger(req).warn(
    { method: req.method, url: req.originalUrl },
    "route not found",
  );
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = reqLogger(req);

  if (err instanceof ZodError) {
    log.warn(
      { err, issues: err.issues, route: `${req.method} ${req.originalUrl}` },
      "validation failed",
    );
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      log.error({ err, code: err.code }, "api error (5xx)");
      Sentry.captureException(err, {
        tags: { code: err.code },
        extra: { route: `${req.method} ${req.originalUrl}` },
      });
    } else {
      log.warn(
        { code: err.code, status: err.statusCode, msg: err.message },
        "api error (4xx)",
      );
    }
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  log.error({ err }, "unhandled error");
  Sentry.captureException(err, {
    extra: { route: `${req.method} ${req.originalUrl}` },
  });
  res.status(500).json({
    error: "INTERNAL",
    message: env.NODE_ENV === "production" ? "Internal server error" : (err as Error).message,
  });
};

