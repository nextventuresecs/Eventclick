import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { maintainers } from "./maintainers";

export const MAINTAINER_ACCESS_ACTIONS = [
  "session.whoami",
  "search",
  "user.view",
  "user.unmask",
  "org.view",
  "org.users.list",
  "health.view",
  "usage.view",
  "logs.search",
] as const;
export type MaintainerAccessAction = (typeof MAINTAINER_ACCESS_ACTIONS)[number];

export const MAINTAINER_ACCESS_TARGET_TYPES = ["user", "org", "request", "log_query"] as const;
export type MaintainerAccessTargetType = (typeof MAINTAINER_ACCESS_TARGET_TYPES)[number];

/**
 * Append-only record of every Ops Console read. A trigger rejects UPDATE,
 * DELETE and TRUNCATE for every role, including the owner; the Ops Console
 * writes through maintainer_audit_writer, which holds INSERT and nothing else.
 *
 * DDL, trigger and grants live in drizzle/0013_ops_console_foundation.sql
 * (hand-written). Keep this definition in step with it.
 */
export const maintainerAccessLog = pgTable(
  "maintainer_access_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    maintainerId: uuid("maintainer_id")
      .notNull()
      .references(() => maintainers.id, { onDelete: "restrict" }),
    maintainerEmail: varchar("maintainer_email", { length: 320 }).notNull(),
    action: varchar("action", { length: 32 }).$type<MaintainerAccessAction>().notNull(),
    targetType: varchar("target_type", { length: 16 }).$type<MaintainerAccessTargetType>(),
    targetId: varchar("target_id", { length: 128 }),
    // No FK: deleting an organisation must not erase who looked at it.
    organizationId: uuid("organization_id"),
    // Search parameters. Raw emails are never stored, only sha256(lower(email)).
    query: jsonb("query"),
    reason: text("reason"),
    resultCount: integer("result_count"),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mal_created_idx").on(t.createdAt.desc()),
    index("mal_maintainer_idx").on(t.maintainerId, t.createdAt.desc()),
    index("mal_org_idx").on(t.organizationId, t.createdAt.desc()).where(sql`${t.organizationId} IS NOT NULL`),
    index("mal_action_rate_idx").on(t.maintainerId, t.action, t.createdAt.desc()),
    check(
      "mal_action_valid",
      sql`${t.action} IN ('session.whoami','search','user.view','user.unmask','org.view','org.users.list','health.view','usage.view','logs.search')`,
    ),
    check(
      "mal_target_type_valid",
      sql`${t.targetType} IS NULL OR ${t.targetType} IN ('user','org','request','log_query')`,
    ),
    check(
      "mal_unmask_reason",
      sql`${t.action} <> 'user.unmask' OR char_length(btrim(${t.reason})) BETWEEN 10 AND 500`,
    ),
  ],
);

export type MaintainerAccessLogEntry = typeof maintainerAccessLog.$inferSelect;
export type NewMaintainerAccessLogEntry = typeof maintainerAccessLog.$inferInsert;
