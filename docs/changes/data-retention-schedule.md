# The retention job has never run, and the compliance report says it has

**Status:** shipped
**Touches:** `packages/server/src/jobs/dataRetention.ts`, `packages/server/src/index.ts`, `packages/server/src/config/env.ts`, `packages/server/src/config/constants.ts`, `docs/runbooks/data-retention.md`, `.env.example`, `docker-compose.prod.yml`
**Ships with:** `feat/data-retention-schedule` — closes #93

---

## 1. What the code does today

`purgeExpiredData` exists, is exported, and **has no callers**:

```ts
export async function purgeExpiredData() {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  await withJobStatementTimeout(db, async (tx) => {
    await tx.delete(attendanceEntries).where(lt(attendanceEntries.submittedAt, cutoff));
    await tx.delete(activityPhotos).where(lt(activityPhotos.createdAt, cutoff));
    await tx.delete(activitySubmissions).where(lt(activitySubmissions.createdAt, cutoff));
    await tx.delete(roomRecordings).where(lt(roomRecordings.createdAt, cutoff));
  });
}
```

`index.ts` starts three background jobs; this is not one of them. So **nothing
has ever been purged** — while `docs/GDPR_COMPLIANCE_REPORT.md` lists it as a
delivered control:

> | Data retention job | `packages/server/src/jobs/dataRetention.ts` | 365-day purge of attendance, photos, submissions, recordings |

and marks the corresponding remediation item "✅ Done". That is a compliance
risk distinct from the technical one: the document asserts a control that does
not operate.

Three further problems in the routine as written:

**The cutoff is hard-coded**, so the published figure and the enforced one are
two independent numbers that happen to agree today.

**All four deletes share one transaction.** On the first real run — against
every expired row that has ever accumulated — that holds locks and a snapshot
for the entire purge, blocking writers and preventing autovacuum from
reclaiming the very rows being deleted.

**It uses `db`, the tenant-scoped proxy**, from a context with no tenant. A
cross-tenant purge has no single organisation to scope to, so RLS would match
nothing.

## 2. What I am changing, and why

**Scheduled daily**, alongside the existing jobs. The cutoff advances a day at
a time, so anything more frequent re-scans for nothing.

**It ships in dry-run mode, and that is the substantive decision.**
`DATA_RETENTION_DRY_RUN` defaults to `true`: the job reports what it *would*
delete and deletes nothing until an operator turns it off.

The acceptance criteria ask for a dry-run mode that "has been used to verify the
first real run's scope before it deletes anything". The mode can be built here;
**the using of it cannot** — it needs production data. Defaulting to enabled is
what makes that criterion structurally true rather than a promise: the first
deployment physically cannot delete, and turning it off is a deliberate act
performed after reading the counts. `docs/runbooks/data-retention.md` is that
procedure.

**Batched deletes, each in its own short transaction.** Rows are selected by id
in batches of 1,000 and deleted by `id IN (…)`. The work becomes interruptible,
other queries get a look in between batches, and autovacuum can keep up.

**Retention comes from configuration.** `DATA_RETENTION_DAYS` defaults to 365 —
the published figure — so the report and the enforced value can be reconciled
without reading code.

**`authDb`, not `db`.** The `BYPASSRLS` role, matching the poll jobs: a
cross-tenant purge has no tenant.

**Failures are per-table and non-fatal.** One failing table logs and the run
continues with the others; a failing run logs and leaves the schedule intact.
One bad night must not silently end retention.

**Each run logs what it examined, what it deleted, per table, and how long it
took** — the observability the ticket asks for, and the only way to notice the
job has stopped running.

## 3. What this affects

**The first non-dry run deletes a backlog, irreversibly.** Everything else here
is reversible; this is not. Hence the dry-run default, the runbook's insistence
on counting first, and its reminder that `scripts/backup-db.sh` exists.

**Reports over old events lose their underlying attendance data.** That is what
retention *means*, and it is worth stating plainly because it will look like
data loss to whoever hits it first.

**Object storage is not purged.** The job deletes `activity_photos` and
`room_recordings` rows; the S3/R2 objects they reference stay. The database
stops pointing at them, so they become orphaned rather than deleted — a real
gap, named in the runbook, needing a storage-side sweep to close.

**Audit logs are not purged either.** The compliance report describes 7-year
audit retention; this job does not touch `audit_logs`, deliberately — deleting
an audit trail is a different decision from expiring event data. As of this
change the 7-year figure remains a statement of intent, not an enforced control,
and the report should say so.

**No leader election.** Background jobs run in every process, so a second
container duplicates this work. The batches are idempotent — each deletes rows
by id — so the outcome is correct and the effort is wasted. That is the
ticket's own note, and it covers all three existing jobs.

**How we would know it broke.** `event=retention.run_complete` should appear
daily. Its absence for several days is the alertable signal. After the first
real run, the counting queries in the runbook should return at or near zero,
and daily runs should report small numbers.

## 4. What to learn from this

**Exported and unused is the most expensive kind of dead code**, because it
reads as a working feature to everyone downstream — including the person
writing the compliance report. The function existed, was correct in outline,
was cited in a document as evidence, and did nothing. Any control that a
document claims should have a check that it *ran*, not just that it exists:
"when did this last execute?" is the question a scheduled job must be able to
answer.

**A destructive job's first run is a different event from its steady state.**
Steady state is a handful of rows a day; the first run is everything that ever
accumulated, against a cutoff nobody has validated on real data. Designing only
for the steady state produces a job that is safe forever except once. Dry-run
defaults, batching and a runbook are all responses to that single asymmetry.

**Batch size is a concurrency decision, not a performance tweak.** A single
large `DELETE` is faster in isolation and worse in production, because it holds
locks and a snapshot for its whole duration and blocks the autovacuum that
would reclaim the space. Splitting the work into short transactions trades
total throughput for the ability of everything else to keep running — usually
the right trade for maintenance work, and always worth making explicitly.
