import { authDb, authPool } from "../db";
import { sessions } from "../db/schema";
import { lt } from "drizzle-orm";
import { logger } from "../utils/logger";

export const cleanupExpiredSessions = async () => {
  // sessions is an auth-only table (see migration 0001_clumsy_bloodstrike.sql:
  // "REVOKE ALL ON sessions FROM app_user"). Only auth_svc_role (BYPASSRLS)
  // has access. Using the app pool (app_user_login) here fails with
  // "relation sessions does not exist" — Postgres reports missing schema
  // privileges as an unqualified missing-relation error, not a permission
  // error, which made this look like a schema/migration bug instead of a
  // wrong-connection-pool bug.
  if (!authDb || !authPool) {
    logger.warn(
      { event: "sessions.cleanup.skipped" },
      "AUTH_DATABASE_URL not configured — skipping expired session cleanup"
    );
    return;
  }
  try {
    const result = await authDb.delete(sessions).where(lt(sessions.expiresAt, new Date()));
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