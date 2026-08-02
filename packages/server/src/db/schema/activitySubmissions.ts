import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventRooms } from "./eventRooms";
import { organizations } from "./organizations";

export const activitySubmissions = pgTable(
  "activity_submissions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    activityId: varchar("activity_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("activity_submissions_room_activity_uniq").on(t.roomId, t.activityId),
    index("activity_submissions_room_idx").on(t.roomId),
    index("activity_submissions_org_idx").on(t.organizationId),
    index("activity_submissions_activity_idx").on(t.activityId),
  ],
);

export type ActivitySubmissionRow = typeof activitySubmissions.$inferSelect;
export type NewActivitySubmission = typeof activitySubmissions.$inferInsert;
