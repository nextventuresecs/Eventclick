import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import { authDb, withJobStatementTimeout } from "../db";
import { auditLogs, organizations } from "../db/schema";
import {
  AUDIT_RETENTION_BATCH_SIZE,
  AUDIT_RETENTION_POLL_MS,
  AUDIT_RETENTION_START_DELAY_MS,
} from "../config/constants";
import { env } from "../config/env";
import {
  archiveAuditBatch,
  isAuditArchiveConfigured,
  type PurgeableAuditRow,
} from "../services/audit-archive.service";
import { logger } from "../utils/logger";

/**
 * Audit log retention purge.
 *
 * `docs/GDPR_COMPLIANCE_REPORT.md` described the audit trail as retained for a
 * fixed period, but nothing ever enforced it: `jobs/dataRetention.ts`
 * deliberately does not touch `audit_logs`, and no other caller deletes from
 * it. The published figure was a statement of intent — the table grew without
 * bound and always had. This job makes the period a control.
 *
 * **Deliberately a separate job from the data purge.** Deleting the record of
 * what happened is a different decision, with a different owner and a
 * different blast radius, from deleting the event data it describes. They get
 * separate schedules, separate env vars and separate dry-run switches so that
 * enabling one never implies the other.
 *
 * **On the period.** `AUDIT_RETENTION_DAYS` defaults to 365, the standard
 * security and audit log retention: PCI DSS v4.0 req. 10.5.1 asks for at least
 * 12 months, CIS Controls v8 control 8.10 recommends the same, and SOC 2 /
 * ISO 27001 programmes conventionally evidence a year. GDPR sets no audit
 * retention period at all, and art. 5(1)(e) storage limitation pushes towards
 * shorter rather than longer.
 *
 * This replaced an uncited "7 years" the compliance report asserted and nothing
 * enforced. 7 years is a tax and financial records convention, applicable only
 * under an obligation nobody had established. `env.ts` also refuses to start if
 * this drops below `DATA_RETENTION_DAYS`: an audit trail that expires before the
 * data it describes leaves records nobody can account for.
 *
 * Runs through `authDb`: `audit_logs` is FORCE ROW LEVEL SECURITY with SELECT
 * and INSERT policies only, and migration 0003 explicitly revokes DELETE from
 * `app_user` to keep the table append-only for application code.
 * `auth_svc_role` is BYPASSRLS and was granted DELETE in 0001, so this purge is
 * the one path that can remove a row — which is the intended shape:
 * unreachable from a request, reachable from one audited scheduled job.
 */

export interface AuditRetentionRunResult {
  dryRun: boolean;
  cutoff: string;
  retentionDays: number;
  durationMs: number;
  examined: number;
  deleted: number;
  heldOrganizations: number;
  receiptsWritten: number;
  /** Immutable archive objects written before deleting. */
  archived: number;
  /** Set when the run deliberately declined to delete anything. */
  refusedReason?: string;
}

/**
 * Organisations exempt from the purge because they are under litigation or
 * regulatory hold.
 *
 * Loaded once per run rather than per batch: a hold set midway through a pass
 * takes effect on the next one. That is the right trade — re-reading per batch
 * would let one run see two different worlds, which is harder to reason about
 * afterwards than a hold that lands a day late.
 */
export const loadHeldOrganizationIds = async (): Promise<string[]> => {
  const rows = await authDb
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.legalHold, true));
  return rows.map((r) => r.id);
};

/**
 * Writes the purge's own audit entry, one per organisation whose rows were
 * removed.
 *
 * An audit trail that can be trimmed without leaving a trace is not an audit
 * trail. The receipt records the cutoff and the count, and — written with a
 * `created_at` of now — outlives the rows it accounts for by a full retention
 * period.
 *
 * Inserted through `authDb` rather than `recordAudit`: that service writes via
 * the `db` proxy, which inside a `setInterval` job resolves to the bare pool
 * with no `app.current_tenant`, and the `audit_logs_insert_only` policy's WITH
 * CHECK would reject every row. See CLAUDE.md on background tenant context.
 *
 * Only written when rows were actually deleted. A daily no-op run recording
 * "purged 0" would add a row per organisation per day to the very table this
 * job exists to bound.
 */
const writeReceipts = async (
  perOrg: Map<string, number>,
  cutoff: Date,
  retentionDays: number,
): Promise<number> => {
  const entries = [...perOrg.entries()].filter(([, count]) => count > 0);
  if (entries.length === 0) return 0;

  await authDb.insert(auditLogs).values(
    entries.map(([organizationId, deleted]) => ({
      organizationId,
      actorUserId: null,
      // No human actor: the schedule did this, and saying so is more honest
      // than attributing it to whoever last edited the configuration.
      actorEmail: "system:audit-retention",
      action: "audit.purged",
      resourceType: "audit_log",
      resourceId: null,
      oldValues: null,
      newValues: JSON.stringify({ deleted, cutoff: cutoff.toISOString(), retentionDays }),
      ipAddress: null,
      userAgent: null,
    })),
  );

  return entries.length;
};

/**
 * One purge pass over `audit_logs`.
 *
 * Batched in short transactions for the same reason as the data purge: a first
 * real run faces everything older than the cutoff that has ever accumulated,
 * and holding one snapshot across all of it would block writers and stall
 * autovacuum exactly when the table needs it.
 */
export const purgeExpiredAuditLogs = async (
  dryRun = env.AUDIT_RETENTION_DRY_RUN,
): Promise<AuditRetentionRunResult> => {
  const startedAt = Date.now();
  const retentionDays = env.AUDIT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Refuse to destroy the backlog by omission. A missing archive bucket is far
  // more likely to be an unfinished setup than a decision, and the first real
  // run is the one that deletes everything accumulated since launch — so it
  // takes a deliberate AUDIT_ARCHIVE_DISABLED=true to proceed without a copy.
  // Dry runs are exempt: they delete nothing and reporting the backlog is
  // exactly how an operator decides what to do about it.
  if (!dryRun && !isAuditArchiveConfigured() && !env.AUDIT_ARCHIVE_DISABLED) {
    const refusedReason =
      "AUDIT_ARCHIVE_BUCKET is not set. Expired audit rows would be destroyed with no " +
      "archived copy. Configure the WORM bucket, or set AUDIT_ARCHIVE_DISABLED=true to " +
      "accept the loss deliberately. See docs/runbooks/audit-retention.md.";
    logger.error({ event: "audit_retention.refused", refusedReason }, refusedReason);
    return {
      dryRun,
      cutoff: cutoff.toISOString(),
      retentionDays,
      durationMs: Date.now() - startedAt,
      examined: 0,
      deleted: 0,
      heldOrganizations: 0,
      receiptsWritten: 0,
      archived: 0,
      refusedReason,
    };
  }

  const heldOrgIds = await loadHeldOrganizationIds();
  // `notInArray(col, [])` compiles to a predicate Postgres rejects, so the
  // clause is omitted entirely when nothing is on hold — the normal case.
  const expired = heldOrgIds.length
    ? and(lt(auditLogs.createdAt, cutoff), notInArray(auditLogs.organizationId, heldOrgIds))
    : lt(auditLogs.createdAt, cutoff);

  let examined = 0;
  let deleted = 0;
  let receiptsWritten = 0;
  let archived = 0;
  let batchIndex = 0;
  const perOrg = new Map<string, number>();
  const archiving = !dryRun && isAuditArchiveConfigured();
  // Groups every object one pass writes, so a run can be located whole.
  const runStamp = new Date(startedAt).toISOString().replace(/[:.]/g, "-");

  for (;;) {
    // The whole row, not just the id: a batch is archived before it is
    // deleted, and the archive needs the payload.
    const batch: PurgeableAuditRow[] = await authDb
      .select({
        id: auditLogs.id,
        organizationId: auditLogs.organizationId,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(expired)
      .limit(AUDIT_RETENTION_BATCH_SIZE);

    if (batch.length === 0) break;
    examined += batch.length;

    if (dryRun) {
      // Count what a real run would remove, then stop: without deleting, the
      // same rows would be selected forever.
      logger.info(
        {
          wouldDelete: batch.length,
          organizations: new Set(batch.map((r) => r.organizationId)).size,
          heldOrganizations: heldOrgIds.length,
          dryRun: true,
          event: "audit_retention.dry_run",
        },
        `Dry run: audit_logs has at least ${batch.length} rows older than ${retentionDays} days`,
      );
      break;
    }

    // Archive first, delete second, and never the other way round. A failure
    // here throws out of the run with the rows still in place — the whole point
    // of tier-then-delete is that nothing is destroyed before its copy exists.
    if (archiving) {
      archived += (await archiveAuditBatch(batch, runStamp, batchIndex)).length;
    }
    batchIndex++;

    const ids = batch.map((r) => r.id);
    const result = await withJobStatementTimeout(authDb, (tx) =>
      tx.delete(auditLogs).where(inArray(auditLogs.id, ids)),
    );

    // A DELETE that matches nothing is not a drained table — the SELECT above
    // just found these rows. It means the statement was blocked (a revoked
    // privilege, a policy that excludes DELETE), and the loop would otherwise
    // re-select the same batch forever while the counter climbed. Stop loudly.
    const affected = (result as { rowCount?: number | null } | undefined)?.rowCount ?? 0;
    if (affected !== ids.length) {
      throw new Error(
        `audit_logs purge deleted ${affected} of ${ids.length} rows in a batch — refusing to ` +
          `continue; check the DELETE privilege for the audit retention role`,
      );
    }

    deleted += ids.length;
    for (const row of batch) {
      perOrg.set(row.organizationId, (perOrg.get(row.organizationId) ?? 0) + 1);
    }

    // A short batch means the table is drained.
    if (batch.length < AUDIT_RETENTION_BATCH_SIZE) break;
  }

  if (!dryRun && deleted > 0) {
    // A failed receipt must not undo the purge — the rows are already gone and
    // the run cannot be replayed. Log it as the compliance gap it is and let
    // the run report its real numbers.
    try {
      receiptsWritten = await writeReceipts(perOrg, cutoff, retentionDays);
    } catch (err) {
      logger.error(
        { err, organizations: perOrg.size, deleted, event: "audit_retention.receipt_failed" },
        "Audit purge completed but its own audit receipt could not be written",
      );
    }
  }

  const result: AuditRetentionRunResult = {
    dryRun,
    cutoff: cutoff.toISOString(),
    retentionDays,
    durationMs: Date.now() - startedAt,
    examined,
    deleted,
    heldOrganizations: heldOrgIds.length,
    receiptsWritten,
    archived,
  };

  logger.info({ ...result, event: "audit_retention.run_complete" }, "Audit retention purge finished");
  return result;
};

export const startAuditRetentionJob = (): void => {
  const run = () => {
    // Never throws into the timer: a failed run must be logged and leave the
    // schedule intact, or one bad night silently ends audit retention.
    purgeExpiredAuditLogs().catch((err) => {
      logger.error({ err, event: "audit_retention.run_failed" }, "Audit retention purge run failed");
    });
  };

  logger.info(
    {
      retentionDays: env.AUDIT_RETENTION_DAYS,
      dryRun: env.AUDIT_RETENTION_DRY_RUN,
      intervalMs: AUDIT_RETENTION_POLL_MS,
      startDelayMs: AUDIT_RETENTION_START_DELAY_MS,
      event: "audit_retention.scheduled",
    },
    env.AUDIT_RETENTION_DRY_RUN
      ? "Audit retention scheduled in DRY RUN mode — nothing will be deleted"
      : "Audit retention scheduled",
  );

let auditRetentionTimer: NodeJS.Timeout | null = null;
let auditRetentionDelayTimer: NodeJS.Timeout | null = null;

  // Offset from the data purge rather than racing it at boot: both sweep the
  // same pool, and a restart loop would otherwise start every scan at once.
  auditRetentionDelayTimer = setTimeout(() => {
    run();
    auditRetentionTimer = setInterval(run, AUDIT_RETENTION_POLL_MS);
    auditRetentionTimer.unref();
  }, AUDIT_RETENTION_START_DELAY_MS);
  auditRetentionDelayTimer.unref();
};

export const stopAuditRetentionJob = (): void => {
  if (auditRetentionDelayTimer) {
    clearTimeout(auditRetentionDelayTimer);
    auditRetentionDelayTimer = null;
  }
  if (auditRetentionTimer) {
    clearInterval(auditRetentionTimer);
    auditRetentionTimer = null;
  }
};
