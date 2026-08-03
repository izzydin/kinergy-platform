# Scheduling Bounded Context — Domain Model & Ubiquitous Language

## Ubiquitous Language Glossary

| Term                   | Domain Definition                                                                                                                                       |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Appointment**        | An encapsulated booking agreement between a Client and a Therapist for a specific service in a physical Room over a precise `TimeRange`.                |
| **TherapistSchedule**  | Aggregate Root representing a therapist's base working hours, daily breaks, vacations, and date-specific availability overrides.                        |
| **Room**               | Aggregate Root managing a physical space's operational capacity, maintenance state (`AVAILABLE`, `MAINTENANCE`, `UNAVAILABLE`), and equipment features. |
| **TimeRange**          | Immutable Value Object encapsulating a continuous temporal interval `[start, end)` in UTC with invariant `start < end`.                                 |
| **Duration**           | Immutable Value Object encapsulating a non-negative quantity of time in milliseconds, minutes, or hours.                                                |
| **AppointmentType**    | Value Object encapsulating clinical booking classifications (`ASSESSMENT`, `FOLLOW_UP`, `TREATMENT`, `EVALUATION`, `RENTAL`, `GROUP_CLASS`).            |
| **SchedulingConflict** | Immutable Value Object detailing double-booking or policy violations (`conflictType`, `conflictingEntityId`, `requestedRange`, `reason`).               |

---

## Domain Specifications

- `WorkingHoursSpecification`: Evaluates if candidate range falls completely inside work shifts.
- `TherapistAvailabilitySpecification`: Evaluates 4-level priority availability (Vacations $\rightarrow$ Overrides $\rightarrow$ Breaks $\rightarrow$ Working Hours).
- `RoomAvailabilitySpecification`: Verifies room status is `AVAILABLE`, capacity is sufficient, and required equipment features are supported.
- `AppointmentOverlapSpecification`: Asserts candidate range has zero intersection with active existing appointments.
- `ClientAvailabilitySpecification`: Asserts client has zero conflicting active appointments.

---

## Configurable Business Policies

- `DefaultAppointmentDurationPolicy`: Enforces min/max duration bounds and standard duration per appointment type.
- `BookingWindowPolicy`: Enforces advance lead time notice (e.g., 2 hours) and maximum advance booking horizon (e.g., 90 days out).
- `CancellationPolicy`: Evaluates late cancellation boundaries (e.g., 24-hour cutoff) and penalty applicability.
- `ReschedulePolicy`: Limits maximum reschedules allowed per appointment (max 3) and notice notice lead time.
- `BookingIdempotencyPolicy`: Validates client request tokens to prevent duplicate booking on network retries.
