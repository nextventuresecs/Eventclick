# Maintainers need to answer "who is this user?" without being able to browse everyone

**Status:** in progress — code complete, awaiting review
**Touches:** `packages/shared/src/ops.ts`, `packages/shared/src/index.ts`, `packages/server/src/ops/{mask,search,lookup}.ts`, `packages/server/src/ops/routes/{search,users,orgs}.ts`, `packages/server/src/ops/app.ts`, `packages/ops/src/**`, `packages/e2e/**`
**Ships with:** `feat/ops-lookup` — closes #148 (epic #142)

---

## 1. What the code does today

After #147 the Ops Console authenticates maintainers and answers one route,
`GET /ops-api/v1/whoami`, through `respondAudited` (`packages/server/src/ops/audit.ts`):
read, write a `maintainer_access_log` row, then respond, and withhold the
response if the row cannot be written. The read pool connects as
`maintainer_ro_login`, which migration 0013 grants SELECT on named columns
only: `users` (no `password_hash`, `google_id`), `organizations`, `org_members`,
`sessions` (no IP or user agent), `event_rooms`, and `maintainer_access_log`.

When a customer reports "user X is broken", a maintainer still has to go to
psql as the database owner. That read is unaudited, unmasked, and has access to
every column including credentials.

The only tenant-side equivalent, `listOrgUsers` in
`packages/server/src/controllers/admin.controller.ts`, is scoped to one org by
RLS, returns raw emails, and serves org admins. It is correct for its audience
and wrong for this one, so it is not reused.

## 2. What I am changing, and why

The first endpoints that return customer personal data. The design keeps the
blast radius of a curious or compromised maintainer session small:

- **Exact match only.** Search accepts a full email, a user or org UUID, an org
  slug, or a request id. No `LIKE`, prefixes or similarity. Without this, one
  search box is an enumeration tool.
- **Masked by default, server-side.** Emails become `ja***@e***.org`, names
  become `J. D.`, and raw values never leave the server except from the unmask
  route. Masking in the browser would still ship the raw value.
- **Unmask per record with a written reason**, recorded in the access log, 20
  per maintainer per rolling hour counted from that log. A rejected unmask
  writes no row, because it returned nothing.
- **Every search and view is audited**, including zero-result searches. The
  search term is stored only as `sha256(lower(q))`, so the log does not become
  a second copy of the emails people looked up.

**Endpoints** (all behind `requireMaintainer`, all through `respondAudited`):

| Route | Audit |
|---|---|
| `GET /ops-api/v1/search?q=` | `search`, `query = { kind, qSha256 }`, `result_count` |
| `GET /ops-api/v1/users/:id` | `user.view`, target user, the user's organisation |
| `POST /ops-api/v1/users/:id/unmask` | `user.unmask`, target user, `reason` |
| `GET /ops-api/v1/orgs/:id` | `org.view` |
| `GET /ops-api/v1/orgs/:id/users?cursor=&limit=` | `org.users.list`, `result_count` |

**Search classification** (`ops/search.ts`, pure): UUID → user and org by id;
contains `@` → user by exact email; otherwise a string can be an org slug, a
request id, or both. Most lowercase slugs are also valid request ids, so the
issue's "slug first, request hint only on a miss" is the common path, not an
edge case: the classifier returns `slugOrRequest` and the route settles it
against the database. A request id is never looked up; it is returned as a
hint for log search (#150).

**SQL** (`ops/lookup.ts`): one query per view. Session counts are a `LATERAL`
aggregate, so a 50-user page is one statement against a 2-connection pool with
a 5s statement timeout. Org membership is `users.organization_id` UNION
`org_members`, deduplicated **before** keyset pagination on
`(created_at, id)`; paginating each path separately repeats or drops users at
page edges. The cursor carries `created_at::text`, because timestamptz has
microseconds and a JS `Date` has milliseconds.

**Unmask limit**: counted from `maintainer_access_log` on the read pool
(`maintainer_ro` can SELECT it) before `respondAudited`, so a refused call
writes no row. Count-then-insert is serialised per maintainer inside the
process, so parallel requests cannot race past 20; one ops-server instance is
already assumed (ADR 0002).

**Supporting changes**: `respondAudited` reads may return audit fields only
they know (the target user's organisation); the ops error handler maps
`ZodError` to 400 `VALIDATION_ERROR` and a `status: 404` error to `NOT_FOUND`
with no audit row.

**UI** (`packages/ops`): search box in the header, results page, masked user
page with memberships and an Unmask dialog (reason 10-500 with a live counter),
org page with paginated users. Unmasked values live in the user page's
component state, keyed by user id, so they vanish on navigation, reload or
unmount. No export, CSV or copy-all control.

## 3. What this affects

- **Personal data leaves ops-server for the first time**, masked. Raw values
  only from `POST /users/:id/unmask`. A maintainer session can view any user by
  exact identifier; it cannot list users except within one org page.
- **Access log volume:** one row per search, view, page of org users and
  unmask. At 3-5 maintainers this is small; the 365-day retention (epic
  follow-up) covers it.
- **Tenant server:** untouched. `@application/shared` gains `ops.ts`; the
  client does not import it.
- **Definitions a reader might assume differently:** `memberCount` and
  `roleCounts` exclude soft-deleted users (the org users list includes them,
  with a Deleted badge); a member's role is their `org_members` role when that
  row exists, else `users.role`; a primary organisation with no `org_members`
  row appears in memberships with the user's `created_at` as `joinedAt`.
- **How we would know it broke:** the integration suite
  (`ops-lookup.integration.test.ts`) scans every response for fixture emails
  and names made of random tokens, so any leak fails CI; `search` rows with no
  matching page views would show a UI regression; 429 `UNMASK_LIMIT` in
  `ops-server` logs shows the limit biting.

**Deviations from the issue text**

- The header drops the disabled **Users** placeholder: users are reached
  through search and org pages, so a "Users" item that can never list users
  would suggest a directory that deliberately does not exist. Health and Logs
  stay as placeholders for #149 and #150.
- Search classification order is UUID → email → slug → request hint, which is
  what the issue's tie-break sentence requires; its numbered list reads as if
  the request-id rule came before the slug lookup.

**Verification**

- Server: 523 tests, including 8 integration tests for criteria 1-11 on a
  migrated database as the real maintainer roles; `tsc`, eslint 0 errors.
- The tests can fail: returning the raw name from `toMaskedUser`, allowing a
  21st unmask, and dropping the `org_members` branch from pagination each
  turned the matching tests red.
- Ops frontend: 14 tests (unmask validation, values cleared on unmount, limit
  message, empty search), typecheck, lint, build; criterion 13's grep finds
  nothing under `packages/ops/src`.
- Playwright `ops` project: 3 tests including search → masked user → unmask →
  navigate away → masked again.
- Root turbo lint/typecheck/build and `npm audit --audit-level=high` green.

## 4. What to learn from this

- **Enumeration resistance is a property of the query shape.** Exact match on
  an identifier the caller must already know turns a search box from a
  directory into a lookup. To spot the opposite elsewhere: any admin search
  using `LIKE '%…%'`, `ILIKE` or a prefix index over personal data.
- **Mask at the source, not the view.** If the browser masks, the raw value is
  in the network response, the devtools, and every proxy log.
- **Dedupe before you paginate.** A keyset cursor over a UNION is only stable
  if the UNION happens first and the cursor carries the column's full
  precision; per-branch pagination or a millisecond cursor over microsecond
  timestamps both silently skip or repeat rows.
- **Rate limits that must be auditable can live in the audit log.** Counting
  from the append-only log means the limit and the evidence cannot disagree;
  serialise the check and the write, or concurrency defeats it.
