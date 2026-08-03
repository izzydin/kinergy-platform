# Scheduling Bounded Context - Aggregate Boundary & State Diagrams

## 1. Overview

The Scheduling Bounded Context consists of three distinct, decoupled Aggregate Roots:

1. `Appointment`
2. `TherapistSchedule`
3. `Room`

Each aggregate operates as an independent transactional boundary with its own identity, versioning, and emitted domain events.

---

## 2. Aggregate Boundaries Diagram

```mermaid
graph TD
    subgraph Scheduling Bounded Context
        subgraph Appointment Aggregate Boundary
            A["Appointment Root (ID)"]
            A1["TimeSlot Value Object"]
            A2["AppointmentStatus Enum"]
            A --> A1
            A --> A2
        end

        subgraph TherapistSchedule Aggregate Boundary
            TS["TherapistSchedule Root (ID)"]
            TS1["WorkingHours Entity[]"]
            TS2["TimeOff Entity[]"]
            TS --> TS1
            TS --> TS2
        end

        subgraph Room Aggregate Boundary
            R["Room Root (ID)"]
            R1["RoomName Value Object"]
            R2["RoomCapacity Value Object"]
            R --> R1
            R --> R2
        end
    end

    %% Event-driven relationships
    A -. Emits Event .-> E1["AppointmentBookedEvent"]
    A -. Emits Event .-> E2["AppointmentRescheduledEvent"]
    TS -. Emits Event .-> E3["ScheduleUpdatedEvent"]
    R -. Emits Event .-> E4["RoomMaintenanceScheduledEvent"]
```

---

## 3. Appointment Lifecycle State Diagram

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED: Book Appointment
    SCHEDULED --> CONFIRMED: Confirm Booking
    SCHEDULED --> CANCELLED: Cancel Appointment
    CONFIRMED --> CANCELLED: Cancel Appointment
    CONFIRMED --> COMPLETED: Complete Session
    SCHEDULED --> NO_SHOW: Mark No-Show
    CONFIRMED --> NO_SHOW: Mark No-Show
    CANCELLED --> [*]
    COMPLETED --> [*]
    NO_SHOW --> [*]
```

---

## 4. Double-Booking Prevention & Domain Coordination

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant AppService as Scheduling Application Service
    participant RoomAgg as Room Aggregate
    participant SchedAgg as TherapistSchedule Aggregate
    participant ApptAgg as Appointment Aggregate
    participant Clock as Clock Port

    Client->>AppService: ScheduleAppointment(therapistId, roomId, slot)
    AppService->>Clock: now()
    AppService->>RoomAgg: CheckRoomAvailability(roomId, slot)
    AppService->>SchedAgg: CheckTherapistAvailability(therapistId, slot)
    alt Available
        AppService->>ApptAgg: Create(clientId, therapistId, roomId, slot)
        AppService-->>Client: AppointmentScheduledResponse
    else Overlapping Slot / Maintenance
        AppService-->>Client: ConflictException (409)
    end
```
