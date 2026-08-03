# Scheduling Bounded Context - Architecture & Layering Rules

## 1. Executive Summary

The **Scheduling Bounded Context** manages appointment bookings, therapist schedules, working hours, time-off allocations, and physical room capacity within the Kinergy Platform. It is architected following **Domain-Driven Design (DDD)** and **Clean Architecture (Hexagonal / Ports & Adapters)** principles.

---

## 2. Layer Definitions & Responsibilities

The codebase in `packages/core/src/scheduling` is divided into four strictly isolated layers:

```
packages/core/src/scheduling/
├── domain/            <-- Zero-infrastructure core domain logic
├── application/       <-- Orchestration, Use Cases, DTOs & Port definitions
├── presentation/      <-- Input adapters (REST, GraphQL, CLI, Event Handlers)
└── infrastructure/    <-- Output adapters (Database ORM, External APIs, Clock implementations)
```

### 2.1 Domain Layer (`domain/`)

- **Purpose**: Encapsulates core business rules, entity invariants, domain events, specifications, policies, and repository interface contracts.
- **Components**:
  - `appointment/`: `Appointment` Aggregate Root and entity logic.
  - `therapist-schedule/`: `TherapistSchedule` Aggregate Root, working hours, and time-off windows.
  - `room/`: `Room` Aggregate Root and physical capacity constraints.
  - `shared/`: Foundational domain abstractions (`Clock`, `AggregateRoot`, `DomainEvent`, `Entity`, `ValueObject`).
  - `events/`: Domain events representing state changes (e.g. `AppointmentBookedEvent`).
  - `repositories/`: Interface specifications for aggregate persistence ports.
  - `services/`: Domain services coordinating multi-aggregate invariants (e.g. double-booking prevention).
  - `specifications/`: Reusable boolean business rules.
  - `policies/`: Business policies governing cancellation, reschedule windows, and capacity.
  - `value-objects/`: Immutable value types (e.g. `TimeSlot`, `Duration`).
  - `exceptions/`: Explicit domain-specific exceptions.

### 2.2 Application Layer (`application/`)

- **Purpose**: Application use cases and command/query handlers.
- **Responsibilities**: Orchestrates domain aggregates and domain services, manages transactions, and transforms domain models to/from DTOs.
- **Dependencies**: Depends ONLY on `domain/`.

### 2.3 Presentation Layer (`presentation/`)

- **Purpose**: Entry points for user interaction and external system invocations.
- **Responsibilities**: Controllers, resolvers, request validation, and mapping web requests to application commands/queries.
- **Dependencies**: Depends on `application/` and `domain/`.

### 2.4 Infrastructure Layer (`infrastructure/`)

- **Purpose**: Technical details and external resource bindings.
- **Responsibilities**: Prisma ORM entity mappers, database repository implementations, event bus dispatchers, and system clock providers.
- **Dependencies**: Implements interfaces defined in `domain/` and `application/`.

---

## 3. Mandatory Boundary Rules & Invariants

### 3.1 Dependency Rule

Dependencies MUST only point inwards toward the `domain/` layer:
$$\text{Presentation} \longrightarrow \text{Application} \longrightarrow \text{Domain} \longleftarrow \text{Infrastructure}$$

### 3.2 Zero-Infrastructure Guarantee

The `domain/` layer has a **Zero-Infrastructure Guarantee**:

- **NO** database dependencies (Prisma, TypeORM, SQL).
- **NO** web framework imports (NestJS, Express, Fastify).
- **NO** HTTP, I/O, or network client libraries.
- **NO** global system side effects (time must be accessed strictly through the `Clock` interface).
- Pure TypeScript testable in memory without I/O.

---

## 4. Time Abstraction Architecture

To avoid hidden global state and enable deterministic testing, all time-based operations in the domain consume the `Clock` abstraction defined in `domain/shared/clock.ts`:

- `Clock.now()`: Returns current UTC timestamp.
- `Clock.today()`: Returns current date normalized to 00:00:00.000 UTC.
- `Clock.timezone()`: Returns configured timezone string.

Production environments inject `SystemClock`, while unit tests inject `TestClock` to manipulate time deterministically.
