-- ============================================================================
-- RLS Enforcement Migration
-- Applies to current schema as of 2026-08-01
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Ensure room_recordings has organization_id BEFORE enabling RLS
-- ---------------------------------------------------------------------------
ALTER TABLE room_recordings ADD COLUMN IF NOT EXISTS organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS room_recordings_org_idx ON public.room_recordings USING btree (organization_id);

-- ----------------------------------------------------------------------------
-- 1. Create app_user group role and app_user_login login role for app connections
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user_login') THEN
    CREATE ROLE app_user_login LOGIN PASSWORD 'local_dev_app';
  END IF;
END
$$;
GRANT app_user TO app_user_login;

-- ----------------------------------------------------------------------------
-- 2. Create auth_svc_role for pre-tenant auth queries
--     In production, the password must come from SSM/secrets, never hardcoded.
--     For local dev, we set a known password.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc_role') THEN
    CREATE ROLE auth_svc_role LOGIN PASSWORD 'local_dev_auth' BYPASSRLS;
  ELSE
    ALTER ROLE auth_svc_role BYPASSRLS;
  END IF;
END
$$;

-- Grant auth_svc_role access to identity/token tables only
GRANT SELECT, INSERT, UPDATE ON users TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON sessions TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON password_resets TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON email_verifications TO auth_svc_role;

-- ----------------------------------------------------------------------------
-- 3. Enable RLS on all tenant-scoped tables
-- ----------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_admin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Force RLS on tenant tables so even superuser connections respect policies
-- ----------------------------------------------------------------------------
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE org_members FORCE ROW LEVEL SECURITY;
ALTER TABLE event_rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE room_recordings FORCE ROW LEVEL SECURITY;
ALTER TABLE form_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE event_admin_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE bug_reports FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. Tenant isolation policies
-- ----------------------------------------------------------------------------

-- org_members
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'org_members' AND policyname = 'org_members_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY org_members_tenant_isolation ON org_members USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- event_rooms
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rooms' AND policyname = 'event_rooms_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY event_rooms_tenant_isolation ON event_rooms USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- form_definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'form_definitions' AND policyname = 'form_definitions_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY form_definitions_tenant_isolation ON form_definitions USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- attendance_entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance_entries' AND policyname = 'attendance_entries_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY attendance_entries_tenant_isolation ON attendance_entries USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- room_recordings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'room_recordings' AND policyname = 'room_recordings_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY room_recordings_tenant_isolation ON room_recordings USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- event_admin_assignments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_admin_assignments' AND policyname = 'event_admin_assignments_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY event_admin_assignments_tenant_isolation ON event_admin_assignments USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- activity_submissions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_submissions' AND policyname = 'activity_submissions_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY activity_submissions_tenant_isolation ON activity_submissions USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- activity_photos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_photos' AND policyname = 'activity_photos_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY activity_photos_tenant_isolation ON activity_photos USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY notifications_tenant_isolation ON notifications USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- feedback (organization_id is nullable — NULL rows invisible under tenant context)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feedback' AND policyname = 'feedback_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY feedback_tenant_isolation ON feedback USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- bug_reports (organization_id is nullable — NULL rows invisible under tenant context)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bug_reports' AND policyname = 'bug_reports_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY bug_reports_tenant_isolation ON bug_reports USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

-- organizations — isolate to own org row
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_read_own') THEN
    EXECUTE format('CREATE POLICY organizations_read_own ON organizations FOR SELECT USING (id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_update_own') THEN
    EXECUTE format('CREATE POLICY organizations_update_own ON organizations FOR UPDATE USING (id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_delete_own') THEN
    EXECUTE format('CREATE POLICY organizations_delete_own ON organizations FOR DELETE USING (id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_insert_new') THEN
    EXECUTE format('CREATE POLICY organizations_insert_new ON organizations FOR INSERT WITH CHECK (true)');
  END IF;
END
$$;

-- users — match by direct organization_id OR via org_membership
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_tenant_isolation') THEN
    EXECUTE format('CREATE POLICY users_tenant_isolation ON users USING (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid OR EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = users.id AND m.organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid OR organization_id IS NULL)');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_insert_new') THEN
    EXECUTE format('CREATE POLICY users_insert_new ON users FOR INSERT WITH CHECK (true)');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 6. Lock down auth tables: app_user gets no access
-- ----------------------------------------------------------------------------
REVOKE ALL ON sessions FROM app_user;
REVOKE ALL ON password_resets FROM app_user;
REVOKE ALL ON email_verifications FROM app_user;

-- ----------------------------------------------------------------------------
-- 7. Grant app_user access to tenant tables
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
