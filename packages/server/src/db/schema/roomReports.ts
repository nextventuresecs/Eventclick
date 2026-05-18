import {
  pgTable,
  uuid,
  varchar,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventRooms } from "./eventRooms";
import { users } from "./users";

export const roomReports = pgTable(
  "room_reports",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    s3Key: varchar("s3_key", { length: 256 }).notNull(),
    fileName: varchar("file_name", { length: 256 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    generatedBy: uuid("generated_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("room_reports_room_idx").on(t.roomId),
    index("room_reports_generated_by_idx").on(t.generatedBy),
  ],
);

export type RoomReport = typeof roomReports.$inferSelect;
export type NewRoomReport = typeof roomReports.$inferInsert;
