# Org broadcast — admin composer and priority-based fan-out

**Status:** shipped
**Touches:** `packages/shared/src/index.ts`, `packages/server/src/services/org-broadcast.service.ts`, `packages/server/src/services/email.service.ts`, `packages/server/src/services/email-delivery.service.ts`, `packages/server/src/controllers/admin.controller.ts`, `packages/server/src/routes/admin.routes.ts`, `packages/client/src/lib/api.ts`, `packages/client/src/pages/AdminBroadcast.tsx`, `packages/client/src/App.tsx`
**Ships with:** `feat/org-broadcast` — closes #74

---

## 1. What the code does today

All the machinery for this feature already exists. Nothing calls it.

**The event type is fully declared.** `ORG_BROADCAST` is in `NOTIFICATION_TYPES`, so the database enum accepts it. Its payload shape is declared:

```ts
// packages/shared/src/index.ts:274
ORG_BROADCAST: { organizationId: string; title: string; body: string; priority: "normal" | "urgent" };
```

Its channels are declared — all three:

```ts
// packages/shared/src/index.ts:321
ORG_BROADCAST: ["in_app", "web_push", "email"],
```

And — this is the important part — **the urgent-bypasses-mutes rule is already implemented**, in `isCriticalNotificationEvent`:

```ts
// packages/shared/src/index.ts:335
if (event.type === "ORG_BROADCAST") return event.payload.priority === "urgent";
```

`ChannelRouter` reads that flag and skips mute filtering entirely when it is true. So the routing behaviour this issue asks for is not something we have to build — it was built in #66 and has never had a caller.

**There is an established dispatcher pattern to follow.** `services/event-lifecycle-notification.service.ts` shows the shape every room-scoped dispatcher uses: resolve recipients, build a typed `NotificationEvent`, then for each recipient parse their stored preferences, run `ChannelRouter`, and fan out to whichever channels come back — each recipient wrapped in its own `try/catch` so one bad row cannot abort the whole send.

**What is missing is only the org-wide half:**

- No recipient resolver for `{ kind: "orgWide" }`. `resolveRoomStaffRecipients` covers room scope only; nothing resolves "everyone in this organisation".
- No dispatcher service — nothing ever constructs an `ORG_BROADCAST` event.
- No email template. `EmailType` (`email-delivery.service.ts:17`) lists six types and `sendEmailByType` switches over them; neither knows about broadcasts, and the switch throws `Unknown email type` on anything else.
- No endpoint. `routes/admin.routes.ts` has three user-management routes and nothing else.
- No UI. There is no composer anywhere in the client.

## 2. What I am changing, and why

Wire the existing machinery to a real admin action, end to end.

**A recipient resolver for org scope.** All active, non-soft-deleted users in the organisation — `resolveOrgRecipients`, deliberately the same shape of query as `resolveRoomStaffRecipients` so both scopes filter identically. It lives in the new dispatcher rather than in `room-recipients.service.ts`, because that file is room-scoped by name and documentation. A comment on it says that if a second org-scoped dispatcher ever appears, both resolvers should move into one shared recipients module rather than a third copy being written.

**A dispatcher, `services/org-broadcast.service.ts`,** following the `event-lifecycle-notification.service.ts` pattern exactly — same preference parsing, same per-recipient error isolation, same channel branching. It returns per-channel counts so the endpoint can tell the admin what actually went out rather than a bare success.

For `urgent`, web push is sent with `urgency: "high"`, which is what tells the push service and the receiving device to wake rather than batch. That option already exists on `PushOptions` and was added for attendance deadlines; a broadcast marked urgent is the same class of message.

**An email template and type.** Add `"org-broadcast"` to `EmailType`, a case in `sendEmailByType`, and `sendOrgBroadcastEmail` alongside the other senders. The body is admin-authored text, so it is escaped before interpolation into the HTML — an admin composing a broadcast must not be able to inject markup into every member's inbox.

**An endpoint,** `POST /admin/broadcasts`, behind `requireAuth` and `requireRole("admin")` like the rest of the admin router, validated by a new `OrgBroadcastSchema`.

It also gets its own rate limiter on the repo's shared fail-closed Redis store. A broadcast writes a row, a push, and an email for every member of the organisation — it is the single most expensive request an authenticated user can make, and the most damaging to repeat by accident. The existing limiters give us the pattern; this is the endpoint that most needs one.

**A composer page** at `/admin/broadcast`: title, body, priority, and a confirmation step showing the recipient count before sending. The confirmation exists because this action cannot be undone — once the emails are queued they are gone.

## 3. What this affects

**New surface, so nothing existing changes behaviour.** No existing route, service, or table is modified. The additions to `EmailType` and `sendEmailByType` are additive — every current case is untouched.

**What could break, or bite later:**

- **Cost and blast radius.** One request now fans out to every member of an organisation across three channels. For a large tenant this is the heaviest thing the system does. It runs through the existing SQS email path so the emails themselves are queued rather than sent inline, but the in-app and push writes happen in the request. If a tenant grows large enough, this endpoint should move to the queue entirely — noted, not done here.
- **Urgent bypasses mutes by design.** A user who muted email will still receive an urgent broadcast. That is the specified behaviour and it is what the "urgent" label means, but it is also a way for an admin to defeat a member's preferences. The composer states this plainly next to the priority control so the choice is made knowingly.
- **This is the first caller of `isCriticalNotificationEvent` for `ORG_BROADCAST`.** The rule has never executed in production. The tests cover both priorities specifically.
- **It runs inside the request's own tenant context,** like the event-lifecycle dispatcher and unlike the queue worker, so no background tenant wrapper is needed. If this ever moves to a background job, it will need one — the same trap documented in the PDF worker.

**How we would know if it broke:** send a `normal` broadcast to an account with email muted and confirm no email row is created; send an `urgent` one to the same account and confirm one is. Both are covered by tests, and both are visible in `email_deliveries`.

## 4. What to learn from this

**The concept: a declared capability is not a delivered feature.** Everything about `ORG_BROADCAST` — the enum value, the payload type, the channel list, even the special-case routing rule — was written, typechecked, and merged, and none of it did anything, because no code path ever constructed the event. The type system was fully satisfied by a feature that did not exist.

This is the same shape as two other findings in this codebase: a retention job with no caller, and an audit service with two call sites out of ten. In each case the mechanism was built and the wiring was not, and nothing failed loudly to say so.

**How to spot it.** For any capability you believe exists, search for its *callers*, not its definition. A symbol that is exported and never imported, an enum arm no switch produces, a function whose only references are its own tests — these are all the same signal. Coverage tools will not tell you: the tests pass because the tests call it, which is precisely the thing production does not do.

**The habit worth keeping:** when you add a declaration that something else is supposed to use — an event kind, a permission, a feature flag, a queue message type — either wire a caller in the same change, or open the ticket for the caller before you merge. A declaration with no caller is a to-do written in a language the compiler cannot check.
