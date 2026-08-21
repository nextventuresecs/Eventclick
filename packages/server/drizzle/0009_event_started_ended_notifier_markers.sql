ALTER TABLE "event_rooms" ADD COLUMN "notify_email_on_start" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "event_started_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "event_ended_notified_at" timestamp with time zone;