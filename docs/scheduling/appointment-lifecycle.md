# Appointment Lifecycle & State Machine Specification

## 1. Overview

The `Appointment` aggregate root governs the state lifecycle of all client therapy sessions within the Scheduling Bounded Context. Lifecycle transitions enforce domain invariants across booking, confirmation, operational check-in, session execution, completion, cancellation, and no-show management.

---

## 2. State Transition Matrix

The `AppointmentStatus` enumeration supports seven explicit lifecycle states:

| Source State  | Allowed Target State | Trigger Method                            | Mandatory Guard Invariants                                                    |
| :------------ | :------------------- | :---------------------------------------- | :---------------------------------------------------------------------------- |
| `SCHEDULED`   | `CONFIRMED`          | `appointment.confirm(clock)`              | Must be in `SCHEDULED` status.                                                |
| `SCHEDULED`   | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Must be in `SCHEDULED` or `CONFIRMED` status.                                 |
| `SCHEDULED`   | `RESCHEDULED`        | `appointment.reschedule(newRange, clock)` | Advance notice and maximum reschedule count policies satisfied.               |
| `SCHEDULED`   | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Cancellation reason required. Advance notice policy evaluated.                |
| `SCHEDULED`   | `NO_SHOW`            | `appointment.markNoShow(clock, reason?)`  | Scheduled session start time must have elapsed.                               |
| `CONFIRMED`   | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Client arrived at clinic reception desk.                                      |
| `CONFIRMED`   | `RESCHEDULED`        | `appointment.reschedule(newRange, clock)` | Advance notice policies satisfied.                                            |
| `CONFIRMED`   | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Reason required.                                                              |
| `CONFIRMED`   | `NO_SHOW`            | `appointment.markNoShow(clock, reason?)`  | Session time elapsed without client arrival.                                  |
| `CHECKED_IN`  | `IN_PROGRESS`        | `appointment.start(clock)`                | Therapist/room initialized for session.                                       |
| `CHECKED_IN`  | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Operational cancellation prior to session start.                              |
| `IN_PROGRESS` | `COMPLETED`          | `appointment.complete(clock)`             | Session execution completed.                                                  |
| `RESCHEDULED` | `CONFIRMED`          | `appointment.confirm(clock)`              | Rescheduled session confirmed.                                                |
| `RESCHEDULED` | `CHECKED_IN`         | `appointment.checkIn(clock)`              | Client check-in on rescheduled session.                                       |
| `RESCHEDULED` | `CANCELLED`          | `appointment.cancel(reason, clock)`       | Rescheduled session cancelled.                                                |
| `COMPLETED`   | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |
| `CANCELLED`   | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |
| `NO_SHOW`     | _None (Terminal)_    | N/A                                       | Immutable state. Aggregate mutations throw `InvalidStateTransitionException`. |

---

## 3. Terminal State Invariants

`COMPLETED`, `CANCELLED`, and `NO_SHOW` are strictly **terminal states**. Once an appointment enters a terminal state:

1. No further state transitions are permitted (`isTerminalState === true`).
2. Re-assignment of human resources (`therapistId`) or physical assets (`roomId`) throws error.
3. Rescheduling or editing session duration throws error.
4. Operational notes may still be appended for clinical/reception audit records.

---

## 4. Concurrency & Versioning

All state mutations increment the aggregate root `version` integer:

```typescript
this._version += 1;
this._updatedAt = clock.now();
```

Every application command handler enforces optimistic concurrency matching `command.expectedVersion === appointment.version`. If versions mismatch, execution returns `ApplicationResult.fail("Concurrency version mismatch")`.

---

## 5. Domain Events Emitted

Each lifecycle transition records an uncommitted domain event:

- `SCHEDULED` $\rightarrow$ `AppointmentCreatedEvent`
- `CONFIRMED` $\rightarrow$ `AppointmentConfirmedEvent` / Aggregate mutation
- `CHECKED_IN` $\rightarrow$ `AppointmentCheckedInEvent`
- `IN_PROGRESS` $\rightarrow$ Aggregate mutation
- `COMPLETED` $\rightarrow$ `AppointmentCompletedEvent`
- `CANCELLED` $\rightarrow$ `AppointmentCancelledEvent`
- `NO_SHOW` $\rightarrow$ `AppointmentNoShowEvent`
- `RESCHEDULED` $\rightarrow$ `AppointmentRescheduledEvent`
