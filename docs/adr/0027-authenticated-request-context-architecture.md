# 27. Authenticated Request Context Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Application services, controllers, and future modules across `apps/api` require access to authenticated user identity and security claims. Direct parsing or decoding of JWT claims inside application logic creates tight coupling to token formats and breaks Clean Architecture. The platform requires a unified, strongly-typed `AuthenticatedUserContext` abstraction populated during request authentication.

## Decision Drivers

- **Zero Direct JWT Decoding in Application Services**: Use cases consume `IRequestContextAccessor` (`REQUEST_CONTEXT_ACCESSOR`) or `RequestContext.currentContext()`. Raw JWT claims are decoded strictly within infrastructure token services.
- **Unified Security Model**: `AuthenticatedUserContext` encapsulates identity (`userId`, `email`), account status, roles, permissions, tenant boundaries (`tenantId`, `organizationId`), device telemetry, locale, and impersonation flags.
- **Rich Helper Methods**: Exposes `hasRole()`, `hasAnyRole()`, `hasPermission()`, and `hasAllPermissions()` supporting wildcard permission evaluation (`*`, `resource:*`).
- **AsyncLocalStorage Context Propagation**: Context is propagated across asynchronous call graphs via Node.js `AsyncLocalStorage` without requiring parameter passing.

## Decision Outcome

Chosen Option: **`AuthenticatedUserContext` domain model and `IRequestContextAccessor` port interface with Node.js `AsyncLocalStorage` propagation**.

### Request Context Flow

```
Incoming Request (Bearer JWT)
              │
              ▼
    AuthenticationGuard
              │
  Validate Token & Fetch User
              │
  Construct AuthenticatedUserContext
              │
    RequestContext.run(context) ───► Populates AsyncLocalStorage Store
              │
              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Controllers & Application Services                          │
  │ Consume RequestContext / IRequestContextAccessor            │
  │ Zero JWT decoding or parameter pollution                    │
  └─────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- Complete elimination of raw JWT decoding across application and domain services.
- High developer ergonomics with built-in role and permission checking helpers.
- Seamless multi-tenant, device, and localization context propagation.
