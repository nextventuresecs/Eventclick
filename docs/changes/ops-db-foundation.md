# Maintainers need a cross-tenant read path that cannot leak secrets or rewrite history

**Status:** code complete; production login roles pending two SSM parameters
**Touches:** `packages/server/drizzle/0013_ops_console_foundation.sql`, `packages/server/src/db/schema/{maintainers,maintainerAccessLog}.ts`, `packages/server/src/scripts/maintainers.ts`, `scripts/init-db.sql`, `scripts/deploy.sh`, `scripts/fetch-secrets.sh`, `.env.example`, `.env.production.example`
**Ships with:** `feat/ops-db-foundation` — closes #146 (epic #142)

---

## 1. What the database allowed

Every application role is tenant-bound by design. `app_user` is filtered by RLS
on every table; `auth_svc_role` bypasses RLS but is reserved for identity work.
There was no role that could answer "what happened to user X in org Y" for an
NVCES maintainer, and no maintainer identity at all.

Two traps sat next to that gap:

- **Default privileges.** `0003_rls_privileges_converge.sql` and `deploy.sh`
  both run `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES TO app_user` (and to `auth_svc_role` in `deploy.sh`). Any new
  table is readable and writable by both tenant roles unless revoked.
- **Missing drizzle snapshots.** `drizzle/meta` stops at `0010_snapshot.json`;
  0011 and 0012 were hand-written. `npm run db:generate` diffs against 0010 and
  would re-emit `legal_hold` and `audit_logs_org_created_idx` without
  `IF NOT EXISTS`, failing on every database that already has them.

## 2. Why it matters

The Ops Console (#147 onward) is the highest-risk surface in the system: one
process that can see every tenant's users. If "read-only, no secrets" lived in
application code, one careless `SELECT *` would expose `password_hash`,
`token_hash`, or attendance content. If the access log lived in a table the
reader could update, it would record only what the reader chose to leave.

## 3. What changed

**Two tables, no RLS, grants only.** `maintainers` (managed by CLI) and
`maintainer_access_log` (every maintainer read). A trigger raises
`maintainer_access_log is append-only` on UPDATE, DELETE and TRUNCATE for every
role, including the owner, which grants alone cannot bind.

**Two NOLOGIN group roles.**
- `maintainer_ro`: BYPASSRLS, SELECT on listed columns of ten tables plus both
  new tables. `password_hash`, `google_id`, `token_hash`, session IP and user
  agent, attendance content and location, email recipients and payloads, and
  every unlisted table are unreadable (SQLSTATE 42501).
- `maintainer_audit_writer`: INSERT on `maintainer_access_log`, nothing else.

**Default-privilege hole closed** for the two new tables only: `REVOKE ALL`
from `PUBLIC`, `app_user` and `auth_svc_role` (the latter guarded on existence,
as 0003 does).

**Login roles outside migrations.** `maintainer_ro_login` (LOGIN BYPASSRLS; role
attributes are not inherited through membership) and `maintainer_audit_login`.
`init-db.sql` creates them with dev defaults `local_dev_maint_ro` /
`local_dev_maint_audit`. `deploy.sh` creates the group roles if absent (its
role block runs before `migrate`), then creates or re-passwords the login roles
from `MAINTAINER_RO_DB_PASSWORD` / `MAINTAINER_AUDIT_DB_PASSWORD`, passed as
psql variables rather than interpolated into SQL.

**CLI.** `npm run ops:maintainers --workspace=server -- add|reactivate|deactivate|list`,
or `node packages/server/dist/scripts/maintainers.js` in the prod image. Uses
`DATABASE_URL` directly; does not import `config/env`, which exits without the
tenant runtime variables. Exit 0 ok, 1 refused, 2 usage.

## 4. What did not change, and why

- **The migration is hand-written, not generated,** because of the snapshot
  gap above. The schema files mirror the DDL for types only.
- **Missing SSM parameters warn instead of failing the deploy.** Nothing
  connects as the maintainer login roles until #147 ships; blocking every
  deploy on two unused secrets would be worse. They are not in
  `fetch-secrets.sh`'s `REQUIRED_KEYS` for the same reason. Add them to SSM
  before #147.
- **`scripts/init-db.sh` (prod first-boot) is untouched.** It only runs on an
  empty data directory; `deploy.sh` converges roles on every deploy.
- **`ci.yml` is untouched.** CI sets no maintainer passwords, so `init-db.sql`
  uses the dev defaults and the integration test uses the same defaults.
- **No purge path for the log.** The 365-day retention purge (epic follow-up)
  must replace the trigger function in its own reviewed migration. There is no
  session-setting bypass, because any role able to set it could erase evidence.
- **Existing default privileges for `app_user` / `auth_svc_role` stay.**

## 5. Verification

- **Integration** (`src/__tests__/ops-db-grants.integration.test.ts`): connects
  as the real login roles and covers acceptance criteria 1-12 and 14-15, plus a
  positive check that every granted column is selectable. Skips without a
  database locally; **fails under `CI`** instead of skipping, so a broken role
  setup cannot pass as green.
- **The tests can fail:** granting `password_hash` to `maintainer_ro`, granting
  `app_user` SELECT on `maintainers`, and dropping the truncate trigger turned
  4 tests red; reverting turned them green.
- **Idempotency:** on a throwaway `postgis/postgis:16-3.4-alpine`, `init-db.sql`
  ran twice, `db:migrate` ran twice, and the test replays the 0013 file twice in
  a rolled-back transaction (the migrator alone never re-runs a journaled file).
- **Unit** (`src/scripts/__tests__/maintainers.test.ts`): argument parsing,
  normalization, exit codes, the unique-violation race.
- Full server suite (444 tests), `tsc --noEmit`, eslint (0 errors) and
  `scripts/rls-live-test.sql` pass against the migrated database.
- **Not run locally:** Playwright e2e (criterion 16) — CI runs it.

## 6. Learnings

- Grants do not bind a table's owner. Anything that must hold "for everyone"
  needs a trigger, and the owner is exactly the role migrations, deploys and
  operator CLIs connect as.
- Postgres reports a grant failure and a trigger's `ERRCODE = '42501'`
  identically. Tests that mean "the trigger refused" must assert on the message.
- An integration test that skips when it cannot connect is a convenience
  locally and a hole in CI. Decide which one each suite is.
