-- audit_logs has been written to since it shipped and never read: the table
-- was created in 0000 with a primary key and its two RLS policies, and no
-- index was ever added. The read path (#91) filters by organisation and sorts
-- newest-first, so without this every page view is a sequential scan plus a
-- sort over EVERY tenant's history — meaning the organisation that feels the
-- slowness is not the one that caused it.
--
-- Not CONCURRENTLY: drizzle wraps migrations in a transaction and CREATE INDEX
-- CONCURRENTLY cannot run inside one. The share lock blocks writes for the
-- duration, which on this table is milliseconds and happens during a restart.
CREATE INDEX IF NOT EXISTS "audit_logs_org_created_idx"
  ON "audit_logs" ("organization_id", "created_at" DESC);
