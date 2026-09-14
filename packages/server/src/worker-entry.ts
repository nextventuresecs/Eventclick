import { startSqsWorker } from "./queues/worker";
import { startDlqDrainLoop } from "./queues/dlq-consumer";
import { connectRedis, disconnectRedis } from "./config/redis";
import { logger } from "./utils/logger";

async function main() {
  await connectRedis();

  // The PDF queue's redrive target. Drained here because this process has the
  // database and the instance role; see queues/dlq-consumer.ts.
  const stopDlqDrain = startDlqDrainLoop();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down worker…`);
    stopDlqDrain();
    try {
      await disconnectRedis();
    } catch (err) {
      logger.error({ err }, "Error disconnecting Redis during worker shutdown");
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  startSqsWorker().catch((err) => {
    logger.fatal({ err }, "Worker crashed");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start worker");
  process.exit(1);
});
