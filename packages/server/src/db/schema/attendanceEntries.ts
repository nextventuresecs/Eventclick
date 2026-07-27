import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  doublePrecision,
  geometry,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventRooms } from "./eventRooms";
import { formDefinitions } from "./formDefinitions";
import { users } from "./users";

export const attendanceEntries = pgTable(
  "attendance_entries",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    formDefinitionId: uuid("form_definition_id")
      .notNull()
      .references(() => formDefinitions.id, { onDelete: "restrict" }),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull(),
    photoKey: varchar("photo_key", { length: 256 }),
    photoUrl: text("photo_url"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attendance_entries_room_idx").on(t.roomId),
    index("attendance_entries_form_idx").on(t.formDefinitionId),
    index("attendance_entries_submitted_at_idx").on(t.submittedAt),
    index("attendance_entries_submitted_by_idx").on(t.submittedBy),
    index("attendance_entries_room_submitted_at_idx").on(t.roomId, t.submittedAt),
    index("attendance_entries_location_idx").using("gist", t.location),
  ],
);

export type AttendanceEntryRow = typeof attendanceEntries.$inferSelect;
export type NewAttendanceEntry = typeof attendanceEntries.$inferInsert;
