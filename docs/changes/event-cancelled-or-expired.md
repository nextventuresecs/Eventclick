# Event cancelled or expired — urgent notification to everyone involved

**Status:** shipped
**Touches:** `packages/server/src/db/schema/eventRooms.ts`, `packages/server/drizzle/0010_*`, `packages/server/src/services/event-cancellation-notification.service.ts`, `packages/server/src/services/email.service.ts`, `packages/server/src/services/email-delivery.service.ts`, `packages/server/src/controllers/room/room-crud.controller.ts`, `packages/server/src/jobs/eventExpiryNotifier.ts`, `packages/server/src/index.ts`
**Ships with:** `feat/event-cancelled-or-expired` — closes #75

---

## 1. What the code does today

As with the last two notification tickets, the routing is already built and has never been called.

`EVENT_CANCELLED_OR_EXPIRED` is declared with its payload `{ roomId, reason: "cancelled" | "expired" }`, its channels are `["in_app", "email"]`, and it is already in the always-deliver list:

```ts
// packages/shared/src/index.ts
if (event.type === "EVENT_CANCELLED_OR_EXPIRED") return true;
```

So mutes are already ignored for this event. Nothing constructs it.

**Cancelling happens, and tells nobody.** A room is cancelled through `PATCH /rooms/:id` with `status: "cancelled"`. `updateRoom` sets the status, stamps `actualEnd`, and stores `cancellationReason` if one was given. That is the whole of it — the people who were going to attend find out by opening the app.

**Expiry does not exist at all.** Nothing detects a scheduled event whose time passed without it ever starting. Such a room keeps `status = "scheduled"` forever, and no code looks at it again.

**There are two established patterns to copy, and one to avoid.**

The poll job pattern, from `jobs/attendanceWindowNotifier.ts`: query candidates cross-tenant through `authDb` (the `BYPASSRLS` role — a poll has no single tenant to scope to), then do the per-room writes inside `runInBackgroundTenantContext`, then stamp an idempotency marker column so the next poll skips it.

The atomic-claim pattern, from `room-live.controller.ts`: claim the marker with an `UPDATE ... WHERE marker IS NULL RETURNING`, and only fan out if the claim returned a row, so a double-clicked request cannot notify twice.

The pattern to avoid is in that same file. `startLive` fires the fan-out without awaiting it:

```ts
notifyEventStarted({ ... }).catch((err) => logger.error(...));
res.json(toEventRoom(row));
```

The tenant middleware commits and releases its pinned connection on `res.on("finish")`, so that detached fan-out keeps querying through a released client. It is the same defect that was fixed in the report controller in `fe831bb`, still present here for `EVENT_STARTED` and `EVENT_ENDED`. This change does not copy it, and the bug is raised separately rather than fixed in passing.

## 2. What I am changing, and why

**One marker column for both triggers,** `event_cancelled_or_expired_notified_at`, following the four markers already on this table. Both reasons write the same column because a room can only take one of the two paths: cancelling sets `status = "cancelled"`, which is exactly what the expiry query excludes.

**A dispatcher,** `event-cancellation-notification.service.ts`, in the shape of the other room-scoped dispatchers: resolve staff via `resolveRoomStaffRecipients`, run `ChannelRouter` per recipient (which returns both channels regardless of mutes, because this event is critical), send in-app and email, isolate per-recipient failures.

**Cancellation notifies from `updateRoom`,** behind the atomic claim, and **awaited** before the response is sent — not fire-and-forget, for the connection-release reason above. The cost is that the PATCH response waits on the fan-out; that is the correct trade for a small recipient set and correctness over latency.

**Expiry gets a poll job,** `jobs/eventExpiryNotifier.ts`. An event counts as expired when `status = "scheduled"` and `actual_start IS NULL` and `scheduled_end` is in the past.

`scheduled_end`, not `scheduled_start`, is the deliberate choice. Between the two, an event that has not started yet may still start late — an organiser running twenty minutes behind has not cancelled anything, and firing "your event was cancelled" at them would be wrong and alarming. Once the whole scheduled window has passed with no `actual_start`, it did not happen. That is the earliest moment the claim is unambiguously true.

**An email template.** `EmailType` gains `"event-cancelled"`, with the reason and any cancellation note carried through. The note is organiser-entered free text, so it is escaped like the broadcast body.

## 3. What this affects

**Behaviour that changes for existing data.** The first time the expiry job runs against a real database, every historical scheduled room whose window has passed and which never started becomes a candidate — potentially a large backlog, all notified at once, about events people stopped caring about months ago.

This is the main risk in the change. The job therefore only considers rooms whose `scheduled_end` is within a bounded lookback window rather than all of history, so the first run cannot flood users with ancient events. Rooms older than that are left alone permanently, which is the right outcome: nobody needs an email about an event that failed to happen last quarter.

**Cancellation now costs a round of notifications inside the request.** `PATCH /rooms/:id` with `status: "cancelled"` will take longer than it does today, proportional to the number of room staff. Acceptable for the recipient counts this scope produces; if room staff ever grows large, this moves to the queue.

**A third background job.** `index.ts` starts it alongside session cleanup and the attendance window notifier.

A correction worth recording, because I got this wrong at first and it changed the design: the attendance window notifier is **already** protected against multiple instances. It wraps each poll in a Redis lock — `redisClient.set(key, "1", { NX: true, EX: ttl })` in `pollWithLock` — with a TTL kept below the poll interval so a crashed holder's lock expires before the next tick. A grep for `setNX` misses this entirely, because node-redis expresses `NX` as an options object rather than a distinct command.

So the new job uses the same lock rather than inventing anything, and multi-instance safety is correct from the start rather than being deferred. `sessionCleanup` remains genuinely unprotected, though its work is an idempotent delete, so running it twice is harmless rather than incorrect.

**Unaffected:** no existing route, service or notification changes behaviour. The migration only adds a nullable column.

**How we would know if it broke:** cancel a scheduled room and confirm every staff member gets an in-app notification and an email, including a member who has muted email; cancel it twice and confirm exactly one notification; let a test room's `scheduled_end` pass without starting it and confirm the expiry job notifies once and not again on the next poll.

## 4. What to learn from this

**The concept: idempotency markers, and why the claim has to be atomic.**

Anything that can be triggered twice — a retried request, a double-clicked button, a poll that runs again before the last one finished — needs a way to say "this already happened". The naive version reads the marker, sees it empty, and then writes it. Two concurrent callers both read empty, both proceed, and the user gets two emails. Collapsing the check and the write into one statement, `UPDATE ... SET marker = now() WHERE marker IS NULL RETURNING *`, means the database decides the winner: only one caller gets a row back, and only that one sends.

The same shape appears in this codebase in `attemptEmailDelivery`, which claims a delivery row with `WHERE status = 'PENDING'` for exactly this reason.

**How to spot the need for it.** Ask of any side effect that leaves the system — email, push, payment, webhook — "what happens if this runs twice?" If the answer is worse than "nothing", it needs a claim. Retries are not exceptional; they are the normal behaviour of queues, load balancers, and impatient users.

**The second lesson: a backfill is hiding in every new poll job.** A query that means "find work that is due" also means, on its first run, "find every item that has ever been due". The code is identical; only the data is different. Whenever you add a job that scans for a condition, ask what the first run will match on production data, and bound it deliberately — a lookback window, a start date, or a one-off backfill that marks history as already handled. This is easy to miss in testing, where the database only contains rows you just made.
