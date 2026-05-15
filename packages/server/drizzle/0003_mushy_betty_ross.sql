ALTER TYPE "public"."user_role" RENAME VALUE 'super_admin' TO 'ngo_admin';--> statement-breakpoint
ALTER TYPE "public"."user_role" RENAME VALUE 'organizer' TO 'volunteer';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'volunteer'::"public"."user_role";
