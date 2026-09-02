# SSE stream holds a database connection open forever

**Status:** planned
**Touches:** `packages/server/src/middleware/tenantContext.ts`, `packages/server/src/routes/notification.routes.ts`, `packages/server/src/controllers/notification.controller.ts`
**Ships with:** `fix/sse-tenant-connection-leak`

---

## 1. What the code does today

### The background: why we pin a connection at all

This app is multi-tenant. Every organisation's data lives in the same tables,
and Postgres **Row Level Security (RLS)** is what stops one organisation from
seeing another's rows. Look at any schema file and you will see the policy:

```ts
// packages/server/src/db/schema/eventRooms.ts:71
using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
```

In plain words: "only return rows where `organizationId` matches the setting
called `app.current_tenant`." So before any query runs, something has to *set*
that value for the current user's organisation.

Here is the catch. We set it with `SET LOCAL`, and **`SET LOCAL` only lasts for
one transaction on one connection**. We also use a connection *pool* — a small
set of reusable database connections shared by all requests. If you set the
tenant and then release the connection, the next request might grab that same
connection and either lose the setting or, much worse, inherit someone else's.

So `tenantContext.ts` does the only safe thing: it takes one connection out of
the pool, starts a transaction, sets the tenant on it, and **holds that exact
connection for the whole request**.

```ts
// packages/server/src/middleware/tenantContext.ts:31-56 (abridged)
let client: PoolClient;
client = await pool.connect();          // take a connection out of the pool

await client.query("BEGIN");             // start a transaction
await client.query(
  "SELECT set_config('app.current_tenant', $1, true), set_config('app.current_user_id', $2, true)",
  [orgId, userId]
);

// ... the request runs ...

res.on("finish", () => void cleanup(true));   // COMMIT + release on response end
res.on("close",  () => void cleanup(res.writableFinished));
```

This is correct, and the comments in that file explain the reasoning well. For
a normal request — arrives, queries, responds in 50ms — the connection is
borrowed for 50ms and handed back.

It is registered as **app-level** middleware, so it runs for every
authenticated request:

```ts
// packages/server/src/index.ts:178-180
app.use(attachUser);
app.use(setTenantContext);
app.use(API_PREFIX, apiRouter);
```

### The problem: one route is not a normal request

`GET /api/v1/notifications/stream` is a **Server-Sent Events** endpoint. SSE is
a long-lived HTTP response that never ends — the server keeps the response open
and writes new lines into it whenever there is something to send.

```ts
// packages/server/src/controllers/notification.controller.ts:46-80 (abridged)
export const streamNotifications = async (req: Request, res: Response) => {
  const userId = req.user!.id;

  req.setTimeout(0);                     // never time this request out

  res.setHeader("Content-Type", "text/event-stream");
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
  }, 30000);

  const unsubscribe = pubsub.subscribe(`notifications:${userId}`, (message) => {
    res.write(`data: ${message}\n\n`);
  });

  req.on("close", () => { clearInterval(keepAlive); unsubscribe(); });
};
```

Put the two together and the response never finishes, so `res.on("finish")`
never fires, so the connection is never returned to the pool. **The browser tab
stays open for four hours, and so does the database connection — with an open
transaction sitting on it.**

The pool is small:

```ts
// packages/server/src/db/index.ts:7-11
export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,          // defaults to 10
  idleTimeoutMillis: 30_000,
});
```

**Ten open browser tabs use up all ten connections.** Every request after that
waits for a connection that will not be returned until someone closes a tab.

There is a second, quieter problem. Each of those held connections is sitting
`idle in transaction`. Postgres cannot fully vacuum tables while an old
transaction is still open, because that transaction might still need to see the
old row versions. So dead rows accumulate, tables bloat, and queries across the
whole database slowly get worse — not just for the notification feature.

---

## 2. What I am changing, and why

**Skip the tenant middleware for the SSE route.**

The SSE handler needs exactly two things: `req.user.id`, which `attachUser` has
already put there, and Redis pub/sub. **It runs no database query at all.** So
it does not need RLS, which means it does not need a pinned connection or a
transaction.

The change is to make `setTenantContext` step aside for that one path:

```ts
// packages/server/src/middleware/tenantContext.ts — in setTenantContext
export async function setTenantContext(req, res, next) {
  const orgId = req.user?.organizationId;
  if (!orgId) return next();

  // Long-lived streaming responses must never pin a pooled connection:
  // the response does not end, so the connection would never be released.
  // This handler runs no tenant-scoped query — see notification.controller.ts.
  if (req.path === "/notifications/stream") return next();

  return runInTenantContext(req, res, next, orgId, req.user?.id ?? "");
}
```

Matching on a path string is fragile if the route ever moves, so the safer
version is to mount the SSE route on its own router *before* `setTenantContext`
runs, or to set a flag on the request in the route definition and check for
that. Either is fine; the important part is that the decision is **explicit and
commented**, so the next person does not quietly undo it.

Why this fix rather than "raise `DB_POOL_MAX`": raising the pool only moves the
cliff. Twenty connections means twenty tabs. The pool is not the problem — a
never-ending request holding a pooled resource is the problem.

---

## 3. What this affects

**What gets better**

- The connection pool stops being consumed by idle browser tabs. Ten tabs used
  to mean zero connections left; now it means zero connections used.
- No more long-lived `idle in transaction` sessions, so autovacuum can do its
  job again.
- Requests stop hanging behind a pool that never frees up.

**What could break — read this part carefully**

The SSE handler will now run **outside** any tenant context. If someone later
adds a database query to `streamNotifications` — say, "send the user's unread
count when they connect" — that query will run on the base pool with **no
`app.current_tenant` set**. The RLS policies will match nothing, and the query
will silently return **zero rows**. No error, no exception, just empty results.

This is the main risk of the change, and it is why the code comment matters
more than the code. Anyone adding a query there must either fetch it before the
stream opens (in a normal request) or explicitly open and close its own tenant
context.

**What is unaffected**

- Notification *delivery* is untouched. Fan-out already goes through Redis
  pub/sub (`services/pubsub.service.ts`), not the database.
- Every other route keeps its tenant context exactly as before.
- No schema change, no migration, no API contract change. The client does not
  need to know anything happened.

**How we would know if it broke**

- Open the app, trigger a notification, confirm it still appears live without
  a page refresh. That is the whole feature, end to end.
- Before and after: open 15 tabs, then run
  `SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction';`
  Before the fix that number climbs with tab count. After, it should stay at
  or near zero.
- Once item 0.3 lands (pool acquisition timeout), a regression would show up
  as an explicit "Failed to acquire tenant connection" log line instead of a
  silent hang.

---

## 4. What to learn from this

**The concept: pooled resources and long-lived requests do not mix.**

A connection pool works on one assumption — that whatever you borrow, you give
back quickly. Every pool in every language works this way: database
connections, HTTP client sockets, worker threads. The moment one caller holds a
borrowed resource indefinitely, the pool stops being a pool and becomes a
countdown.

The related concept is **transaction-scoped session state**. `SET LOCAL`,
`SET ROLE`, temporary tables, advisory locks held in-transaction — all of them
are tied to one connection *and* one transaction. That is exactly why the
middleware had to pin the connection in the first place. The pinning was not a
mistake; applying it to a route that never ends was.

**How to spot this elsewhere.** Whenever you see middleware applied globally
with `app.use(...)`, ask: *is there any route under this that behaves
differently from all the others?* The usual suspects are the ones that do not
finish quickly —

- SSE and WebSocket endpoints
- file downloads and uploads that stream
- long-polling endpoints
- anything that calls `req.setTimeout(0)` or `res.flushHeaders()`

If you find `setTimeout(0)` anywhere, trace back through every piece of
middleware that request passes through and ask what each one is holding. That
one line is a reliable marker for "this request breaks the assumptions
everything upstream was written under".

**The wider habit:** global middleware is convenient because you write it once
and it covers everything. The cost is that it also covers the routes you were
not thinking about. When you add global middleware, spend one minute listing
the routes that do *not* fit the pattern — and write that list down in a
comment.
