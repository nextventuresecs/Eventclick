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
import { redisClient, connectRedis, disconnectRedis } from "./config/redis";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { API_PREFIX } from "@application/shared";
import { initSentry, setupSentryExpressErrorHandler } from "./services/sentry.service";
import { registerProcessErrorHandlers } from "./utils/processErrors";

// Registered before anything else starts: the background jobs and queue
// workers below throw outside any request, where Express's error handler
// cannot see them. Without these, such a throw kills the process with no log
// line and no Sentry issue — a silent crash loop. See utils/processErrors.ts.
registerProcessErrorHandlers();

const app = express();

if (env.SENTRY_SERVER_DSN) {
  initSentry(env.SENTRY_SERVER_DSN, env.NODE_ENV).then(() => {
    setupSentryExpressErrorHandler(app);
  });
}


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
          "https://cdn.app.eventclick.live"
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

import { metricsMiddleware } from "./services/metrics.service";

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
          // During store initialization, rate-limit-redis loads its
          // script via 'SCRIPT LOAD'. This command expects a string
          // return value (the SHA). Return a dummy SHA to satisfy
          // the init phase check, but only for SCRIPT LOAD.
          if (args[0] === "SCRIPT" && args[1] === "LOAD") {
            return "dummy_sha_fallback";
          }
          // Any other Redis command while disconnected means the
          // rate limiter cannot function — fail closed to protect
          // the server from a brute-force flood during Redis downtime.
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

// Root-level health aliases for external load balancers and container probes
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

import { csrfProtection } from "./middleware/csrf";
import { attachUser } from "./middleware/attachUser";
import { setTenantContext } from "./middleware/tenantContext";

app.use(csrfProtection);
// attachUser MUST precede setTenantContext: the tenant middleware reads
// req.user.organizationId, and requireAuth only runs later, inside the routers.
app.use(attachUser);
app.use(setTenantContext);
app.use(API_PREFIX, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

import { startSqsWorker, startEmailSqsWorker } from "./queues/worker";
import { startSessionCleanupJob } from "./jobs/sessionCleanup";
import { startAttendanceWindowNotifierJob } from "./jobs/attendanceWindowNotifier";
import { startEventExpiryNotifierJob } from "./jobs/eventExpiryNotifier";

const shouldStartWorker = env.SQS_WORKER_ENABLED !== "false";

async function startServer() {
  await connectRedis();

  if (shouldStartWorker) {
    startSessionCleanupJob();
    startAttendanceWindowNotifierJob();
    startEventExpiryNotifierJob();
    startSqsWorker().catch((err) => {
      logger.error({ err }, "SQS worker crashed");
    });
    startEmailSqsWorker().catch((err) => {
      logger.error({ err }, "Email SQS worker crashed");
    });
  } else {
    logger.info("SQS worker disabled via SQS_WORKER_ENABLED=false");
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`[server] running on http://localhost:${env.PORT}${API_PREFIX}`);
  });

  server.headersTimeout = env.SERVER_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = env.SERVER_KEEPALIVE_TIMEOUT_MS;

  if (env.SERVER_REQUEST_TIMEOUT_MS > 0) {
    server.requestTimeout = env.SERVER_REQUEST_TIMEOUT_MS;
  }

  server.on("timeout", () => {
    logger.warn("server request timeout");
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully…`);
    
    setTimeout(() => {
      logger.warn("forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, "Error during server close");
      } else {
        logger.info("server closed");
      }
      try {
        await disconnectRedis();
      } catch (redisErr) {
        logger.error({ err: redisErr }, "Error disconnecting Redis");
      }
      process.exit(err ? 1 : 0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});

export { app };
