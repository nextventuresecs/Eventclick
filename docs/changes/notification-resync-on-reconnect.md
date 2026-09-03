# Unread badge undercounts after a reconnect

**Status:** shipped
**Touches:** `packages/client/src/hooks/useNotifications.ts`
**Ships with:** `feat/notification-resync-on-reconnect` — closes #77

---

## 1. What the code does today

`useNotifications` builds its list from exactly two sources, and neither one
covers a gap in connectivity.

The history fetch runs once per signed-in user:

```ts
// packages/client/src/hooks/useNotifications.ts
useEffect(() => {
  if (!user) { setNotifications([]); return; }
  api.get<Notification[]>("/notifications").then((data) => { ... });
}, [user]);
```

Everything after that arrives over SSE:

```ts
eventSource.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  if (payload.type === "ping") return;
  setNotifications((old) => {
    if (old.some((n) => n.id === payload.id)) return old;
    return [payload, ...old];
  });
  ...
};

eventSource.onerror = (err) => {
  console.error("SSE connection error, it will auto-reconnect", err);
};
```

The dedupe-by-id on insert is already right, and `EventSource` really does
reconnect on its own — the comment is accurate. What neither of them does is
recover the messages that were published **while the socket was down**.

Server-side fan-out publishes to Redis pub/sub and writes a durable row
(`notification.service.ts` does both). Pub/sub has no replay: a subscriber that
is not connected at publish time never receives that message, and nothing later
tells it what it missed. The row is in the database, and the client will not ask
for it again — the history fetch is keyed on `[user]`, which does not change
when a laptop sleeps, a phone loses signal, or a tab is backgrounded long
enough for the connection to drop.

So the badge silently undercounts, and stays wrong until a full page reload.
The one state that makes this most visible is also the most common: close the
lid, open it an hour later, and the app looks like nothing happened.

## 2. What I am changing, and why

**Refetch the history whenever the client has reason to believe it missed
something**, and merge rather than replace.

Two triggers, because they catch different failures:

- `window`'s `online` event — the browser telling us connectivity returned.
- The `EventSource`'s `onopen`, on every open *after* the first. The first open
  is the initial connection, whose gap the mount-time history fetch already
  covers; every subsequent one is a reconnect, which by definition means the
  stream was down for some interval.

`online` alone is not enough: a proxy timeout or a server restart drops the SSE
connection without the browser ever going offline. `onopen` alone is not enough
either — a device that wakes from sleep may fire `online` well before the
`EventSource` gets around to reopening.

**The merge keeps the server as the source of truth for what exists and what is
read, while preserving anything the client holds that the server response does
not mention:**

```ts
const merge = (incoming: Notification[], existing: Notification[]) => {
  const byId = new Map(incoming.map((n) => [n.id, n]));
  for (const n of existing) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()].sort(byNewestFirst);
};
```

Incoming wins on conflict, which matters for `isRead`: a notification marked
read on another device should come back read here. Local-only entries are kept
because the history endpoint returns the newest 50 rows
(`getUserNotifications(..., limit = 50)`), so a busy account's older-but-still-
loaded items must not vanish on every resync, and an item that streamed in
between the request and its response must not be dropped.

**A resync in flight is not started twice.** `online` and `onopen` frequently
fire within the same second on wake; a ref-guarded in-flight flag keeps that to
one request.

## 3. What this affects

**Extra requests.** One `GET /notifications` per reconnect, per open tab. A
flapping connection means one per flap — bounded by how often `EventSource`
reopens, not by anything this code does. The endpoint reads at most 50 rows for
one user; this is not a load concern at the current scale, and if it becomes one
the fix is a `since` parameter, not fewer resyncs.

**Read state can appear to move backwards, briefly.** An optimistic `markAsRead`
that has not yet been persisted — because the PATCH is still in flight, or
failed — will be overwritten by the server's `isRead: false` on the next
resync. That is the correct outcome: the server is what the badge is supposed
to reflect, and the existing rollback in `markAsRead` already assumes the same
thing.

**No duplicates**, which was the explicit acceptance criterion: the merge is
keyed by id, and the SSE insert path keeps its own `some((n) => n.id === ...)`
guard, so an item arriving live during a resync collapses either way.

**What this does not do.** Nothing is backfilled while the app is fully closed —
that needs push, which is the push-foundation ticket's job. There is also no
`since`/cursor parameter: the endpoint's existing 50-row window is the recovery
horizon, so an account that misses more than 50 notifications in one outage
recovers only the newest 50. Worth naming, not worth solving now.

**How we would know it broke.** Tests drive the two triggers directly against
the hook: an item created "while offline" appears after `online` fires, a
reconnect (`onopen` after the first) resyncs, the first `onopen` does not, and
an id present in both the list and the response appears exactly once. In the
browser: open the app, kill the network, have someone trigger a notification,
restore the network, and watch the badge correct itself without a reload.

## 4. What to learn from this

**Publish/subscribe has no replay, so every pub/sub client needs a
reconciliation path.** Redis pub/sub, WebSocket broadcasts, SSE — all of them
deliver only to whoever is connected at the moment of publish. The durable row
exists; the delivery does not. Any UI built on a live channel is therefore a
*cache* of server state, and every cache needs an answer to "how does it heal
after it is wrong", not only "how does it update while it is right".

**Reconnect is a first-class event, not an error.** The failure here was not
that the connection dropped — the library handles that transparently, which is
exactly what made the gap invisible. The bug was treating "we are connected
again" as a non-event, when it is the precise moment you know your local state
may be stale.

**How to spot this elsewhere:** find every place a UI subscribes to a stream,
then look for what runs on reconnect. If the answer is "nothing", ask what was
published during the gap and whether anything will ever fetch it. Any client
whose only refresh is on mount will be wrong for as long as the session lasts.
