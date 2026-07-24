# 2. Nx Monorepo Architecture with Clean Architecture and Domain-Driven Design

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

The Kinergy Platform requires an extensible monorepo architecture that supports multi-application scalability, modular domain boundaries, strict type safety, and testability. Without strict architectural boundaries, codebases risk tight coupling, framework vendor lock-in, and degraded maintainability over time.

## Decision Drivers

- Maintainability and long-term code quality.
- Enforcing strict domain boundaries and framework independence.
- High testability for core business logic.
- Supporting multiple frontend/backend applications sharing core domain logic.

## Decision Outcome

Chosen Option: **Nx Monorepo combined with Clean Architecture and Domain-Driven Design (DDD)**.

### Key Architectural Guidelines

1. **Nx Monorepo Structure**
   - Applications reside under `apps/` (thin entry points, delivery layers).
   - Domain libraries and shared components reside under `libs/`.
   - Clear module boundaries configured to prevent illegal cross-layer imports.

2. **Clean Architecture Layers**
   - **Domain Layer (`libs/<domain>/domain`):** Pure TypeScript business entities, value objects, domain events, and domain interfaces. Must be completely framework-agnostic.
   - **Application Layer (`libs/<domain>/application`):** Use cases, application services, ports, and DTOs.
   - **Infrastructure Layer (`libs/<domain>/infrastructure`):** Framework adapters, ORM models, database repositories, and external APIs. Depends on Domain and Application layers. **Domain NEVER depends on Infrastructure.**
   - **Presentation Layer (Apps / Controllers):** Controllers and UI views solely handle HTTP/UI request orchestration, delegating logic execution to application use cases.

3. **Engineering & Language Standards**
   - **Strict TypeScript:** `strict: true` across all projects. The `any` type is strictly forbidden.
   - **SOLID & Composition:** Design using SOLID principles, favoring object/functional composition over inheritance.
   - **Dependency Injection:** Use interfaces and dependency injection tokens for decoupling application/infrastructure layers.
   - **Barrel Exports:** Clean public APIs via `index.ts` files per library.
   - **Unit Testing:** 100% unit test coverage requirement for all domain logic.

## Consequences

### Positive
- Framework independence enables seamless tech stack upgrades without breaking domain rules.
- High testability without relying on heavy integration test setups or databases for domain verification.
- Enforced module boundaries in Nx eliminate accidental circular dependencies.

### Negative
- Initial overhead in defining DTOs, interfaces, and boundary mappings.
