import { eq, and, gt, isNull } from "drizzle-orm";
import zxcvbn from "zxcvbn";
import emailValidator from "deep-email-validator";
import crypto from "crypto";
import { nanoid } from "nanoid";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  GoogleLoginInput,
  OnboardingInput,
  UpdateProfileInput,
} from "@application/shared";
import { db } from "../db";
import { users, organizations, orgMembers, passwordResets, emailVerifications, type User } from "../db/schema";
import { ApiError } from "../utils/errors";
import { logger } from "../utils/logger";
import { hashPassword, verifyPassword } from "./password.service";
import { signAccessToken } from "./jwt.service";
import { enqueueEmail } from "../queues/sqs.client";
import {
  findActiveSessionByToken,
  issueRefreshToken,
  revokeSession,
  rotateSession,
  revokeAllUserSessions,
  type SessionMeta,
} from "./session.service";
import { verifyGoogleIdToken } from "./google.service";
import { cacheGet, cacheSet, cacheDel } from "./cache.service";

const slugify = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";

const toAuthUser = (u: User, orgName?: string | null): AuthUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  organizationId: u.organizationId,
  organizationName: orgName,
  emailVerified: u.emailVerifiedAt !== null,
});

type UserWithOrg = User & { organizationName?: string | null };

export const invalidateUserCache = async (userId: string, email?: string): Promise<void> => {
  await cacheDel(`user:${userId}`);
  if (email) {
    await cacheDel(`email:${email.toLowerCase().trim()}`);
  }
};

export const findUserById = async (id: string): Promise<UserWithOrg | null> => {
  const cacheKey = `user:${id}`;
  const cached = await cacheGet<UserWithOrg | string>(cacheKey);
  if (cached !== null) {
    if (cached === "__null__") return null;
    if (typeof cached === "object") {
      if (cached.createdAt) cached.createdAt = new Date(cached.createdAt);
      if (cached.updatedAt) cached.updatedAt = new Date(cached.updatedAt);
      if (cached.emailVerifiedAt) cached.emailVerifiedAt = new Date(cached.emailVerifiedAt);
      if (cached.lastLoginAt) cached.lastLoginAt = new Date(cached.lastLoginAt);
      return cached;
    }
  }

  const [row] = await db
    .select({
      user: users,
      orgName: organizations.name,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, id))
    .limit(1);

  if (!row) {
    await cacheSet(cacheKey, "__null__", 30);
    return null;
  }

  const userWithOrg = { ...row.user, organizationName: row.orgName };
  await cacheSet(cacheKey, userWithOrg, 120);
  return userWithOrg;
};

const findUserByEmail = async (email: string): Promise<UserWithOrg | null> => {
  const emailKey = `email:${email.toLowerCase().trim()}`;
  const cachedUserId = await cacheGet<string>(emailKey);
  if (cachedUserId) {
    if (cachedUserId === "__null__") return null;
    const user = await findUserById(cachedUserId);
    if (user) return user;
  }

  const [row] = await db
    .select({
      user: users,
      orgName: organizations.name,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.email, email))
    .limit(1);

  if (!row) {
    await cacheSet(emailKey, "__null__", 30);
    return null;
  }

  const userWithOrg = { ...row.user, organizationName: row.orgName };
  await cacheSet(`user:${userWithOrg.id}`, userWithOrg, 120);
  await cacheSet(emailKey, userWithOrg.id, 120);
  return userWithOrg;
};

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const issueTokensFor = async (user: UserWithOrg, meta: SessionMeta): Promise<AuthResult> => {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    orgId: user.organizationId,
  });
  const refresh = await issueRefreshToken(user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { user: toAuthUser(user, user.organizationName), accessToken, refreshToken: refresh.raw };
};

export const registerUser = async (input: RegisterInput, meta: SessionMeta): Promise<{ message: string; user: AuthUser }> => {
  // Validate Password Strength
  const pwdScore = zxcvbn(input.password);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  // Deep Email Validation with 5s timeout
  const emailValResult = await Promise.race<{ valid: boolean; reason?: string }>([
    emailValidator({
      email: input.email,
      validateRegex: true,
      validateMx: true,
      validateTypo: true,
      validateDisposable: true,
      validateSMTP: false,
    }).catch(() => ({ valid: true, reason: "validator_error" })),
    new Promise<{ valid: boolean; reason?: string }>((resolve) =>
      setTimeout(() => resolve({ valid: true, reason: "timeout" }), 5000)
    )
  ]);

  if (!emailValResult.valid) {
    logger.warn({ email: input.email, reason: emailValResult.reason }, "email validation failed during registration");
    throw ApiError.badRequest("Please provide a valid, deliverable email address.");
  }

  const existing = await findUserByEmail(input.email);
  if (existing) {
    logger.warn({ email: input.email, event: "register.conflict" }, "register attempt for existing email");
    throw ApiError.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const { user: created, verificationToken } = await db.transaction(async (tx) => {
    let orgId: string | null = null;
    let role: "admin" | "volunteer" = "volunteer";

    if (input.organizationName) {
      const slug = `${slugify(input.organizationName)}-${nanoid(6).toLowerCase()}`;
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug, contactEmail: input.email })
        .returning({ id: organizations.id });
      if (!org) throw ApiError.internal("Failed to create organization");
      orgId = org.id;
      role = "admin";
      logger.info({ orgId, slug, event: "organization.created" }, "organization created");
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role,
        organizationId: orgId,
      })
      .returning();
    if (!user) throw ApiError.internal("Failed to create user");

    if (orgId) {
      await tx.insert(orgMembers).values({
        userId: user.id,
        organizationId: orgId,
        role,
      });
    }

    // Generate Email Verification Token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await tx.insert(emailVerifications).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return { user, verificationToken: token };
  });

  logger.info(
    { userId: created.id, orgId: created.organizationId, role: created.role, event: "user.registered" },
    "user registered",
  );
  
  await enqueueEmail({
    type: "verification",
    email: created.email,
    token: verificationToken,
  });

  const userWithOrg = await findUserById(created.id);
  if (!userWithOrg) throw ApiError.internal("Failed to retrieve created user");

  return {
    message: "Registration successful. Please check your email to verify your account.",
    user: toAuthUser(userWithOrg, userWithOrg.organizationName)
  };
};

export const loginUser = async (input: LoginInput, meta: SessionMeta): Promise<AuthResult> => {
  const user = await findUserByEmail(input.email);
  if (!user || !user.passwordHash) {
    logger.warn(
      { email: input.email, event: "login.failed", reason: user ? "no_password" : "unknown_email" },
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

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    logger.warn(
      { userId: user.id, email: input.email, event: "login.failed", reason: "bad_password" },
      "login failed",
    );
    throw ApiError.unauthorized("Invalid email or password");
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
      const [updated] = await db
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
    const [created] = await db
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
  }

  logger.info({ userId: user.id, event: "user.login", via: "google" }, "user logged in via google");
  return issueTokensFor(user, meta);
};

export const refreshSession = async (
  refreshToken: string,
  meta: SessionMeta,
): Promise<AuthResult> => {
  const session = await findActiveSessionByToken(refreshToken);
  if (!session) throw ApiError.unauthorized("Invalid refresh token");

  const next = await rotateSession(session, meta);

  const user = await findUserById(session.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("Account no longer active");

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    orgId: user.organizationId,
  });
  return { user: toAuthUser(user, user.organizationName), accessToken, refreshToken: next.raw };
};

export const logoutSession = async (refreshToken: string | undefined): Promise<void> => {
  if (!refreshToken) return;
  const session = await findActiveSessionByToken(refreshToken);
  if (session && !session.revokedAt) {
    await revokeSession(session.id);
    logger.info({ userId: session.userId, sessionId: session.id, event: "user.logout" }, "user logged out");
  }
};

export const getCurrentUser = async (userId: string): Promise<AuthUser> => {
  const user = await findUserById(userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("Account no longer active");
  return toAuthUser(user, user.organizationName);
};

export const forgotPassword = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user) {
    // Dummy hash to prevent timing attack enumeration
    await hashPassword(crypto.randomBytes(32).toString("hex"));
    logger.warn({ email, event: "password_reset.request_failed" }, "reset request for non-existent email (ignored to prevent enumeration)");
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await enqueueEmail({
    type: "reset-password",
    email,
    token,
  });
  logger.info({ userId: user.id, email, event: "password_reset.requested" }, "password reset token generated and email queued");
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const pwdScore = zxcvbn(newPassword);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [resetReq] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!resetReq) {
    logger.warn({ event: "password_reset.failed" }, "invalid or expired password reset token used");
    throw ApiError.badRequest("Invalid or expired reset token");
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    // Mark token as used
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, resetReq.id));

    // Update user password
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetReq.userId));
  });

  // Revoke all existing sessions to force re-login on all devices
  await revokeAllUserSessions(resetReq.userId);

  await invalidateUserCache(resetReq.userId);

  logger.info({ userId: resetReq.userId, event: "password_reset.success" }, "password reset successfully");
};

export const completeOnboarding = async (
  userId: string,
  input: OnboardingInput,
  meta: SessionMeta
): Promise<AuthResult> => {
  const user = await findUserById(userId);
  if (!user) throw ApiError.notFound("User not found");
  if (!user.isActive) throw ApiError.forbidden("This account is disabled");

  await db.transaction(async (tx) => {
    let orgId: string | null = null;

    if (input.role === "admin") {
      if (!input.organizationName) {
        throw ApiError.badRequest("Organization name is required to become an NGO Admin");
      }
      const slug = `${slugify(input.organizationName)}-${nanoid(6).toLowerCase()}`;
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug, contactEmail: user.email })
        .returning({ id: organizations.id });
      
      if (!org) throw ApiError.internal("Failed to create organization");
      orgId = org.id;

      // Update user details
      await tx
        .update(users)
        .set({ role: "admin", organizationId: orgId, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Add to orgMembers
      await tx.insert(orgMembers).values({
        userId,
        organizationId: orgId,
        role: "admin",
      });
      
      logger.info({ userId, orgId, slug, event: "onboarding.admin" }, "user onboarded as NGO Admin");
    } else {
      // Just keep/ensure they are standard volunteer
      await tx
        .update(users)
        .set({ role: "volunteer", organizationId: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      
      logger.info({ userId, event: "onboarding.volunteer" }, "user onboarded as volunteer");
    }
  });

  // Fetch updated user to generate new JWT & refresh token representing the new role & organization
  await invalidateUserCache(userId);
  const updatedUser = await findUserById(userId);
  if (!updatedUser) throw ApiError.internal("Failed to retrieve onboarded user");

  return issueTokensFor(updatedUser, meta);
};

export const verifyEmailToken = async (token: string, meta: SessionMeta): Promise<AuthResult> => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [verifyReq] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.tokenHash, tokenHash),
        isNull(emailVerifications.usedAt),
        gt(emailVerifications.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!verifyReq) {
    logger.warn({ event: "email_verification.failed" }, "invalid or expired email verification token used");
    throw ApiError.badRequest("Invalid or expired verification token");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerifications)
      .set({ usedAt: new Date() })
      .where(eq(emailVerifications.id, verifyReq.id));

    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, verifyReq.userId));
  });

  await invalidateUserCache(verifyReq.userId);
  const user = await findUserById(verifyReq.userId);
  if (!user) throw ApiError.internal("User not found after verification");
  
  logger.info({ userId: verifyReq.userId, event: "email_verification.success" }, "email verified successfully");
  return issueTokensFor(user, meta);
};

export const resendVerificationToken = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user || user.emailVerifiedAt) return; // Silent return for security

  // Expire previous unused tokens
  await db.update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, user.id), isNull(emailVerifications.usedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(emailVerifications).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await enqueueEmail({
    type: "verification",
    email,
    token,
  });
  logger.info({ userId: user.id, event: "email_verification.resent" }, "email verification resent");
};

export const updateUserProfile = async (
  userId: string,
  input: UpdateProfileInput
): Promise<AuthUser> => {
  const [updatedUser] = await db
    .update(users)
    .set({
      fullName: input.fullName,
      photoUrl: input.photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) throw ApiError.notFound("User not found");

  await invalidateUserCache(userId);
  return toAuthUser(updatedUser);
};

export const changeUserPassword = async (
  userId: string,
  currentPasswordPlain: string,
  newPasswordPlain: string
): Promise<void> => {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw ApiError.notFound("User not found");
  if (!userRow.passwordHash) throw ApiError.badRequest("User does not use password authentication");

  const isValid = await verifyPassword(currentPasswordPlain, userRow.passwordHash);
  if (!isValid) throw ApiError.unauthorized("Incorrect current password");

  const pwdScore = zxcvbn(newPasswordPlain);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

  const newPasswordHash = await hashPassword(newPasswordPlain);

  await db.update(users).set({ passwordHash: newPasswordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  await revokeAllUserSessions(userId);
  await invalidateUserCache(userId);

  logger.info({ userId, event: "password_change.success" }, "User password changed successfully");
};
