# Anyone who reaches the origin directly can pick their own client IP

**Status:** shipped (code); security group change pending, see runbook
**Touches:** `packages/client/common.conf`, `packages/client/cloudflare-realip.conf`, `packages/client/Dockerfile.prod`, `scripts/update-cloudflare-ips.sh`, `.github/workflows/deploy.yml`, `scripts/setup-ec2.sh`, `docs/cloudflare-setup.md`
**Ships with:** `fix/origin-lockdown` — closes #143

---

## 1. What the code did

nginx restores the visitor's address from Cloudflare's header, and trusted it
from every peer on the internet:

```nginx
# packages/client/common.conf
real_ip_header CF-Connecting-IP;
set_real_ip_from 0.0.0.0/0;
```

Express then trusts nginx (`app.set("trust proxy", 1)` in
`packages/server/src/index.ts`), so `req.ip` is whatever that header said.
Every IP-keyed limiter reads `req.ip`: the global limiter, the auth limiters,
and the public client log ingest limiter in `routes/log.routes.ts`.

Traffic that comes through Cloudflare is fine: Cloudflare overwrites the
header. Traffic that goes straight to the EC2 public IP is not. Nothing stopped
it arriving:

- the `client` container publishes `80:8080` and `443:8443`;
- `scripts/setup-ec2.sh` opens 80/443 in `ufw`, but Docker's published ports
  bypass ufw anyway (Docker inserts its own iptables rules first);
- `docs/cloudflare-setup.md` told readers to fix a 522 by opening port 80 to
  `0.0.0.0/0`.

## 2. Why it matters

A direct request with `CF-Connecting-IP: <random>` is a new client as far as
every limiter is concerned. Login brute-force protection, the broadcast limit's
Redis store key, and the log ingest abuse ceiling all become per-request
rather than per-attacker. The same path skips Cloudflare's WAF and Bot Fight
Mode, and would skip Cloudflare Access for the planned Ops Console (#147).

## 3. What changed

**nginx trusts the header only from Cloudflare.** `common.conf` now includes
`/etc/nginx/snippets/cloudflare-realip.conf`, which holds `real_ip_header` and
one `set_real_ip_from` per published Cloudflare range (15 IPv4, 7 IPv6 at
generation). From any other peer, `$remote_addr` stays the real TCP peer, so a
spoofed header is simply ignored.

**The list is generated, not hand-typed.** `scripts/update-cloudflare-ips.sh`
downloads Cloudflare's two lists, refuses to write if either comes back short
or contains a non-CIDR line, and writes the file atomically. The file is
committed so builds do not depend on cloudflare.com being reachable.

**The config is parsed before deploy.** The deploy workflow's scan job now runs
`nginx -t` inside the freshly built client image, with a throwaway self-signed
certificate and a hosts entry for the `server` upstream. Previously a broken
nginx include would only surface when the container failed to start in
production.

**Docs stop recommending the hole.** The 522 troubleshooting entry now says to
allow Cloudflare's ranges only, `setup-ec2.sh` notes that ufw does not guard
Docker ports, and `docs/runbooks/origin-lockdown.md` covers the security group
change, verification, refresh, and rollback.

## 4. What did not change, and why

- **`trust proxy` stays at 1.** Express trusts exactly one hop, nginx, which is
  correct once nginx itself only believes Cloudflare.
- **The security group is not in code.** There is no infrastructure-as-code in
  this repo. The change is a manual console step, documented in the runbook
  with a change-log table. It is the control that actually closes the hole;
  this PR's nginx change is defense in depth until it is applied.
- **No Authenticated Origin Pulls (mTLS).** Worth doing later; with the
  security group restricted it adds little today.

## 5. Verification

- **CI, every PR and push** (`ci.yml` → `nginx-config`): loads `nginx.conf`,
  `common.conf` and `cloudflare-realip.conf` into `nginx:1.29-alpine` (the
  client image's base), runs `nginx -t`, then sends a request with
  `CF-Connecting-IP: 203.0.113.77` from the runner, which is not a Cloudflare
  range, and fails if the access log records `203.0.113.77` instead of the real
  peer.
- **Deploy** (`deploy.yml` → scan job): `nginx -t` inside the real built client
  image before it can reach production.
- **Generated file:** `update-cloudflare-ips.sh` produced 15 IPv4 + 7 IPv6
  ranges matching Cloudflare's published lists on 2026-09-14.
- **Not run locally:** Docker Desktop was unavailable on the development
  machine, so the nginx checks above ran first in CI.
- **After the security group change:** direct `curl` to the EC2 IP on 80 and
  443 must fail to connect; `https://app.eventclick.live/api/v1/health` must
  return 200. Record the result in the runbook change log.

## 6. Learnings

- ufw rules look like a firewall for Docker hosts and are not one for published
  ports. The cloud security group is the only layer that sees those packets
  first.
- "Trust this header from everyone" is easy to write when every request in
  testing arrives through the proxy. The hole is only visible from the path
  nobody tests: straight to the origin.
