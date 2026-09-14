# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root — Turborepo fans out to workspaces. Use `--filter=<pkg>` to target one.

- `npm run dev` — runs `dev` in every workspace (server on :4000, client on :3000). `turbo dev` is `persistent`, so expect it to stay running.
- `npm run build` — `tsc` for server and shared, `vite build` for client.
- `npm run typecheck` — `tsc --noEmit` across workspaces.
- `npm run lint` — ESLint across all three workspaces. `client` uses its own flat config; `server` and `shared` use `eslint.config.mjs` (the `.mjs` extension is required — both packages are `"type": "commonjs"`). Errors fail CI; `@typescript-eslint/no-explicit-any` is a warning against the existing backlog.
- `npm run test` — Vitest in shared, client and server; Playwright in `e2e`. The `e2e` suite starts a real dev server, so it needs a working `.env` (all three database URLs, Redis) and will time out without one.

`turbo.json` declares `dependsOn: ["^build"]` on `build`, `typecheck` and `test`, so any of those run from the root builds `@application/shared` first. Invoking a workspace's compiler or test runner **directly** (`npx tsc -p packages/server/tsconfig.json`, `npx vitest` inside `packages/server`) skips that, and anything importing a newly added shared export fails to resolve until you run `npm run build --workspace=@application/shared`.

Single-workspace commands:
- `npm run dev --workspace=server` / `--workspace=client`
- `npm run typecheck --workspace=client`

Database (run inside `packages/server`):
- `npm run db:generate` — generate SQL migration from Drizzle schema into `drizzle/`.
- `npm run db:migrate` — apply migrations via `src/db/migrate.ts`. Uses `DATABASE_URL`, which is the migration/tooling connection only — the runtime uses `APP_DATABASE_URL` / `AUTH_DATABASE_URL` (see Env below).
- `npm run db:push` — push schema directly without a migration file (dev only).
- `npm run db:studio` — Drizzle Studio.

Full stack via Docker: `docker compose up` brings up postgres + redis + server + client. `scripts/init-db.sql` installs `uuid-ossp` and `pgcrypto` extensions required by the schema (`uuid_generate_v4()` is used as the default for every `uuid` PK).

Env: copy `.env.example` → `.env`. `packages/server/src/config/env.ts` validates env with zod at startup and **exits the process on failure** — when adding a new env var, add it there. Values are sourced from SSM in deployed environments; a missing URL reports as `"This URL is missing from SSM or .env"`.

**Three database URLs, not one** (`src/db/index.ts`, `src/db/migrate.ts`):
- `APP_DATABASE_URL` — the main pool behind `db`. Connects as the RLS-constrained tenant role; every request-scoped query goes through it.
- `AUTH_DATABASE_URL` — a separate `authPool` / `authDb` for auth and session work that must run outside tenant RLS. `jobs/sessionCleanup.ts` skips itself when it's absent.
- `DATABASE_URL` — migrations and Drizzle tooling only (`db:migrate`, and `drizzle.config.ts` for `db:generate` / `db:studio`). It is *not* the runtime connection.

`AUTH_DATABASE_URL` and `APP_DATABASE_URL` are both required unconditionally by the schema — the `.refine()` at the bottom of `env.ts` advertises a dev-mode fallback to a lone `DATABASE_URL`, but the base schema rejects the env before that check runs, so the fallback is unreachable. Don't rely on it; set all three locally.

## Architecture

Turborepo monorepo, npm workspaces under `packages/*`. Packages: `server`, `client`, `shared`, plus `ops` (Ops Console frontend) and `e2e`.

### `@application/shared` is compiled, and the server resolves its build output

`packages/shared/package.json` sets `"main": "dist/index.js"` and `"types": "dist/index.d.ts"`, and its `build` script is `tsc`. The server therefore resolves shared through `dist/`, **not** through the `.ts` sources.

Two practical consequences:

- **Add a shared export, then build shared**, or the server will not see it. Root-level `npm run typecheck` / `test` / `build` handle this via turbo's `^build`; a direct `npx tsc -p packages/server/tsconfig.json` does not, and fails with `has no exported member`. The fix is `npm run build --workspace=@application/shared`.
- The client does **not** go through `dist/`. `packages/client/vite.config.ts` aliases `@application/shared` straight to `../shared/src`, so Vite HMR picks up shared edits immediately while the server needs the rebuild. The two halves of the monorepo genuinely resolve this package differently — do not assume behaviour in one applies to the other.

**Any type or zod schema used across the client/server boundary lives here.** This is the source of truth for:
- `USER_ROLES`, `ROOM_STATUSES` enums (mirrored in the DB as Postgres enums in `server/src/db/schema/enums.ts` — keep in sync).
- Zod request schemas (`RegisterSchema`, `LoginSchema`, `CreateRoomSchema`, …) used by server `validate` middleware AND by the client for form validation / types.
- `API_PREFIX` (`/api/v1`) — the server mounts all routes under this, and client `VITE_API_URL` points at it.

### Server (`packages/server`)

Express 5 + Drizzle ORM (PostgreSQL via `pg`) + Redis + zod. Entrypoint `src/index.ts` wires helmet, CORS (origins from comma-split `CORS_ORIGIN`), cookie-parser, pino-http, a global rate limiter, then `apiRouter` at `API_PREFIX`, then `notFoundHandler` + `errorHandler`.

Layering is controller → service → db. Do not reach into `db` from controllers.
- `routes/` — declares paths, stacks `validate(schema)` then `requireAuth` / `requireRole(...)`, then delegates to controllers.
- `controllers/` — parse `req`, call service, shape response. Controllers throw `ApiError` or forward service errors via `next(err)`.
- `services/` — business logic; own all DB calls via `db` from `src/db`.
- `middleware/validate.ts` — runs `schema.safeParse(req[source])` and **replaces** `req.body`/`params` with the parsed value, so downstream handlers see coerced/narrowed data rather than raw input. **`source: "query"` does not work under Express 5**: `req.query` is exposed through a getter that re-derives the object, so both assignment and in-place mutation are silently discarded and the handler goes on reading raw strings. Parse query parameters in the handler instead (`MySchema.parse(req.query)`) — a `ZodError` thrown there reaches `errorHandler` as a 400 exactly as it would from the middleware. See `controllers/admin.controller.ts` (`listAuditLog`, `listOrgUsers`).
- `middleware/errorHandler.ts` — maps `ZodError` → 400 `VALIDATION_ERROR`, `ApiError` → its `statusCode`/`code`, everything else → 500 (message hidden in production).
- `utils/errors.ts` — `ApiError` with factories (`unauthorized`, `forbidden`, `conflict`, …). Prefer these over throwing generic `Error`s so the handler can respond correctly.

Auth model (read this before touching auth code):
- **Access token**: short-lived JWT (`JWT_ACCESS_TTL`, default 15m), signed with `JWT_SECRET`. Returned in the JSON response body; client keeps it in memory only.
- **Refresh token**: long-lived opaque random string (`JWT_REFRESH_TTL`, default 7d). Only the SHA-256 hash is stored in the `sessions` table; the raw token is sent as an httpOnly cookie `Eventclick_rt` scoped to `path=/api/v1/auth` (see `controllers/auth.controller.ts`).
- **Rotation + reuse detection**: `rotateSession` in `services/session.service.ts` revokes the current row and issues a new one sharing the same `familyId`. If a refresh token for an already-revoked row is presented, the entire `familyId` is revoked (`revokeSessionFamily`) and the client is forced to log in again. Preserve this behavior when editing session logic.
- `requireAuth` reads the `Authorization: Bearer …` header and puts `{ id, role, organizationId }` on `req.user` (see `types/express.d.ts` for the declaration merge). `requireRole(...)` checks against `@application/shared`'s `UserRole`.

Database (Drizzle):
- Schema modules in `src/db/schema/`, re-exported from `schema/index.ts`. `drizzle.config.ts` points `drizzle-kit` at that barrel. Every migration goes to `./drizzle`.
- Enum columns (`userRoleEnum`, `roomStatusEnum`) must match `USER_ROLES` / `ROOM_STATUSES` in `@application/shared`.
- Soft-delete convention: `deletedAt timestamp` on `users` and `event_rooms`. Queries that should exclude deleted rows must filter explicitly — there is no global filter.
- `db` in `src/db/index.ts` is **not** a plain drizzle instance — it is a `Proxy` that resolves, per call, to whatever tenant-scoped connection `tenantContextStorage` (an `AsyncLocalStorage`) currently holds, falling back to the bare pool when there is none. Use it everywhere rather than constructing a client, but understand what it resolves to (next point).

- **Read this before writing any query that runs outside an HTTP request.** RLS policies match on `current_setting('app.current_tenant')`, which `middleware/tenantContext.ts` sets with `SET LOCAL` — transaction-scoped, on one pinned connection, for the life of the request. Code with no ambient request (SQS workers, `setInterval` jobs, debounced or `setTimeout`-deferred callbacks that outlive the request that scheduled them) has no such context, so `db` falls back to the bare pool with **no tenant set**: reads match zero rows and writes fail the row-security policy. Wrap that work in `runInBackgroundTenantContext(orgId, userId, fn)` from `src/db/backgroundTenantContext.ts`. Never reuse an ambient context across an `await` that outlives the response — the pinned connection is committed and released on `res.on("finish")` and may already be serving another request. `queues/worker.ts` and `services/org-broadcast.service.ts` show the two sides of this.

### Ops Console (`packages/server/src/ops`, `packages/ops`)

A separate maintainer-only process, `ops-server` (`src/ops-entry.ts`), from the same image, reached only through Cloudflare Tunnel + Access. Read `docs/runbooks/ops-console.md` and `docs/adr/0001-*` / `0002-*` before touching it.

- **Boundary (lint-enforced):** code under `src/ops/` may import from the rest of `src/` only `utils/redact` and type-only `db/schema/*`. Never the tenant `db` proxy, `config/env`, `utils/logger`, routes, middleware or services. Tenant code never imports `src/ops/`.
- Reads use `opsReadPool` (`maintainer_ro_login`, column grants from migration 0013) with raw parameterised `pg`; name columns, `SELECT *` fails on partially granted tables.
- Every data response goes through `respondAudited` (`src/ops/audit.ts`), the only writer under `src/ops/`: read, insert the access-log row, then respond; insert failure returns 503 with no body.
- Local: `OPS_AUTH_BYPASS_EMAIL=<maintainer> npm run dev:ops --workspace=server` (:4100) and `npm run dev --workspace=@application/ops` (:3100).

### Client (`packages/client`)

React 19 + Vite + Tailwind v4 (`@tailwindcss/vite`) + `react-router-dom` v7. Path alias `@/` → `./src` (see `vite.config.ts`).

- `src/App.tsx` — `createBrowserRouter` with two route wrappers: `AuthRoute` (redirects to `/dashboard` if authed) and `ProtectedRoute` (redirects to `/login` if not). Both read `useAuth().status` which is `"loading" | "authenticated" | "unauthenticated"` — render a loading UI while `status === "loading"` to avoid redirect flashes.
- `src/lib/api.ts` — single `fetch` wrapper. Keeps the access token in a module variable (`setAccessToken`), attaches it as `Authorization: Bearer …`, and on `401` (except for `/auth/*` paths) calls `/auth/refresh` **once** (deduped via `refreshPromise`) then retries the original request. `setOnUnauthorized` lets `useAuth` react when refresh fails. Use `api.get/post/patch/delete` or the typed `authApi` / `roomsApi` helpers — do not call `fetch` directly from components.
- Types flow through `@application/shared` (`AuthUser`, `EventRoom`, `CreateRoomInput`, …). When adding an endpoint, extend both the shared schemas and the api helpers.


## Agent skills

### Issue tracker

Issues live as GitHub issues on `nextventuresecs/Eventclick`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## gstack

Use `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

