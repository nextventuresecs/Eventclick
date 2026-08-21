import { and, eq, isNull } from "drizzle-orm";
import type { CreateOrgUserInput, OrgUserSummary, UserRole } from "@application/shared";
import { ChannelRouter, NotificationPreferencesSchema } from "@application/shared";
import type { Request } from "express";
import crypto from "crypto";
import argon2 from "argon2";
import { invalidateUserCache } from "./auth";
import { db, authDb } from "../db";
import { users, orgMembers, emailVerifications, organizations } from "../db/schema";
import { ApiError } from "../utils/errors";
import { dispatchEmail } from "./email-delivery.service";
import { notificationService } from "./notification.service";
import { recordAudit } from "./audit.service";
import { logger } from "../utils/logger";

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
 * Create a new user within the Admin's organization.
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

  // Admin can optionally set the invited user's initial password. When
  // omitted, the user has no usable password until they follow the
  // USER_INVITED magic link and set one themselves (POST /auth/set-password
  // — see verifyEmailToken's passwordSetupRequired flag).
  const passwordHash = password ? await argon2.hash(password) : null;

  // authDb (auth_svc_role, BYPASSRLS), not db: email_verifications is an
  // auth-realm table with no RLS policy and no grant to app_user (same
  // treatment as sessions/password_resets — see #69's email_deliveries for
  // the same reasoning). Running this whole transaction on the tenant/RLS
  // pool would 42501 on the emailVerifications insert; registerUser in
  // auth-registration.service.ts uses the identical authDb.transaction
  // pattern for the same reason. RLS bypass here is safe: organizationId is
  // the server-trusted `orgId` param, not client input.
  const { user: newUser, token } = await authDb.transaction(async (tx) => {
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
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(verificationToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await tx.insert(emailVerifications).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return { user, token: verificationToken };
  });

  // The user is already committed — route the USER_INVITED event through
  // ChannelRouter (respecting the invitee's notification preferences, which
  // are the defaults for a brand-new user) and dispatch each channel
  // independently. A failure in either must not fail the admin's
  // create-user request — the email's delivery row can be re-driven later,
  // and a missed in-app row just means the user sees history on next fetch.
  const prefsResult = NotificationPreferencesSchema.safeParse(newUser.preferences ?? {});
  const channels = ChannelRouter(
    {
      type: "USER_INVITED",
      scope: { kind: "user", userId: newUser.id },
      payload: { invitedEmail: newUser.email, inviteToken: token, invitedBy: createdBy },
    },
    prefsResult.success ? prefsResult.data : NotificationPreferencesSchema.parse({}),
  );

  if (channels.includes("email")) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    await dispatchEmail({
      userId: newUser.id,
      recipientEmail: newUser.email,
      type: "invite",
      payload: { token, orgName: org?.name ?? "Eventclick" },
    }).catch((err) => {
      logger.error({ err, userId: newUser.id, event: "email.dispatch_failed" }, "Failed to dispatch invite email");
    });
  }

  if (channels.includes("in_app")) {
    // Deliberately does not include the raw verification token in metadata
    // — it's a working login credential and shouldn't be persisted anywhere
    // beyond the emailVerifications row and the one-time email that carries it.
    await notificationService
      .createNotification({
        userId: newUser.id,
        organizationId: orgId,
        type: "USER_INVITED",
        title: "You've been invited",
        message: `You've been added as a ${role} to this organization on Eventclick.`,
        metadata: { invitedBy: createdBy },
      })
      .catch((err) => {
        logger.error({ err, userId: newUser.id, event: "notification.dispatch_failed" }, "Failed to create USER_INVITED notification");
      });
  }

  await invalidateUserCache(newUser.id, newUser.email);

  return toOrgUser(newUser);
};

/**
 * Role-specific account deletion logic:
 * - Self deletion: Allowed for any user.
 * - Admin: Can delete any event_admin or volunteer in their org.
 * - Event Admin: Can delete a volunteer ONLY IF that volunteer was created/invited by this specific Event Admin.
 */
export const deleteUserAccount = async (
  requesterId: string,
  requesterRole: UserRole,
  orgId: string | null,
  targetUserId: string,
  confirmEmail: string,
  req?: Request,
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

    if (requesterRole === "admin") {
      // Admin can delete event_manager or volunteer, but not another admin
      if (targetUser.role === "admin") {
        throw ApiError.forbidden("Cannot delete another administrator");
      }
    } else if (requesterRole === "event_manager") {
      // Event Admin can ONLY delete volunteers added by them
      if (targetUser.role !== "volunteer") {
        throw ApiError.forbidden("Event Managers can only delete Volunteer accounts");
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
  } else if (requesterRole === "admin" && orgId) {
    // Self-deletion for admin: check if sole admin
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin"), isNull(users.deletedAt)));
    
    if (admins.length <= 1) {
      throw ApiError.badRequest("Cannot delete account: you are the sole active administrator of this organization.");
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

  const auditOrgId = orgId ?? targetUser.organizationId;
  if (!auditOrgId) {
    throw ApiError.internal("Cannot record audit log: missing organization context");
  }

  await recordAudit({
    organizationId: auditOrgId,
    actorUserId: requesterId,
    actorEmail: req?.user?.email,
    action: "user.deleted",
    resourceType: "user",
    resourceId: targetUserId,
    oldValues: { email: targetUser.email, role: targetUser.role },
    ipAddress: req?.ip,
    userAgent: req?.get("user-agent"),
  });

  return { success: true, message: "User account deleted successfully" };
};
