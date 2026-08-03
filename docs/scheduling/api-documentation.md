# Scheduling Application Layer API Documentation

## 1. Overview & CQRS Design Architecture

The Scheduling Application Layer implements a decoupled Command Query Responsibility Segregation (CQRS) pipeline under `packages/core/src/scheduling/application`.

- **Commands**: Encapsulate write operations, mutate domain aggregate state, enforce optimistic locking, and return `ApplicationResult<T>`.
- **Queries**: Read-only operations returning immutable DTOs without side effects.
- **Result Pattern**: Uniform `ApplicationResult<T>` wrapper (`isSuccess`, `isFailure`, `getValue()`, `getError()`).

---

## 2. Command API Contracts

### 2.1 Create Appointment Command

**Command Class**: `CreateAppointmentCommand`  
**Handler**: `CreateAppointmentHandler`

```typescript
export interface CreateAppointmentCommandInput {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: 'TREATMENT' | 'CONSULTATION' | 'EVALUATION' | 'FOLLOW_UP';
  readonly startTime: string; // ISO 8601 UTC
  readonly endTime?: string; // Optional (Defaults to +60 minutes)
  readonly requestToken?: string; // Optional Idempotency Token
}
```

**Returns**: `Promise<ApplicationResult<AppointmentDTO>>`  
**Exceptions**: `AppointmentConflictException` (thrown when conflict detection fails).

---

### 2.2 Reschedule Appointment Command

**Command Class**: `RescheduleAppointmentCommand`  
**Handler**: `RescheduleAppointmentHandler`

```typescript
export interface RescheduleAppointmentCommandInput {
  readonly appointmentId: string;
  readonly newStartTime: string;
  readonly newEndTime: string;
  readonly expectedVersion: number; // Mandatory Optimistic Locking Control
}
```

---

### 2.3 Cancel Appointment Command

**Command Class**: `CancelAppointmentCommand`  
**Handler**: `CancelAppointmentHandler`

```typescript
export interface CancelAppointmentCommandInput {
  readonly appointmentId: string;
  readonly reason: string;
  readonly expectedVersion: number;
}
```

---

### 2.4 Lifecycle Commands

| Command Name                 | Handler Class                | Input Interface Properties                    | Target Status |
| :--------------------------- | :--------------------------- | :-------------------------------------------- | :------------ |
| `ConfirmAppointmentCommand`  | `ConfirmAppointmentHandler`  | `appointmentId`, `expectedVersion`            | `CONFIRMED`   |
| `CheckInAppointmentCommand`  | `CheckInAppointmentHandler`  | `appointmentId`, `expectedVersion`            | `CHECKED_IN`  |
| `CompleteAppointmentCommand` | `CompleteAppointmentHandler` | `appointmentId`, `expectedVersion`            | `COMPLETED`   |
| `MarkNoShowCommand`          | `MarkNoShowHandler`          | `appointmentId`, `expectedVersion`, `reason?` | `NO_SHOW`     |

---

### 2.5 Resource Assignment Commands

| Command Name                | Handler Class               | Input Interface Properties                                                                |
| :-------------------------- | :-------------------------- | :---------------------------------------------------------------------------------------- |
| `AssignTherapistCommand`    | `AssignTherapistHandler`    | `appointmentId`, `newTherapistId`, `expectedVersion`                                      |
| `AssignRoomCommand`         | `AssignRoomHandler`         | `appointmentId`, `newRoomId`, `expectedVersion`, `requiredCapacity?`, `requiredFeatures?` |
| `AddAppointmentNoteCommand` | `AddAppointmentNoteHandler` | `appointmentId`, `authorId`, `noteText`, `expectedVersion`                                |

---

## 3. Query API Contracts

### 3.1 Get Appointment By ID Query

**Query Class**: `GetAppointmentByIdQuery`  
**Handler**: `GetAppointmentByIdHandler`  
**Input**: `{ appointmentId: string }`  
**Returns**: `Promise<ApplicationResult<AppointmentDTO>>`

---

### 3.2 Find Appointments By Range Query

**Query Class**: `FindAppointmentsByRangeQuery`  
**Handler**: `FindAppointmentsByRangeHandler`  
**Input**:

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

**Returns**: `Promise<ApplicationResult<AppointmentDTO[]>>`

---

### 3.3 Get Reception Daily Schedule Query

**Query Class**: `GetReceptionDailyScheduleQuery`  
**Handler**: `GetReceptionDailyScheduleHandler`  
**Input**: `{ date: string }` // e.g. "2026-08-03"  
**Returns**: `Promise<ApplicationResult<ReceptionDailyScheduleDTO>>`

```typescript
export interface ReceptionDailyScheduleDTO {
  readonly date: string;
  readonly totalAppointments: number;
  readonly appointmentsByTherapist: Record<string, AppointmentDTO[]>;
  readonly appointmentsByRoom: Record<string, AppointmentDTO[]>;
  readonly summaryByStatus: Record<string, number>;
}
```

---

## 4. Domain Exceptions & Error Codes

| Exception Class                   | Error Code / Message Pattern | Scenario                                                |
| :-------------------------------- | :--------------------------- | :------------------------------------------------------ |
| `AppointmentConflictException`    | `APPOINTMENT_CONFLICT`       | Conflict detected for therapist, room, or client.       |
| `InvalidStateTransitionException` | `INVALID_STATE_TRANSITION`   | Transition attempt from terminal state or illegal path. |
| `InvalidTimeRangeException`       | `INVALID_TIME_RANGE`         | Start time is equal to or after end time.               |
| `BookingWindowPolicyException`    | `OUTSIDE_BOOKING_WINDOW`     | Booking request outside allowed advance window.         |
