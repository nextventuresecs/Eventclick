# Maintainer data access is enforced by Postgres grants, not application code

**Status:** accepted, 2026-09-14 (#146, epic #142)

## Context

The Ops Console reads across tenants for NVCES maintainers. It must never
expose credentials or customer content, and every read must be recorded in a
log the reader cannot alter.

## Decision

- Maintainer reads run as `maintainer_ro_login` (member of `maintainer_ro`):
  BYPASSRLS, SELECT-only, **column-level grants**. Anything not granted in
  `drizzle/0013_ops_console_foundation.sql` fails with SQLSTATE 42501.
- Access-log writes run as `maintainer_audit_login` (member of
  `maintainer_audit_writer`): INSERT on `maintainer_access_log`, nothing else.
- `maintainer_access_log` is append-only for **every** role, owner included,
  via a trigger.
- Neither credential is held by the tenant `server` process.

## Consequences

- A new column or table is invisible to the Ops Console until a migration
  grants it. Showing new data is a reviewed schema change, not a code change.
- Column grants mean `SELECT *` fails on partially granted tables; Ops Console
  queries must name columns.
- The 365-day log purge needs its own migration replacing the trigger function.
- Grant correctness is tested against a live database in CI
  (`ops-db-grants.integration.test.ts`), which fails rather than skips there.
