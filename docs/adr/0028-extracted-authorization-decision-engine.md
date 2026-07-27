# 28. Extracted Authorization Decision Engine (AuthorizationEvaluator)

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Previously, `AuthorizationGuard` evaluated role and permission requirements directly within NestJS guard execution. This tightly coupled authorization decision logic to the HTTP transport layer and hampered future adoption of Attribute-Based Access Control (ABAC), tenant isolation policies, or external Policy Decision Points (PDPs like OpenFGA, OPA, Cedar).

## Decision Drivers

- **Clean Architecture & Separation of Concerns**: Extract all authorization decision logic out of transport guards into an application-layer policy engine (`IAuthorizationEvaluator`).
- **Structured Outcome Model**: Replace primitive boolean results with `AuthorizationDecision` objects detailing authorization status (`isAuthorized`), denial rationale (`reason`), and failed policy requirement (`failedRequirement`).
- **Extensible Requirements Model**: Enclose requested policy rules inside `AuthorizationRequirements` (`requiredRoles`, `requiredPermissions`, `tenantId`, `resourceId`, `attributes`).
- **Isolated Permission Resolution**: `PermissionResolver` isolates permission expansion (e.g. from database, cache, or tenant policies) from authorization evaluation logic.

## Decision Outcome

Chosen Option: **`AuthorizationGuard` acts as a thin orchestration layer delegating all evaluation to `IAuthorizationEvaluator` (`AUTHORIZATION_EVALUATOR`)**.

### Authorization Execution Flow

```
Incoming Request
       │
       ▼
AuthenticationGuard ──► Populates AuthenticatedUserContext
       │
       ▼
AuthorizationGuard
  1. Read Metadata (@Roles, @Permissions)
  2. Extract AuthenticatedUserContext
  3. Construct AuthorizationRequirements
       │
       ▼
IAuthorizationEvaluator.evaluate()
       │
       ├── Delegate to IPermissionResolver.resolvePermissions()
       ├── Evaluate Roles & Permissions Policy
       │
       ▼
AuthorizationDecision (isAuthorized, reason, failedRequirement)
       │
       ├── Allowed  ──► Next Handler
       └── Denied   ──► 403 Forbidden Exception
```

## Consequences

### Positive

- Zero NestJS or HTTP coupling inside policy evaluation logic.
- Complete support for future ABAC, Cedar/OpenFGA PDPs, tenant isolation, and ownership policy checks without altering controllers or guards.
- Rich audit telemetry and diagnostic reasons attached to denial decisions.
