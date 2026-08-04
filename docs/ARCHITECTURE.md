# Architecture & System Design — Eventclick

Eventclick is an enterprise event management and virtual live event room platform supporting multi-tenant isolation, real-time WebRTC audio/video, PDF report generation, and automated cloud deployments.

---

## 1. System Topology

```
                  ┌────────────────────────────────────────┐
                  │          Cloudflare CDN / Edge         │
                  │   DNS: app.eventclick.live             │
                  │   TLS Termination (Always HTTPS)       │
                  │   Bot Fight Mode + WAF                 │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │    AWS EC2 (t3.small) / Nginx Proxy   │
                  │    Port 8080 (Mapped to 80 on host)    │
                  │    Restores Real Client IP             │
                  └─────────┬────────────────────┬─────────┘
                            │                    │
        Static Assets (SPA) │                    │ Reverse Proxy /api/v1
                            ▼                    ▼
                ┌─────────────────────┐┌─────────────────────────┐
                │ Client Container    ││ Server Container        │
                │ React 19 + Vite     ││ Express 5 + Drizzle ORM │
                └─────────────────────┘└────────────┬────────────┘
                                                    │
             ┌───────────────────┬──────────────────┼───────────────────┐
             │                   │                  │                   │
             ▼                   ▼                  ▼                   ▼
    ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  ┌────────────────┐
    │ PostgreSQL 16  │  │ Redis 7        │  │ Gotenberg 8   │  │ Cloudflare R2  │
    │ PostGIS + RLS  │  │ Sessions/Limits│  │ HTML → PDF    │  │ S3 API Storage │
    └────────────────┘  └────────────────┘  └───────────────┘  └────────────────┘
```

---

## 2. Monorepo Architecture

Managed via **Turborepo** + **npm workspaces**:

- `packages/server`: Express 5 REST API, Drizzle ORM queries, JWT auth, Pino HTTP logging, rate limiters, AWS SDKs.
- `packages/client`: React 19 + Vite single page application, Tailwind CSS v4, Lucide icons, LiveKit React SDK components.
- `packages/shared`: Shared Zod validation schemas, TypeScript interfaces, DTO definitions, API routes constants (`/api/v1`).

---

## 3. Security & Multi-Tenancy Design

### PostgreSQL Row-Level Security (RLS)
- **Database Roles**:
  - `migrate` (Superuser): Runs Drizzle schema migrations and DDL statements.
  - `auth_svc_role` (`BYPASSRLS`): Queries authentication tables (`users`, `refresh_tokens`).
  - `app_user_login` (RLS-restricted): Accesses tenant domain data. RLS policies enforce `organization_id = current_setting('app.current_organization_id')`.
- **Tenant Scope Enforcement**:
  - Main app pool connects as `app_user_login`.
  - Child tables with no `organizationId` column enforce parent `eventRooms` organization verification before performing queries.

### Authentication & Token Rotation
- **Access Tokens**: Short-lived (15m) JWT signed with `JWT_SECRET`. Stored strictly in memory by frontend client.
- **Refresh Tokens**: Long-lived (7d) opaque tokens stored in HTTP-Only, Secure, `SameSite=Strict` cookie (`Eventclick_rt`). Rotated on every usage with reuse detection.
- **Session Tracking**: Active refresh token hashes tracked in Redis (`session:user_id:token_hash`).

---

## 4. Key Services & External Integrations

| Feature | Provider / Technology | Description |
| :--- | :--- | :--- |
| **Realtime WebRTC** | LiveKit Cloud | Room token generation via server, video/audio rooms in client |
| **PDF Generation** | Gotenberg 8 Container | Converts rendered HTML reports into branded PDF documents |
| **Object Storage** | Cloudflare R2 | S3-compatible file storage for recordings, avatars, and assets |
| **Cache & Rate Limit**| Redis 7 (Fail-closed) | Slide window rate limiting, token revocation, SSE session state |
| **Email Delivery** | Resend API / AWS SQS | Asynchronous job delivery for invites, confirmations, and alerts |
