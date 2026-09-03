# Server and shared were never linted

**Status:** shipped
**Touches:** `packages/server/eslint.config.mjs`, `packages/shared/eslint.config.mjs`, `packages/server/package.json`, `packages/shared/package.json`
**Ships with:** `chore/real-linting` — closes #94

---

## 1. What the code does today

```json
// packages/server/package.json, packages/shared/package.json
"lint": "echo \"(lint not configured yet)\" && exit 0"
```

The root `npm run lint` is `turbo run lint`, which fans out to every
workspace's `lint` script. Two of the three workspaces' scripts do nothing and
report success. CI's "Lint and Security Audit" job runs this, sees green, and
has therefore never once reported a finding about `packages/server` or
`packages/shared` — the two packages that hold the RLS policies, the tenant
context handling, and every piece of auth logic in the product.

Separately, `eslint` was listed under `packages/server`'s `dependencies`
rather than `devDependencies`. `Dockerfile.prod`'s runner stage installs with
`npm ci --omit=dev`, so this had no runtime effect today, but it was one
`package.json` edit away from shipping a linter into the production image.

## 2. What I am changing, and why

**Real ESLint configs for both packages**, `eslint.config.mjs` (the `.mjs`
extension matters — both packages declare `"type": "commonjs"`, and a bare
`.js` config makes Node warn and then fail to load it as ESM).

**The non-type-checked `recommended` preset, not `strictTypeChecked`.**
Type-aware linting on a codebase this size produces a backlog measured in
hundreds of findings, most of them stylistic, and the realistic outcome of
shipping that is someone disabling the whole rule set in frustration.
`tsc --noEmit` already runs as its own CI step and covers type-correctness;
this config covers the other half — dead code, unreachable branches, unused
bindings.

**No formatting rules.** The acceptance criteria call this out explicitly:
rules must not contradict the codebase's existing style, or the change becomes
a whitespace rewrite. Nothing here reformats anything.

**`@typescript-eslint/no-unused-vars` respects the codebase's existing
underscore convention** (`argsIgnorePattern: "^_"`) rather than inventing a
new one — middleware throughout the server already names an unused `next`
parameter `_next`.

**`no-explicit-any` is a warning, not an error.** The nineteen existing uses
were read individually before this decision: `session.service.ts`,
`storage.service.ts`, `push.service.ts` and `report.service.ts` each reach for
`any` where a third-party type is absent or wrong, matching the existing
in-file comments explaining why. None were silently-wrong code the linter
happened to catch. Downgrading the whole codebase's typing discipline in one
commit is a bigger change than "wire the linter"; flagging the existing set as
warnings makes new occurrences visible in review without failing the build on
the backlog.

**The twelve genuine errors were fixed, not suppressed** — the acceptance
criteria explicitly rule out blanket suppression:

- Ten were dead imports and dead local bindings (an unused type import, an
  unused `Request` type, an unused `requireRole`, a `let` that was never
  reassigned).
- **`services/activity.service.ts`'s `submissionMap` was not just unused — it
  was the result of an unused query.** `validateActivityQuotas` was fetching
  every activity submission for a room, building a `Map` from it, and then
  never reading that map anywhere in the function. Removing the dead binding
  meant removing the `SELECT * FROM activity_submissions WHERE room_id = ?`
  that produced it — an unnecessary full-table read on every quota check,
  found only because the linter flagged the value it was building as unused.
- `routes/room.routes.ts`'s unused `canViewReports` was checked before
  deletion, since a stale authorization constant deserves more scrutiny than a
  stale import: the report-download route already guards inline with
  `requirePermission("view_reports")` at its own call site, so this was a
  leftover duplicate, not a route that lost its guard.
- `auth-registration.service.ts`'s unused `meta` parameter is kept and
  renamed to `_meta` rather than deleted, with a comment explaining why:
  `registerUser`'s signature must match `loginUser`/`googleLogin`'s even
  though registration does not create a session (email verification happens
  first).

**`eslint` moved to `devDependencies`** in `packages/server/package.json`, and
added as a `devDependency` (not a runtime one) to `packages/shared`. Verified
with `npm ls eslint --omit=dev`, which now returns empty in the server
workspace.

**No CI change was needed.** The root `lint` script was already
`turbo run lint`, and `turbo.json` already declares a `lint` task with no
package filter — it was fanning out to all three workspaces the whole time.
Two of them just had nothing to run.

## 3. What this affects

**CI's lint stage now genuinely checks the server and shared packages for the
first time.** Zero errors, nineteen warnings, all reviewed above.

**One query fewer per attendance-quota check.** The `submissionMap` removal is
a small but real behavioural change: `validateActivityQuotas` no longer
fetches every submission for a room when checking whether photo quotas are
met. Worth confirming the quota logic (which only reads `allPhotos`) was
already correct without that map — it was; the map was dead from the start.

**The production image is unchanged in this run** (the runner stage already
excluded dev dependencies), but is now correct by construction rather than by
accident: `eslint` cannot reach it even if some future change adds a
dependency on the server workspace's dev tooling elsewhere.

**How we would know it broke.** `npm run lint` from the root should show
`server:lint` and `@application/shared:lint` as real steps with their own
output, not silently succeed. `npm ls eslint --omit=dev --workspace=server`
should stay empty.

## 4. What to learn from this

**An `echo ... && exit 0` lint script is a green checkmark with nothing behind
it.** It passes every CI run, appears in the same place a real lint step
would, and is indistinguishable from "this codebase is clean" unless someone
opens the script. Grep any monorepo's `package.json` files for `lint` and
read what each one actually does — a script that always exits 0 without
running a tool is not a stricter or looser choice, it is silence dressed as a
pass.

**An unused variable is sometimes a symptom, not the disease.** The
`submissionMap` finding looked like ordinary dead-code cleanup and was
actually a dead query — the linter caught the value, and reading why it was
unused caught the wasted `SELECT`. Treat every "assigned but never used"
finding as a question — *why was this computed?* — not just a deletion
target.

**Move a dependency's declared type deliberately, and verify it.** `eslint`
sat in `dependencies` with no observable effect until someone changed how the
image is built. `npm ls <pkg> --omit=dev` is the direct way to confirm a
dependency's classification actually matches where it can reach — cheaper
than trusting the `package.json` section it happens to be listed under.
