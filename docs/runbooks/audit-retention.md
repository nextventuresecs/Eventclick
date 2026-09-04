# Runbook: enabling the audit log retention purge

**Job:** `packages/server/src/jobs/auditRetention.ts`, scheduled daily from `startAuditRetentionJob`
**Ships in:** dry-run mode — **it will not delete anything until you turn that off**
**Retention period:** `AUDIT_RETENTION_DAYS`, default 365 (12 months)
**Related:** `docs/runbooks/data-retention.md` — a separate job, separate switch

---

## Why this is a separate job from the data purge

`dataRetention.ts` deliberately never touched `audit_logs`. Deleting the record
of *what happened* is a different decision, with a different owner and a
different blast radius, from deleting the event data it describes: the audit
trail is what you read to reconstruct an incident, including an incident caused
by a retention job.

So the two have separate schedules, separate env vars and separate dry-run
switches. Turning one on never implies the other.

## Where the period comes from

`AUDIT_RETENTION_DAYS` defaults to **365 days**, which is the standard security
and audit log retention period:

| Source | Requirement |
|---|---|
| PCI DSS v4.0, req. 10.5.1 | At least 12 months of audit history, 3 months immediately available |
| CIS Controls v8, control 8.10 | 90 days minimum, 12 months recommended |
| SOC 2 / ISO 27001 programmes | 12 months, conventionally |
| GDPR art. 5(1)(e) | No period set; storage limitation argues for *shorter*, not longer |

**This replaced an uncited "7 years."** The compliance report asserted that
figure and nothing enforced it. 7 years is a tax and financial records
convention — it applies under an obligation of that kind, and no such obligation
had been established for Eventclick. If one is established later, raise
`AUDIT_RETENTION_DAYS` **and** record the citation in the compliance report in
the same change. Do not raise it because a longer period feels safer: under
GDPR, keeping personal data longer than needed is itself the violation.

`env.ts` refuses to start when `AUDIT_RETENTION_DAYS < DATA_RETENTION_DAYS`. An
audit trail that expires before the data it describes leaves records in the
database that nobody can account for — which is the one question an audit trail
exists to answer. Raising the data retention period therefore forces a decision
about this one.

## Step 1 — read the dry run

Deploy with the defaults. Five minutes after startup, and daily after that, the
logs carry:

```
event=audit_retention.scheduled    retentionDays=365 dryRun=true
event=audit_retention.dry_run      wouldDelete=500 organizations=3 heldOrganizations=0
event=audit_retention.run_complete dryRun=true deleted=0 examined=500 durationMs=…
```

`wouldDelete` is capped at the batch size (500) — it means "at least this many",
not the total. For exact counts:

```sql
SELECT count(*) FROM audit_logs WHERE created_at < now() - interval '365 days';

-- Per organisation, which is what a purge receipt will report:
SELECT organization_id, count(*)
FROM audit_logs
WHERE created_at < now() - interval '365 days'
GROUP BY organization_id
ORDER BY count(*) DESC;
```

**Expect a real backlog.** At 365 days, every audit row written more than a
year ago is in scope, and nothing has ever been purged from this table — so the
first real run faces the entire accumulation since launch. This is not a
formality. Measure it before you enable anything.

If the count is far larger than the organisation's activity would explain, the
cutoff is wrong or rows carry a backdated `created_at`. Investigate first; do
not enable the purge to "clean it up".

## Step 2 — decide whether the scope is right

- **The counts are plausible** — see above. Today that means a real backlog, not zero.
- **The period is the one you actually want**, with a citation behind it.
- **Nothing downstream depends on those rows.** The admin audit-log view
  (`GET /api/v1/admin/audit-log`) will stop returning anything older than the
  cutoff. That is the intended effect of retention.
- **You have a backup you could restore from.** `scripts/backup-db.sh`.
  Deletion is not reversible, and the audit trail is the thing you would want
  most if a purge went wrong.

## Step 3 — provision the WORM archive bucket

Expired rows are written to immutable storage **before** they are deleted. The
purge refuses to delete anything until this exists.

```bash
npx wrangler r2 bucket create eventclick-audit-archive
```

**It must not be `S3_BUCKET`.** A lock rule on the recordings bucket would make
activity photos and room recordings undeletable too, breaking the data
retention purge and every erasure request.

Then add a bucket lock rule — Dashboard: R2 → `eventclick-audit-archive` →
Settings → Bucket lock rules → Add rule. Or:

```bash
npx wrangler r2 bucket lock add eventclick-audit-archive
```

Check `npx wrangler r2 bucket lock add --help` for the current flag names. The
rule takes a prefix (`audit/`) and a condition — either
`{"type":"Age","maxAgeSeconds":31536000}` for a year, or `{"type":"Indefinite"}`.

Two R2 behaviours worth knowing before you rely on this:

- **A bucket cannot be emptied while lock rules exist.** Remove the rules first,
  and note that removing a rule does *not* unlock objects already inside their
  retention window.
- **Retention is enforced by the bucket rule, not by this code.** The job writes
  an ordinary `PutObject`. If the rule is missing, the archive still succeeds
  and the purge still deletes — you get a copy, just a deletable one. Confirm
  the rule is there; a clean run does not prove it.

Then point the job at it:

```
AUDIT_ARCHIVE_BUCKET=eventclick-audit-archive
```

Credentials and endpoint come from the existing `S3_*` variables — same R2
account, no new secrets.

### What actually gets archived

One gzipped NDJSON object per organisation per batch, keyed
`audit/<org-id>/<run-stamp>/<batch>.ndjson.gz` — organisation first, so
producing one customer's history is a prefix listing rather than a scan.

Rows are **pseudonymised on the way in**, because immutable storage and GDPR
art. 17 erasure are otherwise in direct conflict: a row that cannot be deleted
for a year cannot be erased on request.

| Field | In the archive |
|---|---|
| `actor_email`, `ip_address`, `user_agent` | **Dropped** |
| keys in `REDACTED_KEYS` inside `old_values` / `new_values` | Replaced with `[redacted]` |
| `actor_user_id` | Kept — a UUID is a pseudonym without the `users` table |
| `action`, `resource_type`, `resource_id`, `created_at` | Kept |

So the archive answers "who did what, when" and stops answering it once the user
row is gone. It does not carry the identifiers that would make an erasure
request bite.

### If you intend to delete without archiving

Set `AUDIT_ARCHIVE_DISABLED=true`. That is deliberately a second variable rather
than just leaving the bucket empty — destroying the backlog should be something
somebody chose, not something that happened because a value was missing. The
refusal is logged as `event=audit_retention.refused`.

## Step 4 — put anyone under dispute on legal hold first

```sql
UPDATE organizations SET legal_hold = true WHERE id = '<org-uuid>';
```

Both retention purges skip a held organisation entirely — its audit rows *and*
its attendance, photos, submissions and recordings are all retained past their
period. Destroying evidence during a dispute is worse than keeping data too
long.

The flag is deliberately database-only: there is no API to set it, so the
decision leaves a deploy-shaped trail rather than a request-shaped one. Check
what is currently held:

```sql
SELECT id, name FROM organizations WHERE legal_hold;
```

A hold set midway through a run takes effect on the next one — the job reads
the hold list once per pass so every table in a run agrees on who is exempt.

## Step 5 — enable it

Set `AUDIT_RETENTION_DRY_RUN=false` and restart. Watch for:

```
event=audit_retention.archived     key=audit/<org>/<run>/00000.ndjson.gz rows=500 bytes=…
event=audit_retention.run_complete dryRun=false deleted=… archived=… receiptsWritten=…
```

## Step 6 — confirm afterwards

Re-run the count from step 1: at or near zero. Then confirm the purge left its
own trace:

```sql
SELECT organization_id, new_values, created_at
FROM audit_logs
WHERE action = 'audit.purged'
ORDER BY created_at DESC
LIMIT 20;
```

One row per organisation whose rows were removed, carrying the cutoff and the
count. An audit trail that can be trimmed without leaving a trace is not an
audit trail — if `deleted` was non-zero and no receipt appears, something is
wrong; look for `event=audit_retention.receipt_failed`.

Receipts are written **only when rows were actually deleted**. A daily no-op run
recording "purged 0" would add a row per organisation per day to the very table
this job exists to bound.

Then confirm the archive objects landed, and are readable:

```bash
npx wrangler r2 object get eventclick-audit-archive/audit/<org-id>/<run-stamp>/00000.ndjson.gz   --file /tmp/audit.ndjson.gz
gunzip -c /tmp/audit.ndjson.gz | head -3
```

Each line is one row. Check that `actorEmail`, `ipAddress` and `userAgent` are
absent and that no personal data survived in `oldValues` / `newValues` — if any
did, a key is missing from `REDACTED_KEYS` and it is now in immutable storage
where you cannot remove it. Fix the list before the next run.

## Known limitations

- **The redaction list is a denylist over data this module does not control.**
  `old_values` / `new_values` are free-form JSON written by call sites, so a
  future audit action can put personal data in a key nobody listed in
  `REDACTED_KEYS` (`services/audit-archive.service.ts`) — and it reaches the
  immutable archive, where it cannot be removed. Revisit that list whenever an
  audit action starts recording new fields.
- **The archive is only as immutable as the bucket rule.** This code writes an
  ordinary object; R2 enforces retention through bucket lock rules, not
  per-object headers. If the lock rule is missing or misconfigured, the archive
  still succeeds and the purge still deletes — you get a copy, but a deletable
  one. Verify the rule exists (step 3) rather than inferring it from a clean run.
- **The audit trail is not tamper-evident.** Append-only privileges
  (`REVOKE UPDATE, DELETE ... FROM app_user`, migration 0003) stop application
  code from rewriting history, but anyone with `auth_svc_role` credentials or
  database superuser access can. Hash-chaining rows, or shipping them to an
  external store the application cannot write to, is the control that closes
  that — neither is implemented.
- **Legal hold is all-or-nothing per organisation.** There is no way to hold a
  single event, room or user. A dispute over one event retains everything that
  organisation owns.
- **No leader election.** Background jobs run in every process. A second
  container runs this purge concurrently with the first. The batches delete by
  id, so the outcome is correct, but two runs can both write a receipt for the
  same pass — the counts will be split across them rather than duplicated.
- **It runs on a `setInterval`, not a cron.** The daily cadence restarts
  whenever the process does, so a frequently-restarting container runs the purge
  more often than daily. Harmless once the table is drained, but not a guarantee
  of "once per day". Startup is offset five minutes from the data purge so the
  two do not contend for the same connections at boot.

## If it fails

`event=audit_retention.run_failed` is logged and the schedule stays intact, so a
transient database problem resolves itself on the next pass.

**An archive failure blocks the delete, by design.** If the upload throws — or
returns without an ETag — the run aborts with the rows still in place. Nothing
is destroyed before its copy exists, so the correct response is to fix the
bucket or credentials and let the next run proceed; there is no data at risk
while it is failing.

**A refusal is not a failure.** `event=audit_retention.refused` means
`AUDIT_ARCHIVE_BUCKET` is unset and the job declined to delete rather than
destroy the backlog silently. Configure the bucket (step 3), or set
`AUDIT_ARCHIVE_DISABLED=true` if the loss is intended.

**One failure is not transient and should page:** the job throws
`deleted N of M rows in a batch` when a DELETE matches fewer rows than the
SELECT just returned. `audit_logs` is FORCE ROW LEVEL SECURITY with SELECT and
INSERT policies only, and DELETE is revoked from `app_user`; the purge works
because `auth_svc_role` is BYPASSRLS and was granted DELETE in migration 0001.
If that grant is ever lost, or the job runs as the wrong role, the DELETE
becomes a silent no-op — and without this check the loop would re-select the
same batch forever while reporting rows it never removed. The error means
"check the role's privileges", not "retry".

The signal worth alerting on otherwise is `audit_retention.run_complete` *not*
appearing for several days.
