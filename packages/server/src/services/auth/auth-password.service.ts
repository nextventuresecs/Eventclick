import { eq, and, gt, isNull } from "drizzle-orm";
import zxcvbn from "zxcvbn";
import crypto from "crypto";
import { authDb } from "../../db";
import { users, passwordResets } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import argon2 from "argon2";
import { dispatchEmail } from "../email-delivery.service";
import { revokeAllUserSessions } from "../session.service";
import { findUserByEmail, invalidateUserCache } from "./auth-helpers";
import { TOKEN_EXPIRY_1H_MS } from "../../config/constants";

export const forgotPassword = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user) {
    // Dummy hash to prevent timing attack enumeration
    await argon2.hash(crypto.randomBytes(32).toString("hex"));
    logger.warn({ email, event: "password_reset.request_failed" }, "reset request for non-existent email (ignored to prevent enumeration)");
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_1H_MS);

  await authDb.insert(passwordResets).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Unknown-email requests return early with 200 above (enumeration-safe) —
  // a dispatch failure here must not surface as a 500, or the two paths
  // become distinguishable by status code, defeating that protection.
  await dispatchEmail({
    userId: user.id,
    recipientEmail: email,
    type: "reset-password",
    payload: { token },
  }).catch((err) => {
    logger.error({ err, userId: user.id, event: "email.dispatch_failed" }, "Failed to dispatch password reset email");
  });
  logger.info({ userId: user.id, email, event: "password_reset.requested" }, "password reset token generated and email queued");
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const pwdScore = zxcvbn(newPassword);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const passwordHash = await argon2.hash(newPassword);

  // Atomic TOCTOU fix: check and mark used in a single query
  // Note: the token is burned even if the subsequent user password update fails (fail-closed)
  const [resetReq] = await authDb
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date())
      )
    )
    .returning({ id: passwordResets.id, userId: passwordResets.userId });

  if (!resetReq) {
    logger.warn({ event: "password_reset.failed" }, "invalid or expired password reset token used");
    throw ApiError.badRequest("Invalid or expired reset token");
  }

  // Update user password
  await authDb
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, resetReq.userId));

  // Revoke all existing sessions to force re-login on all devices
  await revokeAllUserSessions(resetReq.userId);
  await invalidateUserCache(resetReq.userId);

  logger.info({ userId: resetReq.userId, event: "password_reset.success" }, "password reset successfully");
};

export const changeUserPassword = async (
  userId: string,
  currentPasswordPlain: string,
  newPasswordPlain: string
): Promise<void> => {
  const [userRow] = await authDb.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw ApiError.notFound("User not found");
  if (!userRow.passwordHash) throw ApiError.badRequest("User does not use password authentication");

  const isValid = await argon2.verify(userRow.passwordHash, currentPasswordPlain);
  if (!isValid) throw ApiError.unauthorized("Incorrect current password");

  const pwdScore = zxcvbn(newPasswordPlain);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  const newPasswordHash = await argon2.hash(newPasswordPlain);

  await authDb.update(users).set({ passwordHash: newPasswordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  await revokeAllUserSessions(userId);
  await invalidateUserCache(userId);

  logger.info({ userId, event: "password_change.success" }, "User password changed successfully");
};

/**
 * First-time password setup for a user an admin created without one (the
 * USER_INVITED magic-link flow — see admin.service.ts's createOrgUser).
 * Deliberately NOT a general "reset my password while logged in" endpoint:
 * it only succeeds once, while passwordHash is still null. Once a password
 * exists, this always 409s and the user must use forgotPassword/resetPassword
 * or changeUserPassword instead — there is no unauthenticated overwrite path.
 */
export const setInitialPassword = async (userId: string, newPassword: string): Promise<void> => {
  const [userRow] = await authDb.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw ApiError.notFound("User not found");
  if (userRow.passwordHash) {
    throw ApiError.conflict("Password already set — use change password instead");
  }

  const pwdScore = zxcvbn(newPassword);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  const passwordHash = await argon2.hash(newPassword);

  await authDb.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  await invalidateUserCache(userId);

  logger.info({ userId, event: "password_setup.success" }, "User completed first-time password setup");
};
