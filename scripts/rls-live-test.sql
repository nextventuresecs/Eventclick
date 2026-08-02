-- RLS Live Test Script
-- Connects as Eventclick_admin to set up test data, then as app_user to verify RLS

\echo '=== Step 1: Check app_user role attributes ==='
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';

\echo '=== Step 2: Check RLS status on key tables ==='
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('event_rooms','activity_submissions','attendance_entries','audit_logs','sessions','password_resets','email_verifications') ORDER BY relname;

\echo '=== Step 3: Check policies on tenant tables ==='
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('event_rooms','activity_submissions','attendance_entries','audit_logs') ORDER BY tablename, policyname;

\echo '=== Step 4: Check table ownership ==='
SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('event_rooms','activity_submissions','attendance_entries','audit_logs','users','organizations','sessions','password_resets','email_verifications') ORDER BY tablename;

\echo '=== Step 5: Check FORCE ROW LEVEL SECURITY ==='
SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN ('event_rooms','activity_submissions','attendance_entries','audit_logs','users','organizations') ORDER BY relname;

\echo '=== Step 6: Create test data ==='
INSERT INTO organizations (id, name, slug, description, contact_email, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Org Alpha', 'test-alpha', 'RLS test org A', 'alpha@test.com', true),
  ('22222222-2222-2222-2222-222222222222', 'Test Org Beta', 'test-beta', 'RLS test org B', 'beta@test.com', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, full_name, role, organization_id, is_active, password_hash) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alpha-user@test.com', 'Alpha User', 'volunteer', '11111111-1111-1111-1111-111111111111', true, 'dummy'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'beta-user@test.com', 'Beta User', 'volunteer', '22222222-2222-2222-2222-222222222222', true, 'dummy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_rooms (id, organization_id, created_by, title, description, status, scheduled_start, scheduled_end, max_participants, share_token, stream_provider, activity_definitions, attendance_window_before, attendance_window_after) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alpha Room', 'Room in org alpha', 'scheduled', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 10, 'alpha-token-123', 'livekit', '[]', 15, 30),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Beta Room', 'Room in org beta', 'scheduled', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 10, 'beta-token-456', 'livekit', '[]', 15, 30)
ON CONFLICT (id) DO NOTHING;

\echo '=== Step 7: Test as app_user with tenant = org alpha ==='
SET ROLE app_user;
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT id, title, organization_id, count(*) OVER() AS total_rows FROM event_rooms WHERE deleted_at IS NULL ORDER BY title;

\echo '=== Step 8: Test as app_user with tenant = org beta ==='
SET app.current_tenant = '22222222-2222-2222-2222-222222222222';
SELECT id, title, organization_id, count(*) OVER() AS total_rows FROM event_rooms WHERE deleted_at IS NULL ORDER BY title;

\echo '=== Step 9: Test as app_user with NO tenant context ==='
SET app.current_tenant = '';
SELECT id, title, organization_id, count(*) OVER() AS total_rows FROM event_rooms WHERE deleted_at IS NULL ORDER BY title;

\echo '=== Step 10: Cross-org leak attempt ==='
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT id, title, organization_id FROM event_rooms WHERE deleted_at IS NULL AND organization_id = '22222222-2222-2222-2222-222222222222';

\echo '=== Step 11: Test activity_submissions ==='
INSERT INTO activity_submissions (id, event_room_id, activity_id, user_id, organization_id, submitted_at, data) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'activity-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', NOW(), '{}'),
  ('ffffffff-ffff-ffff-ffff-ffffffffff', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'activity-2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', NOW(), '{}')
ON CONFLICT (id) DO NOTHING;

SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT id, organization_id, count(*) OVER() AS total_rows FROM activity_submissions ORDER BY id;

SET app.current_tenant = '22222222-2222-2222-2222-222222222222';
SELECT id, organization_id, count(*) OVER() AS total_rows FROM activity_submissions ORDER BY id;

\echo '=== Step 12: Test as table owner (Postgres superuser bypass) ==='
RESET ROLE;
SELECT current_setting('app.current_tenant', true) AS current_tenant;

\echo '=== Step 13: Test audit_logs ==='
INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user.login', 'user', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{}', '{}', 'localhost', 'test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user.login', 'user', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{}', '{}', 'localhost', 'test')
ON CONFLICT (id) DO NOTHING;

SET ROLE app_user;
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT id, organization_id, count(*) OVER() AS total_rows FROM audit_logs ORDER BY id;

SET app.current_tenant = '22222222-2222-2222-2222-222222222222';
SELECT id, organization_id, count(*) OVER() AS total_rows FROM audit_logs ORDER BY id;

\echo '=== Step 14: Cleanup test data ==='
RESET ROLE;
DELETE FROM audit_logs WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
DELETE FROM activity_submissions WHERE id IN ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffff');
DELETE FROM event_rooms WHERE id IN ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
DELETE FROM users WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM organizations WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
