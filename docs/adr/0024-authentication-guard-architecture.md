# 24. Reusable Authentication Guard Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

HTTP endpoints in `apps/api` require a reusable NestJS `AuthenticationGuard` (`canActivate`) to validate request identity context. The guard must validate JWT access tokens, signature, expiration, required claims, user existence, and account status (`ACTIVE` vs. `SUSPENDED`/`DISABLED`/`PENDING`) without introducing database or ORM coupling, business rule leakage, or authorization logic.

## Decision Drivers

- **Clean Architecture & Hexagonal Boundaries**: The guard delegates token validation to `IAccessTokenService` (`ACCESS_TOKEN_SERVICE`) and user status lookup to `IUserRepository` (`USER_REPOSITORY`). Zero direct Prisma calls exist inside the guard.
- **Strict Single Responsibility**: `AuthenticationGuard` validates **identity only**. Authorization checks (roles, permissions, RBAC) are explicitly deferred to separate authorization guards.
- **Standardized Unauthorized Responses**: Returns NestJS `UnauthorizedException` (401) with clean, non-leaky messages across all validation failures.
- **Public Route Exemption**: Supports `@Public()` decorator to bypass authentication on public endpoints (e.g. login, refresh, health checks).

## Decision Outcome

Chosen Option: **`AuthenticationGuard` delegating to `IAccessTokenService` and `IUserRepository` abstractions with `@Public()` metadata support**.

### Authentication Flow

```
Incoming HTTP Request
         │
         ▼
  AuthenticationGuard
         │
  Is @Public()? ──── (Yes) ───► Allow Access
         │ (No)
  Extract Bearer Token
         │
  Validate Token (IAccessTokenService) ─── (Invalid/Expired) ───► 401 Unauthorized
         │ (Valid)
  Find User by ID (IUserRepository) ────── (Not Found) ────────► 401 Unauthorized
         │ (Found)
  Is User ACTIVE? ─────────────────────── (Inactive/Suspended) ─► 401 Unauthorized
         │ (Active)
  Token Version Match? ────────────────── (Revoked Session) ────► 401 Unauthorized
         │ (Match)
  Attach request.user Identity
         │
         ▼
    Allow Request
```

## Consequences

### Positive

- Strictly decoupled identity validation reusable across all application HTTP controllers.
- Single responsibility principle enforced: authorization and business logic stay outside the guard.
- Full test coverage across public route bypass, missing token, expired token, user lookup, and inactive status checks.
