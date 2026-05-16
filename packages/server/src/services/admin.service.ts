import { and, eq, isNull } from "drizzle-orm";
import type { CreateOrgUserInput, OrgUserSummary, UserRole } from "@application/shared";
import bcryptjs from "bcryptjs";
import { db } from "../db";
import { users, orgMembers } from "../db/schema";
import { ApiError } from "../utils/errors";

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

  const passwordHash = await bcryptjs.hash(password, 10);

  const [newUser] = await db.transaction(async (tx) => {
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

    return [user];
  });

  return toOrgUser(newUser);
};
