# ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers

- **Status**: Accepted
- **Date**: 2026-08-15
- **Context**: Kinergy is expanding to Phase 4 (Kinesiology & Clinical Treatment Management). The platform must support clinical therapy records, neuromuscular assessments, muscle testing findings, and structured session notes without corrupting established bounded context boundaries (Identity, Client Management, Scheduling). A clear architecture is required to decouple clinical documentation from logistical calendar scheduling, prevent cross-context aggregate nesting, forbid distributed transactions, and standardize ubiquitous domain terminology.

---

## 1. Context & Problem Statement

In clinical rehabilitation and kinesiology operations:

1. **Clinical vs Administrative Separation**: An administrative appointment reserves a time slot, room, and practitioner shift; a clinical treatment session records medical assessments, neuromuscular evaluations, SOAP progress notes, and therapeutic outcomes.
2. **Context Bleed Risks**: Conflating scheduling logistics with clinical therapy documentation leads to bloated god-aggregates, circular dependencies, and high regression risk.
3. **Data Duplication Risks**: Creating a specialized `Patient` aggregate inside Kinesiology duplicates master client records already governed by the Client Management bounded context.
4. **Coupling & Transaction Hazards**: Embedding foreign aggregates (`Client`, `Appointment`, `User`) inside clinical entities invites cross-context database transactions, distributed locks, and cascading persistence failures.

---

## 2. Architectural Decision

Kinergy establishes a dedicated **Kinesiology Bounded Context** that owns the clinical treatment domain, utilizes `TreatmentSession` as its core aggregate root, and integrates with external bounded contexts strictly through **scalar/value-object identifiers**.

```mermaid
graph TD
    subgraph "Identity Context (IAM)"
        User[User Entity / Role]
    end

    subgraph "Client Context"
        Client[Client Aggregate Root]
        Timeline[ClientTimelineEntry Stream]
    end

    subgraph "Scheduling Context"
        Appt[Appointment Aggregate Root]
        Room[Room Aggregate Root]
        Sched[TherapistSchedule Aggregate Root]
    end

    subgraph "Kinesiology Context"
        TS[TreatmentSession Aggregate Root]
        Notes[SessionNotes Value Object]
        Status[SessionStatus: SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW]
        TS --> Notes
        TS --> Status
    end

    TS -->|references clientId: string| Client
    TS -->|references therapistId: string| User
    TS -->|optional correlation appointmentId: string| Appt
    TS -.->|asynchronous completion event| Timeline
```

### Key Architectural Decisions

1. **`TreatmentSession` Aggregate Root Ownership**:
   - `TreatmentSession` is the sole aggregate root governing clinical encounter records, state transitions, SOAP progress notes, and therapeutic findings.
   - Clinical state lifecycle is modeled by `SessionStatus` (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
2. **Cross-Context References by Opaque Identifiers**:
   - Foreign concepts are referenced strictly via immutable scalar string identifiers (UUIDs):
     - `clientId: string` $\rightarrow$ References Client Management `Client`.
     - `therapistId: string` $\rightarrow$ References Identity `User`.
     - `appointmentId?: string` $\rightarrow$ Optional correlation reference to Scheduling `Appointment`.
   - **Zero Aggregate Nesting**: `TreatmentSession` must never import or embed `Client`, `Appointment`, or `User` domain entities.
3. **Autonomous Consistency & Zero Distributed Transactions**:
   - Each bounded context owns its own persistence and consistency boundaries.
   - `TreatmentSession` persistence operations execute strictly within Kinesiology tables and manage their own `version: number` optimistic concurrency control.
   - Zero distributed two-phase commits ($2\text{PC}$) or cross-context database transactions are permitted.
4. **Canonical Ubiquitous Language**:
   - **`Client`** is the single authoritative domain term. No `Patient`, `PatientProfile`, or `PatientAggregate` shall be created.
   - **`TreatmentSession`** is the canonical session term. Terms like `TreatmentRecord`, `TherapySession`, or `ClinicalSession` are rejected synonyms.
   - **`Therapist`** is a practitioner role of a `User`, referenced via `therapistId: string`. No separate `TherapistAggregate` is created.
5. **Asynchronous Cross-Context Projection**:
   - When a session completes, Kinesiology records `TreatmentSessionCompletedEvent`. An application-layer event handler may project summary entries into `ClientTimelineEntry` asynchronously without domain-level coupling.

---

## 3. Alternatives Considered

### Alternative A: Embedding TreatmentSession inside Appointment Aggregate

- _Description_: Store clinical notes and assessment findings directly as child entities inside the `Appointment` aggregate.
- _Rejection Reason_: Conflates operational booking logistics with clinical medical records. Violates Single Responsibility Principle and creates heavy contention on calendar queries whenever clinical notes are edited.

### Alternative B: Creating a Duplicate `Patient` Aggregate in Kinesiology

- _Description_: Maintain a specialized `Patient` entity with demographic and contact copies inside Kinesiology.
- _Rejection Reason_: Introduces dual-master data synchronization anomalies, violates DDD Ubiquitous Language, and fragments client audit histories.

### Alternative C: Distributed 2PC Transactions Across Context Boundaries

- _Description_: Synchronously coordinate database transactions between Scheduling and Kinesiology when starting or completing sessions.
- _Rejection Reason_: Causes tight runtime coupling, connection pool exhaustion, distributed deadlocks, and cascading operational failures.

---

## 4. Consequences

### Positive Consequences

- **Context Isolation**: Kinesiology domain rules can evolve independently without risking regression in Scheduling or Client Management.
- **Maintainability & Purity**: Pure domain models without ORM or foreign context dependencies.
- **Concurrency Protection**: Isolated optimistic locking on `TreatmentSession` prevents clinical note overwrite without blocking calendar operations.
- **Deterministic Nomenclature**: Clear ubiquitous language eliminates developer ambiguity.

### Negative Consequences / Trade-offs

- **Application-Level Verification**: Cross-context correlation (e.g. verifying an `appointmentId` exists upon session creation) must be coordinated at the application use-case layer rather than via database foreign key cascading.

---

## 5. References

- [Kinesiology Bounded Context Specification](../architecture/contexts/kinesiology.md)
- [ADR-0002: Client Domain Foundation & Identity Decoupling](./0002-client-domain-foundation.md)
- [ADR-0010: Backend Clean Architecture & Layering](./0010-backend-clean-architecture-layering.md)
- [ADR-scheduling-bounded-context](./ADR-scheduling-bounded-context.md)
