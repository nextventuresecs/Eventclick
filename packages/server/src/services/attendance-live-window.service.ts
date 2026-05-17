import type { RoomStatus } from "@application/shared";

export const buildLiveAttendanceWindow = (
  actualStart: Date | null,
  actualEnd: Date | null,
): { start: Date; end: Date | null } | null => {
  if (!actualStart) return null;
  return { start: actualStart, end: actualEnd };
};

export const isWithinAttendanceWindow = (
  room: {
    status: RoomStatus;
    scheduledStart: Date;
    scheduledEnd: Date;
    actualStart: Date | null;
    actualEnd: Date | null;
  },
  now: Date,
  beforeMinutes: number,
  afterMinutes: number,
): boolean => {
  if (room.status === "cancelled") {
    return false;
  }

  if (room.status === "live") {
    if (room.actualEnd) {
      const endLimit = new Date(room.actualEnd.getTime() + afterMinutes * 60 * 1000);
      return now <= endLimit;
    }
    return true;
  }

  if (room.status === "ended") {
    if (!room.actualEnd) return false;
    const endLimit = new Date(room.actualEnd.getTime() + afterMinutes * 60 * 1000);
    return now <= endLimit;
  }

  if (room.status === "scheduled") {
    const startLimit = new Date(room.scheduledStart.getTime() - beforeMinutes * 60 * 1000);
    return now >= startLimit && now <= room.scheduledEnd;
  }

  return false;
};

