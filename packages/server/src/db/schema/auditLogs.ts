import { pgTable, uuid, varchar, text, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorEmail: varchar("actor_email", { length: 320 }),
  action: varchar("action", { length: 120 }).notNull(),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  resourceId: uuid("resource_id"),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The read path's exact query shape: one organisation's rows, newest first.
  // Added in 0011 — the table shipped in 0000 with no index at all, so a
  // listing would otherwise scan and sort every tenant's history.
  index("audit_logs_org_created_idx").on(t.organizationId, t.createdAt.desc()),
  pgPolicy("audit_logs_tenant_isolation", {
    as: "permissive",
    for: "select",
    to: "app_user",
    using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
  }),
  pgPolicy("audit_logs_insert_only", {
    as: "permissive",
    for: "insert",
    to: "app_user",
    withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
  }),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
