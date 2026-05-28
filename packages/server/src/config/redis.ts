import { createClient } from "redis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on("error", (err) => {
  logger.error({ err }, "[redis] client error");
});

redisClient.on("connect", () => {
  logger.info("[redis] connected to server");
});

redisClient.on("ready", () => {
  logger.info("[redis] client ready");
});

redisClient.on("reconnecting", () => {
  logger.warn("[redis] client reconnecting");
});

redisClient.on("end", () => {
  logger.info("[redis] connection closed");
});

let isConnected = false;

export async function connectRedis() {
  try {
    await redisClient.connect();
    isConnected = true;
  } catch (err) {
    logger.error({ err }, "[redis] connection failed");
    // Do not crash the application.
  }
}

export async function disconnectRedis() {
  if (isConnected) {
    try {
      await redisClient.disconnect();
      isConnected = false;
    } catch (err) {
      logger.error({ err }, "[redis] disconnection failed");
    }
  }
}

export function getRedisStatus() {
  return {
    connected: redisClient.isOpen,
    ready: redisClient.isReady,
  };
}
