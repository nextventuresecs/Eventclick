ALTER TABLE "room_recordings" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "room_recordings" ADD CONSTRAINT "room_recordings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_recordings_org_idx" ON "room_recordings" USING btree ("organization_id");--> statement-breakpoint
UPDATE "room_recordings" rr SET "organization_id" = er."organization_id" FROM "event_rooms" er WHERE er."id" = rr."room_id" AND rr."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "room_recordings" ALTER COLUMN "organization_id" SET NOT NULL;
