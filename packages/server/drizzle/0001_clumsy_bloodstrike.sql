-- Migration: 0001_clumsy_bloodstrike
-- Purpose: Add RLS policies and tenant isolation for all tenant tables
--          (0000_slow_firestar only enabled RLS on organizations)
--> statement-breakpoint
-- Enable RLS on tenant tables that were missing it--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bug_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Enable FORCE ROW LEVEL SECURITY on ALL tenant tables (prevents owner bypass)--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_definitions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_recordings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_submissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_photos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pdf_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bug_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Tenant isolation policies for users (nullable organization_id)--> statement-breakpoint
DROP POLICY IF EXISTS "users_tenant_isolation" ON "users";--> statement-breakpoint
DROP POLICY IF EXISTS "users_insert_new" ON "users";--> statement-breakpoint
DROP POLICY IF EXISTS "users_update_own" ON "users";--> statement-breakpoint
CREATE POLICY "users_tenant_isolation" ON "users" AS PERMISSIVE FOR SELECT TO "app_user" USING ("users"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "users"."organization_id" IS NULL);--> statement-breakpoint
CREATE POLICY "users_insert_new" ON "users" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("users"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "users"."organization_id" IS NULL);--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("users"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "users"."organization_id" IS NULL) WITH CHECK ("users"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "users"."organization_id" IS NULL);--> statement-breakpoint
-- Tenant isolation policies for standard organization_id tables--> statement-breakpoint
DROP POLICY IF EXISTS "org_members_tenant_isolation" ON "org_members";--> statement-breakpoint
DROP POLICY IF EXISTS "event_rooms_tenant_isolation" ON "event_rooms";--> statement-breakpoint
DROP POLICY IF EXISTS "form_definitions_tenant_isolation" ON "form_definitions";--> statement-breakpoint
DROP POLICY IF EXISTS "attendance_entries_tenant_isolation" ON "attendance_entries";--> statement-breakpoint
DROP POLICY IF EXISTS "room_recordings_tenant_isolation" ON "room_recordings";--> statement-breakpoint
DROP POLICY IF EXISTS "event_admin_assignments_tenant_isolation" ON "event_admin_assignments";--> statement-breakpoint
DROP POLICY IF EXISTS "activity_submissions_tenant_isolation" ON "activity_submissions";--> statement-breakpoint
DROP POLICY IF EXISTS "activity_photos_tenant_isolation" ON "activity_photos";--> statement-breakpoint
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON "notifications";--> statement-breakpoint
DROP POLICY IF EXISTS "pdf_jobs_tenant_isolation" ON "pdf_jobs";--> statement-breakpoint
DROP POLICY IF EXISTS "feedback_tenant_isolation" ON "feedback";--> statement-breakpoint
DROP POLICY IF EXISTS "feedback_insert_new" ON "feedback";--> statement-breakpoint
DROP POLICY IF EXISTS "bug_reports_tenant_isolation" ON "bug_reports";--> statement-breakpoint
DROP POLICY IF EXISTS "bug_reports_insert_new" ON "bug_reports";--> statement-breakpoint
DROP POLICY IF EXISTS "audit_logs_insert_only" ON "audit_logs";--> statement-breakpoint
CREATE POLICY "org_members_tenant_isolation" ON "org_members" AS PERMISSIVE FOR ALL TO "app_user" USING ("org_members"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("org_members"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "event_rooms_tenant_isolation" ON "event_rooms" AS PERMISSIVE FOR ALL TO "app_user" USING ("event_rooms"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("event_rooms"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "form_definitions_tenant_isolation" ON "form_definitions" AS PERMISSIVE FOR ALL TO "app_user" USING ("form_definitions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("form_definitions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "attendance_entries_tenant_isolation" ON "attendance_entries" AS PERMISSIVE FOR ALL TO "app_user" USING ("attendance_entries"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("attendance_entries"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "room_recordings_tenant_isolation" ON "room_recordings" AS PERMISSIVE FOR ALL TO "app_user" USING ("room_recordings"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("room_recordings"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "event_admin_assignments_tenant_isolation" ON "event_admin_assignments" AS PERMISSIVE FOR ALL TO "app_user" USING ("event_admin_assignments"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("event_admin_assignments"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "activity_submissions_tenant_isolation" ON "activity_submissions" AS PERMISSIVE FOR ALL TO "app_user" USING ("activity_submissions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("activity_submissions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "activity_photos_tenant_isolation" ON "activity_photos" AS PERMISSIVE FOR ALL TO "app_user" USING ("activity_photos"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("activity_photos"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO "app_user" USING ("notifications"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("notifications"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
-- pdf_jobs uses org_id (not organization_id)--> statement-breakpoint
CREATE POLICY "pdf_jobs_tenant_isolation" ON "pdf_jobs" AS PERMISSIVE FOR ALL TO "app_user" USING ("pdf_jobs"."org_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("pdf_jobs"."org_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
-- feedback (nullable organization_id)--> statement-breakpoint
CREATE POLICY "feedback_tenant_isolation" ON "feedback" AS PERMISSIVE FOR SELECT TO "app_user" USING ("feedback"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "feedback"."organization_id" IS NULL);--> statement-breakpoint
CREATE POLICY "feedback_insert_new" ON "feedback" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("feedback"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "feedback"."organization_id" IS NULL);--> statement-breakpoint
-- bug_reports (nullable organization_id)--> statement-breakpoint
CREATE POLICY "bug_reports_tenant_isolation" ON "bug_reports" AS PERMISSIVE FOR SELECT TO "app_user" USING ("bug_reports"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "bug_reports"."organization_id" IS NULL);--> statement-breakpoint
CREATE POLICY "bug_reports_insert_new" ON "bug_reports" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("bug_reports"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR "bug_reports"."organization_id" IS NULL);--> statement-breakpoint
-- audit_logs: SELECT + INSERT allowed, UPDATE/DELETE blocked (immutable)--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "app_user" USING ("audit_logs"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_insert_only" ON "audit_logs" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("audit_logs"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
-- Grants: app_user gets full access to tenant tables--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, org_members, event_rooms, form_definitions, attendance_entries, room_recordings, event_admin_assignments, activity_submissions, activity_photos, notifications, pdf_jobs, audit_logs, feedback, bug_reports TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;--> statement-breakpoint
-- REVOKE auth tables from app_user (only auth_svc_role should access)--> statement-breakpoint
REVOKE ALL ON sessions FROM app_user;--> statement-breakpoint
REVOKE ALL ON password_resets FROM app_user;--> statement-breakpoint
REVOKE ALL ON email_verifications FROM app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;--> statement-breakpoint
-- Grants: auth_svc_role gets full access to all tables--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, org_members, event_rooms, form_definitions, attendance_entries, room_recordings, event_admin_assignments, activity_submissions, activity_photos, notifications, pdf_jobs, audit_logs, feedback, bug_reports, sessions, password_resets, email_verifications TO auth_svc_role;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO auth_svc_role;--> statement-breakpoint
