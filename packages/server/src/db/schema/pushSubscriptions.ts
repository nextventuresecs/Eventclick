import { pgTable, uuid, text, timestamp, index, uniqueIndex, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

// One row per browser/device subscription. endpoint is the push service URL
// (unique per subscription) — used both as the natural dedupe key and to
// resolve which row to revoke when the push service reports it gone (404/410).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_user_id_idx").on(table.userId),
    index("push_subscriptions_org_id_idx").on(table.organizationId),
    pgPolicy("push_subscriptions_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${table.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
