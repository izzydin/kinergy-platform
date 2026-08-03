# Scheduling Bounded Context - Ubiquitous Language Glossary

## 1. Domain Terminology & Concepts

| Term                     | Definition                                                                                                            | Ubiquitous Language Context                                                           |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| **Appointment**          | A reserved time slot binding a client, therapist, and physical room for a treatment session.                          | Aggregate Root representing the core transactional record of a scheduled session.     |
| **TherapistSchedule**    | The temporal availability definition for a therapist, including recurring working hours and explicit time-off blocks. | Aggregate Root managing therapist availability constraints.                           |
| **Room**                 | A physical room or facility space where therapy sessions occur.                                                       | Aggregate Root enforcing spatial capacity and maintenance blackout periods.           |
| **TimeSlot**             | An immutable value object representing a start time and end time window in UTC.                                       | Core value object used for overlap checks and duration calculations.                  |
| **Clock**                | An abstracted time source providing current UTC time (`now()`) and midnight UTC date (`today()`).                     | Primary port for time inquiries, enabling deterministic unit testing via `TestClock`. |
| **Double-Booking Guard** | A domain service or policy rule ensuring no therapist or room is assigned to overlapping active appointments.         | Domain Invariant enforced prior to committing an appointment booking or update.       |
| **Working Hours**        | Time windows during which a therapist is normally available to take appointments.                                     | Domain entity owned by `TherapistSchedule`.                                           |
| **Time-Off**             | Time windows during which a therapist is unavailable (vacation, sick leave, training).                                | Domain entity owned by `TherapistSchedule`.                                           |
| **Reschedule Window**    | The minimum lead time policy required before an appointment start time to allow rescheduling without penalty.         | Business Policy enforced by `ReschedulePolicy`.                                       |
| **Cancellation Policy**  | Business rules governing appointment cancellation deadlines, fees, and status transitions.                            | Business Policy enforced by `CancellationPolicy`.                                     |

---

## 2. Invariants & Rules

1. **TimeSlot Validity**: A `TimeSlot` must have `startTime < endTime`. Zero-duration or negative-duration slots are invalid.
2. **Non-Overlapping Aggregate Boundaries**: `Appointment`, `TherapistSchedule`, and `Room` manage distinct state trees without direct ORM database joins.
3. **UTC Uniformity**: All timestamps stored and evaluated within domain entities MUST be normalized to Coordinated Universal Time (UTC).
