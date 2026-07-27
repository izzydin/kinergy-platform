# 30. User Administration & Identity Boundary Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

The Kynergy Platform identity module requires administrative management operations (Create, Update, Activate, Deactivate, Soft Delete, Search). A critical architectural trap in enterprise SaaS applications is polluting the `User` aggregate with personal profile attributes (e.g. `firstName`, `lastName`, `phone`, `avatar`, `employeeId`, `payrollInfo`). To maintain Clean Architecture, Domain-Driven Design (DDD), and Bounded Context integrity, identity accounts must remain completely decoupled from business domain profile contexts.

## Decision Drivers

- **Identity Bounded Context Integrity**: The `User` Aggregate Root inside `platform/identity` owns **only** authentication credentials (`email`, `passwordHash`), account status (`status`, `deletedAt`), and security authorizations (`roles`, `permissions`, `tenantId`, `tokenVersion`). Zero profile attributes exist in this context.
- **Strict Soft-Delete Security Strategy**: Soft-deleted users (`deletedAt != null`) are strictly prevented from authenticating, reactivating, or undergoing credential modifications. Soft-delete immediately revokes active refresh tokens and increments `tokenVersion`.
- **Application Layer Encapsulation**: All administrative operations (`CreateUserUseCase`, `UpdateUserUseCase`, `ActivateUserUseCase`, `DeactivateUserUseCase`, `DeleteUserUseCase`, `SearchUsersUseCase`) reside in `platform/identity/use-cases/admin`. Controllers act as thin HTTP adapters.
- **Cross-Context Foreign Key References**: Future business domain contexts (e.g. Employee Profile, Trainer Management, Client Record) reference users via string `userId` identifiers without circular model dependencies.

## Decision Outcome

Chosen Option: **Pure Identity User Aggregate with Soft-Delete State Transitions and Application Use Case Encapsulation**.

### Bounded Context Boundary Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                 PLATFORM / IDENTITY CONTEXT                 │
│  User Aggregate Root                                        │
│    - id, email, passwordHash, status, roles, deletedAt     │
│  Use Cases                                                  │
│    - CreateUserUseCase, UpdateUserUseCase                   │
│    - ActivateUserUseCase, DeactivateUserUseCase             │
│    - DeleteUserUseCase, SearchUsersUseCase                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ References via userId
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              FUTURE EMPLOYEE / PROFILE CONTEXT              │
│  EmployeeProfile Entity                                     │
│    - id, userId, firstName, lastName, phone, avatar        │
└─────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- Zero domain pollution: Identity aggregate remains 100% focused on security & credentials.
- Total protection against deleted user access or state mutation attempts.
- Reusable domain use cases and repository contracts (`IUserRepository.search`) ready for multi-tenant administrative interfaces.
- 100% unit test coverage validating status transitions and boundary checks.
