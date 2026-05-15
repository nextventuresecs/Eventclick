import { describe, expect, it } from "vitest";
import { getRolePermissions, hasRolePermission } from "@application/shared";

describe("role permissions", () => {
  it("gives NGO admins the full management set", () => {
    expect(getRolePermissions("ngo_admin")).toEqual([
      "manage_rooms",
      "manage_live_session",
      "create_attendance_form",
      "take_attendance",
      "view_reports",
      "view_live_session",
      "share_live_link",
      "manage_users",
    ]);
  });

  it("keeps event admins focused on event operations", () => {
    expect(hasRolePermission("event_admin", "manage_live_session")).toBe(true);
    expect(hasRolePermission("event_admin", "create_attendance_form")).toBe(true);
    expect(hasRolePermission("event_admin", "view_reports")).toBe(true);
    expect(hasRolePermission("event_admin", "manage_users")).toBe(false);
  });

  it("limits volunteers to live viewing, link sharing, and attendance", () => {
    expect(getRolePermissions("volunteer")).toEqual([
      "take_attendance",
      "view_live_session",
      "share_live_link",
    ]);
    expect(hasRolePermission("volunteer", "take_attendance")).toBe(true);
    expect(hasRolePermission("volunteer", "create_attendance_form")).toBe(false);
    expect(hasRolePermission("volunteer", "manage_live_session")).toBe(false);
    expect(hasRolePermission("volunteer", "view_reports")).toBe(false);
  });
});
