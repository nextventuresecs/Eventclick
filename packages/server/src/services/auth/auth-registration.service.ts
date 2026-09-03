import { eq, and, gt, isNull } from "drizzle-orm";
import emailValidator from "deep-email-validator";
import crypto from "crypto";
import { nanoid } from "nanoid";
import type {
  AuthUser,
  RegisterInput,
  OnboardingInput,
} from "@application/shared";
import { authDb } from "../../db";
import { users, organizations, orgMembers, emailVerifications } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { assertPasswordStrength } from "../../utils/passwordStrength";
import argon2 from "argon2";
import { dispatchEmail } from "../email-delivery.service";
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

// `_meta` is unused: registration does not create a session (the user must
// verify their email first), but the parameter stays to keep the signature
// aligned with loginUser/googleLogin, which do.
export const registerUser = async (input: RegisterInput, _meta: SessionMeta): Promise<{ message: string; user: AuthUser }> => {
  assertPasswordStrength(input.password);

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

  const passwordHash = await argon2.hash(input.password);

  const { user: created, verificationToken } = await authDb.transaction(async (tx) => {
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
  await invalidateUserCache(created.id, created.email);

  // The user row (and the delivery-tracking row dispatchEmail creates) are
  // already durable at this point. An SQS enqueue failure here must not fail
  // registration — the delivery row sits PENDING and can be re-driven later;
  // failing the request would tell the client "registration failed" for a
  // user that was, in fact, created.
  await dispatchEmail({
    userId: created.id,
    recipientEmail: created.email,
    type: "verification",
    payload: { token: verificationToken },
  }).catch((err) => {
    logger.error({ err, userId: created.id, event: "email.dispatch_failed" }, "Failed to dispatch verification email");
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
  if (!user.isActive) throw ApiError.forbidden("Account is disabled");

  await authDb.transaction(async (tx) => {
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

export const verifyEmailToken = async (
  token: string,
  meta: SessionMeta,
): Promise<AuthResult & { passwordSetupRequired: boolean }> => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Atomic TOCTOU fix: check and mark used in a single query
  // Note: the token is burned even if the subsequent user verification update fails (fail-closed)
  const [verifyReq] = await authDb
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerifications.tokenHash, tokenHash),
        isNull(emailVerifications.usedAt),
        gt(emailVerifications.expiresAt, new Date())
      )
    )
    .returning({ id: emailVerifications.id, userId: emailVerifications.userId });

  if (!verifyReq) {
    logger.warn({ event: "email_verification.failed" }, "invalid or expired email verification token used");
    throw ApiError.badRequest("Invalid or expired verification token");
  }

  await authDb
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, verifyReq.userId));

  await invalidateUserCache(verifyReq.userId);
  const user = await findUserById(verifyReq.userId);
  if (!user) throw ApiError.internal("User not found after verification");
  
  logger.info({ userId: verifyReq.userId, event: "email_verification.success" }, "email verified successfully");
  const result = await issueTokensFor(user, meta);
  // Set for a USER_INVITED user created without an admin-chosen password
  // (see admin.service.ts's createOrgUser) — the client prompts for one
  // immediately after this response, using the session this call just
  // issued (POST /auth/set-password).
  return { ...result, passwordSetupRequired: user.passwordHash === null };
};

export const resendVerificationToken = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user || user.emailVerifiedAt) return; // Silent return for security

  await authDb.update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, user.id), isNull(emailVerifications.usedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_24H_MS);

  await authDb.insert(emailVerifications).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await dispatchEmail({
    userId: user.id,
    recipientEmail: email,
    type: "verification",
    payload: { token },
  }).catch((err) => {
    logger.error({ err, userId: user.id, event: "email.dispatch_failed" }, "Failed to dispatch verification email");
  });
  logger.info({ userId: user.id, event: "email_verification.resent" }, "email verification resent");
};
