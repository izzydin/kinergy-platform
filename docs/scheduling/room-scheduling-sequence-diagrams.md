# Room Scheduling Sequence Diagrams

This document contains end-to-end Mermaid sequence diagrams for all primary room and resource scheduling workflows.

---

## 1. Reserve Room (Create Appointment with Room Assignment)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Receptionist / Client
    participant API as AppointmentsController
    participant Handler as CreateAppointmentHandler
    participant CDS as ConflictDetectionService
    participant RAE as RoomAvailabilityEvaluator
    participant ApptRepo as AppointmentRepository
    participant RoomRepo as RoomRepository
    participant Appt as Appointment Aggregate

    Client->>API: POST /api/v1/scheduling/appointments (clientId, therapistId, roomId, type, startTime, endTime)
    API->>Handler: execute(CreateAppointmentCommand)
    Handler->>CDS: detectConflicts(therapistId, roomId, clientId, requestedRange, type)
    CDS->>RoomRepo: findById(roomId)
    RoomRepo-->>CDS: Room Aggregate
    CDS->>ApptRepo: findAppointmentsForRoom(roomId, queryRange)
    ApptRepo-->>CDS: Existing Appointments
    CDS->>RAE: evaluate(room, existingAppointments, requestedRange, buffer)
    RAE-->>CDS: { isAvailable: true }
    CDS-->>Handler: conflicts: [] (No conflicts)
    Handler->>Appt: Appointment.create({ clientId, therapistId, roomId, type, timeRange })
    Appt-->>Handler: appointment (status: SCHEDULED)
    Handler->>ApptRepo: save(appointment)
    ApptRepo-->>Handler: Saved
    Handler-->>API: ApplicationResult.ok(AppointmentDTO)
    API-->>Client: HTTP 201 Created (AppointmentDTO)
```

---

## 2. Check Room Availability

```mermaid
sequenceDiagram
    autonumber
    actor User as Receptionist / Patient
    participant API as RoomsController
    participant Handler as CheckRoomAvailabilityHandler
    participant RoomRepo as RoomRepository
    participant ApptRepo as AppointmentRepository
    participant RAE as RoomAvailabilityEvaluator

    User->>API: GET /api/v1/scheduling/rooms/:id/availability?startTime=...&endTime=...
    API->>Handler: execute(CheckRoomAvailabilityQuery)
    Handler->>RoomRepo: findById(roomId)
    RoomRepo-->>Handler: Room Aggregate
    Handler->>ApptRepo: findAppointmentsForRoom(roomId, requestedRange)
    ApptRepo-->>Handler: Existing Room Appointments
    Handler->>RAE: evaluate(room, appointments, requestedRange)
    RAE-->>Handler: { isAvailable: true / false, reason?: string }
    Handler-->>API: ApplicationResult.ok(RoomAvailabilityResponseDto)
    API-->>User: HTTP 200 OK ({ isAvailable: true, conflicts: [] })
```

---

## 3. Schedule Maintenance Window

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Clinic Admin
    participant API as RoomsController
    participant Handler as ScheduleMaintenanceHandler
    participant RoomRepo as RoomRepository
    participant Room as Room Aggregate

    Admin->>API: POST /api/v1/scheduling/rooms/:id/maintenance (startTime, endTime, reason, expectedVersion)
    API->>Handler: execute(ScheduleMaintenanceCommand)
    Handler->>RoomRepo: findById(roomId)
    RoomRepo-->>Handler: Room Aggregate (version: N)
    Handler->>Room: scheduleMaintenance(timeRange, reason, expectedVersion)
    Room->>Room: Verify expectedVersion == N
    Room->>Room: Check internal maintenance overlap
    Room->>Room: Append MaintenanceWindow & increment version (N+1)
    Handler->>RoomRepo: save(Room)
    RoomRepo-->>Handler: Persistence complete
    Handler-->>API: ApplicationResult.ok(RoomDto)
    API-->>Admin: HTTP 201 Created (RoomDto)
```

---

## 4. Appointment Rescheduling with Room Change

```mermaid
sequenceDiagram
    autonumber
    actor User as Receptionist
    participant API as AppointmentsController
    participant Handler as RescheduleAppointmentHandler
    participant ApptRepo as AppointmentRepository
    participant CDS as ConflictDetectionService
    participant Appt as Appointment Aggregate

    User->>API: POST /api/v1/scheduling/appointments/:id/reschedule (newStartTime, newEndTime, newRoomId, expectedVersion)
    API->>Handler: execute(RescheduleAppointmentCommand)
    Handler->>ApptRepo: findById(appointmentId)
    ApptRepo-->>Handler: Appointment Aggregate (Room A, version: N)
    Handler->>CDS: detectConflicts(therapistId, newRoomId, clientId, newRange, excludeAppointmentId)
    CDS-->>Handler: conflicts: [] (Target Room B is available)
    Handler->>Appt: reschedule(newRange, newRoomId, expectedVersion)
    Appt->>Appt: Verify expectedVersion == N
    Appt->>Appt: Update timeRange, set roomId = Room B, increment version (N+1)
    Handler->>ApptRepo: save(Appointment)
    ApptRepo-->>Handler: Persistence complete (Room A slot released, Room B slot claimed)
    Handler-->>API: ApplicationResult.ok(AppointmentDTO)
    API-->>User: HTTP 200 OK (AppointmentDTO)
```

---

## 5. Concurrent Room Reservation (Race Condition Resolution)

```mermaid
sequenceDiagram
    autonumber
    actor User1 as User 1 (Client A)
    actor User2 as User 2 (Client B)
    participant Handler as CreateAppointmentHandler
    participant CDS as ConflictDetectionService
    participant DB as Postgres Database (Prisma)

    par Transaction 1 (User 1)
        User1->>Handler: CreateAppointment(Room 1, 10:00-11:00)
        Handler->>CDS: detectConflicts(Room 1, 10:00-11:00)
        CDS->>DB: Query existing active bookings for Room 1
        DB-->>CDS: 0 existing bookings
        CDS-->>Handler: 0 conflicts (Allowed)
        Handler->>DB: INSERT into appointments (Room 1, 10:00-11:00)
        DB-->>Handler: Insert committed
        Handler-->>User1: HTTP 201 Created (Appointment 1 booked)
    and Transaction 2 (User 2)
        User2->>Handler: CreateAppointment(Room 1, 10:30-11:30)
        Handler->>CDS: detectConflicts(Room 1, 10:30-11:30)
        CDS->>DB: Query existing active bookings for Room 1
        DB-->>CDS: Found Appointment 1 (10:00-11:00)
        CDS-->>Handler: 1 Conflict: Room double-booking on Room 1
        Handler-->>User2: HTTP 409 Conflict (AppointmentConflictException)
    end
```
