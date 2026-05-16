import type { UserRole } from "@application/shared";

export const canManageAssignments = (role: UserRole): boolean => role === "ngo_admin";

export const canBeAssignedToEvent = (role: UserRole): boolean =>
  role === "event_admin" || role === "volunteer";

export const canAccessRoomByAssignment = (
  role: UserRole,
  assignmentExists: boolean,
): boolean => role !== "event_admin" || assignmentExists;
