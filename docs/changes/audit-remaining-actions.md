# The audit trail has gaps exactly where the evidence matters

**Status:** shipped
**Touches:** `packages/server/src/services/audit.service.ts`, `packages/server/src/controllers/room/room-crud.controller.ts`, `packages/server/src/controllers/form.controller.ts`, `packages/server/src/controllers/attendance.controller.ts`, `packages/server/src/controllers/settings.controller.ts`, `packages/server/src/controllers/report.controller.ts`, `packages/server/src/queues/worker.ts`, `packages/server/src/services/admin.service.ts`
**Ships with:** `feat/audit-remaining-actions` — closes #92

---

## 1. What the code does today

`audit.service.ts` declares ten action types:

```ts
type AuditAction =
  | "user.created" | "user.updated" | "user.deleted"
  | "room.created" | "room.updated" | "room.deleted"
  | "form.updated" | "attendance.created"
  | "report.generated" | "settings.updated";
```

**Two are ever written.** `user.deleted` from `admin.service.ts`, and
`user.updated` from the GDPR export in `profile.routes.ts`. The other eight are
a type declaration and nothing else.

The gaps are not random: they cover room lifecycle, form changes, attendance
submission, report generation and settings. For a product whose output is
verifiable attendance evidence, those are precisely the events an auditor would
ask about. "Who changed this form between the event and the report?" has no
answer in the data — and after #91 shipped a read path, the audit page shows
that emptiness to admins rather than hiding it in a table.

## 2. What I am changing, and why

**Every declared action now has a writer**, at the point where the change
commits:

| Action | Where | Before/after |
|---|---|---|
| `room.created` | `createRoom`, after the insert returns | after only |
| `room.updated` | `updateRoom` | both |
| `room.deleted` | `deleteRoom` | before only |
| `form.updated` | `saveRoomForm` | after (full field list) |
| `attendance.created` | `postAttendance` | after |
| `report.generated` | `report.controller` **and** `queues/worker.ts` | after |
| `settings.updated` | `updateOrganization`, `updatePreferences` | both, for preferences |
| `user.created` | `admin.service.createOrgUser` | after |

**`updateRoom` reads before it writes.** One extra scoped `SELECT` on an
admin-rate path, which is the whole cost of "what did it used to say" being
answerable. Without it the entry records what a room *became* and loses what it
*was*, which is the half that matters in a dispute.

**A `recordAuditSafely` wrapper, and this is the important decision.** The
audited operation has already committed by the time the entry is written — the
room exists, the user is deleted. If `recordAudit` throws there, a successful
operation becomes a 500, the caller retries, and a second room appears. So the
wrapper logs the failure loudly (an audit gap is a compliance problem worth
investigating) and lets the operation's result stand.

`recordAudit` itself still throws, and stays the right choice for a caller that
needs the entry inside the same transaction.

**The queue worker opens its own tenant context**, like every other write in
that file. There is no ambient request in an SQS consumer, so `db` falls back
to the bare pool with no `app.current_tenant` — and `audit_logs`' insert policy
would reject the row outright. The acceptance criteria call this path out
specifically, which suggests it has bitten before.

**`report.generated` fires from both delivery paths.** The inline download and
the async worker are two ways to produce the same artefact; auditing only one
would make the trail depend on whether `SQS_PDF_QUEUE_URL` happened to be set.
The `newValues` distinguishes them (`inline_download` vs `async_worker`) so the
entries are not silently ambiguous.

**Preference changes are audited only when the user has an organisation.**
`audit_logs` is tenant-scoped by RLS: an entry with no organisation cannot be
written, let alone read. A user toggling notifications before onboarding has no
tenant to record against, so that case is skipped rather than failed.

**Request metadata where a request exists.** `admin.service.createOrgUser` and
the worker have no `req` — threading one through purely for the audit entry
would be worse than the gap it fills, so those entries record who and what
without ip/user-agent.

## 3. What this affects

**Write volume on `audit_logs` rises sharply.** `attendance.created` is the one
to watch: it fires once per attendance submission, which is the highest-volume
write in the product. The table now grows roughly in proportion to attendance
rather than to administrative actions. `audit_logs_org_created_idx` from #91
keeps reads fast, and #93's retention job is what will eventually bound the
size — worth revisiting the retention period once real volume is visible.

**Every audited operation does one extra insert**, and `updateRoom` one extra
select. On admin-rate paths that is invisible; on `postAttendance` it is one
more write on the hot path. Acceptable for the evidence it produces, and the
failure is non-fatal by construction.

**A test asserts every declared action has a writer**, by scanning the server
source for each `AUDIT_ACTIONS` value outside `audit.service.ts` itself. This
was verified to fail when an action has no writer — a deliberately unwired
action was added, the test failed, and it was removed. Without that check, the
first criterion of this ticket would silently regress the next time someone
adds an action.

**How we would know it broke.** Create a room, edit it, delete it; save a form;
submit attendance; download a report; change an organisation's name — then open
the audit page (#91) and confirm exactly one entry per action, with the actor
and both value sides where expected. The worker path needs an actual SQS job to
exercise.

## 4. What to learn from this

**A declaration is not an implementation, and a type is a particularly
convincing disguise.** Ten action types read as ten audited operations. The
type checker confirms every *use* is valid and says nothing about which are
used at all — so the gap survived review by looking complete. Any enum whose
members represent work to be done deserves a test that each is actually
reachable.

**Instrumentation must never be able to fail the thing it observes.** An audit
write, a metric, a trace and an analytics event are all secondary to the
operation, and all of them run after it has committed. If any can throw, a
monitoring outage becomes a product outage — and worse, a retried one, since
the caller sees a failure for something that actually succeeded. The wrapper is
one function; the discipline is deciding once that observation is best-effort
and the operation is not.

**Coverage of a rule is itself testable.** "Every X has a Y" is a property of a
codebase, and a per-file test cannot see it — only a test that enumerates X and
searches for Y can. When such a test is written, check that it *fails* for a
deliberately missing case before trusting it; a scan that always passes is
worse than none, because it reads as proof.
