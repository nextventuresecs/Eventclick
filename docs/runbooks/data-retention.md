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
  Deletion is not reversible.

## Step 3 — enable it

Set `DATA_RETENTION_DRY_RUN=false` and restart. The first real run will delete
the backlog in batches of 1,000, each in its own short transaction.

Watch for:

```
event=retention.run_complete dryRun=false totalDeleted=… durationMs=…
```

## Step 4 — confirm afterwards

Re-run the counts from step 1: they should be at or near zero. Subsequent daily
runs should report small numbers — a day's worth of newly-expired rows.

## Known limitations

- **Object storage is not purged.** The job deletes `activity_photos` and
  `room_recordings` *rows*; the underlying S3/R2 objects they point at are left
  in place. The database stops referencing them, so they become orphaned rather
  than deleted. Closing that gap needs a separate storage-side sweep.
- **Audit logs are not purged.** The compliance report describes a 7-year
  audit retention; this job does not touch `audit_logs` at all, and deliberately
  so — deleting the audit trail is a different decision from deleting expired
  event data. The 7-year figure is currently a statement of intent, not an
  enforced control.
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
continues with the others; a failing run is logged as
`event=retention.run_failed` and the schedule stays intact. Neither stops
future runs, so a transient database problem resolves itself on the next pass.
The signal worth alerting on is `retention.run_complete` *not* appearing for
several days.
