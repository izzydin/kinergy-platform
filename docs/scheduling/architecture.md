# Scheduling Bounded Context — Hexagonal Architecture & Boundary Rules

## Executive Summary

The Scheduling Bounded Context follows **Hexagonal (Ports & Adapters) Architecture** and **Domain-Driven Design (DDD)** principles. The architecture isolates pure business logic at the core, protecting domain invariants from external infrastructure concerns, database schemas, framework dependencies, or UI details.

---

## Table of Contents

- [Architectural Overview](#architectural-overview)
- [Layer Definitions & Boundary Rules](#layer-definitions--boundary-rules)
- [Dependency Hierarchy Enforcement](#dependency-hierarchy-enforcement)

---

## Architectural Overview

```
                          +-----------------------------------+
                          |            Presentation           |
                          |  (Controllers / GraphQL / DTOs)   |
                          +-----------------+-----------------+
                                            |
                                            v
                          +-----------------+-----------------+
                          |            Application            |
                          |  (Use Cases / Command Handlers)   |
                          +-----------------+-----------------+
                                            |
                                            v
+-----------------------+ +-----------------+-----------------+ +-----------------------+
|  Infrastructure Port  | |              Domain               | |  Infrastructure Port  |
| (DB Repos / External) | |  (Aggregates / VOs / Services)  | |  (Event Publishers)  |
+-----------------------+ +-----------------------------------+ +-----------------------+
```

---

## Layer Definitions & Boundary Rules

### 1. Domain Layer (`packages/core/src/scheduling/domain/`)

- **Responsibility**: Encapsulates ubiquitous language, core business rules, entity state machines, value object invariants, domain specifications, and business policies.
- **Zero-Infrastructure Guarantee**:
  - NO framework dependencies (NestJS, Express, Next.js).
  - NO ORM/Database dependencies (Prisma, TypeORM, SQL).
  - NO I/O, HTTP, or network libraries.
  - Dependencies are strictly standard TypeScript primitives, ES2022 language features, and internal value objects.

### 2. Application Layer (`packages/core/src/scheduling/application/`)

- **Responsibility**: Orchestrates application use cases, command and query handlers, transaction boundaries, and event dispatching.
- **Boundary Rules**:
  - Implements use-case flows by interacting with domain repository interfaces and domain services.
  - Translates input commands/queries into domain calls and returns DTO responses.

### 3. Infrastructure Layer (`packages/core/src/scheduling/infrastructure/`)

- **Responsibility**: Implements secondary ports (e.g., Prisma repository persistence, RabbitMQ/Redis event dispatchers, external calendar APIs).
- **Boundary Rules**: Implements domain repository contracts defined in `domain/repositories/`. Infrastructure depends on Domain, never vice-versa.

---

## Dependency Hierarchy Enforcement

1. **Inside-Out Dependency Principle**: Inner layers (Domain) have zero knowledge of outer layers (Infrastructure, Presentation).
2. **Inversion of Control**: Domain defines interface contracts (`AppointmentRepository`, `Clock`), outer infrastructure layers provide concrete implementations (`PrismaAppointmentRepository`, `SystemClock`).
3. **Optimistic Concurrency**: Aggregates maintain a `version` counter incremented on state mutations to ensure data integrity without database lock contention.
