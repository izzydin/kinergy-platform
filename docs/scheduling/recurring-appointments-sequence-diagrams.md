# Recurring Appointments CQRS Sequence Diagrams

## Executive Summary

This document details the CQRS sequence diagrams across all recurring appointment operations in the Kinergy Scheduling Bounded Context.

---

## 1. Create Recurring Appointment Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Controller as RecurringAppointmentsController
    participant CreateHandler as CreateRecurrenceSeriesHandler
    participant SeriesRepo as RecurrenceSeriesRepository
    participant GenHandler as GenerateRecurringOccurrencesHandler
    participant CalcEngine as RecurrenceCalculationEngine
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository
    participant Clock as Clock

    Client/Reception->>Controller: POST /recurring-appointments
    Controller->>CreateHandler: execute(CreateRecurrenceSeriesCommand)
    CreateHandler->>SeriesRepo: save(new RecurrenceSeries)

    CreateHandler->>GenHandler: execute(GenerateRecurringOccurrencesCommand)
    GenHandler->>CalcEngine: calculate({ seriesId, pattern, window })
    CalcEngine-->>GenHandler: OccurrenceSlot[]

    GenHandler->>ApptRepo: findBySeriesId(seriesId)
    ApptRepo-->>GenHandler: existingAppointments

    loop For Each Unmaterialized Slot
        GenHandler->>ConflictService: detectConflicts(slotParams)
        alt Conflict Free
            GenHandler->>ApptRepo: save(new Appointment)
        else Conflict Detected
            GenHandler->>GenHandler: record in conflictingOccurrences[]
        end
    end

    GenHandler-->>CreateHandler: ApplicationResult.ok(OccurrenceGenerationResultDTO)
    CreateHandler-->>Controller: ApplicationResult.ok(CreateRecurrenceSeriesResultDTO)
    Controller-->>Client/Reception: 201 Created (CreateRecurrenceSeriesResponseDto)
```

---

## 2. Generate Occurrences (Rolling Horizon Window)

```mermaid
sequenceDiagram
    autonumber
    actor Scheduler/Job
    participant Handler as GenerateRecurringOccurrencesHandler
    participant SeriesRepo as RecurrenceSeriesRepository
    participant CalcEngine as RecurrenceCalculationEngine
    participant ConflictService as ConflictDetectionService
    participant ApptRepo as AppointmentRepository

    Scheduler/Job->>Handler: execute(GenerateRecurringOccurrencesCommand)
    Handler->>SeriesRepo: findById(seriesId)
    alt Series Inactive or Cancelled
        Handler-->>Scheduler/Job: ApplicationResult.fail("Series is not active")
    end

    Handler->>CalcEngine: calculate({ seriesId, pattern, window, exceptions })
    CalcEngine-->>Handler: OccurrenceSlot[]

    Handler->>ApptRepo: findBySeriesId(seriesId)
    ApptRepo-->>Handler: existingAppointments

    loop For Each Calculated Slot
        alt Already Materialized (existingOccurrenceIndices.has(index))
            Handler->>Handler: existingCount++
        else Has SKIPPED / MODIFIED Exception
            Handler->>Handler: skippedCount++
        else Candidate for Creation
            Handler->>ConflictService: detectConflicts(slot)
            alt Has Conflict
                Handler->>Handler: conflictCount++, record diagnostic
            else No Conflict
                Handler->>ApptRepo: save(new Appointment)
                Handler->>Handler: generatedCount++
            end
        end
    end

    Handler-->>Scheduler/Job: ApplicationResult.ok(OccurrenceGenerationResultDTO)
```

---

## 3. Skip Occurrence Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Controller as RecurringAppointmentsController
    participant Handler as SkipRecurrenceOccurrenceHandler
    participant SeriesRepo as RecurrenceSeriesRepository
    participant ApptRepo as AppointmentRepository

    Client/Reception->>Controller: POST /:seriesId/skip
    Controller->>Handler: execute(SkipRecurrenceOccurrenceCommand)

    Handler->>SeriesRepo: findById(seriesId)
    Handler->>SeriesRepo: series.addException(RecurrenceException.create({ occurrenceIndex, type: 'SKIPPED' }))
    Handler->>SeriesRepo: save(series)

    Handler->>ApptRepo: findBySeriesId(seriesId)
    opt Materialized Appointment Exists at Index
        Handler->>ApptRepo: appointment.cancel("Skipped by recurrence exception")
        Handler->>ApptRepo: save(appointment)
    end

    Handler-->>Controller: ApplicationResult.ok(SkipOccurrenceResultDTO)
    Controller-->>Client/Reception: 200 OK (SkipOccurrenceResponseDto)
```

---

## 4. Edit Single Occurrence (Detachment) Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Controller as RecurringAppointmentsController
    participant Handler as EditSingleOccurrenceHandler
    participant ApptRepo as AppointmentRepository
    participant SeriesRepo as RecurrenceSeriesRepository
    participant ConflictService as ConflictDetectionService

    Client/Reception->>Controller: PATCH /occurrences/:appointmentId
    Controller->>Handler: execute(EditSingleOccurrenceCommand)

    Handler->>ApptRepo: findById(appointmentId)
    Handler->>ConflictService: detectConflicts(newParams, excludeAppointmentId)
    alt Conflict Detected
        Handler-->>Controller: ApplicationResult.fail("Conflict detected")
        Controller-->>Client/Reception: 409 Conflict
    end

    Handler->>ApptRepo: appointment.reschedule(newTime) / assignTherapist / assignRoom
    Handler->>ApptRepo: appointment.detachFromSeries() [isDetachedFromSeries = true]
    Handler->>ApptRepo: save(appointment)

    opt Appointment Belongs to Series
        Handler->>SeriesRepo: findById(seriesId)
        Handler->>SeriesRepo: series.addException(RecurrenceException.create({ occurrenceIndex, type: 'MODIFIED' }))
        Handler->>SeriesRepo: save(series)
    end

    Handler-->>Controller: ApplicationResult.ok(AppointmentDTO)
    Controller-->>Client/Reception: 200 OK (AppointmentDTO)
```

---

## 5. Edit Future Occurrences (Cutoff-and-Fork) Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Controller as RecurringAppointmentsController
    participant Handler as EditFutureOccurrencesHandler
    participant SeriesRepo as RecurrenceSeriesRepository
    participant ApptRepo as AppointmentRepository
    participant GenHandler as GenerateRecurringOccurrencesHandler

    Client/Reception->>Controller: POST /:seriesId/edit-future
    Controller->>Handler: execute(EditFutureOccurrencesCommand)

    Handler->>SeriesRepo: findById(seriesId)
    Handler->>SeriesRepo: oldSeries.truncateAt(cutoffDate, fromOccurrenceIndex)
    Handler->>SeriesRepo: save(oldSeries)

    Handler->>ApptRepo: findBySeriesId(oldSeriesId)
    loop For Each Future Non-Detached Appointment >= cutoffDate
        Handler->>ApptRepo: appt.cancel("Cancelled due to future recurrence modification")
        Handler->>ApptRepo: save(appt)
    end

    Handler->>SeriesRepo: save(newRecurrenceSeries starting at cutoffDate)
    Handler->>GenHandler: execute(GenerateRecurringOccurrencesCommand on newSeriesId)

    Handler-->>Controller: ApplicationResult.ok(EditFutureOccurrencesResultDTO)
    Controller-->>Client/Reception: 200 OK (EditFutureOccurrencesResponseDto)
```

---

## 6. Cancel Recurrence Series Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client/Reception
    participant Controller as RecurringAppointmentsController
    participant Handler as CancelRecurrenceSeriesHandler
    participant SeriesRepo as RecurrenceSeriesRepository
    participant ApptRepo as AppointmentRepository

    Client/Reception->>Controller: POST /:seriesId/cancel
    Controller->>Handler: execute(CancelRecurrenceSeriesCommand)

    Handler->>SeriesRepo: findById(seriesId)
    Handler->>SeriesRepo: series.cancel(reason)
    Handler->>SeriesRepo: save(series)

    Handler->>ApptRepo: findBySeriesId(seriesId)
    loop For Each Future Non-Detached Appointment (> now)
        opt Status is SCHEDULED or CONFIRMED
            Handler->>ApptRepo: appt.cancel("Series cancelled")
            Handler->>ApptRepo: save(appt)
        end
    end

    Handler-->>Controller: ApplicationResult.ok(CancelRecurrenceSeriesResultDTO)
    Controller-->>Client/Reception: 200 OK (CancelRecurrenceSeriesResponseDto)
```

---

## 7. Concurrent Generation & Race Condition Invariance

```mermaid
sequenceDiagram
    autonumber
    actor Job1 as Generator Worker 1
    actor Job2 as Generator Worker 2
    participant Handler as GenerateRecurringOccurrencesHandler
    participant ApptRepo as AppointmentRepository
    participant DB as Prisma Database

    par Concurrent Invocation
        Job1->>Handler: execute(GenerateCommand: Series A)
        Job2->>Handler: execute(GenerateCommand: Series A)
    end

    Handler->>DB: Check existing appointments for Series A
    Handler->>DB: Candidate slot Index 1 for Series A

    alt Worker 1 Inserts First
        Handler->>DB: INSERT INTO appointments (seriesId, occurrenceIndex=1, ...)
        DB-->>Handler: 201 Success
    else Worker 2 Inserts Simultaneously
        Handler->>DB: INSERT INTO appointments (seriesId, occurrenceIndex=1, ...)
        DB-->>Handler: @@unique([seriesId, occurrenceIndex]) Violation!
        Handler->>Handler: Catch unique constraint & mark existing
    end

    Handler-->>Job1: ApplicationResult.ok(generated: 1)
    Handler-->>Job2: ApplicationResult.ok(generated: 0, existing: 1)
```
