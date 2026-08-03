# Application Layer Sequence Diagrams

## 1. Appointment Creation & Conflict Check Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Handler as CreateAppointmentHandler
    participant Idempotency as BookingIdempotencyPolicy
    participant WindowPolicy as BookingWindowPolicy
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant EventBus as EventPublisher

    Client/Reception->>Handler: execute(CreateAppointmentCommand)
    Handler->>Idempotency: checkAndRecord(requestToken)
    alt Duplicate Request
        Idempotency-->>Handler: False (Duplicate)
        Handler-->>Client/Reception: ApplicationResult.fail("Duplicate request")
    end

    Handler->>WindowPolicy: validateBookingWindow(startTime, clock)
    alt Invalid Window
        WindowPolicy-->>Handler: False
        Handler-->>Client/Reception: ApplicationResult.fail("Outside booking window")
    end

    Handler->>ConflictService: detectConflicts(therapistId, roomId, clientId, range)
    alt Conflict Detected
        ConflictService-->>Handler: [SchedulingConflict(THERAPIST/ROOM/CLIENT)]
        Handler-->>Client/Reception: Throws AppointmentConflictException
    end

    Handler->>ApptRepo: save(new Appointment)
    ApptRepo-->>Handler: Promise<void>
    Handler->>EventBus: publish(AppointmentCreatedEvent)
    Handler-->>Client/Reception: ApplicationResult.ok(AppointmentDTO)
```

---

## 2. Reception Desk Check-In & Completion Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Receptionist
    actor Therapist
    participant CheckInH as CheckInAppointmentHandler
    participant CompleteH as CompleteAppointmentHandler
    participant ApptRepo as AppointmentRepository
    participant EventBus as EventPublisher

    Receptionist->>CheckInH: execute(CheckInAppointmentCommand)
    CheckInH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>CheckInH: Appointment aggregate
    CheckInH->>CheckInH: assert expectedVersion === appt.version
    CheckInH->>CheckInH: appt.checkIn(clock)
    CheckInH->>ApptRepo: save(appt)
    CheckInH->>EventBus: publish(AppointmentCheckedInEvent)
    CheckInH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)

    Note over Therapist, ApptRepo: Therapist starts session -> appt.start(clock)

    Therapist->>CompleteH: execute(CompleteAppointmentCommand)
    CompleteH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>CompleteH: Appointment aggregate
    CompleteH->>CompleteH: assert expectedVersion === appt.version
    CompleteH->>CompleteH: appt.complete(clock)
    CompleteH->>ApptRepo: save(appt)
    CompleteH->>EventBus: publish(AppointmentCompletedEvent)
    CompleteH-->>Therapist: ApplicationResult.ok(AppointmentDTO)
```

---

## 3. Reschedule & Resource Reassignment Execution Flow

```mermaid
sequenceDiagram
    autonumber
    actor Receptionist
    participant RescheduleH as RescheduleAppointmentHandler
    participant AssignRoomH as AssignRoomHandler
    participant Policy as ReschedulePolicy
    participant RoomSpec as RoomAvailabilitySpecification
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant RoomRepo as RoomRepository

    Receptionist->>RescheduleH: execute(RescheduleAppointmentCommand)
    RescheduleH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>RescheduleH: Appointment aggregate
    RescheduleH->>Policy: validateRescheduleNotice(appt, newRange, clock)
    RescheduleH->>ConflictService: detectConflicts(...)
    RescheduleH->>RescheduleH: appt.reschedule(newRange, clock)
    RescheduleH->>ApptRepo: save(appt)
    RescheduleH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)

    Receptionist->>AssignRoomH: execute(AssignRoomCommand)
    AssignRoomH->>ApptRepo: findById(appointmentId)
    AssignRoomH->>RoomRepo: findById(newRoomId)
    AssignRoomH->>RoomSpec: isSatisfiedBy(room, requiredCapacity, features)
    AssignRoomH->>ConflictService: detectConflicts(...)
    AssignRoomH->>AssignRoomH: appt.assignRoom(newRoomId, clock)
    AssignRoomH->>ApptRepo: save(appt)
    AssignRoomH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)
```
