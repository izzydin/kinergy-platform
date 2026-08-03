# ADR-001: Scheduling Bounded Context Boundaries & Zero-Infrastructure Domain Core

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: Scheduling logic (appointments, therapist availability, room allocation, conflict resolution) is central to the platform. Mixing persistence logic (ORM, Prisma, SQL) or framework abstractions (NestJS) directly inside domain entities creates tight coupling, hinders unit testing, and risks subtle concurrency bugs.

## Decision

We establish a dedicated **Scheduling Bounded Context** inside `packages/core/src/scheduling/` enforced by Hexagonal (Ports & Adapters) Architecture and strict zero-infrastructure boundaries:

1. **Zero-Infrastructure Domain Core**: The `domain/` directory contains zero ORM models, zero framework annotations, zero SQL statements, and zero network/HTTP dependencies.
2. **Explicit Dependency Inversion**: Domain core defines repository interfaces (`AppointmentRepository`, `RoomRepository`) and time abstractions (`Clock`). Infrastructure adapters implement these contracts outside the domain boundary.
3. **Pure Unit Testing**: All domain aggregates, value objects, specifications, policies, and domain services are testable in memory in milliseconds without database setup or container orchestration.

## Consequences

### Positive

- **Maintainability**: Core business logic is isolated and insulated from database schema changes or framework updates.
- **Testability**: Fast, deterministic unit testing with 100% domain coverage.
- **Portability**: Domain package `@kinergy-platform/core` can be reused across API microservices, background workers, or CLI tools.

### Negative / Trade-offs

- Require mapping layers between database models and domain aggregates.
