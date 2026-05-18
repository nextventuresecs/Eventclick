CREATE TABLE "room_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"room_id" uuid NOT NULL,
	"s3_key" varchar(256) NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file_size" bigint,
	"generated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_reports" ADD CONSTRAINT "room_reports_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_reports" ADD CONSTRAINT "room_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_reports_room_idx" ON "room_reports" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_reports_generated_by_idx" ON "room_reports" USING btree ("generated_by");