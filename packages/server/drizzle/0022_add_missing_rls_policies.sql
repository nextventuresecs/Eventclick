-- ============================================================================
-- Adds the RLS policies migration 0019 omitted, using the confirmed schema.
-- Review before applying — two items below need a yes/no from you, marked
-- with "CONFIRM BEFORE RUNNING".
--
-- CONFIRM BEFORE RUNNING #1:
--   What role does the production app pool actually connect as?
--     SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
--   rolsuper and rolbypassrls must both be false, or every policy below is
--   silently ignored for that connection.
--
-- CONFIRM BEFORE RUNNING #2:
--   Does your auth code (login, signup, password-reset request, email
--   verification confirm) currently query `users`/`sessions`/`password_resets`
--   /`email_verifications` through the same `app_user` connection pool, or a
--   separate one? This migration assumes you will introduce `auth_svc_role`
--   (created below) and repoint those specific code paths at it. If that's a
--   bigger change than you want right now, say so — there's a simpler but
--   weaker fallback noted inline near the sessions section.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. New role for auth-specific, inherently pre-tenant/pre-identity queries.
--    Password must come from SSM/secrets, never hardcoded here.
-- ----------------------------------------------------------------------------
-- BYPASSRLS is required here, not optional: without it, auth_svc_role would
-- hit the exact same deny-all problem on `users` that it exists to solve,
-- since a pre-identity email lookup can never satisfy a tenant-scoped
-- policy. This is intentional, expected cross-tenant access for identity
-- lookups only — the security boundary shifts to "who holds this
-- credential" (keep it exclusively in the auth service layer), not RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc_role') THEN
    CREATE ROLE auth_svc_role LOGIN PASSWORD 'REPLACE_VIA_SSM_AT_DEPLOY' BYPASSRLS;
  ELSE
    ALTER ROLE auth_svc_role BYPASSRLS;
  END IF;
END $$;

-- Auth service touches only identity/token tables, nothing tenant-scoped.
GRANT SELECT, INSERT, UPDATE ON users TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON sessions TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON password_resets TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON email_verifications TO auth_svc_role;


-- ----------------------------------------------------------------------------
-- 1. Straightforward tables: direct organization_id match, all commands.
-- ----------------------------------------------------------------------------
CREATE POLICY org_members_tenant_isolation ON org_members
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY event_rooms_tenant_isolation ON event_rooms
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY form_definitions_tenant_isolation ON form_definitions
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY attendance_entries_tenant_isolation ON attendance_entries
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY room_recordings_tenant_isolation ON room_recordings
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY event_admin_assignments_tenant_isolation ON event_admin_assignments
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY activity_submissions_tenant_isolation ON activity_submissions
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY activity_photos_tenant_isolation ON activity_photos
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY notifications_tenant_isolation ON notifications
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- feedback / bug_reports: organization_id is nullable. NULL rows will be
-- invisible under any tenant context (NULL = x is never true) — that's
-- correct fail-safe behavior. If you need a platform-wide admin view of
-- org-less feedback/bugs, that view must go through a separate bypass
-- role, not app_user.
CREATE POLICY feedback_tenant_isolation ON feedback
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY bug_reports_tenant_isolation ON bug_reports
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ----------------------------------------------------------------------------
-- 2. pdf_jobs — column is named org_id, not organization_id. Don't copy-paste
--    the pattern above without checking; this was the one column-name trap
--    in the schema.
-- ----------------------------------------------------------------------------
CREATE POLICY pdf_jobs_tenant_isolation ON pdf_jobs
  USING (org_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ----------------------------------------------------------------------------
-- 3. audit_logs — RLS was never enabled here at all (confirmed gap, not by
--    design). This is your GDPR Article 30 trail; it deserves both tenant
--    isolation AND immutability enforced at the grant level, not just app
--    convention.
-- ----------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Enforce "immutable append-only" at the DB level, not just by convention:
-- app_user can insert and read audit rows, but never update or delete them.
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
GRANT SELECT, INSERT ON audit_logs TO app_user;


-- ----------------------------------------------------------------------------
-- 4. organizations — the isolating column is the row's own `id`. SELECT/
--    UPDATE/DELETE are scoped to the tenant's own row. INSERT is left open
--    (WITH CHECK true) because a brand-new org has no existing tenant
--    context to match against — org creation itself is gated by your
--    signup/business logic, not by RLS. If you want creation itself locked
--    down at the DB level too, route org-creation INSERTs through
--    auth_svc_role instead and drop the INSERT policy below.
-- ----------------------------------------------------------------------------
CREATE POLICY organizations_read_own ON organizations
  FOR SELECT
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_update_own ON organizations
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_delete_own ON organizations
  FOR DELETE
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_insert_new ON organizations
  FOR INSERT
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 5. users — organization_id is nullable (a user can exist without an org
--    during onboarding), and users also relates to orgs many-to-many via
--    org_members. Policy below allows a row through if EITHER the direct
--    organization_id matches the tenant, OR the user is a member of the
--    tenant org via org_members. INSERT is left open for the same reason as
--    organizations (new-user signup has no org yet); route signup through
--    auth_svc_role if you want this locked down too.
--
--    IMPORTANT: this policy does NOT cover login-by-email, password-reset
--    lookup-by-email, or email-verification lookup-by-token — those have no
--    tenant context yet by definition. Those specific code paths must use
--    auth_svc_role (created above), which bypasses this policy entirely by
--    virtue of not being subject to it as a grantee change — confirm your
--    auth service layer is updated to use that connection for exactly
--    those flows, and only those flows.
-- ----------------------------------------------------------------------------
CREATE POLICY users_tenant_isolation ON users
  USING (
    organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM org_members m
      WHERE m.user_id = users.id
        AND m.organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR organization_id IS NULL
  );

CREATE POLICY users_insert_new ON users
  FOR INSERT
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 6. sessions / password_resets / email_verifications — deliberately NO
--    row-level policy. Their real access pattern ("find this row by its
--    token hash") is inherently a pre-identity lookup; a user_id- or
--    org-scoped policy would either be a no-op for that pattern or break it.
--
--    Instead: remove all access from app_user at the table-grant level, so
--    no ordinary business-data query path — including a SQL-injected one —
--    can reach these tables at all. Only auth_svc_role (already granted
--    above) can touch them.
-- ----------------------------------------------------------------------------
REVOKE ALL ON sessions FROM app_user;
REVOKE ALL ON password_resets FROM app_user;
REVOKE ALL ON email_verifications FROM app_user;

-- If splitting to auth_svc_role is more change than you want to make right
-- now, the fallback is weaker but still better than nothing: leave app_user's
-- existing grants in place and rely on parameterized queries (Drizzle
-- already does this) plus network-level DB access restriction as your only
-- defense here. Flagging this explicitly rather than leaving it silent.
