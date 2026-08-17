# ADR-0050: Clinical Therapist Assignment, Handover & Authorization Architecture in Kinesiology

## Status

Accepted

## Context

In clinical kinesiology and rehabilitation settings, practitioner assignment and mid-treatment clinical handover are critical operational workflows:

1. **Initial Assignment & Upstream Source**: An appointment scheduled with Therapist A arrives at reception, and a `TreatmentSession` is created with initial default `therapistId: Therapist A` passed across the ACL port.
2. **Pre-Care Reassignment**: Prior to starting the session (e.g. shift cover or sick relief), Therapist B is assigned to conduct the encounter.
3. **Mid-Care Handover**: During a specialized, multi-stage assessment or rehabilitation session, Therapist A conducts the assessment and hands over ongoing care to Therapist B (`IN_PROGRESS`).
4. **Terminal Immutability**: Once a session concludes (`COMPLETED`, `CANCELLED`, `NO_SHOW`), the conducting clinician of record must remain legally immutable for medico-legal accountability, licensing compliance, and insurance auditability.
5. **Separation of Concerns**: A user cannot be assigned as a therapist merely because their `userId` exists in the database. The system must distinctly separate Identity Existence, Clinical Eligibility, and Actor Authorization.

We must define the precise bounded context ownership, authorization model, eligibility verification, lifecycle invariants, and domain event emission architecture for clinical therapist assignment.

## Decision

We establish the following architectural rules for **Therapist Assignment & Handover in Kinesiology**:

### 1. Bounded Context Ownership & Upstream-to-Downstream Flow

```text
Scheduling Context (Upstream)
    ↓  [Owns Appointment & TherapistSchedule calendar bookings]
ISchedulingAppointmentLookupPort (ACL)
    ↓  [Translates to AppointmentReferenceDTO.therapistId]
Kinesiology Application Layer
    ↓  [Sets initial default therapistId at TreatmentSession creation]
TreatmentSession Aggregate (Downstream)
       [Authoritatively owns clinical therapist assignment and encounter history]
```

- **Scheduling** owns calendar availability and appointment bookings (`TherapistSchedule`, `Appointment`).
- **Platform Identity** owns user authentication, account status, and system RBAC permissions.
- **Kinesiology** authoritatively owns the clinician of record for the clinical encounter. It treats `therapistId` as an opaque scalar string token representing the practitioner clinically responsible for the `TreatmentSession`.

### 2. Three-Tier Responsibility Separation

We explicitly separate and enforce 3 distinct verification boundaries:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. IDENTITY EXISTENCE: "Does this user exist?"                           │
│    • Checked via ITherapistLookupPort against Platform Identity.         │
│    • Returns THERAPIST_NOT_FOUND (404) if user record does not exist.   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. CLINICAL ELIGIBILITY: "Is this user eligible for Kinesiology care?"   │
│    • Evaluates target user account status (status === 'ACTIVE').         │
│    • Evaluates user roles/capabilities (roles.includes('THERAPIST') or  │
│      has permission kinesiology.sessions.treat).                         │
│    • Returns THERAPIST_INELIGIBLE (422) if suspended or non-clinical.    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. ACTOR AUTHORIZATION: "May the current actor reassign this therapist?" │
│    • Evaluates calling actor's context via IAuthorizationEvaluator.      │
│    • Requires kinesiology.sessions.assign permission (e.g. ADMIN/OWNER)  │
│      or active clinician self-handover.                                  │
│    • Returns ForbiddenException (403) before command execution.          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3. Application Layer Command & Handler

- Reassignment is orchestrated through `AssignTherapistToSessionCommand` and `AssignTherapistToSessionHandler`.
- **Idempotency Rule**: If `newTherapistId === session.therapistId`, the use case returns a successful `TreatmentSessionDTO` without modifying aggregate version or emitting duplicate events.
- **Persistence & Optimistic Concurrency**: Reassignment increments aggregate version ($v \to v + 1$) and guarantees atomic write protection.

### 4. Lifecycle Invariants & Invariant Matrix

| Session Status    | Reassignment Permitted? | Domain Effect                                                                                                       |
| :---------------- | :---------------------: | :------------------------------------------------------------------------------------------------------------------ |
| **`SCHEDULED`**   |         **YES**         | Pre-care handover; updates `therapistId`, advances $v \to v + 1$, emits `TherapistAssignedToSessionEvent`.          |
| **`IN_PROGRESS`** |         **YES**         | Mid-care clinical handover; updates `therapistId`, advances $v \to v + 1$, emits `TherapistAssignedToSessionEvent`. |
| **`COMPLETED`**   |   **NO (PROHIBITED)**   | Throws domain error. Medico-legal clinical records are immutable once completed.                                    |
| **`CANCELLED`**   |   **NO (PROHIBITED)**   | Throws domain error. Cancelled sessions cannot undergo staff changes.                                               |
| **`NO_SHOW`**     |   **NO (PROHIBITED)**   | Throws domain error. No-show records cannot undergo staff changes.                                                  |

### 5. Domain Event & Cross-Context Integration

- Upon successful reassignment, `TreatmentSession` emits `TherapistAssignedToSessionEvent(sessionId, clientId, previousTherapistId, newTherapistId, version, timestamp)`.
- Downstream Scheduling listeners observe this event to update practitioner workload dashboards and resource allocation projections asynchronously.

## Consequences

### Positive

- **Medico-Legal Compliance**: Prohibits altering clinician of record on completed/signed-off treatment encounters.
- **Operational Flexibility**: Clinicians can perform shift covers and mid-treatment handovers seamlessly.
- **Decoupled Architecture**: Kinesiology remains pure and does not depend on Identity or Scheduling database schemas.
- **Robust Security**: Multi-tier separation guarantees authorization, eligibility, and lifecycle validity cannot bypass each other.

### Negative / Trade-offs

- If a session is erroneously completed under the wrong practitioner name, an administrative correction workflow with clinical supervisor audit notes must be executed rather than a simple in-place reassignment.

## References

- [ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [ADR-0047: Appointment Correlation, Uniqueness & Event Emission Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0047-appointment-to-treatment-session-correlation-and-event-emission-architecture.md)
- [ADR-0048: Scheduling-to-Kinesiology Anti-Corruption Layer Port Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0048-scheduling-to-kinesiology-anti-corruption-layer-port-architecture.md)
- [ADR-0049: Cross-Context Lifecycle Independence & Non-Corruption Invariants](file:///c:/Projects/kinergy-platform/docs/adr/0049-cross-context-lifecycle-independence-and-non-corruption-invariants.md)
