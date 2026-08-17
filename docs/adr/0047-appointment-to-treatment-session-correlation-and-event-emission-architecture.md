# ADR-0047: Appointment-to-TreatmentSession Correlation, Uniqueness & Domain Event Emission Architecture

## Status

Accepted

## Context

In Phase 4 — Kinesiology (Milestone 4.2), the platform implements the domain events lifecycle and cross-context correlation model for the `TreatmentSession` aggregate root.

Two architectural challenges require explicit decision recording:

1. **Cross-Aggregate Uniqueness & Enforcement Boundary**:
   In the clinical workflow, a scheduled `Appointment` in the Scheduling context originates at most one active `TreatmentSession` in Kinesiology. However, an in-memory `TreatmentSession` aggregate root cannot query or inspect other instances to guarantee global appointment uniqueness without violating aggregate isolation and domain purity.

2. **Domain Event Justification & Emission Semantics**:
   The platform strictly adheres to the principle: _"Do not create events simply because an entity changed"_. The event emission contracts must be justified by concrete downstream consumers (e.g., Client Timeline projections, attendance analytics, billing ledger triggers, and medico-legal note auditing).

## Decision

We make the following architectural decisions:

### 1. Separation of Concerns for Cross-Aggregate Uniqueness

Uniqueness of `appointmentId` across treatment sessions is enforced across three distinct architectural layers:

```text
┌───────────────────────────────┐
│     Domain Aggregate Layer    │ ◄── Enforces scalar ID non-emptiness and immutability.
│       (TreatmentSession)      │     Does NOT query existing sessions.
└───────────────▲───────────────┘
                │
┌───────────────┴───────────────┐
│    Application Service Layer  │ ◄── Validates pre-conditions: queries session repository
│    (CreateTreatmentSession)   │     by appointmentId before dispatching aggregate create.
└───────────────▲───────────────┘
                │
┌───────────────┴───────────────┐
│    Persistence Layer (RDBMS)  │ ◄── Final author: UNIQUE INDEX ON treatment_sessions(appointment_id)
│        (Prisma / PostgreSQL)  │     guarantees concurrency-safe uniqueness under race conditions.
└───────────────────────────────┘
```

- **Domain Responsibility**: The `TreatmentSession` aggregate root treats `appointmentId: string` as an immutable scalar reference. It guarantees that once assigned, the appointment link cannot be mutated.
- **Application Responsibility**: Application use cases query the repository abstraction (`findByAppointmentId`) to prevent duplicate instantiation before dispatch.
- **Persistence Responsibility**: PostgreSQL enforces a unique constraint (`UNIQUE (appointment_id)`) to handle concurrent race conditions atomically.

### 2. Justified Domain Events & Emission Semantics

Domain events are recorded internally in `TreatmentSession.uncommittedEvents` and emitted **only upon successful domain state transitions**:

| Domain Event                            | Triggering Operation          | Downstream Consumer / Business Capability                                                                                                                                                           |
| :-------------------------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`TreatmentSessionCompletedEvent`**    | `complete(clock?)`            | **Primary Clinical Milestone**. Triggers asynchronous projection to the Client Clinical Timeline read model, notifies scheduling of encounter conclusion, and serves as the billing ledger trigger. |
| **`TreatmentSessionStartedEvent`**      | `start(clock?)`               | Records clinical start timestamp, enabling accurate encounter duration tracking.                                                                                                                    |
| **`TreatmentSessionCancelledEvent`**    | `cancel(reason, clock?)`      | Propagates clinical cancellation reasons into client history and analytics.                                                                                                                         |
| **`TreatmentSessionNoShowEvent`**       | `markAsNoShow(clock?)`        | Alerts front desk reception and updates client attendance risk scores.                                                                                                                              |
| **`TreatmentSessionCreatedEvent`**      | `create(props, clock?)`       | Initializes read models and syncs clinical session queues.                                                                                                                                          |
| **`TreatmentSessionNotesUpdatedEvent`** | `updateNotes(notes, clock?)`  | Emits audit event for medico-legal compliance tracking clinical progress note revisions.                                                                                                            |
| **`TherapistAssignedToSessionEvent`**   | `assignTherapist(id, clock?)` | Updates clinician workload schedule when session handover occurs.                                                                                                                                   |

### 3. Failure Atomicity on Events and Versioning

If an invariant validation fails (e.g. attempting direct completion from `SCHEDULED`), the operation throws an exception immediately:

- **Zero Events**: No domain events are pushed to `uncommittedEvents`.
- **Zero Version Increment**: `_version` remains strictly unchanged.
- **Zero Timestamp Mutation**: `_updatedAt` remains strictly unchanged.

## Consequences

### Positive

- **Domain Purity**: `TreatmentSession` remains 100% pure in-memory domain code, free from database query abstractions.
- **Concurrency Safety**: High-concurrency creation races on the same appointment are deterministically caught by the database unique constraint.
- **Audit & Integration Ready**: Downstream contexts (Client Timeline, Scheduling, Billing) receive strongly-typed, immutable domain events with exact aggregate versions.

### Negative / Trade-offs

- An application service must coordinate with the repository before creating a session to provide user-friendly error messages before the database unique constraint is hit.

## References

- [ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [Kinesiology Bounded Context Architecture Documentation](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)
