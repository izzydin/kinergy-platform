# Scheduling Bounded Context — CQRS Read-Side Query Architecture

## 1. Overview & Architectural Principles

The Scheduling Bounded Context enforces a strict **CQRS (Command Query Responsibility Segregation)** pattern:

- **Command Side**: Employs DDD Aggregate Roots (`Appointment`, `TherapistSchedule`, `Room`) to validate invariants and execute state transitions, recording Domain Events (`AppointmentCreatedEvent`, `AppointmentCheckedInEvent`, etc.).
- **Query Side**: Employs side-effect-free Query Handlers, `CalendarGridMapper`, and `CalendarProjectionService` to return structured read-model DTOs (`DailyAgendaDTO`, `WeeklyAgendaDTO`, `ReceptionDashboardDTO`, etc.).

```text
               +----------------------------------+
               |        CQRS Read Requests        |
               +----------------------------------+
                                |
                                v
               +----------------------------------+
               |          Query Handlers          |
               +----------------------------------+
                     /                   \
                    /                     \
                   v                       v
      +------------------------+   +-----------------------------+
      | CalendarReadRepository |   |  CalendarProjectionService  |
      |   (Materialized Port)  |   |    + CalendarGridMapper     |
      +------------------------+   +-----------------------------+
                                                   |
                                                   v
                                   +-----------------------------+
                                   |    Domain Repositories &    |
                                   |       Injected Clock        |
                                   +-----------------------------+
```

---

## 2. Invariants & Execution Rules

1. **Zero State Mutation**: Query handlers must never execute `save()`, mutate aggregate roots, or trigger side-effects.
2. **Clock Injections**: All date computations and operational status tagging (`PAST`, `CURRENT_NOW`, `UPCOMING`) must use the injected `Clock` abstraction.
3. **Structured ApplicationResult**: Every query handler returns `Promise<ApplicationResult<T>>` to standardize error handling and success payloads across the application layer.

---

## 3. Query Inventory & Handlers

### 3.1 `GetTodaysAppointmentsQuery`

- **Query**: `GetTodaysAppointmentsQuery` (`{ therapistId?, roomId?, clientId? }`)
- **Handler**: `GetTodaysAppointmentsHandler`
- **Behavior**: Uses `Clock.today()` to query all appointments scheduled for the current operational day. Returns a light `CalendarSlotDTO[]` list tagged with real-time `operationalStatus`.

### 3.2 `GetDailyAgendaQuery`

- **Query**: `GetDailyAgendaQuery` (`{ date, therapistId?, roomId?, timezone? }`)
- **Handler**: `GetDailyAgendaHandler`
- **Behavior**: Projects a full `DailyAgendaDTO` with summary breakdowns, slots, and resource groupings by therapist and room.

### 3.3 `GetWeeklyAgendaQuery`

- **Query**: `GetWeeklyAgendaQuery` (`{ startDate, therapistId?, roomId?, timezone? }`)
- **Handler**: `GetWeeklyAgendaHandler`
- **Behavior**: Normalizes `startDate` to Monday 00:00:00.000 UTC start-of-week via `normalizeToStartOfWeek()`, returning a 7-day `WeeklyAgendaDTO`.

### 3.4 `GetTherapistCalendarQuery`

- **Query**: `GetTherapistCalendarQuery` (`{ therapistId, startTime, endTime, timezone? }`)
- **Handler**: `GetTherapistCalendarHandler`
- **Behavior**: Merges therapist shift rules (working hours, breaks, vacations, availability overrides) with assigned bookings into `TherapistCalendarDTO`.

### 3.5 `GetRoomCalendarQuery`

- **Query**: `GetRoomCalendarQuery` (`{ roomId, startTime, endTime, timezone? }`)
- **Handler**: `GetRoomCalendarHandler`
- **Behavior**: Fetches room capacity, status (`AVAILABLE`, `MAINTENANCE`), features, and assigned occupancy into `RoomCalendarDTO`.

### 3.6 `GetReceptionDashboardQuery`

- **Query**: `GetReceptionDashboardQuery` (`{ date? }`)
- **Handler**: `GetReceptionDashboardHandler`
- **Behavior**: Aggregates live status counters, pending check-ins starting in <= 15 minutes, active sessions, room occupancy rates, and actionable front-desk alerts into `ReceptionDashboardDTO`.

### 3.7 `GetUpcomingAppointmentsQuery`

- **Query**: `GetUpcomingAppointmentsQuery` (`{ limit?, therapistId?, roomId?, clientId? }`)
- **Handler**: `GetUpcomingAppointmentsHandler`
- **Behavior**: Returns the next `N` upcoming appointments starting from `Clock.now()`, sorted chronologically.

### 3.8 `GetClientHistoryQuery`

- **Query**: `GetClientHistoryQuery` (`{ clientId }`)
- **Handler**: `GetClientHistoryHandler`
- **Behavior**: Returns chronological appointment history for a client, calculating total bookings, completed count, cancelled count, no-show count, and attendance compliance rate.
