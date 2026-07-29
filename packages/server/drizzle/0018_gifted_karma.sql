ALTER TABLE "activity_submissions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_submissions" ADD CONSTRAINT "activity_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_submissions_org_idx" ON "activity_submissions" USING btree ("organization_id");--> statement-breakpoint
UPDATE "activity_submissions" sub SET "organization_id" = er."organization_id" FROM "event_rooms" er WHERE er."id" = sub."room_id" AND sub."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "activity_submissions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_definitions_org_idx" ON "form_definitions" USING btree ("organization_id");--> statement-breakpoint
UPDATE "form_definitions" fd SET "organization_id" = er."organization_id" FROM "event_rooms" er WHERE er."id" = fd."room_id" AND fd."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "form_definitions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_photos" ADD CONSTRAINT "activity_photos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_photos_org_idx" ON "activity_photos" USING btree ("organization_id");--> statement-breakpoint
UPDATE "activity_photos" ap SET "organization_id" = er."organization_id" FROM "event_rooms" er WHERE er."id" = ap."room_id" AND ap."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "activity_photos" ALTER COLUMN "organization_id" SET NOT NULL;
