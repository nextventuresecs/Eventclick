import { and, eq, isNull } from "drizzle-orm";
import type { CreateOrgUserInput, OrgUserSummary, UserRole } from "@application/shared";
import crypto from "crypto";
import { hashPassword } from "./password.service";
import { invalidateUserCache } from "./auth.service";
import { db } from "../db";
import { users, orgMembers, emailVerifications } from "../db/schema";
import { ApiError } from "../utils/errors";
import { enqueueEmail } from "../queues/sqs.client";

export type { CreateOrgUserInput };

const toOrgUser = (row: typeof users.$inferSelect): OrgUserSummary => ({
  id: row.id,
  email: row.email,
  fullName: row.fullName,
  role: row.role,
  isActive: row.isActive,
});

/**
 * List all users belonging to an organization.
 */
export const listOrgUsersForAdmin = async (orgId: string): Promise<OrgUserSummary[]> => {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .orderBy(users.fullName);
  return rows.map(toOrgUser);
};

/**
 * Create a new user within the NGO Admin's organization.
 * - Hashes the password
 * - Checks for duplicate emails
 * - Creates user + orgMember record in a transaction
 */
export const createOrgUser = async (
  orgId: string,
  createdBy: string,
  input: CreateOrgUserInput,
): Promise<OrgUserSummary> => {
  const { email, fullName, password, role = "volunteer" } = input;

  // Check for existing user with same email
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }

  const passwordHash = await hashPassword(password);

  const newUser = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: email.toLowerCase(),
        fullName,
        passwordHash,
        role: role as UserRole,
        organizationId: orgId,
        isActive: true,
      })
      .returning();

    if (!user) throw ApiError.internal("Failed to create user");

    // Also create orgMember record
    await tx.insert(orgMembers).values({
      userId: user.id,
      organizationId: orgId,
      role: role as UserRole,
      invitedBy: createdBy,
    });

    // Generate Email Verification Token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await tx.insert(emailVerifications).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    (user as any)._verificationToken = token;

    return user;
  });

  await enqueueEmail({
    type: "verification",
    email: newUser.email,
    token: (newUser as any)._verificationToken,
  });

  await invalidateUserCache(newUser.id, newUser.email);

  return toOrgUser(newUser);
};
