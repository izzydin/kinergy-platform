# ADR-0046: TreatmentSession Lifecycle State Machine & Transition Specification

- **Status**: Accepted
- **Date**: 2026-08-15
- **Context**: As part of Phase 4 (Kinesiology), clinical therapy encounters must progress through a deterministic, auditable lifecycle. A rigorous domain state machine is required to govern clinical encounters from initial scheduling to completion or cancellation, prevent premature session completion, protect terminal state immutability, enforce aggregate authority, and eliminate status mutation leaks across presentation or persistence layers.

---

## 1. Context & Problem Statement

In clinical kinesiology practice:

1. **Deterministic Encounter Progression**: A clinical encounter must follow real-world therapy workflow: it must be scheduled, explicitly started by the therapist, and then formally completed.
2. **Prevention of Premature Completion**: Allowing direct transitions from `SCHEDULED` to `COMPLETED` bypasses essential clinical start validations and risks invalid clinical documentation.
3. **Terminal State Integrity**: Completed, cancelled, or no-show clinical records must be immutable in their lifecycle status to preserve medical auditability and prevent accidental status reactivation.
4. **Aggregate Authority**: Lifecycle validation rules must live exclusively inside the `TreatmentSession` aggregate root, rather than being scattered across UI components, NestJS guards, DTO validation pipes, or database triggers.

---

## 2. Architectural Decision

The Kinergy platform establishes an authoritative, deterministic finite state machine inside the `TreatmentSession` aggregate root.

### 2.1 Canonical Statuses

The `TreatmentSession` lifecycle consists of exactly 5 canonical statuses:

| Status            | Business Definition & Clinical Meaning                                                            |
| :---------------- | :------------------------------------------------------------------------------------------------ |
| **`SCHEDULED`**   | The treatment session exists and is expected to occur (Initial state upon creation).              |
| **`IN_PROGRESS`** | The therapist has formally started the clinical treatment encounter.                              |
| **`COMPLETED`**   | The treatment session has reached its normal clinical conclusion (Terminal state).                |
| **`CANCELLED`**   | The scheduled session will not occur because it was cancelled prior to starting (Terminal state). |
| **`NO_SHOW`**     | The scheduled session did not occur because the client did not attend (Terminal state).           |

### 2.2 Valid State Machine Diagram

```text
       ┌──────────────┐
       │  SCHEDULED   │ (Initial State)
       └──────┬───────┘
         │    │    │
  start()│    │    │ cancel(reason) / markAsNoShow()
         ▼    ▼    ▼
 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
 │ IN_PROGRESS │ │  CANCELLED  │ │   NO_SHOW   │ (Terminal States)
 └──────┬──────┘ └─────────────┘ └─────────────┘
        │ complete()
        ▼
 ┌─────────────┐
 │  COMPLETED  │ (Terminal State)
 └─────────────┘
```

### 2.3 Authoritative State Transition Matrix

| Current State | Operation                 | Next State    | Allowed? | Invariant Rule / Exception                                     |
| :------------ | :------------------------ | :------------ | :------: | :------------------------------------------------------------- |
| `SCHEDULED`   | `start(clock?)`           | `IN_PROGRESS` | **YES**  | Valid start of session.                                        |
| `SCHEDULED`   | `cancel(reason?, clock?)` | `CANCELLED`   | **YES**  | Valid cancellation prior to start.                             |
| `SCHEDULED`   | `markAsNoShow(clock?)`    | `NO_SHOW`     | **YES**  | Valid no-show marking prior to start.                          |
| `IN_PROGRESS` | `complete(clock?)`        | `COMPLETED`   | **YES**  | Normal clinical session conclusion.                            |
| `SCHEDULED`   | `complete(...)`           | —             |  **NO**  | Throws `InvalidSessionTransitionException`.                    |
| `IN_PROGRESS` | `start(...)`              | —             |  **NO**  | Throws `InvalidSessionTransitionException`.                    |
| `IN_PROGRESS` | `cancel(...)`             | —             |  **NO**  | Throws `InvalidSessionTransitionException`.                    |
| `IN_PROGRESS` | `markAsNoShow(...)`       | —             |  **NO**  | Throws `InvalidSessionTransitionException`.                    |
| `COMPLETED`   | _Any Transition_          | —             |  **NO**  | Strictly Terminal. Throws `InvalidSessionTransitionException`. |
| `CANCELLED`   | _Any Transition_          | —             |  **NO**  | Strictly Terminal. Throws `InvalidSessionTransitionException`. |
| `NO_SHOW`     | _Any Transition_          | —             |  **NO**  | Strictly Terminal. Throws `InvalidSessionTransitionException`. |

---

## 3. Invariants & Implementation Guarantees

1. **Domain Aggregate Authority**:
   - The `TreatmentSession` aggregate root is the sole authority over lifecycle transitions.
   - Controllers, DTOs, application services, and database repositories cannot bypass or override transition rules.
2. **Zero Generic Setters**:
   - `TreatmentSession` exposes strictly behavior-oriented methods (`start()`, `complete()`, `cancel()`, `markAsNoShow()`).
   - Generic setters (`setStatus`, `changeStatus`, `updateStatus`) are strictly prohibited.
3. **No Direct `SCHEDULED` $\to$ `COMPLETED` Transition**:
   - A clinical session must be transitioned to `IN_PROGRESS` before it can reach `COMPLETED`.
4. **Terminal State Immutability**:
   - `COMPLETED`, `CANCELLED`, and `NO_SHOW` are permanently terminal. Reopening or un-cancelling a session within the aggregate is forbidden.
5. **Deterministic Error Handling**:
   - All invalid lifecycle transitions throw `InvalidSessionTransitionException` containing `fromStatus`, `toStatus`, and a descriptive message.

---

## 4. Consequences

### Positive

- **Predictable & Robust Domain Behavior**: Eliminates corrupt or impossible session states across the platform.
- **Medical Audit Compliance**: Guarantees that clinical records cannot be completed without being started, and terminal records cannot be overwritten.
- **Clear Architectural Boundaries**: Keeps lifecycle invariant logic encapsulated inside the domain aggregate, preventing logic leakage into application or presentation layers.

### Negative / Trade-offs

- **Reopening Requires Deliberate Future Design**: If a business workflow in the future requires session reopening or amendments, it must be introduced as an explicit domain event / correction mechanism rather than arbitrary status overwriting.

---

## 5. References

- [`docs/architecture/contexts/kinesiology.md`](file:///c:/Projects/kinergy-platform/docs/architecture/contexts/kinesiology.md)
- [`packages/core/src/kinesiology/domain/treatment-session/treatment-session.aggregate.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/kinesiology/domain/treatment-session/treatment-session.aggregate.ts)
- [`packages/core/src/kinesiology/domain/exceptions/invalid-session-transition.exception.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/kinesiology/domain/exceptions/invalid-session-transition.exception.ts)
