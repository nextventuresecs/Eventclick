ALTER TABLE "event_rooms" ADD COLUMN "location" varchar(300);--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "longitude" double precision;