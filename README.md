# Eventclick

**Real-time NGO transparency and verification platform.**

Eventclick helps non-profit organizations prove their field work is actually happening. NGO administrators create live event rooms, stream ongoing activities, and share secure links so donors and funders can watch work in real time. The platform also captures attendance records with photo evidence, creating a transparent digital trail that builds trust and donor confidence.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [User Roles & Permissions](#user-roles--permissions)
- [How It Works](#how-it-works)
- [Getting Started (Local Development)](#getting-started-local-development)
- [How It's Deployed](#how-its-deployed)
- [Security](#security)
- [Monitoring & Observability](#monitoring--observability)
- [Scaling Considerations](#scaling-considerations)
- [Future Improvements](#future-improvements)
- [Contributing](#contributing)

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Live Streaming** | Stream live events via WebRTC (LiveKit) so donors can watch NGO work in real time |
| **Attendance Verification** | Custom forms with photo capture to prove who was present at events |
| **Activity Tracking** | Photo-verified checklists to prove specific tasks were completed |
| **Role-Based Access** | Three roles (NGO Admin, Event Admin, Volunteer) with granular permissions |
| **Multi-Tenant** | Each NGO has its own isolated organization — data never leaks between orgs |
| **Share Links** | Secure, token-based links let anyone watch a live session without logging in |
| **PDF Reports** | Generate verification reports as downloadable PDFs |
| **Recording** | Record live sessions and store them in cloud storage |

---

## Tech Stack

### Frontend (`packages/client`)

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **Vite** | Build tool and dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS v4** | Styling |
| **React Router v7** | Client-side routing |
| **LiveKit Components** | WebRTC video/audio UI |
| **dnd-kit** | Drag-and-drop for form builder |
| **Lucide React** | Icon library |

### Backend (`packages/server`)

| Technology | Purpose |
|------------|---------|
| **Express 5** | HTTP server |
| **TypeScript** | Type safety |
| **Drizzle ORM** | Database queries and migrations |
| **PostgreSQL 16** | Primary database |
| **Redis 7** | Rate limiting, presence tracking, session cache |
| **Pino** | Structured JSON logging |
| **Zod** | Input validation on all endpoints |
| **JWT** | Authentication (access + refresh tokens) |
| **bcryptjs** | Password hashing |
| **LiveKit Server SDK** | Generate streaming tokens |
| **AWS S3 SDK** | Presigned uploads to Cloudflare R2 |
| **Resend** | Transactional email (password resets) |
| **Gotenberg** | HTML-to-PDF generation |
| **Helmet** | HTTP security headers |

### Shared (`packages/shared`)

| Technology | Purpose |
|------------|---------|
| **TypeScript + Zod** | Shared types, validation schemas, and constants used by both frontend and backend |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **AWS EC2** (`t3.small`) | Hosts the application |
| **Docker Compose** | Runs all services (Postgres, Redis, Nginx, API, Gotenberg) |
| **Nginx** | Reverse proxy + static file server for the React SPA |
| **Cloudflare** | DNS, SSL termination, CDN, DDoS protection |
| **Cloudflare R2** | S3-compatible object storage (photos, recordings) |
| **LiveKit Cloud** | Managed WebRTC infrastructure |
| **GitHub Actions** | CI/CD pipeline (lint → build → test → deploy) |
| **AWS Systems Manager (SSM)** | Secure deployment without SSH (no port 22 open) |
| **AWS SSM Parameter Store** | Production secrets management |
| **GitHub Container Registry** (ghcr.io) | Docker image storage |
| **Turborepo** | Monorepo build orchestration |

---

## Project Structure

```
.
├── .github/workflows/       # CI/CD pipelines
│   ├── ci.yml               # Lint, typecheck, build, test on every push
│   └── deploy.yml           # Build images → ghcr.io → SSM deploy to EC2
│
├── packages/
│   ├── client/              # React frontend
│   │   ├── src/
│   │   │   ├── pages/       # Dashboard, Login, RoomLive, Attendance, etc.
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── hooks/       # React hooks (auth, presence)
│   │   │   └── lib/         # API client, utilities
│   │   ├── nginx.conf       # Production Nginx config (reverse proxy + SPA)
│   │   └── Dockerfile.prod  # Multi-stage Docker build
│   │
│   ├── server/              # Express backend
│   │   ├── src/
│   │   │   ├── controllers/ # Route handlers
│   │   │   ├── services/    # Business logic
│   │   │   ├── db/schema/   # Drizzle ORM table definitions
│   │   │   ├── middleware/  # Auth, validation, error handling
│   │   │   ├── routes/      # API route definitions
│   │   │   └── config/      # Environment validation
│   │   ├── drizzle/         # Generated SQL migrations
│   │   └── Dockerfile.prod  # Multi-stage Docker build
│   │
│   └── shared/              # Shared types, schemas, constants
│       └── src/index.ts     # Single source of truth for both packages
│
├── scripts/
│   ├── deploy.sh            # Zero-downtime deployment with rollback
│   ├── fetch-secrets.sh     # Pull secrets from AWS SSM → .env
│   ├── setup-ec2.sh         # One-time EC2 provisioning
│   ├── backup-db.sh         # Database backup to R2
│   └── health-monitor.sh    # Container health monitoring
│
├── docs/
│   ├── deployment-guide.md  # Step-by-step deployment instructions
│   ├── cloudflare-setup.md  # Cloudflare DNS, SSL, R2 setup
│   └── ROLE_SPECIFICATION.md # Detailed role/permission breakdown
│
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment (memory limits, health checks)
├── turbo.json               # Turborepo task configuration
└── package.json             # Root workspace configuration
```

---

## Database Schema

The database uses PostgreSQL with Drizzle ORM. All tables support soft deletes (`deletedAt`), and every tenant-scoped table includes `organizationId` for multi-tenant isolation.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  organizations   │────▶│     users         │────▶│     sessions         │
│  (NGO/Nonprofit) │     │  (All user types) │     │  (Refresh tokens)    │
└──────────────────┘     └──────────────────┘     └──────────────────────┘
        │                        │
        │                        ▼
        │               ┌──────────────────────┐
        │               │ eventAdminAssignments │
        │               │ (Who manages which    │
        │               │  room)                │
        │               └──────────────────────┘
        │                        │
        ▼                        ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   eventRooms     │────▶│ formDefinitions  │────▶│  attendanceEntries   │
│   (Live events)  │     │ (Custom forms)   │     │  (Submitted records) │
└──────────────────┘     └──────────────────┘     └──────────────────────┘
        │
        ├────▶ roomRecordings      (Video recording metadata)
        ├────▶ activitySubmissions  (Photo proof of completed tasks)
        └────▶ orgMembers          (Organization membership)
```

### Key Tables

| Table | What It Stores |
|-------|---------------|
| `organizations` | NGO name, slug, logo, contact info |
| `users` | Email, password hash, role, organization link |
| `eventRooms` | Event title, schedule, status (scheduled/live/ended), streaming config, activity checklists |
| `formDefinitions` | Custom attendance form fields (stored as JSONB) |
| `attendanceEntries` | Submitted form data + photo proof URL |
| `activitySubmissions` | Photo evidence for completed checklist items |
| `roomRecordings` | Recording status, S3 key, file size |
| `sessions` | Refresh token hashes with rotation tracking |
| `eventAdminAssignments` | Which users can manage which rooms |

---

## User Roles & Permissions

Eventclick has three roles. Each role can only do what it needs to — nothing more.

| Feature | NGO Admin | Event Admin | Volunteer |
|---------|:---------:|:-----------:|:---------:|
| Create event admins | ✅ | ❌ | ❌ |
| Create volunteers | ✅ | ✅ | ❌ |
| Create/manage events | ✅ | ✅ (assigned only) | ❌ |
| Start live sessions | ✅ | ✅ | ❌ |
| Start/stop recording | ✅ | ✅ | ❌ |
| Create attendance forms | ✅ | ✅ | ❌ |
| Take attendance | ✅ | ✅ | ✅ |
| Share live link | ✅ | ✅ | ✅ |
| Watch live session | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ (own events) | ❌ |
| Manage users | ✅ | ❌ | ❌ |

---

## How It Works

### 1. Authentication

Eventclick uses a **dual-token** system:

- **Access Token** — Short-lived JWT (15 minutes). Stored in memory on the client. Sent with every API request.
- **Refresh Token** — Long-lived opaque token (7 days). Stored as an HTTP-only cookie. Used to get a new access token when the old one expires.

**Security features:**
- Refresh tokens are single-use (rotation on every refresh).
- If a used refresh token is presented again, the system assumes a replay attack and revokes the entire token family, forcing a complete re-login.
- Only the SHA-256 hash of the refresh token is stored in the database — never the raw token.

### 2. Live Streaming

- **Primary:** LiveKit Cloud (WebRTC) for low-latency, real-time video/audio.
- **Fallback:** YouTube Live embed URLs for when WebRTC isn't available.
- **Presence:** Active viewers are tracked in Redis using sorted sets, giving real-time participant counts.

### 3. Attendance Verification

1. An admin creates a custom attendance form (drag-and-drop builder with fields like name, phone, email, etc.).
2. During a live event, volunteers fill out the form for each attendee.
3. Each submission can include a photo (captured from webcam or uploaded).
4. Photos are uploaded directly to Cloudflare R2 via presigned URLs — the server never touches the file bytes.
5. The submitted data + photo URL are stored as a permanent verification record.

### 4. Activity Tracking (Quality Control)

1. When creating a room, the admin defines a checklist of required activities (e.g., "Set up chairs — minimum 2 photos").
2. During the live event, volunteers upload photo evidence for each activity.
3. A room cannot be marked as "completed" unless every activity meets its minimum photo requirement.

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js 20+** and **npm 11+**
- **Docker** and **Docker Compose** (for Postgres, Redis)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/eventclick.git
cd eventclick

# 2. Install dependencies
npm install

# 3. Start the databases (Postgres + Redis)
docker compose up -d postgres redis

# 4. Copy environment files
cp .env.example .env
cp packages/server/.env.example packages/server/.env

# 5. Push the database schema (creates tables)
cd packages/server && npm run db:push && cd ../..

# 6. Start the dev servers (client on :3000, server on :4000)
npm run dev
```

### Useful Commands

| Command | What It Does |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run build` | Build all packages for production |
| `npm run lint` | Run ESLint across all packages |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run all tests |
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio (visual database browser) |

---

## How It's Deployed

### Architecture

```
Users → Cloudflare (DNS + SSL + CDN + DDoS) → AWS EC2 (Docker Compose)
                                                 ├── Nginx        :80   (SPA + reverse proxy)
                                                 ├── Express API  :4000 (backend)
                                                 ├── PostgreSQL   :5432 (database)
                                                 ├── Redis        :6379 (cache)
                                                 └── Gotenberg    :3000 (PDF generation)

External Services:
  ├── LiveKit Cloud    (WebRTC streaming)
  ├── Cloudflare R2    (Object storage — photos, recordings)
  └── Resend           (Transactional email)
```

### CI/CD Pipeline

Every push to `main` triggers this automated pipeline:

```
Push to main
    │
    ▼
┌─────────────────────────────────┐
│  CI Job (GitHub Actions)        │
│  Lint → Typecheck → Build → Test│
└─────────────────────────────────┘
    │ (only if CI passes)
    ▼
┌─────────────────────────────────┐
│  Build Job                      │
│  Build Docker images            │
│  Push to ghcr.io (registry)     │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  ⏸  Approval Gate               │
│  Manual approval required       │
│  (GitHub Environment: production)│
└─────────────────────────────────┘
    │ (after approval)
    ▼
┌─────────────────────────────────┐
│  Deploy Job (via AWS SSM)       │
│  Pull images on EC2             │
│  Run migrations                 │
│  Health check                   │
│  Auto-rollback on failure       │
└─────────────────────────────────┘
```

### Key Deployment Decisions

| Decision | Why |
|----------|-----|
| **Build images in CI, not on EC2** | EC2 `t3.small` (2 GB RAM) can't handle Docker builds while serving traffic |
| **AWS SSM instead of SSH** | Port 22 is completely closed. No SSH keys to leak. All commands are audited in CloudTrail |
| **ghcr.io as image registry** | Free, integrated with GitHub, no extra accounts needed |
| **Cloudflare for SSL** | Free SSL certificates, automatic renewal, DDoS protection included |
| **Secrets in AWS SSM Parameter Store** | Encrypted at rest, IAM-controlled access, never stored in code or CI logs |

### How Secrets Are Managed

Secrets are **never** committed to git or stored in `.env` files on disk permanently. Here's the flow:

1. **Sensitive values** (database passwords, API keys, JWT secrets) are stored in **AWS SSM Parameter Store** as `SecureString` (encrypted with KMS).
2. At deploy time, `scripts/fetch-secrets.sh` runs on EC2, pulls all secrets from SSM, and writes them to a temporary `.env` file with `chmod 600` (owner-only read).
3. Docker Compose reads the `.env` file and injects values into containers as environment variables.
4. **Build-time secrets** (like `VITE_API_URL`) are stored in **GitHub Repository Secrets** and injected during the Docker image build in CI.

---

## Security

### What's Already in Place

| Layer | Protection |
|-------|-----------|
| **Network** | Port 22 (SSH) is closed. Deployments use AWS SSM (outbound HTTPS only) |
| **Edge** | Cloudflare proxy hides the real EC2 IP. Automatic DDoS mitigation |
| **SSL/TLS** | Cloudflare handles SSL termination. HSTS headers enforce HTTPS |
| **Authentication** | JWT access + refresh tokens with single-use rotation and replay detection |
| **Authorization** | Role-based access control (RBAC) checked on every endpoint |
| **Multi-Tenancy** | Every database query filters by `organizationId` — data never leaks between NGOs |
| **Input Validation** | Every API input is validated with Zod schemas before processing |
| **Password Storage** | bcrypt with 12 rounds — never stored in plain text |
| **Rate Limiting** | Express rate limiter with Redis backend |
| **HTTP Headers** | Helmet.js sets security headers (CSP, HSTS, X-Frame-Options, etc.) |
| **Nginx Hardening** | Blocks access to `.env`, `.git`, `wp-admin`, `phpmyadmin`, and other attack paths |
| **Container Isolation** | Internal services (Postgres, Redis, API) use `expose` not `ports` — not accessible from the internet |
| **Secrets Management** | Production secrets stored in AWS SSM (encrypted), not in code or environment files |
| **Cookie Security** | Refresh tokens use `httpOnly`, `secure`, `sameSite=strict` cookies |
| **CORS** | Strict origin checking — only the configured frontend domain is allowed |

### What to Watch Out For

- **Keep dependencies updated.** Run `npm audit` regularly. Watch for CVEs in Express, Drizzle, and LiveKit SDKs.
- **Never commit `.env` files.** They're in `.gitignore`, but always double-check before pushing.
- **Rotate JWT secrets periodically.** Update `JWT_SECRET` and `JWT_REFRESH_SECRET` in SSM at least every 6 months.
- **Monitor failed login attempts.** The rate limiter helps, but add alerting for unusual spikes.
- **Backup database regularly.** Use `scripts/backup-db.sh` on a daily cron job.

---

## Monitoring & Observability

### What's Available Now

| Tool | What It Covers |
|------|---------------|
| **Pino Logs** | Structured JSON logs from the Express server. View with `docker compose logs -f server` |
| **Docker Health Checks** | Postgres, Redis, Server, and Gotenberg all have health checks. Docker auto-restarts unhealthy containers |
| **`scripts/health-monitor.sh`** | Script to check container health status and resource usage |
| **Cloudflare Analytics** | Traffic volume, threats blocked, request distribution (free) |
| **GitHub Actions Logs** | Full CI/CD pipeline logs with deploy output |
| **AWS CloudTrail** | Audit log of all SSM commands executed on EC2 |

### Recommended Additions

| Tool | Purpose | Cost |
|------|---------|------|
| **UptimeRobot** | External uptime monitoring with email alerts | Free |
| **Sentry** | Error tracking with stack traces and user context | Free tier |
| **Grafana + Prometheus** | Metrics dashboards (CPU, memory, request latency) | Self-hosted (free) |
| **Loki** | Centralized log aggregation | Self-hosted (free) |

### Key Metrics to Track

- **API response times** (P50, P95, P99)
- **Error rate** (5xx responses per minute)
- **Database connection pool usage**
- **Redis memory usage**
- **Disk space on EC2** (Docker images accumulate — run `docker system prune` periodically)
- **Container restart count** (frequent restarts = something is crashing)

---

## Scaling Considerations

Eventclick is currently designed for a **single EC2 instance**. Here's what to think about as you grow:

### When You Have 1–500 Users (Current Setup)

The current `t3.small` (2 vCPU, 2 GB RAM) handles this fine. The memory limits in `docker-compose.prod.yml` are tuned for this:

| Service | Memory Limit |
|---------|-------------|
| PostgreSQL | 384 MB |
| Server (Express) | 384 MB |
| Gotenberg (PDF) | 512 MB |
| Redis | 96 MB |
| Nginx (Client) | 64 MB |

### When You Hit 500–5,000 Users

- **Upgrade to `t3.medium`** (4 GB RAM). Double the memory limits.
- **Move PostgreSQL to RDS.** Running the database on the same machine as the app is risky — if the server crashes, you lose everything. RDS gives you automated backups, failover, and scaling.
- **Move Redis to ElastiCache.** Same reason — separate the data layer from the compute layer.
- **Add a load balancer** (ALB) in front of EC2 if you need horizontal scaling.

### When You Hit 5,000+ Users

- **Horizontal scaling:** Run multiple EC2 instances behind an Application Load Balancer (ALB).
- **Sticky sessions or shared session store:** Redis already handles this — just make sure all instances point to the same Redis.
- **CDN optimization:** Cloudflare already caches static assets. Enable Cloudflare's more aggressive caching rules.
- **Database read replicas:** If reads are the bottleneck, add PostgreSQL read replicas.
- **Queue system:** Add BullMQ for async tasks (PDF generation, email, recording processing) so they don't block API requests.
- **Consider Kubernetes (EKS):** If you're managing more than 3–4 services across multiple instances, Kubernetes makes orchestration easier.

### Things That Will Break First

1. **Gotenberg (PDF generation)** — It uses 512 MB and spawns Chromium. Under heavy PDF load, it will be the first bottleneck. Solution: Run it as a separate service or use on-demand containers.
2. **Disk space** — Docker images pile up. Set up a cron job: `docker system prune -f --filter "until=168h"` (removes images older than 7 days).
3. **Database connections** — Max connections is set to 50. If you add more server instances, you'll need PgBouncer (connection pooler) in front of PostgreSQL.

---

## Future Improvements

### Phase 2 — Coming Next

- [ ] **Sentry Integration** — Error tracking with real-time alerts
- [ ] **OpenTelemetry Tracing** — End-to-end request tracing across services
- [ ] **BullMQ Job Queue** — Async processing for PDFs, emails, and recordings
- [ ] **Database connection pooling** — PgBouncer for managing connection limits
- [ ] **Automated database backups to R2** — Daily cron with 30-day retention

### Phase 3 — Future Features

- [ ] **Donor/Viewer role** — Read-only access for funders to view reports and recordings
- [ ] **Super Admin role** — Platform-level admin for managing multiple NGOs
- [ ] **Regional Manager role** — Oversight across multiple organizations
- [ ] **Offline attendance mode** — Capture attendance without internet, sync later
- [ ] **Mobile app** — React Native for field workers
- [ ] **Advanced analytics dashboard** — Attendance trends, event completion rates
- [ ] **Webhook notifications** — Notify donors when events go live
- [ ] **Audit log UI** — Visual audit trail of all actions taken in the system

### Infrastructure Improvements

- [ ] **Terraform IaC** — Define all AWS infrastructure as code (currently manually set up)
- [ ] **Multi-region deployment** — For NGOs operating in different geographies
- [ ] **Auto-scaling** — Scale EC2 instances based on traffic
- [ ] **Staging environment** — A separate environment for testing before production
- [ ] **Canary deployments** — Roll out changes to a small percentage of traffic first

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes following the existing code patterns
3. Ensure `npm run lint`, `npm run typecheck`, and `npm run test` all pass
4. Create a pull request — CI will automatically run checks
5. Get approval — the deploy will be triggered automatically after merge

### Code Style

- **TypeScript strict mode** is enforced
- **Zod validation** on all API inputs — no raw `req.body` access
- **Drizzle ORM** for all database queries — no raw SQL
- **Pino** for logging — no `console.log` in production code
- **Every query must filter by `organizationId`** — multi-tenancy is non-negotiable

---

## Cost Summary

| Service | Free Tier | Monthly Cost |
|---------|-----------|-------------|
| EC2 `t3.small` | 750 hrs (t2.micro only, 12 months) | ~$15/month |
| EBS 30 GB gp3 | 30 GB (12 months) | $0 |
| Elastic IP | Free when attached | $0 |
| Cloudflare DNS + CDN | Unlimited | $0 |
| Cloudflare R2 | 10 GB + 10M reads/month | $0 |
| LiveKit Cloud | 50 participant-minutes/month | $0 |
| Resend | 3,000 emails/month | $0 |
| GitHub Actions | 2,000 minutes/month | $0 |
| AWS SSM | Free | $0 |
| **Total** | | **~$15/month** |

---

## License

ISC

---

*Built by [NVCES](https://github.com/your-org) — Next Venture Community & Enterprise Solutions.*
