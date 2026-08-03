# CQRS Read-Side Calendar Projection Architecture

## Executive Summary

The Read-Model Architecture within `packages/core/src/scheduling/application/calendar` establishes high-performance, decoupled read projections for reception grids, therapist daily/weekly agendas, room operational dashboards, and client compliance history without bypassing domain contracts or coupling presentation layers to raw database schemas.

---

## Table of Contents

- [Architectural Design & CQRS Read-Side Separation](#architectural-design--cqrs-read-side-separation)
- [Read-Model Hierarchy & DTO Contracts](#read-model-hierarchy--dto-contracts)
- [Calendar Read Repository Interface](#calendar-read-repository-interface)
- [Performance & Caching Strategy](#performance--caching-strategy)

---

## Architectural Design & CQRS Read-Side Separation

```
[ Domain Events ] ---> [ Event Handlers ] ---> [ Calendar Projections ]
                                                     |
                                                     v
                                          [ Read-Model Storage ]
                                                     |
                                                     v
[ Front-Desk UI ] <--- [ CalendarReadRepository ] <--- [ Read Query Handlers ]
```

---

## Read-Model Hierarchy & DTO Contracts

The application read model hierarchy is defined under `packages/core/src/scheduling/application/calendar/dtos/`:

- **`CalendarSlotDTO`:** Discrete time-block cell on a calendar grid (`id`, `startTime`, `endTime`, `status`, `appointmentId?`, `therapistId?`, `roomId?`, `clientId?`, `clientName?`, `serviceType?`).
- **`DailyAgendaDTO`:** Structured daily operational view containing `date`, `totalAppointments`, `summaryByStatus`, `slots`, `appointmentsByTherapist`, and `appointmentsByRoom`.
- **`WeeklyAgendaDTO`:** 7-day operational view (`startDate`, `endDate`, `totalAppointments`, `dailyAgendas`).
- **`TherapistCalendarDTO`:** Single therapist schedule view (`therapistId`, `workingHours`, `breaks`, `vacations`, `overrides`, `appointments`).
- **`RoomCalendarDTO`:** Operational grid for a single room (`roomId`, `roomName`, `status`, `capacity`, `features`, `appointments`).
- **`ReceptionDashboardDTO`:** Front-desk reception view combining `liveFeed`, `pendingCheckIns`, `activeInProgress`, `roomUtilizationRates`, and `operationalAlerts`.
- **`ClientHistoryDTO`:** Historical timeline of client bookings (`clientId`, `totalBookings`, `completedCount`, `cancelledCount`, `noShowCount`, `complianceRate`).

---

## Calendar Read Repository Interface

The secondary port interface `CalendarReadRepository` defined in `application/calendar/repositories/calendar-read.repository.ts` exposes domain-centric read query methods:

```typescript
export interface CalendarReadRepository {
  getDailyAgenda(date: Date, therapistId?: string, roomId?: string): Promise<DailyAgendaDTO>;
  getWeeklyAgenda(startDate: Date, therapistId?: string, roomId?: string): Promise<WeeklyAgendaDTO>;
  getTherapistCalendar(
    therapistId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TherapistCalendarDTO>;
  getRoomCalendar(roomId: string, startDate: Date, endDate: Date): Promise<RoomCalendarDTO>;
  getReceptionDashboard(date: Date): Promise<ReceptionDashboardDTO>;
  getClientHistory(clientId: string): Promise<ClientHistoryDTO>;
}
```

---

## Performance & Caching Strategy

1. **Optimized Read Projections**: Projections pre-calculate aggregations (`summaryByStatus`, `roomUtilizationRates`, `complianceRate`) to eliminate on-the-fly SQL JOINs.
2. **Sub-Second Grid Render Times**: Grid views consume flat array collections of `CalendarSlotDTO` objects optimized for UI virtualized rendering.
3. **Decoupled Persistence**: Secondary adapters (e.g. Prisma or Redis cache views) implement `CalendarReadRepository` independently of write repositories.
