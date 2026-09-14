# Runbook: Ops Console (`ops.eventclick.live`)

**Controls:** Cloudflare Access (outer gate) + Access JWT verification and the `maintainers` table in `ops-server` (inner gate) + Postgres grants (what a maintainer can read)
**Services:** `ops-server`, `cloudflared` in `docker-compose.prod.yml` (profile `ops`)
**Code:** `packages/server/src/ops-entry.ts`, `packages/server/src/ops/`, `packages/ops/`
**Issues:** epic #142, #146 (database), #147 (this shell)
**Decisions:** [ADR 0001](../adr/0001-maintainer-access-enforced-by-postgres-grants.md), [ADR 0002](../adr/0002-maintainer-identity-cloudflare-access.md)

---

## How a request gets in

```
Maintainer browser
  │ https://ops.eventclick.live
  ▼
Cloudflare Access (email one-time PIN + independent MFA, 8h session, email allowlist)
  │ adds Cf-Access-Jwt-Assertion header
  ▼
Cloudflare Tunnel ──(outbound-only)── cloudflared container
  │ http://ops-server:4100 (docker network only)
  ▼
ops-server (Express)
  ├─ verify JWT (jose, JWKS, aud, iss)
  ├─ maintainers table lookup (maintainer_ro_login pool)
  ├─ route handler reads (maintainer_ro_login pool)
  ├─ audit insert (maintainer_audit_login pool) ─ fail ⇒ 503, no data
  └─ serves packages/ops static build
```

Neither container publishes a port. The EC2 security group (#143) does not
need a rule for the console: `cloudflared` dials out to Cloudflare, and nothing
dials in.

Both gates are required. Access alone would trust anything on the docker
network that can set a header; the `maintainers` table alone would put a login
page on the internet.

## One-time Cloudflare setup (manual)

In the Cloudflare account that holds the `eventclick.live` zone
(Agriclick.llp@gmail.com). Record each value in the change log at the bottom.

1. **Zero Trust → choose a team name.** The team domain becomes
   `https://<team>.cloudflareaccess.com`. That exact URL, no trailing path, is
   SSM `/eventclick/prod/CF_ACCESS_TEAM_DOMAIN`.
2. **Settings → Authentication → Login methods:** enable **One-time PIN** and
   nothing else.
3. **Networks → Tunnels → Create a tunnel:** type Cloudflared, name
   `eventclick-ops`, remotely managed. Copy the token (the long string after
   `--token` in the install command) to SSM
   `/eventclick/prod/CLOUDFLARE_TUNNEL_TOKEN` as a SecureString. Do not run the
   install command on the EC2 host; the `cloudflared` container uses the token.
   **Public hostname:** subdomain `ops`, domain `eventclick.live`, service type
   `HTTP`, URL `ops-server:4100`.
4. **Access → Applications → Add → Self-hosted:**
   - Application domain `ops.eventclick.live`
   - Session duration **8 hours**
   - Identity providers: **One-time PIN only**; enable instant auth
   - Policy "Maintainers": Action **Allow**, Include → **Emails** → each
     maintainer's address. No Bypass, no Service Auth, no "Everyone" rules.
5. Open the application → **Overview → Application Audience (AUD) Tag**. Copy
   it to SSM `/eventclick/prod/CF_ACCESS_AUD`.
6. **Access controls → Access settings → Multi-factor authentication**
   (Cloudflare's *independent MFA*, not tied to the login method): require it,
   allow **Authenticator application** (security keys / biometrics optional),
   authentication duration **8 hours**. Settings apply to every Access
   application unless an application or policy overrides them; do not add an
   override that disables MFA for the Ops Console.
7. **Access controls → Access settings → App Launcher:** enable it with a
   policy of Action **Allow**, Include → **Emails** → the same maintainer list,
   login method One-time PIN. It is **off by default**, and it is the only place
   users can enroll an MFA device; without it, sign-in stops at "No
   authentication methods set up" and "Set up MFA" leads to "Please contact your
   administrator to enable the Access App Launcher". The App Launcher is exempt
   from the MFA requirement so users can reach it to enroll. It lists only
   applications the user is allowed into.
8. **DNS:** confirm the only `ops` record is the proxied CNAME the tunnel
   created (`<tunnel-id>.cfargotunnel.com`). No `A` record for `ops` may point at
   the EC2 IP.

Also required before the first deploy starts the console (from #146):
`/eventclick/prod/MAINTAINER_RO_DB_PASSWORD` and
`/eventclick/prod/MAINTAINER_AUDIT_DB_PASSWORD`, each a long random SecureString.

```bash
aws ssm put-parameter --region ap-south-1 --type SecureString --name /eventclick/prod/MAINTAINER_RO_DB_PASSWORD --value "$(openssl rand -base64 36)"
```

`deploy.sh` starts `ops-server` and `cloudflared` only when all five parameters
exist. Until then every deploy logs `Ops Console not started — missing in SSM: …`
and the tenant deploy proceeds normally.

## Adding a maintainer

Both steps. Either one alone does not grant access.

1. **Access policies:** Zero Trust → Access controls → Applications → Ops
   Console → Policies → Maintainers → add the email. Add it to the **App
   Launcher** policy too (Access controls → Access settings), or they cannot
   enroll MFA.
2. **`maintainers` table**, on the EC2 host (via SSM Session Manager):

   ```bash
   cd /home/deploy/app/Eventclick   # the deploy checkout
   docker compose --env-file /etc/eventclick/.env -f docker-compose.prod.yml \
     run --rm --no-deps migrate node packages/server/dist/scripts/maintainers.js \
     add --email new.person@example.com --name "New Person" --added-by you@example.com
   ```

   The `migrate` service is used because it is the one carrying the owner
   `DATABASE_URL`; the maintainer roles cannot write to `maintainers`.

3. **MFA enrollment, by the new maintainer:** open
   `https://<team>.cloudflareaccess.com/AddMfaDevice` (or App Launcher →
   Account → MFA devices → Add an MFA device), sign in with the email PIN,
   choose **Authenticator application**, scan the QR code and confirm with the
   6-digit code. Only one authenticator app can be enrolled at a time: to move
   to a new phone, delete the old one first (a security key can be added as a
   backup). Then open `https://ops.eventclick.live`: PIN, then authenticator
   code.

Sign-in is email PIN plus an enrolled authenticator, so a compromised inbox
alone no longer opens the console. Still ask maintainers to keep 2FA on their
inbox: it is where the PIN goes.

## Removing a maintainer

1. **Immediately:** `maintainers.js deactivate --email <e>` (same invocation as
   above). ops-server checks the table on every request, so the next request
   returns 403 with no restart.
2. **Then:** remove the email from the Ops Console and App Launcher policies,
   delete their MFA devices, and in Zero Trust → Users revoke their active
   session.

Rows are never deleted: `maintainer_access_log` references the maintainer.
`reactivate --email <e> --added-by <you>` restores access.

## Rotating secrets

- **`MAINTAINER_RO_DB_PASSWORD` / `MAINTAINER_AUDIT_DB_PASSWORD`:** update SSM,
  redeploy. `deploy.sh` re-passwords the login roles before migrate and
  restarts ops-server with the new URL.
- **Tunnel token:** Zero Trust → Networks → Tunnels → `eventclick-ops` →
  refresh token. Update SSM `CLOUDFLARE_TUNNEL_TOKEN`, redeploy. The old token
  stops working as soon as it is refreshed, so the console is down until the
  deploy finishes.
- **AUD tag** changes only if the Access application is recreated; update SSM
  `CF_ACCESS_AUD` and redeploy, or every request returns 401.

## Ops Console is down

The console is a convenience. Nothing customer-facing depends on it, and
everything it shows is reachable directly.

1. Go direct: Sentry, CloudWatch log group `/eventclick/prod/containers`, AWS
   console, Cloudflare dashboard.
2. On the host: `docker compose -f docker-compose.prod.yml --profile ops ps ops-server cloudflared`.
3. Logs: CloudWatch streams `ops-server` and `cloudflared`.
   - `Invalid ops-server environment variables` → an SSM parameter is missing
     or malformed.
   - `ops maintainer lookup failed` / 503 `AUTH_UNAVAILABLE` → database or
     `maintainer_ro_login` password.
   - `ops audit insert failed` / 503 `AUDIT_UNAVAILABLE` → `maintainer_audit_login`
     password or grants. By design no data is returned until this is fixed.
   - `ops access token rejected` with `ERR_JWT_CLAIM_VALIDATION_FAILED` → AUD tag
     or team domain in SSM does not match the Access application.
4. A maintainer who lost their authenticator: an administrator deletes their
   MFA device in Zero Trust (the user's entry under Users), then they re-enroll
   through `/AddMfaDevice`. Do not disable MFA for the application to work
   around it.
5. Instant shutdown if the console itself is the problem: disable the Access
   application, or delete the tunnel's public hostname. Seconds, no deploy.

## Looking up a user or organisation (#148)

Search needs an identifier you already have: a **full email**, a user or org
**ID**, an org **slug**, or a **request ID**. There is no partial or fuzzy
search, by design. Results show masked emails (`ja***@e***.org`) and names
(`J. D.`).

**Unmask** on a user page shows the real email and name after you give a
reason of 10-500 characters (a ticket reference is ideal). It is recorded with
the reason, limited to 20 per maintainer per hour, and the values disappear
when you leave the page. Every search and page view is recorded, including
searches that find nothing.

To review what maintainers looked at (owner connection):

```sql
SELECT created_at, maintainer_email, action, target_type, target_id, reason, result_count
FROM maintainer_access_log ORDER BY created_at DESC LIMIT 50;
```

## Health and usage on the home page (#149)

The home page answers "is prod healthy right now?" and "which orgs are using
Eventclick?". Each load writes one `health.view` and one `usage.view` row, so
there is no auto-refresh: use **Refresh**.

**Health badge.** Computed by `computeOverall` in
`packages/server/src/ops/health.ts`:

| Badge | Meaning | First look |
|---|---|---|
| Unhealthy (red) | A `/api/v1/health/deep` check is not `ok`; or a PDF job has sat in `pending`/`processing` for 15+ minutes; or the DLQ holds messages; or 5+ failed emails or notifications in the last hour | The failing chip names the dependency. Stuck PDFs: `pdf-worker` logs and Gotenberg. DLQ: `dlq-consumer` logs. Failed emails: Resend dashboard |
| Unknown (grey) | A probe could not answer (timed out after 5s, or errored) and nothing is red | `ops health probe failed` in the `ops-server` log stream names the probe |
| Degraded (amber) | A PDF job failed in the last 24h, or 1-4 failed emails or notifications in the last hour | Usually one customer's bad input; check Sentry |
| Healthy (green) | None of the above | |

"Running since" is the ops-server container's start time. Every deploy
recreates it, so it is the last deploy unless someone restarted ops-server
alone.

**Usage.** An org is active in a window when its latest member login, room
creation or attendance submission falls inside it. Soft-deleted orgs, users,
rooms and entries are not counted. The table shows the 200 most recently active
orgs; the totals count all of them.

### DLQ probe: IAM (one-time, manual)

Without this the DLQ probe reads `Unavailable` and the badge is at best
Unknown. `docs/iam/ops-console-policy.json` is the canonical policy for the
EC2 instance role; #150 appends log statements to the same file.

1. Replace `<ACCOUNT_ID>` and `<DLQ_NAME>` with the ARN of the queue in SSM
   `SQS_DLQ_URL` (`aws sqs get-queue-attributes --queue-url <url> --attribute-names QueueArn`).
2. IAM → Roles → the EC2 instance role → Add permissions → Create inline
   policy → JSON → paste → name it `eventclick-ops-console`.
3. Reload the home page: the dead-letter queue section shows a message count.

Optional: set SSM `OPS_SENTRY_ORG_URL` (e.g. `https://<org>.sentry.io`) and
redeploy to get a "View release in Sentry" link.

## Local development

```bash
npm run ops:maintainers --workspace=server -- add --email you@example.com --name You --added-by you@example.com
OPS_AUTH_BYPASS_EMAIL=you@example.com npm run dev:ops --workspace=server   # :4100
npm run dev --workspace=@application/ops                                   # :3100, proxies /ops-api
```

`MAINTAINER_RO_DATABASE_URL` and `MAINTAINER_AUDIT_DATABASE_URL` come from
`.env` (see `.env.example`). The bypass replaces Cloudflare Access entirely;
ops-server exits at startup if it is set with `NODE_ENV=production`.

## Production verification (after the first deploy with all five parameters)

Record the date, who ran it, and the result in the change log.

| # | Check | Expected |
|---|---|---|
| 1 | `curl -sI https://ops.eventclick.live/` from a clean session | 302 to `*.cloudflareaccess.com`, never ops-server content |
| 2 | Request a PIN for an email not in the Access policy | No working code is issued |
| 3 | Email in the Access policy, not in `maintainers` (or deactivated) | `/` shows the plain "Not authorized" page (403); `/ops-api/v1/whoami` returns 403 |
| 4 | Maintainer signs in | Email and release shown; one `session.whoami` row per load in `maintainer_access_log` with the response's `x-request-id` |
| 5 | `maintainers.js deactivate --email <e>`, then reload | 403 on the next request |
| 6 | On the host: `docker compose -f docker-compose.prod.yml --profile ops config` and `ss -ltn \| grep 4100` | No `ports` on either service; nothing listening on 4100 on the host |
| 7 | `docker exec eventclick_pdf_worker_prod wget -qO- http://ops-server:4100/ops-api/v1/whoami` | 401 |
| 8 | 100 whoami loads, then `docker stats --no-stream eventclick_ops_server_prod` | Under 160MiB |
| 9 | Home page after the IAM policy is attached (#149) | Health shows 7 dependency chips and a DLQ message count; usage lists orgs; one `health.view` and one `usage.view` row per load |
| 10 | Browser devtools, Network tab, on home page load (#149) | `/ops-api/v1/usage` completes in under 1s |

**Browser console on the console page.** Cloudflare Web Analytics, if enabled
for the zone, injects an inline loader and
`static.cloudflareinsights.com/beacon.min.js` into proxied HTML. ops-server's
CSP (`script-src 'self'`) blocks both, which is intended: no third-party script
runs on the maintainer console. To remove the two console errors, exclude
`ops.eventclick.live` from Web Analytics in the Cloudflare dashboard. Do not
relax the CSP.

## Change log

| Date | Change | By |
|---|---|---|
| 2026-09-14 | Team domain `eventclick-ops.cloudflareaccess.com`, tunnel, Access application created; five SSM parameters added | jagtaprathmesh19@gmail.com |
| 2026-09-14 | Deploy of `1eb8fbb`: `Ops Console started ✅`, ops healthz ok in the deploy workflow | jagtaprathmesh19@gmail.com |
| 2026-09-14 | Maintainers added: jagtaprathmesh19@gmail.com, agriclick.llp@gmail.com | jagtaprathmesh19@gmail.com |
| 2026-09-14 | Independent MFA required; App Launcher enabled for enrollment; authenticator enrolled (jagtaprathmesh19@gmail.com) | jagtaprathmesh19@gmail.com |
| 2026-09-14 | Verification 1 (302 to Access) and 4 (session page shows email, name, release `1eb8fbb`) passed | jagtaprathmesh19@gmail.com |
| | Verification 2, 3, 5, 6, 7, 8 | |
