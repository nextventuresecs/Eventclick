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
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'volunteer'::text;--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ALTER COLUMN "assigned_role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'event_manager', 'volunteer');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'volunteer'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ALTER COLUMN "assigned_role" SET DATA TYPE "public"."user_role" USING "assigned_role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_org_idx" ON "feedback" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bug_reports_user_idx" ON "bug_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bug_reports_org_idx" ON "bug_reports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_org_id_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "org_members_invited_by_idx" ON "org_members" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "sessions_replaced_by_idx" ON "sessions" USING btree ("replaced_by_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_submitted_by_idx" ON "attendance_entries" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_assigned_by_idx" ON "event_admin_assignments" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "activity_photos_submitted_by_idx" ON "activity_photos" USING btree ("submitted_by");