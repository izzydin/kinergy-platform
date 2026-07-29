# API Reference Guide & Technical Specifications

- **Status:** Active
- **Base Route Prefix:** `/api/v1`
- **Interactive Documentation:** Available at `/api/docs` (Swagger UI)

---

## 1. Overview

The Kinergy Platform API is structured around RESTful design principles and Clean Architecture. All endpoints return standardized JSON envelopes, enforce bearer token authentication (except `@Public()` routes), and sanitise all incoming payloads automatically.

---

## 2. Interactive OpenAPI / Swagger Documentation

When running the application locally or in staging environments, interactive OpenAPI 3.0 documentation is available at:

```
http://localhost:3000/api/docs
```

Swagger UI allows developers to inspect request DTO schemas, test endpoint invocations interactively, and inspect response envelopes.

---

## 3. Standard Response Envelope (`Result<T>`)

All API responses adhere to a consistent structure:

### 3.1 Success Response (`200 OK` / `201 Created`)

```json
{
  "success": true,
  "data": {
    "id": "usr_12345",
    "email": "operator@kinergy.com",
    "roles": ["OPERATOR"],
    "status": "ACTIVE"
  },
  "error": null,
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

### 3.2 Error Response (`400 Bad Request` / `401 Unauthorized` / `403 Forbidden`)

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid email or password.",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

## 4. Key Subsystem Endpoints

### 4.1 Authentication Endpoints (`/auth`)

| HTTP Method | Route           | Protection                | Description                                                       |
| :---------- | :-------------- | :------------------------ | :---------------------------------------------------------------- |
| `POST`      | `/auth/login`   | `@Public()`, Rate-Limited | Authenticates credentials and returns JWT Access & Refresh tokens |
| `POST`      | `/auth/refresh` | `@Public()`, Rate-Limited | Consumes Refresh Token and issues new rotated token pair          |
| `POST`      | `/auth/logout`  | `AuthenticationGuard`     | Invalidate active refresh token family and purges session         |
| `GET`       | `/auth/me`      | `AuthenticationGuard`     | Returns context of currently authenticated user                   |

### 4.2 User Management Endpoints (`/users`)

| HTTP Method | Route                   | Protection        | Description                          |
| :---------- | :---------------------- | :---------------- | :----------------------------------- |
| `POST`      | `/users`                | `@Roles('ADMIN')` | Onboard new user record              |
| `GET`       | `/users`                | `@Roles('ADMIN')` | Search and paginate user directory   |
| `GET`       | `/users/:id`            | `@Roles('ADMIN')` | Fetch single user details by ID      |
| `PATCH`     | `/users/:id`            | `@Roles('ADMIN')` | Update user roles or profile details |
| `POST`      | `/users/:id/deactivate` | `@Roles('ADMIN')` | Deactivate user account              |
| `DELETE`    | `/users/:id`            | `@Roles('ADMIN')` | Soft delete user account             |
