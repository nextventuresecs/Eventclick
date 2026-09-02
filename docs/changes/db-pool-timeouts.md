# The database pool has no timeouts, so failures look like hangs

**Status:** shipped
**Touches:** `packages/server/src/db/index.ts`, `packages/server/src/config/env.ts`, `packages/server/src/jobs/dataRetention.ts`, `packages/server/src/jobs/sessionCleanup.ts`, `.env.example`
**Ships with:** `fix/db-pool-timeouts` — closes #80

---

## 1. What the code does today

Two connection pools are created at startup:

```ts
// packages/server/src/db/index.ts:7-19
export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,          // defaults to 10
  idleTimeoutMillis: 30_000,
});

export const authPool = env.AUTH_DATABASE_URL
  ? new Pool({
      connectionString: env.AUTH_DATABASE_URL,
      max: Math.max(2, Math.floor((env.DB_POOL_MAX || 10) / 2)),
      idleTimeoutMillis: 30_000,
    })
  : pool;
```

`idleTimeoutMillis` is set, and it is worth being clear about what that one
does: it closes connections that are **sitting unused**, to avoid holding open
sockets you do not need. It is a housekeeping setting. It does nothing at all
when the pool is *busy*.

What is missing is `connectionTimeoutMillis` — **how long a caller will wait
for a connection to become free**. With no value set, the `pg` library's answer
is "wait forever".

Here is where that lands:

```ts
// packages/server/src/middleware/tenantContext.ts:31-38
let client: PoolClient;
try {
  client = await pool.connect();
} catch (error) {
  req.log?.error({ error, orgId }, "Failed to acquire tenant connection");
  return next(ApiError.internal("Database unavailable"));
}
```

Someone wrote a proper error path here, with a clear log message and a comment
explaining that it is the only place the real cause is recoverable. It is good
code. **It just never runs**, because `pool.connect()` does not reject when the
pool is full — it waits.

So when all ten connections are taken (see
[`sse-tenant-connection-leak.md`](./sse-tenant-connection-leak.md) for how that
happens), request eleven does not fail. It waits. Silently. Until Express gives
up on it:

```ts
// packages/server/src/config/env.ts:105
SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
```

Thirty seconds later the socket is closed. The user sees a spinner and then
nothing. The logs show a request that started and never finished, with **no
line anywhere saying why**. During UAT this gets reported as "the app is
sometimes slow", which is the least actionable bug report there is.

There is a matching gap on the database side. Postgres has two settings we do
not set:

- `statement_timeout` — the maximum time a single query may run.
- `idle_in_transaction_session_timeout` — the maximum time a transaction may sit
  open doing nothing.

Without them, one stuck query or one leaked transaction holds its connection
until someone notices manually.

---

## 2. What I am changing, and why

**Give every wait a deadline.**

```ts
// packages/server/src/db/index.ts
export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  // Fail fast when the pool is exhausted. Without this, pool.connect()
  // waits forever and the caller's error path never runs — the request
  // just hangs until the server request timeout closes it, with nothing
  // in the logs explaining why.
  connectionTimeoutMillis: 5_000,
});
```

The same setting goes on `authPool`.

**The statement timeouts moved off `ALTER ROLE`, and off `init-db.sql`.**

This doc originally put them in `scripts/init-db.sql`. That file's own header
argues against it, and it is right:

> Docker runs everything in /docker-entrypoint-initdb.d exactly ONCE, when the
> data directory is empty. [...] Table privileges for app_user live in
> 0003_rls_privileges_converge.sql for exactly this reason — a production
> cluster once ran for months without them because they were added here
> instead.

An existing cluster would never have received them. The obvious correction is
a migration — but `ALTER ROLE <other role> SET ...` requires superuser in
PG15+, and the migration credential (`DATABASE_URL`) is not guaranteed to hold
that. A migration that silently cannot apply is no better than a bootstrap file
that never runs.

So the timeouts are set **per connection, on the runtime pools**:

```ts
// packages/server/src/db/index.ts
const sessionOptions = [
  `-c statement_timeout=${env.DB_STATEMENT_TIMEOUT}`,
  `-c idle_in_transaction_session_timeout=${env.DB_IDLE_TX_TIMEOUT}`,
].join(" ");
```

passed as `options` to both `pool` and `authPool`. This is strictly better than
the role approach on the requirement that matters most — *the migration
connection must be excluded*. `db/migrate.ts` and `drizzle.config.ts` build
their own connection from `DATABASE_URL` and never import this module, so the
exclusion is structural: there is no role list to keep correct, and no way to
cancel a migration mid-table-rewrite by editing the wrong line. It also needs
no privilege, and it applies to existing clusters the moment the process
restarts.

All four values are env-validated (`DB_ACQUIRE_TIMEOUT_MS`,
`DB_STATEMENT_TIMEOUT`, `DB_IDLE_TX_TIMEOUT`, `DB_JOB_STATEMENT_TIMEOUT`), so
staging can retune them without a code change.

**Background jobs raise the ceiling for themselves.** `dataRetention.ts` deletes
a year of rows across four tables and `sessionCleanup.ts` clears an expired-
session backlog; both would be cancelled with SQLSTATE 57014 under a 15s
default on their first real run. Rather than loosen the default for every
request in the process — which would defeat the point of having one — they run
through `withJobStatementTimeout(db, fn)`, which opens a transaction and issues
`SET LOCAL statement_timeout`. `SET LOCAL`, so the raised ceiling dies with the
transaction and cannot leak back into the pool for the next borrower.

**Why five seconds for the pool?** If a connection has not freed up in five
seconds, the system is already in trouble and the user is already unhappy.
Waiting longer does not improve their experience — it just delays the moment we
find out. Five seconds is long enough to ride out a brief burst and short enough
that the error arrives while someone is still watching.

Note what this fix does *not* do: it does not stop the pool from being
exhausted. That is item 0.1's job. This change makes exhaustion **loud instead
of silent**, which is what turns "the app is slow" into a log line with a cause.
Both changes are needed, and this one is what makes the other one verifiable.

---

## 3. What this affects

**What changes for users**

Under pool exhaustion, requests now fail in ~5 seconds with a 500 and the
message "Database unavailable", instead of hanging for 30 seconds and dying
silently. That is a better failure, not a fixed one — but a fast, explained
failure is something support can act on.

**What could break — read this carefully**

`statement_timeout` will **cancel** any query that exceeds it. Before setting
15 seconds, confirm nothing legitimate runs longer:

- Report generation is the obvious candidate. It reads room, attendance and
  activity rows (`services/report.service.ts`) and then hands HTML to Gotenberg.
  The slow part is Gotenberg, not SQL, so it should be fine — but measure it on
  the largest real event before trusting that.
- Background jobs (`jobs/dataRetention.ts`, `jobs/sessionCleanup.ts`) may do
  bulk deletes that legitimately take longer. If so, they should raise the
  timeout for their own session explicitly with `SET LOCAL statement_timeout`,
  rather than the whole role being loosened for their benefit.

**The migration connection is excluded by construction**, not by remembering to
exclude it: it is built from `DATABASE_URL` in `db/migrate.ts`, which does not
import the pools these options are attached to. A test asserts every pool this
module builds carries the options and that its connection string is a runtime
one. Getting this wrong would mean a deploy failing halfway through a
migration, which is a far worse day than the problem being solved.

**`idle_in_transaction_session_timeout` interacts with the SSE fix.** Today a
long-lived SSE connection holds a transaction open for hours; with a 30-second
timeout, Postgres would kill it. That is *correct* behaviour, but it means
these two changes should land close together — this one turns the SSE leak from
a silent resource drain into visible connection errors. Ship 0.1 first, then
this.

**What is unaffected**

- No schema change and no data change. `ALTER ROLE ... SET` only changes
  defaults for new sessions.
- Normal request behaviour is identical. A healthy system never reaches any of
  these limits.

**How we would know if it broke**

- Deliberately exhaust the pool on staging (open enough SSE tabs, or set
  `DB_POOL_MAX=1`) and confirm you now see the
  `"Failed to acquire tenant connection"` log line. That line has never once
  appeared in production; seeing it is the proof the fix works.
- Watch for Postgres error code `57014` (`query_canceled`) after deploy. Any
  occurrence means a real query exceeded 15 seconds and needs investigating —
  it is a finding, not necessarily a mistake in this change.
- Run the full report generation flow against the largest event in staging and
  confirm it completes.

**Not verified locally.** The report-generation and pool-exhaustion checks
above need a real Postgres and real data; neither was run as part of this
change. What is covered by tests is the configuration itself — that both
runtime pools carry an acquisition timeout and the session options, that no
migration connection does, and that the job helper issues `SET LOCAL`. The
behavioural claims remain staging verifications.

---

## 4. What to learn from this

**The concept: no timeout is a timeout of infinity.**

Every operation that waits on something else — a connection, a query, an HTTP
call, a lock, a queue message — has a timeout. If you did not choose it, you
chose "forever" by not deciding. Forever is almost never the right answer,
because the caller upstream has its own deadline, and a wait longer than that
deadline can only produce a worse error than the one you skipped.

**The related idea: error handling that cannot be reached is not error
handling.** This codebase has a well-written `catch` block with a clear log
message that has literally never executed, because the call it wraps does not
reject. When you write a `try/catch`, ask: *what would actually have to happen
for this catch to run?* If you cannot describe it concretely, the code may be
decoration.

**How to spot this elsewhere.** Look for every place the code waits on
something outside the process, and check whether a deadline was set:

- `pool.connect()` → `connectionTimeoutMillis`
- `fetch()` → an `AbortController` (this codebase does this correctly in
  `report.service.ts:151`, worth copying)
- Redis clients → connect and command timeouts
- SQS receive → wait-time and visibility-timeout settings
- any `await` on a promise that some other code is responsible for resolving

**The layering rule worth remembering:** timeouts should get *shorter* as you go
deeper. The user's browser waits longer than the server, the server waits longer
than the database call, the database call waits longer than the connection
acquire. When an inner timeout is longer than an outer one — as with the 120s
Gotenberg abort inside a 30s request timeout, which is item 2.6 on the plan —
the inner one can never fire, and work continues on a request nobody is waiting
for any more.
