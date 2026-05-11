import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  GoogleLoginInput,
} from "@application/shared";
import { db } from "../db";
import { users, organizations, orgMembers, type User } from "../db/schema";
import { ApiError } from "../utils/errors";
import { logger } from "../utils/logger";
import { hashPassword, verifyPassword } from "./password.service";
import { signAccessToken } from "./jwt.service";
import {
  findActiveSessionByToken,
  issueRefreshToken,
  revokeSession,
  rotateSession,
  type SessionMeta,
} from "./session.service";
import { verifyGoogleIdToken } from "./google.service";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";

const toAuthUser = (u: User): AuthUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  organizationId: u.organizationId,
  emailVerified: u.emailVerifiedAt !== null,
});

const findUserByEmail = async (email: string): Promise<User | null> => {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
};

const findUserById = async (id: string): Promise<User | null> => {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
};

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const issueTokensFor = async (user: User, meta: SessionMeta): Promise<AuthResult> => {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    orgId: user.organizationId,
  });
  const refresh = await issueRefreshToken(user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { user: toAuthUser(user), accessToken, refreshToken: refresh.raw };
};

export const registerUser = async (input: RegisterInput, meta: SessionMeta): Promise<AuthResult> => {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    logger.warn({ email: input.email, event: "register.conflict" }, "register attempt for existing email");
    throw ApiError.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const created = await db.transaction(async (tx) => {
    let orgId: string | null = null;
    let role: "event_admin" | "organizer" = "organizer";

    if (input.organizationName) {
      const slug = `${slugify(input.organizationName)}-${nanoid(6).toLowerCase()}`;
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug, contactEmail: input.email })
        .returning({ id: organizations.id });
      if (!org) throw ApiError.internal("Failed to create organization");
      orgId = org.id;
      role = "event_admin";
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

    return user;
  });

  logger.info(
    { userId: created.id, orgId: created.organizationId, role: created.role, event: "user.registered" },
    "user registered",
  );
  return issueTokensFor(created, meta);
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
    }
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        fullName: profile.fullName,
        googleId: profile.googleId,
        emailVerifiedAt: new Date(),
        role: "organizer",
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
  return { user: toAuthUser(user), accessToken, refreshToken: next.raw };
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
  return toAuthUser(user);
};
