# User left event — real-time in-app presence alert

**Status:** shipped
**Touches:** `packages/server/src/services/user-left-notification.service.ts`, `packages/server/src/config/constants.ts`, `packages/server/src/controllers/room/room-live.controller.ts`, `packages/server/src/routes/room.routes.ts`, `packages/server/src/services/auth/auth-login.service.ts`, `packages/client/src/lib/api.ts`, `packages/client/src/pages/RoomLive.tsx`
**Ships with:** `feat/user-left-event` — closes #76

---

## 1. What the code does today

As with the previous notification tickets, the type is declared and never
constructed. `USER_LEFT_EVENT` already exists in `NOTIFICATION_TYPES`, its
payload shape is fixed, and the channel router already restricts it to a
single channel:

```ts
// packages/shared/src/index.ts
USER_LEFT_EVENT: { roomId: string; userId: string; reason: "left" | "logged_out" };
...
USER_LEFT_EVENT: ["in_app"],
```

It is also already present in the DB enum via
`drizzle/0005_notification_engine_schema_widening.sql`. Nothing writes it.

**There is no "leave" on the server.** A viewer enters a LiveKit room by
POSTing `/rooms/:id/live-token`, which mints a two-hour token
(`livekit.provider.ts`, `TOKEN_TTL_SECONDS = 2 * 60 * 60`) and returns. From
that point the server is not in the loop: joining and leaving happen between
the browser and LiveKit. `RoomLive.tsx` handles the disconnect purely
locally:

```tsx
// packages/client/src/pages/RoomLive.tsx:343
onDisconnected={() => setConnect(false)}
```

There is no LiveKit webhook receiver — `services/streaming/` holds only the
provider and its interface — so the server never learns that a participant
went away. `presence.service.ts` can *count* participants on demand, but it
is a poll, not an event, and it cannot say *who* left.

**Logout knows the user and nothing else.** `POST /auth/logout` is CSRF-
protected but not `requireAuth`ed, so `req.user` is undefined there; the
handler passes the refresh cookie straight to `logoutSession`, which resolves
the session row and revokes it:

```ts
// packages/server/src/services/auth/auth-login.service.ts:132
export const logoutSession = async (refreshToken: string | undefined): Promise<void> => {
  if (!refreshToken) return;
  const session = await findSessionByToken(refreshToken);
  if (session && !session.revokedAt) {
    await revokeSession(session.id);
    ...
```

So at logout the server has a `userId` and no idea which room — if any — that
user was watching, and no organization id either.

**The pattern to copy** is `event-stream-notification.service.ts`: a debounced
`notifyX` entry point over an awaited `fanOutX` that re-opens its own tenant
context (`runInBackgroundTenantContext`) because it runs off a timer, long
after the request that scheduled it released its pinned connection.

## 2. What I am changing, and why

**A `POST /rooms/:id/leave` endpoint**, guarded by `canViewLiveSession` — the
same guard as `live-token`, because leaving a room is only meaningful to
someone who was allowed into it. `RoomLive.tsx` calls it from
`onDisconnected`. Today an event admin watching who is in their room learns
that someone left only by re-polling the presence count, which tells them the
number changed but not who; this gives them the actual signal.

Best-effort by design: a hard tab close, a crashed browser, or a network drop
will not fire it. That is acceptable for a live-presence signal that the
issue explicitly scopes as non-durable — it is not attendance data, which is
recorded separately.

**Redis remembers the user's active room.** `getLiveToken` writes
`active-room:<userId>` → `{ roomId, organizationId }` with a TTL matching the
live token's two hours; the leave endpoint deletes it. Logout reads it, and
only if a room is there does it emit `USER_LEFT_EVENT` with
`reason: "logged_out"`.

The write is not awaited: nothing in the token response depends on it having
landed, and a degraded-but-open Redis would otherwise add its latency to
every room join.

This is deliberately not a database table. The fact is ephemeral (it expires
on its own), it is written on a hot path, and losing it costs a presence
alert rather than any durable record — that is exactly what Redis is for, and
the codebase already treats Redis as optional everywhere it touches it.

**A dispatcher**, `user-left-notification.service.ts`, in the shape of the
other room-scoped ones: resolve staff via `resolveRoomStaffRecipients`, then
`notificationService.createNotification` per recipient. Calling only
`createNotification` is what makes this in-app-only — that method inserts the
row, publishes to the user's Redis pub/sub channel for SSE, and records an
`in_app` delivery. Push and email are separate services this file does not
import.

**The debounce key is per room *and* per user**: `user-left:${roomId}:${userId}`.
Keying on the room alone — as the stream-state dispatcher correctly does,
because there the room is the subject — would mean two different people
leaving within the same window collapse into one alert and the second is
silently dropped. Per-user keying also gets the rejoin case right for free: a
disconnect immediately followed by a logout coalesces into a single alert,
which is what the ticket asks for.

**The leaver is filtered out of the recipient list.** `resolveRoomStaffRecipients`
returns the room creator plus assigned admins; when the person leaving is one
of them, they would otherwise be told "you left the event".

## 3. What this affects

**Recipients are staff, not attendees.** `resolveRoomStaffRecipients` documents
that there is no room-attendee table, so "members" resolves to the creator
plus non-revoked `event_admin_assignments`. A plain attendee leaving notifies
the staff; other attendees are told nothing. Building an attendee table is
out of scope here and would change every room-scoped dispatcher at once.

**The alert can describe a state the user has already reversed.** Trailing-edge
debounce fires after the window goes quiet, so someone who drops and rejoins
inside three seconds still produces one "left" alert, sent when they are back
in the room. The ticket asks for churn to collapse to *one* alert, not zero,
so this is the specified behaviour rather than a defect — cancel-on-rejoin
suppression is intentionally not built.

**When Redis is down, logout notifies nobody.** `getLiveToken` cannot write the
active-room key and logout cannot read it, so no `roomId` is available and
the event is skipped. The room-leave endpoint is unaffected: it carries its
own `roomId` in the URL. This is correct degradation for a presence signal —
but note it also means the in-app delivery itself is degraded during a Redis
outage, since SSE fan-out publishes through Redis pub/sub. **How we would
know:** `[redis] client error` in the logs, and no `USER_LEFT_EVENT` rows
appearing in `notifications` while rooms are live.

**A new authenticated write endpoint on a hot path.** `POST /rooms/:id/leave`
is callable by any user with live-session view access, and one careless
client loop could hammer it. The debounce bounds the *notification* fan-out
per user per room, not the request rate; the route sits behind the same
global rate limiting as the rest of `roomRouter`.

**No migration, no shared-package change.** The enum value, payload shape and
channel list all already exist. If a `USER_LEFT_EVENT` row ever fails to
insert with an enum constraint violation, the cause is a stale database, not
this change.

## 4. What to learn from this

**Trailing-edge debounce is a coalescing strategy, and the key you choose *is*
the definition of "the same event".** A debounce keyed too broadly does not
throttle noise — it silently discards distinct events. The test for it is not
"does rapid churn produce one alert" but "do two genuinely different subjects
inside one window still produce two". Whenever you see a `debounce(key, ...)`
call, read the key as a sentence — "all X are the same event" — and ask
whether that sentence is true.

**A client-driven `leave` is an optimisation, not a guarantee.** Any signal
that depends on the browser making one last call before it goes away will be
missing whenever the user closes the tab, loses signal, or force-quits. That
is fine for presence and never fine for anything billing, attendance, or
audit depends on — those need a server-side source of truth (a webhook, a
heartbeat expiry, a reconciliation poll). Decide which kind you have before
you build it, and write down which one you chose.
