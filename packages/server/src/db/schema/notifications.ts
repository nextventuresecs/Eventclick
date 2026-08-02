import { pgTable, text, timestamp, boolean, uuid, index , pgPolicy } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g., 'attendance_checkin', 'room_scheduled', 'system_alert'
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: text("metadata"), // JSON stringified metadata for links/actions
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
    orgIdIdx: index("notifications_org_id_idx").on(table.organizationId),
    createdIdx: index("notifications_created_at_idx").on(table.createdAt),
  })
);
