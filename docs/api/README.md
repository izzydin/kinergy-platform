# Kinergy Platform - OpenAPI 3.0 Reference & API Specification

- **Status:** Active & Production-Hardened Specification
- **Base Route Prefix:** `/api/v1`
- **Interactive Documentation URL:** `http://localhost:3000/api/docs` (Swagger UI)
- **Security Scheme:** HTTP Bearer Token (`Bearer <JWT>`)

---

## 1. Overview & Swagger Configuration

The Kinergy Platform API is structured following RESTful principles, Clean Architecture, and Domain-Driven Design (DDD). The interactive OpenAPI 3.0 documentation is auto-generated during application bootstrap via `@nestjs/swagger` (`DocumentBuilder` in `apps/api/src/main.ts`).

```
http://localhost:3000/api/docs
```

- **Title**: Kinergy Platform API
- **Description**: Enterprise Energy & Sustainability Management System API
- **Version**: 1.0
- **Security Scheme**: `bearerAuth` (JWT Access Token)

---

## 2. Standard Response Envelopes & Error Structures

### 2.1 Success Response (`200 OK` / `201 Created`)

All successful API operations return a standardized `Result<T>` envelope:

```json
{
  "success": true,
  "data": {
    "id": "usr_9b1deb4d-3b7d-416b-9548-52ee8c8230e5",
    "email": "operator@kinergy.com",
    "roles": ["OPERATOR"],
    "status": "ACTIVE"
  },
  "error": null,
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

### 2.2 Generic Authentication Failure (`401 Unauthorized`)

Public authentication failures (`/auth/login`, `/auth/refresh`) return generic uninformative error messages to prevent account harvesting:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid email or password.",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

### 2.3 Validation Failure (`400 Bad Request`)

Payload validation failures triggered by `GlobalSanitizationValidationPipe` or Zod schemas return formatted field validation issues:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email must be a valid email address",
    "password must be at least 12 characters long"
  ],
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/users"
}
```

### 2.4 Authorization Failure (`403 Forbidden`)

Triggered by `AuthorizationGuard` when the authenticated identity lacks required roles or permissions:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Access Denied: Insufficient permission 'users.write'. Required: ['users.write'].",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/users"
}
```

### 2.5 Transport Rate Limit Failure (`429 Too Many Requests`)

Triggered by `@nestjs/throttler` custom guards when rate limits are exceeded:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "ThrottlerException: Too Many Requests",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

## 3. Comprehensive Endpoint Catalog

### 3.1 Health Check (`/health`)

| HTTP Method | Route     | Protection  | Summary & Description                                                               | Expected Status Codes |
| :---------- | :-------- | :---------- | :---------------------------------------------------------------------------------- | :-------------------- |
| `GET`       | `/health` | `@Public()` | **Get Health Status**: Returns system health status, timestamp, and process uptime. | `200 OK`              |

### 3.2 Authentication Module (`/auth`)

| HTTP Method | Route           | Protection                                 | Permission Required | Summary & Description                                                                                                                                                                               | Expected Status Codes                                                             |
| :---------- | :-------------- | :----------------------------------------- | :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `POST`      | `/auth/login`   | `@Public()`, `@LoginThrottle()`            | None                | **Authenticate User**: Validates user credentials, executes constant-time dummy Argon2id check on missing users, checks account lifecycle state, and returns JWT Access Token + Refresh Token pair. | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`429 Too Many Requests` |
| `POST`      | `/auth/refresh` | `@Public()`, `@RefreshThrottle()`          | None                | **Refresh Token Pair**: Consumes active Refresh Token, evaluates sliding-window rotation (RTR), checks for family reuse/replay attacks, and returns new TokenPair.                                  | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`429 Too Many Requests` |
| `POST`      | `/auth/logout`  | `AuthenticationGuard`, `@LogoutThrottle()` | Authenticated       | **User Logout**: Revokes current Refresh Token family in database and clears HTTP-Only session cookies.                                                                                             | `200 OK`<br/>`401 Unauthorized`                                                   |
| `GET`       | `/auth/me`      | `AuthenticationGuard`, `@MeThrottle()`     | Authenticated       | **Get Current User Context**: Returns authenticated user identity context (`userId`, `email`, `roles`, `permissions`, `tenantId`).                                                                  | `200 OK`<br/>`401 Unauthorized`                                                   |

### 3.3 Identity & User Management Module (`/users`)

| HTTP Method | Route                   | Protection                                  | Permission Required | Summary & Description                                                                                                                             | Expected Status Codes                                                                         |
| :---------- | :---------------------- | :------------------------------------------ | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| `POST`      | `/users`                | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Create User Account**: Onboards new user record in target tenant. Validates password complexity (`PasswordPolicyService`) and email uniqueness. | `201 Created`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`                |
| `GET`       | `/users`                | `AuthenticationGuard`, `AuthorizationGuard` | `users.read`        | **Search & Paginate Users**: Returns paginated user directory filtered by status, role, or email search string.                                   | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`                                           |
| `GET`       | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.read`        | **Get User by ID**: Retrieves single user identity aggregate details by unique user ID.                                                           | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |
| `PATCH`     | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Update User**: Updates user roles, email, or tenant context bindings.                                                                           | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found` |
| `POST`      | `/users/:id/activate`   | `AuthenticationGuard`, `AuthorizationGuard` | `users.write`       | **Activate User Account**: Executes state transition to `ACTIVE` status via `UserStatusStateMachine`.                                             | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found` |
| `POST`      | `/users/:id/deactivate` | `AuthenticationGuard`, `AuthorizationGuard` | `users.delete`      | **Deactivate User Account**: Executes state transition to `DEACTIVATED` status, invalidating all refresh tokens.                                  | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |
| `DELETE`    | `/users/:id`            | `AuthenticationGuard`, `AuthorizationGuard` | `users.delete`      | **Soft Delete User**: Soft deletes user record (`status = DELETED`, sets `deletedAt`), invalidating token version.                                | `200 OK`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                       |

---

## 4. HTTP Status Code Reference

| Status Code             | Meaning           | System Trigger & Cause                                                   |
| :---------------------- | :---------------- | :----------------------------------------------------------------------- |
| `200 OK`                | Request Succeeded | Read or mutation operation completed cleanly.                            |
| `201 Created`           | Resource Created  | New entity successfully persisted in database.                           |
| `400 Bad Request`       | Validation Error  | Payload failed Zod or `GlobalSanitizationValidationPipe` rules.          |
| `401 Unauthorized`      | AuthN Failure     | Missing/invalid Bearer token, expired JWT, or invalid login credentials. |
| `403 Forbidden`         | AuthZ Failure     | Authenticated identity lacks required role or permission code.           |
| `404 Not Found`         | Resource Missing  | Requested entity ID does not exist in target tenant scope.               |
| `429 Too Many Requests` | Rate Limited      | Request count exceeded rate limit sliding window.                        |
| `500 Internal Error`    | Server Failure    | Uncaught exception logged to platform telemetry.                         |
