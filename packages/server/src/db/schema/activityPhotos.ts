import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { activitySubmissions } from "./activitySubmissions";
import { eventRooms } from "./eventRooms";
import { users } from "./users";

export const activityPhotos = pgTable(
  "activity_photos",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => activitySubmissions.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    activityId: varchar("activity_id", { length: 64 }).notNull(),
    photoKey: varchar("photo_key", { length: 256 }).notNull(),
    photoUrl: text("photo_url").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_photos_submission_idx").on(t.submissionId),
    index("activity_photos_room_activity_idx").on(t.roomId, t.activityId),
    index("activity_photos_submitted_by_idx").on(t.submittedBy),
  ],
);

export type ActivityPhotoRow = typeof activityPhotos.$inferSelect;
export type NewActivityPhoto = typeof activityPhotos.$inferInsert;
