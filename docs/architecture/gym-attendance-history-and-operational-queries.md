# Gym Management — Attendance History & Operational Queries Specification

- **Status**: Authoritative Architectural Specification
- **Phase**: 5.5-F
- **Bounded Context**: Gym Management (`packages/core/src/gym/`)
- **ADR References**: [ADR-0054](../adr/0054-gym-management-bounded-context-ownership-and-context-map.md), [ADR-0064](../adr/0064-gym-management-attendance-domain-boundary-identity-and-append-only-log-model.md), [ADR-0065](../adr/0065-gym-management-membership-eligibility-contract-and-cross-context-integration.md), [ADR-0066](../adr/0066-gym-management-record-check-in-use-case-anti-passback-and-idempotency.md), [ADR-0067](../adr/0067-gym-management-duplicate-check-in-concurrency-and-idempotency-architecture.md), [ADR-0068](../adr/0068-gym-management-attendance-history-and-operational-read-models.md)

---

## 1. Executive Summary

This specification establishes the read-model architecture and CQRS query handlers for:

1. **`GetDailyAttendanceQuery`**: Operational real-time feed of today's access log and daily KPIs.
2. **`GetClientAttendanceHistoryQuery`**: Member visit timeline, total visits, and first/last attendance timestamps.
3. **`GetAttendanceSummaryQuery`**: Aggregated analytics, peak traffic hour computation, and method breakdowns.

---

## 2. Read-Model Architecture & CQRS Separation

```mermaid
graph TD
    subgraph Commands (Write Model)
        Cmd[RecordCheckInCommand] --> Handler[RecordCheckInHandler]
        Handler --> Aggregate[AttendanceRecord.record]
        Aggregate --> Log[(Append-Only Attendance Log)]
    end

    subgraph Queries (Read Model)
        Q1[GetDailyAttendanceQuery] --> H1[GetDailyAttendanceHandler]
        Q2[GetClientAttendanceHistoryQuery] --> H2[GetClientAttendanceHistoryHandler]
        Q3[GetAttendanceSummaryQuery] --> H3[GetAttendanceSummaryHandler]
        H1 & H2 & H3 --> DTOs[AttendanceItemDTO / PaginatedAttendanceResultDTO / AttendanceRangeSummaryDTO]
    end

    Log -. Read .- H1 & H2 & H3
```

---

## 3. Query Specifications & API Contracts

### 3.1 Get Daily Attendance Feed (`GetDailyAttendanceQuery`)

- **Parameters**: `date?: string` (YYYY-MM-DD), `facilityId?: string`, `result?: AccessResult`, `method?: CheckInMethod`, `page?: number`, `limit?: number`, `sortOrder?: 'ASC' | 'DESC'`.
- **Timezone Resolution**: If `date` is omitted, resolves local `GymDay` using `Clock` and facility timezone (e.g. `America/Guayaquil`).
- **Response**: `PaginatedAttendanceResultDTO` with `items`, `pagination`, and `dailySummary`:
  - `totalCheckIns`: Total ingress attempts today (including denials).
  - `grantedCount`: Successful admissions today.
  - `deniedCount`: Denied ingress attempts today.
  - `uniqueClientsCount`: Count of distinct clients granted admission today.

### 3.2 Member Visit Timeline (`GetClientAttendanceHistoryQuery`)

- **Parameters**: `clientId: string`, `dateFrom?: string | Date`, `dateTo?: string | Date`, `result?: AccessResult`, `page?: number`, `limit?: number`.
- **Response**: `PaginatedAttendanceResultDTO` with `clientStats`:
  - `totalVisits`: Lifetime or filtered total granted visits.
  - `firstVisitAt`: Earliest visit timestamp.
  - `lastVisitAt`: Most recent visit timestamp.

### 3.3 Attendance Analytics & Summary (`GetAttendanceSummaryQuery`)

- **Parameters**: `startDate?: string`, `endDate?: string`, `facilityId?: string`.
- **Response**: `AttendanceRangeSummaryDTO` containing `dailyBreakdown` with:
  - Total granted and denied attempts per day.
  - Unique visitors per day and range total unique visitors.
  - `hourlyDistribution`: 24-hour traffic histogram.
  - `peakHour`: Peak operational hour and visitor volume.
  - `byMethod`: Distribution by `BARCODE`, `RFID`, `QR_CODE`, `MANUAL_RECEPTION`, `BIOMETRIC`.
  - `byAccessResult`: Breakdown by `GRANTED`, `DENIED_EXPIRED`, `DENIED_FROZEN`, etc.

---

## 4. Historical Integrity Guarantees

- Attendance records are append-only and snapshot facts as they occurred.
- Historical queries never perform SQL joins that would mutate past data if a client updates their name, a membership plan is renamed, or a membership is renewed.

---

## 5. Verification Test Suites

- [`get-daily-attendance.handler.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/application/queries/get-daily-attendance.handler.spec.ts) (4/4 tests passing)
- [`get-client-attendance-history.handler.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/application/queries/get-client-attendance-history.handler.spec.ts) (3/3 tests passing)
- [`get-attendance-summary.handler.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/gym/application/queries/get-attendance-summary.handler.spec.ts) (2/2 tests passing)
