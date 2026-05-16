import { pgTable, uuid, varchar, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { eventRooms } from "./rooms";
import { organizations } from "./organizations";
import { userRoleEnum } from "./enums";

export const eventAssignments = pgTable(
  "event_assignments",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => eventRooms.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    roleAtAssignment: userRoleEnum("role_at_assignment").notNull(),
    assignedBy: uuid("assigned_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("event_assignments_user_idx").on(t.userId),
    index("event_assignments_room_idx").on(t.roomId),
    index("event_assignments_org_idx").on(t.organizationId),
    index("event_assignments_active_idx").on(t.isActive),
  ],
);

export type EventAssignment = typeof eventAssignments.$inferSelect;
export type NewEventAssignment = typeof eventAssignments.$inferInsert;
