# The security gates report, they do not block

**Status:** shipped
**Touches:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.gitignore`, `package-lock.json`
**Ships with:** `chore/ci-security-gates` — closes #95

---

## 1. What the code does today

### The dependency audit cannot fail

```yaml
- run: npm audit --audit-level=high
  continue-on-error: true
```

`continue-on-error: true` means a high-severity advisory turns the step orange
and the pipeline carries on — through the unit tests, through E2E, and into
`deploy.yml`, which chains off CI completing on `main`. A gate that cannot
fail is a report.

At the time of writing it had three high-severity advisories to not-fail on:

| Package | Advisory |
|---|---|
| `brace-expansion` | DoS via unbounded intermediate arrays (bypasses the CVE-2026-14257 mitigation) |
| `fast-uri` | Five separate issues — SSRF via malformed IPv6 normalisation, SSRF via repeated hostname percent-decoding, and three host-confusion variants |
| `nanoid` | Custom generators loop indefinitely when size is zero |

`nanoid` is a direct dependency of `packages/server` and is what generates
share tokens.

### Nothing looks inside the images

`deploy.yml` builds two images, pushes them to ghcr.io, and deploys them to
EC2 unattended. No step scans either one. The application's own dependency
tree is audited (weakly, see above); the base image, the OS packages layered
on top of it, and anything the build stage leaves behind are not looked at by
anything.

### The environment-file ignore matches directories only

```gitignore
.env
.env.*/
```

The trailing slash on the second line makes it a **directory** pattern.
`.env.local`, `.env.production`, `.env.staging` and every other real variant
were therefore not ignored at all — the bare `.env` on the line above was the
only thing standing between a developer's local secrets file and a commit.

Verified rather than assumed, by creating each variant and asking git:

```
IGNORED   .env
TRACKABLE .env.local            <-- leak risk
TRACKABLE .env.production       <-- leak risk
TRACKABLE .env.staging          <-- leak risk
TRACKABLE .env.development.local<-- leak risk
```

## 2. What I am changing, and why

**The audit gate blocks**, and the advisories were cleared *first*.

Turning the gate on over a known-failing tree produces a red pipeline that
someone reverts within a day, so the order matters: `npm audit fix` (not
`--force` — every high had a non-breaking fix available) resolved all three
highs, `npm audit --audit-level=high` was confirmed to exit `0`, and only then
was `continue-on-error` removed.

Four moderate advisories remain, in `esbuild`/`drizzle-kit` build tooling that
never runs in production. They sit below the `--audit-level=high` threshold
and clearing them requires a breaking `npm audit fix --force`, so they are
left — the gate's threshold is the recorded decision, not an oversight.

**A `scan` job between `build` and `deploy`.** Trivy, failing on
`HIGH,CRITICAL`, over both published images. Placing it as its own job rather
than a step in `build` makes the gate legible in the Actions UI, and
`deploy.needs` becomes `[build, scan]` so a vulnerable image can be published
but **cannot reach production**.

`ignore-unfixed: true` is a deliberate choice worth naming: base-image CVEs
with no available patch would otherwise block every deploy indefinitely, and a
gate that can never go green is a gate someone deletes. This fails only on
findings that have a fixed version to move to — the ones that are actually
actionable.

**`.env.*` without the trailing slash**, with negations so the four committed
placeholder templates stay tracked:

```gitignore
.env.*
!.env.example
!.env.*.example
```

Both halves were verified: all five leak variants now report `IGNORED`, and
`.env.example`, `.env.production.example`, `packages/server/.env.example` and
`packages/e2e/.env.example` all still report as tracked.

**No environment file is in history** — confirmed, not assumed:

```
$ git log --all --pretty=format: --name-only --diff-filter=A | grep '\.env'
.env.example
.env.production.example
packages/e2e/.env.example
packages/server/.env.example
(plus two .env.example files under .agents/skills/)
```

Only `.example` templates, and `.env.production.example` was read line by line
to confirm its values are placeholders (`CHANGE_ME_...`, `ADD_TO_SSM`,
`YOUR_LIVEKIT_API_KEY`) rather than real credentials.

## 3. What this affects

**A high-severity advisory now stops the pipeline**, including for changes
that have nothing to do with the vulnerable package. That is the intended
behaviour and it is also the cost: an advisory published against a transitive
dependency will block unrelated work until someone deals with it. The
alternative is the status quo, where it blocks nothing and is noticed by
nobody.

**Deploys can now fail for a reason that is not the code.** A base-image CVE
disclosed between two deploys will fail the scan on a commit that did not
introduce it. `ignore-unfixed` keeps that to the actionable set, and the fix is
usually a base-image bump.

**The scan adds a job to the deploy path** — roughly a minute per image, on
the critical path to production.

**Existing local `.env.local` files stay put.** The ignore change affects what
git *would* stage, not the working tree. Anyone who already committed such a
file would need history rewriting — nobody has, per the check above.

**How we would know it broke.** Create `.env.local` with a dummy value and
confirm `git status` does not offer it. Watch the first deploy after this
merges for the new "Scan Images" job. To confirm the audit gate is live,
`npm audit --audit-level=high` locally should exit `0`; if a future advisory
lands, CI's lint job goes red rather than orange.

## 4. What to learn from this

**`continue-on-error` on a security step converts it into decoration.** It
runs, it produces output, it appears in the job list with a tick beside it,
and it changes nothing about what ships. Any check whose purpose is to stop
something must be able to stop it — and the way to tell the difference is to
ask what happened the last time it found something, not whether it is
configured.

**Turn a gate on in the right order: clear the backlog, verify green, then
remove the escape hatch.** A gate switched on over a failing tree fails
immediately, blocks everyone, and gets reverted — after which it is
politically harder to turn on a second time. The escape hatch is removed last,
not first.

**A trailing slash in a gitignore pattern silently narrows it to
directories.** `.env.*/` and `.env.*` look near-identical in review and differ
completely in effect. Ignore rules are worth verifying by execution —
`git check-ignore` answers directly — because their failure mode is silent,
and the thing that eventually reveals it is a secret in a commit.
