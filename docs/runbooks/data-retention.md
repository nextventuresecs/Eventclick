# Runbook: enabling the data retention purge

**Job:** `packages/server/src/jobs/dataRetention.ts`, scheduled daily from `startDataRetentionJob`
**Ships in:** dry-run mode — **it will not delete anything until you turn that off**
**Retention period:** `DATA_RETENTION_DAYS`, default 365, matching `docs/GDPR_COMPLIANCE_REPORT.md`

---

## Why it ships disabled

The purge routine existed but had no caller, so **nothing has ever been
deleted**. Its first real run therefore faces every row older than the
retention period that has accumulated since the product launched — a backlog
nobody has measured.

A cutoff that is correct on paper and wrong in practice deletes real customer
evidence, and there is no undo. So the job reports first and deletes only when
an operator says so.

## Step 1 — read the dry run

Deploy with the defaults. Within a minute of startup, and daily after that, the
logs carry:

```
event=retention.scheduled  retentionDays=365 dryRun=true
event=retention.dry_run    table=attendance_entries wouldDelete=1000
event=retention.run_complete dryRun=true totalDeleted=0 durationMs=…
```

`wouldDelete` is capped at the batch size (1,000) — it means "at least this
many", not the total. To get exact counts, query directly:

```sql
SELECT count(*) FROM attendance_entries  WHERE submitted_at < now() - interval '365 days';
SELECT count(*) FROM activity_photos     WHERE created_at   < now() - interval '365 days';
SELECT count(*) FROM activity_submissions WHERE created_at  < now() - interval '365 days';
SELECT count(*) FROM room_recordings     WHERE created_at   < now() - interval '365 days';
```

## Step 2 — decide whether the scope is right

Before turning it on, confirm:

- **The counts are plausible.** A number far larger than expected usually means
  the cutoff is wrong, not that there is that much old data.
- **365 days is the period you actually want.** It is what the compliance
  report publishes; if the real policy differs, change
  `DATA_RETENTION_DAYS` *and* the report together.
- **Nothing downstream depends on those rows.** Reports over events older than
  the retention period will lose their underlying attendance data. That is the
  intended effect of retention, and worth confirming rather than discovering.
- **You have a backup you could restore from.** `scripts/backup-db.sh`.
  Deletion is not reversible — and as of the storage sweep it now removes the
  uploaded files too, which no database backup restores.
- **Nobody in scope is under dispute.** An organisation with
  `organizations.legal_hold = true` is skipped entirely by this job — none of
  its rows are deleted regardless of age. Set the flag *before* enabling the
  purge for anyone under litigation or investigation; there is no undo
  afterwards. `SELECT id, name FROM organizations WHERE legal_hold;` shows who
  is currently held, and `docs/runbooks/audit-retention.md` covers the flag in
  full.

## Step 3 — enable it

Set `DATA_RETENTION_DRY_RUN=false` and restart. The first real run will delete
the backlog in batches of 1,000, each in its own short transaction.

Watch for:

```
event=retention.run_complete dryRun=false totalDeleted=… heldOrganizations=… durationMs=…
```

Per table you will also see `objectsDeleted` and `objectsFailed`. A non-zero
`objectsFailed` is not an error — those rows were kept back deliberately and the
next run retries them. Persistent failures mean the bucket credentials or policy
need looking at:

```
event=storage.delete_partial  failed=… requested=…
event=retention.batch_blocked table=activity_photos blocked=…
```

## Step 4 — confirm afterwards

Re-run the counts from step 1: they should be at or near zero. Subsequent daily
runs should report small numbers — a day's worth of newly-expired rows.

## Known limitations

- **Orphaned objects from *other* delete paths are not swept.** This job now
  deletes an object before the row that names it, so age-based expiry no longer
  leaks files. Every other path still does: `activity_photos` and
  `attendance_entries` cascade from `event_rooms`, so **deleting a room removes
  the rows and leaves the objects**, and has since launch. `activity_photos`
  also soft-deletes (`deleted_at`), which strands the object while the row
  survives. Closing that needs the delete paths themselves to remove objects,
  plus a one-off sweep for what has already accumulated — see below.
- **No bucket-diff sweep.** Reconciling the bucket against the database would
  catch everything already orphaned, but it has to tell an orphan apart from an
  object whose row has not been written yet: `createPresignedPut` means the
  upload completes before the insert, so a naive diff deletes live uploads. That
  needs an age threshold and its own runbook, and is deliberately not attempted
  here.
- **Audit logs are not purged by this job.** It does not touch `audit_logs` at
  all, and deliberately so — deleting the audit trail is a different decision
  from deleting expired event data. That is now handled by a separate job with
  its own schedule and its own dry-run switch: see
  `docs/runbooks/audit-retention.md`.
- **No leader election.** Background jobs run in every process. A second
  container would run this purge concurrently with the first; the batches are
  idempotent (each deletes rows by id), so the outcome is correct but the work
  is duplicated. Leader election across all the jobs is a separate ticket.
- **It runs on a `setInterval`, not a cron.** The daily cadence restarts
  whenever the process does, so a container that restarts frequently runs the
  purge more often than daily. Harmless — after the first pass there is almost
  nothing to delete — but it is not a guarantee of "once per day".

## If it fails

A failing table is logged as `event=retention.table_failed` and the run
continues with the others — including the deliberate failure a blocked DELETE
now raises. A batch that deletes fewer rows than the SELECT just returned means
the statement was blocked (a revoked privilege, a policy that excludes DELETE)
rather than that the table is drained; the job aborts that table with
`deleted N of M rows in a batch` instead of re-selecting the same rows forever
while reporting deletions it never made. That one means "check the role's
privileges", not "retry".

A failing run is logged as
`event=retention.run_failed` and the schedule stays intact. Neither stops
future runs, so a transient database problem resolves itself on the next pass.
One failure is deliberately **not** partial: the legal-hold lookup runs once
before any table is touched, outside the per-table error handling, so a database
problem there aborts the entire run rather than letting it proceed table by
table. That is the intended direction — the job must not delete anything while
it cannot determine which organisations are exempt. The cost is that a blip in
that one query means no progress at all for that pass, rather than three tables
out of four.

The signal worth alerting on is `retention.run_complete` *not* appearing for
several days.
