# ADR-0005: Identity Bounded Context Architecture, Integration, and SaaS Tenant Isolation

- **Status:** Accepted
- **Date:** 2026-07-25
- **Authors:** Principal Security Architect & Staff Software Engineer
- **Domain:** Identity & Access Management (IAM)

---

## Context

Under Domain-Driven Design (DDD) and Clean Architecture, the Kinergy Platform is organized into distinct **Bounded Contexts**. The **Identity Bounded Context** governs security authentication, credential management, token issuance, and authorization policies. The detailed tactical domain specification for this context is recorded in [identity-domain-model.md](file:///c:/Projects/kinergy-platform/docs/architecture/identity-domain-model.md).

As the platform evolves into a multi-tenant enterprise SaaS platform, the Identity context must define crisp domain boundaries, clean integration mechanisms with downstream contexts (User Profile, Organization/Tenant Management, Energy Asset Monitoring, Billing), multi-tenant SaaS isolation policies, and immutable security audit capabilities.

---

## Problem

Coupling identity and authentication directly with domain entities (e.g. embedding password hashes in a monolithic `User` table alongside telemetry preferences and organization profiles) creates severe security hazards:

1. Credential leakages when sending user entities to presentation layers or third-party APIs.
2. Inability to scale or replace authentication providers without refactoring business domain models.
3. Cross-tenant data leakage risks in multi-tenant SaaS environments.
4. Difficulty auditing security-critical events (login failures, privilege changes) across disparate modules.

---

## Decision

We decide to formalize the **Identity Bounded Context** as an isolated domain package with **Strict Security Boundaries**, **Asynchronous Domain Event Integration**, **Tenant Context Injection**, and an **Immutable Audit Logging Pipeline**.

```mermaid
graph TB
    subgraph Identity Bounded Context
        AccountAggregate[Account Aggregate Root]
        CredentialVO[Credential Value Object]
        RoleEntity[Role & Permission Entities]
        SessionAggregate[UserSession Aggregate Root]

        IdentityService[Identity Application Service]
    end

    subgraph Internal Domain Event Bus
        AuthEvent[UserAuthenticatedEvent]
        ResetEvent[PasswordResetRequestedEvent]
        RoleEvent[RoleAssignedEvent]
    end

    subgraph External Bounded Contexts
        UserProfileBC[User Profile Bounded Context]
        TenantBC[Tenant & Org Bounded Context]
        AssetBC[Asset Monitoring Bounded Context]
        AuditBC[Security Audit Bounded Context]
    end

    IdentityService -->|Publishes| Internal Domain Event Bus
    Internal Domain Event Bus -->|Subscribes| UserProfileBC
    Internal Domain Event Bus -->|Subscribes| TenantBC
    Internal Domain Event Bus -->|Subscribes| AuditBC
```

### 1. Bounded Context Responsibilities & Boundaries

The Identity context is strictly bounded to security and authentication concerns:

- **Inside Identity Context Responsibilities:**
  - Authentication credentials (email, hashed password, salt, MFA secrets).
  - Token minting, verification, and rotation logic.
  - Role definitions and permission string mappings.
  - Session lifecycle management.
- **Outside Identity Context Responsibilities:**
  - User demographics, profile pictures, job titles (`UserProfile` Context).
  - Organization memberships, subscription tiers, billing details (`Tenant` Context).
  - Telemetry alerts, device control rights (`Asset Monitoring` Context).

### 2. Security Boundaries & Data Isolation

- **Zero Hash Leakage:** Password hashes, salts, reset tokens, and MFA secrets are stored inside dedicated Prisma Identity models (`identity_accounts`, `identity_credentials`) and are NEVER exposed outside the Identity application layer.
- **DTO Mappings:** All responses from Identity application use cases return read-only Data Transfer Objects (`IdentityContextDTO`, `UserSessionDTO`) stripping internal secret state.

### 3. Integration via Asynchronous Domain Events

Communication between Identity and downstream bounded contexts occurs exclusively via immutable **Domain Events** dispatched over an internal event bus:

- `UserAuthenticatedEvent` (`accountId`, `tenantId`, `ipAddress`, `timestamp`)
- `UserSignedOutEvent` (`accountId`, `sessionId`, `timestamp`)
- `PasswordResetRequestedEvent` (`accountId`, `resetTokenHash`, `email`)
- `RoleAssignedEvent` (`accountId`, `roleId`, `assignedBy`)
- `AccountLockedEvent` (`accountId`, `reason`, `failedAttempts`)

### 4. Future Multi-Tenant SaaS Isolation Strategy

- **Tenant Identifier Claim:** Every Access Token embeds a mandatory `tenant_id` claim.
- **Request Context Injection:** A NestJS `TenantContextMiddleware` extracts `tenant_id` from the validated token and binds it to AsyncLocalStorage for the duration of the request lifecycle.
- **Prisma & Domain Repository Isolation:** Prisma middleware automatically injects a `WHERE tenant_id = currentTenantId` filter on all multi-tenant queries, enforcing database-level row isolation and preventing cross-tenant data leaks.

### 5. Security Audit Log Integration

All Identity domain events are captured by a dedicated `SecurityAuditSubscriber`:

- **Structure:** Append-only, tamper-evident audit log records.
- **Fields:** `event_id`, `timestamp`, `actor_id`, `tenant_id`, `event_type`, `ip_address`, `user_agent`, `status`, `metadata`.
- **Retention:** Written to a dedicated PostgreSQL audit partition or streamed to external SIEM systems (e.g. Datadog, AWS CloudWatch, Splunk).

---

## Alternatives Considered

1. **Monolithic User Aggregate:**
   - _Pros:_ Easy initial setup with a single database table.
   - _Cons:_ Blurs domain boundaries, risks exposing credential hashes in user profile endpoints, and prevents scaling identity independently.
2. **Direct Synchronous Calls Between Services:**
   - _Pros:_ Immediate feedback loop across modules.
   - _Cons:_ Tight temporal coupling between Identity and other modules; failure in user profile service breaks authentication flows.

---

## Consequences

### Positive

- **Strict Security Isolation:** Sensitive credentials are physically and logically segregated from standard business entities.
- **Multi-Tenant Readiness:** `tenant_id` propagation and database middleware guarantee multi-tenant tenant isolation.
- **Event-Driven Resilience:** Downstream contexts consume Identity events asynchronously without coupling or blocking login flows.

### Negative

- **DTO Transformation Overhead:** Demands explicit mapping between Identity domain entities and application DTOs.
- **Read Model Aggregation:** Displaying a user's full name (UserProfile BC) alongside their active roles (Identity BC) requires API orchestration or CQRS read model projection.

---

## Future Evolution

1. **Microservice Extraction:** The clean bounded context allows extracting Identity into an independent standalone Auth service (or microservice) when scaling.
2. **External Identity Provider Migration:** Option to delegate Identity BC tasks to managed Identity-as-a-Service (IDaaS) platforms (e.g., Auth0, Keycloak) without altering downstream business contexts.
