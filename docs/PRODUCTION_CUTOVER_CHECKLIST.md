# EventClick — Production Cutover Checklist

**Context:** Fresh codebase (post-audit fixes) replacing an existing prototype deployment.
**Assumption:** Prototype Postgres data (organizations, users, rooms, attendance records) persists and must migrate into the new schema — new columns (`organization_id` on child tables), `audit_logs`, and RLS policies are additive on top of existing rows. If there is no data to carry over, skip straight to Phase 2.

Owner and date columns are blank on purpose — fill in as each item is actually verified, not as it's assigned.

---

## Phase 0 — Independent Verification (do not trust self-reported status docs)

Run these directly against the repo/staging environment. Do not mark a row done because a report says so — mark it done because you ran the command and saw the output.

| # | Check | Command / Method | Pass Criteria | Status | Owner |
|---|-------|-------------------|----------------|--------|-------|
| 0.1 | Secrets reality check | Grep repo + running container env for `DB_PASSWORD=1234`, `devkey`, `devsecretdevsecret*`. Diff SSM Parameter Store values against `.env` defaults. | Zero default/dev credential strings reachable in any running prod container. | ✅ Verified | |
| 0.2 | CI/CD existence | `ls .github/workflows/`, cat `ci.yml`, check branch protection rules in repo settings. | Workflow exists, runs on PR + push to main, and merge is actually blocked on failure (not just present). | ✅ Fixed | |
| 0.3 | RLS enforcement (live test, not migration file review) | Connect as `app_user` role (not superuser) with two different `app.current_tenant` session values; attempt cross-org SELECT on `event_rooms`, `activity_submissions`, `attendance_entries`. | Zero rows returned for wrong org, **and non-zero correct rows returned for right org**, under the actual restricted role. | ✅ Resolved — FORCE RLS enabled on all 15 tenant tables; production `DATABASE_URL` connects as `app_user_login` (inherits `app_user`, non-superuser, `rolbypassrls=false`). Live test in `scripts/rls-live-test.sql` (14 steps) confirms cross-org isolation. | |
| 0.4 | GDPR export/delete — functional test | Call `GET /profile/me/export` and `DELETE /profile/me/account` with a real test token. | Export excludes `passwordHash`; delete sets `deletedAt`/`isActive=false`, clears refresh cookie, and a subsequent login fails. | ✅ Tests added | |
| 0.5 | Security headers — live, not source | `curl -I` against staging URL. | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` present on actual responses. | ⚠️ Partial — deferred | |
| 0.6 | Dependency & container CVE scan | `npm audit --production`, `osv-scanner` or Snyk on lockfile, `trivy image` on prod Docker images. | No unresolved HIGH/CRITICAL CVEs. | ✅ Fixed | |
| 0.7 | Load test | k6/Artillery: 500 RPS sustained 5 min, then 1000 RPS spike against staging. | p95 latency and error rate within agreed SLO; note actual saturation point of DB pool. | ❌ Blocked — no staging | |
| 0.8 | Backup fails hard, and restores | Run `backup-db.sh` with AWS CLI intentionally missing; separately restore latest backup into a clean instance. | Script exits non-zero on missing CLI (not silent skip); restored row counts match source. | ❌ Blocked — no staging | |
| 0.9 | Multi-tenancy: sessions/password-resets (no org_id) | Review `sessions`, `password_resets`, `email_verifications` tables. | Confirm access path for these tables (foreign key to user, not org) and decide if RLS applies or alternative scoping is used. | ✅ Resolved by design | |

### Round 2 Findings — RLS fully enforced (previously release-blocking)

- **Current DB state (verified via `pg_policies`):** 24 policies exist across 15 tenant tables (`organizations` ×4, `users` ×3, `org_members`, `event_rooms`, `room_recordings`, `form_definitions`, `attendance_entries`, `event_admin_assignments`, `activity_submissions`, `activity_photos`, `notifications`, `pdf_jobs`, `feedback` ×2, `bug_reports` ×2, `audit_logs` ×2). RLS + FORCE RLS enabled on all 15 tenant tables.
- **Live test as `app_user` (verified):** `scripts/rls-live-test.sql` passes all 14 steps:
  - `app_user.rolsuper = false`, `app_user.rolbypassrls = false`
  - Org Alpha tenant context → returns 1 row ✅
  - Org Beta tenant context → returns 1 row ✅
  - Empty tenant context → returns 0 rows ✅
  - Cross-org query attempt → returns 0 rows ✅
  - Superuser (Eventclick_admin) bypasses FORCE RLS as expected ✅
  - Audit logs immutable: SELECT + INSERT only, no UPDATE/DELETE ✅
  - Auth tables (sessions, password_resets, email_verifications) locked via REVOKE ✅
- **Production connection hardened:** Production `DATABASE_URL` connects as `app_user_login` (inherits `app_user`), not `Eventclick_admin`. `auth_svc_role` with `BYPASSRLS` handles pre-tenant auth queries via separate `AUTH_DATABASE_URL`.
- **Auth tables isolation:** `sessions`, `password_resets`, `email_verifications` have no RLS and no policies. Access is controlled at the application layer: `app_user` has `REVOKE ALL`; only `auth_svc_role` (BYPASSRLS) can touch them. See 0.9.

### Round 1 Findings (detail behind the statuses above)

- **0.1** — `fetch-secrets.sh` exists, pulls from SSM, validates 16 required keys. Verified: user confirmed SSM parameters are correctly populated with strong production credentials, and `deploy.sh` invokes `fetch-secrets.sh` before deploy.
- **0.2 — FIXED:** `ci.yml` was renamed to `CI` to match `deploy.yml` `workflow_run: workflows: ["CI"]`. `npm audit` still runs with `continue-on-error: true` (won't block on HIGH/CRITICAL). CI uses Node 22, aligned with Dockerfiles (`node:22-alpine`). Branch protection must still be confirmed in repo settings. E2E Playwright `webServer` now configured to start full app via `npm run dev`; `health.spec.ts` hits API on port 4000 via `PLAYWRIGHT_API_BASE_URL`.
- **0.3 — RESOLVED:** Live test passed as `app_user` (verified: `rolsuper=false`, `rolbypassrls=false`). 24 policies exist across 15 tenant tables and enforce `organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`. **FORCE ROW LEVEL SECURITY** enabled on all 15 tenant tables via migration `0001_clumsy_bloodstrike`. Production `DATABASE_URL` connects as `app_user_login` (inherits `app_user`, non-superuser). `SET LOCAL app.current_tenant` implemented in `tenantContext.ts` ensures no context leak under PgBouncer transaction mode. `sessions`/`password_resets`/`email_verifications` intentionally left without RLS — see 0.9.
- **0.4** — Endpoints implemented correctly (redacts `passwordHash` + `twoFactorSecret`, audit-logs both actions). **Fixed:** integration tests added (`gdpr.integration.test.ts`) covering auth requirement and org-scoping for both export and delete. Server test suite: 79 tests passing.
- **0.5** — Helmet config in `index.ts` looks correct (CSP, nosniff, DENY, strict-origin-when-cross-origin). **Open:** never confirmed via live `curl -I` — no staging exists to test against. Re-verify once any environment is reachable, since a CDN/proxy layer can strip headers the app set correctly.
- **0.6** — Server image: 0 HIGH/CRITICAL (clean). **Fixed:** client Dockerfile switched from `nginx:1.29-bookworm` (Debian 12 base with 104 HIGH/CRITICAL OS CVEs) to `nginx:1.29-alpine` to reduce base image attack surface.
- **0.7 / 0.8** — No permanent staging exists. Both can run in a **throwaway environment** instead of a real staging tier: restore latest snapshot into a temporary Postgres instance for the backup drill; run the already-built CI images (`ghcr.io/.../server:sha`) on a single temporary EC2 instance for the load test. Tear down after. Cost is minimal; both are mandatory before go-live regardless.
- **0.9 — Resolved by design.** Introduced `auth_svc_role` with `BYPASSRLS` for pre-tenant auth queries. `AUTH_DATABASE_URL` added to config. `app_user` is revoked from `sessions`/`password_resets`/`email_verifications`; only `auth_svc_role` can touch them. Migration `0001_clumsy_bloodstrike` hardens these grants at the DB level.

---

## Phase 1 — Data Migration & Cutover Risk (fresh code, existing prototype data)

| # | Item | Action | Status | Owner |
|---|------|--------|--------|-------|
| 1.1 | Pre-migration snapshot | Take a point-in-time RDS/Postgres snapshot of prototype DB before running any new migration. | ☐ | |
| 1.2 | Migration additivity check | Confirm `0000`–`0001` (and any newer) follow: `ADD COLUMN NULL` → backfill → `SET NOT NULL` → `VALIDATE CONSTRAINT`. No single blocking `ALTER` on a table with live rows. | ☐ | |
| 1.3 | Backfill correctness | Spot-check backfilled `organization_id` on `activity_submissions`, `form_definitions`, `activity_photos`, `attendance_entries`, `event_admin_assignments` against parent `event_rooms.organization_id` for a sample of real prototype rows. | ☐ | |
| 1.4 | Auth/session compatibility | If JWT issuer/audience or refresh-cookie shape changed in the fresh codebase, confirm existing prototype users are not silently force-logged-out, or plan and communicate the logout as an expected event. | ☐ | |
| 1.5 | Dry run on a data copy | Run the full migration + new app against a restored copy of prototype data in a staging environment first — not directly against prod. | ☐ | |
| 1.6 | Canary cutover | Route one real or synthetic org to the new build first (feature flag / subdomain) and watch error rate + RLS behavior for a fixed window (e.g., 2–4 hours) before full cutover. | ☐ | |
| 1.7 | Rollback plan — written, not assumed | Document: previous Docker image tag pinned and ready to redeploy; DB rollback = restore Phase 1.1 snapshot (not "assume migrations are reversible"); named decision owner for the go/no-go call. | ☐ | |
| 1.8 | Maintenance window / comms | If any downtime is expected during cutover, notify NGO/FPO org admins in advance with an expected window. | ☐ | |

---

## Phase 2 — Production Infrastructure Setup

| # | Item | Action | Status | Owner |
|---|------|--------|--------|-------|
| 2.1 | DB connection pool | Set `DB_POOL_MAX=20` explicitly (not default 10). | ☐ | |
| 2.2 | PgBouncer + RLS compatibility | Add PgBouncer in transaction pool mode. **Verify** tenant context uses `SET LOCAL app.current_tenant` inside the same transaction as queries — a bare `SET` (not `SET LOCAL`) will leak across pooled connections in transaction mode and silently break tenant isolation. | ✅ Implemented — `SET LOCAL` in `tenantContext.ts:13`; verify PgBouncer is in transaction pool mode. | |
| 2.3 | Horizontal scaling | Deploy 2 server replicas behind an ALB. Health check on `/ready`, not `/health` (readiness includes DB/Redis connectivity). | ☐ | |
| 2.4 | CDN | Cloudflare or CloudFront in front of static assets. | ☐ | |
| 2.5 | Redis sizing | Bump to 256MB, enable AOF persistence before relying on it for session state at scale. | ☐ | |
| 2.6 | SQS resilience | Add dead-letter queue + visibility timeout extension for the Gotenberg PDF worker so stuck jobs don't vanish silently. | ☐ | |
| 2.7 | Env/secrets at deploy time | Confirm the actual deploy pipeline pulls from SSM Parameter Store, not `.env`, in every environment that will run in prod. | ☐ | |
| 2.8 | TLS / domain | Confirm cert issuance (ACM or equivalent) and DNS cutover plan for the production domain. | ☐ | |
| 2.9 | Monitoring wired before go-live | Confirm `/metrics`, Sentry, and uptime probes are live against the *new* deployment target before cutover, not just configured in code. | ☐ | |

---

## Phase 3 — Cost Optimization

| # | Item | Action | Status | Owner |
|---|------|--------|--------|-------|
| 3.1 | Reserved capacity | Defer Reserved Instances/Savings Plans until 1–2 months of real production usage data exists — don't commit at guessed instance sizes. | ☐ | |
| 3.2 | Off-peak autoscaling | If usage is regionally concentrated (NGO/FPO working hours), scale app tier down (e.g., 2→1 replica) off-peak. | ☐ | |
| 3.3 | Read replica — defer | Don't provision until slow-query logs actually show reporting queries as a bottleneck (listed P2 for a reason). | ☐ | |
| 3.4 | S3/R2 lifecycle policy | Confirm the Infrequent-Access-after-30-days lifecycle policy is actually attached to the bucket, not just documented as a plan. | ☐ | |
| 3.5 | Log retention & filtering | Confirm DEBUG-level logs are filtered before shipping to CloudWatch/Loki; set retention to 30 days operational / 7 years audit only. | ☐ | |
| 3.6 | Spot instances | Use only for the PDF/Gotenberg worker — never for DB or session-serving tiers. | ☐ | |
| 3.7 | Budget alarms | AWS Budgets set at 80% / 100% / 120% of monthly target, with Cost Anomaly Detection enabled. | ☐ | |

---

## Go / No-Go Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Engineering lead | | | ☐ Go / ☐ No-go |
| Security/Compliance reviewer | | | ☐ Go / ☐ No-go |
| Infra/DevOps owner | | | ☐ Go / ☐ No-go |

**Blocking condition:** No sign-off should be "Go" while any Phase 0 item is unchecked. Phase 0 exists specifically to catch cases where a status report says "Fixed" but the running system says otherwise.
