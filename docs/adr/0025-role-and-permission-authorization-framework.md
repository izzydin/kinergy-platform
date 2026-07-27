# 25. Extensible Role and Permission Authorization Framework

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Following authentication validation, HTTP API endpoints require granular role-based (`@Roles`) and permission-based (`@Permissions`) authorization checks. The authorization framework must adhere strictly to Clean Architecture, keeping business rules out of the guard layer, while supporting future dynamic permissions, tenant-specific permissions, custom roles, or external policy engines (OPA, Casbin, Permit.io) without architectural refactoring.

## Decision Drivers

- **Clean Architecture & Interface Segregation**: Route guards consume `IAuthorizationService` (`AUTHORIZATION_SERVICE`) and `IPermissionResolver` (`PERMISSION_RESOLVER`) abstractions.
- **Combined Evaluation Rule**: A request is authorized if and only if **required roles are satisfied AND required permissions are satisfied**.
- **Immutable Seeded Permissions Baseline**: Roles and permissions are code-defined and seeded; no dynamic runtime permission editing endpoints or Role CRUD operations are exposed.
- **Wildcard Permission Pattern Support**: Permission evaluation supports wildcard patterns (`*` for global admin, `resource:*` for resource-scoped access).

## Decision Outcome

Chosen Option: **`AuthorizationGuard` delegating metadata evaluation to `IAuthorizationService` & `IPermissionResolver` application ports**.

### Authorization Flow

```
Incoming Request (User Identity Context)
                   │
                   ▼
          AuthorizationGuard
                   │
    Read Metadata (@Roles, @Permissions)
                   │
       Roles or Perms Required? ── (No) ──► Allow Access
                   │ (Yes)
       IPermissionResolver.resolvePermissions()
                   │
       IAuthorizationService.isAuthorized()
                   │
         Satisfies Roles & Perms?
         ├── Yes ──► Allow Access
         └── No  ──► 403 Forbidden Exception
```

## Consequences

### Positive

- Complete separation of authentication (identity validation) and authorization (role/permission checks).
- Fully decoupled, testable authorization services.
- Extensible architecture ready for multi-tenant permission isolation or external PDP integration.
