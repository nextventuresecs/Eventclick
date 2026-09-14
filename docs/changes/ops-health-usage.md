# Maintainers need to know "is prod healthy?" and "who is using it?" without SSH

**Status:** in progress — code complete, awaiting review
**Touches:** `packages/shared/src/ops.ts`, `packages/server/src/ops/{health,usage,env,app}.ts`, `packages/server/src/ops/probes/*`, `packages/server/src/ops/routes/{health,usage}.ts`, `packages/ops/src/**`, `packages/e2e/**`, `docker-compose.prod.yml`, `scripts/fetch-secrets.sh`, `.env.example`, `docs/iam/ops-console-policy.json`, `docs/runbooks/ops-console.md`
**Ships with:** `feat/ops-health-usage` — closes #149 (epic #142)

---

## 1. What the code does today

After #147 and #148 the Ops Console home page shows only the signed-in
maintainer and release. The signals that answer "is prod healthy?" exist but
are scattered: the tenant server's `GET /api/v1/health/deep` (seven dependency
checks, 200 or 503), `pdf_jobs` / `email_deliveries` / `notification_deliveries`
statuses in Postgres, and the SQS dead-letter queue. "Which orgs are active?"
needs psql as the owner. Migration 0013 already granted `maintainer_ro` every
column this needs, and `health.view` / `usage.view` are already valid
`maintainer_access_log` actions, so no migration is required.

## 2. What I am changing, and why

**`GET /ops-api/v1/health`** (audit `health.view`) runs three probes in
parallel, each settling to `ok` or `error` (`TIMEOUT` / `UNAVAILABLE`) within 5s
through `runProbe` (`ops/probes/probe.ts`). The endpoint is 200 whenever the
audit row is written; probe failures are body data.

- **app**: fetches `OPS_APP_INTERNAL_URL/api/v1/health/deep` on the compose
  network. A 503 body is data (a degraded dependency), not a failed probe.
- **backlog**: one SQL statement, four scalar subqueries, on the read pool.
- **dlq**: `GetQueueAttributes` through the instance role. Disabled, not red,
  when `OPS_SQS_DLQ_URL` is unset.

`overall` is red / unknown / amber / green, in that precedence (see
`computeOverall`). **Unknown outranks amber**: the issue says "unknown if any
probe errors and nothing is red", and an amber signal says nothing about the
probe that did not answer.

**`GET /ops-api/v1/usage`** (audit `usage.view`, `result_count` = org rows) is
one statement: a CTE per table aggregated by `organization_id`, then window
aggregates for totals so they count every org while rows stop at 200. Timeouts
propagate to the existing 504 `QUERY_TIMEOUT` handler.

**Home page**: Session panel (kept so the existing e2e anchors hold) with
release, "Running since" and the Sentry release link; a Health panel; a Usage
panel. Both load in parallel through `useOpsQuery`, which gained a refresh key,
and fail independently. Manual refresh only: every load writes audit rows.

## 3. Decisions and deviations

- **The SQS SDK is loaded on first use** (`ops/probes/dlq.ts`). ops-server runs
  under a 160M memory limit; without a DLQ URL the client never loads.
- **Race plus native cancellation.** fetch and SQS receive the abort signal;
  SQL cannot be aborted from the probe and relies on the pool's 5s
  `statement_timeout`. The race guarantees the response time either way.
- **`members` counts `users.organization_id` only**, as the issue specifies for
  `lastLoginAt`. The org detail page (#148) also counts `org_members`-only
  links, so the two numbers can differ for such orgs.
- **`totals.users`** is the sum of members of non-deleted orgs, matching the
  issue's scope rule; users with no organisation are not counted.
- **Email failures use `created_at`**, per the issue. An email created over an
  hour ago whose final attempt failed recently does not count.
- **New env vars are not in `REQUIRED_KEYS`.** Ops parameters are deliberately
  optional so a maintainer tool never blocks a tenant deploy. The DLQ probe
  reuses the existing required `SQS_DLQ_URL`.
- **Indexes**: `users_org_idx`, `event_rooms_org_idx` and
  `attendance_entries_org_idx` all exist; none added. The usage plan is hash
  aggregates over sequential scans, which is correct for a full aggregation.

## 4. Verification

- Unit: `computeOverall` truth table, `runProbe` deadline and error mapping,
  `probeApp` against a real HTTP server (200, 503 body, hang, bad status), SQS
  reader with a mocked SDK (ok, error, disabled), env parsing.
- Integration (real Postgres, maintainer login roles): all seven checks and a
  disabled DLQ; app timeout with backlog still populated in under 6s; backlog
  windows and red/amber by failed-email count; usage activity windows, ordering,
  soft-delete exclusion; exactly one audit row per call.
- Frontend: health renders while usage errors (and retries alone), and the
  reverse.
- E2E: `ops-home.spec.ts`, home shows the health strip and the seeded org, and
  the org link opens its detail page.
- Local `EXPLAIN (ANALYZE, BUFFERS)` as `maintainer_ro` with 300 orgs, 12k
  users, 12k rooms: 9.9ms execution. **Prod timing (criterion 9) is not yet
  measured**; see runbook verification row 10.
- Manual, local browser: red badge from a mock 503 with `gotenberg` failing,
  amber email count, usage ordering, Sentry link, no console errors.

## 5. Manual steps

1. Attach the `eventclick-ops-console` inline policy
   (`docs/iam/ops-console-policy.json`, ARN filled in) to the EC2 instance
   role. Until then the DLQ probe is `Unavailable` and the badge cannot be
   green.
2. Optional: SSM `OPS_SENTRY_ORG_URL`.
3. After deploy: runbook verification rows 9 and 10.

## 6. Rollback

Revert the PR. Remove the `eventclick-ops-console` inline policy statement. No
schema changes.
