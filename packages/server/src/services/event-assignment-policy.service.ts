import type { UserRole } from "@application/shared";

export const canManageAssignments = (role: UserRole): boolean => role === "ngo_admin";

export const canBeAssignedToEvent = (role: UserRole): boolean =>
  role === "event_admin" || role === "volunteer";

export const canAccessRoomByAssignment = (
  role: UserRole,
  assignedRoomIds: readonly string[],
  roomId: string,
): boolean => role !== "event_admin" || assignedRoomIds.includes(roomId);
