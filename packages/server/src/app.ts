// MUST be first: Sentry's auto-instrumentation patches http, express, pg and
// redis as they are required, so anything imported before init() runs gets
// the unpatched version.
import "./instrument";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import compression from "compression";
import { pinoHttp } from "pino-http";
import { nanoid } from "nanoid";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { redisClient } from "./config/redis";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { API_PREFIX } from "@application/shared";
import { setupSentryExpressErrorHandler, tagRequestId } from "./services/sentry.service";
import { registerProcessErrorHandlers } from "./utils/processErrors";
import { metricsMiddleware } from "./services/metrics.service";
import { csrfProtection } from "./middleware/csrf";
import { attachUser } from "./middleware/attachUser";
import { setTenantContext } from "./middleware/tenantContext";

// Registered before anything else starts: the background jobs and queue
// workers throw outside any request, where Express's error handler
// cannot see them. See utils/processErrors.ts.
registerProcessErrorHandlers();

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", "weak");

const allowedOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (
        (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
        (origin.includes("localhost") || origin.includes("127.0.0.1"))
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
        imgSrc: [
          "'self'",
          "data:",
          "https://cdn.app.eventclick.live",
        ],
      },
    },
  }),
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(compression());

app.use(metricsMiddleware);

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? nanoid(12);
      res.setHeader("x-request-id", id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} → ${res.statusCode} (${err.name})`,
    autoLogging: {
      ignore: (req) => {
        const path = (req.url || "").split("?")[0] ?? "";
        return (
          path === "/health" ||
          path === "/ready" ||
          path === "/metrics" ||
          path.startsWith(`${API_PREFIX}/health`) ||
          path === `${API_PREFIX}/ready` ||
          path === `${API_PREFIX}/metrics`
        );
      },
    },
  }),
);

app.use((req, _res, next) => {
  if (req.id) tagRequestId(String(req.id));
  next();
});

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => {
      if (env.NODE_ENV === "test" || process.env.NODE_ENV === "test") return true;
      const path = (req.path || req.url || "").split("?")[0] ?? "";
      return (
        path === "/health" ||
        path === "/ready" ||
        path === "/metrics" ||
        path.startsWith(`${API_PREFIX}/health`) ||
        path === `${API_PREFIX}/ready` ||
        path === `${API_PREFIX}/metrics`
      );
    },
    store: new RedisStore({
      sendCommand: async (...args: string[]) => {
        if (!redisClient.isOpen) {
          if (args[0] === "SCRIPT" && args[1] === "LOAD") {
            return "dummy_sha_fallback";
          }
          throw new Error("Redis not connected — rate limiter unavailable");
        }
        try {
          return await redisClient.sendCommand(args);
        } catch (err) {
          const errorString = String(err);
          if (errorString.includes("NOSCRIPT")) {
            throw err;
          }
          logger.error({ err, args }, "[redis-rate-limit] sendCommand failed, failing closed");
          throw err;
        }
      },
    }),
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use(csrfProtection);
app.use(attachUser);
app.use(setTenantContext);
app.use(API_PREFIX, apiRouter);

app.use(notFoundHandler);
setupSentryExpressErrorHandler(app);
app.use(errorHandler);
