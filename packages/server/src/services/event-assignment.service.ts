import { and, desc, eq, isNull } from "drizzle-orm";
import type { EventAdminAssignment, OrgUserSummary, UserRole } from "@application/shared";
import { db } from "../db";
import {
  eventAdminAssignments,
  eventRooms,
  orgMembers,
  users,
  type EventAdminAssignmentRow,
} from "../db/schema";
import { ApiError } from "../utils/errors";
import {
  canAccessRoomByAssignment,
  canBeAssignedToEvent,
} from "./event-assignment-policy.service";

interface UserPrincipal {
  id: string;
  role: UserRole;
  organizationId: string | null;
}

const toOrgUser = (row: typeof users.$inferSelect): OrgUserSummary => ({
  id: row.id,
  email: row.email,
  fullName: row.fullName,
  role: row.role,
  isActive: row.isActive,
});

const requireRoomInOrg = async (roomId: string, orgId: string): Promise<void> => {
  const [room] = await db
    .select({ id: eventRooms.id })
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);
  if (!room) throw ApiError.notFound("Room not found");
};

const requireOrgUser = async (
  userId: string,
  orgId: string,
): Promise<{
  id: string;
  role: UserRole;
  isActive: boolean;
}> => {
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) throw ApiError.notFound("User not found in your organization");
  return row;
};

const toAssignment = (
  row: EventAdminAssignmentRow & {
    user: typeof users.$inferSelect;
    room: {
      id: string;
      title: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      status: "scheduled" | "live" | "ended" | "cancelled";
    };
  },
): EventAdminAssignment => ({
  id: row.id,
  organizationId: row.organizationId,
  userId: row.userId,
  roomId: row.roomId,
  assignedRole: row.assignedRole,
  assignedBy: row.assignedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
  user: toOrgUser(row.user),
  room: {
    id: row.room.id,
    title: row.room.title,
    scheduledStart: row.room.scheduledStart.toISOString(),
    scheduledEnd: row.room.scheduledEnd.toISOString(),
    status: row.room.status,
  },
});

export const listOrgUsers = async (orgId: string): Promise<OrgUserSummary[]> => {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .orderBy(users.fullName);
  return rows.map(toOrgUser);
};

export const listEventAssignments = async (orgId: string): Promise<EventAdminAssignment[]> => {
  const rows = await db
    .select({
      assignment: eventAdminAssignments,
      user: users,
      room: {
        id: eventRooms.id,
        title: eventRooms.title,
        scheduledStart: eventRooms.scheduledStart,
        scheduledEnd: eventRooms.scheduledEnd,
        status: eventRooms.status,
      },
    })
    .from(eventAdminAssignments)
    .innerJoin(users, eq(users.id, eventAdminAssignments.userId))
    .innerJoin(eventRooms, eq(eventRooms.id, eventAdminAssignments.roomId))
    .where(
      and(
        eq(eventAdminAssignments.organizationId, orgId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .orderBy(desc(eventAdminAssignments.updatedAt));

  return rows.map((row) =>
    toAssignment({
      ...row.assignment,
      user: row.user,
      room: row.room,
    }),
  );
};

interface AssignmentMutation {
  orgId: string;
  assignedBy: string;
  userId: string;
  roomId: string;
}

export const assignEventAdminToRoom = async ({
  orgId,
  assignedBy,
  userId,
  roomId,
}: AssignmentMutation): Promise<EventAdminAssignment> => {
  await requireRoomInOrg(roomId, orgId);
  const user = await requireOrgUser(userId, orgId);

  if (!user.isActive) throw ApiError.badRequest("Cannot assign an inactive user");
  if (!canBeAssignedToEvent(user.role)) {
    throw ApiError.badRequest("Only volunteers or event admins can be assigned");
  }

  await db.transaction(async (tx) => {
    if (user.role !== "event_admin") {
      await tx
        .update(users)
        .set({ role: "event_admin", updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await tx
        .update(orgMembers)
        .set({ role: "event_admin", updatedAt: new Date() })
        .where(and(eq(orgMembers.userId, user.id), eq(orgMembers.organizationId, orgId)));
    }

    await tx
      .insert(eventAdminAssignments)
      .values({
        organizationId: orgId,
        userId,
        roomId,
        assignedRole: "event_admin",
        assignedBy,
      })
      .onConflictDoUpdate({
        target: [eventAdminAssignments.userId, eventAdminAssignments.roomId],
        set: {
          revokedAt: null,
          assignedRole: "event_admin",
          assignedBy,
          updatedAt: new Date(),
        },
      });
  });

  const [row] = await db
    .select({
      assignment: eventAdminAssignments,
      user: users,
      room: {
        id: eventRooms.id,
        title: eventRooms.title,
        scheduledStart: eventRooms.scheduledStart,
        scheduledEnd: eventRooms.scheduledEnd,
        status: eventRooms.status,
      },
    })
    .from(eventAdminAssignments)
    .innerJoin(users, eq(users.id, eventAdminAssignments.userId))
    .innerJoin(eventRooms, eq(eventRooms.id, eventAdminAssignments.roomId))
    .where(
      and(
        eq(eventAdminAssignments.organizationId, orgId),
        eq(eventAdminAssignments.userId, userId),
        eq(eventAdminAssignments.roomId, roomId),
      ),
    )
    .limit(1);

  if (!row) throw ApiError.internal("Failed to persist event assignment");
  return toAssignment({ ...row.assignment, user: row.user, room: row.room });
};

export const updateEventAssignmentRoom = async ({
  orgId,
  assignmentId,
  roomId,
  assignedBy,
}: {
  orgId: string;
  assignmentId: string;
  roomId: string;
  assignedBy: string;
}): Promise<EventAdminAssignment> => {
  await requireRoomInOrg(roomId, orgId);

  const [updated] = await db
    .update(eventAdminAssignments)
    .set({
      roomId,
      assignedBy,
      revokedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(eventAdminAssignments.id, assignmentId), eq(eventAdminAssignments.organizationId, orgId)))
    .returning({ id: eventAdminAssignments.id });

  if (!updated) throw ApiError.notFound("Assignment not found");

  const [row] = await db
    .select({
      assignment: eventAdminAssignments,
      user: users,
      room: {
        id: eventRooms.id,
        title: eventRooms.title,
        scheduledStart: eventRooms.scheduledStart,
        scheduledEnd: eventRooms.scheduledEnd,
        status: eventRooms.status,
      },
    })
    .from(eventAdminAssignments)
    .innerJoin(users, eq(users.id, eventAdminAssignments.userId))
    .innerJoin(eventRooms, eq(eventRooms.id, eventAdminAssignments.roomId))
    .where(eq(eventAdminAssignments.id, assignmentId))
    .limit(1);

  if (!row) throw ApiError.internal("Failed to load updated assignment");
  return toAssignment({ ...row.assignment, user: row.user, room: row.room });
};

export const revokeEventAssignment = async (
  orgId: string,
  assignmentId: string,
): Promise<void> => {
  const [updated] = await db
    .update(eventAdminAssignments)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(eventAdminAssignments.id, assignmentId),
        eq(eventAdminAssignments.organizationId, orgId),
        isNull(eventAdminAssignments.revokedAt),
      ),
    )
    .returning({ id: eventAdminAssignments.id });

  if (!updated) throw ApiError.notFound("Assignment not found");
};

export const listAssignedRoomIdsForEventAdmin = async (
  orgId: string,
  userId: string,
): Promise<string[]> => {
  const rows = await db
    .select({ roomId: eventAdminAssignments.roomId })
    .from(eventAdminAssignments)
    .innerJoin(eventRooms, eq(eventRooms.id, eventAdminAssignments.roomId))
    .where(
      and(
        eq(eventAdminAssignments.organizationId, orgId),
        eq(eventAdminAssignments.userId, userId),
        isNull(eventAdminAssignments.revokedAt),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    );
  return rows.map((row) => row.roomId);
};

export const assertRoomAccessForUser = async (
  user: UserPrincipal,
  orgId: string,
  roomId: string,
): Promise<void> => {
  await requireRoomInOrg(roomId, orgId);
  if (user.role !== "event_admin") return;

  const [row] = await db
    .select({ id: eventAdminAssignments.id })
    .from(eventAdminAssignments)
    .where(
      and(
        eq(eventAdminAssignments.organizationId, orgId),
        eq(eventAdminAssignments.userId, user.id),
        eq(eventAdminAssignments.roomId, roomId),
        isNull(eventAdminAssignments.revokedAt),
      ),
    )
    .limit(1);

  if (!canAccessRoomByAssignment(user.role, row ? [roomId] : [], roomId)) {
    throw ApiError.forbidden("Room is not assigned to this Event Admin");
  }
};
