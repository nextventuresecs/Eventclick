# Eventclick Testing Strategy

## 1. Executive Summary & Strategy Overview

Eventclick is a real-time organization transparency and verification platform for monitoring live fieldwork, verifying attendance, and ensuring donor accountability. This document outlines the testing strategy across its Express backend, React frontend, and PostgreSQL database, covering unit, integration, E2E, performance, and security testing.

### Current Implementation Status

| Layer | Tooling | Status | Test Count |
|-------|---------|--------|------------|
| **Client** | Vitest + React Testing Library + jsdom | ✅ Implemented | 3 unit tests |
| **Shared** | Vitest | ✅ Implemented | 23 schema/RBAC tests |
| **Server** | Vitest + Supertest | ✅ Implemented | 75 tests across 12 files |
| **E2E** | Playwright | ✅ Implemented | 7 passing specs |
| **CI/CD** | GitHub Actions | ✅ Implemented | 3 jobs |
| **Bundle Analysis** | rollup-plugin-visualizer | ✅ Implemented | `dist/stats.html` |
| **Performance** | k6 | ⏳ Planned | — |
| **Security** | Semgrep / OWASP ZAP / Trivy | ⏳ Planned | — |

---

## 2. Core Testing Pillars & Toolchain

### 2.1 Client Unit Testing (Vitest + React Testing Library)

Client tests run in a `jsdom` environment using Vitest and React Testing Library. Tests are colocated with the source tree under `packages/client/src/`.

- **Configuration**: `packages/client/vite.config.ts` includes the `test` block with `globals: true`, `environment: "jsdom"`, and `setupFiles: ["./src/test-setup.ts"]`.
- **Setup File**: `packages/client/src/test-setup.ts` registers `@testing-library/jest-dom/vitest` matchers.
- **Test Reference**: `/// <reference types="vitest" />` is present at the top of `vite.config.ts`.
- **Test Files**:
  - `src/App.test.tsx`: `RouteErrorFallback`, `ErrorBoundary`, `useAuth`
- **Scripts**:
  - `npm run test` — run once
  - `npm run test:watch` — watch mode

#### Current Coverage

| Component | What It Tests |
|-----------|---------------|
| `RouteErrorFallback` | Fallback UI rendering, reload/back buttons |
| `ErrorBoundary` | Child error catching, fallback UI |
| `useAuth` | Hook guard when used outside `AuthProvider` |

### 2.2 Shared Package Testing (Vitest)

Shared tests validate Zod schemas, RBAC utilities, and helpers. They run in a Node environment.

- **Configuration**: `packages/shared/vitest.config.ts`
- **Test Files**:
  - `src/index.test.ts`: 23 tests covering `RegisterSchema`, `LoginSchema`, `CreateRoomSchema`, `FormFieldSchema`, `UserRoleSchema`, `RoomStatusSchema`, `FieldTypeSchema`, `getRolePermissions`, `hasRolePermission`, `extractYouTubeVideoId`
- **Scripts**:
  - `npm run test` — run once
  - `npm run test:watch` — watch mode

### 2.3 Server Testing (Vitest + Supertest)

Server tests are split into unit tests (mocked services) and integration tests (real Express app with mocked infra).

- **Configuration**: `packages/server/vitest.config.ts`
  - Uses `defineConfig` from `vitest/config`
  - Environment: `node`
  - Root: `./src`
  - Coverage: V8 provider, includes `services/**`, `utils/**`, `db/helpers.ts`
  - Env overrides ensure tests never hit real infra (PORT=0, test DATABASE_URL, test REDIS_URL, etc.)
- **Unit Tests** (`packages/server/src/services/__tests__/`):
  - `errors.test.ts`, `jwt.service.test.ts`, `auth-helpers.test.ts`, `rbac-helpers.test.ts`, `event-assignment-policy.service.test.ts`, `attendance-validation.test.ts`, `attendance-live-window.service.test.ts`, `attendance-window-integration.test.ts`, `auth-recovery.service.test.ts`
- **Integration Tests** (`packages/server/src/__tests__/`):
  - `middleware.test.ts`: `requireAuth`, `requireRole`, `validate` middleware
  - `auth.integration.test.ts`: Login failure flow (service-layer unit test, 1 test)
  - `api.integration.test.ts`: Health, share, rooms endpoints (mocked Redis/rate-limit)
- **Mocking Strategy**:
  - `vi.mock()` at module level for `db`, `redis`, `@sentry/node`
  - `rate-limit-redis` mocked to avoid real Redis in integration tests
- **Scripts**:
  - `npm run test` — run all server tests

### 2.4 E2E Testing (Playwright)

E2E tests validate critical user journeys against a running server. They are organized in a dedicated `packages/e2e` workspace to avoid polluting the client runtime.

- **Configuration**: `packages/e2e/playwright.config.ts`
  - Chromium only
  - HTML + list reporters
  - Retries in CI
  - **Note**: WebRTC emulation flags (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`) are planned but not yet added to the config
- **Test Files**:
  - `tests/auth.spec.ts`: Unauthenticated navigation, login/register page load
  - `tests/share-links.spec.ts`: Public share page loads, 404 for invalid token
  - `tests/health.spec.ts`: `/health` and `/ready` API probes
- **Scripts**:
  - `npm run test` — headless
  - `npm run test:headed` — headed browser
  - `npm run test:ui` — interactive UI mode
- **CI Limitation**: The `webServer` config only starts the client dev server (`npm run dev --workspace=client`). The backend API server is not started in CI, so tests that make API requests (e.g., `health.spec.ts`) will fail. UI-only tests (`auth.spec.ts`, `share-links.spec.ts`) will work because the client SPA is served.

#### Planned E2E Enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| `storageState` / `auth.setup.ts` | ⏳ Planned | Pre-authenticated sessions per role to avoid login per test |
| Page Object Model (`packages/e2e/pages/`) | ⏳ Planned | Centralize locators and flows |
| WebRTC / LiveKit assertions | ⏳ Planned | Video element visibility and `readyState` checks |
| Start backend server in CI webServer | ⏳ Planned | Currently only client is started |
| Critical journey coverage | ⏳ Planned | Registration, room scheduling, attendance, activity upload, PDF report |

### 2.5 Performance Testing (Grafana k6)

**Status: Planned**

- **Tool**: Grafana k6
- **Staging**: Validate scaling, Postgres connection pool, CPU/memory under stress and soak
- **Production**: Off-peak Cloudflare edge routing and CDN cache validation
- **Bypass**: HMAC-tagged load-test headers to skip Cloudflare WAF and app rate limits
- **Critical Journeys**: Token signing, room queries, concurrent check-ins, WebSocket presence

### 2.6 Security Testing (SAST, DAST, SCA, Secrets)

**Status: Planned**

| Tool | Purpose | Integration Point |
|------|---------|-------------------|
| **GitLeaks** | Secrets scanning | Pre-commit + CI |
| **Semgrep** | SAST for SQLi, XSS, RBAC gaps | PR pipeline |
| **npm audit / Snyk** | SCA for known CVEs | Build stage |
| **Trivy** | Container image scanning | Docker build phase |
| **OWASP ZAP** | DAST against deployed staging | Post-deploy |
| **Burp Suite Pro** | Manual penetration testing | Release gate |

---

## 3. Test Data Isolation & Management

### 3.1 Database (Postgres)

- **CI**: GitHub Actions spins up ephemeral Postgres 16 + Redis 7 services per workflow run.
- **Test Environment**: `DATABASE_URL=postgresql://test:test@localhost:5432/eventclick_test`
- **Schema**: Migrations applied via `npm run db:migrate --workspace=server` before tests run.
- **Data Reset**: Transaction rollbacks are insufficient for out-of-process requests. Application-level `truncateAllTables()` helper is defined in the E2E strategy and should be wired into a global `beforeEach` hook.

### 3.2 Cache & Queue (Redis)

- **CI**: Uses dedicated Redis database index `1` via `REDIS_URL=redis://localhost:6379/1`
- **Isolation**: Test keys should be prefixed with `test:`; production keys with `prod:`
- **Flushing**: Staging tests should run `redisClient.flushDb()` on teardown

### 3.3 Object Storage (Cloudflare R2)

- **Staging / CI**: Point `S3_BUCKET` to `eventclick-staging-assets`
- **Production**: Test assets saved under `/test/` prefix with 24-hour lifecycle expiration
- **QA Tenant**: Dedicated organization UUID `ffffffff-ffff-ffff-ffff-ffffffffffff` for production test isolation

---

## 4. Detailed Outlines of Critical User Journeys

### Journey 1: Organization Registration & Onboarding

**Goal**: Verify a new organization can create an account, verify email, and complete onboarding.

- **API Contract Tests** (`shared/index.test.ts`):
  - `RegisterSchema` validates email, password strength, fullName
  - `LoginSchema` validates credentials
- **Server Integration** (`api.integration.test.ts`):
  - `POST /api/v1/rooms` returns `401`/`403` without auth
  - `GET /api/v1/health` returns `200`
- **E2E** (`e2e/tests/auth.spec.ts`):
  - Login page renders correctly
  - Register page renders correctly

### Journey 2: Event Room Scheduling & Configuration

**Goal**: Verify an Admin can schedule a room, design a form, and define activity proofs.

- **Schema Validation** (`shared/index.test.ts`):
  - `CreateRoomSchema` enforces `scheduledEnd > scheduledStart`
  - `FormFieldSchema` enforces `options` for `select` fields
- **API Integration** (`api.integration.test.ts`):
  - Authenticated room endpoints enforce `401`/`403`
- **Middleware** (`middleware.test.ts`):
  - `requireAuth` throws 401 when no user
  - `requireRole` throws 403 when role mismatches

### Journey 3: Attendee Check-In

**Goal**: Verify attendees can submit dynamic forms with photo proof.

- **Schema Validation**: `FormFieldSchema`, `FieldTypeSchema`
- **API**: `POST /rooms/:id/attendance` validated by server-side Zod schemas

### Journey 4: Volunteer Activity Proof Upload

**Goal**: Verify volunteers can upload activity photos.

- **Schema Validation**: `ActivityDefinitionSchema`, `SubmitActivityPhotoSchema`
- **API**: `POST /rooms/:id/activities/submission` validated by server-side schemas

### Journey 5: Live Session Closure & PDF Report

**Goal**: Verify admins can close rooms and generate PDF reports.

- **API**: `GET /rooms/:id/report/pdf` returns PDF or 503 on Gotenberg failure
- **Health**: `GET /health/deep` validates Gotenberg reachability

---

## 5. Responsibility Matrix

| Testing Phase / Type                     | Primary Writer       | Primary Executioner | Execution Stage                   | Maintenance Owner     |
| :--------------------------------------- | :------------------- | :------------------ | :-------------------------------- | :-------------------- |
| **Unit Tests (Vitest)**                  | Feature Developer    | Developer / CI      | Pre-commit / PR Pipeline          | Feature Developer     |
| **API Integration (Supertest + Vitest)** | Backend Developer    | Developer / CI      | PR Pipeline / Merge               | Backend Team          |
| **Client Tests (Vitest + RTL)**          | Frontend Developer   | Developer / CI      | PR Pipeline / Merge               | Frontend Team         |
| **Shared Schema Tests (Vitest)**         | Fullstack Developer  | Developer / CI      | PR Pipeline / Merge               | Fullstack Team        |
| **UI Testing (Playwright)**              | Frontend Developer   | Developer / CI      | PR Pipeline / Nightly             | Frontend Team         |
| **E2E Critical Journeys**                | QA / Lead Developer  | CI Pipeline         | Post-deploy Staging / Nightly     | QA / Lead Developer   |
| **Load / Performance (k6)**              | Performance Engineer | CI Pipeline         | Post-deploy Staging / Nightly     | Devops / Backend Team |
| **Security Scanning (SAST/DAST)**        | Security Engineer    | Automated CI        | Build Phase / Post-deploy Staging | Security Team         |

---

## 6. CI/CD Integration Plan

Testing is automated via GitHub Actions in a three-job workflow model.

### Workflow: Continuous Integration (`.github/workflows/ci.yml`)

Triggers on pushes and pull requests to `main` or `develop`.

```yaml
name: Continuous Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm audit --audit-level=high
        continue-on-error: true

  unit-tests:
    needs: lint-and-audit
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: eventclick_test
        ports: [5432:5432]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx vitest run --workspace=shared
      - run: npx vitest run --workspace=client
      - run: npm run test --workspace=server
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/eventclick_test
          REDIS_URL: redis://localhost:6379/1

  e2e-tests:
    needs: lint-and-audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test --workspace=e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: http://localhost:3000
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/e2e/playwright-report/
          retention-days: 14
```

### Planned: Staging Verification (verify-staging.yml)

```yaml
name: Staging Verification Suite

on:
  deployment_status:

jobs:
  run-verification:
    if: github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test --workspace=e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.deployment_status.target_url }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/e2e/playwright-report/
          retention-days: 14
```

---

## 7. Bundle Analysis & Performance Budgets

### Bundle Analysis

- **Tool**: `rollup-plugin-visualizer`
- **Config**: `packages/client/vite.config.ts`
- **Output**: `packages/client/dist/stats.html` on every build
- **Usage**: Review treemap for chunks > 500KB and optimize via code-splitting or dynamic imports

### Performance Budgets (Planned)

| Budget | Target | Enforcement |
|--------|--------|-------------|
| **JS bundle (gzipped)** | < 200KB initial | CI gate via `rollup-plugin-visualizer` |
| **CSS bundle (gzipped)** | < 50KB | CI gate |
| **Largest chunk** | < 100KB | Manual review of `stats.html` |
| **Time to Interactive** | < 3s on 3G | Lighthouse CI (planned) |

---

## 8. Vulnerability Management & Response SLAs

All security vulnerabilities and performance regressions identified by automated tests or manual audits must be addressed in accordance with strict response Service Level Agreements (SLAs).

- **Critical Vulnerability**:
  - _Definition_: Remote Code Execution (RCE), Authentication Bypass, SQL Injection, cross-tenant data leakage (IDOR).
  - _Resolution SLA_: **24 Hours**. Immediate hotfix deployment. The deployment is rolled back if a patch cannot be verified immediately.
- **High Vulnerability**:
  - _Definition_: Privilege Escalation, Rate-Limit Bypass on Auth routes, DOM-based XSS.
  - _Resolution SLA_: **5 Days**. Scheduled for resolution in the active sprint cycle.
- **Medium Vulnerability**:
  - _Definition_: Information leaks via headers, missing security cookies, vulnerable dependencies without an active exploit path.
  - _Resolution SLA_: **30 Days**. Tracked and resolved in the next scheduled release cycle.
- **Low Vulnerability**:
  - _Definition_: SSL configuration improvements, minor package updates, non-sensitive configuration drift.
  - _Resolution SLA_: **90 Days**. Handled as part of regular tech-debt maintenance.

---

## 9. Implementation Roadmap

### Completed (Current Branch: `features/testing-suite`)

| Item | Details |
|------|---------|
| Client unit tests | Vitest + RTL + jsdom; `App.test.tsx` covering RouteErrorFallback, ErrorBoundary, useAuth |
| Shared schema tests | 23 tests covering Zod schemas, RBAC utilities, URL extraction |
| Server tests | 75 tests across 12 files covering services, middleware, and API integration |
| E2E package | Playwright scaffold with auth, share-links, and health specs |
| CI/CD | `lint-and-audit`, `unit-tests`, `e2e-tests` jobs with Postgres + Redis services |
| Bundle analysis | `rollup-plugin-visualizer` generating `dist/stats.html` |

### Next Steps

| Priority | Item | Owner |
|----------|------|-------|
| P0 | Add backend `webServer` to Playwright CI config | Frontend |
| P0 | Expand client test coverage to all pages and hooks | Frontend |
| P1 | Add `storageState` auth setup for E2E tests | Frontend |
| P1 | Implement Page Object Model for E2E | Frontend |
| P1 | Add WebRTC emulation flags to Playwright config | Frontend |
| P1 | Add database truncation hook to server vitest config | Backend |
| P2 | Integrate k6 performance tests into CI/CD | DevOps |
| P2 | Add Semgrep and Gitleaks to CI pipeline | Security |
| P2 | Add OWASP ZAP DAST to staging verification | Security |
| P2 | Implement test data isolation with QA tenant UUID | Fullstack |
