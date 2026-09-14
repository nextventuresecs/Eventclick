import type { OpsBacklog } from "@application/shared";
import type { ReadPool } from "../lookup";

// One round trip. Status literals: pdf_jobs.status is lowercase text written by
// queues/worker.ts; email and notification deliveries share the
// notification_delivery_status enum (PENDING/SENT/DELIVERED/FAILED).
const BACKLOG_SQL = `
  SELECT
    (SELECT count(*) FROM pdf_jobs
      WHERE status IN ('pending', 'processing') AND updated_at < now() - interval '15 minutes')::int AS pdf_stuck,
    (SELECT count(*) FROM pdf_jobs
      WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::int AS pdf_failed_24h,
    (SELECT count(*) FROM email_deliveries
      WHERE status = 'FAILED' AND created_at > now() - interval '1 hour')::int AS email_failed_1h,
    (SELECT count(*) FROM notification_deliveries
      WHERE status = 'FAILED' AND created_at > now() - interval '1 hour')::int AS notification_failed_1h`;

export async function probeBacklog(pool: ReadPool): Promise<OpsBacklog> {
  const { rows } = await pool.query(BACKLOG_SQL, []);
  const row = rows[0] as {
    pdf_stuck: number;
    pdf_failed_24h: number;
    email_failed_1h: number;
    notification_failed_1h: number;
  };
  return {
    pdfStuck: row.pdf_stuck,
    pdfFailed24h: row.pdf_failed_24h,
    emailFailed1h: row.email_failed_1h,
    notificationFailed1h: row.notification_failed_1h,
  };
}
