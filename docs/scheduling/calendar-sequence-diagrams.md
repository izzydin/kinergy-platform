# Scheduling Bounded Context — Calendar Sequence Diagrams

This document contains Mermaid sequence diagrams illustrating calendar query execution flows and grid projection engines.

---

## 1. Reception Dashboard Query Execution Flow

```mermaid
sequenceDiagram
    autonumber
    actor Receptionist as Reception Staff / UI
    participant Handler as GetReceptionDashboardHandler
    participant ApptRepo as AppointmentRepository
    participant RoomRepo as RoomRepository
    participant Clock as Clock (System/Test)
    participant Mapper as CalendarGridMapper

    Receptionist->>Handler: execute(GetReceptionDashboardQuery)
    Handler->>Clock: today()
    Clock-->>Handler: todayStart Date (00:00:00.000 UTC)
    Handler->>ApptRepo: findAppointmentsByRange(dayRange)
    ApptRepo-->>Handler: Appointment[]
    Handler->>RoomRepo: findAll()
    RoomRepo-->>Handler: Room[]
    Handler->>Mapper: mapGridSlots({ date, appointments })
    Mapper-->>Handler: CalendarSlotDTO[]
    Handler->>Clock: now()
    Clock-->>Handler: currentNow Date
    Note over Handler: Tags operational status (PAST, CURRENT_NOW, UPCOMING)<br/>Calculates countersByStatus<br/>Filters pendingCheckIns (<= 15 mins)<br/>Filters activeInProgress<br/>Computes roomUtilizationRates<br/>Generates operationalAlerts
    Handler-->>Receptionist: ApplicationResult.ok(ReceptionDashboardDTO)
```

---

## 2. Daily Agenda Grid Computation & Projection Flow

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Staff / Calendar UI
    participant Handler as GetDailyAgendaHandler
    participant Projection as CalendarProjectionService
    participant ApptRepo as AppointmentRepository
    participant Clock as Clock (System/Test)
    participant Mapper as CalendarGridMapper

    Staff->>Handler: execute(GetDailyAgendaQuery)
    Handler->>Projection: fetchAndProjectDailyAgenda(date, therapistId, roomId, timezone)
    Projection->>ApptRepo: findAppointmentsByRange(range, filters)
    ApptRepo-->>Projection: Appointment[]
    Projection->>Mapper: mapGridSlots({ date, appointments, therapistId, roomId })
    Mapper->>Mapper: computeConflicts(slots)
    Note over Mapper: Evaluates concurrent appointments<br/>Sets hasConflict & overlapCount
    Mapper-->>Projection: CalendarSlotDTO[] (with conflict markers)
    Projection->>Clock: now()
    Clock-->>Projection: currentNow Date
    Note over Projection: Tags slots with PAST, CURRENT_NOW, UPCOMING<br/>Computes totalAppointments & summaryByStatus<br/>Groups appointmentsByTherapist & appointmentsByRoom
    Projection-->>Handler: DailyAgendaDTO
    Handler-->>Staff: ApplicationResult.ok(DailyAgendaDTO)
```

---

## 3. Weekly Agenda Projection & Date Normalization Flow

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Staff / Calendar UI
    participant Handler as GetWeeklyAgendaHandler
    participant Projection as CalendarProjectionService
    participant ApptRepo as AppointmentRepository

    Staff->>Handler: execute(GetWeeklyAgendaQuery)
    Note over Handler: normalizeToStartOfWeek(startDate)<br/>Calculates Monday 00:00:00.000 UTC
    Handler->>Projection: fetchAndProjectWeeklyAgenda(normalizedStart, therapistId, roomId, timezone)
    Projection->>ApptRepo: findAppointmentsByRange(7-day range, filters)
    ApptRepo-->>Projection: Appointment[]
    loop Day 0 to Day 6
        Projection->>Projection: projectDailyAgenda(currentDay)
    end
    Note over Projection: Compiles 7 DailyAgendaDTOs<br/>Calculates weekly totalAppointments
    Projection-->>Handler: WeeklyAgendaDTO
    Handler-->>Staff: ApplicationResult.ok(WeeklyAgendaDTO)
```
