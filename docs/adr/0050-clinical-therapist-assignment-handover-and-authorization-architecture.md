# ADR-0050: Clinical Therapist Assignment, Handover & Authorization Architecture in Kinesiology

## Status

Accepted

## Context

In clinical kinesiology and rehabilitation settings, practitioner assignment and mid-treatment clinical handover are critical operational workflows:

1. **Initial Assignment**: An appointment scheduled with Practitioner A arrives at reception, and a `TreatmentSession` is created with `therapistId: Practitioner A`.
2. **Pre-Care Reassignment**: Prior to starting the session (e.g. shift cover or sick relief), Practitioner B is assigned to conduct the encounter.
3. **Mid-Care Handover**: During a specialized, multi-stage assessment or rehabilitation session, Practitioner A conducts the assessment and hands over the ongoing care to Practitioner B (`IN_PROGRESS`).
4. **Terminal Immutability**: Once a session concludes (`COMPLETED`, `CANCELLED`, `NO_SHOW`), the conducting clinician of record must remain legally immutable for medico-legal accountability, licensing compliance, and insurance auditability.

We must define the precise bounded context ownership, authorization model, lifecycle invariants, and domain event emission architecture for clinical therapist assignment.

## Decision

We establish the following architectural rules for **Therapist Assignment & Handover in Kinesiology**:

### 1. Bounded Context Ownership & Identity Boundaries

- **Platform Identity** owns practitioner authentication, account status, user IDs (`UserId`), and clinical RBAC roles/permissions.
- **Scheduling** owns practitioner calendar availability and appointment room bookings (`TherapistSchedule`).
- **Kinesiology** does **not** own a `Therapist` entity or aggregate. It treats `therapistId` as an opaque scalar string token representing the practitioner clinically responsible for the `TreatmentSession`.

### 2. Application Layer Command & Handler

- Reassignment is orchestrated through `AssignTherapistToSessionCommand` and `AssignTherapistToSessionHandler`.
- **Idempotency Rule**: If `newTherapistId === session.therapistId`, the use case returns a successful `TreatmentSessionDTO` without modifying aggregate version or emitting duplicate events.
- **Persistence & Optimistic Concurrency**: Reassignment increments aggregate version ($v \to v + 1$) and guarantees atomic write protection.

### 3. Lifecycle Invariants & Invariant Matrix

| Session Status    | Reassignment Permitted? | Domain Effect                                                                                                       |
| :---------------- | :---------------------: | :------------------------------------------------------------------------------------------------------------------ |
| **`SCHEDULED`**   |         **YES**         | Pre-care handover; updates `therapistId`, advances $v \to v + 1$, emits `TherapistAssignedToSessionEvent`.          |
| **`IN_PROGRESS`** |         **YES**         | Mid-care clinical handover; updates `therapistId`, advances $v \to v + 1$, emits `TherapistAssignedToSessionEvent`. |
| **`COMPLETED`**   |   **NO (PROHIBITED)**   | Throws domain error. Medico-legal clinical records are immutable once completed.                                    |
| **`CANCELLED`**   |   **NO (PROHIBITED)**   | Throws domain error. Cancelled sessions cannot undergo staff changes.                                               |
| **`NO_SHOW`**     |   **NO (PROHIBITED)**   | Throws domain error. No-show records cannot undergo staff changes.                                                  |

### 4. Domain Event & Cross-Context Integration

- Upon successful reassignment, `TreatmentSession` emits `TherapistAssignedToSessionEvent(sessionId, clientId, previousTherapistId, newTherapistId, version, timestamp)`.
- Downstream Scheduling listeners observe this event to update practitioner workload dashboards and resource allocation projections asynchronously.

## Consequences

### Positive

- **Medico-Legal Compliance**: Prohibits altering clinician of record on completed/signed-off treatment encounters.
- **Operational Flexibility**: Clinicians can perform shift covers and mid-treatment handovers seamlessly.
- **Decoupled Architecture**: Kinesiology remains pure and does not depend on Identity or Scheduling database schemas.

### Negative / Trade-offs

- If a session is erroneously completed under the wrong practitioner name, an administrative correction workflow with clinical supervisor audit notes must be executed rather than a simple in-place reassignment.

## References

- [ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [ADR-0047: Appointment Correlation, Uniqueness & Event Emission Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0047-appointment-to-treatment-session-correlation-and-event-emission-architecture.md)
- [ADR-0048: Scheduling-to-Kinesiology Anti-Corruption Layer Port Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0048-scheduling-to-kinesiology-anti-corruption-layer-port-architecture.md)
- [ADR-0049: Cross-Context Lifecycle Independence & Non-Corruption Invariants](file:///c:/Projects/kinergy-platform/docs/adr/0049-cross-context-lifecycle-independence-and-non-corruption-invariants.md)
