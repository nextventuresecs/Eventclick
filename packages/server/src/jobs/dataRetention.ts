import { inArray, lt } from "drizzle-orm";
import { authDb, withJobStatementTimeout } from "../db";
import { attendanceEntries, activityPhotos, roomRecordings, activitySubmissions } from "../db/schema";
import {
  DATA_RETENTION_BATCH_SIZE,
  DATA_RETENTION_POLL_MS,
} from "../config/constants";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * GDPR data retention purge.
 *
 * The routine has existed since the compliance work and **had no caller** —
 * nothing scheduled it, so nothing was ever purged, while
 * `docs/GDPR_COMPLIANCE_REPORT.md` describes retention as an active control.
 * That gap is a compliance problem as much as a technical one.
 */

/** The four tables this purges, oldest-first, with the column that ages them. */
const RETAINED_TABLES = [
  { name: "attendance_entries", table: attendanceEntries, ageColumn: attendanceEntries.submittedAt },
  { name: "activity_photos", table: activityPhotos, ageColumn: activityPhotos.createdAt },
  { name: "activity_submissions", table: activitySubmissions, ageColumn: activitySubmissions.createdAt },
  { name: "room_recordings", table: roomRecordings, ageColumn: roomRecordings.createdAt },
] as const;

export interface RetentionTableResult {
  table: string;
  examined: number;
  deleted: number;
}

export interface RetentionRunResult {
  dryRun: boolean;
  cutoff: string;
  retentionDays: number;
  durationMs: number;
  tables: RetentionTableResult[];
  totalDeleted: number;
}

/**
 * Deletes one table's expired rows in bounded batches.
 *
 * **Batched on purpose.** The previous shape wrapped all four deletes in a
 * single transaction, which on the first real run — against every row older
 * than a year that has ever accumulated — would hold locks and a snapshot for
 * the whole purge, blocking writers and preventing autovacuum exactly when the
 * table needs it most. Each batch here is its own short transaction, so the
 * work is interruptible and other queries get a look in between batches.
 *
 * Runs through `authDb` (BYPASSRLS): a cross-tenant purge has no single tenant
 * to scope to, the same reasoning as the poll jobs.
 */
const purgeTable = async (
  entry: (typeof RETAINED_TABLES)[number],
  cutoff: Date,
  dryRun: boolean,
): Promise<RetentionTableResult> => {
  let examined = 0;
  let deleted = 0;

  for (;;) {
    const batch = await authDb
      .select({ id: entry.table.id })
      .from(entry.table)
      .where(lt(entry.ageColumn, cutoff))
      .limit(DATA_RETENTION_BATCH_SIZE);

    if (batch.length === 0) break;
    examined += batch.length;

    if (dryRun) {
      // Count what a real run would remove, then stop: without deleting, the
      // same rows would be selected forever.
      logger.info(
        { table: entry.name, wouldDelete: batch.length, dryRun: true, event: "retention.dry_run" },
        `Dry run: ${entry.name} has at least ${batch.length} expired rows`,
      );
      break;
    }

    const ids = batch.map((r) => r.id);
    await withJobStatementTimeout(authDb, (tx) =>
      tx.delete(entry.table).where(inArray(entry.table.id, ids)),
    );
    deleted += ids.length;

    // A short batch means the table is drained.
    if (batch.length < DATA_RETENTION_BATCH_SIZE) break;
  }

  return { table: entry.name, examined, deleted };
};

/**
 * One purge pass over every retained table.
 *
 * `dryRun` defaults to `DATA_RETENTION_DRY_RUN`, which ships **enabled** so a
 * first deployment reports its scope rather than deleting on the strength of a
 * cutoff nobody has checked against real data. Turning it off is a deliberate
 * operator action.
 */
export const purgeExpiredData = async (
  dryRun = env.DATA_RETENTION_DRY_RUN,
): Promise<RetentionRunResult> => {
  const startedAt = Date.now();
  const retentionDays = env.DATA_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const tables: RetentionTableResult[] = [];
  for (const entry of RETAINED_TABLES) {
    // Per table, so one failing table does not abandon the others — and the
    // schedule keeps running either way.
    try {
      tables.push(await purgeTable(entry, cutoff, dryRun));
    } catch (err) {
      logger.error(
        { err, table: entry.name, event: "retention.table_failed" },
        `Data retention purge failed for ${entry.name}`,
      );
      tables.push({ table: entry.name, examined: 0, deleted: 0 });
    }
  }

  const result: RetentionRunResult = {
    dryRun,
    cutoff: cutoff.toISOString(),
    retentionDays,
    durationMs: Date.now() - startedAt,
    tables,
    totalDeleted: tables.reduce((sum, t) => sum + t.deleted, 0),
  };

  logger.info({ ...result, event: "retention.run_complete" }, "Data retention purge finished");
  return result;
};

export const startDataRetentionJob = (): void => {
  const run = () => {
    // Never throws into the timer: a failed run must be logged and leave the
    // schedule intact, or one bad night silently ends retention entirely.
    purgeExpiredData().catch((err) => {
      logger.error({ err, event: "retention.run_failed" }, "Data retention purge run failed");
    });
  };

  logger.info(
    {
      retentionDays: env.DATA_RETENTION_DAYS,
      dryRun: env.DATA_RETENTION_DRY_RUN,
      intervalMs: DATA_RETENTION_POLL_MS,
      event: "retention.scheduled",
    },
    env.DATA_RETENTION_DRY_RUN
      ? "Data retention scheduled in DRY RUN mode — nothing will be deleted"
      : "Data retention scheduled",
  );

  run();
  setInterval(run, DATA_RETENTION_POLL_MS);
};
