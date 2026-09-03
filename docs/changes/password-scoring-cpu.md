# Password scoring lets the caller choose how long to block the server

**Status:** shipped
**Touches:** `packages/server/src/utils/passwordStrength.ts`, `packages/server/src/services/auth/auth-password.service.ts`, `packages/server/src/services/auth/auth-registration.service.ts`
**Ships with:** `fix/password-scoring-cpu` — closes #88

---

## 1. What the code does today

Four write paths score a password with zxcvbn, each repeating the same six
lines:

```ts
const pwdScore = zxcvbn(newPassword);
if (pwdScore.score < 3) {
  throw ApiError.badRequest(`Password is too weak. ${pwdScore.feedback.warning || "Please choose a stronger password."}`);
}
```

Registration, password change, password reset, initial password set. The rule
itself is good — zxcvbn measures guessability rather than counting character
classes, and score 3 is a defensible bar.

**zxcvbn is synchronous and CPU-bound, and the caller chooses its input
length.** `PasswordSchema` allows up to 128 characters, and zxcvbn's cost grows
superlinearly with length. Measured in this repo (Node 24, 30–40 iterations per
case):

| length | random | dictionary-ish |
|--------|--------|----------------|
| 16     | 1.5ms  | 1.4ms  |
| 24     | —      | 3.4ms  |
| 32     | 6.0ms  | 7.3ms  |
| 64     | 25.9ms | 34.5ms |
| 128    | 101ms  | **149ms** |

Because it is synchronous, that time is not the caller's own latency — it is
the **event loop**, so every concurrent request on the process waits. A single
client POSTing 128-character passwords to `/auth/register` stalls the whole
server for ~150ms per request, on a two-vCPU instance that also hosts Postgres,
Redis and Gotenberg.

Until #79 landed, the auth rate limiter was `Math.max(RATE_LIMIT_MAX, 10000)` —
effectively unlimited — so this was a trivial single-source denial of service
with no tooling beyond `curl` in a loop.

## 2. What I am changing, and why

**One module, `utils/passwordStrength.ts`, that all four call sites use**, so
the threshold and the message are one value in one place rather than four
copies that happen to agree.

**The scored input is capped at 32 characters.**

```ts
const result = zxcvbn(password.slice(0, MAX_SCORED_PASSWORD_CHARS));
```

That bounds the worst case at roughly 7ms instead of 149ms — about a 20×
reduction — and it removes the part the attacker controls, which is what makes
this a denial of service rather than merely a slow function.

**Truncation cannot weaken the rules.** Adding characters to a string only
increases the guesses needed, so a 32-character prefix scoring at or above the
threshold guarantees the full password does too. The converse — a weak prefix
followed by strong material — is now rejected, which is *stricter* than before
and the safe direction to err in.

**There is deliberately no "obviously strong, skip scoring" fast path.** It was
the tempting optimisation, and it is unsafe. `Qwerty123456!@Ab` is 16
characters, has all four character classes and 16 distinct characters — and
zxcvbn scores it **2**, below the threshold. Any heuristic cheap enough to
avoid the scoring cost would accept it, which is exactly the "rules get weaker"
outcome this change must avoid. zxcvbn stays the authority; it is simply no
longer handed unbounded input.

**Why not a worker thread.** Offloading is the textbook answer to "CPU-bound
work on the event loop", and it was the wrong tool here. `packages/server` is
`"type": "commonjs"` and builds with a bare `tsc`, so a hand-written `.cjs`
worker in `src/` never reaches `dist/`, and a `.ts` worker needs a loader in
the `Worker` constructor that differs between `tsx` in development and
`node dist` in production. That is a build change and two runtime paths added
to a security fix — cost far above the ~7ms the cap already achieves.

## 3. What this affects

**A password whose first 32 characters are weak is now rejected**, where it
would previously have been accepted if later characters carried the entropy.
The realistic version of this is a passphrase with a long common prefix.
Password-manager output — random across its whole length — is unaffected, and
so is anything a human types under 32 characters.

**The remaining 7ms is still synchronous**, and this is worth being honest
about: the event loop is still blocked, just briefly and by a bounded amount.
Combined with #79's now-real limit of 10 auth attempts per minute per
account+IP, the worst a single key can spend is ~70ms per minute. That is the
argument for the acceptance criterion about bursts not degrading unrelated
endpoints — not that the work moved, but that its per-request ceiling and its
request rate are both bounded now.

**Behaviour for every legitimate password is unchanged**: same threshold, same
error message, same zxcvbn feedback passed through.

**How we would know it broke.** Register with a strong password, change a
password, reset one, and set an initial one from an invite — all four paths use
the shared helper now. Then time `/auth/register` under a burst of long
passwords and confirm unrelated endpoints stay responsive.

## 4. What to learn from this

**Any synchronous, superlinear function whose input the caller controls is a
denial of service.** The dangerous combination is all three properties
together: synchronous makes it everyone's problem rather than the caller's,
superlinear means a modest input increase buys a large cost increase, and
caller-controlled means the attacker picks the point on that curve. Password
scoring, regex matching, JSON parsing, image decoding and diffing all fit —
and the first question for each is "what bounds the input?"

**Measure before choosing the mitigation.** "CPU-bound work on the event loop"
reads like it demands a worker pool, and the numbers said otherwise: a 32-
character cap achieved a 20× reduction for one line of code, where the worker
route needed a build change and two runtime paths. Twenty minutes of
benchmarking chose a materially cheaper fix.

**When a heuristic would let you skip an expensive check, test whether it
agrees with the check.** The fast path here was discarded because a single
counter-example refuted it — a password the heuristic called strong and the
scorer called weak. Optimisations that bypass a security control need that
counter-example search *before* they ship, not after someone notices weaker
passwords getting through.
