import { pgTable, uuid, text, integer, timestamp, index , pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { eventRooms } from "./eventRooms";
import { organizations } from "./organizations";
import { users } from "./users";

export const pdfJobs = pgTable("pdf_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: text("job_id").notNull().unique(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => eventRooms.id, { onDelete: "cascade" }),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  s3Key: text("s3_key"),
  s3Url: text("s3_url"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("pdf_jobs_job_id_idx").on(t.jobId),
  index("pdf_jobs_room_id_idx").on(t.roomId),
  index("pdf_jobs_user_id_idx").on(t.userId),
  index("pdf_jobs_status_idx").on(t.status),
  pgPolicy("pdf_jobs_tenant_isolation", {
    as: "permissive",
    for: "all",
    to: "app_user",
    using: sql`${t.orgId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    withCheck: sql`${t.orgId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
  }),
]);

export type PdfJobRow = typeof pdfJobs.$inferSelect;
export type NewPdfJob = typeof pdfJobs.$inferInsert;
