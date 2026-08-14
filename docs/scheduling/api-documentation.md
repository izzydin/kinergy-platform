# Scheduling Application Layer API Documentation

## Executive Summary

The Scheduling Application Layer implements a decoupled Command Query Responsibility Segregation (CQRS) architecture under `packages/core/src/scheduling/application`. Commands handle state-mutating write operations and enforce domain rules and optimistic locking, while Queries handle read-optimized availability and schedule lookups.

---

## Table of Contents

- [CQRS Design Architecture](#cqrs-design-architecture)
- [Command API Contracts](#command-api-contracts)
- [Query API Contracts](#query-api-contracts)
- [Availability Query API Contracts](#availability-query-api-contracts)
- [Domain Exceptions & Error Codes](#domain-exceptions--error-codes)

---

## CQRS Design Architecture

- **Commands**: Encapsulate write operations, mutate aggregate roots, enforce optimistic locking, and return `ApplicationResult<T>`.
- **Queries**: Read-only operations returning immutable DTOs without side effects.
- **Result Pattern**: Uniform `ApplicationResult<T>` wrapper (`isSuccess`, `isFailure`, `getValue()`, `getError()`).

---

## Command API Contracts

### 1. Create Appointment Command

- **Command Class**: `CreateAppointmentCommand`
- **Handler**: `CreateAppointmentHandler`
- **Returns**: `Promise<ApplicationResult<AppointmentDTO>>`
- **Exceptions**: `AppointmentConflictException` (thrown when 4D conflict or buffer check fails).

```typescript
export interface CreateAppointmentCommandInput {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: 'ASSESSMENT' | 'FOLLOW_UP' | 'TREATMENT' | 'EVALUATION' | 'RENTAL' | 'GROUP_CLASS';
  readonly startTime: string; // ISO 8601 UTC
  readonly endTime?: string; // Optional (Defaults to policy duration)
  readonly requestToken?: string; // Optional Idempotency Token
  readonly id?: string;
}
```

### 2. Reschedule Appointment Command

- **Command Class**: `RescheduleAppointmentCommand`
- **Handler**: `RescheduleAppointmentHandler`

```typescript
export interface RescheduleAppointmentCommandInput {
  readonly appointmentId: string;
  readonly newStartTime: string;
  readonly newEndTime: string;
  readonly expectedVersion: number; // Mandatory Optimistic Locking Control
}
```

### 3. Cancel Appointment Command

- **Command Class**: `CancelAppointmentCommand`
- **Handler**: `CancelAppointmentHandler`

```typescript
export interface CancelAppointmentCommandInput {
  readonly appointmentId: string;
  readonly reason: string;
  readonly expectedVersion: number;
}
```

### 4. Lifecycle Commands

| Command Name                 | Handler Class                | Input Interface Properties                    | Target Status |
| :--------------------------- | :--------------------------- | :-------------------------------------------- | :------------ |
| `ConfirmAppointmentCommand`  | `ConfirmAppointmentHandler`  | `appointmentId`, `expectedVersion`            | `CONFIRMED`   |
| `CheckInAppointmentCommand`  | `CheckInAppointmentHandler`  | `appointmentId`, `expectedVersion`            | `CHECKED_IN`  |
| `CompleteAppointmentCommand` | `CompleteAppointmentHandler` | `appointmentId`, `expectedVersion`            | `COMPLETED`   |
| `MarkNoShowCommand`          | `MarkNoShowHandler`          | `appointmentId`, `expectedVersion`, `reason?` | `NO_SHOW`     |

### 5. Resource Assignment Commands

| Command Name                | Handler Class               | Input Interface Properties                                                                |
| :-------------------------- | :-------------------------- | :---------------------------------------------------------------------------------------- |
| `AssignTherapistCommand`    | `AssignTherapistHandler`    | `appointmentId`, `newTherapistId`, `expectedVersion`                                      |
| `AssignRoomCommand`         | `AssignRoomHandler`         | `appointmentId`, `newRoomId`, `expectedVersion`, `requiredCapacity?`, `requiredFeatures?` |
| `AddAppointmentNoteCommand` | `AddAppointmentNoteHandler` | `appointmentId`, `authorId`, `noteText`, `expectedVersion`                                |

### 8. Create Recurring Appointment Series Command

- **Command Class**: `CreateRecurrenceSeriesCommand`
- **Handler**: `CreateRecurrenceSeriesHandler`
- **Endpoint**: `POST /api/v1/scheduling/recurring-appointments`
- **Permission**: `appointments.create`
- **Returns**: `Promise<ApplicationResult<CreateRecurrenceSeriesResultDTO>>`

```typescript
export interface CreateRecurrenceSeriesCommandInput {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  readonly startDate: string; // ISO 8601 UTC
  readonly endDate?: string;
  readonly maxOccurrences?: number;
  readonly localStartTime: { hour: number; minute: number };
  readonly durationMinutes: number;
  readonly timezone?: string;
  readonly horizonDays?: number; // 1-90, default 60
}
```

### 9. Generate Recurring Occurrences Command

- **Command Class**: `GenerateRecurringOccurrencesCommand`
- **Handler**: `GenerateRecurringOccurrencesHandler`
- **Returns**: `Promise<ApplicationResult<OccurrenceGenerationResultDTO>>`

```typescript
export interface GenerateRecurringOccurrencesCommandInput {
  readonly seriesId: string;
  readonly horizonDays?: number;
  readonly windowStart?: Date | string;
  readonly windowEnd?: Date | string;
}
```

### 10. Skip Recurrence Occurrence Command

- **Command Class**: `SkipRecurrenceOccurrenceCommand`
- **Handler**: `SkipRecurrenceOccurrenceHandler`
- **Endpoint**: `POST /api/v1/scheduling/recurring-appointments/:seriesId/skip`
- **Permission**: `appointments.update`
- **Returns**: `Promise<ApplicationResult<SkipOccurrenceResultDTO>>`

```typescript
export interface SkipRecurrenceOccurrenceCommandInput {
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly reason?: string;
}
```

### 11. Edit Single Occurrence Command

- **Command Class**: `EditSingleOccurrenceCommand`
- **Handler**: `EditSingleOccurrenceHandler`
- **Endpoint**: `PATCH /api/v1/scheduling/recurring-appointments/occurrences/:appointmentId`
- **Permission**: `appointments.update`
- **Returns**: `Promise<ApplicationResult<AppointmentDTO>>`

```typescript
export interface EditSingleOccurrenceCommandInput {
  readonly appointmentId: string;
  readonly startTime?: Date | string;
  readonly durationMinutes?: number;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly reason?: string;
}
```

### 12. Edit Future Occurrences (Cutoff-and-Fork) Command

- **Command Class**: `EditFutureOccurrencesCommand`
- **Handler**: `EditFutureOccurrencesHandler`
- **Endpoint**: `POST /api/v1/scheduling/recurring-appointments/:seriesId/edit-future`
- **Permission**: `appointments.update`
- **Returns**: `Promise<ApplicationResult<EditFutureOccurrencesResultDTO>>`

```typescript
export interface EditFutureOccurrencesCommandInput {
  readonly seriesId: string;
  readonly fromOccurrenceIndex?: number;
  readonly fromDate?: Date | string;
  readonly newFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  readonly newLocalStartTime?: { hour: number; minute: number };
  readonly newDurationMinutes?: number;
  readonly newTherapistId?: string;
  readonly newRoomId?: string;
}
```

### 13. Cancel Recurrence Series Command

- **Command Class**: `CancelRecurrenceSeriesCommand`
- **Handler**: `CancelRecurrenceSeriesHandler`
- **Endpoint**: `POST /api/v1/scheduling/recurring-appointments/:seriesId/cancel`
- **Permission**: `appointments.delete`
- **Returns**: `Promise<ApplicationResult<CancelRecurrenceSeriesResultDTO>>`

```typescript
export interface CancelRecurrenceSeriesCommandInput {
  readonly seriesId: string;
  readonly reason?: string;
}
```

---

## Query API Contracts

### 1. Get Appointment By ID Query

- **Query Class**: `GetAppointmentByIdQuery`
- **Handler**: `GetAppointmentByIdHandler`
- **Input**: `{ appointmentId: string }`
- **Returns**: `Promise<ApplicationResult<AppointmentDTO>>`

### 2. Find Appointments By Range Query

- **Query Class**: `FindAppointmentsByRangeQuery`
- **Handler**: `FindAppointmentsByRangeHandler`
- **Input**:

```typescript
export interface FindAppointmentsByRangeQueryInput {
  readonly startTime: string;
  readonly endTime: string;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly status?: string;
}
```

- **Returns**: `Promise<ApplicationResult<AppointmentDTO[]>>`

### 3. Get Reception Daily Schedule Query

- **Query Class**: `GetReceptionDailyScheduleQuery`
- **Handler**: `GetReceptionDailyScheduleHandler`
- **Input**: `{ date: string }` // e.g. "2026-08-03"
- **Returns**: `Promise<ApplicationResult<ReceptionDailyScheduleDTO>>`

---

## Availability Query API Contracts

### 1. Check Conflict Query

- **Query Class**: `CheckConflictQuery`
- **Handler**: `CheckConflictHandler`
- **Returns**: `Promise<ApplicationResult<ConflictCheckResponseDTO>>`

```typescript
export interface CheckConflictQueryInput {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly type?: string;
  readonly excludeAppointmentId?: string;
}
```

### 2. Find Available Slots Query

- **Query Class**: `FindAvailableSlotsQuery`
- **Handler**: `FindAvailableSlotsHandler`
- **Returns**: `Promise<ApplicationResult<SlotResponseDTO[]>>`

```typescript
export interface FindAvailableSlotsQueryInput {
  readonly therapistId: string;
  readonly roomId: string;
  readonly durationMinutes: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly type?: string;
  readonly stepIntervalMinutes?: number;
}
```

### 3. Find Resource Combinations Query

- **Query Class**: `FindResourceCombinationsQuery`
- **Handler**: `FindResourceCombinationsHandler`
- **Returns**: `Promise<ApplicationResult<ResourceCombinationResponseDTO[]>>`

```typescript
export interface FindResourceCombinationsQueryInput {
  readonly therapistIds: string[];
  readonly durationMinutes: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
  readonly type?: string;
  readonly stepIntervalMinutes?: number;
}
```

---

## Domain Exceptions & Error Codes

| Exception Class                   | Error Code / Message Pattern | Scenario                                                |
| :-------------------------------- | :--------------------------- | :------------------------------------------------------ |
| `AppointmentConflictException`    | `APPOINTMENT_CONFLICT`       | 4D conflict detected for therapist, room, or client.    |
| `InvalidStateTransitionException` | `INVALID_STATE_TRANSITION`   | Transition attempt from terminal state or illegal path. |
| `InvalidTimeRangeException`       | `INVALID_TIME_RANGE`         | Start time is equal to or after end time.               |
| `WorkingHoursViolationException`  | `WORKING_HOURS_VIOLATION`    | Slot falls outside therapist working shift hours.       |
