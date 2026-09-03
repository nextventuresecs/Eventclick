# Error tracking initialises too late to enrich anything

**Status:** shipped
**Touches:** `packages/server/src/instrument.ts`, `packages/server/src/services/sentry.service.ts`, `packages/server/src/index.ts`
**Ships with:** `fix/sentry-init-order` — closes #82

---

## 1. What the code does today

Sentry is initialised asynchronously, from a floating promise, while the
Express app is built synchronously underneath it:

```ts
// packages/server/src/index.ts
const app = express();

if (env.SENTRY_SERVER_DSN) {
  initSentry(env.SENTRY_SERVER_DSN, env.NODE_ENV).then(() => {
    setupSentryExpressErrorHandler(app);
  });
}

// ...170 lines of app.use(...) run immediately, without waiting...
app.use(notFoundHandler);
app.use(errorHandler);
```

`initSentry` itself awaits two dynamic imports before calling `init`:

```ts
// packages/server/src/services/sentry.service.ts
const [nodeSentry, { nodeProfilingIntegration }] = await Promise.all([
  import("@sentry/node"),
  import("@sentry/profiling-node"),
]);
```

Two separate consequences follow, and it is worth keeping them apart.

**The error handler is registered last, not first.** `setupExpressErrorHandler`
runs inside a `.then()`, which cannot execute before the synchronous
`app.use(errorHandler)` at the bottom of the file. Express runs error
middleware in registration order, and `errorHandler` **ends the response** —
so by the time Sentry's handler is reached, there is nothing left to enrich.

Errors are not lost. `errorHandler` reports them explicitly:

```ts
log.error({ err }, "unhandled error");
captureSentryException(err, { extra: { route: `${req.method} ${req.originalUrl}` } });
```

What is lost is everything the SDK would have attached automatically: request
scope, matched route, status code, and the span linking the error to its
transaction. Issues arrive as a bare stack trace — stripped of exactly the
context you want at three in the morning.

**Auto-instrumentation misses most of what it should patch.** Sentry
instruments by monkey-patching modules (`http`, `express`, `pg`, `redis`) as
they are required. `init()` here runs after every one of those has already been
imported at the top of `index.ts`, so the patches land on nothing.

Separately: `pino-http` already generates a request id and returns it as the
`x-request-id` header, but nothing tells Sentry about it. Given an issue, there
is no field to search the logs by.

## 2. What I am changing, and why

**A dedicated `instrument.ts`, imported first, initialising synchronously.**

```ts
// packages/server/src/index.ts — the first import in the process
import "./instrument";
```

This is the SDK's own documented shape, and it fixes the instrumentation
problem by construction: nothing else has been imported yet, so the patches
apply to modules everything downstream will use.

**Synchronous is not an incidental detail.** `index.ts` ends with
`export { app }`, and three integration tests
(`api.integration.test.ts`, `gdpr.integration.test.ts`,
`preferences.integration.test.ts`) import that binding synchronously and hand
it to supertest. Awaiting initialisation before building the app — the obvious
reading of the issue — would force an async app factory and rewrite all three
harnesses. Static imports remove the need to await at all.

The trade is that `@sentry/node` and `@sentry/profiling-node` now load on every
start, including when no DSN is set, instead of being pulled in lazily. For a
long-running server that is a few milliseconds at boot, paid once, in exchange
for the SDK actually working.

**The error handler is registered where order demands:**

```ts
app.use(notFoundHandler);
setupSentryExpressErrorHandler(app);   // before errorHandler
app.use(errorHandler);
```

**The service keeps its shape.** `sentry.service.ts` still exposes
`captureSentryException`, `flushSentry`, `setupSentryExpressErrorHandler`, plus
a new `tagRequestId` — all no-ops when no DSN is configured, so no caller has
to ask whether error tracking is on. `initSentry` is gone; initialisation is
`instrument.ts`'s job now.

**Request ids become a Sentry tag**, set from middleware placed straight after
`pino-http`:

```ts
app.use((req, _res, next) => {
  if (req.id) tagRequestId(String(req.id));
  next();
});
```

This relies on the SDK's per-request isolation scope, which is what makes
setting a tag from middleware safe under concurrency rather than a global that
bleeds between requests.

**Sampling and scrubbing are deliberately untouched.** `tracesSampleRate: 1.0`
and `profilesSampleRate: 1.0` carry over exactly as they were. They are wrong —
full tracing and continuous profiling on a two-vCPU box that also hosts
Postgres, Redis and the PDF renderer — but they are #83's subject, and changing
them here would put two unrelated arguments in one review.

## 3. What this affects

**Issue quality changes, issue volume does not.** The same errors are reported;
they now arrive with request, route, status and trace context, and a
`request_id` tag. Existing Sentry issue grouping may shift as a result, since
the SDK now supplies fingerprinting context it previously lacked.

**A DSN-less environment is unchanged in behaviour**, only slightly heavier at
boot. Every export short-circuits on `sentryEnabled`.

**If `instrument.ts` ever stops being the first import, instrumentation
silently degrades** — no error, no warning, just thinner context. The comment
at the top of both files says so; there is no way to enforce it in the type
system.

**How we would know it broke.** Trigger a deliberate 500 in staging and check
the resulting Sentry event carries the request method, matched route and status
code, plus a `request_id` tag; then search the logs for that id alone and
confirm the request's lines come back. If the event arrives bare, the handler
ordering has regressed.

## 4. What to learn from this

**A floating promise in a bootstrap is a race you have already lost.**
`init().then(register)` next to synchronous setup code does not mean "register
early" — it means "register after everything synchronous has finished", which
in Express is precisely too late for anything order-dependent. If setup must
happen before other setup, it has to be synchronous, or everything after it has
to await.

**Middleware order is behaviour, not style.** Express runs error handlers in
registration order and stops at the first one that ends the response, so "which
handler sees the error, and what has been attached to it by then" is decided by
line order alone. Any middleware that observes rather than handles — tracing,
metrics, error reporting — belongs before the one that terminates.

**How to spot this elsewhere:** grep a bootstrap for `.then(` and for `await`
inside module scope, then ask what runs in the gap. Any observability SDK that
patches other modules has a hard ordering requirement, and the symptom of
getting it wrong is never an error — it is a quieter, less useful version of
the tool still appearing to work.
