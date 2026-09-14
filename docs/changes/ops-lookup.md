# Maintainers need to answer "who is this user?" without being able to browse everyone

**Status:** in progress
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

Details are filled in as the code lands.

## 3. What this affects

To be completed with the change.

## 4. What to learn from this

To be completed with the change.
