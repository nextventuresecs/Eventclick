import { and, inArray, lt, notInArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { authDb, withJobStatementTimeout } from "../db";
import { attendanceEntries, activityPhotos, roomRecordings, activitySubmissions } from "../db/schema";
import { loadHeldOrganizationIds } from "./auditRetention";
import { deleteObjects } from "../services/storage.service";
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

/**
 * The four tables this purges, oldest-first, with the column that ages them and
 * — where the row points at object storage — the column holding its key.
 *
 * `keyColumn` is what closes the orphan gap: deleting the row without deleting
 * the object leaves a file in the bucket that nothing references and nobody can
 * find again, because the key lived only in the row. `activity_submissions` has
 * no key of its own; its files hang off `activity_photos`.
 */
const RETAINED_TABLES = [
  {
    name: "attendance_entries",
    table: attendanceEntries,
    ageColumn: attendanceEntries.submittedAt,
    keyColumn: attendanceEntries.photoKey,
  },
  {
    name: "activity_photos",
    table: activityPhotos,
    ageColumn: activityPhotos.createdAt,
    keyColumn: activityPhotos.photoKey,
  },
  {
    name: "activity_submissions",
    table: activitySubmissions,
    ageColumn: activitySubmissions.createdAt,
    keyColumn: null,
  },
  {
    name: "room_recordings",
    table: roomRecordings,
    ageColumn: roomRecordings.createdAt,
    keyColumn: roomRecordings.s3Key,
  },
] as const;

/** A row selected for purging, with its storage key when the table has one. */
interface PurgeableRow {
  id: string;
  storageKey?: string | null;
}

export interface RetentionTableResult {
  table: string;
  examined: number;
  deleted: number;
  /** Objects removed from the uploads bucket alongside the rows. */
  objectsDeleted: number;
  /** Rows kept back because their object could not be deleted. */
  objectsFailed: number;
}

export interface RetentionRunResult {
  dryRun: boolean;
  cutoff: string;
  retentionDays: number;
  durationMs: number;
  tables: RetentionTableResult[];
  /** Organisations skipped entirely because they are under litigation hold. */
  heldOrganizations: number;
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
  heldOrgIds: string[],
): Promise<RetentionTableResult> => {
  // `notInArray(col, [])` compiles to a predicate Postgres rejects, so the
  // clause is omitted entirely when nothing is on hold — the normal case.
  const expired = heldOrgIds.length
    ? and(lt(entry.ageColumn, cutoff), notInArray(entry.table.organizationId, heldOrgIds))
    : lt(entry.ageColumn, cutoff);

  let examined = 0;
  let deleted = 0;
  let objectsDeleted = 0;
  let objectsFailed = 0;

  // Only select the key column for tables that have one — the shape is built
  // here rather than inline so the two cases share one query.
  const selection: Record<string, PgColumn> = { id: entry.table.id };
  if (entry.keyColumn) selection.storageKey = entry.keyColumn;

  for (;;) {
    const batch = (await authDb
      .select(selection)
      .from(entry.table)
      .where(expired)
      .limit(DATA_RETENTION_BATCH_SIZE)) as unknown as PurgeableRow[];

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

    // Objects first, rows second, and never the reverse: the key lives only in
    // the row, so a row deleted before its object leaves a file nothing
    // references and nothing can name again.
    //
    // A failed object is NOT fatal, which is the opposite of the audit
    // archive's stance — and deliberately so. Re-uploading an archive object
    // is harmless, but a row is gone for good once deleted, so the safe
    // direction here is to keep the row and retry next pass. Nullable keys
    // (a pending recording, an attendance entry with no photo) are filtered
    // out; those rows are always deletable.
    let ids = batch.map((r) => r.id);
    if (entry.keyColumn) {
      const withKeys = batch.filter(
        (r): r is PurgeableRow & { storageKey: string } => !!r.storageKey,
      );
      const failedKeys = new Set(await deleteObjects(withKeys.map((r) => r.storageKey)));

      objectsDeleted += withKeys.length - failedKeys.size;
      if (failedKeys.size > 0) {
        const blockedIds = new Set(
          withKeys.filter((r) => failedKeys.has(r.storageKey)).map((r) => r.id),
        );
        objectsFailed += blockedIds.size;
        ids = ids.filter((id) => !blockedIds.has(id));
      }
    }

    if (ids.length === 0) {
      // Every row in this batch is blocked on its object. Stop rather than
      // re-selecting the same rows forever; the next run retries them.
      logger.warn(
        { table: entry.name, blocked: batch.length, event: "retention.batch_blocked" },
        `${entry.name}: every row in the batch is held back by a failed object delete`,
      );
      break;
    }

    const result = await withJobStatementTimeout(authDb, (tx) =>
      tx.delete(entry.table).where(inArray(entry.table.id, ids)),
    );

    // A DELETE that matches nothing is not a drained table — the SELECT above
    // just found these rows. It means the statement was blocked (a revoked
    // privilege, a policy that excludes DELETE), and without this the loop
    // re-selects the same batch forever while `deleted` climbs past what was
    // ever removed. Stop loudly; the per-table catch keeps the other tables
    // running and the schedule intact.
    const affected = (result as { rowCount?: number | null } | undefined)?.rowCount ?? 0;
    if (affected !== ids.length) {
      throw new Error(
        `${entry.name} purge deleted ${affected} of ${ids.length} rows in a batch — refusing ` +
          `to continue; check the DELETE privilege for the retention role`,
      );
    }

    deleted += ids.length;

    // A short batch means the table is drained.
    if (batch.length < DATA_RETENTION_BATCH_SIZE) break;
  }

  return { table: entry.name, examined, deleted, objectsDeleted, objectsFailed };
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

  // Loaded once for the whole pass, not per table, so every table in one run
  // agrees on which organisations are exempt.
  const heldOrgIds = await loadHeldOrganizationIds();

  const tables: RetentionTableResult[] = [];
  for (const entry of RETAINED_TABLES) {
    // Per table, so one failing table does not abandon the others — and the
    // schedule keeps running either way.
    try {
      tables.push(await purgeTable(entry, cutoff, dryRun, heldOrgIds));
    } catch (err) {
      logger.error(
        { err, table: entry.name, event: "retention.table_failed" },
        `Data retention purge failed for ${entry.name}`,
      );
      tables.push({ table: entry.name, examined: 0, deleted: 0, objectsDeleted: 0, objectsFailed: 0 });
    }
  }

  const result: RetentionRunResult = {
    dryRun,
    cutoff: cutoff.toISOString(),
    retentionDays,
    durationMs: Date.now() - startedAt,
    tables,
    heldOrganizations: heldOrgIds.length,
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
