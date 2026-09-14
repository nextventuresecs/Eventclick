-- Ops Console database foundation (#146, epic #142).
--
-- WHY THIS EXISTS
-- NVCES maintainers need to read across tenants, which RLS forbids for every
-- application role, and every such read must be recorded somewhere the reading
-- process cannot alter. This migration creates that identity and storage:
--
--   maintainers              who may use the Ops Console (managed by CLI only)
--   maintainer_access_log    append-only record of every maintainer read
--   maintainer_ro            cross-tenant, SELECT-only, column-scoped reads
--   maintainer_audit_writer  INSERT on maintainer_access_log and nothing else
--
-- "Read-only, no secrets" is enforced by Postgres grants, not application
-- code: a column that is not granted below cannot be selected by the Ops
-- Console however its code is written.
--
-- WHY HAND-WRITTEN
-- drizzle/meta has no snapshots for 0011 or 0012, so drizzle-kit would diff
-- against 0010 and re-emit both of those migrations here. The schema files
-- (maintainers.ts, maintainerAccessLog.ts) mirror this DDL for typing only.
--
-- Login roles (maintainer_ro_login, maintainer_audit_login) hold credentials
-- and are created by scripts/init-db.sql and scripts/deploy.sh — passwords
-- never belong in a migration. Precedent: 0003_rls_privileges_converge.sql.
--
-- Every statement is idempotent, so the file is safe to replay by hand.

-- ── Tables ───────────────────────────────────────────────────────────────────
-- Neither table enables RLS: access is controlled purely by grants below.
CREATE TABLE IF NOT EXISTS "maintainers" (
  "id"             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email"          varchar(320) NOT NULL UNIQUE,
  "display_name"   varchar(120) NOT NULL,
  "is_active"      boolean NOT NULL DEFAULT true,
  "added_by"       varchar(320) NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "deactivated_at" timestamptz,
  CONSTRAINT "maintainers_email_lowercase" CHECK ("email" = lower("email")),
  CONSTRAINT "maintainers_deactivated_consistent" CHECK ("is_active" OR "deactivated_at" IS NOT NULL)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "maintainer_access_log" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "maintainer_id"    uuid NOT NULL REFERENCES "maintainers"("id") ON DELETE RESTRICT,
  "maintainer_email" varchar(320) NOT NULL,
  "action"           varchar(32) NOT NULL,
  "target_type"      varchar(16),
  "target_id"        varchar(128),
  -- Deliberately no FK: deleting an organisation must not erase the history
  -- of who looked at it.
  "organization_id"  uuid,
  -- Search parameters. Raw emails are never stored, only sha256(lower(email)).
  "query"            jsonb,
  "reason"           text,
  "result_count"     integer,
  "request_id"       varchar(64) NOT NULL,
  "ip_address"       varchar(64),
  "user_agent"       text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mal_action_valid" CHECK ("action" IN (
    'session.whoami', 'search', 'user.view', 'user.unmask', 'org.view',
    'org.users.list', 'health.view', 'usage.view', 'logs.search')),
  CONSTRAINT "mal_target_type_valid" CHECK ("target_type" IS NULL OR "target_type" IN ('user', 'org', 'request', 'log_query')),
  CONSTRAINT "mal_unmask_reason" CHECK ("action" <> 'user.unmask' OR char_length(btrim("reason")) BETWEEN 10 AND 500)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mal_created_idx" ON "maintainer_access_log" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mal_maintainer_idx" ON "maintainer_access_log" ("maintainer_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mal_org_idx" ON "maintainer_access_log" ("organization_id", "created_at" DESC)
  WHERE "organization_id" IS NOT NULL;
--> statement-breakpoint
-- Per-maintainer rate limits: "how many <action> rows since <t>".
CREATE INDEX IF NOT EXISTS "mal_action_rate_idx" ON "maintainer_access_log" ("maintainer_id", "action", "created_at" DESC);
--> statement-breakpoint

-- ── Append-only enforcement ──────────────────────────────────────────────────
-- A trigger rather than grants alone, because grants do not bind the table
-- owner — and the owner is the role migrations, deploys and the maintainer
-- CLI connect as. This holds for every role.
--
-- There is deliberately no session-setting bypass: any role able to set it
-- could erase evidence. The 365-day retention purge (epic follow-up) must ship
-- its own migration that replaces this function with a narrowly-scoped
-- exception, reviewed on its own.
CREATE OR REPLACE FUNCTION maintainer_access_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'maintainer_access_log is append-only' USING ERRCODE = '42501';
END
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "maintainer_access_log_no_update_delete" ON "maintainer_access_log";
--> statement-breakpoint
CREATE TRIGGER "maintainer_access_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "maintainer_access_log"
  FOR EACH ROW EXECUTE FUNCTION maintainer_access_log_immutable();
--> statement-breakpoint

DROP TRIGGER IF EXISTS "maintainer_access_log_no_truncate" ON "maintainer_access_log";
--> statement-breakpoint
CREATE TRIGGER "maintainer_access_log_no_truncate"
  BEFORE TRUNCATE ON "maintainer_access_log"
  FOR EACH STATEMENT EXECUTE FUNCTION maintainer_access_log_immutable();
--> statement-breakpoint

-- ── Group roles ──────────────────────────────────────────────────────────────
-- NOLOGIN, no passwords. BYPASSRLS sits on the group role so tests can use
-- SET ROLE; the login role needs it too, because role attributes are not
-- inherited through membership. init-db.sql / deploy.sh may have created
-- these already (so their login roles can exist before migrations run); the
-- ALTERs converge attributes either way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro') THEN
    CREATE ROLE maintainer_ro NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_writer') THEN
    CREATE ROLE maintainer_audit_writer NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
ALTER ROLE maintainer_ro NOLOGIN BYPASSRLS;
--> statement-breakpoint
ALTER ROLE maintainer_audit_writer NOLOGIN NOBYPASSRLS;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO maintainer_ro, maintainer_audit_writer;
--> statement-breakpoint

-- ── Close the default-privilege hole ─────────────────────────────────────────
-- 0003 and deploy.sh set ALTER DEFAULT PRIVILEGES so every new table is
-- readable and writable by app_user and auth_svc_role. These two tables must
-- be reachable by neither. auth_svc_role is created outside migrations, so
-- guard on its existence as 0003 does.
REVOKE ALL ON "maintainers", "maintainer_access_log" FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['app_user', 'auth_svc_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON maintainers, maintainer_access_log FROM %I', r);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

-- ── Maintainer grants ────────────────────────────────────────────────────────
GRANT SELECT ON "maintainers" TO maintainer_ro;
--> statement-breakpoint
-- Read access to the log exists for per-maintainer rate limiting.
GRANT SELECT ON "maintainer_access_log" TO maintainer_ro;
--> statement-breakpoint
-- The writer inserts without RETURNING; FK checks run as the table owner, so
-- no SELECT on maintainers is needed either.
GRANT INSERT ON "maintainer_access_log" TO maintainer_audit_writer;
--> statement-breakpoint

-- Column-scoped reads. Anything not listed is unreadable by design:
-- credentials (password_hash, token_hash, google_id), personal content
-- (preferences, photo_url, attendance data/location/photos, form answers),
-- request fingerprints (sessions.ip_address/user_agent), email bodies and
-- recipients, and every table not named here.
GRANT SELECT ("id", "name", "slug", "is_active", "legal_hold", "contact_email", "created_at", "updated_at", "deleted_at")
  ON "organizations" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "email", "full_name", "role", "organization_id", "is_active", "email_verified_at", "last_login_at", "created_at", "updated_at", "deleted_at")
  ON "users" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "user_id", "organization_id", "role", "joined_at", "created_at")
  ON "org_members" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "user_id", "expires_at", "revoked_at", "created_at")
  ON "sessions" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "organization_id", "status", "created_at", "deleted_at")
  ON "event_rooms" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "organization_id", "submitted_at", "deleted_at")
  ON "attendance_entries" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "organization_id", "severity", "component", "title", "status", "created_at")
  ON "bug_reports" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "email_type", "status", "attempts", "last_attempt_at", "created_at")
  ON "email_deliveries" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "organization_id", "channel", "status", "attempts", "last_attempt_at", "created_at")
  ON "notification_deliveries" TO maintainer_ro;
--> statement-breakpoint
GRANT SELECT ("id", "status", "attempts", "max_attempts", "error_message", "created_at", "updated_at")
  ON "pdf_jobs" TO maintainer_ro;
