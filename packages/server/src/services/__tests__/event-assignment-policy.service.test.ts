import { describe, expect, it } from "vitest";
import {
  canAccessRoomByAssignment,
  canBeAssignedToEvent,
  canManageAssignments,
  isSelfAssignment,
} from "../event-assignment-policy.service";

describe("event assignment policy", () => {
  it("allows only NGO admins to manage assignments", () => {
    expect(canManageAssignments("ngo_admin")).toBe(true);
    expect(canManageAssignments("event_admin")).toBe(false);
    expect(canManageAssignments("volunteer")).toBe(false);
  });

  it("prevents self-assignment attempts", () => {
    expect(isSelfAssignment("user-1", "user-1")).toBe(true);
    expect(isSelfAssignment("user-1", "user-2")).toBe(false);
  });

  it("allows only volunteers/event admins to be assignment targets", () => {
    expect(canBeAssignedToEvent("event_admin")).toBe(true);
    expect(canBeAssignedToEvent("volunteer")).toBe(true);
    expect(canBeAssignedToEvent("ngo_admin")).toBe(false);
  });

  it("enforces room scoping for event admins only", () => {
    expect(canAccessRoomByAssignment("event_admin", ["room-1"], "room-1")).toBe(true);
    expect(canAccessRoomByAssignment("event_admin", ["room-1"], "room-2")).toBe(false);
    expect(canAccessRoomByAssignment("ngo_admin", [], "room-2")).toBe(true);
    expect(canAccessRoomByAssignment("volunteer", [], "room-2")).toBe(true);
  });
});
