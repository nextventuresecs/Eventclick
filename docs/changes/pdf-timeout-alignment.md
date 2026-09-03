# The renderer outlives the request that asked for it

**Status:** shipped
**Touches:** `packages/server/src/services/report.service.ts`, `packages/server/src/controllers/report.controller.ts`, `packages/server/src/queues/worker.ts`, `packages/server/src/config/constants.ts`, `packages/server/src/utils/errors.ts`
**Ships with:** `fix/pdf-timeout-alignment` — closes #90

---

## 1. What the code does today

The renderer is given two minutes:

```ts
// packages/server/src/services/report.service.ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120_000);
```

The HTTP server closes any request after thirty seconds:

```ts
// packages/server/src/config/env.ts
SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
```

On the synchronous download path the inner deadline is four times the outer
one, so **the request is always killed first**. The renderer never learns
about it: Gotenberg keeps working for up to another ninety seconds on a PDF
that has nowhere to go. Its queue is small, so that orphaned work crowds out
live requests — and before the tenant-connection fix landed, the abandoned
request also held a database connection for its full thirty seconds.

From the caller's side there is no error to read, only a connection that
closes. "The report download sometimes just stops" is the report that comes
back, and nothing in the logs contradicts it.

The asynchronous path has a variant of the same bug:

```ts
// packages/server/src/queues/worker.ts
const pdfBuffer = await Promise.race([
  generateVerificationReportPdf(roomId, orgId, user),
  new Promise<Buffer>((_, reject) =>
    setTimeout(() => reject(new Error("PDF generation timed out")), PDF_GENERATION_TIMEOUT_MS),
  ),
]);
```

`Promise.race` settles the *outer* promise. The `fetch` it was racing is not
cancelled and carries on to completion — so the worker's timeout also leaves
a render running that nobody will collect.

## 2. What I am changing, and why

**The render deadline is derived from the request timeout, not written next to
it.**

```ts
const renderTimeoutMs = Math.max(
  1_000,
  env.SERVER_REQUEST_TIMEOUT_MS - PDF_SYNC_RENDER_MARGIN_MS,
);
```

The margin is what makes the inner deadline fire *first*, leaving time to
write a real response after the abort. Deriving it means the two cannot drift:
raising `SERVER_REQUEST_TIMEOUT_MS` raises this with it, and no one has to
remember that a second number exists. The floor keeps a very short configured
request timeout from producing a non-positive deadline.

**A hung renderer now produces a 504 rather than a closed socket.**
`ApiError.gatewayTimeout` is a new factory, and the distinction is the point:
a 504 tells the caller the renderer ran out of time and the request is worth
retrying, where the previous generic 500 — on the occasions the request
survived long enough to send one — said only that something went wrong.

**The render aborts when the caller hangs up.** The controller wires
`req.on("close")` to an `AbortController` passed into the service, so a client
that navigates away stops the work rather than leaving it to finish into a
void. The handler then returns without writing, since writing to a closed
socket throws.

**The worker passes a real deadline instead of racing one.** Now that the
service accepts `timeoutMs`, the worker hands its own generous value in and
the abort reaches the actual `fetch`. It keeps 120s deliberately: there is no
HTTP request bounding that path, and a large report legitimately takes longer
than any request should wait.

**Both paths are documented at the branch**, which the acceptance criteria ask
for explicitly:

| `SQS_PDF_QUEUE_URL` | Behaviour |
|---|---|
| set | `202 Accepted` + `jobId`; the worker renders with the 120s deadline. Production shape. |
| unset | Rendered inline, bounded by the request timeout. Local development and small events. |

The synchronous path is retained rather than removed because it is what makes
the product work with no SQS configured at all.

## 3. What this affects

**Large reports on the synchronous path now fail faster, and say so.** A report
that genuinely needs more than ~25 seconds to render will return a 504 where
it previously returned nothing at all after 30. That is not a regression — it
never succeeded in that window — but it will look like one to anyone who read
the old silence as "still working". The 504's message names the queued path as
the alternative.

**Configuring `SQS_PDF_QUEUE_URL` is the real fix for large events**, and this
change makes that visible rather than implied.

**The worker's failure mode changes shape.** It previously rejected at 120s
while the render continued; it now aborts the render at 120s. Same deadline,
but the renderer is actually freed.

**How we would know it broke.** Generate a report for the largest event in
staging with `SQS_PDF_QUEUE_URL` unset and confirm it still completes inside
the new deadline — this is the acceptance criterion that needs real data and
cannot be checked from here. Then point `GOTENBERG_URL` at something that
never answers and confirm the caller receives a 504 with a readable message
rather than a dropped connection.

## 4. What to learn from this

**Nested deadlines only work if the inner one is shorter, and the way to
guarantee that is to derive it.** Two independently written timeouts —
`120_000` in a service and `30_000` in config — will eventually contradict
each other, and the contradiction is silent: everything appears to work, the
inner timeout simply never fires. Any time a timeout is written as a literal,
ask what encloses it and whether that relationship is expressed anywhere the
compiler or a test can see.

**`Promise.race` against a timer is not a timeout, it is a way to stop
waiting.** The losing promise keeps running to completion, holding whatever it
held. For anything with a real resource behind it — an HTTP request, a
renderer, a database query — the cancellation has to reach the operation
itself, which in practice means an `AbortSignal` the callee honours. Racing is
the right tool only when the abandoned work is genuinely free.

**A silently closed connection is the worst available error.** It carries no
status, no message, and nothing to search logs for, so it gets reported as
flakiness and investigated as a network problem. When a deadline exists,
make sure something is still alive to *report* that it was hit — which is
exactly what the margin between the two timeouts buys.
