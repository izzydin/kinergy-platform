# Scheduling Bounded Context — Read-Model DTOs & Grid Mapping Specification

## 1. Overview

This document details the read-model Data Transfer Objects (DTOs), query parameters, and grid mapping contracts for the Scheduling Bounded Context.

---

## 2. Read-Model DTO Contracts

### 2.1 `CalendarSlotDTO`

Represents a discrete time block cell on a calendar grid.

```typescript
export interface CalendarSlotDTO {
  readonly id: string;
  readonly startTime: string; // ISO string
  readonly endTime: string; // ISO string
  readonly status:
    | 'SCHEDULED'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'BLOCKED'
    | 'VACATION'
    | 'MAINTENANCE';
  readonly appointmentId?: string;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly clientName?: string;
  readonly serviceType?: string;
  readonly isBuffered?: boolean;
  readonly hasConflict?: boolean;
  readonly overlapCount?: number;
  readonly operationalStatus?: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
}
```

### 2.2 `DailyAgendaDTO`

Represents a structured daily operational schedule view.

```typescript
export interface DailyAgendaDTO {
  readonly date: string; // YYYY-MM-DD
  readonly totalAppointments: number;
  readonly summaryByStatus: Record<string, number>;
  readonly slots: CalendarSlotDTO[];
  readonly appointmentsByTherapist: Record<string, CalendarSlotDTO[]>;
  readonly appointmentsByRoom: Record<string, CalendarSlotDTO[]>;
}
```

### 2.3 `WeeklyAgendaDTO`

Represents a 7-day operational schedule view.

```typescript
export interface WeeklyAgendaDTO {
  readonly startDate: string; // ISO string
  readonly endDate: string; // ISO string
  readonly totalAppointments: number;
  readonly dailyAgendas: DailyAgendaDTO[];
}
```

### 2.4 `TherapistCalendarDTO` & `TherapistTimeBlockDTO`

Represents schedule view filtered for a single therapist.

```typescript
export interface TherapistTimeBlockDTO {
  readonly startTime: string;
  readonly endTime: string;
  readonly type: 'WORKING_HOURS' | 'BREAK' | 'VACATION' | 'OVERRIDE';
  readonly label?: string;
}

export interface TherapistCalendarDTO {
  readonly therapistId: string;
  readonly therapistName?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly workingHours: TherapistTimeBlockDTO[];
  readonly breaks: TherapistTimeBlockDTO[];
  readonly vacations: TherapistTimeBlockDTO[];
  readonly overrides: TherapistTimeBlockDTO[];
  readonly appointments: CalendarSlotDTO[];
}
```

### 2.5 `RoomCalendarDTO`

Represents operational schedule grid for a single room.

```typescript
export interface RoomCalendarDTO {
  readonly roomId: string;
  readonly roomName: string;
  readonly status: 'AVAILABLE' | 'MAINTENANCE' | 'UNAVAILABLE';
  readonly capacity: number;
  readonly features: string[];
  readonly maintenanceReason?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly appointments: CalendarSlotDTO[];
}
```

### 2.6 `ReceptionDashboardDTO`

Represents front-desk reception operational intelligence view.

```typescript
export interface ReceptionDashboardDTO {
  readonly date: string;
  readonly liveFeed: CalendarSlotDTO[];
  readonly pendingCheckIns: CalendarSlotDTO[];
  readonly activeInProgress: CalendarSlotDTO[];
  readonly roomUtilizationRates: Record<string, number>;
  readonly operationalAlerts: string[];
  readonly countersByStatus?: Record<string, number>;
}
```

### 2.7 `ClientHistoryDTO`

Represents chronological history and compliance rates for a client.

```typescript
export interface ClientHistoryDTO {
  readonly clientId: string;
  readonly clientName?: string;
  readonly totalBookings: number;
  readonly completedCount: number;
  readonly cancelledCount: number;
  readonly noShowCount: number;
  readonly complianceRate: number;
  readonly appointments: CalendarSlotDTO[];
}
```

---

## 3. `CalendarGridMapper` Specification

`CalendarGridMapper` provides pure, deterministic grid computation:

1. **Interval Generation (`generateTimeSlots`)**:
   Generates grid interval slots for 15, 30, or 60 minute increments between configured `startHour` (default 8) and `endHour` (default 20).
2. **Conflict Engine (`computeConflicts`)**:
   Iterates active slots to detect overlapping time ranges (`slotStart < otherEnd && slotEnd > otherStart`) sharing therapist or room resources, setting `hasConflict = true` and calculating `overlapCount`.
3. **Multi-Entity Merging (`mapGridSlots`)**:
   Integrates active appointments, therapist vacation periods (`VACATION`), break intervals (`BLOCKED`), and facility maintenance blocks (`MAINTENANCE`).
