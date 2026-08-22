# ADR-0079: Gym Management Application Layer Use-Case Inventory & Architecture

- **Status**: ACCEPTED
- **Date**: 2026-08-22
- **Author**: Principal Application Architect
- **Context**: Milestone 5.7 (Gym Management Application Layer & Workflows)

---

## 1. Context & Problem Statement

Milestones 5.1–5.6 established the core domain aggregates (`Membership`, `MembershipPlan`, `AttendanceRecord`), policies, and read models for the Gym Management bounded context. To expose these capabilities safely to API controllers, background schedulers, and UI workflows without leaking domain internals or bypassing domain invariants, we must define an explicit application-layer use-case architecture.

The application layer must orchestrate transactions, load dependencies, enforce authorization policies, invoke domain behaviors, persist aggregates, and dispatch events without introducing generic CRUD services or duplicate business rules.

---

## 2. Architectural Principles & Layer Boundaries

1. **Domain Layer**:
   - Owns business invariants, lifecycle state machines, value objects, and domain events.
   - Zero awareness of HTTP, DTOs, frameworks, or persistence mechanisms.
2. **Application Layer**:
   - Implements explicit Command and Query Handlers (CQRS pattern).
   - Orchestrates dependency loading, authorization evaluation, transaction coordination, and event publishing.
   - Maps domain entities/aggregates to immutable presentation-safe DTOs.
   - Forbids generic mutation services (e.g. no `updateMembership` dump).
3. **Infrastructure Layer**:
   - Implements persistence adapters (Prisma/PostgreSQL), event outbox dispatchers, and logging adapters.
4. **Presentation Layer**:
   - Handles HTTP routing, input validation (DTO pipes), session decoding, and serialization.

---

## 3. Comprehensive Use-Case Inventory

### A. Commands (State Modifications)

| Command                              | Handler                              | Aggregates Involved              | Transaction Boundary   | Emitted Events                            |
| ------------------------------------ | ------------------------------------ | -------------------------------- | ---------------------- | ----------------------------------------- |
| `CreateMembershipCommand`            | `CreateMembershipHandler`            | `Membership`, `MembershipPlan`   | Atomic Unit of Work    | `MembershipCreatedEvent`                  |
| `RenewMembershipCommand`             | `RenewMembershipHandler`             | `Membership`, `MembershipPlan`   | Atomic Unit of Work    | `MembershipRenewedEvent`                  |
| `FreezeMembershipCommand`            | `FreezeMembershipHandler`            | `Membership`                     | Atomic Unit of Work    | `MembershipFrozenEvent`                   |
| `UnfreezeMembershipCommand`          | `UnfreezeMembershipHandler`          | `Membership`                     | Atomic Unit of Work    | `MembershipUnfrozenEvent`                 |
| `CancelMembershipCommand`            | `CancelMembershipHandler`            | `Membership`                     | Atomic Unit of Work    | `MembershipCancelledEvent`                |
| `ExpireMembershipsCommand`           | `ExpireMembershipsHandler`           | Batch `Membership`s              | Batch Atomic Execution | `MembershipExpiredEvent` (per membership) |
| `CreateMembershipPlanCommand`        | `CreateMembershipPlanHandler`        | `MembershipPlan`                 | Atomic Unit of Work    | `MembershipPlanCreatedEvent`              |
| `UpdateMembershipPlanPricingCommand` | `UpdateMembershipPlanPricingHandler` | `MembershipPlan`                 | Atomic Unit of Work    | `MembershipPlanPriceChangedEvent`         |
| `PublishMembershipPlanCommand`       | `PublishMembershipPlanHandler`       | `MembershipPlan`                 | Atomic Unit of Work    | `MembershipPlanPublishedEvent`            |
| `ArchiveMembershipPlanCommand`       | `ArchiveMembershipPlanHandler`       | `MembershipPlan`                 | Atomic Unit of Work    | `MembershipPlanArchivedEvent`             |
| `RecordCheckInCommand`               | `RecordCheckInHandler`               | `AttendanceRecord`, `Membership` | Atomic Unit of Work    | `AttendanceRecordedEvent`                 |

### B. Queries (Read Models & Projections)

| Query                                  | Handler                                  | Read Source                        | Authorization Scope                                |
| -------------------------------------- | ---------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `GetMembershipByIdQuery`               | `GetMembershipByIdHandler`               | `MembershipRepository`             | Admin, Receptionist, Assigned Trainer, Self Client |
| `ListMembershipsByClientQuery`         | `ListMembershipsByClientHandler`         | `MembershipRepository`             | Admin, Receptionist, Assigned Trainer, Self Client |
| `GetExpiringMembershipsQuery`          | `GetExpiringMembershipsHandler`          | `MembershipRepository`             | Admin, Receptionist                                |
| `GetMembershipOperationalSummaryQuery` | `GetMembershipOperationalSummaryHandler` | `MembershipRepository`             | Admin, Receptionist                                |
| `CheckMembershipEligibilityQuery`      | `CheckMembershipEligibilityHandler`      | `MembershipRepository`             | Admin, Receptionist, Trainer                       |
| `GetMembershipPlanByIdQuery`           | `GetMembershipPlanByIdHandler`           | `MembershipPlanRepository`         | Public / Authenticated                             |
| `ListMembershipPlansQuery`             | `ListMembershipPlansHandler`             | `MembershipPlanRepository`         | Public / Authenticated                             |
| `GetDailyAttendanceQuery`              | `GetDailyAttendanceHandler`              | `AttendanceRecordRepository`       | Admin, Receptionist                                |
| `GetClientAttendanceHistoryQuery`      | `GetClientAttendanceHistoryHandler`      | `AttendanceRecordRepository`       | Admin, Receptionist, Self Client                   |
| `GetAttendanceSummaryQuery`            | `GetAttendanceSummaryHandler`            | `AttendanceRecordRepository`       | Admin, Receptionist                                |
| `GetTrainerDashboardSummaryQuery`      | `GetTrainerDashboardSummaryHandler`      | `MembershipRepo`, `AttendanceRepo` | Trainer (Scoped to Assigned Clients)               |
| `GetAssignedClientMembershipsQuery`    | `GetAssignedClientMembershipsHandler`    | `MembershipRepo`, `PlanRepo`       | Trainer (Scoped to Assigned Clients)               |

---

## 4. Authorization & Security Boundary

Authorization is evaluated at the presentation/application boundary before domain logic execution:

- **Tenant Isolation**: Queries and Commands are strictly isolated within the authenticated tenant scope.
- **Role Enforcement**:
  - `Admin` / `Owner`: Full access across all commands and queries.
  - `Receptionist`: Membership creation, renewal, check-in recording, plan browsing, operational queries.
  - `Trainer`: Restricted to assigned client scopes (`TrainerAccessPolicy`) and check-in eligibility verification.
  - `Client`: Read-only access to own memberships and attendance history.

---

## 5. Consequences & Compliance

- **Elimination of Generic CRUD**: All state modifications route through explicit lifecycle commands (`freeze`, `unfreeze`, `cancel`, `renew`, `publish`, etc.).
- **Zero Domain Duplication**: Business invariants (freeze windows, date calculations, quota checks) remain strictly inside domain entities and value objects.
- **Safe Projections**: All query and command responses return immutable DTOs, keeping internal domain aggregate state encapsulated.
