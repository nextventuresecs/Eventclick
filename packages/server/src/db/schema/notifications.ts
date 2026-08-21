import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";
import { notificationTypeEnum, notificationChannelEnum, notificationDeliveryStatusEnum } from "./enums";

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
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata"), // structured metadata for links/actions (roomId, actor, etc.)
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
   (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_org_id_idx").on(table.organizationId),
    index("notifications_created_at_idx").on(table.createdAt),
    pgPolicy("notifications_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ]
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// One row per (notification, recipient, channel) — tracks per-channel delivery
// state independently of the notification's own read/unread status, so a
// single ORG_BROADCAST fanned out to in-app + push + email for one user has
// three rows, each progressing PENDING -> SENT/FAILED on its own.
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationDeliveryStatusEnum("status").default("PENDING").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "string" }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notification_deliveries_notification_id_idx").on(table.notificationId),
    index("notification_deliveries_user_id_idx").on(table.userId),
    index("notification_deliveries_org_id_idx").on(table.organizationId),
    index("notification_deliveries_status_idx").on(table.status),
    pgPolicy("notification_deliveries_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ]
);

export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
