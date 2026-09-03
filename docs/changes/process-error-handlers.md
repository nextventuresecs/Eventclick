# Errors thrown outside a request vanish, and take the process with them

**Status:** shipped
**Touches:** `packages/server/src/utils/processErrors.ts`, `packages/server/src/index.ts`, `packages/server/src/services/sentry.service.ts`, `packages/server/src/services/report.service.ts`
**Ships with:** `fix/process-error-handlers` — closes #81

---

## 1. What the code does today

Inside a request, this codebase handles errors carefully. `errorHandler`
maps `ZodError` to a 400, `ApiError` to its own status, everything else to a
500 with the message hidden in production — and it reports to Sentry on the
way through. `pino-http` gives every request a log line with an id.

**Outside a request, there is nothing.**

The process starts several things that outlive any request:

```ts
// packages/server/src/index.ts
startSessionCleanupJob();
startAttendanceWindowNotifierJob();
startEventExpiryNotifierJob();
startSqsWorker().catch((err) => logger.error({ err }, "SQS worker crashed"));
startEmailSqsWorker().catch((err) => logger.error({ err }, "Email SQS worker crashed"));
```

The two workers have a `.catch`. The three `setInterval` jobs do not, and
neither does anything scheduled from a debounce timer, a Redis reconnect
handler, or a promise chain nobody awaited. When one of those throws, Node
emits `unhandledRejection` or `uncaughtException` — and this process listens
for neither.

The only `process.on` calls registered are the two shutdown signals:

```ts
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

On current Node versions an unhandled rejection terminates the process by
default. So the failure mode is: the container dies, the orchestrator restarts
it, and **nothing anywhere records why**. No log line, no Sentry issue. If the
cause is deterministic — a bad migration, an unreachable dependency at
startup — this is a silent crash loop, and the only visible symptom is an
instance that keeps restarting.

There is one more place errors go nowhere. `report.service.ts` writes the
Gotenberg failure to `console.error`:

```ts
} catch (error: any) {
  console.error("PDF generation failed via Gotenberg:", error);
  throw ApiError.internal(`PDF generation failed: ${error.message || error}`);
}
```

`console.error` bypasses pino entirely: no level, no service field, no request
id, no redaction, and — because the production logger emits JSON — a line that
log aggregation cannot parse alongside the rest. The `throw` means the error
does still reach `errorHandler`, so this is a *diagnosis* gap rather than a
silent failure, but it is the loudest one left.

## 2. What I am changing, and why

**Process-level handlers that record before they exit.**

`utils/processErrors.ts` exports `handleFatal(err, source, deps)` and
`registerProcessErrorHandlers()`. The handler:

1. logs at `fatal` with the source (`unhandledRejection` /
   `uncaughtException`) and the error,
2. reports to Sentry through the existing `captureSentryException`,
3. **awaits a flush** of both, bounded by a timeout,
4. exits non-zero.

Steps 3 and 4 are the parts worth stating plainly. `Sentry.flush()` is
asynchronous — it has an HTTP request in flight — so exiting immediately after
`captureException` loses the very event the handler exists to produce. A hard
`setTimeout(...).unref()` fallback bounds the flush so a hung network call
cannot wedge a process that is already dying.

**This does not route through `shutdown()`, deliberately.** That path drains
connections and exits `0`, which is right for SIGTERM and wrong here: the
process is in an unknown state, its remaining connections cannot be trusted,
and a zero exit tells the orchestrator the container finished successfully.
Non-zero is what makes the restart visible in a restart-count metric.

**`sentry.service.ts` gains a `flushSentry(timeoutMs)` export**, guarded on
the module-private `sentryModule` handle exactly like `captureSentryException`.
`index.ts` does not reach into `@sentry/node` itself — that handle is private
to the service, and keeping it that way is what lets #82 restructure
initialisation without touching every caller.

**The handler body is exported and injectable** (`deps` carries the logger, the
capture function, the flush function, and `exit`). Testing a process handler by
letting it call the real `process.exit` is not possible in a test runner; the
value is in asserting that it captures, flushes, and *then* exits non-zero, in
that order. A separate one-line test asserts the handlers are actually
registered.

**The PDF failure path logs through pino** with the roomId, which
`generateVerificationReportPdf` already has as its first parameter.

## 3. What this affects

**Crash behaviour changes shape, not frequency.** Nothing here prevents a
crash. What changes is that a crash now leaves a fatal log line and a Sentry
issue behind, and exits with a code that says "this was a failure". If the
restart count on the production instance turns out to be non-zero, this change
is what will tell you why — and it may well surface a crash loop that has been
running unnoticed.

**A slower exit, bounded.** The flush adds up to its timeout to shutdown on the
fatal path only. Signal-driven shutdown is untouched.

**`uncaughtException` leaves the process in an undefined state.** The handler
exits rather than continuing, which is the only defensible choice — Node's own
documentation is explicit that resuming after an uncaught exception is unsafe.
This is worth naming because "log and continue" is a tempting and wrong
alternative.

**Request-id correlation in the PDF path is partial until #82.** The service
has no request-scoped logger, so the line carries the roomId but not the
request id. #82 attaches request ids as Sentry tags and is where that gap
closes properly; logging the roomId is what is available today and is enough to
find the job.

**How we would know it broke.** Throw deliberately from a background job in
staging: a `fatal` line with `source: "unhandledRejection"` should appear, a
Sentry issue with it, and the container should restart. If the Sentry issue is
missing but the log line is present, the flush timeout is too short.

## 4. What to learn from this

**Every async boundary that leaves a request needs an owner for its errors.**
An Express error handler covers exactly one thing: errors thrown while a
request is on the stack. Timers, intervals, event-emitter callbacks, queue
consumers and un-awaited promises are all outside it, and each one is a place
where an exception has nowhere to go. Process-level handlers are the backstop,
not the design — the design is that each of those callers catches its own.

**A crash with no record is worse than a crash.** The restart hides the
evidence: by the time someone looks, the process that failed is gone and a
healthy one is running in its place. Any handler whose job is to record a fatal
condition has to finish writing before it lets the process die, which means
flushing anything buffered — logs, error reports, metrics — with a bounded wait.
"Report, then exit" is a sequence, not two independent statements.

**How to spot this elsewhere:** in any long-running process, grep for
`process.on` and list what is handled. If `unhandledRejection` and
`uncaughtException` are absent, the answer to "what happens when a background
task throws" is "the process dies quietly" — regardless of how good the
in-request error handling looks.
