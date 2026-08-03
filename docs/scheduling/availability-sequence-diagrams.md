# Availability & Conflict Sequence Diagrams

This document outlines the detailed sequence flows for slot discovery, booking creation safeguards, and multi-resource matrix combination searches in the `@kinergy-platform/core` scheduling context.

---

## 1. Real-Time Slot Discovery Sequence (`FindAvailableSlotsQuery`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend / API Client
    participant Handler as FindAvailableSlotsHandler
    participant Clock as Clock (System Time)
    participant Engine as SlotFinderEngine
    participant BufferPolicy as TurnaroundBufferPolicy
    participant ConflictService as ConflictDetectionService
    participant Repo as AppointmentRepository

    Client->>Handler: execute(FindAvailableSlotsQuery)
    Handler->>Clock: now()
    Clock-->>Handler: currentDate
    Note over Handler: Filters out past start dates relative to Clock.now()

    Handler->>Engine: findAvailableSlots(SlotSearchQuery)
    loop Time-Grid Slicing (stepIntervalMinutes)
        Engine->>BufferPolicy: getBufferFor({ appointmentType, roomId, therapistId })
        BufferPolicy-->>Engine: TurnaroundBuffer (prep, cleanup)

        Engine->>ConflictService: detectConflicts({ therapistId, roomId, candidateRange, appointmentType })
        ConflictService->>Repo: findAppointmentsForTherapist / Room / Client
        Repo-->>ConflictService: existingAppointments
        ConflictService-->>Engine: conflicts[]

        alt conflicts.length == 0
            Note over Engine: Record AvailableSlotResult(candidateRange)
        end
    end

    Engine-->>Handler: AvailableSlotResult[]
    Handler-->>Client: ApplicationResult.ok(SlotResponseDTO[])
```

---

## 2. Booking Creation Safeguard & Conflict Verification Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Reception as Receptionist / Patient
    participant Handler as CreateAppointmentHandler
    participant Idempotency as BookingIdempotencyPolicy
    participant DurationPolicy as DefaultAppointmentDurationPolicy
    participant WindowPolicy as BookingWindowPolicy
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant Aggregate as Appointment Aggregate

    Reception->>Handler: execute(CreateAppointmentCommand)
    Handler->>Idempotency: registerRequest(requestToken)

    alt Duplicate Request Token
        Idempotency-->>Handler: false
        Handler-->>Reception: ApplicationResult.fail("Duplicate request")
    end

    Handler->>DurationPolicy: validateDuration(apptType, duration)
    Handler->>WindowPolicy: validateBookingWindow(startTime, Clock)

    Handler->>ConflictService: detectConflicts({ therapistId, roomId, clientId, requestedRange, appointmentType })
    ConflictService-->>Handler: SchedulingConflict[]

    alt conflicts.length > 0
        Handler-->>Reception: throw AppointmentConflictException(conflicts)
    end

    Handler->>Aggregate: Appointment.create(props, Clock)
    Aggregate-->>Handler: appointment
    Handler->>ApptRepo: save(appointment)
    ApptRepo-->>Handler: void
    Handler-->>Reception: ApplicationResult.ok(AppointmentDTO)
```

---

## 3. Multi-Resource Combination Matrix Algorithm (`FindResourceCombinationsQuery`)

```mermaid
sequenceDiagram
    autonumber
    actor WebUI as Patient Self-Booking UI
    participant Handler as FindResourceCombinationsHandler
    participant Engine as SlotFinderEngine
    participant RoomRepo as RoomRepository
    participant ConflictService as ConflictDetectionService

    WebUI->>Handler: execute(FindResourceCombinationsQuery)
    Handler->>Engine: findCompatibleCombinations(MultiResourceSlotSearchQuery)

    Engine->>RoomRepo: findAvailableRooms(searchRange, requiredFeatures)
    RoomRepo-->>Engine: Room[] (filtered by capacity & features)

    loop For each Room & Therapist Pair
        Engine->>Engine: findAvailableSlots(SlotSearchQuery)
        loop Discrete Time-Grid Steps
            Engine->>ConflictService: detectConflicts({ therapistId, roomId, candidateRange })
            ConflictService-->>Engine: conflicts[]
            alt conflicts.length == 0
                Note over Engine: Record ResourceCombinationSlot(timeRange, therapistId, roomId)
            end
        end
    end

    Engine-->>Handler: ResourceCombinationSlot[]
    Handler-->>WebUI: ApplicationResult.ok(ResourceCombinationResponseDTO[])
```
