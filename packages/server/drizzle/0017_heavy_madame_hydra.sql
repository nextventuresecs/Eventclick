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
ALTER TABLE "form_definitions" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_submissions" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_jobs_job_id_idx" ON "pdf_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_room_id_idx" ON "pdf_jobs" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_user_id_idx" ON "pdf_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pdf_jobs_status_idx" ON "pdf_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD CONSTRAINT "room_recordings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_definitions_org_idx" ON "form_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_org_idx" ON "attendance_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "room_recordings_org_idx" ON "room_recordings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_submissions_org_idx" ON "activity_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_photos_org_idx" ON "activity_photos" USING btree ("organization_id");