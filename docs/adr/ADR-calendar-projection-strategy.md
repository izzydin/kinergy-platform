# ADR-004: Calendar Projection Strategy & Read-Model Architecture

- **Status**: Accepted
- **Date**: 2026-08-13
- **Context**: Scheduling, front-desk reception, therapist resource management, and room allocation require real-time, interactive calendar grids (daily agenda, 7-day weekly grid, reception dashboard, therapist/room calendars). Executing heavy temporal queries directly against normalized domain aggregates can introduce latency and read/write tension.

---

## 1. Decision

We adopt a **Pluggable CQRS Read-Side Architecture** featuring synchronous grid computation and a port-based read repository boundary (`CalendarReadRepository`):

### Phase 1: Synchronous Computation & Domain Projection Engine

- **Pure Grid Mapper (`CalendarGridMapper`)**: Transforms domain entities (`Appointment[]`, `TherapistSchedule[]`, `Room[]`) into structured hour-by-hour time slots (`CalendarSlotDTO[]`). Computes conflict markers (`hasConflict`) and concurrent overlap counts (`overlapCount`) purely in memory.
- **Projection Engine (`CalendarProjectionService`)**: Projects daily and weekly operational agendas (`DailyAgendaDTO`, `WeeklyAgendaDTO`), incorporating `Clock` to tag slots with real-time operational status (`PAST`, `CURRENT_NOW`, `UPCOMING`).
- **Immediate Consistency**: Guarantees zero latency lag for front-desk reception staff. When an appointment is created, checked in, or rescheduled, the next query reflects the updated state immediately.

### Phase 2: Asynchronous Materialized Event-Driven Projections (Future Migration Path)

- **Port Abstraction (`CalendarReadRepository`)**: All query handlers accept `CalendarReadRepository` as a primary port.
- **Pluggable Storage**: When clinic transaction volume scales, an asynchronous event-driven subscriber (consuming `AppointmentCreatedEvent`, `AppointmentCheckedInEvent`, `AppointmentCancelledEvent`, etc.) can populate a materialized read database (e.g. Redis, MongoDB, or PostgreSQL JSONB views).
- **Zero Handler Modification**: Query handlers delegate to `CalendarReadRepository` without changing query signatures, DTO contracts, or frontend integrations.

---

## 2. Consequences

### Positive

- **Guaranteed Consistency**: Front-desk operations receive immediate, accurate read results without stale window delays in Phase 1.
- **Zero Side-Effects**: All read queries execute deterministically without mutating aggregate roots or persisting domain state.
- **Architectural Flexibility**: Pluggable `CalendarReadRepository` port provides a seamless upgrade path to distributed, asynchronous event-driven read stores when throughput demands increase.

### Negative / Trade-offs

- **In-Memory Computation**: Synchronous grid computation scales with the number of appointments in the queried date window. Range queries must specify bounded start and end timestamps.
