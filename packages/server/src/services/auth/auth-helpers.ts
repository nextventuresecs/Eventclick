import { eq } from "drizzle-orm";
import type { AuthUser } from "@application/shared";
import { buildMediaPath } from "@application/shared";
import { isUploadedObjectUrl } from "../../utils/storage-keys";
import { authDb } from "../../db";
import { users, organizations, type User } from "../../db/schema";
import { signAccessToken } from "../jwt.service";
import { issueRefreshToken, type SessionMeta } from "../session.service";
import { redisClient } from "../../config/redis";
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

/**
 * Presents a stored image URL the way the client can actually load it.
 *
 * The uploads bucket is private, so a URL pointing into it cannot be used as
 * an `<img src>` — the request arrives unauthenticated and the object store
 * refuses it. Our own uploads are therefore handed out as a media path, which
 * the client resolves to a short-lived signed URL through the authenticated
 * media route.
 *
 * A preset or pasted external URL is returned untouched: it is already
 * loadable, and routing it through the media route would sign a key that does
 * not exist.
 */
export const presentImageUrl = (
  storedUrl: string | null | undefined,
  resource: "user-avatar" | "org-logo",
  id: string | null,
): string | null => {
  if (!storedUrl) return null;
  if (!isUploadedObjectUrl(storedUrl)) return storedUrl;
  return id ? buildMediaPath(resource, id) : null;
};

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
  organizationLogoUrl: presentImageUrl(orgLogoUrl, "org-logo", u.organizationId),
  emailVerified: u.emailVerifiedAt !== null,
  preferences: u.preferences,
  photoUrl: presentImageUrl(u.photoUrl, "user-avatar", u.id),
});

export type UserWithOrg = User & {
  organizationName?: string | null;
  organizationDescription?: string | null;
  organizationLogoUrl?: string | null;
};

export const invalidateUserCache = async (userId: string, email?: string): Promise<void> => {
  if (!redisClient.isOpen) return;
  await redisClient.del(`user:${userId}`);
  if (email) {
    await redisClient.del(`email:${email.toLowerCase().trim()}`);
  }
};

export const findUserById = async (id: string): Promise<UserWithOrg | null> => {
  const cacheKey = `user:${id}`;
  let cached: any = null;
  
  if (redisClient.isOpen) {
    const rawCache = await redisClient.get(cacheKey);
    if (rawCache) {
      try {
        cached = JSON.parse(rawCache);
      } catch {
        cached = rawCache;
      }
    }
  }

  if (cached !== null) {
    if (cached === "__null__") return null;
    if (typeof cached === "object") {
      if (cached.createdAt) cached.createdAt = new Date(cached.createdAt);
      if (cached.updatedAt) cached.updatedAt = new Date(cached.updatedAt);
      if (cached.emailVerifiedAt) cached.emailVerifiedAt = new Date(cached.emailVerifiedAt);
      if (cached.lastLoginAt) cached.lastLoginAt = new Date(cached.lastLoginAt);
      return cached as UserWithOrg;
    }
  }

  const [row] = await authDb
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
    if (redisClient.isOpen) await redisClient.setEx(cacheKey, CACHE_TTL_NULL_USER, "__null__");
    return null;
  }

  const userWithOrg = {
    ...row.user,
    organizationName: row.orgName,
    organizationDescription: row.orgDescription,
    organizationLogoUrl: row.orgLogoUrl,
  };
  if (redisClient.isOpen) await redisClient.setEx(cacheKey, CACHE_TTL_USER, JSON.stringify(userWithOrg));
  return userWithOrg;
};

export const findUserByEmail = async (email: string): Promise<UserWithOrg | null> => {
  const emailKey = `email:${email.toLowerCase().trim()}`;
  let cachedUserId: string | null = null;
  
  if (redisClient.isOpen) {
    cachedUserId = await redisClient.get(emailKey);
  }

  if (cachedUserId) {
    if (cachedUserId === "__null__") return null;
    const user = await findUserById(cachedUserId);
    if (user) return user;
  }

  const [row] = await authDb
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
    if (redisClient.isOpen) await redisClient.setEx(emailKey, CACHE_TTL_NULL_USER, "__null__");
    return null;
  }

  const userWithOrg = {
    ...row.user,
    organizationName: row.orgName,
    organizationDescription: row.orgDescription,
    organizationLogoUrl: row.orgLogoUrl,
  };
  if (redisClient.isOpen) {
    await redisClient.setEx(`user:${userWithOrg.id}`, CACHE_TTL_USER, JSON.stringify(userWithOrg));
    await redisClient.setEx(emailKey, CACHE_TTL_USER, userWithOrg.id);
  }
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
  await authDb.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return {
    user: toAuthUser(user, user.organizationName, user.organizationDescription, user.organizationLogoUrl),
    accessToken,
    refreshToken: refresh.raw,
  };
};
