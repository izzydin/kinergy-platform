# 10. Backend Clean Architecture & Layering Structure in `apps/api`

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To maintain strict Domain-Driven Design (DDD) separation of concerns, high testability, and framework independence for core domain logic, we require a standardized backend architectural layout within `apps/api/src/`.

## Decision Drivers

- Enforcing strict Clean Architecture boundaries (Domain Kernel, Shared Common, Platform Services, Contexts).
- Preventing framework infrastructure details from polluting core business logic.
- Establishing barrel export (`index.ts`) conventions for clean, modular imports.
- Ensuring zero empty directories with explicit placeholder interface contracts.

## Decision Outcome

Chosen Option: **Backend Layering Architecture in `apps/api/src/` (`config`, `shared`, `platform`, `contexts`)**.

### Architectural Layout & Specifications

1. **`config/`**: Server runtime and infrastructure configuration interfaces.
2. **`shared/`**:
   - **`kernel/`**: Pure DDD domain primitives (`Entity`, `ValueObject`, `AggregateRoot`, `IDomainEvent`). Completely framework-agnostic.
   - **`common/`**: Application layer ports (`IUseCase<IRequest, IResponse>`) and defensive assertion utilities (`Guard`).
3. **`platform/`**: Cross-cutting enterprise platform contracts:
   - **`persistence/`**: Generic repository (`IRepository<T>`) and unit of work (`IUnitOfWork`) interfaces.
   - **`identity/`**: User identity and security context interfaces (`IUserIdentity`, `IIdentityContext`).
   - **`logging/`**: Logging port (`ILoggerPort`) and NestJS injectable wrapper (`PlatformLoggerService`).
   - **`audit/`**: Audit event logging contracts (`IAuditLogEvent`, `IAuditService`).
4. **`contexts/`**: Registry contracts for bounded context isolation (`IBoundedContext`).

## Consequences

### Positive

- Strict separation of concerns adhering to SOLID and Clean Architecture principles.
- High testability without requiring database connections or HTTP servers for domain tests.
- Reusable domain kernel primitives for future backend microservices or monorepo domain libraries.
