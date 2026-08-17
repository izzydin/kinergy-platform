# ADR-0049: Cross-Context Lifecycle Independence & Non-Corruption Invariants

## Status

Accepted

## Context

In Phase 4 — Kinesiology (Milestone 4.3: Appointment Integration), the platform connects the calendar appointment workflow in **Scheduling** with the clinical therapy workflow in **Kinesiology**.

A critical architectural hazard in healthcare management systems is **silent domain corruption**:

1. If an appointment is rescheduled in Scheduling, does it automatically modify the clinical timestamps or progress notes of an active or historical `TreatmentSession`?
2. If an appointment is marked completed by front-desk administrative staff, does it automatically fabricate or sign off on a clinical `TreatmentSession` without clinician SOAP documentation?
3. If an appointment is cancelled after clinical care has already commenced (`IN_PROGRESS`), does it silently cancel or delete the clinical encounter?

Without an explicit architectural decision, changes in upstream calendar scheduling can corrupt downstream medico-legal clinical records.

## Decision

We establish the following **Cross-Context Lifecycle Independence and Non-Corruption Invariants**:

### 1. Authoritative Source of Truth Matrix

| Domain Concept                       | Authoritative Context | Authority & Synchronization Rule                                                                                                                                                                          |
| :----------------------------------- | :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Appointment Status**               | **Scheduling**        | Authoritative for calendar logistics (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `NO_SHOW`).                                                         |
| **Calendar Slot Time (`TimeRange`)** | **Scheduling**        | Authoritative for room and calendar booking slots. Never copied to `TreatmentSession`.                                                                                                                    |
| **Treatment Session Status**         | **Kinesiology**       | Authoritative for clinical care state (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).                                                                                                  |
| **Clinical Progress Notes (SOAP)**   | **Kinesiology**       | Purely owned by Kinesiology (`SessionNotes` Value Object). Never synchronized into appointment notes.                                                                                                     |
| **Clinical Encounter Sign-Off**      | **Kinesiology**       | Emits `TreatmentSessionCompletedEvent`. Can optionally inform Scheduling to complete the appointment, but administrative completion in Scheduling **never** automatically completes a `TreatmentSession`. |

### 2. Explicit Non-Synchronization & Non-Corruption Rules

1. **Rescheduling Isolation**:
   - Rescheduling in Scheduling updates the appointment slot or spawns a new appointment occurrence.
   - Any previously created `TreatmentSession` remains an immutable historical record linked to the originating appointment ID. It is **never** silently mutated or time-shifted.
2. **Clinical Encounter Primacy**:
   - Once a `TreatmentSession` transitions to `IN_PROGRESS`, clinical care is actively taking place.
   - Front-desk cancellation or rescheduling in Scheduling is prohibited or treated as an invalid operational state while a session is active.
3. **No Two-Way Note Mirroring**:
   - Kinesiology progress note drafts are confidential clinical records protected by HIPAA/medico-legal compliance. They are never mirrored back into Scheduling calendar tables.
4. **No Cascading Database Triggers**:
   - Bounded context databases remain completely isolated. There are zero shared SQL triggers, zero foreign keys across context schemas, and zero cross-context database transactions ($2\text{PC}$).

### 3. Asynchronous Integration Event Semantics

Cross-context coordination is strictly asynchronous and event-driven:

- When a `TreatmentSession` completes, it publishes `TreatmentSessionCompletedEvent`.
- Downstream event listeners in Scheduling observe this event to transition the calendar booking to `COMPLETED`.
- If the event fails or is delayed, the clinical record remains safe and authoritative.

## Consequences

### Positive

- **Medico-Legal Compliance**: Clinical documentation and encounter histories cannot be accidentally overwritten or deleted by front-desk calendar changes.
- **Zero Temporal Coupling**: Scheduling algorithms and calendar views can be refactored without breaking clinical session integrity.
- **Resilience**: Temporary failure in the Scheduling context does not block a clinician from conducting, documenting, or completing an active `TreatmentSession`.

### Negative / Trade-offs

- If a client reschedules before treatment begins, front desk staff must initiate the session from the new appointment rather than expecting automatic time migration.

## References

- [ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [ADR-0047: Appointment Correlation, Uniqueness & Event Emission Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0047-appointment-to-treatment-session-correlation-and-event-emission-architecture.md)
- [ADR-0048: Scheduling-to-Kinesiology Anti-Corruption Layer Port Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0048-scheduling-to-kinesiology-anti-corruption-layer-port-architecture.md)
- [Kinesiology Bounded Context Architecture Documentation](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)
