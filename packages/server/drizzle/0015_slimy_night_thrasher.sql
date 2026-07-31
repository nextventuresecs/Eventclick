ALTER TABLE "attendance_entries" ADD COLUMN "location" geometry(point);--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "location" geometry(point);--> statement-breakpoint
CREATE INDEX "attendance_entries_location_idx" ON "attendance_entries" USING gist ("location");--> statement-breakpoint
CREATE INDEX "activity_photos_location_idx" ON "activity_photos" USING gist ("location");