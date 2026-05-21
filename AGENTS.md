# AGENTS.md — AI-Assisted Development Framework for Veridian

> **Veridian**: Real-time NGO transparency and verification platform for live field work monitoring, attendance verification, and donor accountability.

---

## Table of Contents

1. [Overview & Philosophy](#overview--philosophy)
2. [Skill Discovery & Retrieval Pattern](#skill-discovery--retrieval-pattern)
3. [Core Development Domains](#core-development-domains)
4. [Task-Skill Mapping](#task-skill-mapping)
5. [Agent Workflow Checklist](#agent-workflow-checklist)
6. [Architecture Decision Guidelines](#architecture-decision-guidelines)
7. [Error Handling & Recovery](#error-handling--recovery)
8. [Security & Compliance Guidelines](#security--compliance-guidelines)
9. [Performance & Observability Standards](#performance--observability-standards)
10. [Common Patterns & Anti-Patterns](#common-patterns--anti-patterns)

---

## Overview & Philosophy

### Why This Framework Exists

Veridian is a **production-grade, multi-tenant NGO platform** handling:
- Real-time WebRTC streaming (LiveKit integration)
- Sensitive attendance/verification records
- Multi-role permission hierarchies
- Multi-tenancy with organization isolation
- High-stakes audit trails for donor accountability

**AI agents assisting on this codebase must:**

1. **Always perform skill discovery first** — domain-specific skills exist for frontend design, backend patterns, infrastructure, security, and prompt enhancement.
2. **Respect architecture contracts** — breaking monorepo boundaries, skipping migrations, or ignoring permission checks can cascade failures.
3. **Maintain audit compliance** — every database change is logged; every API endpoint is traced.
4. **Prioritize security & privacy** — multi-tenancy is enforced via `organizationId`; permissions are granular (ngo_admin, event_admin, volunteer, guest).
5. **Write production-ready code** — TypeScript strict mode, Zod validation, error handling, and tests are non-negotiable.

---

## Skill Discovery & Retrieval Pattern

### The Golden Rule: Find Skills First

**Before proposing any task, query the skill library for domain-specific guidance.**

#### Standard Skill Discovery Sequence

```
User Request
    ↓
Identify Task Type/Domain
    ↓
Load Relevant Skills (via load_ability)
    ↓
Review Skill Instructions & Constraints
    ↓
Map Task to Skill Guidelines
    ↓
Execute Task with Skill Context
    ↓
Validate Against Skill Standards
```

#### Example: "Help me create a new form builder feature for attendance forms"

```
1. Task Type: Frontend Feature Development + Backend API
2. Load Skills:
   - frontend-design-skills (React/Vite patterns for Veridian UI)
   - backend-api-design-skills (Express.ts patterns, Zod validation)
   - database-schema-skills (Drizzle ORM, migrations)
   - form-handling-skills (Zod schemas, error states)
   - security-rbac-skills (permission checks, organization isolation)
   
3. Skill Review:
   - Frontend: How to build form builder with drag-and-drop (dnd-kit integration)
   - Backend: How to design form storage (formDefinitions table, versioning)
   - Security: How to enforce organization isolation on form endpoints
   - Database: How to add new schema, run migrations in dev/prod
   
4. Execute: Follow all skill patterns + guidelines
5. Validate: Form builder works across roles, respects RBAC, has tests
```

---

## Core Development Domains

### 1. **Backend & API Layer** (`packages/server/src`)

**Technology Stack:**
- Express.js 5.x
- TypeScript (strict mode)
- Drizzle ORM (PostgreSQL)
- Zod validation
- Pino logging
- JWT + RBAC
- BullMQ (for async jobs)
- Redis (caching + sessions)

**Skill Dependencies:**
- ✅ `backend-api-design-skills` — Express patterns, controller/service/repository
- ✅ `database-schema-skills` — Drizzle migrations, soft deletes, multi-tenancy
- ✅ `backend-validation-skills` — Zod schemas, error handling
- ✅ `security-rbac-skills` — JWT claims, permission checks, organization isolation
- ✅ `async-job-queue-skills` — BullMQ implementation, worker patterns, retries

**Key Domains:**
- **Controllers** (`controllers/*.ts`) — HTTP request handlers, input validation, response formatting
- **Services** (`services/*.ts`) — Business logic, data access, external integrations
- **Database** (`db/schema.ts`, `db/migrate.ts`) — Schema definitions, migrations, queries
- **Middleware** (`middleware/*.ts`) — Authentication, authorization, error handling
- **Routes** (`routes/*.ts`) — Endpoint definitions, route composition
- **Config** (`config/env.ts`) — Environment validation with Zod

---

### 2. **Frontend & UI Layer** (`packages/client/src`)

**Technology Stack:**
- React 19.x
- Vite (build tool)
- TailwindCSS 4.x
- TypeScript strict mode
- React Router (navigation)
- dnd-kit (drag-and-drop)
- LiveKit React Components
- Zod (schema validation on client)

**Skill Dependencies:**
- ✅ `frontend-design-skills` — React component patterns, hooks, state management
- ✅ `ui-component-skills` — TailwindCSS, accessible components, responsive design
- ✅ `form-handling-skills` — Controlled components, validation, error states
- ✅ `state-management-skills` — React Context, custom hooks, data fetching
- ✅ `accessibility-skills` — WCAG compliance, screen reader support, keyboard navigation
- ✅ `livekit-integration-skills` — WebRTC streaming, participant management, token generation

**Key Domains:**
- **Pages** (`pages/*.tsx`) — Full-screen views (Dashboard, Room, Forms, Reports)
- **Components** (`components/*.tsx`) — Reusable UI building blocks
- **Hooks** (`hooks/*.ts`) — Custom React hooks for API calls, state management
- **Services** (`services/*.ts`) — API client, local storage, utility functions
- **Contexts** (`contexts/*.tsx`) — Global state (auth, user, organization)
- **Types** (`types/*.ts`) — TypeScript interfaces and type definitions

---

### 3. **Shared/Types Layer** (`packages/shared/src`)

**Purpose:** Single source of truth for types, constants, validation schemas across frontend & backend.

**Skill Dependencies:**
- ✅ `type-safety-skills` — Zod schema design, discriminated unions, inference
- ✅ `api-contract-skills` — Request/response types, error formats, status codes

**Key Exports:**
- Zod schemas for all API request/response bodies
- TypeScript types (User, Organization, Room, AttendanceEntry, etc.)
- Constants (API_PREFIX, roles, room statuses, permissions)
- Utility functions (formatters, validators, permission helpers)

---

### 4. **Infrastructure & DevOps** (`terraform/`, `docker-compose.yml`, `.github/workflows/`)

**Technology Stack:**
- Terraform (IaC)
- AWS (ECS Fargate, RDS, ElastiCache, S3/CloudFront, ALB, CloudWatch)
- Docker (multi-stage Dockerfiles)
- GitHub Actions (CI/CD)
- Postgres 15+
- Redis 7.x
- MinIO (dev) / Cloudflare R2 or AWS S3 (prod)

**Skill Dependencies:**
- ✅ `devops-terraform-skills` — AWS resource provisioning, state management, modules
- ✅ `ci-cd-github-actions-skills` — Workflows, secrets management, OIDC
- ✅ `containerization-skills` — Multi-stage Dockerfiles, image optimization, health checks
- ✅ `observability-skills` — CloudWatch/Prometheus, structured logging, tracing, alerts
- ✅ `security-infra-skills` — IAM roles, security groups, secrets management, WAF

**Key Areas:**
- VPC, subnets, NAT, security groups
- RDS Aurora PostgreSQL (multi-AZ)
- ElastiCache Redis (replication group)
- ECS Fargate (API + worker services)
- S3/R2 (object storage for photos, PDFs, recordings)
- ALB (load balancing, HTTPS)
- CloudWatch (logs, metrics, alarms)

---

### 5. **Database & Migrations** (`packages/server/src/db`)

**ORM:** Drizzle
**Database:** PostgreSQL 15+
**Migration Tool:** drizzle-kit

**Skill Dependencies:**
- ✅ `database-schema-skills` — Table design, indexes, constraints, relationships
- ✅ `migration-strategy-skills` — Safe zero-downtime migrations, rollback strategies
- ✅ `query-optimization-skills` — Indexes, N+1 prevention, query analysis

**Key Patterns:**
- **Soft deletes** — `deletedAt` column, `withSoftDelete()` helper
- **Multi-tenancy** — `organizationId` on every tenant-scoped table
- **Timestamps** — `createdAt`, `updatedAt` on all tables
- **Relationships** — Foreign keys with ON DELETE CASCADE/SET NULL

---

### 6. **Security & Authentication** (`packages/server/src/middleware`, `packages/server/src/services/jwt.service.ts`)

**Patterns:**
- JWT (Access + Refresh tokens)
- HTTP-only cookies for refresh tokens
- RBAC (role-based access control)
- Organization isolation
- Permission checks on all endpoints

**Skill Dependencies:**
- ✅ `security-rbac-skills` — Role definition, permission enforcement, claim structure
- ✅ `security-jwt-skills` — Token generation, validation, refresh flow
- ✅ `security-organization-isolation-skills` — Multi-tenancy enforcement, query filtering
- ✅ `security-audit-skills` — Logging, compliance tracking, data residency

---

### 7. **LiveKit & Real-Time** (`packages/server/src/services/livekit.service.ts`)

**Integration:** LiveKit server SDK, WebRTC streaming, egress (recordings)

**Skill Dependencies:**
- ✅ `livekit-integration-skills` — Token generation, room management, egress webhooks
- ✅ `real-time-skills` — WebSocket patterns, presence tracking, data synchronization
- ✅ `streaming-media-skills` — Recording reconciliation, video/audio quality, CDN delivery

---

### 8. **Observability & Monitoring** (Future: Phase 2)

**Stack (Planned):**
- Structured logging (Pino → CloudWatch)
- Metrics (Prometheus/CloudWatch)
- Tracing (OpenTelemetry → X-Ray/Jaeger)
- Error tracking (Sentry)
- Dashboards (Grafana / CloudWatch)

**Skill Dependencies:**
- ✅ `observability-logging-skills` — Structured logs, correlation IDs, log levels
- ✅ `observability-metrics-skills` — Counter, gauge, histogram instrumentation
- ✅ `observability-tracing-skills` — Distributed tracing, span context propagation
- ✅ `observability-alerting-skills` — SLO/SLI definition, alert rules, on-call routing

---

## Task-Skill Mapping

### Common Tasks → Required Skills

| Task | Primary Skill | Secondary Skills |
|------|---------------|------------------|
| **Add new API endpoint** | `backend-api-design-skills` | `backend-validation-skills`, `database-schema-skills`, `security-rbac-skills` |
| **Create new database table** | `database-schema-skills` | `migration-strategy-skills`, `security-organization-isolation-skills` |
| **Build React component** | `frontend-design-skills` | `ui-component-skills`, `accessibility-skills`, `form-handling-skills` |
| **Add form builder feature** | `form-handling-skills` | `frontend-design-skills`, `backend-api-design-skills`, `database-schema-skills` |
| **Implement async job** | `async-job-queue-skills` | `backend-api-design-skills`, `error-handling-skills` |
| **Fix permission bug** | `security-rbac-skills` | `database-schema-skills`, `backend-api-design-skills` |
| **Add LiveKit recording** | `livekit-integration-skills` | `async-job-queue-skills`, `backend-validation-skills` |
| **Deploy to production** | `devops-terraform-skills` | `ci-cd-github-actions-skills`, `security-infra-skills`, `observability-skills` |
| **Improve query performance** | `query-optimization-skills` | `database-schema-skills`, `observability-metrics-skills` |
| **Add unit tests** | `testing-skills` | domain-specific (backend/frontend) |

---

## Agent Workflow Checklist

### Every Task Begins Here

When a user requests ANY work on Veridian:

#### ✅ Step 1: Understand the Task
```
- [ ] What is being requested? (feature, bug fix, refactor, docs, infra, etc.)
- [ ] Which domain(s) does it touch? (backend, frontend, database, infra, etc.)
- [ ] What is the acceptance criteria?
- [ ] What are the constraints? (timeline, breaking changes, compatibility, etc.)
```

#### ✅ Step 2: Find & Load Relevant Skills
```
- [ ] Identify primary domain (backend, frontend, database, infra, security, etc.)
- [ ] Load applicable skills via load_ability:
       Example: load_ability("backend-api-design-skills")
       Example: load_ability("frontend-design-skills")
       Example: load_ability("form-handling-skills")
       Example: load_ability("security-rbac-skills")
- [ ] Read skill documentation thoroughly
- [ ] Note any constraints or best practices in the skill
```

#### ✅ Step 3: Analyze Codebase Context
```
- [ ] Understand current architecture & patterns
- [ ] Identify similar existing implementations
- [ ] Check for existing tests, error handling, logging
- [ ] Verify database schema (if applicable)
- [ ] Confirm permission/RBAC requirements
```

#### ✅ Step 4: Design Solution
```
- [ ] Sketch architecture/data flow
- [ ] List database changes (if any)
- [ ] List API endpoint changes (if any)
- [ ] List React component changes (if any)
- [ ] Identify error scenarios & edge cases
- [ ] Plan testing strategy
```

#### ✅ Step 5: Implement Following Skill Guidelines
```
- [ ] Write code adhering to skill standards
- [ ] Follow existing code style & patterns
- [ ] Add error handling
- [ ] Add logging
- [ ] Add tests (unit + integration)
- [ ] Add TypeScript types
```

#### ✅ Step 6: Validate Against Standards
```
- [ ] TypeScript compiles (strict mode)
- [ ] All tests pass
- [ ] Security checks pass (RBAC, org isolation, validation)
- [ ] No breaking changes to API contracts
- [ ] Database migrations are safe & reversible
- [ ] Code follows documented patterns
```

#### ✅ Step 7: Document & Prepare for Review
```
- [ ] Add/update code comments
- [ ] Update relevant documentation
- [ ] Provide summary of changes
- [ ] List any schema/migration changes
- [ ] Confirm backward compatibility
```

---

## Architecture Decision Guidelines

### Multi-Tenancy & Organization Isolation

**Rule:** Every tenant-scoped resource must enforce organization isolation via `organizationId`.

```typescript
// ✅ CORRECT: Query includes organization ID check
const room = await db
  .select()
  .from(eventRooms)
  .where(
    and(
      eq(eventRooms.id, roomId),
      eq(eventRooms.organizationId, orgId),  // ← REQUIRED
      isNull(eventRooms.deletedAt),
    ),
  )
  .limit(1);

// ❌ WRONG: Missing organizationId check
const room = await db
  .select()
  .from(eventRooms)
  .where(eq(eventRooms.id, roomId))
  .limit(1);
```

### RBAC & Permission Checks

**Rule:** Every endpoint that modifies data or accesses sensitive info must check user permissions.

```typescript
// ✅ CORRECT: Check permission before action
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    
    // Assert user has access to this room
    await assertRoomAccessForUser(req.user!, orgId, roomId);
    
    const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// ❌ WRONG: No permission check
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  const pdfBuffer = await generateVerificationReportPdf(req.params.id, req.user!.organizationId, req.user!);
  res.end(pdfBuffer);
};
```

### Validation & Error Handling

**Rule:** All user input must be validated with Zod. All errors must be caught and logged.

```typescript
// ✅ CORRECT: Zod validation + error handling
export const saveRoomForm: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    
    // Validate input with Zod schema
    const { fields } = req.body as FormDefinitionInput;
    const form = await saveFormDefinition(roomId, orgId, req.user!, fields);
    
    res.status(200).json(form);
  } catch (err) {
    next(err);  // Error handler catches & logs
  }
};

// ❌ WRONG: No validation, no error handling
export const saveRoomForm: RequestHandler = async (req, res) => {
  const form = await saveFormDefinition(req.params.id, req.user!.organizationId, req.user!, req.body.fields);
  res.json(form);
};
```

### Async Operations & Job Queues

**Rule:** Long-running tasks (PDF generation, recording processing, email) must be offloaded to BullMQ workers.

```typescript
// ✅ CORRECT: Enqueue PDF job, return 202
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    
    const job = await pdfQueue.add("generate", {
      roomId,
      orgId,
      userId: req.user!.id,
    });
    
    res.status(202).json({ jobId: job.id, statusUrl: `/api/v1/reports/${roomId}/status/${job.id}` });
  } catch (err) {
    next(err);
  }
};

// ❌ WRONG: Synchronous PDF generation blocks request
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  const pdfBuffer = await generateVerificationReportPdf(...);  // Could take 10+ seconds!
  res.end(pdfBuffer);
};
```

### Logging & Observability

**Rule:** All critical actions must be logged with structured JSON + correlation IDs.

```typescript
// ✅ CORRECT: Structured logging
logger.info(
  {
    roomId,
    orgId,
    userId: req.user!.id,
    status: "room_closed",
    duration: actualEnd - actualStart,
  },
  "Event room closed"
);

// ❌ WRONG: Unstructured log string
console.log("Room " + roomId + " closed");
```

---

## Error Handling & Recovery

### Standard Error Hierarchy

```typescript
// packages/server/src/utils/errors.ts

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string) {
    return new ApiError(400, "BAD_REQUEST", message);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static internal(message: string) {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}
```

### Error Recovery Patterns

**Pattern 1: Validation Errors**
```typescript
try {
  const parsed = CreateUserSchema.parse(req.body);
  // proceed
} catch (err) {
  if (err instanceof ZodError) {
    throw ApiError.badRequest(`Validation failed: ${err.errors[0].message}`);
  }
  throw err;
}
```

**Pattern 2: Database Errors**
```typescript
try {
  await db.insert(users).values(userData);
} catch (err) {
  if (err instanceof UniqueConstraintError) {
    throw ApiError.badRequest("User with this email already exists");
  }
  logger.error(err, "Unexpected database error");
  throw ApiError.internal("Failed to create user");
}
```

**Pattern 3: External Service Errors (LiveKit, Gotenberg, S3)**
```typescript
try {
  const pdfBuffer = await fetch(gotenbergUrl).then(r => r.arrayBuffer());
} catch (err) {
  logger.error({ roomId, err }, "Gotenberg PDF generation failed");
  throw ApiError.internal("PDF generation temporarily unavailable. Try again in a few minutes.");
}
```

---

## Security & Compliance Guidelines

### Authentication & Authorization

**Rules:**
1. All protected endpoints require valid JWT access token
2. Refresh tokens are HttpOnly cookies, rotated on use
3. Every endpoint checks `req.user` and `req.user.organizationId`
4. Permission checks use `hasRolePermission(role, action)` utility

**Middleware Stack (in order):**
```typescript
app.use(express.json());
app.use(cors(...));
app.use(helmet(...));
app.use(pinoHttp(...));           // Logging
app.use(rateLimit(...));           // Rate limiting
app.use(requireAuth);              // ← Checks JWT token
app.use(requireRole("ngo_admin")); // ← Checks user role (optional, per-route)
app.use(apiRouter);
```

### Data Privacy & Compliance

**Rules:**
1. **PII Protection:** Never log passwords, tokens, sensitive IDs without redaction
2. **Audit Trail:** All user actions (create, update, delete) are logged with timestamp + user ID
3. **Data Retention:** Follow GDPR/CCPA — implement soft deletes, data expiration policies
4. **Organization Isolation:** Queries always filter by `organizationId`

### API Rate Limiting

```typescript
// Default: 100 requests per minute per IP
rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
})
```

**Increase for trusted endpoints (webhooks):**
```typescript
app.post("/webhooks/livekit/egress", rateLimitWebhooks, egressWebhookHandler);
```

### Secrets Management

**Rule:** No secrets in code. All secrets in AWS Secrets Manager or environment variables.

**Local Development (.env.example):**
```bash
JWT_SECRET=your-super-secret-key-here
LIVEKIT_API_SECRET=your-livekit-secret
S3_SECRET_KEY=your-s3-secret
RESEND_API_KEY=your-resend-api-key
```

**Production (AWS Secrets Manager):**
```hcl
resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "evently/jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt.result
}
```

---

## Performance & Observability Standards

### Database Query Optimization

**Rules:**
1. Avoid N+1 queries — use JOINs or batch queries
2. Index frequently queried columns
3. Use `LIMIT` + `OFFSET` for pagination
4. Monitor slow queries (>1s) in CloudWatch

**Anti-Pattern (N+1):**
```typescript
// ❌ WRONG: Loops cause N+1 queries
const rooms = await db.select().from(eventRooms).where(...);
for (const room of rooms) {
  const attendance = await db.select().from(attendanceEntries).where(eq(attendanceEntries.roomId, room.id));
  room.attendanceCount = attendance.length;
}
```

**Correct Pattern:**
```typescript
// ✅ CORRECT: Single query with JOIN
const roomsWithCounts = await db
  .select({
    ...getTableColumns(eventRooms),
    attendanceCount: count(attendanceEntries.id),
  })
  .from(eventRooms)
  .leftJoin(attendanceEntries, eq(attendanceEntries.roomId, eventRooms.id))
  .where(...)
  .groupBy(eventRooms.id);
```

### Monitoring & Alerts

**Key Metrics to Track:**
- **API Response Time** (p50, p95, p99)
- **Error Rate** (5XX errors / total requests)
- **Queue Depth** (pending jobs in BullMQ)
- **Database Connection Pool** (active connections)
- **Redis Memory Usage** (used_memory / maxmemory)
- **PDF Generation Latency** (time from request to completion)

**Alert Thresholds (Production):**
- Response time p95 > 1s → alert
- Error rate > 1% → page on-call
- Queue depth > 1000 → alert
- Database CPU > 80% → alert
- Redis memory > 80% → alert

### Logging Standards

**Structured Log Format:**
```json
{
  "level": "info",
  "timestamp": "2025-05-21T14:32:10.123Z",
  "requestId": "req-abc123xyz",
  "userId": "user-123",
  "organizationId": "org-456",
  "endpoint": "POST /api/v1/rooms",
  "statusCode": 201,
  "duration": 125,
  "message": "Event room created"
}
```

**Log Levels:**
- **`fatal`** — System cannot recover (database down, Redis unavailable)
- **`error`** — User action failed (validation error, permission denied)
- **`warn`** — Unexpected but recoverable (retry attempt 2 of 3)
- **`info`** — Normal operation (room created, report generated)
- **`debug`** — Development only (query details, middleware chain)

---

## Common Patterns & Anti-Patterns

### ✅ Correct Patterns

#### Pattern 1: Controller → Service → Repository

```typescript
// Controller (HTTP handling)
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    
    // Call service
    const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, req.user!);
    
    res.setHeader("Content-Type", "application/pdf");
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// Service (business logic)
export const generateVerificationReportPdf = async (
  roomId: string,
  orgId: string,
  user: UserPrincipal,
): Promise<Buffer> => {
  // 1. Fetch room (with org check)
  const room = await getRoom(roomId, orgId);
  
  // 2. Check user permission
  await assertRoomAccessForUser(user, orgId, roomId);
  
  // 3. Fetch attendance data
  const entries = await getAttendanceEntries(roomId);
  
  // 4. Render PDF
  const htmlContent = await renderReportTemplate(room, entries);
  const pdfBuffer = await convertToPdf(htmlContent);
  
  return pdfBuffer;
};

// Repository (data access)
export const getRoom = async (roomId: string, orgId: string) => {
  return await db
    .select()
    .from(eventRooms)
    .where(and(eq(eventRooms.id, roomId), eq(eventRooms.organizationId, orgId)))
    .limit(1);
};
```

#### Pattern 2: Frontend Form Submission with Validation

```typescript
// Component (UI)
export const FormBuilder = ({ roomId }: { roomId: string }) => {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Validate on client
      const validated = FormDefinitionInput.parse({ fields });
      
      // Call API
      await api.post(`/rooms/${roomId}/form`, validated);
      
      toast.success("Form saved!");
    } catch (err) {
      if (err instanceof ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <FormFieldList fields={fields} onChange={setFields} />
      {error && <ErrorAlert message={error} />}
      <button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save Form"}
      </button>
    </div>
  );
};
```

#### Pattern 3: Async Job with Retries

```typescript
// Enqueue job
export const pdfQueue = new Queue<PdfGenerationJob>("pdf-generation", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,           // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000,         // Start with 2s delay, exponential backoff
    },
    removeOnComplete: true, // Auto-cleanup successful jobs
    removeOnFail: false,    // Keep failed jobs for debugging
  },
});

// Worker
export const pdfWorker = new Worker<PdfGenerationJob>(
  "pdf-generation",
  async (job) => {
    const { roomId, orgId, userId } = job.data;
    
    try {
      const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, {
        id: userId,
        organizationId: orgId,
      } as any);
      
      const key = `reports/${orgId}/${roomId}-${Date.now()}.pdf`;
      await uploadPdfToS3(key, pdfBuffer);
      
      return { downloadUrl: buildPublicUrl(key) };
    } catch (err) {
      logger.error({ jobId: job.id, err }, "PDF generation failed");
      throw err;  // Will retry
    }
  },
  { connection: redis, concurrency: 2 }
);

pdfWorker.on("failed", (job, err) => {
  logger.error({ job: job?.id, err }, "PDF generation exhausted retries");
  // TODO: Send user notification (email / in-app)
});
```

---

### ❌ Anti-Patterns to Avoid

#### Anti-Pattern 1: Missing Organization Isolation

```typescript
// ❌ WRONG
const room = await db.select().from(eventRooms).where(eq(eventRooms.id, roomId));

// ✅ CORRECT
const room = await db
  .select()
  .from(eventRooms)
  .where(
    and(
      eq(eventRooms.id, roomId),
      eq(eventRooms.organizationId, orgId),
    ),
  );
```

#### Anti-Pattern 2: Synchronous Long Operations

```typescript
// ❌ WRONG: Blocks HTTP request for 30+ seconds
export const downloadReport = async (req, res) => {
  const pdfBuffer = await generateVerificationReportPdf(...);
  res.end(pdfBuffer);
};

// ✅ CORRECT: Queue job, return immediately
export const downloadReport = async (req, res) => {
  const job = await pdfQueue.add("generate", { roomId, orgId, userId });
  res.status(202).json({ jobId: job.id });
};
```

#### Anti-Pattern 3: Unvalidated User Input

```typescript
// ❌ WRONG: No validation, potential SQL injection or type mismatch
export const createUser = async (req, res) => {
  await db.insert(users).values(req.body);
};

// ✅ CORRECT: Validate with Zod first
export const createUser = async (req, res) => {
  const parsed = CreateUserSchema.parse(req.body);
  await db.insert(users).values(parsed);
};
```

#### Anti-Pattern 4: Console Logs in Production

```typescript
// ❌ WRONG: Unstructured, no correlation ID, no log level
console.log("User " + userId + " logged in");

// ✅ CORRECT: Structured, with context
logger.info({ userId, organizationId }, "User logged in");
```

#### Anti-Pattern 5: Silent Failures

```typescript
// ❌ WRONG: Error swallowed, request succeeds silently
export const sendReport = async (req, res) => {
  try {
    await sendReportEmail(user.email, pdfBuffer);
  } catch {
    // silently ignore
  }
  res.json({ sent: true });
};

// ✅ CORRECT: Log error, return error response
export const sendReport = async (req, res, next) => {
  try {
    await sendReportEmail(user.email, pdfBuffer);
    res.json({ sent: true });
  } catch (err) {
    logger.error({ email: user.email, err }, "Failed to send report");
    next(ApiError.internal("Failed to send report. Please try again."));
  }
};
```

#### Anti-Pattern 6: N+1 Queries

```typescript
// ❌ WRONG: Fetches room, then loops to fetch attendance for each
const rooms = await db.select().from(eventRooms);
for (const room of rooms) {
  room.attendance = await db.select().from(attendanceEntries).where(...);
}

// ✅ CORRECT: Single JOIN query
const roomsWithAttendance = await db
  .select({
    ...getTableColumns(eventRooms),
    attendanceCount: count(attendanceEntries.id),
  })
  .from(eventRooms)
  .leftJoin(attendanceEntries, eq(...))
  .groupBy(eventRooms.id);
```

---

## Skill Library Quick Reference

### Backend Skills to Load

```
load_ability("backend-api-design-skills")
load_ability("backend-validation-skills")
load_ability("async-job-queue-skills")
load_ability("error-handling-skills")
load_ability("security-jwt-skills")
load_ability("security-rbac-skills")
load_ability("security-organization-isolation-skills")
```

### Frontend Skills to Load

```
load_ability("frontend-design-skills")
load_ability("ui-component-skills")
load_ability("form-handling-skills")
load_ability("state-management-skills")
load_ability("accessibility-skills")
load_ability("react-hooks-skills")
```

### Database Skills to Load

```
load_ability("database-schema-skills")
load_ability("migration-strategy-skills")
load_ability("query-optimization-skills")
load_ability("indexing-strategies-skills")
```

### Infrastructure Skills to Load

```
load_ability("devops-terraform-skills")
load_ability("ci-cd-github-actions-skills")
load_ability("containerization-skills")
load_ability("observability-logging-skills")
load_ability("observability-metrics-skills")
load_ability("observability-tracing-skills")
load_ability("observability-alerting-skills")
load_ability("security-infra-skills")
```

### Other Skills to Load

```
load_ability("prompt-enhancement-skills")
load_ability("code-review-skills")
load_ability("testing-skills")
load_ability("documentation-skills")
```

---

## Conclusion

This framework ensures that AI agents assisting on Veridian:

1. **Always perform skill discovery first** — leveraging domain-specific guidance
2. **Respect architectural contracts** — multi-tenancy, RBAC, async patterns
3. **Maintain high quality standards** — TypeScript strict, tests, error handling
4. **Prioritize security & compliance** — organization isolation, audit trails, data privacy
5. **Follow production best practices** — logging, monitoring, graceful degradation

**Key Mantra:**
> When in doubt, load the relevant skill, read the guidance, and follow the patterns documented therein.

---

**Version:** 1.0  
**Last Updated:** 2025-05-21  
**Maintained By:** NVCES DevOps & Engineering Team  
**Next Review:** 2025-06-21
