# The last unbounded list query

**Status:** shipped
**Touches:** `packages/server/src/services/admin.service.ts`, `packages/server/src/controllers/admin.controller.ts`, `packages/shared/src/index.ts`, `packages/client/src/lib/api.ts`, `packages/client/src/pages/AdminUsers.tsx`
**Ships with:** `feat/paginate-org-users` — closes #89

---

## 1. What the code does today

```ts
export const listOrgUsersForAdmin = async (orgId: string): Promise<OrgUserSummary[]> => {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)))
    .orderBy(users.fullName);
  return rows.map(toOrgUser);
};
```

Every non-deleted user in the organisation, no limit, no offset — and
`select()` with no projection, so every column of every row. Room listing and
attendance listing are both already bounded; this was the last one that was
not.

For a large tenant that is a slow query and a very large JSON response, on an
endpoint an admin hits on every visit to the users screen.

There is a second problem, quieter than the first and only reachable once
paging exists: **`orderBy(users.fullName)` is not a total order.** Names are
not unique. With a non-unique sort key Postgres is free to return tied rows in
a different order from one query to the next, so under `LIMIT`/`OFFSET` a user
sharing a name with another can appear on two consecutive pages while a
different user never appears at all. Adding pagination without fixing this
would have introduced a data-correctness bug that only shows up at scale.

## 2. What I am changing, and why

**`limit`/`offset` with a default and a hard maximum**, matching the
audit-log shape from #91 — `{ items, total, limit, offset }`. The two admin
listings should page the same way so the client handles them with one mental
model, and #91's doc explicitly noted that this ticket would mirror whatever
convention it set.

**Ordering becomes `(fullName, id)`.** The `id` tiebreaker makes the order
total, which is what makes paging safe: ties are broken the same way on every
query, so no row can be skipped or repeated between pages.

**Query parameters are parsed in the controller**, not by
`validate(schema, "query")` — Express 5 exposes `req.query` through a getter
that re-derives the object, so the middleware's assignment is silently
discarded. That was established in #91 and `validate.ts` carries the warning.

**The client walks every page**, and this deserves its reasoning stated.
`AdminUsers.tsx` runs its search and role filters **client-side** over the
list it holds. Capping the fetch at one page would mean an admin searching for
a real user finds nothing and reasonably concludes the user does not exist —
trading a performance problem for a correctness one. So `listAllUsers` pages
through until it has the set, bounded by a page cap so a pathological tenant
cannot loop indefinitely.

The endpoint is now bounded, which is what the issue actually asked for: no
single query scans an unbounded number of rows, and no single response is
unbounded. The screen still assembles the full list because its search
requires it. **Moving search server-side is the change that would let this
fetch one page, and it is deliberately not this one** — it is a different
feature with its own UX decisions.

## 3. What this affects

**The response shape changed** from `{ items }` to
`{ items, total, limit, offset }`. `items` is unchanged, so the existing
client field keeps working; the new fields are additive.

**The admin users screen now issues one request per 200 users** instead of one
request for all of them. For the organisations this product serves today that
is one request, exactly as before. For a tenant with 1,000 users it is five
bounded requests rather than one enormous one — more round trips, but no
single slow query and no multi-megabyte response.

**`select()` still fetches every column.** Narrowing the projection is a
separate, safe improvement that would change `toOrgUser`'s input type; it is
not part of this change.

**How we would know it broke.** Open the admin users screen for an
organisation with more than 200 users and confirm every user is listed and
search still finds someone near the end of the alphabet. Two users with
identical `fullName` should both appear exactly once — that is the ordering
fix, and it is the case that would silently misbehave without the tiebreaker.

## 4. What to learn from this

**Adding `LIMIT`/`OFFSET` to a non-total ordering creates a correctness bug
out of a performance fix.** Pagination assumes a stable, deterministic order;
a sort on a non-unique column does not provide one, and the database is under
no obligation to be consistent about ties between queries. The rule is that
every paginated query needs a tiebreaker on something unique — usually the
primary key — and the symptom of getting it wrong is a user who "sometimes
disappears from the list", which is nearly impossible to reproduce on demand.

**Bounding an endpoint and bounding a screen are different problems.** It is
tempting to treat "add pagination" as done once the API is paginated, but a
client that filters locally has a hard requirement for the whole set, and
quietly capping it turns a slow screen into a lying one. Either the filtering
moves to the server or the client pages through — both are defensible, and the
choice should be made explicitly rather than falling out of whichever layer
was edited.

**Follow the convention the last similar change set.** The audit-log listing
and this one now share a response shape, so the client's handling, the
defaults, and the caps are all learned once. A second, subtly different
pagination style would have cost more in the long run than the query it saved.
