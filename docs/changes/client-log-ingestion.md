# Anyone on the internet can write to the production log stream

**Status:** shipped
**Touches:** `packages/server/src/routes/log.routes.ts`, `packages/server/src/middleware/rateLimitStore.ts`, `packages/server/src/routes/auth.routes.ts`, `packages/shared/src/index.ts`
**Ships with:** `fix/client-log-ingestion` — closes #86

---

## 1. What the code does today

`POST /api/v1/logs/client-error` accepts browser error reports and writes them
into the server's log stream. It is mounted without authentication, and its
limiter is the only one in the service that does not use the shared Redis
store:

```ts
// packages/server/src/routes/log.routes.ts
const logIngestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  // no `store` — the library default is an in-process Map
});

logRouter.post("/client-error", logIngestLimiter, validate(ClientLogSchema), ingestClientLog);
```

Compare `auth.routes.ts`, where the same library is given a Redis-backed,
fail-closed store built specifically so a limiter cannot be bypassed by a
Redis outage. That care was not applied here.

**In-process state means the budget does not hold.** Each container gets its
own 60/minute allowance, so *n* replicas mean *n* × 60. It also resets to zero
on every deploy. A limit that resets whenever you ship is a limit an attacker
outlasts by waiting.

**The payload is large, and one field is unbounded.** `ClientLogSchema` caps
`message` at 2,000 characters and `stack` at 8,000 — but `context` was
`z.record(z.string(), z.unknown())` with no bound at all, so a single request
could carry just under the 1 MB `express.json` limit of arbitrary JSON. Every
byte lands in the log stream, and the log-storage bill.

So the cost per request is roughly 10 KB of attacker-chosen text with no
credential required, throttled by a limit that resets on deploy.

## 2. What I am changing, and why

**The endpoint stays public, and now says why in the code.**

Requiring authentication was the issue's first suggestion, and it is the wrong
call here for two reasons.

The reports worth having are the ones from before a session exists: a bundle
that fails to boot, a crash on the login page, an error during token refresh.
Requiring auth drops exactly those.

It also cannot work as the client is built. Access tokens live in memory and
are attached by the api wrapper; `lib/log.ts` deliberately bypasses that
wrapper, preferring `navigator.sendBeacon` so a report survives the page
unloading — and **`sendBeacon` cannot set an `Authorization` header**. Adding
`requireAuth` would not tighten the endpoint; it would silently switch client
error reporting off.

`attachUser` already runs app-wide and populates `req.user` opportunistically
when a token happens to be present, and the ingested record carries it. So
authenticated reports are attributed without authentication being required.

**The limiter moves to the shared fail-closed Redis store, with a tighter
budget.** 20 per minute per IP rather than 60 — tighter than the client's own
20/minute throttle in `lib/log.ts`, so a well-behaved browser never reaches it
and anything that does is either a bug looping or someone writing into the log
stream on purpose.

The store is extracted from `auth.routes.ts` into
`middleware/rateLimitStore.ts` and shared by both. It was a good piece of code
buried in a route file, which is part of why the log route did not get it.

**`context` gains caps** — at most 20 keys, at most 4,000 bytes serialised,
keys at most 64 characters. The byte check is inside a `try` so an
unserialisable value (a cycle, a `BigInt`) is rejected at validation rather
than thrown at the logger.

## 3. What this affects

**Client error reporting must still work, and that is the main risk.** The
change is mostly subtractive — a tighter budget and a new cap — so the failure
mode to watch is legitimate reports being rejected. The 20/minute limit is per
IP, so several people behind one office NAT share it; a widespread client bug
that makes every browser report at once would exhaust the budget for that
office and silently drop the rest. That is the intended behaviour under abuse
and an acceptable loss under a real incident: the first twenty reports carry
the same information as the next thousand.

**A large `context` is now a 400 instead of a silent write.** `lib/log.ts`
swallows failures, so nothing user-visible changes — but a caller passing a big
context object stops getting reports through, with no signal except their
absence. Anywhere the client passes user-supplied data as context is worth a
look.

**Redis becomes a hard dependency of this endpoint.** Fail-closed means a Redis
outage rejects client error reports. That is the correct trade for a public
write endpoint, and it is now consistent with every other limiter here.

**`auth.routes.ts` behaviour is unchanged** by the extraction — same store,
same construction, moved file.

**How we would know it broke.** Trigger a deliberate client-side error in
staging and confirm it appears in the server logs with `source: "client"`.
Then loop 25 reports in a minute and confirm the tail returns 429. If genuine
reports stop arriving after deploy, the limit is the first thing to check.

## 4. What to learn from this

**A public write endpoint is a public write endpoint even when what it writes
is "just logs".** Logs cost storage, they are read by humans during incidents,
and they are frequently ingested by tools that parse them. Anonymous, uncapped
writes into that stream are a resource-exhaustion and log-injection surface,
not a diagnostic convenience. If an endpoint must stay open, the question to
answer explicitly is: what is the maximum a single caller can spend per minute?

**When one instance of a pattern is hardened and another is not, the odds are
the second was never noticed.** The fail-closed Redis store existed and was
well reasoned — it was defined inside `auth.routes.ts`, so it was invisible to
anyone writing a different route file. Shared safety mechanisms belong
somewhere shared, or they become one team's local decision. Grep for every
construction of a security control and check they all use the same one.

**Every field on a public schema needs a bound, including the free-form one.**
`z.record(z.string(), z.unknown())` reads as flexible and means unbounded. A
schema that caps four fields and leaves the fifth open is bounded by the
transport's limit, not by the schema — here, 1 MB rather than the ~10 KB the
other caps imply.
