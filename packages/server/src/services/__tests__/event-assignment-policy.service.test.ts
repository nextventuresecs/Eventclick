import { describe, expect, it } from "vitest";
import {
  canAccessRoomByAssignment,
  canBeAssignedToEvent,
  canManageAssignments,
} from "../event-assignment-policy.service";

describe("event assignment policy", () => {
  it("allows only NGO admins to manage assignments", () => {
    expect(canManageAssignments("ngo_admin")).toBe(true);
    expect(canManageAssignments("event_admin")).toBe(false);
    expect(canManageAssignments("volunteer")).toBe(false);
  });

  it("allows only volunteers/event admins to be assignment targets", () => {
    expect(canBeAssignedToEvent("event_admin")).toBe(true);
    expect(canBeAssignedToEvent("volunteer")).toBe(true);
    expect(canBeAssignedToEvent("ngo_admin")).toBe(false);
  });

  it("enforces room scoping for event admins and volunteers, but not NGO admins", () => {
    expect(canAccessRoomByAssignment("event_admin", true)).toBe(true);
    expect(canAccessRoomByAssignment("event_admin", false)).toBe(false);
    expect(canAccessRoomByAssignment("volunteer", true)).toBe(true);
    expect(canAccessRoomByAssignment("volunteer", false)).toBe(false);
    expect(canAccessRoomByAssignment("ngo_admin", false)).toBe(true);
  });
});
