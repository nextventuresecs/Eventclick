import { eq } from "drizzle-orm";
import type { LoginInput, GoogleLoginInput } from "@application/shared";
import { authDb } from "../../db";
import { users } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import argon2 from "argon2";
import { verifyGoogleIdToken } from "../google.service";
import crypto from "crypto";
import { signAccessToken } from "../jwt.service";
import {
  findSessionByToken,
  revokeSession,
  rotateSession,
  type SessionMeta,
} from "../session.service";
import {
  findUserByEmail,
  findUserById,
  invalidateUserCache,
  issueTokensFor,
  toAuthUser,
  type AuthResult,
} from "./auth-helpers";

export const loginUser = async (input: LoginInput, meta: SessionMeta): Promise<AuthResult> => {
  const user = await findUserByEmail(input.email);

  if (!user || !user.passwordHash) {
    await argon2.hash(crypto.randomBytes(32).toString("hex"));
    logger.warn(
      { email: input.email, event: "login.failed", reason: user ? "no_password" : "unknown_email" },
      "login failed",
    );
    throw ApiError.unauthorized("Invalid email or password");
  }

  const ok = await argon2.verify(user.passwordHash, input.password);
  if (!ok) {
    logger.warn(
      { userId: user.id, email: input.email, event: "login.failed", reason: "bad_password" },
      "login failed",
    );
    throw ApiError.unauthorized("Invalid email or password");
  }

  if (!user.isActive) {
    logger.warn({ userId: user.id, event: "login.disabled" }, "login blocked: account disabled");
    throw ApiError.forbidden("This account is disabled");
  }
  if (!user.emailVerifiedAt) {
    logger.warn({ userId: user.id, event: "login.unverified" }, "login blocked: email not verified");
    throw ApiError.forbidden("Please verify your email address before logging in.");
  }

  logger.info({ userId: user.id, event: "user.login" }, "user logged in");
  return issueTokensFor(user, meta);
};

export const loginWithGoogle = async (
  input: GoogleLoginInput,
  meta: SessionMeta,
): Promise<AuthResult> => {
  const profile = await verifyGoogleIdToken(input.idToken);
  if (!profile.emailVerified) {
    logger.warn({ email: profile.email, event: "google.unverified" }, "google login: email not verified");
    throw ApiError.unauthorized("Google email is not verified");
  }

  let user = await findUserByEmail(profile.email);

  if (user) {
    if (!user.isActive) {
      logger.warn({ userId: user.id, event: "google.login.disabled" }, "google login blocked: disabled account");
      throw ApiError.forbidden("This account is disabled");
    }
    if (!user.googleId) {
      const [updated] = await authDb
        .update(users)
        .set({
          googleId: profile.googleId,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      if (updated) user = updated;
      logger.info({ userId: user.id, event: "google.linked" }, "google account linked");
      await invalidateUserCache(user.id, user.email);
    }
  } else {
    const [created] = await authDb
      .insert(users)
        .values({
          email: profile.email,
          fullName: profile.fullName,
          googleId: profile.googleId,
          emailVerifiedAt: new Date(),
          role: "volunteer",
        })
        .returning();
    if (!created) throw ApiError.internal("Failed to create user");
    user = created;
    logger.info({ userId: user.id, event: "user.registered", via: "google" }, "user registered via google");
    await invalidateUserCache(user.id, user.email);
  }

  logger.info({ userId: user.id, event: "user.login", via: "google" }, "user logged in via google");
  return issueTokensFor(user, meta);
};

export const refreshSession = async (
  refreshToken: string,
  meta: SessionMeta,
): Promise<AuthResult> => {
  const session = await findSessionByToken(refreshToken);
  if (!session) throw ApiError.unauthorized("Invalid refresh token");

  const user = await findUserById(session.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("Account no longer active");

  const next = await rotateSession(session, meta);
  const accessToken = signAccessToken({ sub: user.id, role: user.role, orgId: user.organizationId });
  await authDb.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return {
    user: toAuthUser(user, user.organizationName, user.organizationDescription, user.organizationLogoUrl),
    accessToken,
    refreshToken: next.raw,
  };
};

export const logoutSession = async (refreshToken: string | undefined): Promise<void> => {
  if (!refreshToken) return;
  const session = await findSessionByToken(refreshToken);
  if (session && !session.revokedAt) {
    await revokeSession(session.id);
    logger.info({ userId: session.userId, sessionId: session.id, event: "user.logout" }, "user logged out");
  }
};
