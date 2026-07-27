# 21. Transactional Consistency & Unit of Work Pattern

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

During authentication token rotation (`RefreshTokenUseCase`), multiple persistence operations occur sequentially: revoking the consumed token, persisting revocation state, generating a replacement token, and saving the new token entity. If a network drop, database error, or system failure occurs between these operations, the persistence state becomes partially updated and inconsistent.

## Decision Drivers

- **Transactional Consistency**: All token lifecycle state mutations (token consumption, family revocation, child token persistence) must execute within an atomic database transaction.
- **Clean Architecture & Dependency Inversion**: Business logic in application use cases must depend on an abstract `IUnitOfWork` interface (`UNIT_OF_WORK`), with zero leak of Prisma or ORM transaction objects into the application layer.
- **No Partial Writes**: Failure at any step of token validation or rotation must automatically trigger database rollback.

## Decision Outcome

Chosen Option: **`IUnitOfWork` Application Port (`UNIT_OF_WORK`) & `PrismaUnitOfWork` Infrastructure Implementation**.

### Transaction Execution Flow

```
BEGIN TRANSACTION (unitOfWork.executeInTransaction)
    │
    ├── Validate Refresh Token & Signature
    ├── Retrieve Existing Token Entity by Hash
    ├── Replay Check: If revoked/absent -> Revoke Token Family & Throw
    ├── Expiration Check: If expired -> Revoke Token & Throw
    ├── Account Check: If inactive/disabled -> Revoke Family & Throw
    ├── Revoke Consumed Token (tokenEntity.revoke())
    ├── Persist Revoked Consumed Token
    ├── Generate Child Refresh Token & Hash
    └── Persist Child Refresh Token Entity
COMMIT TRANSACTION (On Success)
ROLLBACK TRANSACTION (On Error / Exception)
```

## Consequences

### Positive

- Zero risk of partial state writes during token rotation or replay attack mitigations.
- Clean Architecture boundaries strictly preserved via `IUnitOfWork` port.
- Easy unit testing using pass-through or mock Unit of Work instances without database setup.
