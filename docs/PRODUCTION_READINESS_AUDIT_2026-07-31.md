# Eventclick — Production Readiness Audit Report

**Date:** 2026-07-31
**Auditor:** Static analysis of full repository + referenced documentation
**Target Scale:** 10,000 concurrent users
**Verdict:** **NO-GO** — 4 production blockers must be resolved before deployment.

**Constraint:** No staging environment exists. Verification must use either production (with care) or throwaway one-off environments.

---

## Executive Summary

Eventclick is a Turborepo monorepo (server + client + shared) deploying a single-server Docker Compose stack to AWS EC2 with Cloudflare fronting DNS/SSL/CDN. The architecture is modern (Express 5, Drizzle ORM, React 19, Tailwind v4), with strong auth (JWT + argon2 + httpOnly refresh cookies), structured logging (Pino), Sentry error tracking, and Zod validation throughout.

However, independent verification of the claims in `docs/IMPLEMENTATION_COMPLIANCE_ANALYSIS.md` and `docs/PRODUCTION_CUTOVER_CHECKLIST.md` reveals **4 critical production blockers** that make the current state unsafe to deploy as-is. The most severe is that the database connection in production compose connects as a superuser (`Eventclick_admin`), which **bypasses all Row Level Security policies**. Additionally, the tenant context middleware uses a bare `SET` instead of `SET LOCAL`, the Docker healthcheck probes the heavy `/health/deep` endpoint, and the background session cleanup job is disabled in production compose.

**No deployment steps are provided below.** This report exists solely to enumerate blockers, evidence, and remediation.

---

## No-Staging Constraint

There is **no permanent staging environment**. This does not eliminate the verification requirement — it changes the method.

For each production blocker and high-priority item below, use one of these paths:

1. **Direct production verification** (read-only or during maintenance window) — applicable to DB role checks, `FORCE ROW LEVEL SECURITY` status, and RLS policy queries.
2. **Throwaway local/cloud environment** — spin up a temporary Postgres + app container, restore the latest production snapshot, run migrations, then destroy. This applies to:
   - Load test (`k6`/`Artillery` against throwaway EC2 or local)
   - Backup restore drill (`gunzip | psql` into throwaway DB)
   - RLS live test with concurrent connections
3. **Code + migration review as primary evidence** — when runtime verification is impractical before first deploy, the migration file + role grant statements become the source of truth, verified immediately after first deploy via PSQL.

The `PRODUCTION_CUTOVER_CHECKLIST.md` already accepts this pattern for 0.7 and 0.8:
> Both can run in a **throwaway environment** instead of a real staging tier.

---

## Current Architecture Overview

| Layer | Technology | Evidence | Status |
|-------|-----------|----------|--------|
| **Frontend** | React 19 + Vite 8 + Tailwind v4 | `packages/client/package.json`, `vite.config.ts` | Well-structured |
| **Backend** | Express 5 + TypeScript 6 + Zod 4 | `packages/server/package.json`, `src/index.ts` | Strong typing |
| **Database** | PostgreSQL 16 + Drizzle ORM | `docker-compose.prod.yml`, `packages/server/drizzle/` | Modern, typed |
| **Cache** | Redis 7 | `docker-compose.prod.yml` redis service, `src/config/redis.ts` | Integrated |
| **Auth** | JWT access + httpOnly refresh cookie + argon2 | `src/services/jwt.service.ts`, `src/services/session.service.ts` | Solid |
| **Queue** | AWS SQS | `src/queues/sq s.client.ts`, `src/queues/worker.ts` | Configured but disabled |
| **PDF** | Gotenberg 8 | `docker-compose.prod.yml` gotenberg service | Synchronous fallback active |
| **Storage** | S3-compatible (R2/MinIO) | `src/services/storage.service.ts` | Presigned URLs |
| **Observability** | Pino + Sentry | `src/index.ts`, `src/services/sentry.service.ts` | Integrated |
| **Metrics** | Prometheus text format | `src/services/metrics.service.ts`, `src/routes/index.ts:19` | `/metrics` endpoint exists |

---

## Infrastructure Inventory

### Docker Compose Production Stack

**File:** `docker-compose.prod.yml`

| Service | Image | Ports | Memory Limit | Role |
|---------|-------|-------|-------------|------|
| `postgres` | `postgis/postgis:16-3.4-alpine` | internal 5432 | 384M | Primary DB |
| `redis` | `redis:7-alpine` | internal 6379 | 96M | Session + rate-limit cache |
| `gotenberg` | `gotenberg/gotenberg:8` | internal 3000 | 512M | HTML-to-PDF |
| `migrate` | `ghcr.io/owner/eventclick/server:${IMAGE_TAG}` | — | — | One-shot migration runner |
| `server` | `ghcr.io/owner/eventclick/server:${IMAGE_TAG}` | internal 4000 | 384M | Express API |
| `pdf-worker` | `ghcr.io/owner/eventclick/server:${IMAGE_TAG}` | — | 512M | SQS PDF processor |
| `client` | `ghcr.io/owner/eventclick/client:${IMAGE_TAG}` | host:80 → 8080 | 64M | Nginx + React SPA |

**Evidence of issues:**
- `ghcr.io/owner/eventclick` is a **placeholder** (`docker-compose.prod.yml:140,174,255,320`). The CI workflow (`deploy.yml:103-104`) computes proper `ghcr.io/${REPO_LOWER}/server` and `/client` tags, but the compose file still contains the stale placeholder string. In a local/EC2 deploy without CI, this image reference will fail.
- `SQS_WORKER_ENABLED: "false"` on both `server` (`docker-compose.prod.yml:182`) and `pdf-worker` (`docker-compose.prod.yml:262`). This disables the SQS worker in the main server process and is misleading on the worker service.
- Server healthcheck probes `/api/v1/health/deep` (`docker-compose.prod.yml:229`). The route itself is documented as "NOT for load balancers (too heavy for per-request)" (`src/routes/index.ts:70`).

### CI/CD

**File:** `.github/workflows/ci.yml`
- Runs on push/PR to `main` and `develop`
- Uses Node 22 (matches Dockerfiles)
- Steps: lint, typecheck, npm audit (high+), unit tests (with Postgres + Redis services), Playwright E2E
- Workflow name is `CI` (not `ci.yml` anomaly — `deploy.yml:18` correctly references `workflow_run: workflows: ["CI"]`)

**File:** `.github/workflows/deploy.yml`
- Triggers on `workflow_run` of `CI` completion + `workflow_dispatch`
- Has **approval gate** via GitHub Environment `production`
- Builds images in CI, pushes to `ghcr.io`
- Deploys via **AWS SSM SendCommand** (no SSH needed)
- Rollback notification on failure, but actual rollback is done on EC2 via `git reset --hard HEAD~1`

**Issue:** `deploy.sh` rollback logic uses `git reset --hard HEAD~1` (`scripts/deploy.sh:205`). In an SSM-deployed environment where the git history may not have a clean `HEAD~1` (e.g., force-push, shallow clone, or first deploy), this can fail or leave the working tree in an unrecoverable state.

### Secrets Management

**Script:** `scripts/fetch-secrets.sh`
- Fetches all parameters from AWS SSM Parameter Store under `/eventclick/prod/*`
- Writes runtime-only `.env` to `/etc/eventclick/.env` with mode 600
- Validates 16 required keys before returning
- Also extracts sensitive values into Docker secrets files under `/etc/eventclick/secrets/`

**Script:** `scripts/deploy.sh`
- Calls `fetch-secrets.sh` before every deploy
- Falls back to existing `SECRETS_FILE` if fetch fails (`deploy.sh:71-76`). This fallback is a **risk**: if SSM is unreachable, the deploy proceeds with potentially stale secrets.

**Issue:** The fallback in `deploy.sh:71-76` allows deployment to continue with an existing secrets file if `fetch-secrets.sh` fails. This could serve stale or tampered secrets.

### Deployment Scripts

**Script:** `scripts/setup-ec2.sh`
- Provisions Ubuntu 24.04, Docker, UFW (ports 22, 80, 443), fail2ban, unattended upgrades, swap, log rotation
- SSH hardening (disable password auth, disable root login)
- Creates `deploy` user with passwordless sudo for Docker

**Script:** `scripts/deploy.sh`
- Pre-flight checks (Docker, secrets file, compose file)
- Pulls code, pulls images, runs migrations, rolling restart
- Health check via `docker inspect` of `Eventclick_server_prod`
- Smoke test hits `/api/v1/health/deep` from inside the EC2 host
- Rollback on failure

**Issues:**
- Smoke test uses `localhost:4000/api/v1/health/deep` (`deploy.sh:223`). This is the deep endpoint, which is appropriate for a deploy-time smoke test but is also what the Docker healthcheck uses — meaning a temporary Gotenberg outage would mark the container `unhealthy` and trigger an unnecessary rollback.
- Rollback uses `git reset --hard HEAD~1` (`deploy.sh:205,240`), which assumes a linear git history with at least 2 commits.

---

## Database Assessment

### Engine & Hosting
- PostgreSQL 16 via official `postgis/postgis:16-3.4-alpine` image
- Runs inside Docker Compose on EC2 (no RDS)
- Extensions: `uuid-ossp`, `pgcrypto`, `postgis` (`scripts/init-db.sql`)

### Migrations
- 22 migrations total, latest: `0021_fresh_ironman.sql` + pending `0022_add_missing_rls_policies.sql`
- Drizzle ORM migrations applied via `drizzle-orm/node-postgres/migrator`
- Advisory lock prevents race conditions (documented in `docs/IMPLEMENTATION_COMPLIANCE_ANALYSIS.md:68`)

### Connection Pooling
- `DB_POOL_MAX` configurable via env, default 10 (`packages/server/src/config/env.ts:25`)
- Separate `AUTH_DATABASE_URL` / `authPool` / `authDb` created in `packages/server/src/db/index.ts:12-23`
- **Issue:** `AUTH_DATABASE_URL` is defined in `env.ts` as optional but is **absent** from `.env.example`, `.env.production.example`, and `fetch-secrets.sh` required keys. If production `DATABASE_URL` connects as `app_user` (required for RLS), auth queries against `users`/`sessions`/`password_resets`/`email_verifications` will fail unless `AUTH_DATABASE_URL` is also set to a role with `BYPASSRLS`.

### RLS Status — **CRITICAL**

**Migration `0022_add_missing_rls_policies.sql`** defines 13 tenant isolation policies using:
```sql
CREATE POLICY ... ON table_name
  USING (organization_id = current_setting('app.current_tenant', true)::uuid);
```

**Verified issues:**
1. **`FORCE ROW LEVEL SECURITY` is not set on any table.** The `PRODUCTION_CUTOVER_CHECKLIST.md:18` explicitly states this as a release blocker. Superusers bypass RLS when `relforcerowsecurity = false`.
2. **`tenantContext.ts` uses bare `SET`, not `SET LOCAL`.** File: `packages/server/src/middleware/tenantContext.ts:13`:
   ```ts
   await db.execute(sql`SET app.current_tenant = ${orgId}`);
   ```
   The audit document claims this was changed to `SET LOCAL`, but the source code shows bare `SET`. With PgBouncer in `transaction` pool mode (the recommended mode), a bare `SET` persists for the lifetime of the pooled connection, leaking tenant context across unrelated requests.
3. **Production DATABASE_URL likely connects as superuser.** The dev `.env` shows `DB_USER=Eventclick_admin` (`/.env:2`). The production `.env.production.example` shows `DB_USER=eventclick_prod` (`.env.production.example:27`), but the deploy pipeline pulls from SSM. If SSM stores `Eventclick_admin` or any superuser, all RLS policies are silently bypassed.

### Backups
**Script:** `scripts/backup-db.sh`
- Creates `pg_dump` inside the Postgres container
- Uploads to R2 if AWS CLI and `S3_ENDPOINT` are present
- Retains 7 days daily + 30 days weekly
- **Issue:** If AWS CLI is missing, the script **silently skips** upload (`backup-db.sh:82-84`). The `PRODUCTION_CUTOVER_CHECKLIST.md:23` requires the script to "fail hard" in this scenario.

### Indexes
- Foreign key columns indexed on all child tables (`event_rooms_org_idx`, `room_recordings_org_idx`, etc.)
- Composite indexes on `(organizationId, status)`, `(organizationId, createdAt)` for common query patterns

---

## Client Assessment

### Build Pipeline
- Multi-stage Dockerfile (`packages/client/Dockerfile.prod`):
  - Stage 1: `node:22-alpine` deps
  - Stage 2: build with Vite + Tailwind + PWA
  - Stage 3: `nginx:1.29-alpine` runner, non-root `nginx` user
- Nginx binds to 8080, served behind Cloudflare (HTTP only at origin)
- Build args: `VITE_API_URL`, `VITE_LIVEKIT_URL`, `VITE_GOOGLE_CLIENT_ID` (baked in at build time)

### Security Headers
**File:** `packages/client/nginx.conf`
- HSTS with 1-year max-age + subdomains + preload
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN` (note: server sets `DENY`; nginx sets `SAMEORIGIN` — nginx wins on static assets because it adds headers after proxy)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=()`
- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ... frame-src 'self' https://accounts.google.com;`
- **Issue:** The CSP allows `'unsafe-inline'` and `'unsafe-eval'` for scripts. This is necessary for some React dev/production patterns but weakens XSS protection. The server (`src/index.ts:59-68`) sets a much stricter API CSP (`default-src 'none'`), but the Nginx CSP governs the SPA.

### Bundle Optimization
- `rollup-plugin-visualizer` generates `dist/stats.html` (`vite.config.ts:42-47`)
- All 23 pages are lazy-loaded via `React.lazy()` + `Suspense` (`App.tsx:28-51`)

### PWA
- `vite-plugin-pwa` installed with `autoUpdate` registration (`vite.config.ts:13-37`)
- Service worker generated but offline strategy not enforced

### In-App Privacy/Terms
- **Missing.** `DashboardLayout.tsx` links to `/terms` and `/privacy`, but no routes exist in `App.tsx`. These pages return 404. The `docs/GDPR_COMPLIANCE_REPORT.md:69` defers this as "Deferred until landing page is hosted."

---

## Server Assessment

### Runtime & Process Management
- Node.js 22 on Alpine Linux
- Non-root user `Eventclick` (UID 1001) in Dockerfile (`packages/server/Dockerfile.prod:33-34`)
- Graceful shutdown on SIGTERM/SIGINT with 10-second forced exit (`src/index.ts:190-214`)

### Autoscaling & Scaling
- Single server container; no load balancer
- No autoscaling group
- Stateless design supports horizontal scaling, but infrastructure does not

### Security Groups / IAM
- `setup-ec2.sh` configures UFW allowing 22, 80, 443
- EC2 IAM role needs `ssm:GetParametersByPath`, `ssm:GetParameter` for `fetch-secrets.sh`

### Timeouts
- `server.headersTimeout` = 60s
- `server.keepAliveTimeout` = 5s
- `server.requestTimeout` = 30s
- SSE route exempt via `req.setTimeout(0)` (mentioned in audit docs; not visible in current `index.ts` but may be in SSE route handler)

### Graceful Shutdown
- Implemented with `server.close()`, Redis disconnect, 10s force exit
- Missing: drain active connections before close (no `server.getConnections` check)

---

## CI/CD Assessment

### Workflows
- `ci.yml`: lint → typecheck → npm audit → unit tests → e2e tests
- `deploy.yml`: CI gate → build & push images → SSM deploy → rollback on failure

### Gaps
- No semantic-release or version bump automation
- No image vulnerability scanning (Trivy, Snyk) in CI
- No dependency review action (`github/dependency-review-action`)
- Artifact retention only for Playwright reports (14 days)

---

## AWS Infrastructure Review

### SSM Parameter Store
- Used for all production secrets
- Path: `/eventclick/prod/*`
- Validated by `fetch-secrets.sh`

### SQS
- `sqs.client.ts` supports email and PDF job enqueueing
- `worker.ts` processes `generate_pdf` messages with visibility timeout heartbeat
- **No dead-letter queue (DLQ) configured** in the worker or in deployment scripts
- **No visibility timeout extension for stuck jobs** beyond the in-worker heartbeat

### S3 / R2
- Presigned PUT URLs for photo uploads (`storage.service.ts:45-82`)
- Public URL builder for downloads
- No bucket lifecycle policies configured in code (relies on manual R2 setup per `cloudflare-setup.md`)

### Cloudflare
- DNS, SSL, CDN, DDoS protection documented in `cloudflare-setup.md`
- Bot Fight Mode, custom WAF rule suggested
- **No infrastructure-as-code** for Cloudflare resources (no Terraform provider, no API automation)

---

## Deployment Review

### Strategy
- CI builds images, pushes to GHCR
- SSM SendCommand triggers `deploy.sh` on EC2
- `deploy.sh` pulls images, migrates, restarts, health-checks
- Rollback on failure via `git reset --hard HEAD~1`

### Gaps
- No canary or blue-green deployment
- No feature flags
- `git reset --hard` rollback is destructive and assumes linear history

---

## EC2 Review

### Instance
- Target: `t3.small` (2 vCPU, 2 GB RAM) per `deployment-guide.md:43`
- 30 GB gp3 storage
- Elastic IP
- UFW allows 22, 80, 443
- fail2ban for SSH
- Unattended security upgrades
- 2 GB swap file

### Concerns
- 2 GB RAM is tight for Postgres (384M limit) + Redis (96M) + Gotenberg (512M) + server (384M) + client (64M) + OS
- Memory usage is monitored by `health-monitor.sh` but no alerting integration beyond email/Discord
- Single EC2 is a single point of failure; no auto-scaling, no multi-AZ

---

## Cloudflare Review

### Configured
- DNS proxy (orange cloud) for `app`, `api`, `www`, `@` records (`cloudflare-setup.md:27-35`)
- SSL/TLS Full (Strict)
- Origin certificate recommended but optional
- Bot Fight Mode, custom WAF rule

### Missing
- No Cloudflare Tunnel or Zero Trust (not required, but noted)
- No rate limiting on Cloudflare free plan (relies on Express rate limiter)
- No CDN cache rules enforced in code; relies on manual Cloudflare page rules

---

## Hostinger DNS Review

### Findings
- **Conflicting documentation.** `cloudflare-setup.md` instructs changing nameservers to Cloudflare. The user context states DNS is "managed through Hostinger." These are incompatible unless:
  1. Nameservers are transferred to Cloudflare (standard path), OR
  2. Cloudflare is used as a reverse proxy only (CNAME setup) while Hostinger retains authoritative DNS

**If DNS remains at Hostinger without Cloudflare proxy, the CDN, WAF, and SSL benefits described in `cloudflare-setup.md` are not active.** This must be clarified before go-live.

---

## Landing Page Review

- `docs/Production Report.md` is **empty** (4 lines, no content)
- Landing page paths referenced in GDPR report (`landing-page/app/privacy/page.tsx`, `landing-page/app/terms/page.tsx`) do not exist in the current repository tree explored
- If the landing page is not served from this repo, confirm hosting and HTTPS independently

---

## Cookie/Privacy/Terms Verification

### Cookie Consent
- `CookieConsent.tsx` provides essential/all options with `localStorage` persistence
- **No backend enforcement.** The component stores preference but no analytics/marketing cookies are conditionally loaded because the app does not set such cookies. Component is cosmetic.

### Privacy Policy
- Landing page has privacy policy (`docs/GDPR_COMPLIANCE_REPORT.md:14,53`)
- **No in-app `/privacy` route** (404)
- GDPR export endpoint redacts `passwordHash` and `twoFactorSecret` (`profile.routes.ts:82-86`)

### Terms
- Landing page has terms of service (`docs/GDPR_COMPLIANCE_REPORT.md:14,54`)
- **No in-app `/terms` route** (404)

---

## Security Audit

| Control | Status | Evidence | Issue |
|---------|--------|----------|-------|
| HTTPS/TLS | Configured | nginx.conf, cloudflare-setup.md | Origin certificate recommended but not enforced |
| HSTS | Present | nginx.conf:50 | 1-year, subdomains, preload |
| CSP | API strict, SPA relaxed | index.ts:59-68, nginx.conf:70 | SPA allows `unsafe-inline`/`unsafe-eval` |
| XSS | Strong | No `dangerouslySetInnerHTML` found | React auto-escapes |
| CSRF | Present | `csrf.ts` checks Origin/Referer on state-changing methods | No SameSite=None needed for same-site cookies |
| SQL Injection | Protected | Drizzle parameterized queries + Zod | No raw string concatenation in queries |
| Rate Limiting | Fail-closed | `index.ts:113-146`, Redis-backed | Redis disconnect throws |
| WAF | Cloudflare | cloudflare-setup.md:136-147 | Free plan = 1 custom rule |
| IAM | Least privilege | setup-ec2.sh, deploy.sh SSM | EC2 role scoped to SSM GetParameter |
| Secrets | SSM + .env | fetch-secrets.sh | Fallback to stale file on failure |
| Encryption | Argon2 passwords | auth-login.service.ts:42 | In-transit via HTTPS |
| Least privilege | Docker non-root | Dockerfiles, compose | Server runs as `Eventclick`, client as `nginx` |

---

## Cost Optimization Recommendations

| Item | Current | Optimized | Est. Savings | Difficulty |
|------|---------|-----------|-------------|------------|
| EC2 | t3.small $15/mo | t3.medium for peak, scale down off-peak | $5-10/mo | Low |
| CloudWatch Logs | Docker awslogs driver | 30-day retention, filter DEBUG in prod | $5-10/mo | Low |
| R2 Lifecycle | Not documented as attached | Infrequent Access after 30 days | $2-5/mo | Low |
| Reserved Instances | None | After 1-2 months of real data | 30-40% | Medium |
| Spot for PDF worker | Not used | Run pdf-worker on Spot | $3-8/mo | Medium |
| NAT Gateway | Not visible in compose | Ensure NAT only if needed | $32/mo avoidable | Low |

---

## Observability Assessment

### Logging
- **Structured JSON** via Pino-http (`src/index.ts:87-110`)
- **Correlation ID** via `x-request-id` header, propagated to logs and response
- **Log levels** custom: error (>=500), warn (>=400), info
- **Log shipping**: Docker `awslogs` driver to CloudWatch Logs (`docker-compose.prod.yml` logging config)

### Metrics
- `/metrics` endpoint exposes Prometheus text format (`src/routes/index.ts:19-22`, `src/services/metrics.service.ts`)
- Metrics: `http_requests_total`, `http_request_errors_total`, `http_request_duration_ms_sum`, `http_request_duration_ms_max`, `http_active_connections`, `process_uptime_seconds`
- **No Prometheus server or Grafana configured** in repo

### Tracing
- No distributed tracing (no OpenTelemetry, no X-Ray, no Jaeger)

### Alerting
- `health-monitor.sh` alerts via Resend email + Discord webhook
- No PagerDuty / OpsGenie / SNS
- No CloudWatch Alarms configured

### Uptime
- `/health` (liveness) and `/ready` (readiness) endpoints exist
- `health-monitor.sh` can be cronned every 5 minutes
- No external uptime probe (UptimeRobot, Cloudflare Monitor) configured in repo

---

## Logging Assessment

- **Structured:** Yes, Pino JSON
- **Correlation IDs:** Yes, `x-request-id`
- **Redaction:** Safe metadata only; no `password`, `token`, `secret`, `Authorization` logged (based on code review)
- **Retention:** 30 days operational (documented), 7 years audit (`audit_logs` table)
- **Gap:** No log aggregation query examples or CloudWatch Logs Insights filters in repo

---

## Monitoring Assessment

- **CPU/Memory/Disk:** `health-monitor.sh` checks disk (>85%) and memory (>90%)
- **Container restarts:** Checks `RestartCount > 10` (bug: checks `> 10` but comment says `> 3`)
- **DB pool:** No monitoring of connection pool utilization
- **Queue depth:** No SQS queue depth monitoring
- **Error rate:** Sentry captures 5xx but no automated alerting on error rate spike

---

## Error & Exception Review

- **Global error handler:** `errorHandler.ts` maps `ZodError` → 400, `ApiError` → status code, else 500
- **Sentry:** Lazy-loaded via `sentry.service.ts`; captures 5xx errors with route context
- **Unhandled rejections:** `startServer().catch(...)` at bottom of `index.ts:217-220`
- **Worker errors:** `startSqsWorker().catch(...)` logs and continues
- **Graceful degradation:** Redis disconnect makes rate limiter fail closed
- **Missing:** No circuit breakers for external calls (S3, SQS, Gotenburg, LiveKit)

---

## Status/Uptime Assessment

- `/health` returns `{ status: "ok", timestamp, uptime }`
- `/ready` checks PostgreSQL and Redis connectivity
- `/health/deep` checks PostgreSQL, Redis, JWT, S3, Gotenberg, LiveKit
- **No external uptime monitoring configured** (UptimeRobot, Cloudflare Monitor, etc.)

---

## Scalability Assessment

| Component | Scale | Gap |
|-----------|-------|-----|
| Server | Stateless, scalable | Single instance, no LB |
| Postgres | 10K users feasible | Single instance, no read replica |
| Redis | 64MB limit | Needs 256MB+ for 10K sessions |
| CDN | Not configured | Cloudflare doc exists but not enforced |
| SQS | Async emails | No DLQ, no async PDF in prod (worker disabled) |
| Gotenberg | Single container | No queue-based concurrency limit beyond `--chromium-max-queue-size=5` |

---

## Production Readiness Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Security | 7/10 | Strong auth, CSP, XSS, CSRF, rate limiting. **Critical RLS bypass via superuser; bare SET leaks tenant context.** |
| Code Quality | 8/10 | Clean architecture, strong typing, consistent patterns. Sentry double-init race, AUTH_DATABASE_URL gap. |
| Database | 6/10 | Good schema, indexes. **RLS bypassed in production; FORCE ROW LEVEL SECURITY missing; `SET LOCAL` not implemented.** |
| API Design | 9/10 | RESTful, versioned, validated, GDPR endpoints. |
| Frontend | 8/10 | Modern, code-split, secure. Missing in-app privacy/terms, relaxed CSP. |
| DevOps | 7/10 | Docker hardening, CI/CD, SSM secrets, deploy script. **Placeholder image registry; risky rollback; backup fails silently.** |
| Testing | 8/10 | 75 server tests + 7 integration + 7 Playwright E2E. Coverage expanding. |
| Multi-tenancy | 5/10 | App + DB isolation sound in design. **Production DB connection likely bypasses RLS entirely.** |
| Observability | 7/10 | Pino + Sentry + /metrics + health checks. No tracing, no external uptime, no CloudWatch Alarms. |
| Scalability | 4/10 | Stateless but single-instance, no CDN, no LB, no replicas. |
| GDPR | 7/10 | Export/delete/audit/cookie consent implemented. **Missing in-app privacy/terms, DPA, DPIA, breach notification workflow.** |

**Overall Score: 6.8/10 — NO-GO for production until blockers are resolved.**

---

## Production Blockers

### B-1: RLS Bypassed by Superuser Production Connection
- **Severity:** Critical
- **Description:** The production `DATABASE_URL` in `docker-compose.prod.yml:183` is assembled from `${DB_USER}:${DB_PASSWORD}`. If these SSM values correspond to a superuser (e.g., `Eventclick_admin`), all 13 RLS policies in `0022_add_missing_rls_policies.sql` are silently bypassed. No table has `FORCE ROW LEVEL SECURITY`.
- **Evidence:**
  - `docker-compose.prod.yml:183` — `DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}`
  - `PRODUCTION_CUTOVER_CHECKLIST.md:18` — "Release blocker — policies exist and work under `app_user`, but production `DATABASE_URL` connects as superuser `Eventclick_admin`"
  - `scripts/rls-live-test.sql:17` — `SELECT relname, relforcerowsecurity FROM pg_class ...`
- **Why it blocks production:** Tenant isolation is the core data security guarantee. A superuser connection reads/writes all organizations' data.
- **Risk if ignored:** Complete multi-tenant data leak. Any query against `event_rooms`, `users`, `activity_submissions`, etc. returns cross-org data.
- **Exact changes required:**
  1. Set `DB_USER=app_user` in SSM `/eventclick/prod/DB_USER` with a strong password (not `Eventclick_admin`).
  2. Enable `FORCE ROW LEVEL SECURITY` on all tenant tables (`ALTER TABLE ... FORCE ROW LEVEL SECURITY;`).
  3. Verify `app_user.rolsuper = false` and `app_user.rolbypassrls = false` in live DB.
- **Recommended order:** 1st (must fix before any other infra work)

### B-2: Tenant Context Leaks via Bare `SET`
- **Severity:** Critical
- **Description:** `packages/server/src/middleware/tenantContext.ts:13` uses `SET app.current_tenant = ${orgId}` instead of `SET LOCAL app.current_tenant = ${orgId}`. In PgBouncer `transaction` pool mode, a bare `SET` persists for the connection's lifetime, causing request A's `organizationId` to bleed into request B if they share a pooled connection.
- **Evidence:**
  - `PRODUCTION_CUTOVER_CHECKLIST.md:71` — "Verify tenant context uses `SET LOCAL app.current_tenant` inside the same transaction as queries — a bare `SET` ... will leak across pooled connections"
  - `packages/server/src/middleware/tenantContext.ts:13` — `await db.execute(sql\`SET app.current_tenant = ${orgId}\`);`
- **Why it blocks production:** PgBouncer in transaction mode is the recommended production setup. Leaking tenant context breaks RLS isolation at the database level.
- **Risk if ignored:** Cross-org data leakage under load. Difficult to reproduce in single-user dev but certain under concurrent production traffic.
- **Exact changes required:**
  1. Change `SET` to `SET LOCAL` in `tenantContext.ts`.
  2. Verify PgBouncer is configured in `transaction` pool mode (not `session`).
  3. Re-run `scripts/rls-live-test.sql` under `app_user` with concurrent connections to confirm isolation.
- **Recommended order:** 1st (together with B-1)

### B-3: Docker Healthcheck Uses `/health/deep` (Load-Balancer Unsafe)
- **Severity:** High
- **Description:** `docker-compose.prod.yml:229` uses `wget -qO- http://localhost:4000/api/v1/health/deep || exit 1` as the container healthcheck. The route is documented as "NOT for load balancers (too heavy for per-request)" because it checks S3, Gotenberg, LiveKit, and JWT signing on every probe.
- **Evidence:**
  - `docker-compose.prod.yml:229` — healthcheck command
  - `src/routes/index.ts:70` — `// Used by deploy-time smoke tests, not by load balancers (too heavy for per-request).`
- **Why it blocks production:** If any external dependency (R2, Gotenberg, LiveKit) has a transient blip, Docker marks the container `unhealthy`. Compose may restart it, triggering deploy rollback (`deploy.sh:191-212`) even though the API is serving traffic fine.
- **Risk if ignored:** False-positive restarts, unnecessary rollbacks, and thundering-herd restarts during external outages.
- **Exact changes required:**
  1. Change Docker healthcheck to `/ready` (DB + Redis only):
     ```yaml
     test: ["CMD-SHELL", "wget -qO- http://localhost:4000/api/v1/ready || exit 1"]
     ```
  2. Keep `/health/deep` for deploy smoke tests only (`deploy.sh:223`).
- **Recommended order:** 2nd

### B-4: Session Cleanup Disabled in Production
- **Severity:** High
- **Description:** `SQS_WORKER_ENABLED: "false"` in `docker-compose.prod.yml:182` (server service) causes `startSessionCleanupJob()` to be skipped (`src/index.ts:161-173`). Expired sessions are never purged from the `sessions` table.
- **Evidence:**
  - `docker-compose.prod.yml:182` — `SQS_WORKER_ENABLED: "false"`
  - `src/index.ts:161-173` — conditional `startSessionCleanupJob()`
  - `src/jobs/sessionCleanup.ts:15-19` — `setInterval(cleanupExpiredSessions, 60 * 60 * 1000)`
- **Why it blocks production:** Without cleanup, `sessions` grows unbounded. PostgreSQL `sessions` table accumulates stale rows, increasing DB size and slowing queries.
- **Risk if ignored:** Disk fill on EC2, degraded query performance on session lookups, eventual outage.
- **Exact changes required:**
  1. Set `SQS_WORKER_ENABLED: "true"` on the `server` service in `docker-compose.prod.yml`.
  2. Alternatively, extract `startSessionCleanupJob` from the SQS worker gate so it always runs regardless of `SQS_WORKER_ENABLED`.
  3. If `pdf-worker` is meant to be the only SQS consumer, remove `SQS_WORKER_ENABLED` from the `pdf-worker` service to avoid confusion.
- **Recommended order:** 2nd

---

## Step-by-Step Production Preparation Guide

### Phase A — Fix Critical Blockers (B-1 through B-4)

| Step | Action | Files to Change |
|------|--------|-----------------|
| A1 | Change `DB_USER` in production SSM to `app_user`; generate strong password. Set in `/eventclick/prod/DB_USER` and `/eventclick/prod/DB_PASSWORD`. | SSM Parameter Store |
| A2 | Add `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for every tenant table in a new migration `0023_force_rls.sql`. | `packages/server/drizzle/0023_force_rls.sql` |
| A3 | Change `SET` to `SET LOCAL` in `tenantContext.ts`. | `packages/server/src/middleware/tenantContext.ts:13` |
| A4 | Change server Docker healthcheck from `/health/deep` to `/ready`. Keep smoke test on `/health/deep`. | `docker-compose.prod.yml:229`, `scripts/deploy.sh:223` |
| A5 | Set `SQS_WORKER_ENABLED: "true"` on `server` service (or decouple session cleanup from the flag). | `docker-compose.prod.yml:182` |

### Phase B — Verify Blockers Are Resolved (No-Staging Path)

| Step | Action | Method |
|------|--------|--------|
| B1 | Confirm `app_user` RLS enforcement. | **Throwaway DB:** restore latest snapshot → apply migration 0022 + 0023 → `psql -U app_user` cross-org queries. **Or direct production** (read-only) during low-traffic window. |
| B2 | Confirm `FORCE ROW LEVEL SECURITY`. | **Direct production:** `SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN ('event_rooms', ...);` — read-only, safe. |
| B3 | Confirm `SET LOCAL` behavior under PgBouncer. | **Throwaway:** local Postgres + PgBouncer in `transaction` mode, run `scripts/rls-live-test.sql` with 2 concurrent sessions. |
| B4 | Confirm healthcheck stability. | **Local:** `docker compose -f docker-compose.prod.yml up` then restart Gotenberg container; watch `docker inspect` health status. Should stay `starting/healthy`, not `unhealthy`. |
| B5 | Confirm session cleanup runs. | **Direct production:** `SELECT count(*) FROM sessions WHERE expires_at < now();` before and after 1 hour. Or set interval to 60s temporarily and observe count drop. |
| B6 | Load test | **Throwaway:** build CI images (`ghcr.io/...:sha`), run on temporary EC2 `t3.small`, `k6 run -e BASE_URL=http://<temp-ip>:4000 script.js`. |
| B7 | Backup restore drill | **Throwaway:** restore latest R2 backup into fresh Postgres container; verify `pg_dump` row counts match. Run `backup-db.sh` with AWS CLI intentionally missing — must exit non-zero. |

### Phase C — Address High-Priority Issues

| Step | Action | Files to Change |
|------|--------|-----------------|
| C1 | Fix `AUTH_DATABASE_URL` gap. Add it to `.env.production.example`, `fetch-secrets.sh` required keys, and ensure SSM populates it with the `auth_svc_role` connection string. | `.env.production.example`, `scripts/fetch-secrets.sh` |
| C2 | Add in-app `/privacy` and `/terms` routes (or remove links from `DashboardLayout.tsx`). | `packages/client/src/App.tsx`, `packages/client/src/pages/Privacy.tsx`, `Terms.tsx` |
| C3 | Make `backup-db.sh` fail hard when AWS CLI is missing. | `scripts/backup-db.sh:82-84` |
| C4 | Remove placeholder `ghcr.io/owner/eventclick` from `docker-compose.prod.yml` or parameterize image names. | `docker-compose.prod.yml` |
| C5 | Add DLQ to SQS queue and configure `redrivePolicy`. | AWS Console + `worker.ts` |

### Phase D — Infrastructure Hardening (Before 10K Scale)

| Step | Action | Est. Effort |
|------|--------|-------------|
| D1 | Add load balancer + 2+ server replicas behind ALB. | Medium |
| D2 | Enable Cloudflare CDN caching and confirm DNS is actually proxied. | Low |
| D3 | Increase Redis to 256MB + AOF persistence. | Low |
| D4 | Add PgBouncer in transaction pool mode. | Medium |
| D5 | Configure dead-letter queue for SQS. | Low |
| D6 | Add OpenTelemetry tracing or AWS X-Ray. | Medium |
| D7 | Add CloudWatch Alarms + PagerDuty/OpsGenie. | Medium |
| D8 | Set up AWS Budgets + Cost Anomaly Detection. | Low |
| D9 | Implement database read replica for reports. | High |
| D10 | Add Trivy image scanning in CI. | Low |

---

## Step-by-Step Infrastructure Setup Guide

**Not generated because production blockers B-1 through B-4 are unresolved.**

---

## Step-by-Step Deployment Guide

**Not generated because production blockers B-1 through B-4 are unresolved.**

---

## Final Go/No-Go Recommendation

**NO-GO.**

The application codebase is architecturally sound, but the **production database multi-tenancy guarantee is currently broken** because the production connection is configured to use a superuser and `FORCE ROW LEVEL SECURITY` is not enabled. Additionally, the tenant context middleware will leak across pooled connections, and the production healthcheck will cause false-positive restarts.

**Go criteria:**
1. B-1 resolved: `DATABASE_URL` connects as `app_user`, `FORCE ROW LEVEL SECURITY` enabled.
2. B-2 resolved: `SET LOCAL` implemented and verified under PgBouncer.
3. B-3 resolved: Healthcheck uses `/ready`; smoke test uses `/health/deep`.
4. B-4 resolved: Session cleanup job running in production.

Only after all four blockers are verified in a staging environment should deployment proceed.
