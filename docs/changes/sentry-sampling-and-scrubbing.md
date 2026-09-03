# Error tracking traces everything, profiles everything, and redacts nothing

**Status:** shipped
**Touches:** `packages/server/src/instrument.ts`, `packages/server/src/utils/sentryScrub.ts`, `packages/server/src/utils/logger.ts`, `packages/server/src/config/env.ts`, `docker-compose.prod.yml`
**Ships with:** `fix/sentry-sampling-and-scrubbing` — closes #83

---

## 1. What the code does today

After #82 moved initialisation into `instrument.ts`, the configuration it
carries over is unchanged from the original:

```ts
Sentry.init({
  dsn: env.SENTRY_SERVER_DSN,
  environment: env.NODE_ENV,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});
```

Three separate problems live in those five lines.

**Everything is traced and profiled, unconditionally.** `1.0` means every
transaction is sampled and every one of them profiled. Profiling is a sampling
profiler: it interrupts the process on a timer to collect stacks. The
production host is a two-vCPU instance that also runs Postgres, Redis and
Gotenberg — the CPU this costs is CPU those need, and the events all count
against quota.

**Nothing is scrubbed on the way out.** The logger is careful:

```ts
// packages/server/src/utils/logger.ts
const redactPaths = ["req.body.password", "password", "passwordHash",
                     "tokenHash", "refreshToken", "idToken", "accessToken", ...];
```

Sentry knows nothing about that list. A 500 thrown from a login handler
reports the request body as captured — password included. The redaction is
real, and it covers exactly one of the two paths data leaves the process by.

**No release is attached.** Every issue is unattributed, so "did this start
with the last deploy?" — the first question anyone asks — cannot be answered
from the issue itself.

## 2. What I am changing, and why

**Sampling becomes environment policy, not a constant.**

```ts
const tracesSampleRate = env.SENTRY_TRACES_SAMPLE_RATE ?? (isProduction ? 0.05 : 1.0);
const profilesSampleRate = env.SENTRY_PROFILES_SAMPLE_RATE ?? (isProduction ? 0 : 1.0);
```

Production traces 5% and profiles nothing; development keeps full fidelity,
where the CPU is free and the detail is what makes the tool worth having. Both
are env-overridable, so raising sampling to investigate something is a restart,
not a deploy of new code.

Profiling is removed from `integrations` entirely when its rate is zero rather
than merely sampled to zero — the integration installs a profiler whose cost is
not free just because nothing is being kept.

**Errors are not sampled.** Only *transactions* are. This is worth stating
because "5% sampling" sounds like it might drop 95% of errors; `tracesSampleRate`
governs performance data, and every exception still reports.

**A release identifier, from the tag that was actually deployed.**
`scripts/deploy.sh` already runs with `IMAGE_TAG` set to the short SHA, so
`docker-compose.prod.yml` passes it through as `SENTRY_RELEASE`. No new source
of truth — the same string that names the running image names the release.

**An outbound scrubber, derived from the logger's list.** This is the part
worth care. `utils/sentryScrub.ts` walks the event and replaces the value of
any field whose *name* appears in the logger's redaction list.

Field name, not path, because a Sentry event nests request data in shapes the
logger's paths do not describe — `request.data.password`,
`contexts.state.password`, `extra.body.password` are all the same secret, and a
path-based list would have to enumerate every shape the SDK produces.

The list is **imported** from `logger.ts`, not restated:

```ts
export const SENSITIVE_FIELD_NAMES = [...new Set(REDACT_PATHS.map(leafOf))];
```

Two independently maintained redaction lists drift, and the way you discover
which half drifted is by finding a password in a bug report. Deriving one from
the other means adding a path to the logger protects the Sentry payload too,
with nothing to remember. A test asserts every logger path has a corresponding
scrubber field.

The walk is depth-capped and cycle-safe. Captured context legitimately contains
cycles (an Express `req` referencing its `res`), and scrubbing must not become
the reason a process stalls while reporting an error.

## 3. What this affects

**Performance data gets thinner in production, deliberately.** With 5%
sampling, a low-traffic endpoint may produce no transactions for long stretches,
and percentile latency from Sentry becomes unreliable at small volumes. That is
an accepted trade here because #84 puts real latency histograms in Prometheus,
which is the right place for them; Sentry's tracing is for exemplars, not
measurement.

**Scrubbing changes what reaches Sentry for existing issues too** — new events
only, not retroactively. Anyone who has been reading request bodies out of
Sentry issues will find those fields replaced with `[REDACTED]`.

**A scrubber that is too aggressive would hide useful data.** It matches on
exact field names from the logger's list, so a field named `passwordPolicy`
is untouched while `password` is redacted. The risk is the reverse of the usual
one: a *new* secret-bearing field name added to a request body is protected in
neither logs nor Sentry until someone adds it to `REDACT_PATHS`. That list is
now the single place to add it, which is the improvement.

**How we would know it broke.** Submit a login with a deliberately wrong
password in staging, force a 500, and confirm the Sentry event shows
`[REDACTED]` where the password was. Check any issue carries a `release`
matching the deployed image tag. Watch CPU on the production host after deploy —
if profiling was a meaningful share of it, this is where that shows up.

## 4. What to learn from this

**Redaction has to cover every outbound path, and there is always more than
one.** A carefully redacted logger proves someone thought about secrets; it
does not prove secrets stay in. Error tracking, metrics labels, analytics
events, crash reports, support-bundle exports and audit logs are all ways data
leaves a process, and each needs the same list applied. The question to ask is
not "do we redact?" but "how many exits are there, and which of them apply it?"

**When two things must agree, derive one from the other.** Any invariant
maintained by discipline — "remember to update both lists" — is an invariant
that will be broken, and broken silently. Importing the list makes agreement
structural. Where derivation is genuinely impossible, a test that fails when
they diverge is the fallback.

**Sampling rates are environment policy, not code.** The right rate depends on
traffic, host capacity and quota, none of which the code knows. A constant
forces a deploy to change a number that operations should be able to turn; an
env var with a sensible per-environment default gives both.
