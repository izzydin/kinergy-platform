# ADR-003: CQRS Calendar Read Projections & Query Optimization Strategy

- **Status**: Accepted
- **Date**: 2026-08-03
- **Context**: Displaying interactive calendar views (day, week, month) across multiple therapists and rooms requires querying high volumes of booking intervals. Executing complex temporal join queries against write-optimized normalized aggregate tables causes high latency.

## Decision

We adopt a **CQRS (Command Query Responsibility Segregation)** pattern for calendar read models:

1. **Write Model**: Pure DDD Aggregate Roots (`Appointment`, `TherapistSchedule`, `Room`) enforce write invariants and emit domain events (`AppointmentCreatedEvent`, `AppointmentRescheduledEvent`, `AppointmentCancelledEvent`).
2. **Read Model (Calendar Projection)**: An asynchronous projection handler consumes domain events and updates a read-optimized, indexed projection table/store (e.g. PostgreSQL range types or Elasticsearch/Redis time-series index).
3. **Query Servicing**: Calendar UI queries fetch pre-indexed read models directly without instantiating domain aggregate roots.

## Consequences

### Positive

- Sub-millisecond calendar UI response times.
- Solves read/write performance tension.

### Negative / Trade-offs

- Eventual consistency delay (typically < 100ms) between write commit and read projection update.
