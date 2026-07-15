CREATE TABLE "activity_photos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"submission_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"activity_id" varchar(64) NOT NULL,
	"photo_key" varchar(256) NOT NULL,
	"photo_url" text NOT NULL,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_definitions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_submission_id_activity_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."activity_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_photos_submission_idx" ON "activity_photos" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "activity_photos_room_activity_idx" ON "activity_photos" USING btree ("room_id","activity_id");--> statement-breakpoint
CREATE INDEX "event_rooms_org_status_idx" ON "event_rooms" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "event_rooms_org_created_at_idx" ON "event_rooms" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_entries_room_submitted_at_idx" ON "attendance_entries" USING btree ("room_id","submitted_at");--> statement-breakpoint
ALTER TABLE "activity_submissions" DROP COLUMN "photos";