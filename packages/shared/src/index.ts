import { z } from "zod";

export const APP_NAME = "Evently";
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

// ─── Role Enum ──────────────────────────────────────
export const USER_ROLES = ["super_admin", "event_admin", "organizer"] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

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
export const RegisterSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
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

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
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

// ─── Event Room DTOs ────────────────────────────────
export const CreateRoomSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledStart: z.iso.datetime(),
  scheduledEnd: z.iso.datetime(),
  maxParticipants: z.number().int().positive().max(10000).optional(),
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
  createdAt: string;
  updatedAt: string;
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
