# AGENTS.md — AI-Assisted Development Framework for Veridian

> **Veridian**: Real-time NGO transparency and verification platform for live field work monitoring, attendance verification, and donor accountability.

---

## ⭐ THE GOLDEN RULE: SKILL DISCOVERY FIRST

**Before proposing ANY task, you MUST discover and load relevant skills.**

```
User Request
    ↓
Identify Task Type/Domain
    ↓
FIND SKILLS (use find-skills ability)
    ↓
LOAD SKILLS (via load_ability)
    ↓
Review Skill Instructions & Constraints
    ↓
Execute Task with Skill Context
    ↓
Validate Against Skill Standards
```

**Every task starts with skill discovery.** No exceptions.

---

## Table of Contents

1. [The Golden Rule: Skill Discovery First](#-the-golden-rule-skill-discovery-first)
2. [Overview & Philosophy](#overview--philosophy)
3. [Skill Discovery & Retrieval Pattern](#skill-discovery--retrieval-pattern)
4. [Comprehensive Skill Library](#comprehensive-skill-library)
5. [Core Development Domains](#core-development-domains)
6. [Task-Skill Mapping](#task-skill-mapping)
7. [Agent Workflow Checklist](#agent-workflow-checklist)
8. [Architecture Decision Guidelines](#architecture-decision-guidelines)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Security & Compliance Guidelines](#security--compliance-guidelines)
11. [Performance & Observability Standards](#performance--observability-standards)
12. [Common Patterns & Anti-Patterns](#common-patterns--anti-patterns)

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

1. **Always perform skill discovery first** — comprehensive skill library exists for every domain (frontend design, backend patterns, infrastructure, security, prompt enhancement, database optimization, testing, documentation, and more).
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
User Request → Identify Task Domain → Find Skills → Load Skills → Review Guidelines → Execute → Validate
```

#### Example: "Help me create a new form builder feature for attendance forms"

```
1. Task Type: Frontend Feature Development + Backend API + Database Design
2. Find Skills:
   - load_ability("find-skills")  ← Discover available skills for your task
   - Then identify: frontend-design, backend-dev-guidelines, database-design, form-handling, security-rbac-skills

3. Load Skills:
   - load_ability("frontend-dev-guidelines")
   - load_ability("backend-dev-guidelines")
   - load_ability("database-design")
   - load_ability("postgres-best-practices")

4. Review Skill Instructions & Map to Requirements
5. Implement Following Skill Patterns + Guidelines
6. Validate: Works across roles, respects RBAC, has tests, passes TypeScript strict, follows DB best practices
```

**Key Pattern:** Skill discovery should happen BEFORE writing any code. Use the `find-skills` ability to explore what guidance exists for your specific task.

---

## Comprehensive Skill Library

Veridian has **100+ production-grade skills** covering all development domains. Skills are organized in `.agents/skills/` directory.

### How to Discover Skills

**Option 1: Use find-skills ability**

```
load_ability("find-skills")
→ Describes how to discover skills for your task
→ Returns list of relevant skills
```

**Option 2: Know your task domain and load directly**

- Frontend task? Load: `frontend-dev-guidelines`, `frontend-design`, `ui-component-skills`
- Backend task? Load: `backend-dev-guidelines`, `backend-architect`, `api-design-principles`
- Database task? Load: `database-design`, `database-architect`, `postgres-best-practices`
- Infrastructure task? Load: `devops-terraform-skills`, `deployment-pipeline-design`
- Testing task? Load: `testing-patterns`, `tdd-workflow`, `test-automator`

### Categories of Available Skills

**Backend & API Development**

- `backend-dev-guidelines` — Backend patterns, Express.ts, architecture
- `backend-architect` — High-level design, scalability, patterns
- `backend-security-coder` — Security hardening, vulnerability prevention
- `api-design-principles` — REST API design, error handling
- `api-security-best-practices` — API authentication, authorization, rate limiting
- `api-patterns` — Common API patterns and implementations
- `api-documentation-generator` — OpenAPI, documentation automation

**Frontend & UI Development**

- `frontend-dev-guidelines` — React, Vite, component patterns
- `frontend-design` — UI design, accessibility, responsive design
- `frontend-developer` — Component implementation, state management
- `frontend-security-coder` — Client-side security, XSS prevention
- `react-components` — React component patterns
- `shadcn-ui` — shadcn UI component library usage
- `web-design-guidelines` — UX/UI best practices
- `web-design` — Design systems, layout, typography

**Database & Data**

- `database-design` — Schema design, normalization, indexing
- `database-architect` — Large-scale database design, partitioning
- `database-admin` — Backup, recovery, monitoring
- `database-migration` — Safe migrations, zero-downtime deployments
- `database-optimizer` — Query optimization, performance tuning
- `postgres-best-practices` — PostgreSQL-specific optimization (CRITICAL for Veridian)
- `sql-optimization-patterns` — SQL query optimization
- `sql-injection-testing` — Security testing for SQL injection

**Infrastructure & DevOps**

- `devops-terraform-skills` — Terraform, AWS provisioning
- `devops-troubleshooter` — Troubleshooting infrastructure issues
- `deployment-engineer` — Deployment strategies, rollback procedures
- `deployment-pipeline-design` — CI/CD pipeline design
- `deployment-procedures` — Standard deployment workflows
- `deployment-validation-config-validate` — Configuration validation
- `docker-expert` — Docker, containerization, multi-stage builds
- `kubernetes-architect` — Kubernetes design and deployment
- `k8s-manifest-generator` — Kubernetes manifest generation
- `k8s-security-policies` — Kubernetes security best practices
- `aws-skills` — AWS service integration

**Testing & Quality**

- `testing-patterns` — Unit testing, integration testing, mocking
- `tdd-workflow` — Test-driven development practices
- `test-automator` — Test automation, CI/CD testing
- `production-code-audit` — Code review and audit

**Security & Compliance**

- `security-auditor` — Security audits, vulnerability assessments
- `security-bluebook-builder` — Security documentation, policies
- `security-compliance-compliance-check` — Compliance verification
- `security-requirement-extraction` — Security requirements analysis
- `security-scanning-security-dependencies` — Dependency scanning, vulnerability management
- `security-scanning-security-hardening` — Security hardening
- `security-scanning-security-sast` — Static analysis, SAST tools
- `secrets-management` — Secrets storage and rotation

**Monitoring & Observability**

- `prometheus-configuration` — Prometheus setup, metrics
- `grafana-dashboards` — Dashboard creation, visualization
- `sentry-automation` — Error tracking, Sentry integration

**Architecture & Design**

- `architecture` — Architectural decision making
- `architecture-patterns` — Common architectural patterns
- `software-architecture` — Software architecture principles
- `senior-architect` — High-level architectural guidance
- `cqrs-implementation` — CQRS pattern implementation
- `event-sourcing-architect` — Event sourcing design
- `microservices-patterns` — Microservices architecture
- `monorepo-architect` — Monorepo structure and management
- `monorepo-management` — Monorepo tooling and practices

**Documentation & Code Quality**

- `code-documentation-doc-generate` — Code documentation generation
- `docs-architect` — Documentation architecture
- `documentation-templates` — Documentation templates
- `api-documenter` — API documentation
- `api-documentation-generator` — Automated API docs

**Code Review & Collaboration**

- `fix-review` — Code review feedback and improvements
- `receiving-code-review` — Responding to code reviews
- `caveman-review` — Simplified review process
- `production-code-audit` — Production code auditing

**Prompt Engineering & Enhancement**

- `prompt-engineer` — Prompt engineering techniques
- `prompt-engineering` — Prompt optimization
- `prompt-engineering-patterns` — Common prompt patterns
- `enhance-prompt` — Prompt enhancement
- `prompt-library` — Library of effective prompts

**Additional Specialized Skills**

- `error-debugging-error-analysis` — Error debugging and root cause analysis
- `debugging-strategies` — Debugging methodologies
- `debugger` — Using debuggers effectively
- `performance-optimization` — Performance tuning
- `cost-optimization` — Cost optimization strategies
- `dependency-upgrade` — Dependency management and upgrades
- `dependency-management-deps-audit` — Dependency auditing
- `security-scanning-security-dependencies` — Dependency vulnerability scanning
- `codebase-cleanup-deps-audit` — Codebase cleanup
- `environment-setup-guide` — Environment configuration

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

- ✅ `backend-dev-guidelines` — Express patterns, controller/service/repository
- ✅ `backend-architect` — Architecture decisions, scalability
- ✅ `api-design-principles` — REST design, error handling
- ✅ `api-security-best-practices` — Authentication, authorization
- ✅ `database-design` — Schema optimization
- ✅ `postgres-best-practices` — Query optimization, indexes (CRITICAL)
- ✅ `testing-patterns` — Unit + integration testing

**Key Domains:**

- Controllers, Services, Database layer, Middleware, Routes, Config

---

### 2. **Frontend & UI Layer** (`packages/client/src`)

**Technology Stack:**

- React 19.x
- Vite (build tool)
- TailwindCSS 4.x
- TypeScript strict mode
- React Router, dnd-kit, LiveKit components
- Zod (client-side validation)

**Skill Dependencies:**

- ✅ `frontend-dev-guidelines` — React patterns, hooks, state management
- ✅ `frontend-design` — Component design, accessibility
- ✅ `ui-component-skills` — TailwindCSS, responsive design
- ✅ `form-handling-skills` — Form validation, error states
- ✅ `frontend-security-coder` — XSS prevention, input sanitization
- ✅ `testing-patterns` — Component testing, React Testing Library

**Key Domains:**

- Pages, Components, Hooks, Services, Contexts, Types

---

### 3. **Shared/Types Layer** (`packages/shared/src`)

**Purpose:** Single source of truth for types, constants, validation schemas.

**Skill Dependencies:**

- ✅ `database-design` — Schema contracts
- ✅ `api-design-principles` — API contracts
- ✅ Type safety patterns

---

### 4. **Infrastructure & DevOps**

**Technology Stack:**

- Terraform, AWS, Docker, GitHub Actions
- Postgres 15+, Redis 7.x, ECS Fargate

**Skill Dependencies:**

- ✅ `devops-terraform-skills` — IaC, provisioning
- ✅ `deployment-pipeline-design` — CI/CD
- ✅ `docker-expert` — Containerization
- ✅ `aws-skills` — AWS services
- ✅ `security-scanning-security-hardening` — Security hardening

---

### 5. **Database & Migrations**

**ORM:** Drizzle | **Database:** PostgreSQL 15+ | **Migration Tool:** drizzle-kit

**Skill Dependencies:**

- ✅ `postgres-best-practices` — **CRITICAL for Veridian** — indexing, connection pooling, RLS, query optimization
- ✅ `database-design` — Schema design
- ✅ `database-migration` — Safe migrations
- ✅ `database-optimizer` — Query optimization

---

### 6. **Security & Authentication**

**Patterns:**

- JWT (Access + Refresh tokens)
- HTTP-only cookies for refresh tokens
- RBAC (role-based access control)
- Organization isolation
- Permission checks on all endpoints

**Skill Dependencies:**

- ✅ `security-auditor` — Security reviews
- ✅ `security-scanning-security-hardening` — Hardening
- ✅ `secrets-management` — Secrets storage
- ✅ `api-security-best-practices` — API security

---

### 7. **LiveKit & Real-Time**

**Integration:** LiveKit server SDK, WebRTC streaming, egress (recordings)

**Skill Dependencies:**

- ✅ Streaming media best practices
- ✅ Real-time data synchronization patterns
- ✅ Recording management

---

### 8. **Observability & Monitoring** (Phase 2)

**Stack (Planned):**

- Structured logging (Pino → CloudWatch)
- Metrics (Prometheus/CloudWatch)
- Tracing (OpenTelemetry → X-Ray/Jaeger)
- Error tracking (Sentry)
- Dashboards (Grafana / CloudWatch)

**Skill Dependencies:**

- ✅ `prometheus-configuration` — Metrics collection
- ✅ `grafana-dashboards` — Dashboard creation
- ✅ `sentry-automation` — Error tracking

---

## Task-Skill Mapping

### Common Tasks → Required Skills

| Task                          | Primary Skill                                            | Secondary Skills                                                      |
| ----------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| **Add new API endpoint**      | `backend-dev-guidelines` + `api-design-principles`       | `database-design`, `api-security-best-practices`, `testing-patterns`  |
| **Create new database table** | `database-design` + `postgres-best-practices`            | `database-migration`, `database-optimizer`                            |
| **Build React component**     | `frontend-dev-guidelines` + `frontend-design`            | `ui-component-skills`, `accessibility-skills`, `testing-patterns`     |
| **Fix performance issue**     | `postgres-best-practices` OR `database-optimizer`        | Domain-specific skill                                                 |
| **Implement auth**            | `api-security-best-practices`                            | `backend-dev-guidelines`, `secrets-management`                        |
| **Deploy to production**      | `deployment-pipeline-design` + `devops-terraform-skills` | `docker-expert`, `aws-skills`, `security-scanning-security-hardening` |
| **Improve query performance** | `postgres-best-practices`                                | `database-optimizer`, `testing-patterns`                              |
| **Add unit tests**            | `testing-patterns` + `tdd-workflow`                      | Domain-specific skill                                                 |
| **Security audit**            | `security-auditor`                                       | Domain-specific skill                                                 |
| **Setup monitoring**          | `prometheus-configuration` + `grafana-dashboards`        | `sentry-automation`                                                   |

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
- [ ] Use load_ability("find-skills") to discover applicable skills for your domain
- [ ] Identify primary domain (backend, frontend, database, infra, security, etc.)
- [ ] Load applicable skills via load_ability:
       Example: load_ability("backend-dev-guidelines")
       Example: load_ability("postgres-best-practices")
       Example: load_ability("frontend-dev-guidelines")
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
- [ ] Code follows documented patterns from loaded skills
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
      eq(eventRooms.organizationId, orgId), // ← REQUIRED
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

    const pdfBuffer = await generateVerificationReportPdf(
      roomId,
      orgId,
      req.user!,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// ❌ WRONG: No permission check
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  const pdfBuffer = await generateVerificationReportPdf(
    req.params.id,
    req.user!.organizationId,
    req.user!,
  );
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
    next(err); // Error handler catches & logs
  }
};

// ❌ WRONG: No validation, no error handling
export const saveRoomForm: RequestHandler = async (req, res) => {
  const form = await saveFormDefinition(
    req.params.id,
    req.user!.organizationId,
    req.user!,
    req.body.fields,
  );
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
  "Event room closed",
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
  const pdfBuffer = await fetch(gotenbergUrl).then((r) => r.arrayBuffer());
} catch (err) {
  logger.error({ roomId, err }, "Gotenberg PDF generation failed");
  throw ApiError.internal(
    "PDF generation temporarily unavailable. Try again in a few minutes.",
  );
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
});
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
  name = "Eventclick/jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt.result
}
```

---

## Performance & Observability Standards

### Database Query Optimization

**CRITICAL: Load `postgres-best-practices` skill before optimizing queries.**

**Rules:**

1. Avoid N+1 queries — use JOINs or batch queries
2. Index frequently queried columns (see postgres-best-practices)
3. Use `LIMIT` + `OFFSET` for pagination or cursor-based pagination
4. Monitor slow queries (>1s) in CloudWatch
5. Use covering indexes to avoid table lookups
6. Create composite indexes for multi-column queries

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
    const pdfBuffer = await generateVerificationReportPdf(
      roomId,
      orgId,
      req.user!,
    );

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
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2s delay, exponential backoff
    },
    removeOnComplete: true, // Auto-cleanup successful jobs
    removeOnFail: false, // Keep failed jobs for debugging
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
      throw err; // Will retry
    }
  },
  { connection: redis, concurrency: 2 },
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
const room = await db
  .select()
  .from(eventRooms)
  .where(eq(eventRooms.id, roomId));

// ✅ CORRECT
const room = await db
  .select()
  .from(eventRooms)
  .where(and(eq(eventRooms.id, roomId), eq(eventRooms.organizationId, orgId)));
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

## Quick Skill Reference by Task Type

### Frontend Tasks

```
load_ability("find-skills")  ← First, discover relevant skills
load_ability("frontend-dev-guidelines")
load_ability("frontend-design")
load_ability("ui-component-skills")
load_ability("testing-patterns")
```

### Backend Tasks

```
load_ability("find-skills")
load_ability("backend-dev-guidelines")
load_ability("api-design-principles")
load_ability("api-security-best-practices")
load_ability("testing-patterns")
```

### Database Tasks

```
load_ability("find-skills")
load_ability("postgres-best-practices")  ← CRITICAL
load_ability("database-design")
load_ability("database-optimizer")
load_ability("database-migration")
```

### Infrastructure Tasks

```
load_ability("find-skills")
load_ability("devops-terraform-skills")
load_ability("deployment-pipeline-design")
load_ability("docker-expert")
load_ability("aws-skills")
```

### Security Tasks

```
load_ability("find-skills")
load_ability("security-auditor")
load_ability("security-scanning-security-hardening")
load_ability("api-security-best-practices")
load_ability("secrets-management")
```

### Testing Tasks

```
load_ability("find-skills")
load_ability("testing-patterns")
load_ability("tdd-workflow")
load_ability("test-automator")
```

---

## Conclusion

This framework ensures that AI agents assisting on Veridian:

1. **Always perform skill discovery first** — leveraging domain-specific guidance from 100+ production-grade skills
2. **Respect architectural contracts** — multi-tenancy, RBAC, async patterns are non-negotiable
3. **Maintain high quality standards** — TypeScript strict, tests, error handling, Postgres best practices
4. **Prioritize security & compliance** — organization isolation, audit trails, data privacy
5. **Follow production best practices** — logging, monitoring, graceful degradation

**Key Mantra:**

> **SKILL DISCOVERY FIRST.** Load abilities relevant to your task domain. Follow the patterns within. Execute with confidence.

---

**Version:** 2.0 (With Comprehensive Skill Integration)  
**Last Updated:** 2025-05-21  
**Maintained By:** NVCES DevOps & Engineering Team  
**Next Review:** 2025-06-21  
**Status:** ✅ Ready for Production
