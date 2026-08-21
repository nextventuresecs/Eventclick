import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index, jsonb, doublePrecision , pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { roomStatusEnum, streamProviderEnum } from "./enums";
import { users } from "./users";
import { organizations } from "./organizations";
import type { ActivityDefinition } from "@application/shared";

export const eventRooms = pgTable(
  "event_rooms",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    status: roomStatusEnum("status").notNull().default("scheduled"),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    maxParticipants: integer("max_participants"),
    shareToken: varchar("share_token", { length: 32 }).notNull().unique(),
    livekitRoomName: varchar("livekit_room_name", { length: 80 }),
    streamProvider: streamProviderEnum("stream_provider").notNull().default("livekit"),
    youtubeWatchUrl: text("youtube_watch_url"),
    youtubeEmbedUrl: text("youtube_embed_url"),
    attendanceWindowBefore: integer("attendance_window_before").notNull().default(15),
    attendanceWindowAfter: integer("attendance_window_after").notNull().default(30),
    location: varchar("location", { length: 300 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    activityDefinitions: jsonb("activity_definitions").$type<ActivityDefinition[]>().notNull().default([]),
    cancellationReason: text("cancellation_reason"),
    // Deprecated: was the idempotency marker for the poll-based "room
    // starting soon" notification job, retired in favor of the
    // EVENT_STARTED event fired synchronously from room-live.controller.ts's
    // startLive (see eventStartedNotifiedAt below). No code writes this
    // column anymore; kept rather than dropped to avoid an unnecessary
    // destructive migration for a column with no meaningful runtime effect.
    startNotifiedAt: timestamp("start_notified_at", { withTimezone: true }),
    // Idempotency markers for the attendance-window notification job (same
    // pattern as startNotifiedAt above) — see jobs/attendanceWindowNotifier.ts.
    attendanceWindowOpenedNotifiedAt: timestamp("attendance_window_opened_notified_at", { withTimezone: true }),
    attendanceWindowClosingNotifiedAt: timestamp("attendance_window_closing_notified_at", { withTimezone: true }),
    // Per-room opt-in: EVENT_STARTED emails every event-associated member
    // only when this is true (push + in-app always go out regardless). See
    // NOTIFICATION_EVENT_CHANNELS's EVENT_STARTED comment in
    // @application/shared — email is spec'd as flag-gated, not a per-user
    // preference ChannelRouter can decide alone.
    notifyEmailOnStart: boolean("notify_email_on_start").notNull().default(false),
    // Idempotency markers for EVENT_STARTED / EVENT_ENDED — set by an atomic
    // claim in room-live.controller.ts's startLive/stopLive so a retried or
    // double-clicked request never double-sends. See
    // services/event-lifecycle-notification.service.ts.
    eventStartedNotifiedAt: timestamp("event_started_notified_at", { withTimezone: true }),
    eventEndedNotifiedAt: timestamp("event_ended_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("event_rooms_org_idx").on(t.organizationId),
    index("event_rooms_status_idx").on(t.status),
    index("event_rooms_scheduled_start_idx").on(t.scheduledStart),
    index("event_rooms_org_status_idx").on(t.organizationId, t.status),
    index("event_rooms_org_created_at_idx").on(t.organizationId, t.createdAt),
    pgPolicy("event_rooms_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ],
);

export type EventRoomRow = typeof eventRooms.$inferSelect;
export type NewEventRoom = typeof eventRooms.$inferInsert;
