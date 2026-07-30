import { Router } from "express";
import type { Request } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { deleteUserAccount } from "../services/admin.service";
import { recordAudit } from "../services/audit.service";
import { db } from "../db";
import { users, orgMembers, eventRooms, attendanceEntries, activitySubmissions, activityPhotos } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { ApiError } from "../utils/errors";

export const profileRouter = Router();

profileRouter.delete("/me/account", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!user.organizationId) {
      throw ApiError.badRequest("User is not associated with an organization");
    }

    const result = await deleteUserAccount(
      user.id,
      user.role,
      user.organizationId,
      user.id,
      (req.body as { confirmEmail?: string }).confirmEmail ?? "",
      req,
    );

    res.clearCookie("Evently_rt");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

profileRouter.get("/me/export", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const orgId = req.user!.organizationId;
    if (!orgId) {
      throw ApiError.badRequest("User is not associated with an organization");
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw ApiError.notFound("User not found");
    }

    const memberships = await db.select().from(orgMembers).where(eq(orgMembers.userId, userId));
    const rooms = await db.select().from(eventRooms).where(eq(eventRooms.organizationId, orgId));
    const roomIds = rooms.map((r) => r.id);
    const attendance = await db.select().from(attendanceEntries).where(eq(attendanceEntries.submittedBy, userId));
    const submissions = roomIds.length ? await db.select().from(activitySubmissions).where(inArray(activitySubmissions.roomId, roomIds)) : [];
    const photos = await db.select().from(activityPhotos).where(eq(activityPhotos.submittedBy, userId));

    const safe = {
      ...user,
      passwordHash: undefined,
      twoFactorSecret: undefined,
    };

    const payload = {
      exportedAt: new Date().toISOString(),
      user: safe,
      memberships,
      rooms,
      attendance,
      submissions,
      photos,
    };

    await recordAudit({
      organizationId: orgId,
      actorUserId: userId,
      action: "user.updated",
      resourceType: "user_export",
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="eventclick-export-${userId}.json"`);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});
