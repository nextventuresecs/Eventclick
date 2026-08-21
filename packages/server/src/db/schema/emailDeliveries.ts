import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { notificationDeliveryStatusEnum } from "./enums";

// Auth-realm table (queried via authDb, not db) — no organizationId, no RLS,
// same pattern as sessions/password_resets/email_verifications: these are
// transactional auth/system emails (verification, password reset, report
// ready), not RLS-tenant-scoped notification-engine events. Reuses the
// PENDING/SENT/DELIVERED/FAILED vocabulary already established for
// notification_deliveries (see notifications.ts) via the same DB enum.
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    // "verification" | "reset-password" | "report-ready" — kept as a plain
    // varchar (not a pg enum) since this is an internal dispatch detail, not
    // part of the cross-package NotificationType vocabulary.
    emailType: varchar("email_type", { length: 32 }).notNull(),
    // Send-time data specific to the email type: { token } for verification/
    // reset-password, { s3Url, roomLabel } for report-ready.
    payload: jsonb("payload").notNull(),
    status: notificationDeliveryStatusEnum("status").default("PENDING").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_deliveries_user_idx").on(t.userId),
    index("email_deliveries_status_idx").on(t.status),
  ],
);

export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type NewEmailDelivery = typeof emailDeliveries.$inferInsert;
