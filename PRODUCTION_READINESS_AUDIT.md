# Eventclick SaaS Monorepo Production Readiness Audit Report

**Date**: 2026-07-27  
**Auditor**: Project Orchestrator & Multi-Stream Static Analysis Team  
**Repository**: `C:\Users\jagta\.gemini\antigravity\worktrees\application\audit-production-codebase-review`  
**Integrity Mode**: Development / Pre-Production Review  
**Target Scale**: High-Concurrency Multi-Tenant Enterprise Production

---

# Executive Summary

A comprehensive, 14-phase production readiness audit was performed across the entire Eventclick SaaS monorepo. Eventclick is a Turborepo-managed multi-tenant SaaS application comprising Express 5 micro-services (`packages/server`), React 19 SPA (`packages/client`), shared validation contracts (`packages/shared`), and multi-container Docker Compose infrastructure (PostgreSQL 16, Redis 7, LiveKit WebRTC, S3/MinIO, SQS, Gotenberg PDF engine).

Every single file in the repository—including all 20 server service modules, 9 server controllers, 23 React client pages, database schemas/migrations, Docker Compose deployment descriptors, shell maintenance scripts, environment files, and shared TypeScript schemas—was subjected to line-by-line static analysis, architecture validation, and security auditing.

### Production Readiness Verdict & Score

| Metric                                 | Verdict / Score |
| -------------------------------------- | --------------- |
| **Production Deployment Verdict**      | **NO GO**       |
| **Overall Production Readiness Score** | **42 / 100**    |

#### Verdict Justification

The application is rated **NO GO** for tomorrow's production launch. While the codebase exhibits modern architecture, strong TypeScript typing, Drizzle ORM usage, and clean modular component design, multiple **CRITICAL** and **HIGH** severity blockers prevent safe production deployment:

1. **Security Vulnerability (CRITICAL)**: Active, live production third-party API credentials (`RESEND_API_KEY`), live AWS SQS Queue URLs, and production JWT secret strings are hardcoded and committed directly in the workspace `.env` file.
2. **Tenant Isolation Gap (HIGH/CRITICAL)**: Multi-tenant child tables (`attendance_entries`, `form_definitions`, `activity_submissions`, `activity_photos`, `room_recordings`) lack an `organization_id` column and PostgreSQL Row Level Security (RLS). Furthermore, server controllers (`getActiveRecording`, `startRoomRecording`, `stopRoomRecording`) bypass organization checks and soft-delete filters for `admin` users, allowing cross-tenant video recording manipulation and metadata access.
3. **Queue & Job Disconnect (HIGH)**: The PDF export endpoint enqueues PDF generation jobs to SQS and returns HTTP `202 Accepted` when `SQS_QUEUE_URL` is set, but **zero background SQS consumer worker processes exist** in the repository to process PDF jobs. Conversely, omitting `SQS_QUEUE_URL` causes Gotenberg PDF generation to execute synchronously, locking the Express HTTP thread under load.
4. **Database & Data Corruption (HIGH)**: The `users` database schema omits a `photo_url` column, causing profile picture updates (`photoUrl`) sent from the shared schema and frontend to drop silently. Additionally, key foreign keys (`submitted_by`, `invited_by`, `assigned_by`) lack database B-tree indexes, risking table locks and sequential scans during cascading user deletions.
5. **Testing Deficit (CRITICAL)**: Zero automated unit, integration, or E2E tests exist for the client or shared packages. Server test coverage is restricted to 11 isolated unit helper files, leaving 100% of Express controllers, middleware, and database operations completely unverified by automated testing.
6. **Infrastructure & Alerting (HIGH)**: Production database backups (`backup-db.sh`) silently fall back to local EC2 disk storage without error if AWS CLI is missing, and emergency health notifications (`health-monitor.sh`) are commented out.

---

# Phase-by-Phase Audit Findings

```mermaid
graph TD
    Client[packages/client - React 19 + Vite] -->|HTTPS REST API| Express[packages/server - Express 5 API]
    Express -->|Drizzle ORM| Postgres[(PostgreSQL 16 DB)]
    Express -->|ioredis| Redis[(Redis 7 Cache / RateLimit)]
    Express -->|LiveKit SDK| LiveKit[LiveKit WebRTC Server]
    Express -->|AWS SDK| S3[MinIO / S3 Object Storage]
    Express -->|AWS SDK| SQS[AWS SQS Queue - Unwired Worker]
    Express -->|HTTP POST| Gotenberg[Gotenberg PDF Renderer]
    Express -->|Import Source| Shared[@application/shared Schemas]
    Client -->|Import Source| Shared
```

---

## Phase 1 — Project Architecture Summary

Eventclick is structured as a Turborepo monorepo with 3 primary npm packages:

- **`packages/server`**: Express 5 backend with Drizzle ORM, PostgreSQL 16, Redis 7, SQS, LiveKit SDK, MinIO S3 SDK, Pino logging, Zod validation, and Gotenberg PDF client.
- **`packages/client`**: React 19 SPA built with Vite, Tailwind CSS v4, Lucide React icons, Radix UI primitives, React Router v6, and LiveKit React WebRTC components.
- **`packages/shared`** (`@application/shared`): Uncompiled TypeScript package providing Zod validation schemas, API route contracts, and TypeScript interface definitions shared directly via monorepo source imports.

---

## Phase 2 — Repository Health Audit

- **Dead & Unused Code**: `enqueuePdfJob` in `packages/server/src/queues/sqs.client.ts` is called in `report.controller.ts` but has no corresponding worker logic.
- **Debug Statements**: Raw `console.error` and `console.warn` calls remain scattered in client components (`AttendanceRecords.tsx:73`, `RoomLive.tsx:64,92,558`, `ErrorBoundary.tsx:25`) rather than routing through `clientLog` (`lib/log.ts`).
- **TODOs / Placeholders**: `scripts/health-monitor.sh` contains commented-out alert notification blocks for Discord webhooks and Resend email alerts.

---

## Phase 3 — Production Code Quality Audit

- **Synchronous Bottlenecks**: PDF generation in `report.controller.ts` runs synchronously via Gotenberg when `SQS_QUEUE_URL` is omitted, freezing the Express event loop.
- **Shutdown Sequence Ordering**: In `packages/server/src/index.ts:129`, `disconnectRedis()` is invoked BEFORE closing the HTTP server (`server.close()`), causing in-flight requests during graceful shutdown to crash on cache/rate-limit checks.

---

## Phase 4 — Frontend Audit (Client - 23 Pages)

All 23 client page files (`Dashboard`, `Rooms`, `CreateRoom`, `RoomLive`, `RoomWatch`, `RoomFormBuilder`, `Attendance`, `AttendanceRecords`, `Forms`, `Reports`, `AdminUsers`, `EventAssignments`, `Profile`, `Settings`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`, `VerifyEmail`, `Onboarding`, `HelpCenter`, `Feedback`, `ReportBug`) were inspected:

- **Missing Route-Level Code Splitting**: `App.tsx` imports all 23 page components statically, ballooning initial JavaScript bundle size.
- **Insecure Onboarding Gate**: `ProtectedRoute` checks `localStorage.getItem("Eventclick_onboarding_completed_or_skipped") !== "true"` to gate the `/onboarding` route. Users can override this key in browser devtools to bypass required organization setup.
- **CSV Formula Injection**: `AttendanceRecords.tsx` exports user submission data to CSV without sanitizing leading formula characters (`=`, `+`, `-`, `@`).
- **Missing Error Boundaries**: `createBrowserRouter` routes in `App.tsx` lack `errorElement` properties, causing child component render errors to crash the entire application shell.

---

## Phase 5 — Backend Audit (Server Services & Controllers)

All 20 server service files and 9 controller files were inspected:

- **Tenant Access Bypass in `getActiveRecording`**: `packages/server/src/controllers/room.controller.ts:460-484` queries `roomRecordings` by `roomId` alone without checking parent room organization ownership or soft-delete status.
- **Tenant Access Bypass in LiveKit Recording Start/Stop**: `room.controller.ts:420-447` calls `assertRoomAccessWithRoom`, which explicitly returns early for `admin` users without verifying room-to-org ownership.
- **Orphaned Organization Risk**: `packages/server/src/services/admin.service.ts:113-190` permits an `admin` user to self-delete their account without checking if they are the sole active administrator of their organization.

---

## Phase 6 — API Audit & Shared Schemas

- **Missing Input Validation Schema**: `POST /share/:token/live-token` in `packages/server/src/routes/share.routes.ts` lacks Zod validation middleware.
- **Invalid Room Schedule Validation**: `CreateRoomSchema` in `@application/shared` validates datetime formats but lacks `.refine()` to ensure `scheduledEnd > scheduledStart`.

---

## Phase 7 — Database Audit

- **Missing `photo_url` Column**: `users` schema (`packages/server/src/db/schema/users.ts`) omits `photo_url`, causing shared DTO updates to drop avatar URLs.
- **Missing FK Indexes**: Foreign key columns `attendance_entries.submitted_by`, `activity_photos.submitted_by`, `org_members.invited_by`, `event_admin_assignments.assigned_by`, and `sessions.replaced_by_id` lack indexes, causing full table scans during user deletion cascades.
- **Non-Transactional Migrations**: Drizzle migration execution (`migrate.ts`) lacks PostgreSQL `pg_advisory_lock` guards to prevent race conditions during multi-container startup.

---

## Phase 8 — Security Audit (OWASP Top 10)

- **CRITICAL Secret Exposure**: Live `RESEND_API_KEY`, live SQS URL, and production JWT secret are committed in `.env`.
- **Default Weak Credentials**: `.env` and `.env.example` set `DB_PASSWORD=1234` and MinIO credentials `minioadmin123`.
- **Missing Application-Level CSP**: Helmet middleware in `packages/server/src/index.ts` explicitly disables Content Security Policy in development and leaves it unconfigured in production.

---

## Phase 9 — DevOps & Infrastructure Review

- **Root Container Execution**: Docker Compose descriptors run containers as root without enforcing `read_only` root filesystems or `no-new-privileges` flags.
- **Unprivileged Nginx Missing**: `packages/client/Dockerfile.prod` runs Nginx master as root.

---

## Phase 10 — SaaS Multi-Tenancy Readiness

- **Lack of RLS / Denormalized Tenant IDs**: Child tables (`formDefinitions`, `attendanceEntries`, `activitySubmissions`, `activityPhotos`, `roomRecordings`) lack `organization_id` columns and DB-level RLS policies.
- **Missing SaaS Controls**: Zero functionality exists for subscription billing, usage quotas/metering, tenant audit trail logging, or GDPR data export/deletion.

---

## Phase 11 — Performance Review

- **Uncached Database Read Queries**: Redis is utilized only for IP rate-limiting, missing opportunities for caching organization definitions and room metadata.
- **Fail-Closed Rate Limiter**: If Redis disconnects, rate-limiting middleware throws HTTP 500 errors across all routes instead of degrading gracefully.

---

## Phase 12 — Testing Review

- **Monorepo Testing Deficit**: 0 test files in `packages/client` or `packages/shared`. Server contains only 11 unit test files for isolated helpers, with 0 integration or E2E tests for API routes.

---

## Phase 13 — Production Checklist Review

- **Unverified Cloud Backups**: `scripts/backup-db.sh` silently skips S3/R2 cloud uploads if `aws` CLI is missing on host without raising build failures.
- **Disabled Health Monitoring Alerts**: Discord and Resend alerts in `scripts/health-monitor.sh` are commented out.

---

## Phase 14 — Refactoring Recommendations

- **Compile Shared Package**: Change `@application/shared` build pipeline to emit compiled JS and `.d.ts` declaration files instead of requiring raw TS source imports.
- **Modularize Express App Entry**: Decouple route mounting and middleware initialization from server listen logic in `packages/server/src/index.ts`.

---

# Detailed Audit Findings Table

| #   | Severity     | Category                 | File (Line Range)                                              | Function / Component    | Problem Summary                                                                                        | Suggested Remediation                                                          |
| --- | ------------ | ------------------------ | -------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | **CRITICAL** | Security                 | `.env` (17, 24, 60, 80)                                        | Configuration           | Live Resend API keys, AWS SQS URL, and JWT secrets committed in repository `.env`                      | Immediately revoke keys; sanitize `.env`; add `.env` to `.gitignore`.          |
| 2   | **CRITICAL** | Testing                  | `packages/server/vitest.config.ts`, workspace package.json     | Test Suite              | 0 tests in client/shared; server has 0 controller, middleware, or API integration tests                | Configure Vitest across workspace; add API integration test suite.             |
| 3   | **HIGH**     | Security / Multi-Tenancy | `packages/server/src/controllers/room.controller.ts` (460-484) | `getActiveRecording`    | `getActiveRecording` queries `roomRecordings` by `roomId` without checking room organization ownership | Enforce `requireRoomInOrg(id, orgId)` before returning recording metadata.     |
| 4   | **HIGH**     | Security / Multi-Tenancy | `packages/server/src/controllers/room.controller.ts` (420-447) | `startRoomRecording`    | LiveKit recording controls use `assertRoomAccessWithRoom` which bypasses org checks for `admin`        | Replace with `assertRoomAccessForUser` to validate room org ownership.         |
| 5   | **HIGH**     | Queues / Async           | `packages/server/src/controllers/report.controller.ts` (23-26) | `downloadRoomReportPdf` | Enqueues PDF jobs to SQS when set, but 0 consumer worker processes exist to process jobs               | Implement SQS PDF consumer worker or enforce sync generation fallback.         |
| 6   | **HIGH**     | Database                 | `packages/server/src/db/schema/users.ts` (9-21)                | `users` schema          | Schema omits `photo_url` column, dropping profile photo updates sent by client                         | Add `photoUrl: text("photo_url")` to `users.ts` schema and generate migration. |
| 7   | **HIGH**     | Database                 | `packages/server/src/db/schema/attendanceEntries.ts` (26)      | Foreign Keys            | FK columns (`submitted_by`, `invited_by`, `assigned_by`) lack B-tree database indexes                  | Add index definitions for all foreign key columns in schema files.             |
| 8   | **HIGH**     | Security / State         | `packages/client/src/App.tsx` (77-86)                          | `ProtectedRoute`        | Route protection uses `localStorage` key to gate onboarding, allowing easy client bypass               | Drive onboarding gate strictly from backend `user.organizationId` state.       |
| 9   | **HIGH**     | Performance              | `packages/server/src/controllers/report.controller.ts` (23-36) | `downloadRoomReportPdf` | Synchronous PDF generation via Gotenberg blocks Express HTTP thread when SQS is unset                  | Enforce async queue rendering with timeouts and concurrency limits.            |
| 10  | **HIGH**     | DevOps                   | `scripts/backup-db.sh` (63-84)                                 | Backup Script           | Backup script silently skips S3/R2 upload if AWS CLI is missing without failing                        | Fail backup job explicitly if AWS CLI or cloud upload succeeds.                |
| 11  | **MEDIUM**   | Security                 | `packages/server/src/routes/share.routes.ts` (11)              | `getShareLiveToken`     | `POST /share/:token/live-token` accepts body without Zod validation middleware                         | Apply `validate(ShareLiveTokenSchema)` middleware to route.                    |
| 12  | **MEDIUM**   | Multi-Tenancy            | `packages/server/src/services/admin.service.ts` (113-190)      | `deleteUserAccount`     | Sole `admin` can self-delete account, leaving organization orphaned                                    | Block self-deletion if user is the sole active `admin` in org.                 |
| 13  | **MEDIUM**   | Performance              | `packages/client/src/App.tsx` (11-35)                          | `createBrowserRouter`   | Statically imports all 23 page components, increasing initial bundle size                              | Refactor routes to use `React.lazy()` dynamic imports and `<Suspense>`.        |
| 14  | **MEDIUM**   | Security                 | `packages/client/src/pages/AttendanceRecords.tsx`              | CSV Export              | Export data does not sanitize formula triggers (`=`, `+`, `-`, `@`)                                    | Prefix formula characters with `'` before rendering CSV output.                |
| 15  | **MEDIUM**   | Database                 | `packages/server/src/db/migrate.ts` (21-23)                    | `migrate`               | Migration execution lacks `pg_advisory_lock` to prevent concurrent startup races                       | Wrap Drizzle `migrate()` in a PostgreSQL advisory lock.                        |
| 16  | **MEDIUM**   | API Contracts            | `packages/shared/src/index.ts` (215-230)                       | `CreateRoomSchema`      | Schema validates datetime format but fails to enforce `scheduledEnd > scheduledStart`                  | Add `.refine()` validation to `CreateRoomSchema`.                              |
| 17  | **MEDIUM**   | DevOps                   | `docker-compose.prod.yml` (173-276)                            | Docker Production       | Containers lack `read_only` root filesystems and `no-new-privileges:true` options                      | Harden Compose services with security options and non-root users.              |
| 18  | **MEDIUM**   | SaaS Readiness           | Monorepo-wide                                                  | SaaS Architecture       | Complete absence of billing, usage limits/quotas, audit logs, and GDPR export endpoints                | Implement subscription schemas, quota middleware, and audit logs.              |
| 19  | **LOW**      | Reliability              | `packages/server/src/index.ts` (129)                           | `shutdown`              | `disconnectRedis()` is invoked before `server.close()`, causing shutdown errors                        | Reorder shutdown: call `server.close()` before `disconnectRedis()`.            |
| 20  | **LOW**      | Code Quality             | `packages/client/src/pages/AttendanceRecords.tsx` (73)         | Component Catch Blocks  | Direct `console.error` calls bypass `clientLog` centralized error shipping                             | Replace raw `console` calls with `clientLog` logger methods.                   |

---

# Mandatory Production Checklist

| Category                     | Requirement                                                                      | Verified Status |
| ---------------------------- | -------------------------------------------------------------------------------- | :-------------: |
| **Credentials & Secrets**    | All production secrets managed via secret vault (SSM/Vault), not git repo `.env` |     ❌ FAIL     |
| **Multi-Tenancy**            | Child tables contain tenant IDs or DB RLS; API endpoints enforce org context     |     ❌ FAIL     |
| **Background Queues**        | Async queue workers (SQS) active and processing background PDF jobs              |     ❌ FAIL     |
| **Database Reliability**     | DB foreign keys indexed; schema matches shared DTOs; advisory locks on migration |     ❌ FAIL     |
| **Testing Coverage**         | Automated integration test suite validating Express routes and client pages      |     ❌ FAIL     |
| **Infrastructure Hardening** | Docker containers run non-root with read-only root filesystems and security opts |     ❌ FAIL     |
| **Alerting & Backups**       | Cloud S3 backups verified; real-time failure alerts enabled in health monitor    |     ❌ FAIL     |
| **Frontend Optimization**    | Route-level code splitting enabled; secure auth state handling                   |     ❌ FAIL     |

---

# Production Deployment Remediation Plan & Verdict

### Required Fixes Before Production Launch (Remediation Roadmap)

To achieve a **GO** verdict, the engineering team must execute the following remediation roadmap in order:

1. **Immediate Credential Invalidation (Blocker)**:
   - Revoke and rotate `RESEND_API_KEY`, live SQS Queue URL, and `JWT_SECRET`.
   - Remove `.env` from repository tracking, add to `.gitignore`, and configure secrets fetching via AWS SSM Parameter Store (`scripts/fetch-secrets.sh`).
2. **Tenant Isolation & Security Patch (Blocker)**:
   - Patch `getActiveRecording` and LiveKit start/stop controllers in `packages/server/src/controllers/room.controller.ts` to strictly validate `organizationId` ownership.
   - Denormalize `organization_id` onto child tables (`attendance_entries`, `form_definitions`, `activity_submissions`, `activity_photos`, `room_recordings`).
3. **Queue Worker & PDF Fix (Blocker)**:
   - Implement an SQS background worker consumer loop for `generate_pdf` jobs or mandate synchronous processing with tight timeouts and concurrency limits.
4. **Database Schema Repair (Blocker)**:
   - Add `photoUrl: text("photo_url")` to `users.ts` Drizzle schema.
   - Add B-tree indexes for all un-indexed foreign key columns (`submitted_by`, `invited_by`, `assigned_by`).
5. **Testing Suite Bootstrap (Blocker)**:
   - Add integration test suite using Vitest/Supertest covering Express API authentication, RBAC authorization, and room recording controllers.
6. **Frontend State & Performance Hardening (High Priority)**:
   - Remove `localStorage` onboarding gate reliance; use `AuthUser` API state.
   - Refactor `App.tsx` routes with `React.lazy()` code-splitting.
   - Sanitize formula triggers in `AttendanceRecords.tsx` CSV exports.

---

### Final Deployment Verdict

```
   -----------------------------------------------------------------
   |                                                               |
   |                     VERDICT: NO GO                            |
   |                                                               |
   |  Production Deployment IS REJECTED due to critical credential |
   |  leaks, multi-tenant security isolation bypasses, missing     |
   |  queue background workers, and total lack of test coverage.   |
   |                                                               |
   -----------------------------------------------------------------
```
