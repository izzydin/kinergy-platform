# Appointment Lifecycle & State Machine Specification

## Executive Summary

The `Appointment` aggregate root governs the state lifecycle of all client therapy sessions within the Scheduling Bounded Context. Lifecycle transitions enforce domain invariants across booking, confirmation, operational check-in, session execution, completion, cancellation, and no-show management.

---

## Table of Contents

- [State Transition Matrix](#state-transition-matrix)
- [Terminal State Invariants](#terminal-state-invariants)
- [Concurrency & Optimistic Locking](#concurrency--optimistic-locking)
- [Domain Events Emitted](#domain-events-emitted)

---

## State Transition Matrix

The `AppointmentStatus` enumeration supports seven explicit lifecycle states:

| Source State  | Allowed Target State | Trigger Method                            | Mandatory Guard Invariants                                                    |
| :------------ | :------------------- | :---------------------------------------- | :---------------------------------------------------------------------------- |
| `SCHEDULED`   | `CONFIRMED`          | `appointment.confirm(clock)`              | Must be in `SCHEDULED` or `RESCHEDULED` status.                               |
| `SCHEDULED`   | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Must be in `SCHEDULED`, `CONFIRMED`, or `RESCHEDULED` status.                 |
| `SCHEDULED`   | `RESCHEDULED`        | `appointment.reschedule(newRange, clock)` | Advance notice and maximum reschedule count policies satisfied.               |
| `SCHEDULED`   | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Cancellation reason required. Advance notice policy evaluated.                |
| `SCHEDULED`   | `NO_SHOW`            | `appointment.markNoShow(clock, reason?)`  | Scheduled session start time must have elapsed.                               |
| `CONFIRMED`   | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Client arrived at clinic reception desk.                                      |
| `CONFIRMED`   | `RESCHEDULED`        | `appointment.reschedule(newRange, clock)` | Advance notice policies satisfied.                                            |
| `CONFIRMED`   | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Reason required.                                                              |
| `CONFIRMED`   | `NO_SHOW`            | `appointment.markNoShow(clock, reason?)`  | Session time elapsed without client arrival.                                  |
| `RESCHEDULED` | `CONFIRMED`          | `appointment.confirm(clock)`              | Client re-confirms rescheduled session time.                                  |
| `RESCHEDULED` | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Client arrived at clinic for rescheduled session.                             |
| `RESCHEDULED` | `RESCHEDULED`        | `appointment.reschedule(newRange, clock)` | Advance notice policies satisfied.                                            |
| `RESCHEDULED` | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Reason required.                                                              |
| `RESCHEDULED` | `NO_SHOW`            | `appointment.markNoShow(clock, reason?)`  | Rescheduled session time elapsed without arrival.                             |
| `CHECKED_IN`  | `IN_PROGRESS`        | `appointment.start(clock)`                | Therapist/room initialized for session.                                       |
| `CHECKED_IN`  | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Operational cancellation prior to session start.                              |
| `IN_PROGRESS` | `COMPLETED`          | `appointment.complete(clock)`             | Session execution completed.                                                  |
| `COMPLETED`   | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |
| `CANCELLED`   | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |
| `NO_SHOW`     | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |

---

## Terminal State Invariants

`COMPLETED`, `CANCELLED`, and `NO_SHOW` are strictly **terminal states**. Once an appointment enters a terminal state:

1. No further state transitions are permitted (`isTerminalState === true`).
2. Re-assignment of human resources (`therapistId`) or physical assets (`roomId`) throws `InvalidStateTransitionException`.
3. Rescheduling or editing session duration throws `InvalidStateTransitionException`.
4. Operational notes may still be appended via `addNote()` for clinical/reception audit records.

---

## Concurrency & Optimistic Locking

All state mutations increment the aggregate root `version` integer:

```typescript
this._version += 1;
this._updatedAt = clock.now();
```

Every application command handler enforces optimistic concurrency matching `command.expectedVersion === appointment.version`. If versions mismatch, execution returns `ApplicationResult.fail("Concurrency version mismatch")`.

---

## Domain Events Emitted

Each lifecycle transition records an uncommitted domain event:

- `SCHEDULED` $\rightarrow$ `AppointmentCreatedEvent`
- `CHECKED_IN` $\rightarrow$ `AppointmentCheckedInEvent`
- `COMPLETED` $\rightarrow$ `AppointmentCompletedEvent`
- `CANCELLED` $\rightarrow$ `AppointmentCancelledEvent`
- `NO_SHOW` $\rightarrow$ `AppointmentNoShowEvent`
- `reschedule()` $\rightarrow$ `AppointmentRescheduledEvent`
