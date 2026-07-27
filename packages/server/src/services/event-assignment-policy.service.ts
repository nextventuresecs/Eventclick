import type { UserRole } from "@application/shared";
import { hasRolePermission } from "@application/shared";

export const canManageAssignments = (role: UserRole): boolean => role === "admin";

export const canBeAssignedToEvent = (role: UserRole): boolean =>
  role === "event_manager" || role === "volunteer";

/** admin bypasses assignment check; event_manager + volunteer need assignment */
export const requiresRoomAssignment = (role: UserRole): boolean =>
  !hasRolePermission(role, "manage_users");

export const canAccessRoomByAssignment = (
  role: UserRole,
  assignmentExists: boolean,
): boolean => !requiresRoomAssignment(role) || assignmentExists;
