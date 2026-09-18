import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { API_PREFIX } from "@application/shared";
import { startSqsWorker, startEmailSqsWorker } from "./queues/worker";
import { startSessionCleanupJob } from "./jobs/sessionCleanup";
import { startAttendanceWindowNotifierJob } from "./jobs/attendanceWindowNotifier";
import { startEventExpiryNotifierJob } from "./jobs/eventExpiryNotifier";
import { startDataRetentionJob } from "./jobs/dataRetention";
import { startAuditRetentionJob } from "./jobs/auditRetention";
import { startEmailOutboxSweeperJob } from "./jobs/emailOutboxSweeper";

const shouldStartWorker = env.SQS_WORKER_ENABLED !== "false";

async function startServer() {
  await connectRedis();

  if (shouldStartWorker) {
    startSessionCleanupJob();
    startAttendanceWindowNotifierJob();
    startEventExpiryNotifierJob();
    startDataRetentionJob();
    startAuditRetentionJob();
    startEmailOutboxSweeperJob();
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
