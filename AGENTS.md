# AGENTS.md — Eventclick

## Commands

Run from repo root. Turborepo fans out to workspaces.

- `npm run dev` — server (:4000) + client (:3000). Persistent.
- `npm run build` — `tsc` for server, `vite build` for client. Shared has no build.
- `npm run typecheck` — `tsc --noEmit` across all workspaces.
- `npm run lint` — only client has ESLint; server/shared lint are no-ops.
- `npm run test` — not configured. Server has `vitest` devDependency but no tests.

Single workspace: `npm run dev --workspace=server` or `--workspace=client`

DB (inside `packages/server`):

- `npm run db:push` — push Drizzle schema directly (dev).
- `npm run db:generate` — generate SQL migration.
- `npm run db:migrate` — apply migrations.
- `npm run db:studio` — Drizzle Studio.

Docker: `docker compose up` brings up Postgres + Redis + LiveKit + MinIO + server + client + Gotenberg.

## Architecture

Turborepo monorepo, npm workspaces under `packages/*`. Three packages:

- `server` — Express 5 + Drizzle ORM + PostgreSQL 16 + Redis
- `client` — React 19 + Vite + Tailwind v4
- `shared` (`@application/shared`) — consumed as source, not built. `main`/`types` point to `src/index.ts`.

## Critical Conventions

- TypeScript strict mode + `noUncheckedIndexedAccess`.
- Every tenant-scoped query must enforce `organizationId`. Child tables (`formDefinitions`, `attendanceEntries`, `activitySubmissions`, `activityPhotos`, `roomRecordings`) have no `organizationId` column; verify the parent `eventRooms` row is in the org before querying them.
- Soft deletes via `deletedAt`. Exclude deleted rows explicitly in every query.
- Auth: JWT access token in memory, refresh token in httpOnly cookie `Eventclick_rt`.
- `req.user` typed via module augmentation in `server/src/types/express.d.ts`: `{ id, role, organizationId }`. `organizationId` is `string | null`; controllers must runtime-check via `requireOrgId`.
- Routes mount under `API_PREFIX` (`/api/v1`) from `@application/shared`.
- Zod validates all inputs. `middleware/validate.ts` replaces `req.body`/`query`/`params` with parsed values.
- Errors use `ApiError` from `utils/errors.ts`. `errorHandler` maps `ZodError` → 400, `ApiError` → status code, else 500 (message hidden in prod).
- Logging: pino-http with `reqId` and `x-request-id`.

## Env & Config

- `packages/server/src/config/env.ts` validates env with Zod and exits on failure. Add new vars there.
- Dev `.env` required at repo root AND `packages/server/.env`.
- `scripts/init-db.sql` installs `uuid-ossp`, `pgcrypto`, and `postgis` extensions; creates `app_user` (NOLOGIN, group role), `app_user_login` (LOGIN, IN ROLE app_user), and `auth_svc_role` (LOGIN, BYPASSRLS); sets default privileges on sequences and tables for app_user. Auth table REVOKEs are in migration `0001_clumsy_bloodstrike.sql` (tables don't exist at init time). Runs on every Docker container start before migrations.

## Async Jobs

- `@aws-sdk/client-sqs` handles email jobs. Falls back to synchronous in dev when `SQS_QUEUE_URL` is unset.
- `enqueuePdfJob` exists in `packages/server/src/queues/sqs.client.ts` but is **not wired up yet**. PDF generation is currently synchronous in `report.controller.ts`.
- No BullMQ workers exist. SQS workers are external.

## Tests

- No test runner configured at root. Server has `vitest` with `npm run test` / `test:watch` / `test:coverage`, but no test files exist yet.
