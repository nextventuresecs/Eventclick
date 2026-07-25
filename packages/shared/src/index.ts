import { z } from "zod";

export const APP_NAME = "Eventclick";
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

// ─── Role Enum ──────────────────────────────────────
export const USER_ROLES = ["ngo_admin", "event_admin", "volunteer"] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ROLE_LABELS = {
  ngo_admin: "NGO Admin",
  event_admin: "Event Admin",
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
  ngo_admin: [
    "manage_rooms",
    "manage_live_session",
    "create_attendance_form",
    "take_attendance",
    "view_reports",
    "view_live_session",
    "share_live_link",
    "manage_users",
  ],
  event_admin: [
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
const PasswordSchema = z
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
  email: z.email().toLowerCase(),
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

export const OnboardingSchema = z.object({
  organizationName: z.string().min(1).max(160).optional(),
  role: z.enum(["ngo_admin", "volunteer"]),
});
export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
  organizationName?: string | null;
  photoUrl?: string | null;
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
export const CreateRoomSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  maxParticipants: z.number().int().positive().max(10000).optional(),
  attendanceWindowBefore: z.number().int().nonnegative().optional(),
  attendanceWindowAfter: z.number().int().nonnegative().optional(),
  activityDefinitions: z.array(ActivityDefinitionSchema).optional(),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const UpdateRoomSchema = CreateRoomSchema.partial().extend({
  status: RoomStatusSchema.optional(),
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
  attendanceCount?: number;
  activityDefinitions: ActivityDefinition[];
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
  password: PasswordSchema,
  role: z.enum(["event_admin", "volunteer"]).optional(),
});
export type CreateOrgUserInput = z.infer<typeof CreateOrgUserSchema>;

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

export const ClientLogSchema = z.object({
  level: ClientLogLevelSchema,
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.iso.datetime().optional(),
});
export type ClientLogInput = z.infer<typeof ClientLogSchema>;
