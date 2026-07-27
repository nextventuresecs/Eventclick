import { db } from "../db";
import { sessions } from "../db/schema";
import { lt } from "drizzle-orm";
import { logger } from "../utils/logger";

export const cleanupExpiredSessions = async () => {
  try {
    const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    logger.info({ count: result.rowCount || 0, event: "sessions.cleanup" }, "Expired sessions cleaned up");
  } catch (error) {
    logger.error({ err: error, event: "sessions.cleanup.error" }, "Failed to clean up expired sessions");
  }
};

export const startSessionCleanupJob = () => {
  // Run on startup
  cleanupExpiredSessions();
  // Run every 1 hour
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
};
