# Eventclick E2E Testing Strategy

## 1. Executive Summary & Strategy Overview
Eventclick is a real-time NGO transparency and verification platform for monitoring live fieldwork, verifying attendance, and ensuring donor accountability. This document outlines the end-to-end (E2E) testing strategy for Eventclick across its Express backend, React frontend, and PostgreSQL database. The strategy covers UI, API, performance, and security testing, detailing the toolchain, test data management, responsibilities, and CI/CD pipelines.

The primary objectives are to:
- Establish a robust QA pipeline that validates multi-tenant organization boundaries.
- Ensure high-performance and real-time reliability under peak load conditions.
- Prevent security vulnerabilities such as IDOR, data leakage, and SQL injection.
- Ensure no mock or test data pollutes production audits or active NGO workloads.

---

## 2. Core Testing Pillars & Toolchain

### 2.1 UI Testing Strategy (Playwright)
We recommend **Playwright** as the core UI and end-to-end testing framework. Playwright provides native monorepo support, fast parallel execution, robust auto-waiting, and built-in handling of modern browser APIs.

#### A. Directory & Configuration Structure
To prevent pollution of the client runtime workspace, E2E tests are organized in a dedicated monorepo package `packages/e2e`.

- **Configuration (`packages/e2e/playwright.config.ts`)**:
  - Configures Chrome and Mobile Chrome to run with simulated media streams to bypass OS hardware prompt blocks during WebRTC testing.
  - Automatically spins up client and server web servers in CI environments prior to running tests.
  - Defines parallel execution, worker limits, retries, and HTML reports.

- **Shared Authentication State (`storageState`)**:
  - Logging in through the UI for every test file degrades suite performance. We implement a global authentication setup (`packages/e2e/tests/auth.setup.ts`) that logs in once per role (e.g., `ngo_admin`, `volunteer`) and serializes state (cookies and localStorage) to disk (`packages/e2e/.auth/`).
  - Individual test suites load the pre-authenticated states dynamically using `test.use({ storageState: ... })`.

- **Page Object Model (POM) Design**:
  - UI locators are defined within POM classes located in `packages/e2e/pages/`.
  - **Locator Rules**:
    - *Preferred*: User-facing accessibility roles (e.g., `page.getByRole('button', { name: 'Save' })`). This ensures tests implicitly validate accessibility compliance.
    - *Secondary*: Test IDs (`page.getByTestId('field-id')`) for custom components (e.g., the drag-and-drop form builder).
    - *Strictly Avoid*: Brittle CSS selectors (`div > span > button`).

- **Testing Real-time WebRTC & WebSockets**:
  - **WebRTC Emulation**: Launch browsers with flags `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`. This instructs the browser to use synthetic media streams (such as a spinning color wheel and a sine wave tone) instead of requesting camera and microphone hardware access.
  - **LiveKit Assertion**: Verify that the `@livekit/components-react` wrappers correctly mount the `<video>` element. Playwright can assert visual rendering by verifying:
    ```typescript
    const videoElement = page.locator("video");
    await expect(videoElement).toBeVisible();
    await expect(videoElement).toHaveJSProperty("readyState", 4); // HAVE_ENOUGH_DATA
    ```
  - **WebSocket Presence & State Sync**: Assert that presence registries are responsive by verifying participant avatar count updates dynamically when secondary simulated sessions join or leave the room.

---

### 2.2 API Testing Strategy (Supertest + Vitest)
API testing focuses on rapid feedback, Zod schema contract compliance, permission rules validation, and business logic verification without rendering client-side assets.

- **Routing & Controller Testing**:
  - Executed using `supertest` in a `vitest` context inside `packages/server`.
  - Tests verify response codes, payload integrity, and RBAC enforcement by passing simulated Bearer tokens.

- **Database Reset Hooks**:
  - Transaction rollbacks do not prevent database changes caused by out-of-process Express requests.
  - We run a global `beforeEach` hook in `vitest` that executes raw SQL truncation on all tables:
    ```typescript
    import { db } from "../db";
    import { sql } from "drizzle-orm";

    export async function truncateAllTables() {
      const tables = [
        "users",
        "organizations",
        "org_members",
        "event_rooms",
        "form_definitions",
        "attendance_entries",
        "activity_submissions",
        "activity_photos",
        "room_recordings"
      ];
      await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
    }
    ```

- **Zod Contract Validation**:
  - Uses shared schemas from `@application/shared` (e.g., `CreateRoomSchema`, `EventRoomSchema`) to validate request and response payloads, preventing server-client API drift.

- **Mocking External Dependencies**:
  - **AWS S3 / Cloudflare R2**: Mock `@aws-sdk/client-s3` client methods to verify presigned upload URL structures and metadata signatures without calling cloud endpoints, or spin up a local **MinIO** container.
  - **LiveKit Server API**: Mock token generation endpoints to return valid JWT tokens with expected claims.
  - **Resend (Email)**: Intercept Resend client calls and write outbound payloads to an in-memory queue to inspect verification links.
  - **Redis**: Mock Redis commands or run a local Dockerized Redis instance.

---

### 2.3 Performance Testing Strategy (Grafana k6)
**Grafana k6** is the recommended performance testing tool due to its scriptability, low footprint, and support for WebSockets.

- **Staging vs. Production Execution**:
  - **Staging**: Validates application scaling, Postgres connection pool limits, and CPU/memory footprints. Target load includes Stress (peak load spikes) and Soak (long-duration) tests.
  - **Production**: Validates Cloudflare edge routing and real CDN caching behavior. Limited to off-peak hours (e.g., 02:00-04:00 UTC) with strict peak-load limits, coordinated with infrastructure monitors.

- **Network Routing & Cloudflare WAF Bypass**:
  - *Direct-to-Origin (Staging)*: Run k6 inside the Staging VPC and target the backend application load balancer or EC2 origin directly, setting the host header manually to avoid Cloudflare usage costs and edge rate limits.
  - *Cloudflare Bypass (Production / E2E Staging)*: Configure a custom Cloudflare WAF skip rule triggered by a cryptographically signed HMAC token sent in request headers:
    - `X-Eventclick-Loadtest-Key`: `<SECRET_HMAC_TOKEN>`
    - `X-Bypass-Rate-Limit`: `<SECRET_HMAC_TOKEN>`

- **Application Rate-Limit Bypass**:
  - The application's `express-rate-limit` middleware uses a Redis back-end. A custom middleware checks for the presence and validity of the load test bypass token, skipping request increments if matched.

- **Critical Journeys Covered**:
  - Token signing and session setup validation.
  - Event room query optimization.
  - Concurrent geo-located check-ins.
  - Active WebSocket presence polling.

---

### 2.4 Security Testing Strategy (SAST, DAST, SCA, Secrets, Pentesting)
Security testing is embedded throughout the SDLC to protect participant identity and verification integrity.

- **Tools Integration**:
  1. **Secrets Scanning (GitLeaks)**: Embedded in pre-commit hooks and CI pipelines to prevent AWS/R2 keys, JWT secrets, or DB credentials from entering Git history.
  2. **SAST (Semgrep & ESLint Security)**: Scans codebase on every PR for SQL injection patterns, DOM-based XSS, insecure cryptography, and missing RBAC checks.
  3. **SCA (npm audit / Snyk)**: Runs in the build stage to flag packages containing known CVEs.
  4. **Container Scan (Trivy)**: Scans base Docker images for OS-level vulnerabilities during package phases.
  5. **DAST (OWASP ZAP)**: Runs automated active scans post-deployment in Staging. Simulates attacks against public and authenticated endpoints (spidering paths, executing payload injection).
  6. **Manual Penetrating (Burp Suite Pro)**: Used during release gates to audit multi-tenant boundaries. A security tester attempts to query or modify Organization B resources using cookies from an Organization A user session, verifying logical database boundary enforcement.

---

## 3. Test Data Isolation & Management

To prevent test and load data from polluting donor-visible reports, a strict data management strategy is implemented.

### 3.1 Database (Postgres) Partitioning
- **Staging / CI**: Tests run against a dedicated ephemeral database container or RDS test schema. Complete schema teardown and restart is executed after each run.
- **Production**: A dedicated QA organization tenant is seeded with a permanent, immutable UUID: `ffffffff-ffff-ffff-ffff-ffffffffffff`. Test users belong exclusively to this tenant. Because of multi-tenant query controls (`where(eq(eventRooms.organizationId, orgId))`), test operations are logically isolated from real NGO records.
- **Cleanup Sweeper Daemon**: A background worker (BullMQ or AWS ECS Task Cron) runs daily in production, querying records associated with the QA tenant UUID, and executing hard-deletes.

### 3.2 Cache & Queue (Redis) Isolation
- **Index Segregation**: In Staging/CI, `REDIS_URL` points to Redis database index `1` (`redis://redis:6379/1`). In Production, tests target the default index `0`.
- **Key Namespacing**: All cache and session keys are prepended with `test:` in testing mode and `prod:` in production.
- **Flushing**: Staging tests run `redisClient.flushDb()` on teardown. Production tests set a strict time-to-live (TTL) limit (maximum 1 hour) on all test keys to let them expire naturally.

### 3.3 Object Storage (Cloudflare R2) Isolation
- **Staging / CI**: Point the S3 client wrapper (`S3_BUCKET` env var) to `eventclick-staging-assets`. Production buckets are never referenced in staging configs.
- **Production Canary Logic**:
  - Test files are saved under the prefix `/test` (e.g., `/test/attendance/`, `/test/activity/`). The `buildPhotoKey` helper automatically prepends this path if the active user organization matches the QA tenant UUID.
  - **R2 Lifecycle Expiration Rule**: A lifecycle configuration is applied to the production bucket:
    ```json
    {
      "Rules": [{
        "ID": "PurgeProductionTestUploads",
        "Status": "Enabled",
        "Filter": { "Prefix": "test/" },
        "Expiration": { "Days": 1 }
      }]
    }
    ```
    This deletes all test assets automatically after 24 hours.

---

## 4. Detailed Outlines of Critical User Journeys

### Journey 1: NGO Registration & Onboarding
**Goal**: Verify a new NGO can create an account, verify their email address, and complete organization onboarding.

*   **Setup Steps**:
    1. Ensure the email address `test-ngo-admin@eventclick.org` is not registered in the database.
    2. Mock the outbound email handler/queue to trap sent verification links.
*   **Execution Sequence**:
    1. **Sign Up**: Client sends `POST /api/v1/auth/register` with:
       ```json
       {
         "email": "test-ngo-admin@eventclick.org",
         "password": "SecurePassword123!",
         "fullName": "Test Admin"
       }
       ```
    2. **Verification Check**: Verify that a registration entry is created with `emailVerified: false`.
    3. **Token Retrieval**: Extract the verification token from the mock email queue.
    4. **Verify Email**: Client sends `POST /api/v1/auth/verify-email` containing the token.
    5. **Onboard Organization**: Client sends `POST /api/v1/auth/onboard` with:
       ```json
       {
         "organizationName": "Greenwood Relief NGO",
         "role": "ngo_admin"
       }
       ```
*   **Expected Outcomes**:
    1. A new user is created in the `users` table with `emailVerified` set to `true`.
    2. A new organization record is created in the `organizations` table.
    3. An entry in `orgMembers` registers the user as the `ngo_admin` for the organization.
*   **Edge Cases & Error Scenarios**:
    1. **Duplicate Email**: Registering with an existing email returns `409 Conflict`.
    2. **Weak Password**: Providing a password that violates complexity rules fails Zod schema verification and returns `400 Bad Request`.
    3. **Expired Token**: Using a verification token after 24 hours returns `400 Bad Request` (expired).

---

### Journey 2: Event Room Scheduling & Configuration
**Goal**: Verify an NGO Admin can schedule an event room, design a custom attendance form, and define activity proof quotas.

*   **Setup Steps**:
    1. Authenticate user as `ngo_admin` using `storageState`.
*   **Execution Sequence**:
    1. **Create Event Room**: Client sends `POST /api/v1/rooms` with:
       ```json
       {
         "title": "Flood Relief Supplies Distribution",
         "scheduledStart": "2026-07-17T09:00:00Z",
         "scheduledEnd": "2026-07-17T12:00:00Z",
         "attendanceWindowBefore": 15,
         "attendanceWindowAfter": 30,
         "activityDefinitions": [
           { "id": "supplies_photo", "title": "Supplies Log Photo", "min_photos": 1 },
           { "id": "distribution_photo", "title": "Recipient Handover Photo", "min_photos": 2 }
         ]
       }
       ```
    2. **Verify Response**: Validate that `shareToken` (32-character nanoid) is generated.
    3. **Save Form Definition**: Client sends `POST /api/v1/rooms/:id/form` with:
       ```json
       {
         "fields": [
           { "id": "beneficiary_name", "label": "Full Name", "type": "text", "required": true },
           { "id": "gov_id", "label": "National ID Number", "type": "text", "required": false },
           { "id": "supplies_category", "label": "Supplies Received", "type": "select", "required": true, "options": ["Food Kit", "Hygiene Kit"] }
         ]
       }
       ```
*   **Expected Outcomes**:
    1. Room is created with status `scheduled`.
    2. Form layout is saved in `formDefinitions` with version `1` linked to the room.
    3. The public share URL is constructible: `https://[app_url]/watch/[shareToken]`.
*   **Edge Cases & Error Scenarios**:
    1. **Time Collisions**: Setting `scheduledEnd` before `scheduledStart` throws a Zod schema validation error.
    2. **Missing Select Options**: Creating a `select` input field without options returns `400 Bad Request`.
    3. **Unauthorized Access**: A user with the role `volunteer` trying to update the form layout receives `403 Forbidden`.

---

### Journey 3: Attendee Check-In (Dynamic Form & Photo Proof)
**Goal**: Verify a remote participant or local beneficiary can complete the dynamic check-in form and upload photo proof to a live event.

*   **Setup Steps**:
    1. Create an event room and transition its status to `live`.
    2. Configure a form definition for the room.
*   **Execution Sequence**:
    1. **Fetch Room Metadata**: Client calls `GET /api/v1/rooms/share/:token` to retrieve form layout and validation schemas.
    2. **Request Upload Link**: Client calls `POST /api/v1/rooms/:roomId/attendance/presign` specifying the mimetype and size.
    3. **Upload File**: Client executes a `PUT` request with the photo bytes to the returned Cloudflare R2 presigned URL.
    4. **Submit Form**: Client calls `POST /api/v1/rooms/:roomId/attendance` with:
       ```json
       {
         "formDefinitionId": "uuid-form-definition",
         "data": {
           "beneficiary_name": "Jane Doe",
           "gov_id": "123-456-789",
           "supplies_category": "Food Kit"
         },
         "photoKey": "attendance/room-id/photo-nanoid.jpg"
       }
       ```
*   **Expected Outcomes**:
    1. Attendance submission returns `201 Created`.
    2. A row is inserted in `attendanceEntries` linking the field inputs and resolved R2 photo URL.
    3. WebSocket presence indicators update live attendance metrics.
*   **Edge Cases & Error Scenarios**:
    1. **Submission Outside Window**: Submitting when the room status is still `scheduled` (and before the `windowBefore` duration starts) returns `400 Bad Request`.
    2. **Missing Required Fields**: Submitting without the required `beneficiary_name` returns `400 Bad Request`.
    3. **Missing Image Upload**: Submitting a form with a `photoKey` before performing the PUT request to R2 registers the PostgreSQL metadata, but downstream PDF generation handles the missing R2 asset gracefully without throwing errors.

---

### Journey 4: Volunteer Fieldwork Activity Proof Upload
**Goal**: Verify field volunteers can upload photo evidence for specific activities defined under the event room configuration.

*   **Setup Steps**:
    1. Configure an event room with activity definitions and set status to `live`.
    2. Authenticate user as a `volunteer` assigned to the event.
*   **Execution Sequence**:
    1. **Request Upload Link**: Client calls `POST /api/v1/rooms/:id/activity-submissions/presign` with `activityId: 'supplies_photo'`.
    2. **Upload File**: Client uploads image bytes to the returned R2 presigned URL.
    3. **Register Activity Proof**: Client calls `POST /api/v1/rooms/:id/activity-submissions` with:
       ```json
       {
         "activityId": "supplies_photo",
         "photoKey": "rooms/room-id/activities/supplies_photo_timestamp.jpg"
       }
       ```
*   **Expected Outcomes**:
    1. An activity submission row is created or updated in `activitySubmissions`.
    2. An entry in `activityPhotos` maps the new photo URL to the submission.
    3. API returns `201 Created` with a list of all current photos uploaded for the activity.
*   **Edge Cases & Error Scenarios**:
    1. **Limit Violation**: Attempting to upload a 51st photo for a single activity rolls back the transaction and returns `400 Bad Request` ("Maximum of 50 photos allowed per activity").
    2. **Invalid Activity ID**: Submitting proof for an activity ID not defined in the room configuration returns `400 Bad Request`.
    3. **Access Revoked**: A volunteer who is not assigned to the room trying to upload proof receives `403 Forbidden`.

---

### Journey 5: Live Session Closure & Fieldwork Verification Audit Report
**Goal**: Verify an NGO Admin can close a live event room, reconcile attendance counts, and download the compiled PDF verification report.

*   **Setup Steps**:
    1. An event room is `live`, with recorded attendance and activity photos.
    2. Authenticate user as `ngo_admin`.
*   **Execution Sequence**:
    1. **Close Event Room**: Client calls `PATCH /api/v1/rooms/:id` with:
       ```json
       {
         "status": "ended"
       }
       ```
    2. **Verify State Transition**: Ensure room status is updated to `ended` and the LiveKit room is closed.
    3. **Request PDF Report**: Client calls `GET /api/v1/rooms/:id/report`.
    4. **Generate & Stream PDF**: The server fetches all attendance records and activity proofs, generates the HTML layout, compiles it using the Gotenberg service, and streams the PDF buffer back.
*   **Expected Outcomes**:
    1. Room status transitions to `ended`.
    2. A valid PDF file buffer is returned with a `Content-Type: application/pdf` header.
    3. PDF contains the NGO header, event parameters, geolocated attendance sheets, and thumbnails of activity photos.
*   **Edge Cases & Error Scenarios**:
    1. **Early Generation Request**: Requesting a report while the room is still `live` returns `400 Bad Request` ("Report can only be generated after the live session has ended").
    2. **Gotenberg Service Downtime**: If the Gotenberg container fails to compile the PDF, the server logs the incident and returns `503 Service Unavailable` without crashing the main application process.
    3. **Empty Attendance Sheets**: If a room ends with zero attendees, the PDF compiles successfully, rendering a blank attendance table.

---

## 5. Responsibility Matrix

To maintain long-term test suite health, responsibilities are mapped across development roles:

| Testing Phase / Type | Primary Writer | Primary Executioner | Execution Stage | Maintenance Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests (Vitest)** | Feature Developer | Developer / CI | Pre-commit / PR Pipeline | Feature Developer |
| **API Integration (Supertest + Vitest)** | Backend Developer | Developer / CI | PR Pipeline / Merge | Backend Team |
| **UI Testing (Playwright)** | Frontend Developer | Developer / CI | PR Pipeline / Nightly | Frontend Team |
| **E2E Critical Journeys** | QA / Lead Developer | CI Pipeline | Post-deploy Staging / Nightly | QA / Lead Developer |
| **Load / Performance (k6)** | Performance Engineer | CI Pipeline | Post-deploy Staging / Nightly | Devops / Backend Team |
| **Security Scanning (SAST/DAST)** | Security Engineer | Automated CI | Build Phase / Post-deploy Staging | Security Team |

---

## 6. CI/CD Integration Plan

E2E, security, and performance testing are automated via GitHub Actions in a two-stage workflow model.

### 6.1 Workflow 1: Continuous Integration (`.github/workflows/ci.yml`)
Triggers on pull requests and pushes to `main` or `develop`. It runs static analysis, dependency audits, unit tests, and compiles the code.

```yaml
name: Continuous Integration

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  lint-and-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Linter
        run: npm run lint

      - name: Run Typecheck
        run: npm run typecheck

      - name: Dependency Audit (SCA)
        run: npm audit --audit-level=high

      - name: SAST Scan (Semgrep)
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit

  unit-and-integration:
    needs: lint-and-audit
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: eventclick_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Migrations
        run: npm run db:migrate --workspace=server
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/eventclick_test

      - name: Run Vitest Suite
        run: npm run test --workspace=server
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/eventclick_test
          REDIS_URL: redis://localhost:6379/1
```

### 6.2 Workflow 2: Post-Deployment Verification (`.github/workflows/verify-staging.yml`)
Triggers after a successful deployment to the Staging environment. It runs the Playwright E2E suite, k6 performance gate, and OWASP ZAP DAST scan.

```yaml
name: Staging Verification Suite

on:
  deployment_status:

jobs:
  run-verification:
    if: github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'staging'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Execute Playwright E2E Suite
        run: npm run test --workspace=e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.deployment_status.target_url }}
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
          REDIS_URL: ${{ secrets.STAGING_REDIS_URL }}

      - name: Run k6 Performance Gate
        uses: grafana/k6-action@v0.3.1
        with:
          filename: packages/shared/docs/testing/load-test.js
          flags: --vus 50 --duration 5m
        env:
          TARGET_URL: ${{ github.event.deployment_status.target_url }}/api/v1
          BYPASS_KEY: ${{ secrets.LOAD_TEST_BYPASS_KEY }}

      - name: Run DAST Scan (OWASP ZAP)
        uses: zaproxy/action-api-scan@v0.9.0
        with:
          target: ${{ github.event.deployment_status.target_url }}/api/v1/health
          format: openapi

      - name: Upload Playwright Reports on Failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: packages/e2e/playwright-report/
          retention-days: 14
```

---

## 7. Vulnerability Management & Response SLAs

All security vulnerabilities and performance regressions identified by automated tests or manual audits must be addressed in accordance with strict response Service Level Agreements (SLAs).

- **Critical Vulnerability**:
  - *Definition*: Remote Code Execution (RCE), Authentication Bypass, SQL Injection, cross-tenant data leakage (IDOR).
  - *Resolution SLA*: **24 Hours**. Immediate hotfix deployment. The deployment is rolled back if a patch cannot be verified immediately.
- **High Vulnerability**:
  - *Definition*: Privilege Escalation, Rate-Limit Bypass on Auth routes, DOM-based XSS.
  - *Resolution SLA*: **5 Days**. Scheduled for resolution in the active sprint cycle.
- **Medium Vulnerability**:
  - *Definition*: Information leaks via headers, missing security cookies, vulnerable dependencies without an active exploit path.
  - *Resolution SLA*: **30 Days**. Tracked and resolved in the next scheduled release cycle.
- **Low Vulnerability**:
  - *Definition*: SSL configuration improvements, minor package updates, non-sensitive configuration drift.
  - *Resolution SLA*: **90 Days**. Handled as part of regular tech-debt maintenance.
