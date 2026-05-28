import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * Get item from cache and deserialize JSON
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisClient.isOpen) return null;
  try {
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    logger.error({ err, key }, "[cache] failed to get key");
    return null;
  }
}

/**
 * Serialize and set item in cache with TTL (in seconds)
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  if (!redisClient.isOpen) return false;
  try {
    const data = JSON.stringify(value);
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await redisClient.set(key, data, { EX: ttlSeconds });
    } else {
      await redisClient.set(key, data);
    }
    return true;
  } catch (err) {
    logger.error({ err, key }, "[cache] failed to set key");
    return false;
  }
}

/**
 * Delete item(s) from cache.
 * If key contains '*' it will search and delete matches using SCAN.
 */
export async function cacheDel(keyOrPattern: string): Promise<boolean> {
  if (!redisClient.isOpen) return false;
  try {
    if (keyOrPattern.includes("*")) {
      let count = 0;
      for await (const key of redisClient.scanIterator({ MATCH: keyOrPattern, COUNT: 100 })) {
        await redisClient.del(key);
        count++;
      }
      logger.debug({ pattern: keyOrPattern, count }, "[cache] deleted matching keys");
    } else {
      await redisClient.del(keyOrPattern);
    }
    return true;
  } catch (err) {
    logger.error({ err, keyOrPattern }, "[cache] failed to delete key/pattern");
    return false;
  }
}
