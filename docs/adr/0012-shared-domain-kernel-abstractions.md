# 12. Shared Domain Kernel Abstractions

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To enable clean Domain-Driven Design (DDD) across all bounded contexts without framework pollution, we require pure, generic domain kernel abstractions (`Entity`, `AggregateRoot`, `ValueObject`, `Result`, `IRepository`, `IDomainEvent`).

## Decision Drivers

- **Framework Independence**: Pure TypeScript classes and interfaces with zero NestJS, Prisma, or external framework dependencies.
- **Generic Reuse**: Universal applicability across all domain entities and value objects via TypeScript generics (`T`, `TProps`).
- **Explicit Error Handling**: Functional `Result<T, E>` monad replacing thrown exceptions for expected domain rule validations.
- **Domain Event Encapsulation**: Internal domain event registration and clearing within `AggregateRoot<T>`.

## Decision Outcome

Chosen Option: **Pure Domain Kernel primitives in `apps/api/src/shared/kernel/`**.

### Abstraction Specifications

1. **`Entity<T>`**: Identifiable domain concept with identity equality comparison (`equals`).
2. **`AggregateRoot<T>`**: Transactional boundary aggregate root extending `Entity<T>`, providing `addDomainEvent`, `clearEvents`, and `domainEvents`.
3. **`ValueObject<TProps>`**: Immutable domain value object with frozen properties (`Object.freeze`) and structural equality comparison (`equals`).
4. **`Result<T, E>`**: Functional result monad encapsulating explicit `isSuccess`, `isFailure`, `getValue()`, `getError()`, and static `Result.ok()`, `Result.fail()`, and `Result.combine()`.
5. **`IDomainEvent`**: Contract for domain events (`dateTimeOccurred`, `getAggregateId()`).
6. **`IRepository<T>`**: Framework-agnostic persistence contract (`findById`, `findAll`, `save`, `delete`).

## Consequences

### Positive

- 100% testable domain logic using standard unit tests (`*.spec.ts`).
- Clean separation between core domain behavior and infrastructure implementations.
- Robust functional result handling avoiding unchecked runtime exceptions.
