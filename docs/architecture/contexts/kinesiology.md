# Kinesiology Bounded Context — Domain Ownership, Vocabulary & Architectural Boundaries

## 1. Executive Summary & Context Purpose

The **Kinesiology Bounded Context** is the authoritative clinical domain within the Kinergy modular monolith platform responsible for managing therapeutic clinical encounters, structured therapy progress documentation, and clinical lifecycle progression.

### Core Business Purpose

At the current foundation stage (Milestone 4.1), Kinesiology's domain responsibilities comprise:

1. **Governing Treatment Sessions**: Modeling the clinical encounter lifecycle through the `TreatmentSession` aggregate root.
2. **Clinical Lifecycle Progression**: Enforcing deterministic state transitions from scheduling through in-progress care to completion or cancellation.
3. **Clinical Documentation**: Encapsulating structured SOAP progress notes (`SessionNotes`) or clinical free text recorded by the therapist.
4. **Treatment History (Read Model)**: Providing a longitudinal record of a client's completed clinical encounters.

---

## 2. Core Architectural Principle

> **Fundamental Context Rule**:
> Each bounded context owns its own domain concepts and invariants. Other contexts may reference those concepts via opaque scalar identifiers, but they do not own, mutate, or duplicate foreign aggregates.

```mermaid
graph TD
    subgraph "Identity Context (IAM)"
        User[User Entity / Role]
        User -.->|owns practitioner identity| TherapistId[therapistId: string]
    end

    subgraph "Client Management Context"
        Client[Client Aggregate Root]
        Client -.->|owns client identity| ClientId[clientId: string]
    end

    subgraph "Scheduling Context"
        Appt[Appointment Aggregate Root]
        Appt -.->|owns calendar booking| AppointmentId[appointmentId: string]
    end

    subgraph "Kinesiology Context"
        TS[TreatmentSession Aggregate Root]
        Notes[SessionNotes Value Object]
        Status[SessionStatus Enum]

        TS --> Notes
        TS --> Status
        TS -->|references| ClientId
        TS -->|references| TherapistId
        TS -->|correlates with| AppointmentId
    end
```

---

## 3. Context Responsibilities & Explicit Non-Responsibilities

### What Kinesiology Owns (In-Scope)

- The **`TreatmentSession`** aggregate root.
- The **`SessionStatus`** state machine and transition rules.
- The **`SessionNotes`** clinical value object (SOAP structure and observations).
- Clinical invariant enforcement, optimistic concurrency versioning, and failure atomicity.
- Future clinical assessments, measurements, and therapeutic protocols (deferred to Milestone 4.2+).

### Explicit Non-Responsibilities (Owned by Other Contexts)

| Bounded Context       | Owned Domain Concepts                                                                                                                      | Kinesiology Boundary & Interaction                                                                                                                                     |
| :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client Management** | `Client` aggregate, master client profiles, contact data, client status, and client timeline stream.                                       | Kinesiology references the client solely via immutable `clientId: string` (UUID). Kinesiology never modifies or duplicates client records.                             |
| **Scheduling**        | `Appointment` aggregate, `Room` aggregate, `TherapistSchedule` aggregate, calendar reservations, slot availability, and booking lifecycle. | Kinesiology correlates sessions to calendar slots via optional `appointmentId: string`. Kinesiology does not manage room conflicts or calendar availability.           |
| **Identity (IAM)**    | `User` entity, credentials, authentication, password policies, and role-based permissions (`RBAC`).                                        | Kinesiology identifies the practitioner via `therapistId: string` matching a `User.id` with therapist role. Kinesiology does not manage credentials or login sessions. |
| **Billing (Future)**  | Invoices, insurance claims (CPT/ICD), payments, and pricing schedules.                                                                     | Kinesiology records therapeutic care; billing is decoupled and owned by the future Billing context.                                                                    |

---

## 4. Ubiquitous Language & Canonical Vocabulary

To prevent terminology drift, the following definitions form the authoritative Ubiquitous Language for Kinesiology:

| Canonical Term         | Conceptual Definition & Scope                                                                                                   | Owner Context         | Prohibited Synonyms / Rejected Aliases                                                     |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :-------------------- | :----------------------------------------------------------------------------------------- |
| **`TreatmentSession`** | The root entity and clinical encounter record. Encapsulates status, SOAP notes, timestamps, and clinical findings.              | **Kinesiology**       | ❌ `Treatment`, `TreatmentRecord`, `PatientTreatment`, `TherapySession`, `ClinicalSession` |
| **`SessionStatus`**    | The clinical lifecycle state machine of a `TreatmentSession` (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`). | **Kinesiology**       | ❌ `TreatmentStatus`, `TreatmentState`, `ClinicalStatus`, `AppointmentTreatmentStatus`     |
| **`SessionNotes`**     | Structured clinical notes (SOAP: subjective, objective, assessment, plan) or free-text observations.                            | **Kinesiology**       | ❌ `ClinicalNotes`, `TreatmentNotes`, `TherapyNotes`, `MedicalNotes`                       |
| **`Client`**           | The individual receiving therapeutic care. Master aggregate owned by Client Management.                                         | **Client Management** | ❌ `Patient`, `PatientAggregate`, `PatientProfile`, `KinesiologyClient`, `Customer`        |
| **`Therapist`**        | The clinical practitioner authoring the session. User entity with therapist role in Identity.                                   | **Identity / IAM**    | ❌ `Provider`, `Practitioner`, `Clinician`, `TherapistUser`                                |
| **`Appointment`**      | The logistical calendar reservation of a room, therapist shift, and time slot.                                                  | **Scheduling**        | ❌ `TreatmentAppointment`, `TherapyAppointment`, `KinesiologyAppointment`                  |
| **`SessionId`**        | Domain Value Object identifying a unique `TreatmentSession`.                                                                    | **Kinesiology**       | ❌ `TreatmentSessionId`, `KinesiologySessionId`                                            |
| **`ClientId`**         | Scalar string UUID identifying a registered `Client`.                                                                           | **Client Management** | ❌ `PatientId`, `SubjectId`, `CustomerRef`                                                 |
| **`TherapistId`**      | Scalar string UUID identifying a practitioner `User`.                                                                           | **Identity (IAM)**    | ❌ `ProviderId`, `PractitionerId`, `TherapistUserId`                                       |
| **`AppointmentId`**    | Scalar string UUID correlating a session to an `Appointment`.                                                                   | **Scheduling**        | ❌ `BookingId`, `AppointmentReferenceId`, `SlotId`                                         |

---

## 5. Aggregate Root Boundary & Field Breakdown

The **`TreatmentSession`** aggregate root is the single unit of consistency and concurrency for all clinical kinesiology care encounters.

```text
TreatmentSession (Aggregate Root)
 ├── id: SessionId                  ◄── Unique Local Aggregate ID (Value Object)
 ├── version: number                ◄── Optimistic Concurrency Control Version (>= 1)
 ├── status: SessionStatus          ◄── Current Lifecycle Status
 ├── clientId: string               ◄── Scalar UUID Reference to Client Management
 ├── therapistId: string            ◄── Scalar UUID Reference to Identity User
 ├── appointmentId: string          ◄── Scalar UUID Reference to Scheduling Appointment
 ├── cancellationReason?: string    ◄── Reason Captured When Cancelled (Trimmed String)
 ├── notes: SessionNotes            ◄── Structured Clinical SOAP Notes (Immutable Value Object)
 ├── createdAt: Date                ◄── Immutable Creation Timestamp (Defensive Cloned Date)
 └── updatedAt: Date                ◄── Last Mutation Timestamp (Defensive Cloned Date)
```

### Comprehensive Field-by-Field Specification

| Field                    | Type            | Ownership         |           Mutability            | Domain Purpose & Significance                                                                                                                 |
| :----------------------- | :-------------- | :---------------- | :-----------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                 | `SessionId`     | Kinesiology       |            Immutable            | Unique identity of the clinical encounter aggregate root. Auto-generated (`sess_<timestamp>_<random>`) or explicitly assigned upon creation.  |
| **`version`**            | `number`        | Kinesiology       |      Managed by Aggregate       | Monotonically increasing integer ($\ge 1$) for optimistic concurrency control. Prevents lost updates during concurrent edits.                 |
| **`status`**             | `SessionStatus` | Kinesiology       |     Mutable via Domain API      | Lifecycle state of the clinical encounter (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`). Governed by state machine rules. |
| **`clientId`**           | `string`        | Client Management |            Immutable            | External correlation ID linking the clinical session to the recipient client record in Client Management.                                     |
| **`therapistId`**        | `string`        | Identity (IAM)    | Mutable via Domain Reassignment | External correlation ID linking the clinical session to the practitioner's user account in Identity.                                          |
| **`appointmentId`**      | `string`        | Scheduling        |            Immutable            | External correlation ID linking the clinical session to the calendar booking in Scheduling.                                                   |
| **`cancellationReason`** | `string?`       | Kinesiology       |     Mutable upon `cancel()`     | Clinical or administrative explanation captured when the session is transitioned to `CANCELLED`. Trimmed and sanitized.                       |
| **`notes`**              | `SessionNotes`  | Kinesiology       |   Mutable via `updateNotes()`   | Value Object holding structured clinical SOAP documentation (`subjective`, `objective`, `assessment`, `plan`) or `rawText`.                   |
| **`createdAt`**          | `Date`          | Kinesiology       |            Immutable            | Timestamp when the clinical encounter was initialized. Returns a defensive clone.                                                             |
| **`updatedAt`**          | `Date`          | Kinesiology       |      Managed by Aggregate       | Timestamp of the most recent domain mutation or state transition. Returns a defensive clone.                                                  |

### Rationale for External Identifier References (No Foreign Aggregate Embedding)

`TreatmentSession` references `clientId`, `therapistId`, and `appointmentId` strictly as scalar strings / value objects. It **NEVER** embeds `Client`, `Appointment`, or `User` domain instances:

1. **Bounded Context Autonomy**: Kinesiology must not load or instantiate foreign aggregates to evaluate its own internal rules.
2. **Database Isolation & Performance**: Eliminates deep, cross-table relational graph loading and prevents cascade persistence side effects.
3. **Transaction Boundary Decoupling**: Forbids cross-context distributed locking and two-phase commits ($2\text{PC}$).

---

## 6. Lifecycle State Machine & Transition Specification

The clinical session lifecycle is strictly governed by an explicit finite state machine inside `TreatmentSession` (specified in [ADR-0046](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)):

```text
       ┌──────────────┐
       │  SCHEDULED   │ (Initial State upon creation)
       └──────┬───────┘
         │    │    │
  start()│    │    │ cancel(reason) / markAsNoShow()
         ▼    ▼    ▼
 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
 │ IN_PROGRESS │ │  CANCELLED  │ │   NO_SHOW   │ (Terminal States)
 └──────┬──────┘ └─────────────┘ └─────────────┘
        │ complete()
        ▼
 ┌─────────────┐
 │  COMPLETED  │ (Terminal State)
 └─────────────┘
```

### Authoritative State Transition Table

| Operation                        | Precondition (Required State)              | Resulting State                  | Invalid-State Behavior                                                                                                                                                            |
| :------------------------------- | :----------------------------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`start(clock?)`**              | `SCHEDULED`                                | `IN_PROGRESS`                    | Throws `InvalidSessionTransitionException` if invoked from `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, or `NO_SHOW`. State remains unmodified.                                       |
| **`complete(clock?)`**           | `IN_PROGRESS`                              | `COMPLETED`                      | Throws `InvalidSessionTransitionException` if invoked from `SCHEDULED` (direct completion prohibited), `COMPLETED`, `CANCELLED`, or `NO_SHOW`. State remains unmodified.          |
| **`cancel(reason?, clock?)`**    | `SCHEDULED`                                | `CANCELLED`                      | Throws `InvalidSessionTransitionException` if invoked from `IN_PROGRESS` (mid-session cancellation prohibited), `COMPLETED`, `CANCELLED`, or `NO_SHOW`. State remains unmodified. |
| **`markAsNoShow(clock?)`**       | `SCHEDULED`                                | `NO_SHOW`                        | Throws `InvalidSessionTransitionException` if invoked from `IN_PROGRESS` (mid-session no-show prohibited), `COMPLETED`, `CANCELLED`, or `NO_SHOW`. State remains unmodified.      |
| **`updateNotes(notes, clock?)`** | `SCHEDULED`, `IN_PROGRESS`, or `COMPLETED` | State unchanged, `notes` updated | Throws `Error` if `notes` is null/undefined or if invoked on a session in `CANCELLED` or `NO_SHOW` terminal status.                                                               |

_Rule_: All transitions not explicitly listed in the table above are invalid by default.

### Important Business Semantics

1. **`SCHEDULED`**: The treatment session exists and is expected to occur.
2. **`IN_PROGRESS`**: The therapist has formally started the clinical encounter.
3. **`COMPLETED`**: The treatment session has reached its normal conclusion (**Terminal**).
4. **`CANCELLED`**: The session will not occur because it was cancelled prior to starting (**Terminal**).
5. **`NO_SHOW`**: The session did not occur because the client did not attend (**Terminal**).

---

## 7. Aggregate Invariants & Domain Rules

1. **Identity Validity**: `SessionId`, `ClientId`, `TherapistId`, and `AppointmentId` must be non-empty, trimmed strings.
2. **Creation State**: Every new `TreatmentSession` begins strictly in `SCHEDULED` status with `version = 1`. `CreateTreatmentSessionProps` exposes zero status override parameter.
3. **Lifecycle Authorization**: The `TreatmentSession` aggregate root is the sole authority over transitions. External layers (controllers, DTOs, application services) must not decide transition validity.
4. **No Direct `SCHEDULED -> COMPLETED` Transition**: A clinical encounter must be started (`IN_PROGRESS`) before it can be completed.
5. **Terminal State Immutability**: Once a session reaches `COMPLETED`, `CANCELLED`, or `NO_SHOW`, all subsequent transitions are permanently rejected.
6. **Failure Atomicity (Validate First, Mutate Second)**: Any operation that fails an invariant leaves the aggregate state, notes, and timestamps completely unchanged (`before.status === after.status`, `before.updatedAt === after.updatedAt`).
7. **Encapsulation Protection**: State cannot be mutated externally. Zero generic status setters (`setStatus`, `changeStatus`). Getters for mutable objects (`createdAt`, `updatedAt`, `uncommittedEvents`) return defensive clones.
8. **Value Object Immutability**: `SessionId` and `SessionNotes` are deeply frozen via `Object.freeze(this)`.

---

## 8. Domain Purity & Infrastructure Decoupling

The Kinesiology domain layer (`packages/core/src/kinesiology/domain/`) strictly enforces **Clean Architecture and DDD purity**:

- **Zero Infrastructure Dependencies**: 0 imports from Prisma (`@prisma/client`), NestJS (`@Injectable`), Express, Fastify, or database drivers.
- **Zero Presentation Dependencies**: 0 HTTP requests, responses, controllers, or API DTOs in domain entities.
- **Deterministic Time Abstraction**: Time-dependent logic relies on the domain `Clock` interface, allowing deterministic simulation via `TestClock` in unit tests.
- **Domain Exceptions**: Invariant violations throw native domain errors (`KinesiologyDomainException`, `InvalidSessionTransitionException`) with zero HTTP status code coupling.

---

## 9. Consistency Model & Transaction Isolation

```text
┌───────────────────────────┐      ┌───────────────────────────┐
│     Client Management     │      │        Scheduling         │
│  Owns Client Consistency  │      │Owns Appointment Consist.  │
└───────────────────────────┘      └───────────────────────────┘
              ▲                                  ▲
              │ (Zero Distributed Tx)            │ (Zero Distributed Tx)
┌─────────────┴─────────────┐      ┌─────────────┴─────────────┐
│         Identity          │      │        Kinesiology        │
│  Owns Identity Consist.   │      │Owns TreatmentSess. Consist│
└───────────────────────────┘      └───────────────────────────┘
```

1. **Autonomous Consistency**:
   - `TreatmentSession` invariants are strongly consistent within the aggregate boundary.
   - Persistence transactions operate strictly on Kinesiology database tables.
   - **Zero Distributed Transactions**: Creating or updating a `TreatmentSession` must NEVER participate in a distributed two-phase commit ($2\text{PC}$) or cross-context transaction with Client Management, Scheduling, or Identity.
2. **Optimistic Concurrency Control**:
   - `TreatmentSession` aggregates enforce `version: number` optimistic concurrency locking. Concurrent note edits return an optimistic locking conflict without touching foreign aggregates.
3. **Cross-Context Integration**:
   - Future cross-context integration (e.g. updating the Client Timeline stream upon session completion) will utilize asynchronous domain events (`TreatmentSessionCompletedEvent`) rather than synchronous cross-context coupling.

---

## 10. Anti-Corruption Principles & Boundary Rules

To prevent domain model erosion:

1. **Opaque Identifier Boundaries**: When receiving external IDs (`clientId`, `therapistId`, `appointmentId`), Kinesiology treats them as opaque scalar tokens. It does not validate foreign business rules (e.g., whether a client has active insurance or whether a room is double-booked).
2. **Translation at Application Ports**: External data entering Kinesiology use cases must be translated through DTO mappers and verified at boundary ports without leaking foreign domain types into Kinesiology aggregates.

---

## 11. Future Expansion Rules for TreatmentSession

To protect the aggregate from becoming an unmaintainable "god object", any future candidate property or entity must satisfy all 4 criteria before being placed inside `TreatmentSession`:

1. **Shared Consistency Boundary**: Must require immediate, atomic consistency with the session's lifecycle status and progress notes within the exact same database transaction.
2. **Invariant Enforcement**: Must participate in aggregate invariant checks enforced directly by `TreatmentSession`.
3. **Low Write Contention**: Must not introduce high concurrent write contention from multiple simultaneous actors (e.g. real-time multi-user collaborative editing should use separate streams/models).
4. **Clinical Domain Relevance**: Must represent clinical data of this specific care encounter (e.g. specific muscle test results recorded during this session), rather than general client profile data or scheduling logistics.

### Deliberately Deferred Scope (Milestone 4.2+)

- **Neuromuscular & Postural Assessments**: Joint Range of Motion (ROM), manual muscle testing (MMT), postural screening.
- **Clinical Treatment Plans & Goals**: Multi-session longitudinal protocols and goal tracking.
- **Therapeutic Exercise Library**: Exercise catalog, prescribed home exercise programs.
- **Billing & Insurance Claims**: CPT/ICD coding and Superbill generation.

---

## 12. Architectural Decision Records (ADRs)

- **[ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)**
- **[ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)**
