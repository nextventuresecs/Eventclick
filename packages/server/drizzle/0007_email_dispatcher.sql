CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"email_type" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_deliveries_user_idx" ON "email_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries" USING btree ("status");--> statement-breakpoint

-- Auth-realm table (queried via authDb): no RLS, no organizationId column,
-- same treatment as sessions/password_resets/email_verifications in
-- 0001/0003 — auth_svc_role gets explicit access, app_user gets none.
-- 0003's ALTER DEFAULT PRIVILEGES would otherwise auto-grant app_user
-- access to this table (it applies to every future table the migration-
-- runner role creates), which would be a real isolation gap: this table has
-- no RLS policy to fall back on, so an app_user-scoped query would see
-- every user's email delivery rows with no tenant boundary at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON email_deliveries TO auth_svc_role;
REVOKE ALL ON email_deliveries FROM app_user;