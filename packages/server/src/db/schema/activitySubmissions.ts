import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventRooms } from "./eventRooms";

export const activitySubmissions = pgTable(
  "activity_submissions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    activityId: varchar("activity_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_submissions_room_idx").on(t.roomId),
    index("activity_submissions_activity_idx").on(t.activityId),
  ],
);

export type ActivitySubmissionRow = typeof activitySubmissions.$inferSelect;
export type NewActivitySubmission = typeof activitySubmissions.$inferInsert;
