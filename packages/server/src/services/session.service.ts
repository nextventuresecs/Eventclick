import { randomBytes, createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { sessions, type Session } from "../db/schema";
import { env } from "../config/env";
import { logger } from "../utils/logger";

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
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  return row ?? null;
};

export const revokeSessionFamily = async (familyId: string): Promise<void> => {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
};

export const rotateSession = async (
  current: Session,
  meta: SessionMeta,
): Promise<IssuedRefreshToken> => {
  if (current.revokedAt) {
    logger.warn({ sessionId: current.id, familyId: current.familyId }, "refresh token reuse detected — revoking family");
    await revokeSessionFamily(current.familyId);
    throw new Error("SESSION_REUSE_DETECTED");
  }
  if (current.expiresAt.getTime() < Date.now()) throw new Error("SESSION_EXPIRED");

  const next = await issueRefreshToken(current.userId, meta, current.familyId);
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), replacedById: next.sessionId })
    .where(eq(sessions.id, current.id));
  return next;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
};
