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
  NOTIFICATION_TYPES,
  NotificationTypeSchema,
  NotificationPreferencesSchema,
  ChannelRouter,
  isCriticalNotificationEvent,
  NOTIFICATION_EVENT_CHANNELS,
  type NotificationEvent,
  type NotificationPreferences,
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

describe("NotificationTypeSchema", () => {
  // Regression guard: every value a running server has ever written to
  // notifications.type must stay accepted here, or the DB enum migration
  // (drizzle/0005_notification_engine_schema_widening.sql) will reject
  // those rows outright instead of falling back to legacy_unspecified.
  it("still accepts every legacy value written by existing code paths", () => {
    for (const legacyValue of ["room_starting_soon", "report_ready", "report_failed"]) {
      expect(NOTIFICATION_TYPES).toContain(legacyValue);
    }
  });

  it("includes the safety-net fallback used by the type-widening migration", () => {
    expect(NOTIFICATION_TYPES).toContain("legacy_unspecified");
  });

  it("accepts all ten typed notification-engine event kinds", () => {
    const eventKinds = [
      "USER_INVITED",
      "ATTENDANCE_WINDOW_OPENED",
      "EVENT_STARTED",
      "EVENT_ENDED",
      "REPORT_GENERATED",
      "ORG_BROADCAST",
      "ATTENDANCE_WINDOW_CLOSING",
      "EVENT_STREAM_STATE_CHANGED",
      "USER_LEFT_EVENT",
      "EVENT_CANCELLED_OR_EXPIRED",
    ];
    for (const kind of eventKinds) {
      expect(NotificationTypeSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects an unknown type string", () => {
    expect(NotificationTypeSchema.safeParse("not_a_real_type").success).toBe(false);
  });
});

describe("NotificationPreferencesSchema", () => {
  it("defaults every known preference when given an empty object", () => {
    const result = NotificationPreferencesSchema.parse({});
    expect(result).toEqual({
      notifyRoomCreated: true,
      notifyLiveStart: true,
      notifyAttendance: false,
      mutedChannels: [],
    });
  });

  it("preserves explicit values over defaults", () => {
    const result = NotificationPreferencesSchema.parse({ notifyRoomCreated: false });
    expect(result.notifyRoomCreated).toBe(false);
    expect(result.notifyLiveStart).toBe(true);
  });
});

describe("ChannelRouter", () => {
  const defaultPreferences: NotificationPreferences = {
    notifyRoomCreated: true,
    notifyLiveStart: true,
    notifyAttendance: false,
    mutedChannels: [],
  };

  const eventStarted: NotificationEvent = {
    type: "EVENT_STARTED",
    scope: { kind: "eventMembers", roomId: "room-1" },
    payload: { roomId: "room-1", startedAt: "2026-01-01T00:00:00Z" },
  };

  const attendanceWindowClosing: NotificationEvent = {
    type: "ATTENDANCE_WINDOW_CLOSING",
    scope: { kind: "eventMembers", roomId: "room-1" },
    payload: { roomId: "room-1", closesInMinutes: 5 },
  };

  const urgentBroadcast: NotificationEvent = {
    type: "ORG_BROADCAST",
    scope: { kind: "orgWide", organizationId: "org-1" },
    payload: { organizationId: "org-1", title: "Heads up", body: "Something urgent", priority: "urgent" },
  };

  const normalBroadcast: NotificationEvent = {
    type: "ORG_BROADCAST",
    scope: { kind: "orgWide", organizationId: "org-1" },
    payload: { organizationId: "org-1", title: "FYI", body: "Something routine", priority: "normal" },
  };

  it("returns the event kind's full declared channel set when nothing is muted", () => {
    const result = ChannelRouter(eventStarted, defaultPreferences);
    expect(result).toEqual(NOTIFICATION_EVENT_CHANNELS.EVENT_STARTED);
  });

  it("an ordinary event respects a channel mute", () => {
    const result = ChannelRouter(eventStarted, { ...defaultPreferences, mutedChannels: ["web_push"] });
    expect(result).toEqual(["in_app", "email"]);
  });

  it("a critical event (attendance window closing) ignores a channel mute", () => {
    const result = ChannelRouter(attendanceWindowClosing, {
      ...defaultPreferences,
      mutedChannels: ["in_app", "web_push"],
    });
    expect(result).toEqual(NOTIFICATION_EVENT_CHANNELS.ATTENDANCE_WINDOW_CLOSING);
  });

  it("an urgent broadcast ignores a channel mute", () => {
    const result = ChannelRouter(urgentBroadcast, { ...defaultPreferences, mutedChannels: ["email"] });
    expect(result).toEqual(NOTIFICATION_EVENT_CHANNELS.ORG_BROADCAST);
  });

  it("a normal-priority broadcast respects a channel mute", () => {
    const result = ChannelRouter(normalBroadcast, { ...defaultPreferences, mutedChannels: ["email"] });
    expect(result).toEqual(["in_app", "web_push"]);
  });

  it("muting every declared channel returns an empty list for a non-critical event", () => {
    const result = ChannelRouter(eventStarted, { ...defaultPreferences, mutedChannels: ["in_app", "web_push", "email"] });
    expect(result).toEqual([]);
  });

  // Regression guard: AuthUser.preferences is `any | null` off an
  // unvalidated jsonb column, and no row written before mutedChannels
  // existed has that key — ChannelRouter must not crash when a caller
  // passes preferences straight from the DB without running it through
  // NotificationPreferencesSchema.parse() first.
  it("does not throw when mutedChannels is missing from the preferences object", () => {
    const legacyPreferences = { notifyRoomCreated: true, notifyLiveStart: true, notifyAttendance: false } as NotificationPreferences;
    expect(() => ChannelRouter(eventStarted, legacyPreferences)).not.toThrow();
    expect(ChannelRouter(eventStarted, legacyPreferences)).toEqual(NOTIFICATION_EVENT_CHANNELS.EVENT_STARTED);
  });

  describe("isCriticalNotificationEvent", () => {
    it("is true for ATTENDANCE_WINDOW_CLOSING", () => {
      expect(isCriticalNotificationEvent(attendanceWindowClosing)).toBe(true);
    });

    it("is true for EVENT_CANCELLED_OR_EXPIRED", () => {
      expect(
        isCriticalNotificationEvent({
          type: "EVENT_CANCELLED_OR_EXPIRED",
          scope: { kind: "eventMembers", roomId: "room-1" },
          payload: { roomId: "room-1", reason: "cancelled" },
        }),
      ).toBe(true);
    });

    it("is true only for urgent ORG_BROADCAST, not normal", () => {
      expect(isCriticalNotificationEvent(urgentBroadcast)).toBe(true);
      expect(isCriticalNotificationEvent(normalBroadcast)).toBe(false);
    });

    it("is false for an ordinary event like EVENT_STARTED", () => {
      expect(isCriticalNotificationEvent(eventStarted)).toBe(false);
    });
  });
});
