# Application Layer Command Execution Sequence Diagrams

## Executive Summary

This document presents the CQRS command execution sequence diagrams for appointment creation, check-in/completion operational workflows, and reschedule/resource reassignment execution flows.

---

## Table of Contents

- [1. Appointment Creation & Conflict Check Sequence](#1-appointment-creation--conflict-check-sequence)
- [2. Reception Desk Check-In & Completion Workflow](#2-reception-desk-check-in--completion-workflow)
- [3. Reschedule & Resource Reassignment Execution Flow](#3-reschedule--resource-reassignment-execution-flow)

---

## 1. Appointment Creation & Conflict Check Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Handler as CreateAppointmentHandler
    participant Idempotency as BookingIdempotencyPolicy
    participant DurationPolicy as DefaultAppointmentDurationPolicy
    participant WindowPolicy as BookingWindowPolicy
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant Clock as Clock

    Client/Reception->>Handler: execute(CreateAppointmentCommand)
    Handler->>Idempotency: registerRequest(requestToken)
    alt Duplicate Request Token
        Idempotency-->>Handler: false
        Handler-->>Client/Reception: ApplicationResult.fail("Duplicate request")
    end

    Handler->>DurationPolicy: validateDuration(apptType, duration)
    Handler->>WindowPolicy: validateBookingWindow(startTime, clock)
    alt Window Violation
        WindowPolicy-->>Handler: false
        Handler-->>Client/Reception: ApplicationResult.fail("Outside booking window")
    end

    Handler->>ConflictService: detectConflicts({ therapistId, roomId, clientId, requestedRange, appointmentType })
    alt Conflict Detected
        ConflictService-->>Handler: SchedulingConflict[]
        Handler-->>Client/Reception: throw AppointmentConflictException(conflicts)
    end

    Handler->>ApptRepo: save(new Appointment)
    ApptRepo-->>Handler: Promise<void>
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
    participant Clock as Clock

    Receptionist->>CheckInH: execute(CheckInAppointmentCommand)
    CheckInH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>CheckInH: Appointment aggregate
    CheckInH->>CheckInH: assert expectedVersion === appt.version
    CheckInH->>CheckInH: appt.checkIn(clock)
    CheckInH->>ApptRepo: save(appt)
    CheckInH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)

    Note over Therapist, ApptRepo: Session starts -> appt.start(clock)

    Therapist->>CompleteH: execute(CompleteAppointmentCommand)
    CompleteH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>CompleteH: Appointment aggregate
    CompleteH->>CompleteH: assert expectedVersion === appt.version
    CompleteH->>CompleteH: appt.complete(clock)
    CompleteH->>ApptRepo: save(appt)
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
    participant Clock as Clock

    Receptionist->>RescheduleH: execute(RescheduleAppointmentCommand)
    RescheduleH->>ApptRepo: findById(appointmentId)
    ApptRepo-->>RescheduleH: Appointment aggregate
    RescheduleH->>Policy: validateReschedule(0, appt.timeRange.start, newRange.start, clock)
    RescheduleH->>ConflictService: detectConflicts({ ..., requestedRange: newRange, appointmentType, ignoreAppointmentId })
    RescheduleH->>RescheduleH: appt.reschedule(newRange, clock)
    RescheduleH->>ApptRepo: save(appt)
    RescheduleH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)

    Receptionist->>AssignRoomH: execute(AssignRoomCommand)
    AssignRoomH->>ApptRepo: findById(appointmentId)
    AssignRoomH->>RoomRepo: findById(newRoomId)
    AssignRoomH->>RoomSpec: isSatisfiedBy(room)
    AssignRoomH->>ConflictService: detectConflicts(...)
    AssignRoomH->>AssignRoomH: appt.assignRoom(newRoomId, clock)
    AssignRoomH->>ApptRepo: save(appt)
    AssignRoomH-->>Receptionist: ApplicationResult.ok(AppointmentDTO)
```
