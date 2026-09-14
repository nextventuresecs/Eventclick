# Maintainers sign in through Cloudflare Access, and the Ops Console runs as its own process

**Status:** accepted, 2026-09-14 (#147, epic #142)

## Context

The Ops Console reads across every tenant. [ADR 0001](0001-maintainer-access-enforced-by-postgres-grants.md)
settles *what* a maintainer can read. This one settles *who* counts as a
maintainer, how that is proven on each request, and where the code that holds
the maintainer credentials runs.

Constraints at the time: 3-5 NVCES maintainers; no Google Workspace;
`nextventuresecs` on GitHub is a personal account, not an organisation, so
there is no org membership or enforced 2FA to lean on; the `eventclick.live`
zone is already on Cloudflare.

## Decision

- **Identity:** Cloudflare Access with **email one-time PIN**, an explicit
  email allowlist, 8-hour sessions. The console is reachable only through a
  Cloudflare Tunnel; `ops-server` publishes no port.
- **Verified twice.** Access is the outer gate. `ops-server` verifies the
  `Cf-Access-Jwt-Assertion` JWT itself (RS256, issuer = team domain, audience =
  application AUD tag, keys from the team's JWKS), then requires an active row
  in `maintainers`, on every request, uncached. Both lists must name a person.
- **Separate process.** `ops-server` is its own entrypoint (`ops-entry.ts`)
  and container from the server image. It holds only the two maintainer
  database credentials, never loads the tenant `config/env.ts`, and cannot
  import tenant code (lint-enforced). The tenant `server` holds no maintainer
  credential.

## Alternatives rejected

- **GitHub organisation as IdP.** No organisation exists; creating one only to
  get enforced 2FA adds an account-management surface for five people.
- **Google Workspace.** Not in use at NVCES; paying for it to get an IdP is
  out of proportion.
- **Custom login in the app** (passwords or magic links in `ops-server`).
  Puts a login form for the most privileged surface on the public internet and
  makes us own rate limiting, lockout and credential storage.
- **Routes inside the tenant `server` process.** One process would hold both
  tenant and maintainer credentials, so any tenant-side RCE or SSRF would reach
  cross-tenant reads, and a mistake in shared middleware would affect both.

## Consequences

- Maintainer security rests on each maintainer's email inbox. The runbook
  requires 2FA on those inboxes; this cannot be enforced technically.
- Adding a maintainer is two steps (Access policy + `maintainers` CLI);
  removal from the table alone is immediate.
- The IdP can change later (Workspace, GitHub org) as Access configuration only;
  `ops-server` verifies the Access JWT, not the IdP.
- Cloudflare becomes a hard dependency for maintainer access. When the tunnel
  or Access is down, maintainers go direct to AWS, Sentry and Cloudflare
  (`docs/runbooks/ops-console.md`).
- Exactly one `ops-server` instance is assumed (in-memory rate limit).
