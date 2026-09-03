# The onboarding document describes a codebase that has moved

**Status:** shipped
**Touches:** `CLAUDE.md`
**Ships with:** `docs/onboarding-drift` — closes #96

---

## 1. What the code does today

`CLAUDE.md` is the file agents and new engineers read first, so a false
statement in it is not a typo — it is a wrong instruction that gets followed.

The two specific claims the issue names were **already corrected** in
`76754c3` ("docs: correct drifted claims in CLAUDE.md"), earlier in this same
remediation run:

- the refresh cookie is documented as `Eventclick_rt`, and
  `auth.controller.ts` sets `const REFRESH_COOKIE = "Eventclick_rt"` — they
  match;
- the testing section documents Vitest across shared/client/server plus
  Playwright in `e2e`, which is what the pipeline runs.

Verifying rather than assuming that turned up **two different false claims**,
both introduced by work done since the issue was filed:

**The lint claim, made false by #94.**

```markdown
- `npm run lint` — only `client` has ESLint wired up; server/shared `lint` scripts are no-ops.
```

True when written. #94 gave both packages real ESLint configs and removed the
`echo ... && exit 0` scripts, so the line now tells a reader the backend is
unlinted when a lint error there will fail their build.

**The `validate` middleware claim, made false by Express 5.**

```markdown
- `middleware/validate.ts` — runs `schema.safeParse(req[source])` and **replaces**
  `req.body`/`query`/`params` with the parsed value.
```

`query` does not work. Express 5 exposes `req.query` through a getter that
re-derives the object, so both assignment and in-place mutation are silently
discarded — the handler goes on reading raw, uncoerced strings with no error
anywhere. This was found while building #91 and verified against express
5.2.1; `validate.ts` itself carries the warning, but the onboarding doc still
promised behaviour the middleware does not have. That is the worse of the two:
a reader follows it, gets no error, and ships a handler parsing strings as
though they were numbers.

## 2. What I am changing, and why

**The lint line now describes what exists** — all three workspaces, the
`.mjs` config extension and why it is required, and that errors fail CI while
`no-explicit-any` is a warning against the existing backlog.

**The `validate` line now states the Express 5 limitation** and points at the
alternative, with the two controllers that already do it correctly named as
examples. It says `body`/`params` are replaced as documented, so the useful
half of the sentence survives.

**Every other documented claim was checked against the code**, per the
acceptance criteria, rather than assumed correct because it looked plausible:

| Claim | Verified against |
|---|---|
| Refresh cookie `Eventclick_rt` | `auth.controller.ts:24` |
| Dev ports: server 4000, client 3000 | `env.ts` `PORT` default, `vite.config.ts` `port` |
| `db:generate` / `db:migrate` / `db:push` / `db:studio` exist | `packages/server/package.json` scripts |
| Root `dev`/`build`/`lint`/`typecheck`/`test` are turbo tasks | root `package.json` |
| e2e runs Playwright | `packages/e2e/package.json` |
| Shared resolves through `dist/` | `packages/shared/package.json` `main`/`types` |
| Client aliases shared to `../shared/src` | `vite.config.ts:79` |
| `API_PREFIX` is `/api/v1` | `packages/shared/src/index.ts` |
| Three database URLs and their roles | `db/index.ts`, `db/migrate.ts` |

`npm run lint` and `npm run typecheck` were then executed to confirm the
commands the file documents actually run.

## 3. What this affects

**Documentation only.** No behaviour changes.

**The `validate` correction is the one with teeth.** Anyone who reached for
`validate(schema, "query")` on the strength of the old line would have shipped
a handler reading raw strings — and, because nothing throws, would have found
out from a bug report rather than a test.

**This file drifts because it describes things that change.** Two of its
claims went stale during a single remediation run, both from changes made in
that run. The lesson in §4 is about that rate, not about these two lines.

**How we would know it broke.** The claims are checkable by construction: each
row of the table above names the file that would contradict it. The lint line
is the one most likely to go stale next, since it describes configuration
rather than code.

## 4. What to learn from this

**A document read by agents is executable, and stale lines in it are bugs
with a delay.** Ordinary documentation drift wastes a reader's time; an
onboarding file that says "the linter is not wired up" or "this middleware
parses query strings" produces wrong work from someone acting in good faith.
The blast radius is proportional to how much the file is trusted, which is
exactly why the most-read file deserves the most verification.

**Check the claims a change makes false, in the same change that makes them
false.** #94 wired up linting and left a line saying linting was not wired up.
The fix is not more diligence later — it is treating "which documented claims
does this touch?" as part of the change itself, the same way a renamed
function's call sites are.

**Verify by execution, not by reading.** Every claim corrected here looked
plausible in review, and two of them were wrong. `grep` for the constant,
run the command, check the config file — the cost is a minute each and it is
the only thing that distinguishes a documented fact from a documented
assumption.
