import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

export const bugReports = pgTable(
  "bug_reports",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    severity: varchar("severity", { length: 50 }).notNull(),
    component: varchar("component", { length: 100 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    steps: text("steps").notNull(),
    expected: text("expected").notNull(),
    actual: text("actual").notNull(),
    systemInfo: text("system_info"), // JSON string
    status: varchar("status", { length: 50 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bug_reports_user_idx").on(t.userId),
    index("bug_reports_org_idx").on(t.organizationId),
  ],
);

export type BugReport = typeof bugReports.$inferSelect;
export type NewBugReport = typeof bugReports.$inferInsert;
