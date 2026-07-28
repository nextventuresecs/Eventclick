import { eq } from "drizzle-orm";
import type { AuthUser } from "@application/shared";
import { db } from "../../db";
import { users, organizations, type User } from "../../db/schema";
import { signAccessToken } from "../jwt.service";
import { issueRefreshToken, type SessionMeta } from "../session.service";
import { cacheGet, cacheSet, cacheDel } from "../cache.service";
import { CACHE_TTL_USER, CACHE_TTL_NULL_USER } from "../../config/constants";

export const slugify = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";

export const toAuthUser = (
  u: User,
  orgName?: string | null,
  orgDescription?: string | null,
  orgLogoUrl?: string | null
): AuthUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  organizationId: u.organizationId,
  organizationName: orgName,
  organizationDescription: orgDescription,
  organizationLogoUrl: orgLogoUrl,
  emailVerified: u.emailVerifiedAt !== null,
});

export type UserWithOrg = User & {
  organizationName?: string | null;
  organizationDescription?: string | null;
  organizationLogoUrl?: string | null;
};

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
      orgDescription: organizations.description,
      orgLogoUrl: organizations.logoUrl,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, id))
    .limit(1);

  if (!row) {
    await cacheSet(cacheKey, "__null__", CACHE_TTL_NULL_USER);
    return null;
  }

  const userWithOrg = {
    ...row.user,
    organizationName: row.orgName,
    organizationDescription: row.orgDescription,
    organizationLogoUrl: row.orgLogoUrl,
  };
  await cacheSet(cacheKey, userWithOrg, CACHE_TTL_USER);
  return userWithOrg;
};

export const findUserByEmail = async (email: string): Promise<UserWithOrg | null> => {
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
      orgDescription: organizations.description,
      orgLogoUrl: organizations.logoUrl,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.email, email))
    .limit(1);

  if (!row) {
    await cacheSet(emailKey, "__null__", CACHE_TTL_NULL_USER);
    return null;
  }

  const userWithOrg = {
    ...row.user,
    organizationName: row.orgName,
    organizationDescription: row.orgDescription,
    organizationLogoUrl: row.orgLogoUrl,
  };
  await cacheSet(`user:${userWithOrg.id}`, userWithOrg, CACHE_TTL_USER);
  await cacheSet(emailKey, userWithOrg.id, CACHE_TTL_USER);
  return userWithOrg;
};

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const issueTokensFor = async (user: UserWithOrg, meta: SessionMeta): Promise<AuthResult> => {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    orgId: user.organizationId,
  });
  const refresh = await issueRefreshToken(user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { user: toAuthUser(user, user.organizationName), accessToken, refreshToken: refresh.raw };
};
