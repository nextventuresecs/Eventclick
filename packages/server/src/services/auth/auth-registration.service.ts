import { eq, and, gt, isNull } from "drizzle-orm";
import zxcvbn from "zxcvbn";
import emailValidator from "deep-email-validator";
import crypto from "crypto";
import { nanoid } from "nanoid";
import type {
  AuthUser,
  RegisterInput,
  OnboardingInput,
} from "@application/shared";
import { db } from "../../db";
import { users, organizations, orgMembers, emailVerifications } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { hashPassword } from "../password.service";
import { enqueueEmail } from "../../queues/sqs.client";
import { type SessionMeta } from "../session.service";
import { TOKEN_EXPIRY_24H_MS } from "../../config/constants";
import {
  findUserByEmail,
  findUserById,
  invalidateUserCache,
  issueTokensFor,
  slugify,
  toAuthUser,
  type AuthResult,
} from "./auth-helpers";

export const registerUser = async (input: RegisterInput, meta: SessionMeta): Promise<{ message: string; user: AuthUser }> => {
  const pwdScore = zxcvbn(input.password);
  if (pwdScore.score < 3) {
    throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
  }

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

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_24H_MS);

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
        throw ApiError.badRequest("Organization name is required to become an Admin");
      }
      const slug = `${slugify(input.organizationName)}-${nanoid(6).toLowerCase()}`;
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug, contactEmail: user.email })
        .returning({ id: organizations.id });
      
      if (!org) throw ApiError.internal("Failed to create organization");
      orgId = org.id;

      await tx
        .update(users)
        .set({ role: "admin", organizationId: orgId, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await tx.insert(orgMembers).values({
        userId,
        organizationId: orgId,
        role: "admin",
      });
      
      logger.info({ userId, orgId, slug, event: "onboarding.admin" }, "user onboarded as Admin");
    } else {
      await tx
        .update(users)
        .set({ role: "volunteer", organizationId: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      
      logger.info({ userId, event: "onboarding.volunteer" }, "user onboarded as volunteer");
    }
  });

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

  await db.update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, user.id), isNull(emailVerifications.usedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_24H_MS);

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
