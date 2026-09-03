# Auth rate limits cannot be lowered below 10,000 per minute

**Status:** planned
**Touches:** `packages/server/src/routes/auth.routes.ts`, `packages/server/src/config/env.ts`
**Ships with:** `fix/auth-rate-limiting`

---

## 1. What the code does today

Rate limiting is how we stop someone guessing passwords. If an attacker can try
a million passwords a minute, a weak password is guaranteed to fall eventually.
If they can try ten a minute, most attacks stop being worth running.

The auth routes have their own limiter, separate from the global one:

```ts
// packages/server/src/routes/auth.routes.ts:39-46
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(env.RATE_LIMIT_MAX, 10000),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:auth:"),
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});
```

And a second one for password recovery:

```ts
// packages/server/src/routes/auth.routes.ts:48-55
const recoveryLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(5, Math.floor(env.RATE_LIMIT_MAX / 10)),
  // ...
});
```

Now look at the defaults those read from:

```ts
// packages/server/src/config/env.ts:49-50
RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),   // 1 minute
RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10000),
```

Work through the arithmetic:

| Limiter | Formula | Result at default config |
|---|---|---|
| `authLimiter` | `Math.max(10000, 10000)` | **10,000 login attempts per minute** |
| `recoveryLimiter` | `Math.max(5, 10000/10)` | **1,000 reset attempts per minute** |

`Math.max` returns the **larger** of the two numbers. So `10000` is not a
default that can be tuned down — it is a **floor**. If an operator sets
`RATE_LIMIT_MAX=100` in SSM to harden the platform, `Math.max(100, 10000)` is
still `10000`. There is no value you can put in the environment that makes this
limiter restrictive. The configuration knob looks real and does nothing.

The surrounding code is good, which is what makes this easy to miss. The store
is Redis-backed and **fail-closed** — if Redis is down it throws rather than
letting requests through:

```ts
// packages/server/src/routes/auth.routes.ts:23-37 (abridged)
if (!redisClient.isOpen) {
  if (args[0] === "SCRIPT" && args[1] === "LOAD") return "dummy_sha_fallback";
  throw ApiError.internal("Rate limiter unavailable");
}
```

That is exactly right, and rarer than it should be. Someone thought carefully
about this file. The limit value is the one part that inverted its own intent.

There is a second gap. The limiter is keyed by IP address only (the library
default). An attacker with a hundred IP addresses gets a hundred separate
budgets against the same account.

---

## 2. What I am changing, and why

**Make the limits real constants, and key them on the account as well as the
IP.**

```ts
// Not derived from RATE_LIMIT_MAX. That variable tunes general API traffic;
// credential endpoints need a fixed, low ceiling regardless of what it says.
const AUTH_ATTEMPTS_PER_WINDOW = 10;
const RECOVERY_ATTEMPTS_PER_WINDOW = 5;

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: AUTH_ATTEMPTS_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:auth:"),
  // Key on email + IP so one IP cannot spray many accounts, and many IPs
  // cannot gang up on one account. Falls back to IP when there is no email.
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
    return email ? `${email}|${req.ip}` : (req.ip ?? "unknown");
  },
  skip: () => env.NODE_ENV === "test",
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});
```

And separately, lower the global default so it is a limit rather than a
formality:

```ts
// packages/server/src/config/env.ts:50
RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
```

**Why 10 and not 100?** A real person mistypes a password two or three times.
Ten attempts a minute is generous for a human and useless for a machine. If
support reports genuine lockouts, raise it deliberately with the reason written
down — do not pick a large number in advance "to be safe".

**Why constants instead of environment variables?** Because a security control
that any misconfiguration can silently switch off is not a control. General API
throughput is a tuning decision, so it stays in the environment. "How many
password guesses will we accept" is a policy decision, so it lives in the code
where a reviewer sees it change.

---

## 3. What this affects

**What could break — this is the important part**

**The E2E test suite will start failing unless we handle it.** Playwright logs
in repeatedly during a run, and `authLimiter` currently has **no `skip`**. It
does not fail today only because the limit is 10,000 and no test run gets close.
Drop it to 10 and the suite hits the wall immediately.

Note that the *global* limiter already solves this and shows us the pattern:

```ts
// packages/server/src/index.ts:122-123
skip: (req) => {
  if (env.NODE_ENV === "test" || process.env.NODE_ENV === "test") return true;
```

The E2E workflow sets `NODE_ENV: test` (`.github/workflows/ci.yml`), so adding
the same `skip` to `authLimiter` and `recoveryLimiter` keeps CI green. Add it in
the same commit as the limit change, not afterwards — otherwise the pipeline
goes red and someone "fixes" it by raising the limit again.

**Real users may now see 429 responses.** They could not before. Check that the
client handles a 429 from `/auth/login` with a readable message rather than a
generic failure — `packages/client/src/lib/api.ts` is where that decision lives.

**Shared IP addresses.** An office or school behind one NAT gateway shares an
IP. Keying on `email|ip` mostly solves this: two different people signing in
from the same office get two different keys. Only repeated failures on *the
same account* from *the same IP* count against each other, which is the exact
behaviour we want.

**Email casing.** The key lowercases and trims the email, so `Bob@x.com` and
`bob@x.com` share a bucket. Without that, an attacker changes one letter's case
and gets a fresh budget.

**What is unaffected**

- The Redis store, the fail-closed behaviour, and the `rl:auth:` / `rl:recovery:`
  key prefixes all stay exactly as they are.
- No schema change, no migration, no API shape change.
- Authenticated routes (`/me`, `/profile`, `/change-password`) are behind
  `requireAuth`, so they were never the brute-force target.

**How we would know if it broke**

- Send 11 failed logins for one email in a minute; the 11th returns 429.
- Send 11 failed logins for *different* emails from one IP; none are blocked —
  proving the key is per-account, not just per-IP.
- CI stays green, which proves the `skip` works.
- Watch for a spike in 429s on `/auth/login` in the first days after deploy. A
  spike from many distinct emails is an attack being blocked, which is success.
  A spike concentrated on a few emails is likely real users, and worth a look.

---

## 4. What to learn from this

**The concept: `Math.max` on a limit inverts what a limit means.**

A limit is a *ceiling*. `Math.max(configured, 10000)` says "never go below
10,000", which makes 10,000 a **floor**. The code reads like a safe default and
behaves like a guarantee that the control stays off.

The general rule: **when clamping a security value, ask which direction is
safe.** For a maximum-allowed count, safety is downward, so `Math.min` is the
clamp that preserves intent. For a minimum key length or a minimum hash cost,
safety is upward, and `Math.max` is right. Note that this same file gets it
right elsewhere — `Math.max(5, ...)` on the recovery limiter is a genuine floor
for a value that should never round down to zero. Same function, opposite
correctness, because the direction of safety differs.

**Second lesson: choose the rate-limit key deliberately.** The default is the
client IP, because that is all the library can assume. But the thing you are
protecting is usually not an IP — it is an account, a phone number, a coupon
code. Ask "what is the attacker trying to exhaust?" and key on that, with the IP
as an extra dimension rather than the only one.

**How to spot this elsewhere.** Grep for `Math.max` and `Math.min` near
anything named `limit`, `max`, `timeout`, `retries`, `size`, or `rounds`, and
check the direction each one protects. Then look for security controls whose
value is derived from a general-purpose configuration variable — if turning one
knob down for performance reasons also weakens a security control, those two
things should not have been sharing a knob.

**The habit worth keeping:** after writing any limit, substitute the real
default values and say the result out loud. "Ten thousand login attempts per
minute" is obviously wrong when spoken, and completely invisible when read as
`Math.max(env.RATE_LIMIT_MAX, 10000)`.
