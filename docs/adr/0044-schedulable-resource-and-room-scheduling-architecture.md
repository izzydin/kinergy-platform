# ADR-0044: Schedulable Resource & Room Scheduling Architecture

- **Status**: Accepted
- **Date**: 2026-08-15
- **Context**: Clinical therapy platforms require physical spaces (treatment rooms, hydrotherapy suites, assessment offices) and will eventually require specialized physical assets (therapy beds, diagnostic equipment, rental bays). The scheduling subsystem must prevent double-booking, enforce room capacity, respect operational state (maintenance/cleaning), and evaluate turnaround buffers without creating duplicate scheduling engines or turning the core `Appointment` aggregate into a room-centric model.

---

## 1. Context & Problem Statement

Kinergy facilitates clinical physical therapy, rehabilitation, and wellness consultations. In clinical operations:

1. **Physical Resource Contention**: Multiple practitioners cannot treat different clients in the same physical room simultaneously.
2. **Operational Downtime**: Treatment rooms undergo regular maintenance (sanitation, equipment filter changes, renovations) and emergency closures.
3. **Turnaround Buffers**: Specific clinical modalities (e.g., intensive physical therapy, evaluations) require operational preparation and cleanup time around bookings.
4. **Extensibility for Future Assets**: While `Room` is the immediate requirement, future milestones will introduce equipment (e.g., ultrasound units), therapy beds, and rental bays without requiring destructive architectural or database rewrites.
5. **Separation of Concerns**: The core `Appointment` aggregate must represent a clinical booking agreement between a Client and Therapist, without bearing deep room aggregate state or creating circular dependencies.

---

## 2. Architectural Decision

Kinergy adopts a **Capability-Oriented Resource Scheduling Architecture** where `SchedulableResource` defines the core identity abstraction, `Room` serves as the first concrete aggregate root, and the existing 4-Dimensional `ConflictDetectionService` evaluates room availability alongside therapists and clinic operating hours.

```mermaid
graph TD
    subgraph "Domain Abstraction"
        SR[SchedulableResource Contract]
        RID[ResourceId VO]
        RT[ResourceType VO: ROOM]
    end

    subgraph "Concrete Resource"
        Room[Room Aggregate Root]
        MW[MaintenanceWindow VO]
        RS[RoomStatus: AVAILABLE | MAINTENANCE | UNAVAILABLE]
        Room --> MW
        Room --> RS
    end

    subgraph "Scheduling Integration"
        Appt[Appointment Aggregate Root]
        CDS[ConflictDetectionService]
        RAE[RoomAvailabilityEvaluator]
        TBP[TurnaroundBufferPolicy]
    end

    SR -.-> Room
    Room --> RID
    Room --> RT
    Appt -->|references roomId| RID
    CDS --> RAE
    CDS --> TBP
    RAE --> Room
```

### Key Architectural Pillars

1. **`SchedulableResource` Identity Contract**:
   - Encapsulates `resourceId` (`ResourceId` value object) and `resourceType` (`ResourceType` enum: `'ROOM'`).
   - Ensures scheduling policies, conflict evaluators, and calendar projections reason over resource capabilities uniformly.

2. **`Room` Aggregate Root**:
   - Manages physical room invariants: `name`, `capacity` (positive integer), `features` (string tags, e.g., `'massage_table'`, `'hydrotherapy_tub'`), `status` (`AVAILABLE`, `MAINTENANCE`, `UNAVAILABLE`), and a collection of `MaintenanceWindow` value objects.
   - Enforces optimistic concurrency control via integer `version`.

3. **`MaintenanceWindow` Value Object**:
   - Models temporal blocking intervals as immutable value objects encapsulated within the `Room` aggregate root.
   - Reuses `TimeRange` $[start, end)$ half-open interval arithmetic and UTC normalization, avoiding a detached scheduling engine for maintenance.

4. **Decoupled Appointment Integration**:
   - `Appointment` maintains an optional `roomId: string` property.
   - Validation occurs via application coordination and domain evaluation (`ConflictDetectionService`) rather than direct aggregate coupling.

5. **4-Dimensional Conflict Matrix**:
   - `ConflictDetectionService` evaluates conflicts across:
     1. **Clinic Vector**: Facility closures and public holidays (`BusinessCalendarService`).
     2. **Therapist Vector**: Shift working hours, breaks, vacations, and existing appointments (`TherapistSchedule`, `TherapistAvailabilityEvaluator`).
     3. **Room Vector**: Room status, maintenance windows, equipment features, capacity, and existing room bookings (`Room`, `RoomAvailabilityEvaluator`).
     4. **Client Vector**: Client overlapping bookings (`ClientAvailabilityEvaluator`).

---

## 3. Aggregate Boundaries & Invariants

| Aggregate               | Boundary Responsibilities                                                                                  | Invariants Enforced                                                                                                                                                                                                                     |
| :---------------------- | :--------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Room`**              | Physical space identity, operational status, capacity boundaries, feature tags, and maintenance schedules. | • Name cannot be empty or whitespace.<br>• Capacity must be an integer $\ge 1$.<br>• Cannot schedule maintenance overlapping existing maintenance windows.<br>• Deactivation transitions status to `UNAVAILABLE` with mandatory reason. |
| **`Appointment`**       | Clinical booking lifecycle (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`).             | • Start time $<$ End time.<br>• Room assignment can be set upon creation, updated via `assignRoom()`, or released upon cancellation.<br>• State transitions enforced via state machine.                                                 |
| **`MaintenanceWindow`** | Encapsulated value object representing a planned or emergency maintenance window.                          | • Immutable `[start, end)` range.<br>• Non-empty reason.<br>• Overlap detection respecting turnaround buffers.                                                                                                                          |

---

## 4. Concurrency & Transaction Strategy

1. **Application-Level Optimistic Locking (OCC)**:
   - `Room` aggregate includes an integer `version` field incremented on every state mutation (`edit`, `activate`, `deactivate`, `scheduleMaintenance`, `cancelMaintenance`).
   - Command handlers require `expectedVersion`. Mismatches raise `OptimisticLockException` (HTTP 409 Conflict).
2. **Database-Level Atomic Transactions**:
   - Prisma repositories execute within interactive transactions (`$transaction`), persisting aggregate state and associated maintenance windows atomically.
3. **Double-Booking Prevention**:
   - `ConflictDetectionService` queries active appointments with `startTime < requestedEnd` AND `endTime > requestedStart` AND `status NOT IN (CANCELLED, COMPLETED, NO_SHOW)`.
   - Concurrent reservation attempts evaluate deterministically; the first transaction commits the room reservation, while the competing transaction detects the newly persisted booking and throws `AppointmentConflictException`.

---

## 5. Alternatives Rejected

| Alternative                                   | Evaluation & Rationale for Rejection                                                                                                                                                                      |
| :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Room-Specific Scheduling Engine**           | _Rejected_. Creating a separate `RoomScheduleService` duplicate of `Appointment` scheduling logic would introduce divergent temporal arithmetic, DST inconsistencies, and fragmented conflict resolution. |
| **Generic CRUD Resource Abstraction**         | _Rejected_. Building a completely generic `Resource` table with polymorphic EAV (Entity-Attribute-Value) schema prematurely adds query complexity without immediate domain necessity.                     |
| **Embedding Room Logic inside `Appointment`** | _Rejected_. Violates Single Responsibility and Aggregate Independence. Rooms exist independently of appointments and have independent lifecycles (maintenance, refurbishment, deactivation).              |
| **Separate `Reservation` Aggregate**          | _Rejected_. Adding a third `Reservation` aggregate between `Appointment` and `Room` introduces unnecessary indirection and 2-phase commit overhead for single-room clinical sessions.                     |
| **Fully Polymorphic Relational Tables**       | _Rejected_. Concrete `rooms` and `maintenance_windows` tables provide indexable foreign keys, strict schema constraints, and optimal performance while retaining domain-level extensibility.              |

---

## 6. Consequences

- **Positive**:
  - High cohesion: Room lifecycle and maintenance are strictly encapsulated within the `Room` aggregate.
  - Reusable conflict detection: 4D conflict engine evaluates rooms, therapists, clients, and clinic hours in a single pipeline.
  - Zero double-booking: Half-open interval matching and turnaround buffers prevent scheduling collisions.
  - Clean API contracts: Dedicated REST endpoints under `/api/v1/scheduling/rooms` with Swagger schemas.
- **Trade-offs**:
  - Turnaround buffer policies are currently evaluated at the domain service level rather than dynamically queried per-room from database tenant settings (planned for future milestone).
