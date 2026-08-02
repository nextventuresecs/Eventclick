import {
  pgTable,
  uuid,
  text,
  varchar,
  bigint,
  timestamp,
  index,
  pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { recordingStatusEnum } from "./enums";
import { eventRooms } from "./eventRooms";
import { organizations } from "./organizations";

export const roomRecordings = pgTable(
  "room_recordings",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: recordingStatusEnum("status").notNull().default("pending"),
    egressId: varchar("egress_id", { length: 80 }),
    s3Key: varchar("s3_key", { length: 256 }),
    mimeType: varchar("mime_type", { length: 64 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("room_recordings_room_idx").on(t.roomId),
    index("room_recordings_org_idx").on(t.organizationId),
    index("room_recordings_status_idx").on(t.status),
    index("room_recordings_egress_idx").on(t.egressId),
  ],
);

export type RoomRecordingRow = typeof roomRecordings.$inferSelect;
export type NewRoomRecording = typeof roomRecordings.$inferInsert;
