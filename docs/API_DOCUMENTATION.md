# API Reference Documentation — Eventclick

Base URL: `https://app.eventclick.live/api/v1` (Production) / `http://localhost:4000/api/v1` (Development)

---

## 1. Overview & Conventions

### Headers
Every request should include:
- `Content-Type: application/json`
- `Authorization: Bearer <access_token>` (for authenticated endpoints)
- `X-Request-ID: <uuid>` (optional, generated automatically by Nginx if omitted)

### Error Response Format
All errors return a standardized JSON payload:
```json
{
  "error": "BAD_REQUEST",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email address format"
    }
  ]
}
```

### HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing or expired access token.
- `403 Forbidden`: Insufficient role permissions or CSRF validation failure.
- `404 Not Found`: Resource does not exist or deleted.
- `409 Conflict`: Resource already exists (e.g. duplicate email).
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Server exception.

---

## 2. Health & Observability Endpoints

### Check Process Liveness
- **Method**: `GET /health`
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-08-04T19:00:00.000Z",
  "uptime": 3600.42
}
```

### Check Service Readiness
- **Method**: `GET /ready`
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-08-04T19:00:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Deep Health Probe (Smoke Tests)
- **Method**: `GET /health/deep`
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-08-04T19:00:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "jwt": "ok",
    "storage": "ok",
    "gotenberg": "ok",
    "livekit": "ok"
  }
}
```

---

## 3. Authentication Endpoints (`/api/v1/auth`)

### Register User
- **Method**: `POST /auth/register`
- **Request Body**:
```json
{
  "email": "user@eventclick.live",
  "password": "SecurePassword123!",
  "fullName": "John Doe",
  "organizationName": "Event Corp"
}
```
- **Response `201 Created`**:
```json
{
  "user": {
    "id": "usr_123",
    "email": "user@eventclick.live",
    "fullName": "John Doe",
    "role": "org_admin",
    "organizationId": "org_456"
  },
  "accessToken": "eyJhbGci..."
}
```

### Login User
- **Method**: `POST /auth/login`
- **Request Body**:
```json
{
  "email": "user@eventclick.live",
  "password": "SecurePassword123!"
}
```
- **Response `200 OK`**:
  - Sets HTTP-Only Cookie: `Eventclick_rt=<refresh_token>`
```json
{
  "user": {
    "id": "usr_123",
    "email": "user@eventclick.live",
    "role": "org_admin",
    "organizationId": "org_456"
  },
  "accessToken": "eyJhbGci..."
}
```

### Refresh Access Token
- **Method**: `POST /auth/refresh`
- **Cookie**: `Eventclick_rt=<refresh_token>`
- **Response `200 OK`**:
```json
{
  "accessToken": "eyJhbGci..."
}
```

### Logout User
- **Method**: `POST /auth/logout`
- **Auth**: Bearer Token
- **Response `200 OK`**: Clears `Eventclick_rt` cookie and revokes session in Redis.

### Get Current User Profile
- **Method**: `GET /auth/me`
- **Auth**: Bearer Token
- **Response `200 OK`**: Returns current authenticated user record.

---

## 4. Event Rooms Endpoints (`/api/v1/rooms`)

### List Event Rooms
- **Method**: `GET /rooms`
- **Auth**: Bearer Token (Org Scoped)
- **Query Params**: `page=1&limit=20&status=active`
- **Response `200 OK`**:
```json
{
  "rooms": [
    {
      "id": "room_789",
      "title": "Annual Developers Conference",
      "slug": "annual-dev-conf",
      "status": "active",
      "scheduledStart": "2026-09-01T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}
```

### Create Event Room
- **Method**: `POST /rooms`
- **Auth**: Bearer Token (`org_admin`, `event_manager`)
- **Request Body**:
```json
{
  "title": "Keynote Presentation",
  "description": "Main room presentation",
  "scheduledStart": "2026-09-01T10:00:00Z",
  "maxParticipants": 500
}
```
- **Response `201 Created`**

### Get LiveKit Room Token
- **Method**: `POST /rooms/:id/join-token`
- **Auth**: Bearer Token
- **Response `200 OK`**:
```json
{
  "token": "eyJhbGci...",
  "livekitUrl": "wss://livekit.eventclick.live"
}
```

---

## 5. User Profile Endpoints (`/api/v1/profile`)

### Get Profile
- **Method**: `GET /profile`
- **Auth**: Bearer Token

### Update Profile Details
- **Method**: `PUT /profile`
- **Request Body**:
```json
{
  "fullName": "John Smith",
  "phoneNumber": "+1234567890"
}
```

### Update Password
- **Method**: `PUT /profile/password`
- **Request Body**:
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```
