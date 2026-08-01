ALTER TYPE "public"."user_role" RENAME VALUE 'event_admin' TO 'event_manager';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_url" text;
