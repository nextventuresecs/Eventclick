CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'web_push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('room_starting_soon', 'report_ready', 'report_failed', 'legacy_unspecified', 'USER_INVITED', 'ATTENDANCE_WINDOW_OPENED', 'EVENT_STARTED', 'EVENT_ENDED', 'REPORT_GENERATED', 'ORG_BROADCAST', 'ATTENDANCE_WINDOW_CLOSING', 'EVENT_STREAM_STATE_CHANGED', 'USER_LEFT_EVENT', 'EVENT_CANCELLED_OR_EXPIRED');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Defensive cast: any pre-existing row whose free-text type doesn't match a
-- known enum value casts to 'legacy_unspecified' instead of failing the
-- migration outright.
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."notification_type" USING (
	CASE
		WHEN "type" IN ('room_starting_soon', 'report_ready', 'report_failed', 'legacy_unspecified', 'USER_INVITED', 'ATTENDANCE_WINDOW_OPENED', 'EVENT_STARTED', 'EVENT_ENDED', 'REPORT_GENERATED', 'ORG_BROADCAST', 'ATTENDANCE_WINDOW_CLOSING', 'EVENT_STREAM_STATE_CHANGED', 'USER_LEFT_EVENT', 'EVENT_CANCELLED_OR_EXPIRED')
		THEN "type"::"public"."notification_type"
		ELSE 'legacy_unspecified'::"public"."notification_type"
	END
);--> statement-breakpoint
-- Defensive cast: NULLIF guards against a stray empty-string value, which is
-- not valid JSON and would otherwise fail the cast outright.
ALTER TABLE "notifications" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING NULLIF("metadata", '')::jsonb;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_id_idx" ON "notification_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_org_id_idx" ON "notification_deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE POLICY "notification_deliveries_tenant_isolation" ON "notification_deliveries" AS PERMISSIVE FOR ALL TO "app_user" USING ("notification_deliveries"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("notification_deliveries"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint

-- Explicit grant, not relying on 0003's ALTER DEFAULT PRIVILEGES: that only
-- covers future tables created by the same role that set the default, which
-- may not be the role running this migration in every environment. Postgres
-- checks table-level privilege before RLS, so without this, app_user gets
-- "permission denied for table notification_deliveries" regardless of how
-- correct the policy above is. Idempotent and safe to re-run.
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO app_user;