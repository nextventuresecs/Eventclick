CREATE TYPE "public"."recording_status" AS ENUM('pending', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"form_definition_id" uuid NOT NULL,
	"submitted_by" uuid,
	"data" jsonb NOT NULL,
	"photo_key" varchar(256),
	"photo_url" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_recordings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
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
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_form_definition_id_form_definitions_id_fk" FOREIGN KEY ("form_definition_id") REFERENCES "public"."form_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD CONSTRAINT "room_recordings_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_definitions_room_idx" ON "form_definitions" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_definitions_room_version_unique" ON "form_definitions" USING btree ("room_id","version");--> statement-breakpoint
CREATE INDEX "attendance_entries_room_idx" ON "attendance_entries" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_form_idx" ON "attendance_entries" USING btree ("form_definition_id");--> statement-breakpoint
CREATE INDEX "attendance_entries_submitted_at_idx" ON "attendance_entries" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "room_recordings_room_idx" ON "room_recordings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_recordings_status_idx" ON "room_recordings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "room_recordings_egress_idx" ON "room_recordings" USING btree ("egress_id");