# The audit trail accumulates where nobody can see it

**Status:** shipped
**Touches:** `packages/server/drizzle/0011_audit_logs_read_index.sql`, `packages/server/src/db/schema/auditLogs.ts`, `packages/server/src/services/audit.service.ts`, `packages/server/src/controllers/admin.controller.ts`, `packages/server/src/routes/admin.routes.ts`, `packages/shared/src/index.ts`, `packages/client/src/lib/api.ts`, `packages/client/src/pages/AdminAuditLog.tsx`, `packages/client/src/App.tsx`
**Ships with:** `feat/audit-log-read-path` — closes #91

---

## 1. What the code does today

The write half is built and correct. `audit_logs` has tenant isolation
expressed as RLS policies:

```ts
// packages/server/src/db/schema/auditLogs.ts
pgPolicy("audit_logs_tenant_isolation", {
  for: "select",
  to: "app_user",
  using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
}),
pgPolicy("audit_logs_insert_only", { for: "insert", ... }),
```

and `recordAudit` writes actor, action, resource, before/after values and
request metadata. Two call sites use it: `user.deleted` in
`admin.service.ts`, and `user.updated` for a GDPR data export in
`profile.routes.ts`.

**Nothing reads it.** There is no endpoint, no query function, no interface.
The records go into a table that only a database client can open.

For a product whose output is verifiable attendance evidence, that is an
unusual gap: the audit trail is close to being the product, and "who changed
this, and when" currently requires production database access to answer.

**There is also no index.** The table was created in `0000_slow_firestar.sql`
with a primary key and its two RLS policies, and nothing since has added one:

```
$ grep -rn "audit_logs" packages/server/drizzle/*.sql | grep -i index
(no matches)
```

So the query this feature needs — one organisation's rows, newest first —
would be a sequential scan plus a sort over the whole table, on every page
view, growing with the audit history of *every* tenant rather than just the
one asking.

## 2. What I am changing, and why

**An index first, because it is the acceptance criterion application code
cannot satisfy.**

```sql
CREATE INDEX IF NOT EXISTS "audit_logs_org_created_idx"
  ON "audit_logs" ("organization_id", "created_at" DESC);
```

That composite is exactly the shape of the query: filter by organisation,
order by time descending. Filters on `actor_user_id` and `action` are
lower-cardinality and ride the same scan rather than needing their own
indexes — worth revisiting only if an organisation's history grows large
enough for the filtered cases to matter.

**A `listAuditLogs` query beside `recordAudit`**, with filters for actor,
action, resource and date range, `LIMIT`/`OFFSET` pagination and a total
count.

**Tenant isolation is left to RLS, not re-implemented in the query.** The
query runs through `db` — the tenant-scoped proxy — so
`audit_logs_tenant_isolation` filters it. Adding `WHERE organization_id = ?`
as well would work today and would quietly become the *only* protection if
someone later ran this from a background context where RLS is not applied.
Relying on the policy keeps one mechanism rather than two that can disagree.

**Offset pagination, deliberately, not a cursor.** It matches
`listOrgUsersForAdmin`'s existing shape, and #89 (pagination for the org user
listing) is still open — the convention set here is the one that ticket will
mirror. A cursor is a different API contract and would need justifying on its
own; at this scale the index plus `LIMIT`/`OFFSET` is enough.

**`oldValues` / `newValues` are parsed defensively.** Those columns are
`text` holding `JSON.stringify` output rather than `jsonb`, so a malformed or
truncated value is possible. Each row is parsed inside a `try` and falls back
to `null`, so one bad row cannot 500 the whole page. Changing the column type
is a migration with a backfill and is out of scope here.

**Query parameters are parsed in the controller, not by `validate(schema,
"query")`.** That middleware cannot work for query strings under Express 5:
`req.query` is exposed through a getter that re-derives the object, so both
assignment and in-place mutation are silently discarded — the handler goes on
reading raw, uncoerced strings with no error anywhere. Both were verified
against express 5.2.1 before choosing this. `validate.ts` now carries a warning
so the next person does not lose an afternoon to it; `"body"` and `"params"`
are unaffected.

**An admin-only endpoint and a page.** `requireRole("admin")` matches
`/admin/users`; `AdminAuditLog.tsx` follows `AdminUsers.tsx`'s conventions.

**Only the two existing actions are covered**, which is what the issue asks
for. Wiring the remaining eight is #92, and it is sequenced after this one
precisely so each newly wired action is immediately verifiable instead of
being written into a black box.

## 3. What this affects

**A new read path over data that has never been read.** The two recorded
actions have been accumulating rows since the audit service shipped, so the
first page load is also the first time anyone sees them — including any rows
whose `oldValues` were written by code that has since changed shape. The
defensive parse exists for that.

**Query cost is bounded by the index, not by the endpoint.** Without
`audit_logs_org_created_idx` this endpoint would degrade for every tenant as
any tenant's history grew, which is the failure mode worth naming: the slow
query would not be caused by the organisation experiencing it.

**Creating the index locks the table briefly.** `CREATE INDEX` without
`CONCURRENTLY` takes a share lock that blocks writes for the duration. On a
table this size that is milliseconds, and it runs inside the migration where
the application is already being restarted — `CONCURRENTLY` cannot run inside
a transaction and drizzle wraps migrations in one, so the simple form is both
correct here and the only one available.

**Nothing changes for non-admins.** The endpoint is admin-only and the page is
not linked for other roles.

**How we would know it broke.** As an admin, delete a user and export your own
data, then open the audit page and confirm both entries appear newest-first
with actor, action, resource and timestamp. Filter by action and by date range.
Then sign in as a non-admin and confirm the endpoint 403s. The cross-tenant
case is covered by test rather than by hand, since it needs two organisations.

## 4. What to learn from this

**A write path with no read path is not a feature, it is a liability.** It
costs storage and it creates the belief that the question can be answered,
while the answer stays inaccessible. Audit logs, event streams and metrics all
fail this way: the instrumentation is the easy half, and the value is entirely
in whether anyone can get it back out. When reviewing "we log that", the useful
question is "and where does someone read it?"

**Indexes are part of a read feature, not an optimisation to add later.** An
endpoint's query shape and the index supporting it are the same design
decision, made at the same time. Adding "list this table" over a table with no
index on its filter or sort columns produces something that works in
development and degrades in proportion to *total* rows rather than the caller's
own data — which is the worst kind of scaling problem, because the tenant that
feels it is not the tenant that caused it.

**Prefer one enforcement mechanism over two that can drift.** RLS already
scopes this table; adding a redundant `WHERE organization_id = ?` would look
like defence in depth and behave like a second source of truth. Two mechanisms
agreeing today is not the same as two mechanisms that must agree — and the one
that gets forgotten is always the one not exercised by the current call path.
