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
Cloudflare Access (email one-time PIN, 8h session, email allowlist)
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
6. **DNS:** confirm the only `ops` record is the proxied CNAME the tunnel
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

1. **Access policy:** Zero Trust → Access → Applications → Ops Console →
   Policies → Maintainers → add the email.
2. **`maintainers` table**, on the EC2 host (via SSM Session Manager):

   ```bash
   cd /home/deploy/app/Eventclick   # the deploy checkout
   docker compose --env-file /etc/eventclick/.env -f docker-compose.prod.yml \
     run --rm --no-deps migrate node packages/server/dist/scripts/maintainers.js \
     add --email new.person@example.com --name "New Person" --added-by you@example.com
   ```

   The `migrate` service is used because it is the one carrying the owner
   `DATABASE_URL`; the maintainer roles cannot write to `maintainers`.

The maintainer's own inbox must have two-factor authentication. The one-time
PIN goes to that inbox, so its security is the console's security. This cannot
be enforced technically; confirm it when adding someone.

## Removing a maintainer

1. **Immediately:** `maintainers.js deactivate --email <e>` (same invocation as
   above). ops-server checks the table on every request, so the next request
   returns 403 with no restart.
2. **Then:** remove the email from the Access policy, and in Zero Trust →
   Users revoke their active session.

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
4. Instant shutdown if the console itself is the problem: disable the Access
   application, or delete the tunnel's public hostname. Seconds, no deploy.

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

## Change log

| Date | Change | By |
|---|---|---|
| | Cloudflare team domain, tunnel, Access application created | |
| | Production verification 1-8 | |
