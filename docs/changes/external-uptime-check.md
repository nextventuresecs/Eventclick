# The health monitor cannot report the failure that matters most

**Status:** shipped
**Touches:** `.github/workflows/uptime.yml`, `docs/runbooks/uptime-alert.md`
**Ships with:** `feat/external-uptime-check` — closes #85

---

## 1. What the code does today

Health alerting is `scripts/health-monitor.sh`, run from cron **on the
production instance**:

```bash
#   */5 * * * * /home/deploy/app/scripts/health-monitor.sh >> health.log 2>&1
HEALTH_URL="http://localhost:4000/api/v1/health"
```

It is a decent script. It checks the API, container status, disk above 85% and
memory above 90%, and emails when something is wrong — and for the failures it
can see, those are the right things to look at.

**It monitors the machine it runs on.** If the instance stops — hardware fault,
a botched reboot, the disk filling to the point where cron cannot run, the
instance being terminated — the monitor stops with it. The one failure it is
structurally incapable of reporting is total loss of the instance, which is
also the one where every minute of silence costs the most. Nobody finds out
until a person opens the app.

There is a second constraint that shapes any fix. The public URL is behind
Cloudflare with Bot Fight Mode on, and it blocks plain automated requests.
`deploy.yml` already ran into this and works around it — it verifies health by
sending an SSM command to the instance instead of curling the public URL, and
treats the public-URL check as informational only:

```yaml
# ── Origin Health Check via SSM (bypasses Cloudflare Bot Fight Mode) ──
--parameters '{"commands":["docker exec eventclick_server_prod wget -qO- .../health"]}'
```

So a naive external checker pointed at the public URL would alert on bot
protection rather than on downtime — noise that gets an alarm muted, which is
worse than no alarm.

## 2. What I am changing, and why

**A scheduled GitHub Actions workflow that probes the origin from outside the
instance.**

Running on GitHub's infrastructure is what makes it independent: it survives
the instance dying, which is the entire point of the ticket. It reuses
`deploy.yml`'s SSM approach, so bot protection cannot cause a false alarm — and
SSM gives the right failure semantics for free, because if the instance is gone
the command cannot be delivered and the check fails for exactly the right
reason.

**It probes `/ready`, not `/health`.** `/health` says the process is alive;
`/ready` also checks Postgres and Redis. A server that is running but cannot
reach its database is down from a user's point of view, and the check should
agree with the user rather than with the process table.

**Two attempts, 20 seconds apart, before failing.** A single dropped SSM
message or a container restarting mid-deploy should not raise an alarm; a real
outage fails both. This is the trade between time-to-alert and false alarms,
made explicitly.

**Alerting is GitHub notifications plus email via Resend**, using the API key
already configured. The email step skips itself silently when
`UPTIME_ALERT_EMAIL` is unset, so the workflow still fails loudly through
GitHub alone.

**A runbook**, `docs/runbooks/uptime-alert.md`, because an alert nobody knows
how to answer is only marginally better than no alert. It maps the three
distinct probe failures — SSM undeliverable, container not answering, `/ready`
reporting a dependency down — to what each one actually means, since they have
different causes and different fixes.

## 3. What this affects

**Time-to-alert is "usually about five minutes", not a guarantee.** Five
minutes is GitHub's shortest cron interval, and scheduled workflows are
best-effort — they can be delayed under load. This is stated in the workflow
comment and the runbook rather than being left for someone to discover during
an incident. If it stops being good enough, the answer is a hosted uptime
service probing every 30 seconds, not a shorter cron here.

**This is email-grade urgency, not paging.** The chosen channels — GitHub
notifications and email — do not wake anyone at 3am. That satisfies "reaches a
channel monitored outside working hours" only in the sense that email is
readable outside working hours. Recorded plainly in the runbook so the gap is
visible rather than assumed away; moving to a real page is a decision with a
cost attached, and it can be made later without changing the probe.

**It consumes GitHub Actions minutes** — roughly 288 short runs a day. On a
public repository that is free; on a private one it is worth checking against
the plan's included minutes.

**A new AWS credential path.** The workflow uses the same
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `EC2_INSTANCE_ID` secrets as
`deploy.yml`, so nothing new is granted — but it does mean those credentials
are now exercised every five minutes rather than only on deploy. Their
permissions should be no broader than `ssm:SendCommand` on that instance.

**How we would know it broke.** The runbook's last section: stop the server
container, trigger the workflow manually, confirm it fails and the alert
arrives, then start the container. Stopping the whole instance tests one level
further out — the SSM send itself fails — which is what proves the alerting is
independent of the thing it monitors.

## 4. What to learn from this

**A monitor that shares a fate with the thing it monitors is not a monitor.**
This is the general form of the bug: any alarm hosted inside the failure domain
it watches is silent for exactly the worst outage. The test to apply is
mechanical — "if this whole thing disappeared, what would tell me?" — and it
applies to more than uptime checks: log shipping that buffers on the failing
host, dashboards served by the failing app, alert emails sent through the
failing mail queue.

**An alert with no runbook is an interruption, not information.** The value of
being told at 3am is entirely in knowing what to do next; without that, the
alert only moves anxiety around. Writing the runbook also forces the useful
question of what the alarm can actually distinguish — here, three different
failures that look identical in the notification and need different responses.

**False alarms are worse than a slightly slower alarm.** An alarm that fires on
deploys and network blips gets muted, and a muted alarm is indistinguishable
from no alarm — except that everyone believes they have one. Retries, and
choosing a probe that cannot be tripped by bot protection, cost seconds of
detection time and buy the alarm's credibility.
