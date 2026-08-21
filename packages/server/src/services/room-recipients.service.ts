import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { eventAdminAssignments, users } from "../db/schema";

/**
 * Shared recipient-resolution for room-scoped notification fan-out: the
 * room's creator plus non-revoked event_admin_assignments, deduped, active,
 * not soft-deleted. There is no general room-attendee table today, so
 * "eventMembers" for a room resolves to assigned staff, not every attendee.
 *
 * Used by every room-scoped notification dispatcher (event-stream state
 * changes, attendance window open/closing, event started/ended) — resolve
 * once here rather than reimplementing the same two queries per caller.
 */
export const resolveRoomStaffRecipients = async (roomId: string, createdBy: string) => {
  const assignments = await db
    .select({ userId: eventAdminAssignments.userId })
    .from(eventAdminAssignments)
    .where(and(eq(eventAdminAssignments.roomId, roomId), isNull(eventAdminAssignments.revokedAt)));

  const recipientIds = [...new Set([createdBy, ...assignments.map((a) => a.userId)])];

  return db
    .select()
    .from(users)
    .where(and(inArray(users.id, recipientIds), isNull(users.deletedAt), eq(users.isActive, true)));
};
