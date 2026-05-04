CREATE TYPE "public"."stream_provider" AS ENUM('livekit', 'youtube');--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "stream_provider" "stream_provider" DEFAULT 'livekit' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "youtube_watch_url" text;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD COLUMN "youtube_embed_url" text;