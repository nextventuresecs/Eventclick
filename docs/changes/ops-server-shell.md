# Maintainers need a way in that proves who they are before any customer data exists behind it

**Status:** in progress — code complete; Cloudflare setup, SSM parameters and production verification pending (manual, `docs/runbooks/ops-console.md`)
**Touches:** `packages/server/src/ops-entry.ts`, `packages/server/src/ops/**`, `packages/server/src/utils/{redact,logger,sentryScrub}.ts`, `packages/server/eslint.config.mjs`, `packages/server/package.json`, `packages/server/Dockerfile.prod`, `packages/ops/**`, `docker-compose.prod.yml`, `scripts/{deploy,fetch-secrets}.sh`, `.github/workflows/{ci,deploy}.yml`, `.github/trivy/cloudflared.trivyignore`, `packages/e2e/**`, `.env.example`, `.env.production.example`, `context.md`, `docs/adr/0002-*`, `docs/runbooks/ops-console.md`
**Ships with:** `feat/ops-server-shell` — part of #147 (epic #142)

---

## 1. What the code does today

There is one HTTP process. `packages/server/src/index.ts` mounts every route at
`/api/v1`, and nginx in the `client` container is the only thing that reaches
it. After #146 the database has `maintainers`, an append-only
`maintainer_access_log`, and two login roles (`maintainer_ro_login`,
`maintainer_audit_login`), but nothing connects as those roles and there is no
way for a maintainer to identify themselves.

Two pieces of existing code shaped this change:

- `packages/server/src/utils/logger.ts` owned `REDACT_PATHS` and
  `SENSITIVE_FIELD_NAMES`, and imports `../config/env`. That module validates
  the tenant server's variables (JWT secrets, LiveKit, S3, tenant database
  URLs) and calls `process.exit(1)` when they are missing. Reasonable for one
  process: fail at boot, not at first request. It means no second process
  without those secrets can import the logger, or anything that imports it.
- `packages/server/src/worker-entry.ts` already runs a second entrypoint from
  the same image (`pdf-worker`), so "same image, different command" is an
  established pattern.

## 2. What I am changing, and why

Today a maintainer who needs to look at a tenant goes to the AWS console or
psql, which means every cross-tenant read is unaudited and needs credentials
far broader than a read. The Ops Console replaces that, but only if its front
door is right before it has anything behind it. This change is the front door
with nothing behind it except "who am I".

**Redaction lists moved** to `utils/redact.ts` (no imports). `logger.ts`
re-exports both names, so every existing import is unchanged.

**`ops-server`**, a separate process (`ops-entry.ts`, container `ops-server`):

- Own env (`ops/env.ts`); refuses to start with `OPS_AUTH_BYPASS_EMAIL` set in
  production.
- Two tiny `pg` pools as the two maintainer roles (`ops/db.ts`).
- `requireMaintainer`: verifies the `Cf-Access-Jwt-Assertion` JWT with `jose`
  (RS256, issuer, audience, Access JWKS), then requires an active `maintainers`
  row on every request. 401 / 403 / 503 `AUTH_UNAVAILABLE`.
- `respondAudited`: read, then insert the access-log row, then respond. If the
  insert fails the response is 503 `AUDIT_UNAVAILABLE` and the body is
  discarded (**fail closed**).
- `GET /ops-api/v1/healthz` (open, unaudited) and `GET /ops-api/v1/whoami`
  (audited as `session.whoami`).
- The static bundle is behind `requireMaintainer` too. A non-maintainer page
  request gets a script-free "Not authorized" HTML page, because the issue's
  "no bundle for non-maintainers" and "show the Not authorized screen" cannot
  both hold if that screen lives in the bundle.
- Strict CSP (`'self'` only, `frame-ancestors 'none'`), `no-referrer`,
  `Cache-Control: no-store` on the API, in-memory rate limit per maintainer.
- Request logs carry id, method, path and status only. pino-http replaces the
  logger's serializers with its own, which log every header; here that is the
  Access JWT, the `CF_Authorization` cookie and maintainer IPs.

**Import boundary** (`eslint.config.mjs`): a small path-resolving rule rather
than `no-restricted-imports`, because `../middleware/x` is tenant code from
`src/ops/app.ts` and ops code from `src/ops/routes/x.ts`. ops code may import
from the rest of `src/` only `utils/redact` and type-only `db/schema`; tenant
code may not import ops code; write SQL is rejected anywhere under `src/ops`
except `audit.ts`.

**`packages/ops`**: React 19 + Vite + Tailwind v4 shell. Session panel, sign
out (`/cdn-cgi/access/logout`), external links (Sentry when
`VITE_OPS_SENTRY_URL` is set, CloudWatch, Cloudflare, GitHub Actions), disabled
placeholders for Users / Health / Logs. The fetch wrapper uses
`redirect: "manual"` so an expired Access session (a redirect to
`cloudflareaccess.com`) is treated like a 401 and reloads the page.

**Deploy:** the server image builds the ops frontend. `ops-server` and a
pinned `cloudflared` are in compose under profile `ops`, with no `ports`.
`deploy.sh` starts them only when all five ops SSM parameters exist, and never
rolls back the tenant deploy over them. The deploy workflow scans the pinned
`cloudflared` tag and checks `ops-server` health when it is deployed.

## 3. What this affects

- **Tenant server:** only the `redact.ts` move touches running code. Logger
  and Sentry scrub tests pass unchanged; `sentryScrub.ts` imports the same
  list. The new lint rule adds no findings in tenant code.
- **Deploys before Cloudflare is set up:** unchanged behaviour plus one
  warning line (`Ops Console not started — missing in SSM: …`) and a passing
  `OPS_NOT_DEPLOYED` line in the workflow.
- **Deploys after:** two more containers (160M + 64M limits) on the 2-vCPU
  host. Measured 25 MiB for `ops-server` idle in a read-only container.
- **Image scan gate:** `cloudflared` 2026.9.1 (the latest release) has three
  HIGH findings in bundled Go modules with no newer cloudflared to move to.
  They are listed in `.github/trivy/cloudflared.trivyignore` with an expiry of
  2026-10-14 and a reason each; any other finding still fails the deploy.
  When the entries expire, deploys fail until someone re-checks. That is
  intended.
- **CI:** `npm run test` gains `@application/ops`; `e2e` starts two extra
  `ops-server` instances (maintainer and non-maintainer bypass emails) and
  builds the ops bundle.
- **How we would know it broke:** CloudWatch streams `ops-server` /
  `cloudflared`; the workflow's ops health step; `session.whoami` rows stop
  appearing in `maintainer_access_log`; 401s with
  `ERR_JWT_CLAIM_VALIDATION_FAILED` in `ops-server` logs mean SSM and the Access
  application disagree.

**Deviations from the issue text**

- **Start condition for the new services.** The issue adds `ops-server` and
  `cloudflared` to compose unconditionally. Without its SSM parameters
  `ops-server` exits at startup and `cloudflared` loops on an empty token, so
  every deploy between merge and the manual Cloudflare setup would carry two
  failing containers. They sit under compose profile `ops`, and `deploy.sh`
  starts them only when all five parameters exist, without rolling back the
  tenant deploy if they fail. A plain `docker compose up -d --remove-orphans`
  does not treat profiled services as orphans (checked on Compose v2).
- **Non-maintainer page requests get server-rendered HTML.** The issue asks for
  both "no static bundle served (403 on `/`)" and "the Not authorized screen"
  for an Access-approved email not in `maintainers`. The SPA screen lives in the
  bundle, so both cannot hold. `/` returns a 403 script-free HTML page; the SPA
  screen still covers a maintainer deactivated mid-session.
- **Scan exceptions for `cloudflared`.** The issue adds a blocking scan; the
  latest image fails it on three upstream findings, so they are ignored with
  an expiry (section 3).
- ADR numbering: `0001` was taken by #146. One new ADR, `0002`, covers identity
  and the separate process; the role separation is already `0001`.
- `ops/types.d.ts` holds the `req.maintainer` declaration and the `Maintainer`
  type.
- "Audit INSERT revoked → 503" is tested with a throwaway login role that has
  no grants, not by revoking from `maintainer_audit_writer`: vitest runs files
  in parallel and the #146 grants suite asserts that INSERT works.
- `requireMaintainer` takes its pool and key set as arguments instead of
  reading module globals, so the unit tests use a local key pair rather than
  mocking `createRemoteJWKSet`.

**Verification**

- Server: 493 tests (unit + integration on a migrated `postgis/postgis:16-3.4-alpine`
  with `init-db.sql` roles), `tsc --noEmit`, eslint 0 errors. Ops frontend: 9
  tests, typecheck, lint, build. Root turbo lint/typecheck/build green;
  `npm audit --audit-level=high` passes.
- The tests can fail: removing the static gate, the `audience` check, or the
  request-log serializers each turned the matching tests red.
- Real image (`Dockerfile.prod`): starts read-only with `/tmp` tmpfs and a 160M
  limit; healthz 200; whoami, `/` and a malformed token all 401; SIGTERM exits
  0; with `NODE_ENV=production OPS_AUTH_BYPASS_EMAIL=x@y.z` it prints the refusal
  and exits 1.
- Browser: the built bundle renders under the CSP with no console errors, and
  each load wrote one `session.whoami` row.
- Playwright `ops` project: 2 tests, run twice against the same database.
- `docker compose --profile ops config`: no `ports` on either service.
- **Not run:** the full e2e suite locally (CI runs it); everything that needs
  Cloudflare or production (runbook checks 1-8).

## 4. What to learn from this

- **Defence in depth means each layer verifies, not trusts.** An identity
  header set by a proxy is only as trustworthy as the network between the proxy
  and the app. Verify the signed assertion at the app, and keep the
  authorisation list (here `maintainers`) under your own control. To spot the
  mistake elsewhere: look for code that reads `X-Forwarded-User`,
  `X-Remote-User` or similar and never checks a signature.
- **Fail closed on audit.** If "every read is logged" is a requirement, the
  write must gate the response, not follow it. Code that responds and then
  logs in a `finally` has a silent path where the log is missing.
- **A module that exits on bad config is a dependency on that config.** Every
  importer inherits it. Keep constants that others need (here the redaction
  lists) in modules with no side effects.
- **Library defaults can override yours.** pino-http ignored the logger's
  serializers. Test what a log line actually contains, not what the config
  says it should.
