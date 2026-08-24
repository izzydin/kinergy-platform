# ADR-0080: Gym Management Production Persistence, Relational Mapping & Constraint Model

- **Status**: Accepted
- **Deciders**: Principal Architect, Principal Data Architect, Lead Backend Engineer
- **Date**: 2026-08-24
- **Context/Milestone**: Phase 5 — Gym Management Final Persistence Audit

---

## Context and Problem Statement

The Gym Management bounded context requires production-grade relational persistence in PostgreSQL via Prisma ORM.
The persistence layer must enforce database integrity without violating Domain-Driven Design (DDD) boundaries or leaking ORM abstractions into domain aggregates.

Specific requirements:

1. Historical preservation of commercial plan references and audit permanence of check-in events.
2. Indexing strategies that directly support operational check-in lookups ($< 50\text{ms}$ latency) and nightly expiration batch processing.
3. Clean bi-directional mapping between Prisma models, PostgreSQL types (`Decimal`, `Json`, `Enum`), and domain Value Objects (`PlanPrice`, `FreezeWindow`, `GymDay`).

---

## Decision Drivers

- **Zero Domain Pollution**: Domain layer (`packages/core/src/gym/domain`) must have 0 dependencies on `@prisma/client`.
- **Relational Integrity**: Foreign keys must prevent orphan active memberships and prevent destructive cascading deletions of historical attendance logs.
- **Audit Permanence**: Physical access logs (`attendance_records`) are write-once facts.
- **Temporal Performance**: Fast filtering by `[clientId, status]` and `[status, endDate]`.

---

## Decision Outcome

### 1. Schema & Relational Structure

1. **`membership_plans` Table**:
   - `id`: UUID primary key.
   - `code`: Unique varchar code.
   - `price_amount`: `Decimal(10, 2)` (precise currency math).
   - `price_currency`: Default `USD`.
   - `duration_days`: Positive integer.
   - `status`: `PlanStatus` enum (`DRAFT`, `ACTIVE`, `ARCHIVED`).
   - `version`: Monotonic integer for optimistic concurrency.

2. **`memberships` Table**:
   - `id`: UUID primary key.
   - `client_id`: Scalar string referencing the external Client context.
   - `plan_id`: Foreign key referencing `membership_plans.id` with `onDelete: Restrict`.
   - `status`: `MembershipStatus` enum (`PENDING`, `ACTIVE`, `FROZEN`, `EXPIRED`, `CANCELLED`, `TERMINATED`).
   - `start_date`, `end_date`: `TIMESTAMP WITH TIME ZONE`.
   - `freeze_history`: JSON column storing structured `FreezeWindow` intervals.
   - Indexes: `[client_id, status]`, `[status, end_date]`, `[plan_id]`, `[assigned_trainer_id]`.

3. **`attendance_records` Table**:
   - `id`: UUID primary key.
   - `client_id`: Scalar string.
   - `membership_id`: Foreign key referencing `memberships.id` with `onDelete: SetNull` (preserves historical entry logs even if membership records are purged).
   - `check_in_time`: `TIMESTAMP WITH TIME ZONE`.
   - `gym_day`: String encoding facility date `${localDate}@${facilityId}(${timezone})`.
   - `method`: `CheckInMethod` enum (`QR_CODE`, `BARCODE`, `RFID`, `MANUAL_RECEPTION`, `BIOMETRIC`).
   - `result`: `AccessResult` enum (`GRANTED`, `DENIED_*`).
   - Indexes: `[client_id, check_in_time DESC]`, `[gym_day]`, `[membership_id]`, `[result]`.

### 2. Hexagonal Repository Pattern

All persistence operations are implemented in `packages/core/src/gym/infrastructure/persistence/prisma/`:

- `PrismaMembershipPlanRepository` implements `MembershipPlanRepository`
- `PrismaMembershipRepository` implements `MembershipRepository`
- `PrismaAttendanceRecordRepository` implements `AttendanceRecordRepository`

Bi-directional conversion is encapsulated within pure mapper classes (`PrismaMembershipPlanMapper`, `PrismaMembershipMapper`, `PrismaAttendanceRecordMapper`).

---

## Consequences

- **Positive**: Complete relational integrity, zero domain pollution, high-performance querying for turnstile check-in and batch expiration.
- **Negative**: Requires maintaining explicit mapper translation logic between domain VOs and Prisma models.
