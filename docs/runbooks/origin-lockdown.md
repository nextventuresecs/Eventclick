# Runbook: origin lockdown (only Cloudflare may reach the EC2 origin)

**Controls:** AWS security group on the production EC2 instance (authoritative) + nginx `set_real_ip_from` list (defense in depth)
**Files:** `packages/client/cloudflare-realip.conf` (generated), `scripts/update-cloudflare-ips.sh`, `packages/client/common.conf`
**Issue:** #143

---

## Why this exists

Every IP-keyed rate limiter in the API (the global limiter, the auth limiters,
the client log ingest limiter) reads the visitor's address from Cloudflare's
`CF-Connecting-IP` header, restored by nginx. Until #143, nginx trusted that
header from `0.0.0.0/0`. Anyone who sent a request straight to the EC2 public
IP could put any value in it and get a fresh rate-limit budget per request, and
skip Cloudflare's WAF and Bot Fight Mode entirely.

Two layers now close that:

| Layer                              | What it does                                                                                              | Can Docker bypass it?      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| **AWS security group**             | Only Cloudflare's ranges can open a TCP connection to 80/443                                              | No                         |
| **nginx `cloudflare-realip.conf`** | Honours `CF-Connecting-IP` only when the TCP peer is a Cloudflare range                                   | n/a (inside the container) |
| `ufw` on the host                  | **Does not protect 80/443.** Docker publishes container ports with its own iptables rules, ahead of ufw's | Yes                        |

The security group is the one that matters. The nginx list stops a spoofed
header from ever being believed if the security group is misconfigured later.

## Applying the security group change (one-time, manual)

Needs an operator with EC2 permissions in the AWS console or CLI. The deploy
role and the instance role do not have (and must not get) security group
permissions.

1. Find the security group attached to the production instance
   (EC2 → Instances → the instance → Security tab). Record its ID in the change
   log below.
2. Get the current Cloudflare ranges: https://www.cloudflare.com/ips-v4 and
   https://www.cloudflare.com/ips-v6 (the same lists `cloudflare-realip.conf`
   was generated from).
3. **Add first, remove second**, so the site never loses Cloudflare:
   - Add one inbound rule per IPv4 range for TCP 80 and TCP 443.
   - Add one inbound rule per IPv6 range for TCP 80 and TCP 443.
   - Then delete any inbound 80/443 rule whose source is `0.0.0.0/0` or `::/0`.
   - Leave port 22 as it is (deploys use SSM, not SSH).
4. Verify (next section) before closing the console.

CLI equivalent for one range (repeat per range and port):

```bash
aws ec2 authorize-security-group-ingress --region ap-south-1 \
  --group-id <sg-id> --ip-permissions \
  'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=173.245.48.0/20,Description=cloudflare}]'
```

A security group allows 60 inbound rules per IP version by default. 15 IPv4
ranges x 2 ports = 30 rules, 7 IPv6 ranges x 2 ports = 14: within the limit.

## Verifying

From a machine **outside** Cloudflare (your laptop):

```bash
# Both must fail to connect (timeout or refused). Success here means the origin is still open.
curl -m 5 -sS -o /dev/null -w '%{http_code}\n' -H 'Host: app.eventclick.live' http://<EC2_PUBLIC_IP>/
curl -m 5 -sS -o /dev/null -w '%{http_code}\n' -k -H 'Host: app.eventclick.live' https://<EC2_PUBLIC_IP>/

# Through Cloudflare, must return 200.
curl -sS -o /dev/null -w '%{http_code}\n' https://app.eventclick.live/api/v1/health
```

If the site starts returning Cloudflare **522** right after the change, a
Cloudflare range is missing from the security group: compare the rules against
the two lists above.

## Refreshing the nginx range list

Cloudflare changes its ranges rarely and announces changes in advance. When it
does, or every six months as a check:

```bash
scripts/update-cloudflare-ips.sh
git diff packages/client/cloudflare-realip.conf
```

If the diff is non-empty, commit it, deploy, **and** apply the same additions
and removals to the security group. The script refuses to write if either list
downloads short or contains a line that is not a CIDR.

## Rollback

- **nginx:** revert the #143 commit and redeploy. This restores trusting the
  header from everyone, i.e. reopens the spoofing hole; do it only to recover
  from an outage.
- **Security group:** re-add an inbound `0.0.0.0/0` rule on 80/443. Takes
  effect in seconds. Same caveat.

## Change log

| Date       | Change                               | Security group       | Operator  | Verified                                 |
| ---------- | ------------------------------------ | -------------------- | --------- | ---------------------------------------- |
| 14/09/2026 | Restrict 80/443 to Cloudflare ranges | sg-008d23b2cd016359c | prathmesh | Yes: 44 rules added, 0.0.0.0/0 and ::/0 removed on 80/443; through Cloudflare 200, direct to origin on 80 and 443 timed out |
