# Runbook: CloudWatch container log retention

**Log group:** `/eventclick/prod/containers` (every service in `docker-compose.prod.yml`, one stream per service)
**Retention:** 30 days
**Who applies it:** an operator with AWS admin credentials. The EC2 instance role must never get `logs:PutRetentionPolicy` or `logs:DeleteRetentionPolicy`.
**Related:** #144, `docs/runbooks/audit-retention.md` (the audit trail lives in Postgres and the R2 WORM archive, not here)

---

## Why 30 days

The Docker `awslogs` driver creates the group on first container start with
CloudWatch's default retention: **never expire**. Two problems with that:

- **Personal data.** Some log lines carry emails and user IDs. Keeping them
  forever conflicts with GDPR art. 5(1)(e), storage limitation.
- **Cost.** Logs Insights (the Ops Console log search, #150) bills per GB
  scanned, so unbounded history makes every wide query more expensive.

30 days covers the realistic window for investigating an incident from
container logs. Longer-lived evidence belongs in `audit_logs` (365 days) and
its WORM archive, which this does not touch.

## Applying it is a one-way door

Setting or lowering retention **permanently deletes** every event older than
the new period, within about a day. Raising it later only affects events that
still exist. Do the two checks below first.

### Check 1: nothing older than 30 days is needed

If an open investigation needs older container logs, export them to S3 first:

```bash
aws logs create-export-task --region ap-south-1 \
  --log-group-name /eventclick/prod/containers \
  --from <epoch-ms> --to <epoch-ms> \
  --destination <bucket> --destination-prefix log-export/<date>
```

The bucket policy must allow `logs.ap-south-1.amazonaws.com` to `s3:PutObject`.

### Check 2: no organisation on legal hold has container logs in scope

On the host:

```bash
docker exec eventclick_postgres_prod sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, name FROM organizations WHERE legal_hold"'
```

No rows: proceed. Any rows: confirm with whoever placed the hold that container
logs are out of scope, or export them first (check 1).

## Measure

```bash
MSYS_NO_PATHCONV=1 aws logs describe-log-groups --region ap-south-1 \
  --log-group-name-prefix /eventclick/prod/containers \
  --query 'logGroups[].{name:logGroupName,retention:retentionInDays,bytes:storedBytes}'
```

`retention: null` means never expire. Record `bytes` in the change log below.

## Apply

```bash
MSYS_NO_PATHCONV=1 aws logs put-retention-policy --region ap-south-1 \
  --log-group-name /eventclick/prod/containers --retention-in-days 30
```

`MSYS_NO_PATHCONV=1` only matters in Git Bash on Windows, where the leading `/`
of the group name is otherwise rewritten to a Windows path.

## Verify

Run the measure command again: `retention` must be `30`. `storedBytes` drops
over the next day or two as CloudWatch expires old events; record the value
once it settles.

## New environments

The group does not exist until the first container starts, so retention cannot
be set during `scripts/setup-ec2.sh`. Apply it after the first deploy
(`docs/DEPLOYMENT_GUIDE.md`, section 3).

## Rollback

```bash
MSYS_NO_PATHCONV=1 aws logs put-retention-policy --region ap-south-1 \
  --log-group-name /eventclick/prod/containers --retention-in-days <longer>
```

or `delete-retention-policy` to never expire again. Both apply going forward
only; expired events cannot be recovered.

## Change log

| Date | Retention | storedBytes before | storedBytes after | Legal-hold check | By |
|---|---|---|---|---|---|
| 2026-09-15 (measured, not yet applied) | never expire | 110,973,072 (oldest events 2026-06-24) | — | done 2026-09-15: 0 organisations on legal hold | — |
