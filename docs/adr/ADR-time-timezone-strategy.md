# ADR-005: UTC Temporal Normalization & Timezone Handling Strategy

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: Healthcare and therapy platforms operate across multiple time zones. Storing dates in local wall-clock times or ambiguous timezone formats introduces severe bugs during Daylight Saving Time (DST) transitions, timezone shifts, and multi-location scheduling.

## Decision

We enforce a strict temporal normalization strategy across the domain core:

1. **UTC Core Normalization**: All domain value objects (`TimeRange`, `Duration`), aggregates (`Appointment`, `TherapistSchedule`, `Room`), and domain events store timestamps in **UTC ISO 8601 (`Date` instances initialized in UTC)**.
2. **Explicit Timezone Representation**: `TherapistSchedule` stores the therapist's IANA timezone string (e.g. `'America/New_York'`). Working hours and break calculations evaluate local wall-clock rules by converting UTC dates to the specified IANA timezone.
3. **Deterministic Testing**: Temporal operations rely on the `Clock` interface (`now()`, `today()`, `timezone()`), allowing `TestClock` to freeze or advance time deterministically during unit tests.

## Consequences

### Positive

- Immune to DST transition bugs and wall-clock ambiguity.
- Seamless multi-location and remote therapy support across international time zones.

### Negative / Trade-offs

- UI presentation layers must format UTC timestamps into local client/practitioner display strings.
