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
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_admin_assignments" ADD CONSTRAINT "event_admin_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_admin_assignments_user_room_uniq" ON "event_admin_assignments" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_org_idx" ON "event_admin_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_room_idx" ON "event_admin_assignments" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_user_idx" ON "event_admin_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_admin_assignments_revoked_idx" ON "event_admin_assignments" USING btree ("revoked_at");