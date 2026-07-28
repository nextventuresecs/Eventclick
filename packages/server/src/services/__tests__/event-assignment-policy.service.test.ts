import { describe, expect, it } from "vitest";
import {
  canAccessRoomByAssignment,
  canBeAssignedToEvent,
  canManageAssignments,
} from "../event-assignment-policy.service";

describe("event assignment policy", () => {
  it("allows only admins to manage assignments", () => {
    expect(canManageAssignments("admin")).toBe(true);
    expect(canManageAssignments("event_manager")).toBe(false);
    expect(canManageAssignments("volunteer")).toBe(false);
  });

  it("allows only volunteers/event admins to be assignment targets", () => {
    expect(canBeAssignedToEvent("event_manager")).toBe(true);
    expect(canBeAssignedToEvent("volunteer")).toBe(true);
    expect(canBeAssignedToEvent("admin")).toBe(false);
  });

  it("enforces room scoping for event admins and volunteers, but not admins", () => {
    expect(canAccessRoomByAssignment("event_manager", true)).toBe(true);
    expect(canAccessRoomByAssignment("event_manager", false)).toBe(false);
    expect(canAccessRoomByAssignment("volunteer", true)).toBe(true);
    expect(canAccessRoomByAssignment("admin", false)).toBe(true);
    expect(canAccessRoomByAssignment("admin", true)).toBe(true);
  });
});
