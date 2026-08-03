# Scheduling Workflow & Conflict Resolution Pipeline

## Executive Summary

This document details the end-to-end execution workflow for client booking requests, incorporating 4D conflict evaluations, policy validations, and aggregate persistence.

---

## Table of Contents

- [Booking Request Execution Sequence](#booking-request-execution-sequence)
- [Multi-Aggregate Conflict Evaluation Priority](#multi-aggregate-conflict-evaluation-priority)

---

## Booking Request Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant UseCase as CreateAppointmentHandler
    participant Policy as BookingWindowPolicy
    participant Calendar as BusinessCalendarService
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant ApptAgg as Appointment Aggregate

    Client->>UseCase: Book Appointment (therapistId, roomId, clientId, range, type)
    UseCase->>Policy: validateBookingWindow(range.start, clock)
    alt Window Violation
        Policy-->>UseCase: Invalid (Notice/Horizon Violation)
        UseCase-->>Client: Return ApplicationResult.fail("Outside booking window")
    end

    UseCase->>ConflictService: detectConflicts(params)
    ConflictService->>Calendar: isClinicOpen(range)
    alt Clinic Closed / Holiday
        Calendar-->>ConflictService: Closed
    end

    ConflictService->>ApptRepo: findAppointmentsForTherapist(therapistId, range)
    ConflictService->>ApptRepo: findAppointmentsForRoom(roomId, range)
    ConflictService->>ApptRepo: findAppointmentsForClient(clientId, range)

    alt Conflicts Detected
        ConflictService-->>UseCase: SchedulingConflict[]
        UseCase-->>Client: Throw AppointmentConflictException(conflicts)
    else Zero Conflicts
        ConflictService-->>UseCase: [] (Clean)
        UseCase->>ApptAgg: Appointment.create(...)
        ApptAgg-->>UseCase: Appointment Aggregate Root
        UseCase->>ApptRepo: save(appointment)
        UseCase-->>Client: ApplicationResult.ok(AppointmentDTO)
    end
```

---

## Multi-Aggregate Conflict Evaluation Priority

1. **Facility Open & Holiday Check**: Verifies facility is open and not observing a public holiday.
2. **Therapist Vacation & Overrides**: Checks date-specific vacation periods and availability overrides.
3. **Therapist Shift & Break Rules**: Evaluates standard working hours shift and daily break intervals.
4. **Room Operational Status & Equipment**: Verifies room status is `AVAILABLE` and supports required capabilities.
5. **Therapist & Room Booking Overlaps**: Queries active non-cancelled appointments for room or therapist overlap including turnaround buffers.
6. **Client Double-Booking Guard**: Asserts client has zero conflicting active appointments.
