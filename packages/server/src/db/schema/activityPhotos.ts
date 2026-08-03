import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  doublePrecision,
  geometry,
  pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { activitySubmissions } from "./activitySubmissions";
import { eventRooms } from "./eventRooms";
import { users } from "./users";
import { organizations } from "./organizations";

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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    activityId: varchar("activity_id", { length: 64 }).notNull(),
    photoKey: varchar("photo_key", { length: 256 }).notNull(),
    photoUrl: text("photo_url").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("activity_photos_submission_idx").on(t.submissionId),
    index("activity_photos_room_activity_idx").on(t.roomId, t.activityId),
    index("activity_photos_org_idx").on(t.organizationId),
    index("activity_photos_submitted_by_idx").on(t.submittedBy),
    index("activity_photos_location_idx").using("gist", t.location),
    pgPolicy("activity_photos_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ],
);

export type ActivityPhotoRow = typeof activityPhotos.$inferSelect;
export type NewActivityPhoto = typeof activityPhotos.$inferInsert;
