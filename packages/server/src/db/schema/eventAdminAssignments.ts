import { pgTable, uuid, timestamp, index, uniqueIndex , pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userRoleEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";
import { eventRooms } from "./eventRooms";

export const eventAdminAssignments = pgTable(
  "event_admin_assignments",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    assignedRole: userRoleEnum("assigned_role").notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("event_admin_assignments_user_room_uniq").on(t.userId, t.roomId),
    index("event_admin_assignments_org_idx").on(t.organizationId),
    index("event_admin_assignments_room_idx").on(t.roomId),
    index("event_admin_assignments_user_idx").on(t.userId),
    index("event_admin_assignments_assigned_by_idx").on(t.assignedBy),
    index("event_admin_assignments_revoked_idx").on(t.revokedAt),
  ],
);

export type EventAdminAssignmentRow = typeof eventAdminAssignments.$inferSelect;
export type NewEventAdminAssignment = typeof eventAdminAssignments.$inferInsert;
