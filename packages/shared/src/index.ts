import { z } from "zod";

export const APP_NAME = "Eventclick";
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

// ─── Role Enum ──────────────────────────────────────
export const USER_ROLES = ["admin", "event_manager", "volunteer"] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ROLE_LABELS = {
  admin: "Admin",
  event_manager: "Event Admin",
  volunteer: "Volunteer",
} as const satisfies Record<UserRole, string>;

export const ROLE_PERMISSIONS = [
  "manage_rooms",
  "manage_live_session",
  "create_attendance_form",
  "take_attendance",
  "view_reports",
  "view_live_session",
  "share_live_link",
  "manage_users",
] as const;
export const RolePermissionSchema = z.enum(ROLE_PERMISSIONS);
export type RolePermission = z.infer<typeof RolePermissionSchema>;

const ROLE_PERMISSION_MAP: Record<UserRole, readonly RolePermission[]> = {
  admin: [
    "manage_rooms",
    "manage_live_session",
    "create_attendance_form",
    "take_attendance",
    "view_reports",
    "view_live_session",
    "share_live_link",
    "manage_users",
  ],
  event_manager: [
    "manage_rooms",
    "manage_live_session",
    "create_attendance_form",
    "take_attendance",
    "view_reports",
    "view_live_session",
    "share_live_link",
  ],
  volunteer: ["take_attendance", "view_live_session", "share_live_link"],
};

export const getRolePermissions = (role: UserRole): readonly RolePermission[] =>
  ROLE_PERMISSION_MAP[role];

export const hasRolePermission = (
  role: UserRole,
  permission: RolePermission,
): boolean => ROLE_PERMISSION_MAP[role].includes(permission);

// ─── Room Status Enum ───────────────────────────────
export const ROOM_STATUSES = [
  "scheduled",
  "live",
  "ended",
  "cancelled",
] as const;
export const RoomStatusSchema = z.enum(ROOM_STATUSES);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

// ─── Auth DTOs ──────────────────────────────────────
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/,
    "Password must contain at least one letter, one number, and one special character"
  );

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: PasswordSchema,
  fullName: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(160).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(10),
});
export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// First-time password setup for a user created by an admin without an
// initial password (the USER_INVITED / magic-link flow — see #70). Distinct
// from ChangePasswordSchema: this has no currentPassword because there
// isn't one yet, and the server-side handler only accepts it once, before
// any password has ever been set.
export const SetPasswordSchema = z.object({
  password: PasswordSchema,
});
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

export const OnboardingSchema = z.object({
  organizationName: z.string().min(1).max(160).optional(),
  role: z.enum(["admin", "volunteer"]),
});
export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export const ImageUrlSchema = z
  .string()
  .max(1000, "Image URL is too long — upload the file instead of pasting a data URL")
  .url()
  .refine((v) => /^https?:\/\//i.test(v), {
    message: "Must be an http(s) URL — data: and blob: URLs are not accepted",
  });

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  photoUrl: ImageUrlSchema.or(z.literal("")).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: ImageUrlSchema.or(z.literal("")).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

// ─── Notification Types ─────────────────────────────────────
// Legacy values already written by existing code paths (report generation,
// room-start polling) plus the typed event kinds the notification engine
// introduces. The DB enum (see server schema/enums.ts) must stay a superset
// of every value ever written here — never remove a legacy value without a
// data migration first.
export const NOTIFICATION_TYPES = [
  // legacy / already in production use
  "room_starting_soon",
  "report_ready",
  "report_failed",
  // safety net for the type-widening migration: any pre-existing row whose
  // free-text type doesn't match a known value casts to this instead of
  // failing the migration outright
  "legacy_unspecified",
  // typed notification-engine event kinds
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
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// The subset of NOTIFICATION_TYPES application code may actually write.
// Excludes "legacy_unspecified", which exists solely as the fallback target
// for the type-widening migration's defensive cast — it should never appear
// as a value a running server chooses to write.
export const WRITABLE_NOTIFICATION_TYPES = NOTIFICATION_TYPES.filter(
  (t) => t !== "legacy_unspecified",
);
export const WritableNotificationTypeSchema = z.enum(
  WRITABLE_NOTIFICATION_TYPES as [string, ...string[]],
);
export type WritableNotificationType = Exclude<NotificationType, "legacy_unspecified">;

export const NOTIFICATION_CHANNELS = ["in_app", "web_push", "email"] as const;
export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

// PATCH body for /auth/preferences — every field optional since a client
// only ever sends the keys it changed; settings.controller.ts merges this
// onto the existing stored preferences rather than overwriting them.
export const UpdatePreferencesSchema = z.object({
  notifyRoomCreated: z.boolean().optional(),
  notifyLiveStart: z.boolean().optional(),
  notifyAttendance: z.boolean().optional(),
  mutedChannels: z.array(NotificationChannelSchema).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;

export const NOTIFICATION_DELIVERY_STATUSES = ["PENDING", "SENT", "DELIVERED", "FAILED"] as const;
export const NotificationDeliveryStatusSchema = z.enum(NOTIFICATION_DELIVERY_STATUSES);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusSchema>;

// ─── Notification Preferences (full stored shape) ──────────
// Superset of UpdatePreferencesSchema's partial PATCH body — this is what's
// actually persisted to users.preferences, with defaults for every known key
// so readers never have to guess what an absent key means.
//
// notifyRoomCreated/notifyLiveStart/notifyAttendance are per-event-category
// toggles (used ad hoc today, e.g. eventStartNotifier's notifyLiveStart
// check). mutedChannels is a separate, coarser axis: channels the user has
// turned off entirely, consulted by ChannelRouter below. The two are
// independent — a muted channel silences every event kind that channel
// would otherwise carry, category toggles aside.
export const NotificationPreferencesSchema = z.object({
  notifyRoomCreated: z.boolean().default(true),
  notifyLiveStart: z.boolean().default(true),
  notifyAttendance: z.boolean().default(false),
  mutedChannels: z.array(NotificationChannelSchema).default([]),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

// ─── Web Push ────────────────────────────────────────────────
// Shape of the PushSubscription the browser's PushManager.subscribe() resolves
// to (via subscription.toJSON()) — endpoint plus the two keys needed to
// encrypt a push payload for this specific subscription.
export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const SavePushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: PushSubscriptionKeysSchema,
});
export type SavePushSubscriptionInput = z.infer<typeof SavePushSubscriptionSchema>;

export const RevokePushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});
export type RevokePushSubscriptionInput = z.infer<typeof RevokePushSubscriptionSchema>;

// ─── Notification Domain Events + Channel Routing ──────────────
// Who an event targets. Resolving this to an actual recipient list (querying
// event_admin_assignments, org membership, etc.) is a dispatcher concern —
// this type only names the shape of the target, not how to reach it.
export type RecipientScope =
  | { kind: "user"; userId: string }
  | { kind: "eventMembers"; roomId: string }
  | { kind: "eventAdmins"; roomId: string }
  | { kind: "orgWide"; organizationId: string };

// One entry per typed notification-engine event kind (the NOTIFICATION_TYPES
// values that aren't legacy/fallback). Each carries the payload shape unique
// to that event — no loose `Record<string, any>` metadata bag.
export interface NotificationPayloadMap {
  USER_INVITED: { invitedEmail: string; inviteToken: string; invitedBy: string };
  ATTENDANCE_WINDOW_OPENED: { roomId: string; windowClosesAt: string };
  EVENT_STARTED: { roomId: string; startedAt: string };
  EVENT_ENDED: { roomId: string; recordingUrl?: string; summaryUrl?: string };
  REPORT_GENERATED: { roomId: string; reportId: string; generatedBy: string };
  ORG_BROADCAST: { organizationId: string; title: string; body: string; priority: "normal" | "urgent" };
  ATTENDANCE_WINDOW_CLOSING: { roomId: string; closesInMinutes: number };
  EVENT_STREAM_STATE_CHANGED: {
    roomId: string;
    state: "live" | "recording_started" | "recording_paused" | "ended";
  };
  USER_LEFT_EVENT: { roomId: string; userId: string; reason: "left" | "logged_out" };
  EVENT_CANCELLED_OR_EXPIRED: { roomId: string; reason: "cancelled" | "expired" };
}

export type NotificationEngineEventKind = keyof NotificationPayloadMap;

// Compile-time guarantee that every NotificationPayloadMap key is also a
// valid NOTIFICATION_TYPES value (the DB enum, see server schema/enums.ts).
// The two are declared independently above; without this, adding a payload
// map entry and forgetting the matching NOTIFICATION_TYPES entry typechecks
// fine and only fails at runtime as an enum constraint violation on insert.
type _EveryEventKindIsAWritableNotificationType = NotificationEngineEventKind extends WritableNotificationType
  ? true
  : ["NotificationPayloadMap key missing from NOTIFICATION_TYPES:", Exclude<NotificationEngineEventKind, WritableNotificationType>];
const _assertEventKindsAreWritableNotificationTypes: _EveryEventKindIsAWritableNotificationType = true;
void _assertEventKindsAreWritableNotificationTypes;

// Discriminated on `type` — a switch/if-chain on event.type narrows
// event.payload to the matching entry in NotificationPayloadMap.
export type NotificationEvent = {
  [K in NotificationEngineEventKind]: {
    type: K;
    scope: RecipientScope;
    payload: NotificationPayloadMap[K];
  };
}[NotificationEngineEventKind];

// The full set of channels a given event kind is allowed to use. ChannelRouter
// only ever narrows this set (via mutes) — it never adds a channel an event
// kind isn't declared for here.
export const NOTIFICATION_EVENT_CHANNELS: Record<NotificationEngineEventKind, readonly NotificationChannel[]> = {
  USER_INVITED: ["email", "in_app"],
  ATTENDANCE_WINDOW_OPENED: ["in_app", "web_push"],
  // Spec says email is conditional here ("+ Email if flagged" — a per-room/
  // org opt-in, not a per-user preference this router knows about). Listed
  // unconditionally for now; whoever wires EVENT_STARTED to a dispatcher
  // must gate the email send on that flag before calling ChannelRouter, or
  // every room start emails every member.
  EVENT_STARTED: ["in_app", "web_push", "email"],
  EVENT_ENDED: ["in_app", "email"],
  REPORT_GENERATED: ["in_app"],
  ORG_BROADCAST: ["in_app", "web_push", "email"],
  ATTENDANCE_WINDOW_CLOSING: ["in_app", "web_push"],
  EVENT_STREAM_STATE_CHANGED: ["in_app"],
  USER_LEFT_EVENT: ["in_app"],
  EVENT_CANCELLED_OR_EXPIRED: ["in_app", "email"],
};

// Event kinds (or, for ORG_BROADCAST, a priority within one) whose delivery
// must never be suppressed by a user's channel mutes — attendance deadlines,
// urgent broadcasts, and cancellations are need-to-know regardless of
// preference.
export const isCriticalNotificationEvent = (event: NotificationEvent): boolean => {
  if (event.type === "ATTENDANCE_WINDOW_CLOSING") return true;
  if (event.type === "EVENT_CANCELLED_OR_EXPIRED") return true;
  if (event.type === "ORG_BROADCAST") return event.payload.priority === "urgent";
  return false;
};

/**
 * Pure — no I/O. Decides which channels a given event actually goes out on
 * for a given user: the event kind's declared channel set, narrowed by the
 * user's muted channels, unless the event is critical (see
 * isCriticalNotificationEvent), in which case mutes are ignored entirely.
 */
export const ChannelRouter = (
  event: NotificationEvent,
  preferences: NotificationPreferences,
): NotificationChannel[] => {
  const allowed = NOTIFICATION_EVENT_CHANNELS[event.type];
  if (isCriticalNotificationEvent(event)) return [...allowed];

  // `preferences` is typed non-null/non-optional, but its real source is
  // AuthUser.preferences (`any | null`) straight off an unvalidated jsonb
  // column — no row written before mutedChannels existed has that key, and
  // TS can't catch a caller skipping NotificationPreferencesSchema.parse()
  // first. `?? []` keeps this function safe even when a caller doesn't.
  const muted = preferences?.mutedChannels ?? [];
  return allowed.filter((channel) => !muted.includes(channel));
};

// ─── Org broadcast (admin-composed, org-wide) ───────────────
// `priority` is not cosmetic: "urgent" makes isCriticalNotificationEvent
// return true, which makes ChannelRouter skip mute filtering entirely, so an
// urgent broadcast reaches every declared channel regardless of what a
// recipient has muted. Keep the default at "normal" — bypassing a user's
// preferences has to be something an admin opts into deliberately.
export const ORG_BROADCAST_PRIORITIES = ["normal", "urgent"] as const;
export const OrgBroadcastPrioritySchema = z.enum(ORG_BROADCAST_PRIORITIES);
export type OrgBroadcastPriority = z.infer<typeof OrgBroadcastPrioritySchema>;

export const OrgBroadcastSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(2000),
  priority: OrgBroadcastPrioritySchema.default("normal"),
});
export type OrgBroadcastInput = z.infer<typeof OrgBroadcastSchema>;

export interface OrgBroadcastResult {
  recipients: number;
  inApp: number;
  webPush: number;
  email: number;
  failed: number;
}

export const SubmitFeedbackSchema = z.object({
  category: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  subject: z.string().min(1).max(200),
  comments: z.string().min(1).max(5000),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;

export const SubmitBugReportSchema = z.object({
  severity: z.string().min(1).max(50),
  component: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  steps: z.string().min(1).max(2000),
  expected: z.string().min(1).max(2000),
  actual: z.string().min(1).max(2000),
  systemInfo: z.string().optional(),
});
export type SubmitBugReportInput = z.infer<typeof SubmitBugReportSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
  organizationName?: string | null;
  organizationDescription?: string | null;
  organizationLogoUrl?: string | null;
  photoUrl?: string | null;
  preferences?: any | null;
  createdAt?: string | null;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

// ─── Stream Provider (LiveKit primary, YouTube fallback) ──
export const STREAM_PROVIDERS = ["livekit", "youtube"] as const;
export const StreamProviderSchema = z.enum(STREAM_PROVIDERS);
export type StreamProvider = z.infer<typeof StreamProviderSchema>;

const YOUTUBE_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)[\w-]{11}(?:[?&][\w=&-]*)?$/;

export const SetYouTubeFallbackSchema = z.object({
  youtubeWatchUrl: z
    .string()
    .url()
    .regex(YOUTUBE_URL_REGEX, "Must be a valid YouTube video/live URL"),
});
export type SetYouTubeFallbackInput = z.infer<typeof SetYouTubeFallbackSchema>;

export const extractYouTubeVideoId = (url: string): string | null => {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match?.[1] ?? null;
};

// ─── Activity Definitions & Tracking ─────────────────
export const ActivityDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  min_photos: z.number().int().nonnegative(),
});
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;

export const SubmitActivityPhotoSchema = z.object({
  activityId: z.string().min(1),
  photoKey: z.string().min(1).max(256),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  idempotencyKey: z.string().max(100).optional(),
});
export type SubmitActivityPhotoInput = z.infer<
  typeof SubmitActivityPhotoSchema
>;

export const ActivityPhotoUploadRequestSchema = z.object({
  activityId: z.string().min(1),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp)$/, "Must be image/jpeg, png, or webp"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export type ActivityPhotoUploadRequestInput = z.infer<
  typeof ActivityPhotoUploadRequestSchema
>;

export interface ActivitySubmissionPhoto {
  url: string;
  key: string;
  uploadedAt: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ActivitySubmission {
  id: string;
  roomId: string;
  activityId: string;
  photos: ActivitySubmissionPhoto[];
  createdAt: string;
  updatedAt: string;
}

// ─── Event Room DTOs ────────────────────────────────
const CreateRoomBase = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  maxParticipants: z.number().int().positive().max(10000).optional(),
  attendanceWindowBefore: z.number().int().nonnegative().optional(),
  attendanceWindowAfter: z.number().int().nonnegative().optional(),
  // Per-room opt-in: EVENT_STARTED also emails every event-associated member
  // when true, on top of the always-on in-app + push. See
  // NOTIFICATION_EVENT_CHANNELS's EVENT_STARTED comment below.
  notifyEmailOnStart: z.boolean().optional(),
  location: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  activityDefinitions: z.array(ActivityDefinitionSchema).optional(),
});

export const CreateRoomSchema = CreateRoomBase.refine(
  (data) => new Date(data.scheduledEnd) > new Date(data.scheduledStart),
  { message: "Scheduled end must be after scheduled start", path: ["scheduledEnd"] }
);
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const CANCELLATION_REASONS = [
  "Event rescheduled",
  "Insufficient interest",
  "Organizer unavailable",
  "Technical issues",
  "Other",
] as const;
export type CancellationReason = typeof CANCELLATION_REASONS[number];

export const UpdateRoomSchema = CreateRoomBase.partial().extend({
  status: RoomStatusSchema.optional(),
  cancellationReason: z.string().max(500).optional(),
});
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

export const UpdateRoomStatusSchema = z.object({
  status: RoomStatusSchema,
});
export type UpdateRoomStatusInput = z.infer<typeof UpdateRoomStatusSchema>;

export interface EventRoom {
  id: string;
  organizationId: string;
  createdBy: string;
  title: string;
  description: string | null;
  status: RoomStatus;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  maxParticipants: number | null;
  shareToken: string;
  shareUrl: string;
  streamProvider: StreamProvider;
  youtubeWatchUrl: string | null;
  youtubeEmbedUrl: string | null;
  attendanceWindowBefore: number;
  attendanceWindowAfter: number;
  notifyEmailOnStart: boolean;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attendanceCount?: number;
  activityDefinitions: ActivityDefinition[];
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface EventAdminAssignment {
  id: string;
  organizationId: string;
  userId: string;
  roomId: string;
  assignedRole: UserRole;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  user: OrgUserSummary;
  room: Pick<
    EventRoom,
    "id" | "title" | "scheduledStart" | "scheduledEnd" | "status"
  >;
}

export const AssignEventAdminSchema = z.object({
  userId: z.uuid(),
  roomId: z.uuid(),
});
export type AssignEventAdminInput = z.infer<typeof AssignEventAdminSchema>;

export const UpdateEventAdminAssignmentSchema = z.object({
  roomId: z.uuid(),
});
export type UpdateEventAdminAssignmentInput = z.infer<
  typeof UpdateEventAdminAssignmentSchema
>;

// ── Admin user management ──────────────────────────────────────────────────
export const CreateOrgUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  // Optional: when omitted, the invited user has no usable password and
  // must set one via the USER_INVITED magic-link flow (verify-email ->
  // POST /auth/set-password) — see #70.
  password: PasswordSchema.optional(),
  role: z.enum(["event_manager", "volunteer"]).optional(),
});
export type CreateOrgUserInput = z.infer<typeof CreateOrgUserSchema>;

export const DeleteUserSchema = z.object({
  confirmEmail: z.string().email(),
});
export type DeleteUserInput = z.infer<typeof DeleteUserSchema>;

export const UpdateUserProfileSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  photoUrl: z.string().url().max(500).nullable().optional(),
});
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;



// Public view for unauth attendees joining via share token
export interface SharedRoom {
  id: string;
  title: string;
  description: string | null;
  status: RoomStatus;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  streamProvider: StreamProvider;
  youtubeEmbedUrl: string | null;
  attendanceWindowBefore: number;
  attendanceWindowAfter: number;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

// ─── Generic Responses ──────────────────────────────
export interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  uptime: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Attendance Form Builder ────────────────────────
export const FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "number",
  "select",
  "checkbox",
  "date",
] as const;
export const FieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FormFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    type: FieldTypeSchema,
    required: z.boolean().default(false),
    placeholder: z.string().max(120).optional(),
    helpText: z.string().max(200).optional(),
    options: z.array(z.string().min(1).max(80)).max(50).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" && (!f.options || f.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "select field requires options",
        path: ["options"],
      });
    }
  });
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormDefinitionSchema = z.object({
  fields: z.array(FormFieldSchema).min(1).max(30),
});
export type FormDefinitionInput = z.infer<typeof FormDefinitionSchema>;

export interface FormDefinition {
  id: string;
  roomId: string;
  version: number;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
}

// ─── Attendance Submission ──────────────────────────
const ATTENDANCE_VALUE = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const SubmitAttendanceSchema = z.object({
  formDefinitionId: z.uuid(),
  data: z.record(z.string().min(1).max(64), ATTENDANCE_VALUE),
  photoKey: z.string().min(1).max(200).optional(),
  idempotencyKey: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type SubmitAttendanceInput = z.infer<typeof SubmitAttendanceSchema>;

export interface AttendanceEntry {
  id: string;
  roomId: string;
  formDefinitionId: string;
  data: Record<string, string | number | boolean | null>;
  photoUrl: string | null;
  submittedAt: string;
}

// ─── LiveKit Token ──────────────────────────────────
export const LIVE_ROLES = ["publisher", "viewer"] as const;
export const LiveRoleSchema = z.enum(LIVE_ROLES);
export type LiveRole = z.infer<typeof LiveRoleSchema>;

export interface LiveTokenResponse {
  token: string;
  url: string;
  identity: string;
  roomName: string;
  role: LiveRole;
}

export const ShareLiveTokenSchema = z.object({
  name: z.string().min(1).max(60).optional(),
});
export type ShareLiveTokenInput = z.infer<typeof ShareLiveTokenSchema>;

// ─── Photo Upload (presigned PUT) ───────────────────
export const PhotoUploadRequestSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp)$/, "Must be image/jpeg, png, or webp"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export type PhotoUploadRequestInput = z.infer<typeof PhotoUploadRequestSchema>;

export interface PhotoUploadResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

// ─── Room Recording ─────────────────────────────────
export const RECORDING_STATUSES = [
  "pending",
  "active",
  "completed",
  "failed",
] as const;
export const RecordingStatusSchema = z.enum(RECORDING_STATUSES);
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export interface RoomRecording {
  id: string;
  roomId: string;
  status: RecordingStatus;
  egressId: string | null;
  s3Key: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  publicUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

// ─── Presence ───────────────────────────────────────
export interface PresenceSnapshot {
  roomId: string;
  count: number;
  updatedAt: string;
}

// ─── Client Log Ingest ──────────────────────────────
export const ClientLogLevelSchema = z.enum(["error", "warn", "info"]);
export type ClientLogLevel = z.infer<typeof ClientLogLevelSchema>;

// The client-error endpoint is public (see server routes/log.routes.ts for
// why), so every field here is an attacker-controlled string that ends up in
// the log stream and the log-storage bill. message/stack/url/userAgent were
// already capped; `context` was a free-form record with no bound at all —
// one request could carry just under the 1 MB body limit of arbitrary JSON.
export const MAX_CLIENT_LOG_CONTEXT_KEYS = 20;
export const MAX_CLIENT_LOG_CONTEXT_BYTES = 4000;

export const ClientLogSchema = z.object({
  level: ClientLogLevelSchema,
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  context: z
    .record(z.string().max(64), z.unknown())
    .refine((ctx) => Object.keys(ctx).length <= MAX_CLIENT_LOG_CONTEXT_KEYS, {
      message: `context may contain at most ${MAX_CLIENT_LOG_CONTEXT_KEYS} keys`,
    })
    .refine(
      (ctx) => {
        try {
          return JSON.stringify(ctx).length <= MAX_CLIENT_LOG_CONTEXT_BYTES;
        } catch {
          // Unserialisable (a cycle, a BigInt) — reject rather than let it
          // reach the logger and throw there.
          return false;
        }
      },
      { message: `context must serialise to at most ${MAX_CLIENT_LOG_CONTEXT_BYTES} bytes` },
    )
    .optional(),
  timestamp: z.iso.datetime().optional(),
});
export type ClientLogInput = z.infer<typeof ClientLogSchema>;

// ─── Branding uploads (organization logo / user avatar) ─────
export const BrandingUploadRequestSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp)$/, "Must be image/jpeg, png, or webp"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024, "Image must be 5MB or smaller"),
});
export type BrandingUploadRequestInput = z.infer<typeof BrandingUploadRequestSchema>;
export const MAX_BRANDING_UPLOAD_BYTES = 5 * 1024 * 1024;
export const BRANDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
