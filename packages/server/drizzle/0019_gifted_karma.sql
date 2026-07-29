-- Enable Row Level Security on tenant-scoped tables
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bug_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Create app_user role for application connections
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint

-- Grant minimal privileges to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON FUNCTION auth_jwt() TO app_user;
