import type { EventRoom } from "@application/shared";
import { type EventRoomRow } from "../../db/schema";
import { env } from "../../config/env";
import { ApiError } from "../../utils/errors";

export const toEventRoom = (row: EventRoomRow): EventRoom => ({
  id: row.id,
  organizationId: row.organizationId,
  createdBy: row.createdBy,
  title: row.title,
  description: row.description,
  status: row.status,
  scheduledStart: row.scheduledStart.toISOString(),
  scheduledEnd: row.scheduledEnd.toISOString(),
  actualStart: row.actualStart?.toISOString() ?? null,
  actualEnd: row.actualEnd?.toISOString() ?? null,
  maxParticipants: row.maxParticipants,
  shareToken: row.shareToken,
  shareUrl: `${env.APP_URL}/watch/${row.shareToken}`,
  streamProvider: row.streamProvider,
  youtubeWatchUrl: row.youtubeWatchUrl,
  youtubeEmbedUrl: row.youtubeEmbedUrl,
  attendanceWindowBefore: row.attendanceWindowBefore,
  attendanceWindowAfter: row.attendanceWindowAfter,
  notifyEmailOnStart: row.notifyEmailOnStart,
  location: row.location ?? null,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  activityDefinitions: row.activityDefinitions,
  cancellationReason: row.cancellationReason ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};
