# Recurring Occurrence Generation Strategy

## Executive Summary

This document specifies the algorithmic, transactional, and conflict-detection mechanisms governing occurrence materialization for recurring appointment series in Kinergy.

---

## 1. Rolling Horizon Generation Model

Rather than eagerly generating unbounded appointments into the distant future (which causes database bloat and lock contention), Kinergy employs a **Rolling Horizon Window**:

```
Series Start: 2026-09-01
─────────────────────────────────────────────────────────────────────────────► (Time)
[====== Horizon Window (Default 60 Days: Sep 1 to Nov 1) ======]
 Materialized as Appointment Aggregates in DB                     Unmaterialized Future Slots
```

- **Default Horizon**: 60 days from current date or series start (whichever is later).
- **Minimum/Maximum Bounds**: 1 to 90 days.
- **Trigger Points**:
  1. On series creation (`CreateRecurrenceSeriesHandler`).
  2. On scheduled daily/weekly background horizon extension jobs.
  3. On manual/administrative horizon extension requests.

---

## 2. Algorithmic Steps

When `GenerateRecurringOccurrencesHandler` executes:

1. **Active Status Verification**: Verifies `RecurrenceSeries.status === 'ACTIVE'`. Rejects requests on completed or cancelled series.
2. **Window Resolution**: Resolves `windowStart` and `windowEnd` bounded by `horizonDays` and `maxOccurrences` / `endDate`.
3. **Pure Slot Calculation**: `RecurrenceCalculationEngine.calculate()` calculates all theoretical slots, applying:
   - Recurrence frequency rules (`WEEKLY`, `BIWEEKLY`, `MONTHLY`).
   - Month-end day clamping (e.g., 31st $\rightarrow$ 28/29/30).
   - IANA wall-clock DST conversions.
   - Filtering of existing series exceptions (`SKIPPED`, `MODIFIED`).
4. **Idempotency & Pre-existing Check**:
   - Queries `appointmentRepository.findBySeriesId(seriesId)`.
   - Collects set of already materialized `occurrenceIndex` values.
   - Bypasses any slot whose `occurrenceIndex` already exists.
5. **4D Conflict Detection**:
   - For each candidate slot, invokes `ConflictDetectionService.detectConflicts()`.
   - Evaluates Therapist schedule & bookings, Room status & features, Client overlaps, and Facility Operating Hours.
6. **Materialization & Partial Failure Resilience**:
   - **Conflict-Free Slots**: Instantiates new `Appointment` aggregate with `seriesId`, `occurrenceIndex`, and `isDetachedFromSeries = false`, then calls `appointmentRepository.save()`.
   - **Conflicted Slots**: Records `ConflictingOccurrenceDiagnostic` containing `occurrenceIndex`, `timeRange`, and `conflicts[]`. Continues to process remaining slots.
7. **Series Completion Evaluation**:
   - If the last calculated slot satisfies `maxOccurrences` or reaches `endDate`, marks `isSeriesCompleted = true` on the response.

---

## 3. Idempotency & Database Constraints

1. **Unique Constraint**:
   ```prisma
   @@unique([seriesId, occurrenceIndex])
   ```
   Guarantees that duplicate occurrences can never be inserted into the database even under concurrent generator execution.
2. **In-Memory Guard**:
   `GenerateRecurringOccurrencesHandler` pre-filters `existingOccurrenceIndices` so that repeat invocations over identical, overlapping, or adjacent windows execute in $O(N)$ with zero redundant database writes.

---

## 4. Conflict Resolution & Retry Behavior

When an occurrence conflicts with an existing single booking:

- The generator does **not** fail the entire batch.
- The unconflicted appointments in the horizon are saved normally.
- The diagnostic response contains the exact conflict reason (e.g. `THERAPIST`, `ROOM`).
- If clinic staff reschedules the blocking appointment, running generation again will automatically materialize the previously skipped slot without duplicate creation.
