import { pgTable, uuid, varchar, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { roomStatusEnum } from "./enums";
import { users } from "./users";
import { organizations } from "./organizations";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("event_rooms_org_idx").on(t.organizationId),
    index("event_rooms_status_idx").on(t.status),
    index("event_rooms_scheduled_start_idx").on(t.scheduledStart),
  ],
);

export type EventRoomRow = typeof eventRooms.$inferSelect;
export type NewEventRoom = typeof eventRooms.$inferInsert;
