-- Converge database privileges for the RLS roles.
--
-- WHY THIS EXISTS
-- scripts/init-db.sql only executes on a brand-new Postgres data directory
-- (docker-entrypoint-initdb.d semantics). Any cluster created before those
-- grants were added to that file never received them, and editing the script
-- afterwards cannot fix an existing volume. Production ran for months with
-- app_user holding zero privileges on schema public: reads silently returned
-- no rows and writes failed their RLS WITH CHECK predicate.
--
-- Privileges therefore have to be managed as a migration, which every
-- environment replays, rather than as first-boot bootstrap.
--
-- Every statement below is idempotent and safe to re-run.

-- app_user is the RLS-enforced group role every application query runs as.
-- Login roles (app_user_login, auth_svc_role) own credentials and are created
-- by init-db.sql / infrastructure — passwords never belong in a migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- Postgres 15+ dropped the implicit PUBLIC grant on schema public. Without
-- USAGE, unqualified table names do not resolve and Postgres reports
-- 'relation "..." does not exist' rather than a permission error.
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO auth_svc_role';
  END IF;
END
$$;
--> statement-breakpoint

-- Tenant tables: full DML, still filtered by their RLS policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations,
  users,
  org_members,
  event_rooms,
  form_definitions,
  attendance_entries,
  room_recordings,
  event_admin_assignments,
  activity_submissions,
  activity_photos,
  notifications,
  pdf_jobs,
  feedback,
  bug_reports
TO app_user;
--> statement-breakpoint

-- Audit log is append-only: insert and read, never mutate or erase.
GRANT SELECT, INSERT ON audit_logs TO app_user;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--> statement-breakpoint

-- Identity tables stay exclusive to auth_svc_role (BYPASSRLS).
REVOKE ALL ON sessions FROM app_user;
--> statement-breakpoint
REVOKE ALL ON password_resets FROM app_user;
--> statement-breakpoint
REVOKE ALL ON email_verifications FROM app_user;
--> statement-breakpoint

-- Future tables created by later migrations inherit these grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
--> statement-breakpoint

-- Remove hand-applied hotfix policies from the production incident. The
-- per-table *_tenant_isolation policies are FOR ALL and already carry a
-- WITH CHECK clause, so these duplicates only added drift.
DROP POLICY IF EXISTS tenant_insert ON event_rooms;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_insert ON audit_logs;
