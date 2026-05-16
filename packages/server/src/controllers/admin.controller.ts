import type { RequestHandler } from "express";
import { eq, and, isNull } from "drizzle-orm";
import bcryptjs from "bcryptjs";
import { db } from "../db";
import { users, eventAssignments, eventRooms } from "../db/schema";
import { ApiError } from "../utils/errors";

const requireOrgId = (orgId: string | null | undefined): string => {
  if (!orgId) throw ApiError.unauthorized("No organization");
  return orgId;
};

export const listOrgUsers: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);

    const orgUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          isNull(users.deletedAt)
        )
      );

    res.json({ items: orgUsers });
  } catch (err) {
    next(err);
  }
};

export const createOrgUser: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);

    const { email, fullName, password, role } = req.body;

    // Validate input
    if (!email || !fullName || !password) {
      throw ApiError.badRequest("Missing required fields");
    }

    if (role && !["event_admin", "volunteer"].includes(role)) {
      throw ApiError.badRequest("Invalid role");
    }

    // Check if email already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw ApiError.conflict("Email already in use");
    }

    // Hash password
    const passwordHash = await bcryptjs.hash(password, 10);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        fullName,
        passwordHash,
        role: role || "volunteer",
        organizationId: orgId,
        isActive: true,
      })
      .returning();

    if (!newUser) throw ApiError.internal("Failed to create user");

    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role,
    });
  } catch (err) {
    next(err);
  }
};

export const listEventAssignments: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const roomId = req.params.id as string;

    // Verify room belongs to org
    const [room] = await db
      .select()
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.id, roomId),
          eq(eventRooms.organizationId, orgId)
        )
      )
      .limit(1);

    if (!room) throw ApiError.notFound("Room not found");

    const assignments = await db
      .select({
        id: eventAssignments.id,
        userId: eventAssignments.userId,
        userName: users.fullName,
        userEmail: users.email,
        role: eventAssignments.roleAtAssignment,
        isActive: eventAssignments.isActive,
        createdAt: eventAssignments.createdAt,
      })
      .from(eventAssignments)
      .innerJoin(users, eq(eventAssignments.userId, users.id))
      .where(
        and(
          eq(eventAssignments.roomId, roomId),
          eq(eventAssignments.organizationId, orgId),
          eq(eventAssignments.isActive, true)
        )
      );

    res.json({ items: assignments });
  } catch (err) {
    next(err);
  }
};

export const assignUserToEvent: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const roomId = req.params.id as string;
    const { userId, role } = req.body;

    if (!userId) throw ApiError.badRequest("userId required");

    const assignRole = role || "event_admin";
    if (!["event_admin", "volunteer"].includes(assignRole)) {
      throw ApiError.badRequest("Invalid role");
    }

    // Verify room
    const [room] = await db
      .select()
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.id, roomId),
          eq(eventRooms.organizationId, orgId)
        )
      )
      .limit(1);

    if (!room) throw ApiError.notFound("Room not found");

    // Verify user
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.organizationId, orgId)
        )
      )
      .limit(1);

    if (!user) throw ApiError.notFound("User not found");

    // Check if assignment already exists
    const existing = await db
      .select()
      .from(eventAssignments)
      .where(
        and(
          eq(eventAssignments.userId, userId),
          eq(eventAssignments.roomId, roomId),
          eq(eventAssignments.isActive, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw ApiError.conflict("User already assigned to this event");
    }

    // Create assignment
    const [assignment] = await db
      .insert(eventAssignments)
      .values({
        userId,
        roomId,
        organizationId: orgId,
        roleAtAssignment: assignRole,
        assignedBy: req.user!.id,
      })
      .returning();

    res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
};

export const revokeEventAssignment: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const roomId = req.params.id as string;
    const assignmentId = req.params.assignmentId as string;

    // Verify room
    const [room] = await db
      .select()
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.id, roomId),
          eq(eventRooms.organizationId, orgId)
        )
      )
      .limit(1);

    if (!room) throw ApiError.notFound("Room not found");

    // Revoke assignment
    const [revoked] = await db
      .update(eventAssignments)
      .set({
        isActive: false,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventAssignments.id, assignmentId),
          eq(eventAssignments.roomId, roomId),
          eq(eventAssignments.organizationId, orgId)
        )
      )
      .returning();

    if (!revoked) throw ApiError.notFound("Assignment not found");

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
