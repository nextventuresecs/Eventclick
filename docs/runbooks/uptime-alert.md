# Runbook: production uptime alert

**Alert source:** `.github/workflows/uptime.yml` — "Uptime Check", every 5 minutes
**Fires when:** the production origin fails to answer `GET /api/v1/ready` on **two consecutive attempts**, roughly 25 seconds apart
**Alerts:** GitHub notification to repo watchers, plus email to `UPTIME_ALERT_EMAIL` when configured

---

## Who is alerted

Everyone watching the repository on GitHub, and the address in the
`UPTIME_ALERT_EMAIL` secret.

**This is email-grade urgency, not a page.** Nobody is woken up. If Eventclick
reaches a point where an overnight outage is unacceptable, this needs replacing
with a real paging channel — a hosted uptime service with a phone app, or
PagerDuty's free tier — not a shorter cron.

## First response step

**Open the failed workflow run** (linked in the alert) and read the probe
output. It tells you which of three things happened, and they have different
causes:

| What the run shows | What it means |
|---|---|
| SSM command failed to send / instance not found | The **EC2 instance** is down or unreachable. Not an app problem. |
| SSM succeeded but `wget` returned nothing or non-zero | The instance is up; the **server container** is down or not listening. |
| `/ready` answered with an error body | The container is up but a **dependency** (Postgres or Redis) is unreachable — `/ready` checks both. |

## Then

1. **Check it is really down**, from a browser: open the app. The probe checks
   the origin directly, so it can fail while Cloudflare still serves cached
   pages — and vice versa.
2. **Look at the containers:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail=200 server
   ```
3. **Check whether a deploy caused it.** Compare the alert time against the
   most recent run of "Deploy to Production". If they line up, the fastest fix
   is rolling back to the previous image tag.
4. **Check Sentry**, filtered to the current release. Since #83, every issue
   carries the deployed image tag, so "did this start with the last deploy?" is
   answerable from the issue list.
5. **Check the host itself.** `scripts/health-monitor.sh` on the box records
   disk and memory; a full disk takes Postgres down and looks like an app
   failure.

## Known false alarms

- **During a deploy.** The server container restarts, and a probe landing in
  that window fails its first attempt. The two-attempt retry covers most of
  this, but a slow image pull can still trip it. Cross-check the deploy
  workflow's timing before treating it as an incident.
- **Delayed schedules.** GitHub's scheduled workflows are best-effort and can
  drift under load. A gap between runs is not itself an outage — but it does
  mean time-to-alert is "usually ~5 minutes, occasionally longer".
- **Never Cloudflare bot protection.** The probe goes through AWS SSM to the
  origin specifically so that bot rules cannot cause a false alarm. If a check
  ever starts failing with an HTTP-level block, something has changed about how
  the probe reaches the origin.

## Verifying the alarm still works

Worth doing after any change to the deploy pipeline or the instance:

1. `docker compose -f docker-compose.prod.yml stop server` on the box.
2. Trigger the workflow manually (Actions → Uptime Check → Run workflow) rather
   than waiting for the cron.
3. Confirm it fails and the alert arrives.
4. `docker compose -f docker-compose.prod.yml start server`.

Stopping the whole instance tests the same path one level further out — the SSM
send itself fails — and is the check that proves the alerting is genuinely
independent of the thing it monitors.
