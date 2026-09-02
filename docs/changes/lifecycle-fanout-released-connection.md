# EVENT_STARTED and EVENT_ENDED fan out through a released connection

**Status:** shipped
**Touches:** `packages/server/src/controllers/room/room-live.controller.ts`
**Ships with:** `fix/lifecycle-fanout-released-connection` — closes #97

---

## 1. What the code does today

`startLive` claims the notification marker, fires the fan-out, and answers the
request on the next line:

```ts
// packages/server/src/controllers/room/room-live.controller.ts
if (startedClaim[0]) {
  notifyEventStarted({ ... }).catch((err) => logger.error({ err, roomId: id }, "EVENT_STARTED fan-out failed"));
}

res.json(toEventRoom(row));
```

`stopLive` has the identical shape for `notifyEventEnded`.

The comment above it explains the intent — "the HTTP response shouldn't wait on
notification fan-out" — and as a latency argument that is perfectly reasonable.
It is wrong here for a reason that has nothing to do with latency.

`setTenantContext` pins one pooled connection to the request, opens a
transaction on it, and hands it back the moment the response finishes:

```ts
// packages/server/src/middleware/tenantContext.ts
res.on("finish", () => void cleanup(true));   // COMMIT + client.release()
```

`notifyEventStarted` is not finished at that point. It resolves recipients
(`resolveRoomStaffRecipients`), then writes a notification row per recipient —
all through the `db` proxy, which resolves to whatever `tenantContextStorage`
currently holds. That store still references the drizzle instance bound to the
client that has just been committed and released.

So one of two things happens, depending on timing:

- The queries fail with a released-client error, which is swallowed by the
  `.catch()` and logged as a generic "fan-out failed". The notification is
  simply lost, and the log line does not say why.
- Worse, the client has already been handed to a *different request*, and these
  queries run on a connection whose `app.current_tenant` now belongs to
  someone else.

This is the same defect that `fe831bb` fixed in the report controller, with the
reasoning written out there:

> Awaited before the response ends, NOT fire-and-forget: tenantContext's
> `res.on("finish")` handler commits and releases the pinned connection the
> moment we respond.

Both remaining occurrences are in this one file.

## 2. What I am changing, and why

**Await the fan-out before ending the response**, keeping the `.catch()`:

```ts
if (startedClaim[0]) {
  await notifyEventStarted({ ... }).catch((err) =>
    logger.error({ err, roomId: id }, "EVENT_STARTED fan-out failed"),
  );
}

res.json(toEventRoom(row));
```

The `.catch()` is what keeps the two concerns separate: the room has started
either way, so a notification failure must not fail the request. Awaiting only
changes *when* the response is sent, not *whether* it succeeds.

The alternative the issue offers — moving the fan-out into
`runInBackgroundTenantContext` — would also be correct, and is what the
debounced dispatchers on the same route already do. It is not the right choice
here: those dispatchers run off a timer and genuinely have no request to belong
to, whereas this fan-out is small, bounded by the room's staff list, and
already inside a valid tenant context. Opening a second connection to do work
the current one can do is a cost with no benefit, and it would drop the
ordering guarantee that makes this testable.

The cost is that `POST /rooms/:id/start` now waits on the fan-out. That is the
correct trade for a small recipient set: a slightly slower start beats a
notification that silently did not happen. It is also the same trade already
made in `updateRoom` for `EVENT_CANCELLED_OR_EXPIRED` and in the report
controller.

## 3. What this affects

**Latency on start and stop.** Both endpoints now include recipient resolution,
per-recipient preference parsing, and the in-app writes — plus, for
`EVENT_STARTED` on a room with `notifyEmailOnStart`, an email dispatch per
recipient. Recipients are the room creator plus assigned admins, so this is a
handful of rows, not an attendee list. If a room ever gains hundreds of staff,
this becomes a real latency question and the answer then is a queue, not a
detached promise.

**Notifications that were being lost start arriving.** Anyone reading the logs
for "EVENT_STARTED fan-out failed" should see those stop. If they do not, the
remaining failures are real and worth investigating on their own.

**What is unaffected.** `notifyEventStreamStateChanged` and
`notifyUserLeftEvent` on the same routes are untouched: both are debounced and
open their own `runInBackgroundTenantContext`, which is exactly the right shape
for work that outlives the request by design.

**How we would know it broke.** A test asserts the fan-out resolves *before*
`res.json` is called, so a future refactor cannot silently detach it again —
that ordering is the whole fix and is invisible in a diff otherwise. Beyond
that: start a room and confirm one notification row per staff recipient, with
no released-client errors in the logs.

## 4. What to learn from this

**A promise you do not await escapes every scope it looked like it was
inside.** `.catch()` makes a detached promise *safe* — no unhandled rejection —
which is exactly what makes it easy to miss that it is also *detached*. It
still runs after the enclosing function returns, after the middleware's cleanup
hooks fire, after the resources it captured have been handed back.

The general rule: before writing fire-and-forget, list what the deferred work
borrows from its caller — a database connection, a transaction, an
`AsyncLocalStorage` store, a request-scoped logger, an open file — and ask who
releases each, and when. If the answer is "the response handler", the work must
either finish first or acquire its own.

**How to spot it elsewhere:** grep for a promise-returning call whose line ends
in `.catch(...)` with no `await`, then look down a few lines for `res.json`,
`res.send`, or `res.end`. Every hit is this bug or a deliberate decision that
deserves a comment saying which resources it does *not* touch.
