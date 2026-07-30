import { randomBytes, createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { sessions, type Session } from "../db/schema";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/errors";
import { cacheGet, cacheSet, cacheDel } from "./cache.service";

const REFRESH_BYTES = 48;

export interface IssuedRefreshToken {
  raw: string;
  sessionId: string;
  familyId: string;
}

const hashToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");

const parseTtlToMs = (ttl: string): number => {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return value * multiplier;
};

export const refreshTtlMs = parseTtlToMs(env.JWT_REFRESH_TTL);

export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export const issueRefreshToken = async (
  userId: string,
  meta: SessionMeta,
  familyId: string = randomUUID(),
): Promise<IssuedRefreshToken> => {
  const raw = randomBytes(REFRESH_BYTES).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + refreshTtlMs);

  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      familyId,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error("Failed to persist session");
  return { raw, sessionId: row.id, familyId };
};

export const findActiveSessionByToken = async (raw: string): Promise<Session | null> => {
  const tokenHash = hashToken(raw);
  const cacheKey = `session:token:${tokenHash}`;

  const cached = await cacheGet<Session>(cacheKey);
  if (cached !== null) {
    if (cached === "__null__") return null;
    if (cached.expiresAt) cached.expiresAt = new Date(cached.expiresAt);
    if (cached.createdAt) cached.createdAt = new Date(cached.createdAt);
    if (cached.revokedAt) cached.revokedAt = new Date(cached.revokedAt);

    return cached;
  }

  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!row) {
    await cacheSet(cacheKey, "__null__", 30);
    return null;
  }

  const remainingSeconds = Math.max(0, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000));
  const ttl = Math.min(300, remainingSeconds);
  if (ttl > 0) {
    await cacheSet(cacheKey, row, ttl);
  }

  return row;
};

export const revokeSessionFamily = async (familyId: string): Promise<void> => {
  const rows = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));

  for (const row of rows) {
    await cacheDel(`session:token:${row.tokenHash}`);
  }
};

export const revokeAllUserSessions = async (userId: string): Promise<void> => {
  const rows = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

  for (const row of rows) {
    await cacheDel(`session:token:${row.tokenHash}`);
  }
};

export const rotateSession = async (
  current: Session,
  meta: SessionMeta,
): Promise<IssuedRefreshToken> => {
  if (current.revokedAt) {
    logger.warn({ sessionId: current.id, familyId: current.familyId }, "refresh token reuse detected — revoking family");
    await revokeSessionFamily(current.familyId);
    throw ApiError.unauthorized("Session compromised — please log in again");
  }
  if (current.expiresAt.getTime() < Date.now()) throw ApiError.unauthorized("Session expired");

  const next = await issueRefreshToken(current.userId, meta, current.familyId);
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), replacedById: next.sessionId })
    .where(eq(sessions.id, current.id));

  // Invalidate cache for rotated session
  await cacheDel(`session:token:${current.tokenHash}`);

  return next;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  const [row] = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));

  if (row) {
    await cacheDel(`session:token:${row.tokenHash}`);
  }
};
