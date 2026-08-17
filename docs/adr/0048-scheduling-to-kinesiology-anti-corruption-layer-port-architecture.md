# ADR-0048: Scheduling-to-Kinesiology Anti-Corruption Layer Port Architecture

## Status

Accepted

## Context

In Phase 4 — Kinesiology (Milestone 4.3: Appointment Integration), the platform connects the **Scheduling** bounded context with the **Kinesiology** bounded context.

A scheduled `Appointment` in Scheduling originates a `TreatmentSession` in Kinesiology. However, these two bounded contexts have distinct responsibilities:

- **Scheduling** owns the `Appointment` aggregate root, room allocation, calendar turnaround buffers, and calendar recurrence series.
- **Kinesiology** owns the `TreatmentSession` aggregate root, clinical SOAP progress notes, clinical evaluations, and clinical lifecycle transitions.

Allowing Kinesiology to import the `Appointment` aggregate root, its Prisma database models, or internal value objects would create severe architectural coupling, violate Domain-Driven Design (DDD) bounded context autonomy, and break Clean Architecture principles.

We require a formal integration contract that allows Kinesiology to safely instantiate a `TreatmentSession` from an eligible `Appointment` while maintaining total domain purity.

## Decision

We establish an **In-Process Anti-Corruption Layer (ACL) Port Architecture** adhering to the following rules:

### 1. Context Mapping & Ownership

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                   UPSTREAM BOUNDED CONTEXT: SCHEDULING                   │
│                                                                          │
│  Role: Upstream / Service Provider (Supplier)                            │
│  Owns: Appointment Aggregate, Room Logistics, Calendar Slots             │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     │ Exposes Application Query / Read Model
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │  ANTI-CORRUPTION LAYER    │
                       │  (In-Process Adapter)     │
                       │  Translates Appointment   │
                       │  to AppointmentReference  │
                       └─────────────┬─────────────┘
                                     │
                                     │ Implements ISchedulingAppointmentLookupPort
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  DOWNSTREAM BOUNDED CONTEXT: KINESIOLOGY                 │
│                                                                          │
│  Role: Downstream / Consumer (Customer)                                  │
│  Owns: TreatmentSession Aggregate, Clinical Notes, Encounter History     │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Customer-Supplier Relationship**: Kinesiology (Customer) defines the precise port interface it requires; an adapter implemented in the infrastructure/application boundary translates Scheduling (Supplier) data.
- **Pure Domain Boundary**: The Kinesiology domain layer (`packages/core/src/kinesiology/domain/`) remains **100% untouched and isolated**. It never imports or references `Appointment`, `AppointmentId`, or `AppointmentStatus`.

### 2. Integration Port & Data Contract

Kinesiology Application layer defines a minimal, stable read-only contract:

```typescript
/**
 * Read-only projection representing an appointment reference for session creation.
 */
export interface AppointmentReferenceDTO {
  readonly appointmentId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly scheduledAt: Date;
  readonly isEligibleForSession: boolean;
  readonly ineligibilityReason?: string;
}

/**
 * Port interface defined in Kinesiology Application layer.
 */
export interface ISchedulingAppointmentLookupPort {
  /**
   * Retrieves an appointment reference by its scalar identifier.
   * Returns null if the appointment does not exist.
   */
  getAppointmentReference(appointmentId: string): Promise<AppointmentReferenceDTO | null>;
}
```

### 3. Data Field Minimization & Prohibited Data

- **Transferred Data**: Strictly scalar string references (`appointmentId`, `clientId`, `therapistId`) and an eligibility flag (`isEligibleForSession`).
- **Prohibited Data**: Facility logistics (`roomId`), calendar slot ranges (`timeRange`), turnaround buffers, recurrence rules (`seriesId`), and billing pricing must **NEVER** cross the boundary into Kinesiology.

### 4. Eligibility & Idempotency Rules

- **Eligibility**: An appointment can initiate a `TreatmentSession` only if its status is `SCHEDULED`, `CONFIRMED`, or `CHECKED_IN`. Appointments in `CANCELLED` or `NO_SHOW` status are rejected with `422 Unprocessable Entity`.
- **Idempotency**: Exactly one `TreatmentSession` can exist per `appointmentId`. The application handler verifies `findByAppointmentId(appointmentId)` prior to dispatch, and the database enforces a `UNIQUE (appointment_id)` constraint.
- **Zero Two-Phase Commit ($2\text{PC}$)**: Transactions are strictly local to each bounded context.

## Consequences

### Positive

- **Decoupled Evolution**: Scheduling can refactor internal room logistics, recurrence algorithms, or appointment states without impacting Kinesiology.
- **Domain Purity**: Kinesiology `TreatmentSession` aggregate remains testable in memory in $< 1\text{ ms}$ without mocking foreign aggregates.
- **Deterministic Error Handling**: Clear application failure codes (`APPOINTMENT_NOT_FOUND`, `APPOINTMENT_INELIGIBLE`, `SESSION_ALREADY_EXISTS`).

### Negative / Trade-offs

- Requires maintaining an ACL adapter class and DTO mapper in the application integration layer.

## References

- [ADR-0045: Kinesiology Bounded Context Ownership & Cross-Context Identifiers](file:///c:/Projects/kinergy-platform/docs/adr/0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
- [ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification](file:///c:/Projects/kinergy-platform/docs/adr/0046-treatment-session-lifecycle-state-machine-and-transition-specification.md)
- [ADR-0047: Appointment Correlation, Uniqueness & Event Emission Architecture](file:///c:/Projects/kinergy-platform/docs/adr/0047-appointment-to-treatment-session-correlation-and-event-emission-architecture.md)
- [Kinesiology Bounded Context Architecture Documentation](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)
