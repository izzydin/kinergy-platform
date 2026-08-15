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

### 4. Create Room Command

- **Command Class**: `CreateRoomCommand`
- **Handler**: `CreateRoomHandler`
- **Returns**: `Promise<ApplicationResult<RoomDto>>`

```typescript
export interface CreateRoomCommandInput {
  readonly name: string;
  readonly capacity: number;
  readonly features?: string[];
}
```

### 5. Edit Room Command

- **Command Class**: `EditRoomCommand`
- **Handler**: `EditRoomHandler`
- **Returns**: `Promise<ApplicationResult<RoomDto>>`

```typescript
export interface EditRoomCommandInput {
  readonly roomId: string;
  readonly name?: string;
  readonly capacity?: number;
  readonly features?: string[];
  readonly expectedVersion?: number;
}
```

### 6. Activate / Deactivate Room Commands

- **Command Classes**: `ActivateRoomCommand`, `DeactivateRoomCommand`
- **Handlers**: `ActivateRoomHandler`, `DeactivateRoomHandler`
- **Returns**: `Promise<ApplicationResult<RoomDto>>`

```typescript
export interface DeactivateRoomCommandInput {
  readonly roomId: string;
  readonly reason: string; // Mandatory reason for deactivation
  readonly expectedVersion?: number;
}
```

### 7. Schedule Maintenance Command

- **Command Class**: `ScheduleMaintenanceCommand`
- **Handler**: `ScheduleMaintenanceHandler`
- **Returns**: `Promise<ApplicationResult<RoomDto>>`

```typescript
export interface ScheduleMaintenanceCommandInput {
  readonly roomId: string;
  readonly startTime: string; // ISO 8601 UTC
  readonly endTime: string; // ISO 8601 UTC
  readonly reason: string;
  readonly expectedVersion?: number;
}
```

### 8. Cancel Maintenance Command

- **Command Class**: `CancelMaintenanceCommand`
- **Handler**: `CancelMaintenanceHandler`
- **Returns**: `Promise<ApplicationResult<RoomDto>>`

```typescript
export interface CancelMaintenanceCommandInput {
  readonly roomId: string;
  readonly maintenanceWindowId: string;
  readonly expectedVersion?: number;
}
```

### 9. Assign Room Command

- **Command Class**: `AssignRoomCommand`
- **Handler**: `AssignRoomHandler`
- **Returns**: `Promise<ApplicationResult<AppointmentDTO>>`

```typescript
export interface AssignRoomCommandInput {
  readonly appointmentId: string;
  readonly roomId: string;
  readonly expectedVersion: number;
}
```

---

## Room Query API Contracts

### 1. Check Room Availability Query

- **Query Class**: `CheckRoomAvailabilityQuery`
- **Handler**: `CheckRoomAvailabilityHandler`
- **Returns**: `Promise<ApplicationResult<RoomAvailabilityResponseDto>>`

```typescript
export interface CheckRoomAvailabilityQueryInput {
  readonly roomId: string;
  readonly startTime: string; // ISO 8601 UTC
  readonly endTime: string; // ISO 8601 UTC
}
```

### 2. Get Available Rooms Query

- **Query Class**: `GetAvailableRoomsQuery`
- **Handler**: `GetAvailableRoomsHandler`
- **Returns**: `Promise<ApplicationResult<RoomResponseDto[]>>`

```typescript
export interface GetAvailableRoomsQueryInput {
  readonly startTime: string; // ISO 8601 UTC
  readonly endTime: string; // ISO 8601 UTC
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
}
```

### 3. List Rooms Query

- **Query Class**: `ListRoomsQuery`
- **Handler**: `ListRoomsHandler`
- **Returns**: `Promise<ApplicationResult<RoomResponseDto[]>>`

```typescript
export interface ListRoomsQueryInput {
  readonly status?: 'AVAILABLE' | 'MAINTENANCE' | 'UNAVAILABLE';
}
```

---

## REST Endpoints (`/api/v1/scheduling/rooms`)

| Method   | Path                                                 | Permission Required | Summary                             |
| :------- | :--------------------------------------------------- | :------------------ | :---------------------------------- |
| `POST`   | `/api/v1/scheduling/rooms`                           | `settings.write`    | Create a new physical room          |
| `GET`    | `/api/v1/scheduling/rooms`                           | `settings.read`     | List facility rooms                 |
| `GET`    | `/api/v1/scheduling/rooms/available`                 | `appointments.read` | List available rooms for time range |
| `GET`    | `/api/v1/scheduling/rooms/:id`                       | `settings.read`     | Get room details by ID              |
| `PATCH`  | `/api/v1/scheduling/rooms/:id`                       | `settings.write`    | Update room metadata / capacity     |
| `POST`   | `/api/v1/scheduling/rooms/:id/activate`              | `settings.write`    | Reactivate room to AVAILABLE        |
| `POST`   | `/api/v1/scheduling/rooms/:id/deactivate`            | `settings.write`    | Deactivate room with reason         |
| `GET`    | `/api/v1/scheduling/rooms/:id/availability`          | `appointments.read` | Check single room availability      |
| `POST`   | `/api/v1/scheduling/rooms/:id/maintenance`           | `settings.write`    | Schedule maintenance window         |
| `DELETE` | `/api/v1/scheduling/rooms/:id/maintenance/:windowId` | `settings.write`    | Cancel maintenance window           |

---

## REST Endpoints (`/api/v1/scheduling/recurring`)

| Method   | Path                                                      | Permission Required  | Summary                                     |
| :------- | :-------------------------------------------------------- | :------------------- | :------------------------------------------ |
| `POST`   | `/api/v1/scheduling/recurring/series`                     | `appointments.write` | Create recurring appointment series         |
| `POST`   | `/api/v1/scheduling/recurring/series/:seriesId/generate`  | `appointments.write` | Generate upcoming occurrences for horizon   |
| `POST`   | `/api/v1/scheduling/recurring/series/:seriesId/skip`      | `appointments.write` | Skip single occurrence in series            |
| `PATCH`  | `/api/v1/scheduling/recurring/occurrences/:appointmentId` | `appointments.write` | Edit single occurrence (detach from series) |
| `PATCH`  | `/api/v1/scheduling/recurring/series/:seriesId/future`    | `appointments.write` | Edit future occurrences in series           |
| `DELETE` | `/api/v1/scheduling/recurring/series/:seriesId`           | `appointments.write` | Cancel recurrence series and future slots   |

---

## Domain Exceptions & Error Codes

| Exception Class                   | Error Code / Message Pattern | Scenario                                                |
| :-------------------------------- | :--------------------------- | :------------------------------------------------------ |
| `AppointmentConflictException`    | `APPOINTMENT_CONFLICT`       | 4D conflict detected for therapist, room, or client.    |
| `OptimisticLockException`         | `OPTIMISTIC_LOCK_ERROR`      | Version mismatch detected during aggregate mutation.    |
| `InvalidStateTransitionException` | `INVALID_STATE_TRANSITION`   | Transition attempt from terminal state or illegal path. |
| `InvalidTimeRangeException`       | `INVALID_TIME_RANGE`         | Start time is equal to or after end time.               |
| `WorkingHoursViolationException`  | `WORKING_HOURS_VIOLATION`    | Slot falls outside therapist working shift hours.       |
