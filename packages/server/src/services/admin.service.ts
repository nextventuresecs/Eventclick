import { and, count, eq, isNull } from "drizzle-orm";
import type {
  CreateOrgUserInput,
  OrgUserPage,
  OrgUserQuery,
  OrgUserSummary,
  UserRole,
} from "@application/shared";
import { ChannelRouter, NotificationPreferencesSchema } from "@application/shared";
import type { Request } from "express";
import crypto from "crypto";
import argon2 from "argon2";
import { invalidateUserCache } from "./auth";
import { db, authDb } from "../db";
import { users, orgMembers, emailVerifications, organizations } from "../db/schema";
import { ApiError, isUniqueViolation } from "../utils/errors";
import { dispatchEmail } from "./email-delivery.service";
import { notificationService } from "./notification.service";
import { recordAudit, recordAuditSafely } from "./audit.service";
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
/**
 * One page of an organisation's users.
 *
 * This was the last unbounded list query in the service: every non-deleted
 * user, no limit, no offset — a slow query and a very large JSON response for
 * a large tenant.
 *
 * **Ordering is `(fullName, id)`, not `fullName` alone.** Names are not
 * unique, and with a non-unique sort key Postgres is free to return tied rows
 * in a different order per query — so under `LIMIT`/`OFFSET` a user with a
 * duplicate name can appear on two consecutive pages while another is never
 * shown at all. The `id` tiebreaker makes the order total, which is what
 * makes paging safe.
 */
export const listOrgUsersForAdmin = async (
  orgId: string,
  query: OrgUserQuery,
): Promise<OrgUserPage> => {
  const where = and(eq(users.organizationId, orgId), isNull(users.deletedAt));

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(users.fullName, users.id)
    .limit(query.limit)
    .offset(query.offset);

  const [totals] = await db.select({ value: count() }).from(users).where(where);

  return {
    items: rows.map(toOrgUser),
    total: totals?.value ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
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

  // Fast path only. `db` is the RLS pool, so this sees users in *this* org;
  // users_email_unique is global. A duplicate belonging to another tenant is
  // invisible here and only surfaces as a 23505 on the insert below — as does
  // a concurrent create that lands between this check and that insert.
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
  const created = await authDb
    .transaction(async (tx) => {
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
    })
    .catch((error: unknown) => {
      // Escaped as a 500 before this (Sentry EVENTCLICK-SERVER-8). The
      // duplicate is a client-correctable condition, so it gets the same 409
      // the pre-check returns; the message stays generic rather than
      // confirming which tenant already holds the address.
      if (isUniqueViolation(error, "users_email_unique")) {
        throw ApiError.conflict("A user with this email already exists");
      }
      throw error;
    });

  const { user: newUser, token } = created;

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

  // No request metadata here: this is a service, and threading `req` through
  // only for the audit entry would be worse than the gap it fills. The two
  // existing call sites that do have a request pass ip/userAgent; this one
  // records who and what, which is the part an auditor asks about.
  await recordAuditSafely({
    organizationId: orgId,
    actorUserId: createdBy,
    action: "user.created",
    resourceType: "user",
    resourceId: newUser.id,
    newValues: { email: newUser.email, fullName: newUser.fullName, role: newUser.role },
  });

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
