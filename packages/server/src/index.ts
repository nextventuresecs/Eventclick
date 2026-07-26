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

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (
        env.NODE_ENV === "development" &&
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
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(compression());
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
      ignore: (req) =>
        req.url === `${API_PREFIX}/health` ||
        req.url === `${API_PREFIX}/ready`,
    },
  }),
);

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: async (...args: string[]) => {
        if (!redisClient.isOpen) {
          // During store initialization, rate-limit-redis loads its script via 'SCRIPT LOAD'.
          // This command expects a string return value (the SHA). If we are not connected yet,
          // return a dummy SHA string to satisfy the init phase check.
          if (args[0] === "SCRIPT" && args[1] === "LOAD") {
            return "dummy_sha_fallback";
          }
          // The increment/liveness command expects [totalHits, resetTimeMs].
          return [0, Date.now() + env.RATE_LIMIT_WINDOW_MS];
        }
        try {
          return await redisClient.sendCommand(args);
        } catch (err) {
          const errorString = String(err);
          if (errorString.includes("NOSCRIPT")) {
            throw err; // Let rate-limit-redis load the script
          }
          logger.error({ err, args }, "[redis-rate-limit] sendCommand failed, falling back");
          return [0, Date.now() + env.RATE_LIMIT_WINDOW_MS];
        }
      },
    }),
  }),
);

app.use(API_PREFIX, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  await connectRedis();

  const server = app.listen(env.PORT, () => {
    logger.info(`[server] running on http://localhost:${env.PORT}${API_PREFIX}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully…`);
    await disconnectRedis();
    server.close(() => {
      logger.info("server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn("forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});

export { app };
