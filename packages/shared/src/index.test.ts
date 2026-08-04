import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  CreateRoomSchema,
  FormFieldSchema,
  UserRoleSchema,
  RoomStatusSchema,
  FieldTypeSchema,
  getRolePermissions,
  hasRolePermission,
  extractYouTubeVideoId,
} from "../src/index";

describe("Zod schema validation", () => {
  describe("RegisterSchema", () => {
    it("accepts valid input", () => {
      const result = RegisterSchema.safeParse({
        email: "admin@eventclick.live",
        password: "SecurePass123!",
        fullName: "Admin User",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = RegisterSchema.safeParse({
        email: "not-an-email",
        password: "SecurePass123!",
        fullName: "Admin User",
      });
      expect(result.success).toBe(false);
    });

    it("rejects weak password", () => {
      const result = RegisterSchema.safeParse({
        email: "admin@eventclick.live",
        password: "123",
        fullName: "Admin User",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LoginSchema", () => {
    it("accepts valid credentials", () => {
      const result = LoginSchema.safeParse({
        email: "admin@eventclick.live",
        password: "SecurePass123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty password", () => {
      const result = LoginSchema.safeParse({
        email: "admin@eventclick.live",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateRoomSchema", () => {
    it("accepts valid room payload", () => {
      const result = CreateRoomSchema.safeParse({
        title: "Flood Relief",
        scheduledStart: "2026-07-17T09:00:00Z",
        scheduledEnd: "2026-07-17T12:00:00Z",
        activityDefinitions: [
          { id: "photo", title: "Supplies", min_photos: 1 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects end before start", () => {
      const result = CreateRoomSchema.safeParse({
        title: "Flood Relief",
        scheduledStart: "2026-07-17T12:00:00Z",
        scheduledEnd: "2026-07-17T09:00:00Z",
        activityDefinitions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("FormFieldSchema", () => {
    it("accepts text field without options", () => {
      const result = FormFieldSchema.safeParse({
        id: "name",
        label: "Full Name",
        type: "text",
        required: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects select without options", () => {
      const result = FormFieldSchema.safeParse({
        id: "supplies",
        label: "Supplies",
        type: "select",
        required: true,
        options: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts select with options", () => {
      const result = FormFieldSchema.safeParse({
        id: "supplies",
        label: "Supplies",
        type: "select",
        required: true,
        options: ["Food", "Water"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("UserRoleSchema", () => {
    it("accepts valid roles", () => {
      expect(UserRoleSchema.safeParse("admin").success).toBe(true);
      expect(UserRoleSchema.safeParse("event_manager").success).toBe(true);
      expect(UserRoleSchema.safeParse("volunteer").success).toBe(true);
    });

    it("rejects invalid role", () => {
      expect(UserRoleSchema.safeParse("superadmin").success).toBe(false);
    });
  });

  describe("RoomStatusSchema", () => {
    it("accepts valid statuses", () => {
      expect(RoomStatusSchema.safeParse("scheduled").success).toBe(true);
      expect(RoomStatusSchema.safeParse("live").success).toBe(true);
      expect(RoomStatusSchema.safeParse("ended").success).toBe(true);
    });
  });

  describe("FieldTypeSchema", () => {
    it("accepts valid field types", () => {
      expect(FieldTypeSchema.safeParse("text").success).toBe(true);
      expect(FieldTypeSchema.safeParse("number").success).toBe(true);
      expect(FieldTypeSchema.safeParse("select").success).toBe(true);
      expect(FieldTypeSchema.safeParse("email").success).toBe(true);
      expect(FieldTypeSchema.safeParse("date").success).toBe(true);
      expect(FieldTypeSchema.safeParse("checkbox").success).toBe(true);
      expect(FieldTypeSchema.safeParse("phone").success).toBe(true);
    });

    it("rejects invalid field type", () => {
      expect(FieldTypeSchema.safeParse("richtext").success).toBe(false);
    });
  });
});

describe("RBAC utilities", () => {
  it("returns correct permissions for admin", () => {
    const perms = getRolePermissions("admin");
    expect(perms).toContain("manage_users");
    expect(perms).toContain("manage_rooms");
    expect(perms).toContain("take_attendance");
  });

  it("returns correct permissions for volunteer", () => {
    const perms = getRolePermissions("volunteer");
    expect(perms).toContain("take_attendance");
    expect(perms).not.toContain("manage_users");
  });

  it("hasRolePermission returns true for granted permission", () => {
    expect(hasRolePermission("admin", "manage_users")).toBe(true);
  });

  it("hasRolePermission returns false for denied permission", () => {
    expect(hasRolePermission("volunteer", "manage_users")).toBe(false);
  });
});

describe("extractYouTubeVideoId", () => {
  it("extracts ID from watch URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from short URL", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from embed URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for invalid URL", () => {
    expect(extractYouTubeVideoId("https://example.com")).toBe(null);
  });
});
