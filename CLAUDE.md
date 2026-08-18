# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root — Turborepo fans out to workspaces. Use `--filter=<pkg>` to target one.

- `npm run dev` — runs `dev` in every workspace (server on :4000, client on :3000). `turbo dev` is `persistent`, so expect it to stay running.
- `npm run build` — `tsc` for server, `vite build` for client. Shared has no build step (see Architecture).
- `npm run typecheck` — `tsc --noEmit` across workspaces.
- `npm run lint` — only `client` has ESLint wired up; server/shared `lint` scripts are no-ops.
- No test runner is configured yet (root `test` script is a placeholder).

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

Turborepo monorepo, npm workspaces under `packages/*`. Three packages: `server`, `client`, `shared`.

### `@application/shared` is consumed as source, not built

`packages/shared/package.json` sets `"main": "src/index.ts"` and `"types": "src/index.ts"` — both server and client import `.ts` directly via the workspace link. There is no build step. Consequence: **any type or zod schema used across the client/server boundary lives here**, and editing it is picked up by both `tsx watch` and Vite HMR without a rebuild. This is the source of truth for:
- `USER_ROLES`, `ROOM_STATUSES` enums (mirrored in the DB as Postgres enums in `server/src/db/schema/enums.ts` — keep in sync).
- Zod request schemas (`RegisterSchema`, `LoginSchema`, `CreateRoomSchema`, …) used by server `validate` middleware AND by the client for form validation / types.
- `API_PREFIX` (`/api/v1`) — the server mounts all routes under this, and client `VITE_API_URL` points at it.

### Server (`packages/server`)

Express 5 + Drizzle ORM (PostgreSQL via `pg`) + Redis + zod. Entrypoint `src/index.ts` wires helmet, CORS (origins from comma-split `CORS_ORIGIN`), cookie-parser, pino-http, a global rate limiter, then `apiRouter` at `API_PREFIX`, then `notFoundHandler` + `errorHandler`.

Layering is controller → service → db. Do not reach into `db` from controllers.
- `routes/` — declares paths, stacks `validate(schema)` then `requireAuth` / `requireRole(...)`, then delegates to controllers.
- `controllers/` — parse `req`, call service, shape response. Controllers throw `ApiError` or forward service errors via `next(err)`.
- `services/` — business logic; own all DB calls via `db` from `src/db`.
- `middleware/validate.ts` — runs `schema.safeParse(req[source])` and **replaces** `req.body`/`query`/`params` with the parsed value. Downstream handlers see the coerced/narrowed data, not the raw input.
- `middleware/errorHandler.ts` — maps `ZodError` → 400 `VALIDATION_ERROR`, `ApiError` → its `statusCode`/`code`, everything else → 500 (message hidden in production).
- `utils/errors.ts` — `ApiError` with factories (`unauthorized`, `forbidden`, `conflict`, …). Prefer these over throwing generic `Error`s so the handler can respond correctly.

Auth model (read this before touching auth code):
- **Access token**: short-lived JWT (`JWT_ACCESS_TTL`, default 15m), signed with `JWT_SECRET`. Returned in the JSON response body; client keeps it in memory only.
- **Refresh token**: long-lived opaque random string (`JWT_REFRESH_TTL`, default 7d). Only the SHA-256 hash is stored in the `sessions` table; the raw token is sent as an httpOnly cookie `Evently_rt` scoped to `path=/api/v1/auth` (see `controllers/auth.controller.ts`).
- **Rotation + reuse detection**: `rotateSession` in `services/session.service.ts` revokes the current row and issues a new one sharing the same `familyId`. If a refresh token for an already-revoked row is presented, the entire `familyId` is revoked (`revokeSessionFamily`) and the client is forced to log in again. Preserve this behavior when editing session logic.
- `requireAuth` reads the `Authorization: Bearer …` header and puts `{ id, role, organizationId }` on `req.user` (see `types/express.d.ts` for the declaration merge). `requireRole(...)` checks against `@application/shared`'s `UserRole`.

Database (Drizzle):
- Schema modules in `src/db/schema/`, re-exported from `schema/index.ts`. `drizzle.config.ts` points `drizzle-kit` at that barrel. Every migration goes to `./drizzle`.
- Enum columns (`userRoleEnum`, `roomStatusEnum`) must match `USER_ROLES` / `ROOM_STATUSES` in `@application/shared`.
- Soft-delete convention: `deletedAt timestamp` on `users` and `event_rooms`. Queries that should exclude deleted rows must filter explicitly — there is no global filter.
- `db` in `src/db/index.ts` is the singleton drizzle instance over a `pg.Pool`; use it everywhere rather than constructing a new client.

### Client (`packages/client`)

React 19 + Vite + Tailwind v4 (`@tailwindcss/vite`) + `react-router-dom` v7. Path alias `@/` → `./src` (see `vite.config.ts`).

- `src/App.tsx` — `createBrowserRouter` with two route wrappers: `AuthRoute` (redirects to `/dashboard` if authed) and `ProtectedRoute` (redirects to `/login` if not). Both read `useAuth().status` which is `"loading" | "authenticated" | "unauthenticated"` — render a loading UI while `status === "loading"` to avoid redirect flashes.
- `src/lib/api.ts` — single `fetch` wrapper. Keeps the access token in a module variable (`setAccessToken`), attaches it as `Authorization: Bearer …`, and on `401` (except for `/auth/*` paths) calls `/auth/refresh` **once** (deduped via `refreshPromise`) then retries the original request. `setOnUnauthorized` lets `useAuth` react when refresh fails. Use `api.get/post/patch/delete` or the typed `authApi` / `roomsApi` helpers — do not call `fetch` directly from components.
- Types flow through `@application/shared` (`AuthUser`, `EventRoom`, `CreateRoomInput`, …). When adding an endpoint, extend both the shared schemas and the api helpers.


## Agent skills

### Issue tracker

Issues live as GitHub issues on `nextventuresecs/Veridian`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

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

