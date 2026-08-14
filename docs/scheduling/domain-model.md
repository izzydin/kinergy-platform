# Scheduling Bounded Context — Domain Model & Ubiquitous Language

## Executive Summary

This document establishes the single source of truth for the Ubiquitous Language, Aggregate Roots, Value Objects, Domain Specifications, Policies, and Domain Services within the Scheduling Bounded Context of the `@kinergy-platform/core` package.

---

## Table of Contents

- [Ubiquitous Language Glossary](#ubiquitous-language-glossary)
- [Aggregate Roots](#aggregate-roots)
- [Value Objects](#value-objects)
- [Domain Specifications](#domain-specifications)
- [Configurable Business Policies](#configurable-business-policies)
- [Domain Services & Engines](#domain-services--engines)

---

## Ubiquitous Language Glossary

| Term                    | Category       | Domain Definition                                                                                                                                                  |
| :---------------------- | :------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Appointment**         | Aggregate Root | An encapsulated clinical booking agreement between a Client and a Therapist for a specific service in a physical Room over a precise `TimeRange`.                  |
| **TherapistSchedule**   | Aggregate Root | Aggregate Root representing a therapist's base working shift hours, daily breaks, vacations, and date-specific availability overrides.                             |
| **Room**                | Aggregate Root | Aggregate Root managing a physical space's operational capacity, maintenance state (`AVAILABLE`, `MAINTENANCE`, `UNAVAILABLE`), and equipment features.            |
| **RecurrenceSeries**    | Aggregate Root | Aggregate Root defining the clinical intention and rule set for recurring appointments (`pattern`, `exceptions`, `status`).                                        |
| **RecurrencePattern**   | Value Object   | Immutable Value Object defining recurring intervals (`frequency`, `startDate`, `endDate`, `maxOccurrences`, `localStartTime`, `durationMinutes`, `timezone`).      |
| **RecurrenceException** | Value Object   | Immutable Value Object recording slot-level exceptions (`occurrenceIndex`, `type`: `SKIPPED` \| `MODIFIED` \| `RESCHEDULED`, `reason`, `rescheduledRange`).        |
| **TimeRange**           | Value Object   | Immutable Value Object encapsulating a continuous temporal interval `[start, end)` in UTC with invariant `start < end`.                                            |
| **Duration**            | Value Object   | Immutable Value Object encapsulating a non-negative quantity of time in milliseconds, minutes, or hours.                                                           |
| **AppointmentType**     | Value Object   | Value Object encapsulating clinical booking classifications (`ASSESSMENT`, `FOLLOW_UP`, `TREATMENT`, `EVALUATION`, `RENTAL`, `GROUP_CLASS`).                       |
| **TurnaroundBuffer**    | Value Object   | Value Object representing operational setup prep and cleanup sanitation buffer durations (`prepDuration`, `cleanupDuration`, `totalDuration`).                     |
| **AppointmentNote**     | Value Object   | Value Object representing operational notes attached to an appointment lifecycle (`id`, `note`, `authorId`, `createdAt`).                                          |
| **SchedulingConflict**  | Value Object   | Immutable Value Object detailing double-booking or policy violations (`category`, `conflictingEntityId`, `requestedRange`, `reason`, `suggestedAlternativeRange`). |

---

## Aggregate Roots

### 1. `Appointment` Aggregate

Governs appointment lifecycle mutations (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`). Tracks `seriesId`, `occurrenceIndex`, and `isDetachedFromSeries`.

- **Key Methods:** `confirm()`, `checkIn()`, `start()`, `complete()`, `cancel()`, `markNoShow()`, `reschedule()`, `assignTherapist()`, `assignRoom()`, `detachFromSeries()`, `addNote()`.

### 2. `RecurrenceSeries` Aggregate

Encapsulates recurring appointment pattern rules, exception log, and master series status (`ACTIVE`, `COMPLETED`, `CANCELLED`).

- **Key Methods:** `addException()`, `cancel()`, `truncateAt()`, `isCompleted()`, `hasException()`.

### 3. `TherapistSchedule` Aggregate

Manages therapist shift schedules and 4-level availability resolution engine.

- **Key Methods:** `addWorkingHours()`, `addBreak()`, `addVacation()`, `addOverride()`, `isAvailable()`, `isWorking()`, `isBreak()`, `isVacation()`.

### 4. `Room` Aggregate

Manages physical treatment room capacity, equipment features, and operational availability.

- **Key Methods:** `markAvailable()`, `markMaintenance()`, `markUnavailable()`, `supportsFeatures()`.

---

## Value Objects & Enums

- **`RecurrencePattern`:** Encapsulates `frequency` (`WEEKLY`, `BIWEEKLY`, `MONTHLY`), start/end bounds, `localStartTime: { hour, minute }`, duration, and IANA timezone.
- **`RecurrenceException`:** Slot-level audit exception (`SKIPPED`, `MODIFIED`, `RESCHEDULED`).
- **`SeriesStatus`:** Lifecycle Enum (`ACTIVE`, `COMPLETED`, `CANCELLED`).
- **`RecurrenceFrequency`:** Recurrence interval Enum (`WEEKLY`, `BIWEEKLY`, `MONTHLY`).
- **`TimeRange`:** Continuous temporal interval `[start, end)` with `toBufferedRange()`, `overlapsWithBuffer()`, `overlaps()`, `contains()`, `touches()`, `gap()`, `intersection()`, `split()`, `mergeIfAdjacent()`.
- **`Duration`:** `fromMinutes()`, `fromHours()`, `fromMilliseconds()`, `add()`, `subtract()`.
- **`TurnaroundBuffer`:** `TurnaroundBuffer.of(prepMinutes, cleanupMinutes)`, `TurnaroundBuffer.empty()`.
- **`AppointmentStatus`:** Lifecycle Enum (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
- **`RoomStatus`:** Operational Enum (`AVAILABLE`, `MAINTENANCE`, `UNAVAILABLE`).

---

## Domain Specifications

- **`WorkingHoursSpecification`:** Evaluates if candidate range falls inside therapist work shift.
- **`TherapistAvailabilitySpecification`:** Evaluates 4-level priority availability (Vacations $\rightarrow$ Overrides $\rightarrow$ Breaks $\rightarrow$ Working Hours).
- **`RoomAvailabilitySpecification`:** Verifies room status is `AVAILABLE`, capacity is sufficient, and required equipment features are supported.
- **`AppointmentOverlapSpecification`:** Asserts candidate range has zero intersection with active existing appointments.
- **`ClientAvailabilitySpecification`:** Asserts client has zero conflicting active appointments across facility services.

---

## Configurable Business Policies

- **`TurnaroundBufferPolicy`:** Computes prep setup and sanitation cleanup buffer times per appointment type or room/therapist assignment.
- **`DefaultAppointmentDurationPolicy`:** Enforces min/max duration bounds and standard duration per appointment type.
- **`BookingWindowPolicy`:** Enforces advance lead time notice (e.g., 2 hours) and maximum advance booking horizon (e.g., 90 days out).
- **`CancellationPolicy`:** Evaluates late cancellation boundaries (e.g., 24-hour cutoff) and penalty applicability.
- **`ReschedulePolicy`:** Limits maximum reschedules allowed per appointment (max 3) and notice lead time.
- **`BookingIdempotencyPolicy`:** Validates request tokens to prevent duplicate booking on retries.

---

## Domain Services & Engines

- **`RecurrenceCalculationEngine`:** Pure domain calculation engine projecting deterministic occurrence slots, applying month-end clamping, evaluating DST shifts, and skipping exceptions.
- **`ConflictDetectionService`:** 4D conflict evaluation matrix (`CLINIC` $\rightarrow$ `THERAPIST` $\rightarrow$ `ROOM` $\rightarrow$ `CLIENT`).
- **`SlotFinderEngine`:** High-performance time-grid slicing engine for single slot search, range search, and multi-resource matrix combinations.
- **`TherapistAvailabilityEvaluator`:** Evaluates therapist shift hours, vacations, overrides, breaks, and buffered appointment overlaps.
- **`RoomAvailabilityEvaluator`:** Evaluates room status, capacity bounds, feature support, and buffered appointment overlaps.
- **`ClientAvailabilityEvaluator`:** Evaluates client active appointment overlaps across facility services.
- **`BusinessCalendarService`:** Manages clinic operating hours, holidays, and facility closures.
