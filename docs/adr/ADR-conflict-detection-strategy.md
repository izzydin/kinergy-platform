# ADR-004: In-Memory Multi-Aggregate Conflict Detection & Specification Engine

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: Scheduling an appointment requires evaluating multiple rules across distinct domain boundaries: facility open hours, public holidays, therapist shift hours, therapist vacations, daily breaks, room availability status, room equipment features, therapist double-bookings, and client double-bookings.

## Decision

We implement a stateless `ConflictDetectionService` supported by composable **Domain Specifications** (`ISpecification<T>`):

1. **Specification Composition**: Rules are encapsulated into pure boolean specification objects (`TherapistAvailabilitySpecification`, `RoomAvailabilitySpecification`, `AppointmentOverlapSpecification`, `ClientAvailabilitySpecification`, `WorkingHoursSpecification`) that compose using `and()`, `or()`, `not()`.
2. **Prioritized Conflict Pipeline**: Conflict evaluation follows a strict 5-stage priority pipeline:
   - Facility Open & Holiday Check $\rightarrow$ Therapist Vacation $\rightarrow$ Working Hours & Breaks $\rightarrow$ Room Status & Features $\rightarrow$ Booking Overlaps.
3. **Structured Diagnostic Payload**: Returns rich `SchedulingConflict[]` objects detailing the exact conflict type (`HOLIDAY`, `VACATION`, `WORKING_HOURS`, `THERAPIST`, `ROOM`, `CLIENT`) and human-readable explanation.

## Consequences

### Positive

- Flexible, extensible business rule engine.
- Detailed diagnostic feedback for UI error displays and API responses.

### Negative / Trade-offs

- Requires loading relevant candidate schedules and booking ranges into memory prior to evaluation.
