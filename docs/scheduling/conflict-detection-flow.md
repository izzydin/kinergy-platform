# 4D Conflict Detection Matrix & Decision Tree

## Overview

The `ConflictDetectionService` executes multi-dimensional matrix checks across Therapist, Room, Client, and Clinic Calendar vectors to guarantee zero double-bookings or resource violations bypass system persistence.

---

## 4D Conflict Matrix Categories

| Vector              | Conflict Category          | Trigger Condition                                                                         | Exception / Returned Category                                |
| :------------------ | :------------------------- | :---------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| **Clinic Calendar** | `HOLIDAY`, `WORKING_HOURS` | Requested slot falls on public holiday or outside facility hours                          | `SchedulingConflict(category: 'HOLIDAY' \| 'WORKING_HOURS')` |
| **Therapist**       | `THERAPIST`, `VACATION`    | Therapist schedule missing, on vacation/break, or has overlapping buffered booking        | `SchedulingConflict(category: 'THERAPIST' \| 'VACATION')`    |
| **Room**            | `ROOM`                     | Room is under MAINTENANCE/UNAVAILABLE, capacity insufficient, missing features, or booked | `SchedulingConflict(category: 'ROOM')`                       |
| **Client**          | `CLIENT`                   | Client already has an active non-terminal appointment during candidate interval           | `SchedulingConflict(category: 'CLIENT')`                     |

---

## Conflict Detection Decision Tree Flowchart

```mermaid
graph TD
    Start["Conflict Detection Request"] --> Step1{"Check Clinic Open & Holidays"}
    Step1 -- Closed / Holiday --> Err1["Push HOLIDAY / WORKING_HOURS Conflict"]
    Step1 -- Open --> Step2["Fetch Turnaround Buffer via Policy"]

    Step2 --> Step3["Fetch Therapist Schedule & Appointments"]
    Step3 --> Step4{"Evaluate Therapist Schedule"}
    Step4 -- Vacation --> Err2["Push VACATION Conflict"]
    Step4 -- Unavailable / Break / Overlap --> Err3["Push THERAPIST Conflict"]
    Step4 -- Available --> Step5["Fetch Room & Room Appointments"]

    Step5 --> Step6{"Evaluate Room Availability"}
    Step6 -- Maintenance / Capacity / Features / Overlap --> Err4["Push ROOM Conflict"]
    Step6 -- Available --> Step7["Fetch Client Appointments"]

    Step7 --> Step8{"Evaluate Client Availability"}
    Step8 -- Active Overlap --> Err5["Push CLIENT Conflict"]
    Step8 -- Clear --> EndCheck{"Any Conflicts Recorded?"}

    Err1 --> EndCheck
    Err2 --> EndCheck
    Err3 --> EndCheck
    Err4 --> EndCheck
    Err5 --> EndCheck

    EndCheck -- Yes --> ThrowEx["Throw AppointmentConflictException(conflicts)"]
    EndCheck -- No --> Proceed["Return Empty Conflicts Array (Valid Booking)"]
```

---

## Exception Protocol & Self-Exclusion

### 1. Structured Diagnostics

When conflicts exist, command handlers abort transactions and throw `AppointmentConflictException` containing array of `SchedulingConflict` value objects:

```typescript
export interface SchedulingConflictProps {
  readonly conflictType: ConflictType; // 'THERAPIST' | 'ROOM' | 'CLIENT' | 'HOLIDAY' | 'BUFFER'
  readonly conflictingEntityId: string;
  readonly requestedRange: TimeRange;
  readonly reason: string;
  readonly suggestedAlternativeRange?: TimeRange;
}
```

### 2. Self-Exclusion for Rescheduling

During appointment update and reschedule commands, the aggregate being modified passes `ignoreAppointmentId: appointment.id.getValue()` to ensure the current appointment slot is excluded from overlap calculations.
