# Identity Subsystem End-to-End (E2E) Testing Strategy

- **Author:** Principal QA Architect
- **Target Bounded Context:** `platform/identity`
- **Scope:** Complete HTTP Request Pipeline Validation (`HTTP Request` $\rightarrow$ `Middleware` $\rightarrow$ `AuthenticationGuard` $\rightarrow$ `AuthorizationGuard` $\rightarrow$ `Controller` $\rightarrow$ `Use Cases` $\rightarrow$ `Repositories`)

---

## 1. Overview & Objectives

End-to-End (E2E) tests in the Kynergy platform validate the **complete HTTP request lifecycle** exactly as external clients, mobile applications, and web frontends experience it.

Unlike isolated unit tests or component integration tests, E2E tests mount real NestJS `INestApplication` HTTP servers with Supertest to verify:

- **Transport Security**: Token extraction, header parsing, `401 Unauthorized` & `403 Forbidden` response status codes.
- **Pipeline Orchestration**: `AuthenticationGuard` $\rightarrow$ `AuthorizationGuard` $\rightarrow$ `RequestContext` propagation.
- **User Account Lifecycle Enforcement**: Rejecting `PENDING`, `INACTIVE`, `BLOCKED`, and soft-deleted accounts at the HTTP boundary.
- **Role & Permission Access Control**: RBAC `@Roles(...)` and `@Permissions(...)` enforcement.

---

## 2. Tested Endpoints & Edge Case Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       HTTP PIPELINE E2E EXECUTION                           │
│                                                                             │
│   HTTP Request                                                              │
│       │                                                                     │
│       ▼                                                                     │
│   AuthenticationGuard  ──► [ 401 Unauthorized ]  (Missing / Expired / Inactive)│
│       │                                                                     │
│       ▼                                                                     │
│   AuthorizationGuard   ──► [ 403 Forbidden ]     (Role / Permission Missing)│
│       │                                                                     │
│       ▼                                                                     │
│   NestJS Controller                                                         │
│       │                                                                     │
│       ▼                                                                     │
│   Application Use Case ──► [ 200 OK / 201 Created / 409 Conflict ]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

| HTTP Method & Path                     | Guard Configuration          | Tested Scenarios                                  | Expected Status               |
| :------------------------------------- | :--------------------------- | :------------------------------------------------ | :---------------------------- |
| `GET /test-pipeline/public`            | `@Public()`                  | Public endpoint access without Bearer header      | `200 OK`                      |
| `GET /test-pipeline/protected`         | `AuthenticationGuard`        | Valid active user token vs missing Bearer token   | `200 OK` / `401 Unauthorized` |
| `GET /test-pipeline/protected`         | `AuthenticationGuard`        | `PENDING`, `INACTIVE`, or `BLOCKED` account token | `401 Unauthorized`            |
| `GET /test-pipeline/owner-only`        | `@Roles('OWNER')`            | `TRAINER` role user vs `OWNER` role user          | `403 Forbidden` / `200 OK`    |
| `GET /test-pipeline/delete-permission` | `@Permissions('delete:all')` | User lacking wildcard permission                  | `403 Forbidden`               |
| `POST /users`                          | `@Roles('ADMIN')`            | Admin creating a new user record                  | `201 Created`                 |
| `GET /users`                           | `@Roles('ADMIN')`            | Admin listing user accounts                       | `200 OK`                      |

---

## 3. Reusable Testing Patterns for Future Bounded Contexts

1. **Single-Line Auth Harness**: Reuse `auth(user, secret).headers()` from `@kinergy-platform/testing` to inject authenticated headers into Supertest HTTP requests:
   ```typescript
   const authHeaders = auth(createOwner(), secret).headers();
   const response = await request(app.getHttpServer()).get('/protected-endpoint').set(authHeaders);
   ```
2. **Containerless Execution**: Run full NestJS HTTP pipelines in memory via `Test.createTestingModule` and `app.getHttpServer()` without launching external docker containers or network listeners.
3. **Deterministic Reset**: Execute `userRepo.clear()` and `refreshTokenRepo.clear()` inside `beforeEach()` blocks to guarantee fast, zero-contamination test runs.
