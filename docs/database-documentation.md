# Eventclick Database Documentation

## 1. Overview

| Property | Value |
|---|---|
| **DBMS** | PostgreSQL 16 (with PostGIS 3.4) |
| **ORM** | Drizzle ORM (node-postgres driver) |
| **Schema migrations** | `packages/server/drizzle/` (24 migrations) |
| **Docker image** | `postgis/postgis:16-3.4-alpine` |
| **Extensions** | `uuid-ossp`, `pgcrypto`, `postgis` |

---

## 2. Docker Configuration

### 2.1 Development (`docker-compose.yml`)

```yaml
postgres:
  image: postgis/postgis:16-3.4-alpine
  container_name: ${DB_NAME}_postgres   # Eventclick_db_postgres
  ports:
    - "${DB_PORT:-5432}:5432"
  environment:
    POSTGRES_USER: ${DB_USER}           # Eventclick_admin
    POSTGRES_PASSWORD: ${DB_PASSWORD}   # 1234
    POSTGRES_DB: ${DB_NAME}             # Eventclick_db
  volumes:
    - pg_data:/var/lib/postgresql/data
    - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
```

### 2.2 Production (`docker-compose.prod.yml`)

```yaml
postgres:
  image: postgis/postgis:16-3.4-alpine
  container_name: ${DB_NAME}_postgres
  restart: always
  expose:
    - "5432"                    # NOT exposed to host
  environment:
    POSTGRES_USER: ${DB_USER}
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: ${DB_NAME}
    POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
  volumes:
    - pg_data_prod:/var/lib/postgresql/data
    - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
  command:
    - "postgres"
    - "-c" "shared_buffers=128MB"
    - "-c" "effective_cache_size=512MB"
    - "-c" "work_mem=4MB"
    - "-c" "maintenance_work_mem=64MB"
    - "-c" "max_connections=50"
    - "-c" "log_min_duration_statement=1000"
    - "-c" "log_statement=ddl"
```

**Production memory limits**: 384M max, 256M reserved.

### 2.3 Database Initialization

`scripts/init-db.sql` runs on every container start:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
SELECT 'Eventclick_db database initialized' AS status;
```

**Note**: Migrations are applied separately by the `migrate` service in production or `npm run db:migrate` in dev.

---

## 3. Connection Architecture

Three distinct database connections with different privilege levels:

### 3.1 Connection URLs (from `.env`)

| Variable | URL | Role | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db` | `Eventclick_admin` (superuser) | Migrations, schema changes |
| `APP_DATABASE_URL` | `postgresql://app_user_login:local_dev_app@localhost:5433/Eventclick_db` | `app_user` via `app_user_login` | Runtime app queries (RLS enforced) |
| `AUTH_DATABASE_URL` | `postgresql://auth_svc_role:local_dev_auth@localhost:5433/Eventclick_db` | `auth_svc_role` (BYPASSRLS) | Auth queries (login, signup, password reset) |

### 3.2 Pool Configuration (`packages/server/src/db/index.ts`)

```typescript
// App pool — uses APP_DATABASE_URL or falls back to DATABASE_URL
export const pool = new Pool({
  connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL,
  max: env.DB_POOL_MAX,           // default: 10
  idleTimeoutMillis: 30_000,
});

// Auth pool — separate pool for pre-tenant auth queries
export const authPool = env.AUTH_DATABASE_URL
  ? new Pool({
      connectionString: env.AUTH_DATABASE_URL,
      max: Math.max(2, Math.floor((env.DB_POOL_MAX || 10) / 2)),
      idleTimeoutMillis: 30_000,
    })
  : pool;
```

**Fallback behavior**: If `AUTH_DATABASE_URL` is unset, both pools share the same connection. This is acceptable for local dev but production should set both.

---

## 4. Database Roles

### 4.1 Role Hierarchy

```
Eventclick_admin (superuser — for migrations only)
    │
    ├── app_user (NOLOGIN group role — RLS enforced)
    │       └── app_user_login (LOGIN — used by app pool)
    │
    └── auth_svc_role (LOGIN, BYPASSRLS — for auth queries)
```

### 4.2 Role Details

| Role | Login | BypassRLS | Used By | Access |
|---|---|---|---|---|
| `Eventclick_admin` | Yes | Yes | Migrations only | Full superuser |
| `app_user` | No | No | Group role | SELECT, INSERT, UPDATE, DELETE on tenant tables (via RLS) |
| `app_user_login` | Yes | No | App pool (`APP_DATABASE_URL`) | Inherits `app_user` |
| `auth_svc_role` | Yes | **Yes** | Auth pool (`AUTH_DATABASE_URL`) | SELECT, INSERT, UPDATE on identity tables only |

### 4.3 Grants

**`app_user`** (from migration 0023):
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

**`auth_svc_role`** (from migration 0022):
```sql
GRANT SELECT, INSERT, UPDATE ON users TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON sessions TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON password_resets TO auth_svc_role;
GRANT SELECT, INSERT, UPDATE ON email_verifications TO auth_svc_role;
GRANT SELECT ON organizations TO auth_svc_role;
```

**Auth tables locked from `app_user`**:
```sql
REVOKE ALL ON sessions FROM app_user;
REVOKE ALL ON password_resets FROM app_user;
REVOKE ALL ON email_verifications FROM app_user;
```

---

## 5. Schema — 19 Tables

### 5.1 Table Inventory

| # | Table | organization_id | deleted_at | RLS | FORCE RLS |
|---|---|---|---|---|---|
| 1 | `organizations` | **PK** (id) | Yes | Yes | Yes |
| 2 | `users` | Yes | Yes | Yes | Yes |
| 3 | `org_members` | Yes | No | Yes | Yes |
| 4 | `event_rooms` | Yes | Yes | Yes | Yes |
| 5 | `room_recordings` | Yes | No | Yes | Yes |
| 6 | `form_definitions` | Yes | Yes | Yes | Yes |
| 7 | `attendance_entries` | Yes | Yes | Yes | Yes |
| 8 | `event_admin_assignments` | Yes | No | Yes | Yes |
| 9 | `activity_submissions` | Yes | No | Yes | Yes |
| 10 | `activity_photos` | Yes | Yes | Yes | Yes |
| 11 | `notifications` | Yes | No | Yes | Yes |
| 12 | `pdf_jobs` | Yes (as `org_id`) | No | Yes | Yes |
| 13 | `feedback` | **Nullable** | No | Yes | Yes |
| 14 | `bug_reports` | **Nullable** | No | Yes | Yes |
| 15 | `audit_logs` | Yes | No | Yes | Yes |
| 16 | `sessions` | No | No | **No** | No |
| 17 | `password_resets` | No | No | **No** | No |
| 18 | `email_verifications` | No | No | **No** | No |
| 19 | `drizzle_migrations` | No | No | No | No |

### 5.2 Relationship Diagram

```
organizations (1) ──< (N) users
organizations (1) ──< (N) org_members (N) >── (1) users
organizations (1) ──< (N) event_rooms
organizations (1) ──< (N) room_recordings
organizations (1) ──< (N) form_definitions
organizations (1) ──< (N) attendance_entries
organizations (1) ──< (N) event_admin_assignments
organizations (1) ──< (N) activity_submissions
organizations (1) ──< (N) activity_photos
organizations (1) ──< (N) notifications
organizations (1) ──< (N) feedback
organizations (1) ──< (N) bug_reports
organizations (1) ──< (N) audit_logs
organizations (1) ──< (N) pdf_jobs

users (1) ──< (N) sessions (token-based auth)
users (1) ──< (N) password_resets
users (1) ──< (N) email_verifications

event_rooms (1) ──< (N) room_recordings
event_rooms (1) ──< (N) form_definitions
event_rooms (1) ──< (N) attendance_entries
event_rooms (1) ──< (N) event_admin_assignments
event_rooms (1) ──< (N) activity_submissions
event_rooms (1) ──< (N) pdf_jobs

form_definitions (1) ──< (N) attendance_entries

activity_submissions (1) ──< (N) activity_photos
```

### 5.3 Table Schemas

#### `organizations` (Tenant Root)

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
name            varchar(160) NOT NULL
slug            varchar(80) NOT NULL UNIQUE
description     text
logo_url        text
website_url     text
contact_email   varchar(320)
is_active       boolean NOT NULL DEFAULT true
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
deleted_at      timestamptz
```

#### `users`

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
email               varchar(320) NOT NULL UNIQUE
password_hash       text
full_name           varchar(120) NOT NULL
role                user_role NOT NULL DEFAULT 'volunteer'
photo_url           text
preferences         jsonb
organization_id     uuid REFERENCES organizations(id) ON DELETE SET NULL
google_id           varchar(128) UNIQUE
email_verified_at   timestamptz
is_active           boolean NOT NULL DEFAULT true
last_login_at       timestamptz
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
deleted_at          timestamptz

-- Indexes
users_org_idx       ON (organization_id)
users_role_idx      ON (role)
```

#### `org_members` (Many-to-Many: users ↔ organizations)

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
role            user_role NOT NULL
invited_by      uuid REFERENCES users(id) ON DELETE SET NULL
joined_at       timestamptz NOT NULL DEFAULT now()
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()

-- Constraints & Indexes
UNIQUE (user_id, organization_id)
org_members_org_idx      ON (organization_id)
org_members_invited_by_idx ON (invited_by)
```

#### `event_rooms`

```sql
id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4()
organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
created_by              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
title                   varchar(200) NOT NULL
description             text
status                  room_status NOT NULL DEFAULT 'scheduled'
scheduled_start         timestamptz NOT NULL
scheduled_end           timestamptz NOT NULL
actual_start            timestamptz
actual_end              timestamptz
max_participants        integer
share_token             varchar(32) NOT NULL UNIQUE
livekit_room_name       varchar(80)
stream_provider         stream_provider NOT NULL DEFAULT 'livekit'
youtube_watch_url       text
youtube_embed_url       text
attendance_window_before integer NOT NULL DEFAULT 15
attendance_window_after  integer NOT NULL DEFAULT 30
location                varchar(300)
latitude                double precision
longitude               double precision
activity_definitions    jsonb NOT NULL DEFAULT '[]'
cancellation_reason     text
created_at              timestamptz NOT NULL DEFAULT now()
updated_at              timestamptz NOT NULL DEFAULT now()
deleted_at              timestamptz

-- Indexes
event_rooms_org_idx          ON (organization_id)
event_rooms_status_idx       ON (status)
event_rooms_scheduled_start_idx ON (scheduled_start)
event_rooms_org_status_idx   ON (organization_id, status)
event_rooms_org_created_at_idx ON (organization_id, created_at)
```

#### `room_recordings`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
room_id         uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
status          recording_status NOT NULL DEFAULT 'pending'
egress_id       varchar(80)
s3_key          varchar(256)
mime_type       varchar(64)
size_bytes      bigint
started_at      timestamptz
ended_at        timestamptz
error           text
created_at      timestamptz NOT NULL DEFAULT now()

-- Indexes
room_recordings_room_idx    ON (room_id)
room_recordings_org_idx     ON (organization_id)
room_recordings_status_idx  ON (status)
room_recordings_egress_idx  ON (egress_id)
```

#### `form_definitions`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
room_id         uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
version         integer NOT NULL DEFAULT 1
fields          jsonb NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
deleted_at      timestamptz

-- Constraints & Indexes
UNIQUE (room_id, version)
form_definitions_room_idx ON (room_id)
form_definitions_org_idx  ON (organization_id)
```

#### `attendance_entries`

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
room_id             uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
form_definition_id  uuid NOT NULL REFERENCES form_definitions(id) ON DELETE RESTRICT
submitted_by        uuid REFERENCES users(id) ON DELETE SET NULL
data                jsonb NOT NULL
photo_key           varchar(256)
photo_url           text
latitude            double precision
longitude           double precision
location            geometry(point, 4326)   -- PostGIS
ip_address          varchar(45)
user_agent          text
submitted_at        timestamptz NOT NULL DEFAULT now()
deleted_at          timestamptz

-- Indexes
attendance_entries_room_idx           ON (room_id)
attendance_entries_org_idx            ON (organization_id)
attendance_entries_form_idx           ON (form_definition_id)
attendance_entries_submitted_at_idx   ON (submitted_at)
attendance_entries_submitted_by_idx   ON (submitted_by)
attendance_entries_room_submitted_at_idx ON (room_id, submitted_at)
attendance_entries_location_idx       USING gist (location)
```

#### `event_admin_assignments`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
room_id         uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
assigned_role   user_role NOT NULL
assigned_by     uuid REFERENCES users(id) ON DELETE SET NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
revoked_at      timestamptz

-- Constraints & Indexes
UNIQUE (user_id, room_id)
event_admin_assignments_org_idx      ON (organization_id)
event_admin_assignments_room_idx     ON (room_id)
event_admin_assignments_user_idx     ON (user_id)
event_admin_assignments_assigned_by_idx ON (assigned_by)
event_admin_assignments_revoked_idx  ON (revoked_at)
```

#### `activity_submissions`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
room_id         uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
activity_id     varchar(64) NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()

-- Constraints & Indexes
UNIQUE (room_id, activity_id)
activity_submissions_room_idx      ON (room_id)
activity_submissions_org_idx       ON (organization_id)
activity_submissions_activity_idx  ON (activity_id)
```

#### `activity_photos`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
submission_id   uuid NOT NULL REFERENCES activity_submissions(id) ON DELETE CASCADE
room_id         uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
activity_id     varchar(64) NOT NULL
photo_key       varchar(256) NOT NULL
photo_url       text NOT NULL
latitude        double precision
longitude       double precision
location        geometry(point, 4326)   -- PostGIS
submitted_by    uuid REFERENCES users(id) ON DELETE SET NULL
created_at      timestamptz NOT NULL DEFAULT now()
deleted_at      timestamptz

-- Indexes
activity_photos_submission_idx    ON (submission_id)
activity_photos_room_activity_idx ON (room_id, activity_id)
activity_photos_org_idx           ON (organization_id)
activity_photos_submitted_by_idx  ON (submitted_by)
activity_photos_location_idx      USING gist (location)
```

#### `notifications`

```sql
id          uuid PRIMARY KEY DEFAULT randomuuid()
user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
type        text NOT NULL           -- 'attendance_checkin', 'room_scheduled', 'system_alert'
title       text NOT NULL
message     text NOT NULL
is_read     boolean NOT NULL DEFAULT false
metadata    text                    -- JSON stringified
created_at  timestamptz NOT NULL DEFAULT now()

-- Indexes
notifications_user_id_idx    ON (user_id)
notifications_org_id_idx     ON (organization_id)
notifications_created_at_idx ON (created_at)
```

#### `pdf_jobs`

```sql
id          uuid PRIMARY KEY DEFAULT randomuuid()
job_id      text NOT NULL UNIQUE
room_id     uuid NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE
org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE  -- NOTE: column name is org_id, not organization_id
user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
status      text NOT NULL DEFAULT 'pending'
s3_key      text
s3_url      text
error_message text
attempts    integer NOT NULL DEFAULT 0
max_attempts integer NOT NULL DEFAULT 3
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
completed_at timestamptz

-- Indexes
pdf_jobs_job_id_idx  ON (job_id)
pdf_jobs_room_id_idx ON (room_id)
pdf_jobs_user_id_idx ON (user_id)
pdf_jobs_status_idx  ON (status)
```

**⚠️ Column naming inconsistency**: `pdf_jobs` uses `org_id` instead of `organization_id`. The RLS policy accounts for this.

#### `feedback`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE  -- NULLABLE
category        varchar(100) NOT NULL
rating          integer NOT NULL
subject         varchar(200) NOT NULL
comments        text NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()

-- Indexes
feedback_user_idx ON (user_id)
feedback_org_idx  ON (organization_id)
```

#### `bug_reports`

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE  -- NULLABLE
severity        varchar(50) NOT NULL
component       varchar(100) NOT NULL
title           varchar(200) NOT NULL
steps           text NOT NULL
expected        text NOT NULL
actual          text NOT NULL
system_info     text
status          varchar(50) NOT NULL DEFAULT 'open'
created_at      timestamptz NOT NULL DEFAULT now()

-- Indexes
bug_reports_user_idx ON (user_id)
bug_reports_org_idx  ON (organization_id)
```

#### `audit_logs` (GDPR Article 30 Trail)

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL
actor_email     varchar(320)
action          varchar(120) NOT NULL
resource_type   varchar(80) NOT NULL
resource_id     uuid
old_values      text
new_values      text
ip_address      varchar(64)
user_agent      text
created_at      timestamptz NOT NULL DEFAULT now()
```

#### `sessions` (Auth — No RLS)

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash      varchar(64) NOT NULL UNIQUE
family_id       uuid NOT NULL
replaced_by_id  uuid REFERENCES sessions(id) ON DELETE SET NULL
user_agent      text
ip_address      varchar(45)
expires_at      timestamptz NOT NULL
revoked_at      timestamptz
created_at      timestamptz NOT NULL DEFAULT now()

-- Indexes
sessions_user_idx       ON (user_id)
sessions_family_idx     ON (family_id)
sessions_replaced_by_idx ON (replaced_by_id)
sessions_expires_at_idx ON (expires_at)
```

#### `password_resets` (Auth — No RLS)

```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash      varchar(256) NOT NULL UNIQUE
expires_at      timestamptz NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
used_at         timestamptz

-- Indexes
password_resets_token_hash_idx ON (token_hash)
password_resets_user_idx       ON (user_id)
```

#### `email_verifications` (Auth — No RLS)

```sql
id              uuid PRIMARY KEY DEFAULT randomuuid()
user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash      varchar(256) NOT NULL UNIQUE
expires_at      timestamptz NOT NULL
used_at         timestamptz
created_at      timestamptz NOT NULL DEFAULT now()
```

### 5.4 Enums

| Enum | Values |
|---|---|
| `user_role` | `admin`, `event_manager`, `volunteer` |
| `room_status` | `scheduled`, `live`, `ended`, `cancelled` |
| `stream_provider` | `livekit`, `youtube` |
| `recording_status` | `pending`, `active`, `completed`, `failed` |

---

## 6. Row Level Security (RLS)

### 6.1 RLS Status Summary

| Table | RLS Enabled | FORCE RLS | Policies |
|---|---|---|---|
| `organizations` | ✅ | ✅ | 4 (read_own, update_own, delete_own, insert_new) |
| `users` | ✅ | ✅ | 2 (tenant_isolation, insert_new) |
| `org_members` | ✅ | ✅ | 1 (tenant_isolation) |
| `event_rooms` | ✅ | ✅ | 1 (tenant_isolation) |
| `room_recordings` | ✅ | ✅ | 1 (tenant_isolation) |
| `form_definitions` | ✅ | ✅ | 1 (tenant_isolation) |
| `attendance_entries` | ✅ | ✅ | 1 (tenant_isolation) |
| `event_admin_assignments` | ✅ | ✅ | 1 (tenant_isolation) |
| `activity_submissions` | ✅ | ✅ | 1 (tenant_isolation) |
| `activity_photos` | ✅ | ✅ | 1 (tenant_isolation) |
| `notifications` | ✅ | ✅ | 1 (tenant_isolation) |
| `pdf_jobs` | ✅ | ✅ | 1 (tenant_isolation) |
| `feedback` | ✅ | ✅ | 1 (tenant_isolation) |
| `bug_reports` | ✅ | ✅ | 1 (tenant_isolation) |
| `audit_logs` | ✅ | ✅ | 1 (tenant_isolation) |
| `sessions` | ❌ | ❌ | N/A (locked via REVOKE) |
| `password_resets` | ❌ | ❌ | N/A (locked via REVOKE) |
| `email_verifications` | ❌ | ❌ | N/A (locked via REVOKE) |

### 6.2 Policy Details

**Standard tenant isolation policy pattern** (13 tables):
```sql
CREATE POLICY <table>_tenant_isolation ON <table>
  USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
```

**Special case — `pdf_jobs`** (uses `org_id` column):
```sql
CREATE POLICY pdf_jobs_tenant_isolation ON pdf_jobs
  USING (org_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
```

**Special case — `organizations`** (self-referencing PK):
```sql
CREATE POLICY organizations_read_own ON organizations FOR SELECT
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_update_own ON organizations FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_delete_own ON organizations FOR DELETE
  USING (id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY organizations_insert_new ON organizations FOR INSERT
  WITH CHECK (true);  -- open for signup
```

**Special case — `users`** (nullable org_id + org_members membership):
```sql
CREATE POLICY users_tenant_isolation ON users
  USING (
    organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM org_members m
      WHERE m.user_id = users.id
        AND m.organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR organization_id IS NULL
  );

CREATE POLICY users_insert_new ON users FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR organization_id IS NULL
  );
```

**Audit logs immutability**:
```sql
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
GRANT SELECT, INSERT ON audit_logs TO app_user;
-- app_user can only INSERT and SELECT audit_logs, never UPDATE or DELETE
```

### 6.3 FORCE ROW LEVEL SECURITY

All 15 tenant tables have `FORCE ROW LEVEL SECURITY` enabled. This means **even superuser connections must pass the policy check**. The only bypass is `auth_svc_role` which has `BYPASSRLS`.

### 6.4 NULLABLE organization_id Behavior

`feedback` and `bug_reports` have nullable `organization_id`. Under RLS:
- `NULL = NULL` evaluates to NULL (not true)
- Rows with `organization_id IS NULL` are **invisible** to all tenant contexts
- This is the correct fail-safe behavior

If platform-wide admin access to these rows is needed, it must go through a separate bypass role.

---

## 7. Tenant Isolation Mechanism

### 7.1 How It Works

```
Request → JWT decoded → req.user.organizationId extracted
       → SET LOCAL app.current_tenant = '<org-uuid>'
       → All queries in this transaction filtered by RLS policy
       → Transaction ends → app.current_tenant reset
```

### 7.2 Middleware (`packages/server/src/middleware/tenantContext.ts`)

```typescript
export async function setTenantContext(req, _res, next) {
  const orgId = req.user?.organizationId;
  if (!orgId) return next();

  try {
    await db.execute(sql`SET LOCAL app.current_tenant = ${orgId}`);
  } catch (error) {
    req.log?.warn({ error, orgId }, "Failed to set tenant context");
  }
  next();
}
```

**Key behaviors**:
- `SET LOCAL` sets the parameter for the current transaction only
- If `req.user.organizationId` is null (e.g., public endpoints), tenant context is not set
- RLS policies use `NULLIF(current_setting('app.current_tenant', true), '')` to handle unset context gracefully (returns NULL, which makes the policy evaluate to false, hiding all rows)

### 7.3 Policy Behavior by Context

| `app.current_tenant` | RLS Policy Result |
|---|---|
| Set to valid UUID | Shows only rows matching that organization_id |
| Empty string `''` | `NULLIF` returns NULL → policy is FALSE → no rows visible |
| Not set (NULL) | `current_setting(..., true)` returns NULL → `NULLIF` returns NULL → policy is FALSE → no rows visible |

---

## 8. Auth Flow and Role Separation

### 8.1 Auth Queries (BYPASSRLS)

These queries run through `auth_svc_role` which bypasses RLS:

| Operation | Tables Accessed |
|---|---|
| Login (email lookup) | `users` |
| Signup | `users` |
| Token refresh | `sessions` |
| Password reset request | `password_resets` |
| Password reset confirm | `password_resets`, `users` |
| Email verification | `email_verifications` |

**Security note**: `auth_svc_role` has `BYPASSRLS` because these operations are inherently pre-tenant (you can't know the tenant until you've identified the user). The security boundary is credential possession, not RLS.

### 8.2 Business Queries (RLS Enforced)

All other queries run through `app_user_login` which is subject to RLS:
- Event room CRUD
- Attendance submissions
- Activity photos
- Notifications
- Admin assignments
- Feedback/bug reports
- Audit logs

---

## 9. Soft Deletes

All business tables except auth tables use soft deletes via `deleted_at`:
- `organizations.deleted_at`
- `users.deleted_at`
- `event_rooms.deleted_at`
- `form_definitions.deleted_at`

**Soft delete helper** (`packages/server/src/db/helpers.ts`):
```typescript
export const withSoftDelete = (table) => isNull(table.deletedAt);
export const softDeleteValues = () => ({ deletedAt: new Date(), updatedAt: new Date() });
```

**Critical convention**: Every query must explicitly exclude deleted rows. RLS does NOT automatically filter soft deletes.

---

## 10. Indexes

### 10.1 Performance Indexes

| Table | Index | Columns |
|---|---|---|
| `users` | `users_org_idx` | `organization_id` |
| `users` | `users_role_idx` | `role` |
| `event_rooms` | `event_rooms_org_idx` | `organization_id` |
| `event_rooms` | `event_rooms_org_status_idx` | `(organization_id, status)` |
| `event_rooms` | `event_rooms_org_created_at_idx` | `(organization_id, created_at)` |
| `form_definitions` | `form_definitions_room_version_unique` | `(room_id, version)` UNIQUE |
| `attendance_entries` | `attendance_entries_room_submitted_at_idx` | `(room_id, submitted_at)` |
| `org_members` | `org_members_user_org_uniq` | `(user_id, organization_id)` UNIQUE |
| `event_admin_assignments` | `event_admin_assignments_user_room_uniq` | `(user_id, room_id)` UNIQUE |
| `activity_submissions` | `activity_submissions_room_activity_uniq` | `(room_id, activity_id)` UNIQUE |
| `room_recordings` | `room_recordings_egress_idx` | `(egress_id)` |
| `sessions` | `sessions_family_idx` | `(family_id)` |
| `password_resets` | `password_resets_token_hash_idx` | `(token_hash)` |

### 10.2 Spatial Indexes (PostGIS)

| Table | Index | Column |
|---|---|---|
| `attendance_entries` | `attendance_entries_location_idx` | `location` (GIST) |
| `activity_photos` | `activity_photos_location_idx` | `location` (GIST) |

---

## 11. Migrations

### 11.1 Migration History (24 migrations)

| # | Name | Purpose |
|---|---|---|
| 0000 | public_falcon | Initial schema |
| 0001-0015 | Various | Schema evolution |
| 0016-0018 | Various | Schema evolution |
| 0019 | gifted_karma | Enable RLS on 14 tables, create app_user role |
| 0020 | dry_bombast | Schema changes |
| 0021 | fresh_ironman | Schema changes |
| 0022 | add_missing_rls_policies | Add auth_svc_role, policies for pdf_jobs, audit_logs, orgs, users |
| 0023 | rls_tenant_isolation | Add organization_id to room_recordings, enable FORCE RLS, create all policies |

### 11.2 Migration Commands

```bash
# Generate new migration
npm run db:generate    # uses drizzle-kit generate:pg

# Apply migrations
npm run db:migrate     # runs migrate.ts with advisory lock

# Push schema directly (dev only)
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

### 11.3 Migration Runner (`packages/server/src/db/migrate.ts`)

```typescript
const lockId = 7777777;
await client.query("SELECT pg_advisory_lock($1)", [lockId]);
// ... run migrations ...
await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
```

Uses advisory lock to prevent concurrent migrations.

### 11.4 Production Migration Service

In `docker-compose.prod.yml`, a dedicated `migrate` service runs before the server:
```yaml
migrate:
  image: ghcr.io/owner/eventclick/server:${IMAGE_TAG}
  command: ["node", "-e", "... drizzle migrate ..."]
  depends_on:
    postgres: { condition: service_healthy }
  restart: "no"
```

---

## 12. Verification

### 12.1 RLS Live Test Script

`scripts/rls-live-test.sql` verifies:
1. `app_user` role attributes (not superuser, not BYPASSRLS)
2. RLS status on key tables
3. Policies exist on tenant tables
4. Table ownership
5. FORCE ROW LEVEL SECURITY enabled
6. Cross-org isolation (tenant can't see other org's data)
7. Empty tenant context hides all rows
8. `audit_logs` immutability (can INSERT but not UPDATE/DELETE)
9. Cleanup of test data

### 12.2 Verification Checklist

- [ ] All 15 tenant tables have RLS + FORCE RLS enabled
- [ ] All 20+ policies exist and are valid
- [ ] `app_user` is not superuser and not BYPASSRLS
- [ ] `auth_svc_role` has BYPASSRLS
- [ ] Auth tables (sessions, password_resets, email_verifications) have no access from app_user
- [ ] `SET LOCAL app.current_tenant` correctly filters data per tenant
- [ ] Cross-org queries return empty
- [ ] Empty/null tenant context returns empty
- [ ] Audit logs are append-only (no UPDATE/DELETE grant)
- [ ] Soft delete helper is used in all queries

---

## 13. Data Flow Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Postgres   │
│  (React)    │     │  (Express)  │     │  (RLS)      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  app_user │ │auth_svc_ │ │  Redis   │
        │  (RLS)    │ │ role     │ │          │
        │           │ │(BYPASS)  │ │          │
        └──────────┘ └──────────┘ └──────────┘
```

**Request lifecycle**:
1. Client sends request with JWT
2. Server validates JWT, extracts `organizationId`
3. `tenantContext` middleware: `SET LOCAL app.current_tenant = <orgId>`
4. Business queries go through `app_user` pool → RLS filters by tenant
5. Auth queries go through `auth_svc_role` pool → BYPASSRLS
6. Transaction ends → tenant context reset

---

## 14. Security Notes

1. **No hardcoded passwords in production**: `auth_svc_role` password comes from AWS SSM Parameter Store
2. **Postgres not exposed in production**: Only accessible within Docker network
3. **Redis has password in production**: `--requirepass ${REDIS_PASSWORD}`
4. **Server runs read-only in production**: `read_only: true` with `tmpfs /tmp`
5. **No new privileges**: `security_opt: no-new-privileges:true`
6. **Audit logs are immutable**: No UPDATE/DELETE grants to app_user
7. **Auth tables isolated**: app_user has NO access to sessions/password_resets/email_verifications
8. **FORCE RLS on all tenant tables**: Even superuser connections must pass policy checks
