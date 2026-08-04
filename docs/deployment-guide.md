# Eventclick — Production Deployment Guide

End-to-end guide for deploying Eventclick to AWS EC2 with Cloudflare CDN.

---

## Architecture Overview

```
Users → Cloudflare (DNS + SSL + CDN) → EC2 (Docker Compose)
                                         ├── Nginx (SPA + reverse proxy) :80
                                         ├── Express API :4000
                                         ├── PostgreSQL :5432
                                         ├── Redis :6379
                                         └── Gotenberg :3000 (PDF)

External Services:
  ├── LiveKit Cloud (WebRTC)
  ├── Cloudflare R2 (Object Storage)
  └── Resend (Transactional Email)
```

---

## Prerequisites

- [ ] AWS account with access to EC2
- [ ] Domain name (any registrar)
- [ ] Cloudflare account (free plan)
- [ ] GitHub repository (for CI/CD)
- [ ] LiveKit Cloud account: [cloud.livekit.io](https://cloud.livekit.io)
- [ ] Resend account: [resend.com](https://resend.com)

---

## Step 1: Launch EC2 Instance

### Instance Configuration

| Setting            | Value                          |
| ------------------ | ------------------------------ |
| **AMI**            | Ubuntu 24.04 LTS (HVM, SSD)    |
| **Instance type**  | `t3.small` (2 vCPU, 2 GB RAM)  |
| **Storage**        | 30 GB gp3                      |
| **Security Group** | See below                      |
| **Key Pair**       | Create or use existing SSH key |

### Security Group Rules

| Type  | Protocol | Port Range | Source    | Description      |
| ----- | -------- | ---------- | --------- | ---------------- |
| SSH   | TCP      | 22         | Your IP   | SSH access       |
| HTTP  | TCP      | 80         | 0.0.0.0/0 | Cloudflare proxy |
| HTTPS | TCP      | 443        | 0.0.0.0/0 | Cloudflare proxy |

### Allocate Elastic IP

1. Go to EC2 → **Elastic IPs** → **Allocate Elastic IP address**
2. Associate it with your EC2 instance
3. Note the IP — you'll need it for Cloudflare DNS

---

## Step 2: Provision the EC2 Instance

SSH into your EC2:

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
```

Upload and run the setup script:

```bash
# From your local machine (transfer the script)
scp -i your-key.pem scripts/setup-ec2.sh ubuntu@<ELASTIC_IP>:/tmp/

# On EC2
sudo chmod +x /tmp/setup-ec2.sh
sudo /tmp/setup-ec2.sh
```

This installs Docker, configures the firewall, adds swap, sets up fail2ban, and creates the `deploy` user.

After running, **reconnect as the deploy user**:

```bash
ssh -i your-key.pem deploy@<ELASTIC_IP>
```

---

## Step 3: Clone Repository & Configure

```bash
cd ~/app
git clone https://github.com/your-org/eventclick.git .
```

### Create Production .env

```bash
cp .env.production.example .env
nano .env
```

Fill in ALL values:

1. **Generate secrets:**

   ```bash
   # JWT secrets (run twice, use different values)
   openssl rand -base64 48

   # Database password
   openssl rand -base64 24

   # Redis password
   openssl rand -base64 24
   ```

2. **Get LiveKit Cloud credentials:**
   - Go to [cloud.livekit.io](https://cloud.livekit.io)
   - Create a project → Settings → Keys
   - Copy API Key and Secret
   - Note the WebSocket URL (e.g., `wss://your-project.livekit.cloud`)

3. **Get Cloudflare R2 credentials:**
   - Follow [cloudflare-setup.md](./cloudflare-setup.md) → Section 4

4. **Update domain URLs** (after Cloudflare DNS is set up):
   ```env
   APP_URL=https://app.yourdomain.com
   CORS_ORIGIN=https://app.yourdomain.com
   VITE_API_URL=https://app.yourdomain.com/api/v1
   COOKIE_DOMAIN=.yourdomain.com
   ```

---

## Step 4: Set Up Cloudflare

Follow the complete guide: [cloudflare-setup.md](./cloudflare-setup.md)

Quick summary:

1. Add domain to Cloudflare
2. Update registrar nameservers
3. Create DNS records (A records for app, api subdomains)
4. Set SSL mode to Full (Strict)
5. Create R2 bucket and API tokens

---

## Step 5: First Deployment

```bash
cd ~/app

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Watch the logs
docker compose -f docker-compose.prod.yml logs -f

# Check all services are running
docker compose -f docker-compose.prod.yml ps
```

### Verify

```bash
# Health check
curl http://localhost:4000/api/v1/health

# Readiness check (DB + Redis)
curl http://localhost:4000/api/v1/ready

# Check from outside (after Cloudflare DNS propagates)
curl https://api.yourdomain.com/api/v1/health
```

---

## Step 6: Set Up CI/CD

### GitHub Repository Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret Name             | Value                               |
| ----------------------- | ----------------------------------- |
| `EC2_HOST`              | Your EC2 Elastic IP                 |
| `EC2_USER`              | `deploy`                            |
| `EC2_SSH_KEY`           | Contents of your SSH private key    |
| `VITE_API_URL`          | `https://app.yourdomain.com/api/v1` |
| `VITE_LIVEKIT_URL`      | `wss://your-project.livekit.cloud`  |
| `VITE_GOOGLE_CLIENT_ID` | Your Google OAuth client ID         |

### GitHub Environment

1. Go to repo → **Settings** → **Environments**
2. Create environment: `production`
3. Add **protection rules**: require manual approval (optional)

### Test the Pipeline

Push to `main`:

```bash
git add .
git commit -m "chore: add production deployment infrastructure"
git push origin main
```

The CI workflow runs first (lint → typecheck → build → test), then the deploy workflow triggers automatically.

---

## Step 7: Set Up Backups

```bash
# Install AWS CLI (for R2 uploads)
sudo apt-get install -y awscli

# Configure AWS CLI for R2
aws configure
# Access Key: Your R2 access key
# Secret Key: Your R2 secret key
# Region: auto
# Output: json

# Test backup
./scripts/backup-db.sh

# Set up daily cron (2 AM UTC)
crontab -e
# Add this line:
0 2 * * * /home/deploy/app/scripts/backup-db.sh >> /home/deploy/backups/backup.log 2>&1
```

---

## Step 8: Set Up Monitoring

### UptimeRobot (Free — External Monitoring)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitors:
   - `https://app.yourdomain.com` (HTTPS, 5-min interval)
   - `https://app.yourdomain.com/api/v1/health` (HTTP Keyword: `"ok"`)
3. Set up email alerts

### Sentry (Free Tier — Error Tracking)

1. Create account at [sentry.io](https://sentry.io)
2. Create a Node.js project → get DSN
3. Add `SENTRY_SERVER_DSN` and `VITE_SENTRY_CLIENT_DSN` to your `.env`
4. (Future) Add `@sentry/node` to the server package

### SSE (Server-Sent Events) Monitoring

With the real-time notification system, Nginx holds open long-lived HTTP connections (`proxy_read_timeout 86400s;`).
**Failure Modes to Monitor:**

- **File Descriptor Exhaustion:** 10k users = 10k open TCP connections. Monitor EC2 open file limits (`ulimit -n`).
- **Nginx Worker Connections:** May need to increase `worker_connections` in Nginx if `502` or connection dropped errors appear.
- **Client Reconnect Storms:** If the server restarts, all clients disconnect and reconnect simultaneously. SSE clients have built-in exponential backoff, but monitor CPU usage during restarts.
- **Backups & Failover:** Redis Pub/Sub handles the event broadcasting. If Redis crashes, messages in transit are lost (PubSub is fire-and-forget). The frontend will recover by fetching the standard REST `/api/v1/notifications` endpoint on next reconnect or page load.

---

## Ongoing Operations

### Deploy New Version

```bash
# Option 1: Automated (push to main)
git push origin main
# CI/CD handles the rest

# Option 2: Manual (on EC2)
cd ~/app
./scripts/deploy.sh

# Option 3: Deploy specific tag
./scripts/deploy.sh v1.2.3
```

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f server

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 server
```

### Database Operations

```bash
# Run migrations
docker compose -f docker-compose.prod.yml up migrate --build

# Connect to PostgreSQL shell
docker exec -it eventclick_postgres_prod psql -U eventclick_prod -d eventclick_db

# Manual backup
./scripts/backup-db.sh

# Restore from backup
gunzip -c /home/deploy/backups/eventclick_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i eventclick_postgres_prod psql -U eventclick_prod -d eventclick_db
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific service (zero-downtime for server)
docker compose -f docker-compose.prod.yml up -d --no-deps server

# Full rebuild
docker compose -f docker-compose.prod.yml up -d --build
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
df -h

# Memory usage
free -m

# Swap usage
swapon --show
```

---

## Troubleshooting

| Issue              | Cause                       | Fix                                              |
| ------------------ | --------------------------- | ------------------------------------------------ |
| Server won't start | Missing env vars            | Check `docker logs eventclick_server_prod`       |
| 502 Bad Gateway    | Server crashed or not ready | `docker compose restart server`                  |
| Out of memory      | Too many containers         | Check `docker stats`, increase instance size     |
| Migration failed   | Schema conflict             | Check migration files, run `db:generate` locally |
| R2 upload fails    | Wrong credentials           | Verify S3_ENDPOINT, S3_ACCESS_KEY in .env        |
| CORS errors        | Wrong CORS_ORIGIN           | Update CORS_ORIGIN in .env to match domain       |
| WebRTC not working | Wrong LiveKit URL           | Verify LIVEKIT_PUBLIC_URL and VITE_LIVEKIT_URL   |

---

## Cost Summary (MVP)

| Service              | Free Tier                             | Monthly Cost |
| -------------------- | ------------------------------------- | ------------ |
| EC2 `t3.small`       | 750 hrs (12 months, t2/t3.micro only) | ~$15/month\* |
| EBS 30 GB gp3        | 30 GB (12 months)                     | $0           |
| Elastic IP           | Free when attached                    | $0           |
| Cloudflare DNS + CDN | Unlimited                             | $0           |
| Cloudflare R2        | 10 GB + 10M reads                     | $0           |
| LiveKit Cloud        | 50 participant-min                    | $0           |
| Resend               | 3000 emails/month                     | $0           |
| GitHub Actions       | 2000 min/month                        | $0           |

> \*Note: `t3.small` is needed for Gotenberg (PDF gen uses ~512 MB). If you can defer PDF to Phase 2, `t2.micro` (free tier) works. Otherwise, budget ~$15/month for `t3.small`.

> **Alternative:** Use a `t2.micro` free tier instance and run Gotenberg only on-demand (start → generate PDF → stop). This keeps costs at $0 but adds complexity.
