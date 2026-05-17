import type { UserRole } from "@application/shared";
import { hasRolePermission } from "@application/shared";

export const canManageAssignments = (role: UserRole): boolean => role === "ngo_admin";

export const canBeAssignedToEvent = (role: UserRole): boolean =>
  role === "event_admin" || role === "volunteer";

/** ngo_admin bypasses assignment check; event_admin + volunteer need assignment */
export const requiresRoomAssignment = (role: UserRole): boolean =>
  !hasRolePermission(role, "manage_users");

export const canAccessRoomByAssignment = (
  role: UserRole,
  assignmentExists: boolean,
): boolean => !requiresRoomAssignment(role) || assignmentExists;
