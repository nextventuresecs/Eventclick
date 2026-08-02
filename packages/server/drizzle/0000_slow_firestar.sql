CREATE TYPE "public"."recording_status" AS ENUM('pending', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('scheduled', 'live', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stream_provider" AS ENUM('livekit', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'event_manager', 'volunteer');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text,
	"logo_url" text,
	"website_url" text,
	"contact_email" varchar(320),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text,
	"full_name" varchar(120) NOT NULL,
	"role" "user_role" DEFAULT 'volunteer' NOT NULL,
	"photo_url" text,
	"preferences" jsonb,
	"organization_id" uuid,
	"google_id" varchar(128),
	"email_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rooms" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" "room_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"max_participants" integer,
	"share_token" varchar(32) NOT NULL,
	"livekit_room_name" varchar(80),
	"stream_provider" "stream_provider" DEFAULT 'livekit' NOT NULL,
	"youtube_watch_url" text,
	"youtube_embed_url" text,
	"attendance_window_before" integer DEFAULT 15 NOT NULL,
	"attendance_window_after" integer DEFAULT 30 NOT NULL,
	"location" varchar(300),
	"latitude" double precision,
	"longitude" double precision,
	"activity_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "event_rooms_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"replaced_by_id" uuid,
	"user_agent" text,
	"ip_address" varchar(45),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attendance_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_definition_id" uuid NOT NULL,
	"submitted_by" uuid,
	"data" jsonb NOT NULL,
	"photo_key" varchar(256),
	"photo_url" text,
	"latitude" double precision,
	"longitude" double precision,
	"location" geometry(point),
	"ip_address" varchar(45),
	"user_agent" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_recordings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "recording_status" DEFAULT 'pending' NOT NULL,
	"egress_id" varchar(80),
	"s3_key" varchar(256),
	"mime_type" varchar(64),
	"size_bytes" bigint,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_admin_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"assigned_role" "user_role" NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_submissions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_photos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"submission_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" varchar(64) NOT NULL,
	"photo_key" varchar(256) NOT NULL,
	"photo_url" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"location" geometry(point),
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(256) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(256) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"category" varchar(100) NOT NULL,
	"rating" integer NOT NULL,
	"subject" varchar(200) NOT NULL,
	"comments" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"severity" varchar(50) NOT NULL,
	"component" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"steps" text NOT NULL,
	"expected" text NOT NULL,
	"actual" text NOT NULL,
	"system_info" text,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"s3_key" text,
	"s3_url" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "pdf_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_email" varchar(320),
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" uuid,
	"old_values" text,
	"new_values" text,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD CONSTRAINT "event_rooms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD CONSTRAINT "event_rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_id_sessions_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_form_definition_id_form_definitions_id_fk" FOREIGN KEY ("form_definition_id") REFERENCES "public"."form_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD CONSTRAINT "room_recordings_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD CONSTRAINT "room_recordings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_submission_id_activity_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."activity_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_user_org_uniq" ON "org_members" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "org_members_org_idx" ON "org_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_members_invited_by_idx" ON "org_members" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "event_rooms_org_idx" ON "event_rooms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_rooms_status_idx" ON "event_rooms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_rooms_scheduled_start_idx" ON "event_rooms" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "event_rooms_org_status_idx" ON "event_rooms" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "event_rooms_org_created_at_idx" ON "event_rooms" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_replaced_by_idx" ON "sessions" USING btree ("replaced_by_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "form_definitions_room_idx" ON "form_definitions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "form_definitions_org_idx" ON "form_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_definitions_room_version_unique" ON "form_definitions" USING btree ("room_id","version");--> statement-breakpoint
CREATE INDEX "attendance_entries_room_idx" ON "attendance_entries" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_org_idx" ON "attendance_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_form_idx" ON "attendance_entries" USING btree ("form_definition_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_submitted_at_idx" ON "attendance_entries" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "attendance_entries_submitted_by_idx" ON "attendance_entries" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "attendance_entries_room_submitted_at_idx" ON "attendance_entries" USING btree ("room_id","submitted_at");--> statement-breakpoint
CREATE INDEX "attendance_entries_location_idx" ON "attendance_entries" USING gist ("location");--> statement-breakpoint
CREATE INDEX "room_recordings_room_idx" ON "room_recordings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_recordings_org_idx" ON "room_recordings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "room_recordings_status_idx" ON "room_recordings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "room_recordings_egress_idx" ON "room_recordings" USING btree ("egress_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_admin_assignments_user_room_uniq" ON "event_admin_assignments" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_org_idx" ON "event_admin_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_room_idx" ON "event_admin_assignments" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_user_idx" ON "event_admin_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_assigned_by_idx" ON "event_admin_assignments" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_revoked_idx" ON "event_admin_assignments" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_submissions_room_activity_uniq" ON "activity_submissions" USING btree ("room_id","activity_id");--> statement-breakpoint
CREATE INDEX "activity_submissions_room_idx" ON "activity_submissions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "activity_submissions_org_idx" ON "activity_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_submissions_activity_idx" ON "activity_submissions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_photos_submission_idx" ON "activity_photos" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "activity_photos_room_activity_idx" ON "activity_photos" USING btree ("room_id","activity_id");--> statement-breakpoint
CREATE INDEX "activity_photos_org_idx" ON "activity_photos" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_photos_submitted_by_idx" ON "activity_photos" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "activity_photos_location_idx" ON "activity_photos" USING gist ("location");--> statement-breakpoint
CREATE INDEX "password_resets_token_hash_idx" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_org_idx" ON "feedback" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bug_reports_user_idx" ON "bug_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bug_reports_org_idx" ON "bug_reports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_org_id_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pdf_jobs_job_id_idx" ON "pdf_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_room_id_idx" ON "pdf_jobs" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_user_id_idx" ON "pdf_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_status_idx" ON "pdf_jobs" USING btree ("status");--> statement-breakpoint
CREATE POLICY "organizations_read_own" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING ("organizations"."id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "organizations_update_own" ON "organizations" AS PERMISSIVE FOR UPDATE TO public USING ("organizations"."id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("organizations"."id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "organizations_delete_own" ON "organizations" AS PERMISSIVE FOR DELETE TO public USING ("organizations"."id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "organizations_insert_new" ON "organizations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);