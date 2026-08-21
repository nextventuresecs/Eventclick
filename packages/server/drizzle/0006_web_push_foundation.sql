CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_org_id_idx" ON "push_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO "app_user" USING ("push_subscriptions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid) WITH CHECK ("push_subscriptions"."organization_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint

-- Explicit grant, not relying on ALTER DEFAULT PRIVILEGES (0003): that only
-- covers future tables created by the same role that set the default, which
-- may not be the role running this migration in every environment.
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO app_user;