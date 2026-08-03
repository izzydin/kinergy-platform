# ADR: Decoupled Aggregate Roots for Scheduling Bounded Context

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Lead Architect, Platform Engineering Team

---

## 1. Context & Problem Statement

In scheduling systems for health and wellness SaaS platforms, appointment management, practitioner working hours, and physical room allocations are tightly interconnected. A naive design often models these as a single monolithic database structure or places foreign key relationships directly between domain aggregate roots (e.g. `Appointment` holding direct references or CASCADE joins to `TherapistSchedule` or `Room` tables in domain entities).

This monolithic approach introduces significant challenges:

1. High database lock contention during concurrent bookings.
2. Inability to scale therapist availability checks independently of appointment transactions.
3. Complex transactional boundaries spanning multiple logical sub-domains.
4. Violation of Domain-Driven Design (DDD) aggregate consistency boundaries.

---

## 2. Decision Drivers

- **Domain Isolation**: Aggregate roots must encapsulate their own invariants and maintain transactional consistency independently.
- **Concurrency & Throughput**: High-frequency appointment scheduling must minimize lock duration and database table locks.
- **Zero-Infrastructure Guarantees**: Pure domain models inside `packages/core/src/scheduling/domain/` must remain free of ORM relational mappings, database foreign keys, and framework dependencies.
- **Flexibility & Eventual Consistency**: Room maintenance updates or therapist schedule changes should not lock active appointment records.

---

## 3. Decision Outcome

**Decision**: We establish `Appointment`, `TherapistSchedule`, and `Room` as **three distinct Aggregate Roots** without direct relational object joins or database foreign key references inside the domain layer.

### Key Architectural Standards:

1. **ID-Based References**:
   - `AppointmentAggregate` holds scalar string identifiers for external entities: `clientId: string`, `therapistId: string`, `roomId: string`.
   - Aggregate roots store IDs only, never direct instance references to other aggregate roots.

2. **Domain Service Coordination**:
   - Multi-aggregate consistency (e.g., verifying that a room and therapist are free before placing an appointment) is performed by pure **Domain Services** or **Application Services** using domain repository contracts.

3. **Event-Driven Eventual Consistency**:
   - Changes in `TherapistSchedule` or `Room` emit asynchronous domain events (e.g., `ScheduleUpdatedEvent`, `RoomMaintenanceScheduledEvent`) to adjust or notify related context read models.

---

## 4. Consequences

### Positive

- **Independent Scaling**: `TherapistSchedule` queries can be cached or scaled independently of write operations on `Appointment`.
- **Clean Micro-Invariants**: Each aggregate root remains small, focused, and testable in unit tests without setting up complex object graphs.
- **Zero ORM Coupling**: Persistence layer mapping (Prisma/SQL) is strictly isolated to `infrastructure/`, preserving domain purity.

### Trade-Offs / Mitigation

- Cross-aggregate invariants (e.g. double-booking prevention) require application or domain service orchestration across aggregate repositories rather than a single database foreign key cascade. This is mitigated by domain service abstractions and double-booking specification checks.

---

## 5. References

- [Scheduling Architecture Documentation](file:///c:/Projects/kinergy-platform/docs/scheduling/architecture.md)
- [Scheduling Aggregate Diagrams](file:///c:/Projects/kinergy-platform/docs/scheduling/aggregate-diagram.md)
- [Scheduling Domain Model Glossary](file:///c:/Projects/kinergy-platform/docs/scheduling/domain-model.md)
