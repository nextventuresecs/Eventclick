import { pgTable, uuid, varchar, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * NVCES staff allowed into the Ops Console. Not tenant users: no
 * organizationId, no RLS. Rows are managed only by
 * `src/scripts/maintainers.ts`; there is no delete, because
 * maintainer_access_log references this table with ON DELETE RESTRICT.
 *
 * DDL lives in drizzle/0013_ops_console_foundation.sql (hand-written, with the
 * grants that make the table unreachable for app_user / auth_svc_role). Keep
 * this definition in step with it.
 */
export const maintainers = pgTable(
  "maintainers",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    email: varchar("email", { length: 320 }).notNull().unique(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    addedBy: varchar("added_by", { length: 320 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    check("maintainers_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("maintainers_deactivated_consistent", sql`${t.isActive} OR ${t.deactivatedAt} IS NOT NULL`),
  ],
);

export type Maintainer = typeof maintainers.$inferSelect;
export type NewMaintainer = typeof maintainers.$inferInsert;
