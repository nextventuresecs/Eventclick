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

/**
 * Role-specific account deletion logic:
 * - Self deletion: Allowed for any user.
 * - NGO Admin: Can delete any event_admin or volunteer in their org.
 * - Event Admin: Can delete a volunteer ONLY IF that volunteer was created/invited by this specific Event Admin.
 */
export const deleteUserAccount = async (
  requesterId: string,
  requesterRole: UserRole,
  orgId: string | null,
  targetUserId: string,
  confirmEmail: string,
): Promise<{ success: boolean; message: string }> => {
  // 1. Fetch target user
  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1);

  if (!targetUser) {
    throw ApiError.notFound("User account not found or already deleted");
  }

  // 2. Confirmation email match check
  if (confirmEmail.toLowerCase().trim() !== targetUser.email.toLowerCase().trim()) {
    throw ApiError.badRequest("Confirmation email does not match the target account email");
  }

  const isSelf = requesterId === targetUserId;

  if (!isSelf) {
    if (!orgId || targetUser.organizationId !== orgId) {
      throw ApiError.forbidden("Target user belongs to another organization");
    }

    if (requesterRole === "ngo_admin") {
      // NGO Admin can delete event_admin or volunteer, but not another ngo_admin
      if (targetUser.role === "ngo_admin") {
        throw ApiError.forbidden("Cannot delete another Organization Admin account");
      }
    } else if (requesterRole === "event_admin") {
      // Event Admin can ONLY delete volunteers added by them
      if (targetUser.role !== "volunteer") {
        throw ApiError.forbidden("Event Admins can only delete Volunteer accounts");
      }

      const [membership] = await db
        .select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.userId, targetUserId),
            eq(orgMembers.organizationId, orgId),
            eq(orgMembers.invitedBy, requesterId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw ApiError.forbidden(
          "You can only delete Volunteer accounts that you personally added to the organization",
        );
      }
    } else {
      throw ApiError.forbidden("Volunteers cannot delete other user accounts");
    }
  }

  // 3. Perform soft delete
  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetUserId));

  // 4. Invalidate auth cache
  await invalidateUserCache(targetUserId, targetUser.email);

  return { success: true, message: "User account deleted successfully" };
};
