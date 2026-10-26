# Milestone 6.1: Gym Domain and Attendance Audit Report

**Status:** Completed  
**Author:** Senior Software Architect & Full-Stack Engineer  
**Scope:** Milestone 6.1 Gym Management Bounded Context, Membership Lifecycle, Attendance Ingress, Trainer Operations, and Dual Frontend Attendance Audit  
**Date:** October 2026  
**Audited Directories:** `packages/core/src/gym`, `apps/api/src/gym`, `apps/web/src/modules/attendance`, `apps/web/src/modules/gym`, `prisma/schema.prisma`  
**Governing ADRs:** ADR-0054, ADR-0055, ADR-0056, ADR-0057, ADR-0058, ADR-0059, ADR-0060, ADR-0061, ADR-0062, ADR-0063, ADR-0064, ADR-0065, ADR-0066, ADR-0067, ADR-0068, ADR-0069, ADR-0070, ADR-0073, ADR-0074, ADR-0075, ADR-0076, ADR-0077, ADR-0078, ADR-0079, ADR-0080, ADR-0139, ADR-0140

---

## 1. Executive Summary

A rigorous, read-only architectural and operational audit of the **Gym Management Bounded Context** was performed across domain models, CQRS use cases, NestJS HTTP controllers, Prisma relational persistence, and frontend React modules. Particular scrutiny was applied to the coexistence of two competing attendance frontend implementations:

- `apps/web/src/modules/attendance/`
- `apps/web/src/modules/gym/attendance/`

### Key Audit Findings & Architectural Verdict

1. **Definitive Canonical Frontend Attendance Module (`apps/web/src/modules/gym/attendance/`)**:
   - The implementation nested under `apps/web/src/modules/gym/attendance/` is the **canonical, production-grade module**. It provides a strict functional and architectural superset over `apps/web/src/modules/attendance/`.
   - **Contract Fidelity**: `modules/gym/attendance/api/attendance-api.ts` maps 100% accurately to the live NestJS backend routes (`GET /api/v1/gym/memberships/eligibility/check`, `GET /api/v1/gym/attendance/client/:clientId`, and `GET /api/v1/gym/attendance/search`). In contrast, the standalone `apps/web/src/modules/attendance/` targets **non-existent endpoints** (`/eligibility/:clientId` and `/clients/:clientId/history`) that yield HTTP 404 in live production.
   - **Operational Ergonomics**: `modules/gym/attendance/` implements full URL state synchronization (`useAttendanceFilters` via `useTableUrlState`), deep-linking (`?clientId=...`, `?historyClientId=...`, `?result=...`, `?method=...`), and an interactive member visit history modal (`ClientAttendanceHistoryDialog`).
   - **Roadmap Confirmation**: `ROADMAP-FE-006` (§3, Milestone 6) and `temporary-ui-disposition.md` (Item D-1) explicitly dictate retiring `apps/web/src/modules/attendance/` in favor of `apps/web/src/modules/gym/attendance/`.
   - **Navigation Misalignment**: The primary application navigation config (`navigation.config.ts#L69`) currently points the sidebar item `"Attendance & Check-In"` to `/attendance` (the obsolete module) rather than `/gym/attendance`.

2. **Mature Domain Core & Exhaustive Test Baseline (`packages/core/src/gym`)**:
   - The domain core is exceptionally robust: **48 test suites and 482 unit/integration tests pass deterministically** with 100% success rate (`packages/core/src/gym`).
   - Pure DDD aggregates (`Membership`, `MembershipPlan`, `AttendanceRecord`) strictly protect business invariants, date interval boundaries, freeze windows, and optimistic concurrency versioning.
   - Comprehensive anti-passback cooldowns ($300,000\text{ ms} = 5\text{ minutes}$), facility local midnight GymDay partitioning (`GymDay.fromUtc`), and client-scoped idempotency caching ($10\text{ minutes}$) are fully verified.

3. **Prisma Persistence Active, but Critical Dependency Injection Stubs Exist (`apps/api/src/gym`)**:
   - Following Milestone 1 compliance with ADR-0080, production Prisma repositories (`PrismaMembershipRepository`, `PrismaMembershipPlanRepository`, `PrismaAttendanceRecordRepository`) are wired in `gym.module.ts`. **5 API test suites with 57 tests pass**.
   - **Critical Gap 1 — Identity Client Lookup Bypass (`DefaultClientLookupPort`)**: In `gym.module.ts#L68-72`, `ClientLookupPort` is bound to a dummy class whose `validateClientExists()` unconditionally returns `true`. Client existence and active status in Client Management are never validated in live runtime.
   - **Critical Gap 2 — Domain Event Discard Dead-End (`DefaultGymEventPublisherPort`)**: In `gym.module.ts#L74-76`, `GymEventPublisherPort` is bound to an empty stub (`async publish(): Promise<void> {}`). Domain events (`MembershipCreatedEvent`, `MembershipRenewedEvent`, `AttendanceCheckedInEvent`) are dropped in memory, preventing cross-domain projections (such as client timeline updates).
   - **Critical Gap 3 — In-Memory Concurrency Mutex Limit**: The turnstile admission lock in `RecordCheckInHandler` (`clientLocks = new Map<string, Promise<void>>()`) is local in-process memory. In a clustered multi-node deployment, concurrent turnstile requests for the same client can bypass serialization.
   - **Critical Gap 4 — Optimistic Concurrency Blindspot**: `PrismaMembershipRepository.save()` executes an `upsert` incrementing `version` without enforcing `where: { id, version: expectedVersion }`. Concurrent membership mutations do not raise HTTP 409 Conflict.

4. **Trainer Operational Dashboard Readiness (`/gym/trainer-dashboard`)**:
   - Fully built across backend controllers (`TrainerDashboardController`) and frontend workspace (`TrainerDashboardPage`).
   - Enforces strict horizontal scoping (trainers only access their assigned clients), commercial price masking (plan price hidden from floor trainers without `billing.read`), and read-only diagnostic admission feeds.
   - Verified by **9 passing frontend test suites (71 tests)** in `apps/web/src/modules/gym`.

---

## 2. Attendance Implementation Comparison Matrix

| Architectural Dimension         | Standalone Module (`apps/web/src/modules/attendance/`)                                             | Gym-Nested Module (`apps/web/src/modules/gym/attendance/`)                                                                                      | Audit Assessment & Evidence                                                                                                                                       |
| :------------------------------ | :------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route Prefix & Ownership**    | Mounted at `/attendance/*` via central `moduleRegistry` with `['gym.attendance.read']`.            | Mounted as child sub-route `attendance/*` under `/gym` in `gym.router.tsx` with `['memberships.read']`.                                         | `gym/attendance` is logically grouped under gym bounded context; standalone route creates dual-entry confusion.                                                   |
| **Sidebar Navigation Link**     | Target of sidebar item `id: 'attendance'` (`path: '/attendance'`).                                 | Unreachable from primary sidebar directly (only reachable via sub-navigation or direct URL `/gym/attendance`).                                  | **Bug in navigation config**: Sidebar points to obsolete module.                                                                                                  |
| **Eligibility API Endpoint**    | `GET /api/v1/gym/memberships/eligibility/:clientId`                                                | `GET /api/v1/gym/memberships/eligibility/check?clientId=:id&asOf=:iso`                                                                          | **Fatal Bug in `modules/attendance`**: Endpoint does not exist in NestJS controller; hits `@Get(':id')` and throws 404. `gym/attendance` matches backend exactly. |
| **Client History API Endpoint** | `GET /api/v1/gym/attendance/clients/:clientId/history`                                             | `GET /api/v1/gym/attendance/client/:clientId`                                                                                                   | **Fatal Bug in `modules/attendance`**: Endpoint does not exist in NestJS controller (yields 404). `gym/attendance` matches `@Get('client/:clientId')`.            |
| **Search Attendance API**       | _Not Implemented_                                                                                  | `GET /api/v1/gym/attendance/search` with multi-criteria query parameters.                                                                       | `gym/attendance` implements complete API contract.                                                                                                                |
| **Check-In Admission API**      | `POST /api/v1/gym/attendance/check-in`                                                             | `POST /api/v1/gym/attendance/check-in`                                                                                                          | Both correctly target admission endpoint.                                                                                                                         |
| **Today's Feed API**            | `GET /api/v1/gym/attendance/today`                                                                 | `GET /api/v1/gym/attendance/today`                                                                                                              | Both correctly target daily operational feed.                                                                                                                     |
| **URL State Synchronization**   | **None.** Local component state (`useState`) only; state lost on page reload.                      | **Full URL state sync** via `useAttendanceFilters` and `useTableUrlState` (`result`, `method`, `clientId`, `historyClientId`, `page`, `limit`). | `gym/attendance` enables bookmarkable deep-linking and browser navigation history.                                                                                |
| **Client History Inspection**   | **None.** Table rows are static.                                                                   | **Interactive Dialog Modal** (`ClientAttendanceHistoryDialog`) opens when clicking "History" on any table row.                                  | `gym/attendance` delivers essential front-desk operational verification.                                                                                          |
| **Query Key Taxonomy**          | Flat keys: `['attendance', 'today']`, `['attendance', 'eligibility', id]`.                         | Hierarchical bounded context keys: `['gym', 'attendance', 'today', ...]`, `['gym', 'attendance', 'eligibility', ...]`.                          | `gym/attendance` avoids cross-module TanStack Query cache key collision.                                                                                          |
| **Duplicate Scan Feedback**     | Toast notification on `DENIED_DUPLICATE_CHECKIN`.                                                  | Toast notification on `DENIED_DUPLICATE_CHECKIN` with cooldown detail.                                                                          | Both handle 5-minute cooldown feedback.                                                                                                                           |
| **Scanner Auto-Focus**          | Supported via `autoFocus` on `ClientSearchBar`.                                                    | Supported via `autoFocus` on `ClientSearchBar`.                                                                                                 | Identical scanner ergonomics.                                                                                                                                     |
| **Shared UI Primitives**        | Reusable `@kinergy-platform/ui` cards, badges, buttons, inputs.                                    | Reusable `@kinergy-platform/ui` cards, badges, buttons, inputs.                                                                                 | Compliant with design standards.                                                                                                                                  |
| **Automated Test Coverage**     | 2 test files, 8 tests passed (`attendance-api.spec.ts`, `attendance-reception-workflow.spec.tsx`). | Covered across 7 test suites, 71 tests passed in `apps/web/src/modules/gym/__tests__/`.                                                         | `gym/attendance` has significantly deeper integration and workflow verification.                                                                                  |
| **Roadmap Disposition**         | Explicitly flagged for deprecation/removal in `ROADMAP-FE-006` and `temporary-ui-disposition.md`.  | Ratified as the target canonical implementation for Milestone 6.                                                                                | Unambiguous roadmap mandate.                                                                                                                                      |

---

## 3. Route and Consumer Inventory

### 3.1 Registered Frontend Routes

```mermaid
graph TD
    AppRouter["AppRouter (apps/web/src/app/routes/app-router.tsx)"]

    subgraph "Standalone Attendance SubRouter"
        AppRouter -->|"/attendance/*"| AttSub["AttendanceSubRouter (modules/attendance)"]
        AttSub -->|""| AttPage["AttendanceReceptionPage (BROKEN API CONTRACTS)"]
    end

    subgraph "Gym Operations SubRouter"
        AppRouter -->|"/gym/*"| GymSub["GymManagementSubRouter (modules/gym)"]
        GymSub -->|"memberships/*"| MemSub["MembershipsSubRouter (/gym/memberships)"]
        GymSub -->|"plans/*"| PlanSub["PlansSubRouter (/gym/plans)"]
        GymSub -->|"attendance/*"| GymAttSub["GymAttendanceSubRouter (/gym/attendance)"]
        GymSub -->|"trainer-dashboard/*"| TrainSub["TrainerDashboardSubRouter (/gym/trainer-dashboard)"]

        GymAttSub -->|""| CanonicalAttPage["AttendancePage (CANONICAL, PRODUCTION-READY)"]
    end
```

### 3.2 Consumer Analysis

A comprehensive grep across the entire workspace identified the following consumers:

1. **`apps/web/src/modules/attendance/` Consumers**:
   - `apps/web/src/app/routes/app-router.tsx` (Line 8: `import '../../modules/attendance/routes/attendance.router';`)
   - `apps/web/src/app/navigation/navigation.config.ts` (Line 69: `path: '/attendance'`)
   - `apps/web/src/app/breadcrumbs/__tests__/breadcrumb-generator.spec.ts` (Lines 74, 89)
   - `apps/web/src/app/navigation/__tests__/navigation-builder.spec.ts` (Lines 15, 35, 42, 66, 86)
   - `apps/web/src/app/routes/__tests__/routing-architecture-integration.spec.tsx` (Lines 300, 372, 382)
   - `docs/architecture/gym-attendance-reception-workflow-frontend.md` (Legacy documentation)
   - _Zero domain feature modules import components or hooks from `modules/attendance`._

2. **`apps/web/src/modules/gym/attendance/` Consumers**:
   - `apps/web/src/modules/gym/routes/gym.router.tsx` (Lines 17–20, Line 35: `<Route path="attendance/*" element={<GymAttendanceSubRouter />} />`)
   - `apps/web/src/modules/gym/__tests__/attendance-workflows.spec.tsx` (9 comprehensive workflow tests)
   - `apps/web/src/modules/gym/__tests__/url-driven-state-hardening.spec.tsx` (Tests URL synchronization on `/gym/attendance`)
   - `apps/web/src/modules/gym/__tests__/gym-critical-business-workflows.e2e.spec.tsx` (Tests end-to-end admission on `/gym/attendance`)
   - `apps/web/src/modules/dashboard/__tests__/operational-dashboard.spec.tsx` (Integrates attendance stats)

---

## 4. Recommended Canonical Attendance Implementation and Evidence

### Architectural Recommendation

**Retire `apps/web/src/modules/attendance/` immediately and establish `apps/web/src/modules/gym/attendance/` as the sole canonical attendance implementation.**

### Evidence Base

1. **API Contract Verification**:
   - Live NestJS endpoint: `@Get('eligibility/check')` (`api/v1/gym/memberships/eligibility/check?clientId=...`).
     - `modules/gym/attendance/api/attendance-api.ts#L28`: **Matches 100%**.
     - `modules/attendance/api/attendance-api.ts#L29`: Calls `/eligibility/${clientId}` $\to$ **Fails with 404**.
   - Live NestJS endpoint: `@Get('client/:clientId')` (`api/v1/gym/attendance/client/:clientId`).
     - `modules/gym/attendance/api/attendance-api.ts#L57`: **Matches 100%**.
     - `modules/attendance/api/attendance-api.ts#L59`: Calls `/clients/${clientId}/history` $\to$ **Fails with 404**.

2. **Feature Completeness**:
   - `modules/gym/attendance` includes `ClientAttendanceHistoryDialog` for inspecting a member's visit history directly from the turnstile table. `modules/attendance` has no modal or historical drilldown.
   - `modules/gym/attendance` has bidirectional URL query synchronization (`clientId`, `historyClientId`, `result`, `method`, `page`, `limit`).

3. **Roadmap Precedent**:
   - `ROADMAP-FE-006` line 199 states: `apps/web/src/modules/attendance/ (deprecated/removed in favor of gym/attendance)`.
   - `temporary-ui-disposition.md` disposition D-1 confirmed that `gym/attendance` is the intended target.

### Action Plan for Milestone 6 Implementation

1. Update `apps/web/src/app/navigation/navigation.config.ts`: Change `attendance` path from `/attendance` to `/gym/attendance`.
2. Update `apps/web/src/app/routes/app-router.tsx`: Remove `import '../../modules/attendance/routes/attendance.router';`. Add redirect from `/attendance` to `/gym/attendance` for backwards compatibility.
3. Update routing and navigation unit tests to expect `/gym/attendance`.
4. Delete deprecated directory `apps/web/src/modules/attendance/`.

---

## 5. Gym API and DTO Contract Matrix

### 5.1 Attendance Endpoints (`AttendanceController` at `api/v1/gym/attendance`)

| Operation                            | Method & Path                                 | Request DTO / Query                                                                                                                                                | Response DTO                     | Application Handler                 | Permissions & Roles                                              | Invariants & Business Logic                                                                                                                                                | Test Coverage                             | Status                                                  |
| :----------------------------------- | :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- | :---------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :------------------------------------------------------ |
| **Record Check-In Admission**        | `POST /api/v1/gym/attendance/check-in`        | `RecordCheckInRequestDto`<br>• `clientId: string`<br>• `method?: CheckInMethod`<br>• `gateId?: string`<br>• `notes?: string`<br>• `idempotencyKey?: string`        | `RecordCheckInResponseDto`       | `RecordCheckInHandler`              | `attendance.create`<br>Admin, Owner, Receptionist                | Serialized via in-memory client mutex; evaluates eligibility; enforces 5-min anti-passback cooldown; replays cached idempotency (10-min TTL); appends immutable audit log. | Unit, integration & controller tests pass | **Implemented & Verified** _(Mutex is local in-memory)_ |
| **Daily Attendance Feed**            | `GET /api/v1/gym/attendance/today`            | `DailyAttendanceQueryDto`<br>• `date?: string`<br>• `facilityId?: string`<br>• `result?: string`<br>• `method?: string`<br>• `page?: number`<br>• `limit?: number` | `PaginatedAttendanceResponseDto` | `GetDailyAttendanceHandler`         | `attendance.read`<br>Admin, Owner, Receptionist                  | Facility-local GymDay partition; returns daily KPI summary (`grantedCount`, `deniedCount`, `totalCheckIns`) and paginated arrivals.                                        | Controller and core tests pass            | **Implemented & Verified**                              |
| **Attendance Summary KPIs**          | `GET /api/v1/gym/attendance/summary`          | `AttendanceSummaryQueryDto`<br>• `startDate: string`<br>• `endDate: string`<br>• `facilityId?: string`                                                             | `AttendanceRangeSummaryDTO`      | `GetAttendanceSummaryHandler`       | `attendance.read`<br>Admin, Owner, Receptionist                  | Calculates aggregate visit counts, peak hourly distribution, and admission channel breakdown across calendar interval.                                                     | Core handler and query tests pass         | **Implemented & Verified**                              |
| **Client Attendance History**        | `GET /api/v1/gym/attendance/client/:clientId` | Param: `clientId: string`<br>`ClientAttendanceHistoryQueryDto`<br>• `dateFrom?: string`<br>• `dateTo?: string`<br>• `page?: number`<br>• `limit?: number`          | `PaginatedAttendanceResponseDto` | `GetClientAttendanceHistoryHandler` | `attendance.read`<br>Admin, Owner, Receptionist, Trainer, Client | Chronological arrival history for single client; calculates `totalVisits`, `firstVisitAt`, `lastVisitAt`.                                                                  | Controller and core tests pass            | **Implemented & Verified**                              |
| **Multi-Criteria Attendance Search** | `GET /api/v1/gym/attendance/search`           | `SearchAttendanceQueryDto`<br>• `clientId?`, `gymDay?`<br>• `dateFrom?`, `dateTo?`<br>• `facilityId?`, `result?`<br>• `method?`, `page?`, `limit?`                 | `PaginatedAttendanceResponseDto` | `SearchAttendanceHandler`           | `attendance.read`<br>Admin, Owner, Receptionist                  | Arbitrary historical audit filtering across admission records.                                                                                                             | Controller and core tests pass            | **Implemented & Verified**                              |

### 5.2 Membership Plan Endpoints (`MembershipPlansController` at `api/v1/gym/membership-plans`)

| Operation                  | Method & Path                                    | Request DTO / Query                                                                                                                                                                                                   | Response DTO                          | Application Handler                  | Permissions & Roles            | Invariants & Business Logic                                                                                   | Test Coverage                             | Status                     |
| :------------------------- | :----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ | :----------------------------------- | :----------------------------- | :------------------------------------------------------------------------------------------------------------ | :---------------------------------------- | :------------------------- |
| **Create Membership Plan** | `POST /api/v1/gym/membership-plans`              | `CreateMembershipPlanRequestDto`<br>• `code: string`<br>• `name: string`<br>• `description?: string`<br>• `durationInDays: number`<br>• `priceAmount: number`<br>• `priceCurrency: string`<br>• `visitQuota?: number` | `MembershipPlanResponseDto`           | `CreateMembershipPlanHandler`        | `plans.create`<br>Admin, Owner | Unique plan code; price $\ge 0$; duration $\ge 1$ day; starts strictly in `DRAFT` status.                     | Controller, core, and frontend tests pass | **Implemented & Verified** |
| **Get Plan by ID**         | `GET /api/v1/gym/membership-plans/:id`           | Param: `id: string`                                                                                                                                                                                                   | `MembershipPlanResponseDto`           | `GetMembershipPlanByIdHandler`       | Authenticated                  | UUID lookup; returns 404 if not found.                                                                        | Controller and core tests pass            | **Implemented & Verified** |
| **List Membership Plans**  | `GET /api/v1/gym/membership-plans`               | `ListMembershipPlansQueryDto`<br>• `activeOnly?: boolean`<br>• `status?: PlanStatus`<br>• `search?: string`<br>• `page?: number`<br>• `limit?: number`                                                                | `PaginatedMembershipPlansResponseDto` | `ListMembershipPlansHandler`         | Authenticated                  | Paginated catalog listing; supports filtering by `DRAFT`, `ACTIVE`, `ARCHIVED`.                               | Controller, core, and frontend tests pass | **Implemented & Verified** |
| **Update Plan Pricing**    | `PATCH /api/v1/gym/membership-plans/:id/pricing` | Param: `id: string`<br>`UpdateMembershipPlanPricingRequestDto`<br>• `priceAmount: number`<br>• `currency: string`                                                                                                     | `MembershipPlanResponseDto`           | `UpdateMembershipPlanPricingHandler` | `plans.update`<br>Admin, Owner | Updates pricing for future sales only; existing memberships remain decoupled; rejected on `ARCHIVED` plans.   | Controller and core tests pass            | **Implemented & Verified** |
| **Publish Plan**           | `POST /api/v1/gym/membership-plans/:id/publish`  | Param: `id: string`                                                                                                                                                                                                   | `MembershipPlanResponseDto`           | `PublishMembershipPlanHandler`       | `plans.update`<br>Admin, Owner | Transitions `DRAFT` $\to$ `ACTIVE`; idempotent if already `ACTIVE`; rejected on `ARCHIVED`.                   | Controller and core tests pass            | **Implemented & Verified** |
| **Archive Plan**           | `POST /api/v1/gym/membership-plans/:id/archive`  | Param: `id: string`                                                                                                                                                                                                   | `MembershipPlanResponseDto`           | `ArchiveMembershipPlanHandler`       | `plans.update`<br>Admin, Owner | Transitions `ACTIVE` $\to$ `ARCHIVED`; removes plan from new sales; prevents further price or detail updates. | Controller and core tests pass            | **Implemented & Verified** |

### 5.3 Membership Agreement Endpoints (`MembershipsController` at `api/v1/gym/memberships`)

| Operation                      | Method & Path                                   | Request DTO / Query                                                                                                                   | Response DTO                        | Application Handler                 | Permissions & Roles                                               | Invariants & Business Logic                                                                                      | Test Coverage                             | Status                                                       |
| :----------------------------- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------- | :---------------------------------- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :----------------------------------------------------------- |
| **Enroll / Create Membership** | `POST /api/v1/gym/memberships`                  | `CreateMembershipRequestDto`<br>• `clientId: string`<br>• `planId: string`<br>• `startDate: string`<br>• `assignedTrainerId?: string` | `MembershipResponseDto`             | `CreateMembershipHandler`           | `memberships.create`<br>Admin, Owner, Receptionist                | Plan must be `ACTIVE`; client validated; `MembershipOverlapPolicy` enforces zero overlapping active commitments. | Controller, core, and frontend tests pass | **Implemented & Verified** _(Client lookup stubbed in prod)_ |
| **Check Client Eligibility**   | `GET /api/v1/gym/memberships/eligibility/check` | `CheckEligibilityQueryDto`<br>• `clientId: string`<br>• `asOf?: string`                                                               | `MembershipEligibilityResponseDto`  | `CheckMembershipEligibilityHandler` | `memberships.read`<br>Admin, Owner, Receptionist, Trainer         | Authoritative admission engine: verifies client standing, active validity period, and non-frozen status.         | Controller, core, and frontend tests pass | **Implemented & Verified** _(Client lookup stubbed in prod)_ |
| **Get Membership by ID**       | `GET /api/v1/gym/memberships/:id`               | Param: `id: string`                                                                                                                   | `MembershipResponseDto`             | `GetMembershipByIdHandler`          | `memberships.read`<br>Admin, Owner, Receptionist, Trainer, Client | Full membership agreement details including freeze history.                                                      | Controller and core tests pass            | **Implemented & Verified**                                   |
| **List Memberships**           | `GET /api/v1/gym/memberships`                   | `ListMembershipsQueryDto`<br>• `clientId?`, `planId?`<br>• `status?`, `page?`, `limit?`<br>• Date range filters                       | `PaginatedMembershipsResponseDto`   | `ListMembershipsHandler`            | `memberships.read`<br>Admin, Owner, Receptionist                  | Multi-criteria server-side filtering with pagination.                                                            | Controller, core, and frontend tests pass | **Implemented & Verified**                                   |
| **Get Expiring Memberships**   | `GET /api/v1/gym/memberships/expiring`          | Query: `horizonDays?: number` (default 7)                                                                                             | `ExpiringMembershipsResponseDto`    | `GetExpiringMembershipsHandler`     | `memberships.read`<br>Admin, Owner, Receptionist, Trainer         | Queries active/frozen agreements expiring within $[1, \text{horizonDays}]$.                                      | Controller and core tests pass            | **Implemented & Verified**                                   |
| **List Expired Memberships**   | `GET /api/v1/gym/memberships/expired`           | Query: `page?`, `limit?`, `clientId?`                                                                                                 | `PaginatedMembershipsResponseDto`   | `ListExpiredMembershipsHandler`     | `memberships.read`<br>Admin, Owner, Receptionist                  | Lapsed/expired membership agreements.                                                                            | Controller and core tests pass            | **Implemented & Verified**                                   |
| **Renew Membership**           | `POST /api/v1/gym/memberships/:id/renew`        | Param: `id: string`<br>`RenewMembershipRequestDto`<br>• `newPlanId?: string`<br>• `effectiveDate?: string`                            | `MembershipResponseDto`             | `RenewMembershipHandler`            | `memberships.update`<br>Admin, Owner, Receptionist                | Gapless extension if currently active; re-activation from effective date if lapsed.                              | Controller, core, and frontend tests pass | **Implemented & Verified**                                   |
| **Freeze Membership**          | `POST /api/v1/gym/memberships/:id/freeze`       | Param: `id: string`<br>`FreezeMembershipRequestDto`<br>• `startDate: string`<br>• `endDate: string`<br>• `reason: string`             | `MembershipResponseDto`             | `FreezeMembershipHandler`           | `memberships.update`<br>Admin, Owner, Receptionist                | `ACTIVE` $\to$ `FROZEN`; captures `FreezeWindow`; suspends admission eligibility immediately.                    | Controller, core, and frontend tests pass | **Implemented & Verified**                                   |
| **Unfreeze Membership**        | `POST /api/v1/gym/memberships/:id/unfreeze`     | Param: `id: string`                                                                                                                   | `MembershipResponseDto`             | `UnfreezeMembershipHandler`         | `memberships.update`<br>Admin, Owner, Receptionist                | `FROZEN` $\to$ `ACTIVE`; automatically extends `endDate` by freeze duration; restores admission immediately.     | Controller, core, and frontend tests pass | **Implemented & Verified**                                   |
| **Cancel Membership**          | `POST /api/v1/gym/memberships/:id/cancel`       | Param: `id: string`<br>`CancelMembershipRequestDto`<br>• `reason: string`                                                             | `MembershipResponseDto`             | `CancelMembershipHandler`           | `memberships.update`<br>Admin, Owner, Receptionist                | `PENDING`/`ACTIVE`/`FROZEN` $\to$ `CANCELLED`; voluntary termination with reason audit.                          | Controller, core, and frontend tests pass | **Implemented & Verified**                                   |
| **Expire Batch Process**       | `POST /api/v1/gym/memberships/expire-batch`     | `ExpireMembershipsBatchRequestDto`<br>• `asOfDate?: string`<br>• `batchSize?: number`<br>• `dryRun?: boolean`                         | `ExpireMembershipsBatchResponseDto` | `ExpireMembershipsHandler`          | `memberships.update`<br>Admin, Owner                              | Scheduled batch maintenance expiring overdue agreements (`endDate <= asOfDate`).                                 | Controller and core tests pass            | **Implemented & Verified**                                   |

### 5.4 Trainer Dashboard Endpoints (`TrainerDashboardController` at `api/v1/gym/trainer-dashboard`)

| Operation                            | Method & Path                                            | Request DTO / Query                                                                                                           | Response DTO                          | Application Handler                   | Permissions & Roles                     | Invariants & Business Logic                                                                                                                   | Test Coverage                             | Status                     |
| :----------------------------------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ | :------------------------------------ | :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :------------------------- |
| **Trainer Summary KPIs**             | `GET /api/v1/gym/trainer-dashboard/summary`              | Query: `trainerId?`, `asOfDate?`, `horizonDays?`, `timezone?`, `facilityId?`                                                  | `TrainerDashboardSummaryResponseDto`  | `GetTrainerDashboardSummaryHandler`   | `clients.read`<br>Trainer, Admin, Owner | Scoped strictly to authenticated trainer unless Admin/Owner specifies `trainerId`. Returns active clients, expiring count, today's check-ins. | Controller, core, and frontend tests pass | **Implemented & Verified** |
| **Assigned Clients Roster**          | `GET /api/v1/gym/trainer-dashboard/clients`              | `AssignedClientsQueryDto`<br>• `page?`, `limit?`<br>• `statuses?`, `asOfDate?`<br>• `sortBy?`, `sortOrder?`<br>• `trainerId?` | `PaginatedAssignedClientsResponseDto` | `GetAssignedClientMembershipsHandler` | `clients.read`<br>Trainer, Admin, Owner | Scoped to trainer; commercial plan price masked/omitted (least privilege).                                                                    | Controller, core, and frontend tests pass | **Implemented & Verified** |
| **Expiring Assigned Memberships**    | `GET /api/v1/gym/trainer-dashboard/expiring-memberships` | `ExpiringMembershipsQueryDto`<br>• `horizonDays?` (default 7)<br>• `asOfDate?`, `trainerId?`                                  | `ExpiringMembershipsResponseDto`      | `GetExpiringMembershipsHandler`       | `clients.read`<br>Trainer, Admin, Owner | Scoped to trainer's assigned roster; sorted by days remaining ascending.                                                                      | Controller, core, and frontend tests pass | **Implemented & Verified** |
| **Assigned Clients Attendance Feed** | `GET /api/v1/gym/trainer-dashboard/attendance`           | `TrainerAttendanceQueryDto`<br>• `date?`, `facilityId?`<br>• `page?`, `limit?`, `trainerId?`                                  | `TrainerAttendanceResponseDto`        | `GetDailyAttendanceHandler`           | `clients.read`<br>Trainer, Admin, Owner | Resolves trainer's client ID whitelist, then filters daily check-ins strictly to those clients.                                               | Controller, core, and frontend tests pass | **Implemented & Verified** |

---

## 6. Membership Plan and Membership Lifecycle Matrix

### 6.1 MembershipPlan Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT: CreateMembershipPlan
    DRAFT --> ACTIVE: publish()
    ACTIVE --> ARCHIVED: archive()

    note right of DRAFT
      • Code, duration, visitQuota fixed
      • Not available for member enrollment
    end note

    note right of ACTIVE
      • Available for commercial purchase
      • updatePricing() affects FUTURE sales only
      • Cannot delete if memberships exist (onDelete: Restrict)
    end note

    note right of ARCHIVED
      • TERMINAL: Cannot be re-published
      • Pricing and details permanently locked
      • Historical memberships remain intact
    end note
```

#### Plan Rules & Invariants

1. **Commercial Decoupling (ADR-0059)**: Changing pricing on an `ACTIVE` plan via `updatePricing()` updates the template for future sales only. Existing membership agreements retain their original terms and prices.
2. **Catalog Immutability**: `durationDays` and `code` cannot be altered after creation. To change a plan's duration, staff must archive the plan and create a new one.
3. **Relational Deletion Protection**: `prisma/schema.prisma#L446` configures `plan MembershipPlan @relation(..., onDelete: Restrict)`. PostgreSQL strictly forbids deleting any plan referenced by historical memberships.

---

### 6.2 Membership Agreement Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: startDate in future
    [*] --> ACTIVE: startDate <= now
    PENDING --> ACTIVE: start date reached
    PENDING --> CANCELLED: cancel(reason)

    ACTIVE --> FROZEN: freeze(window)
    FROZEN --> ACTIVE: unfreeze() [extends endDate]

    ACTIVE --> EXPIRED: endDate reached
    FROZEN --> EXPIRED: endDate reached

    ACTIVE --> CANCELLED: cancel(reason)
    FROZEN --> CANCELLED: cancel(reason)

    EXPIRED --> ACTIVE: renew(additionalPeriod)
    ACTIVE --> ACTIVE: renew(additionalPeriod) [gapless extend]

    PENDING --> TERMINATED: terminate(reason)
    ACTIVE --> TERMINATED: terminate(reason)
    FROZEN --> TERMINATED: terminate(reason)
    EXPIRED --> TERMINATED: terminate(reason)
    CANCELLED --> TERMINATED: terminate(reason)

    note right of CANCELLED
      TERMINAL: Voluntary agreement end
      Reason recorded in audit trail
    end note

    note right of TERMINATED
      PERMANENTLY TERMINAL: Revocation
      Cannot renew, freeze, or reopen
    end note
```

#### Membership State Transition Invariants

| Current State | Target State | Trigger Method                              | Permitted? | Business Invariant & Concurrency Action                                                                                                                             |
| :------------ | :----------- | :------------------------------------------ | :--------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PENDING`     | `ACTIVE`     | Natural time passage or explicit activation |  **YES**   | Valid start of agreement. Version advances $v \to v + 1$. Emits `MembershipActivatedEvent`.                                                                         |
| `PENDING`     | `CANCELLED`  | `cancel(reason)`                            |  **YES**   | Pre-start cancellation. Sets `cancellationReason`. Emits `MembershipCancelledEvent`.                                                                                |
| `ACTIVE`      | `FROZEN`     | `freeze(window)`                            |  **YES**   | Captures `FreezeWindow` (`startDate`, `endDate`, `reason`). Immediately revokes check-in eligibility. Emits `MembershipFrozenEvent`.                                |
| `ACTIVE`      | `EXPIRED`    | `expire()` or `expireBatch()`               |  **YES**   | Triggered when `evalDate >= endDate`. Version advances. Emits `MembershipExpiredEvent`.                                                                             |
| `ACTIVE`      | `ACTIVE`     | `renew(additionalPeriod)`                   |  **YES**   | Seamless gapless extension: `endDate = endDate + durationDays`. Emits `MembershipRenewedEvent`.                                                                     |
| `ACTIVE`      | `CANCELLED`  | `cancel(reason)`                            |  **YES**   | Mid-term voluntary termination. Version advances. Emits `MembershipCancelledEvent`.                                                                                 |
| `FROZEN`      | `ACTIVE`     | `unfreeze()`                                |  **YES**   | Resumes agreement. **Automatically extends `endDate` by the exact duration of the freeze window.** Restores admission eligibility. Emits `MembershipUnfrozenEvent`. |
| `FROZEN`      | `CANCELLED`  | `cancel(reason)`                            |  **YES**   | Voluntary termination while on suspension. Emits `MembershipCancelledEvent`.                                                                                        |
| `EXPIRED`     | `ACTIVE`     | `renew(additionalPeriod)`                   |  **YES**   | Lapsed renewal: re-activates agreement from effective renewal date. Emits `MembershipRenewedEvent`.                                                                 |
| `CANCELLED`   | _Any state_  | `renew()` / `freeze()` / `unfreeze()`       |   **NO**   | Terminal state. Throws `InvalidMembershipTransitionException`.                                                                                                      |
| `TERMINATED`  | _Any state_  | _Any transition_                            |   **NO**   | Irrevocably terminal. Throws `InvalidMembershipTransitionException`.                                                                                                |

---

## 7. Attendance Eligibility and Concurrency Rules

### 7.1 Authoritative Eligibility Permutations (ADR-0062, ADR-0065)

Admission eligibility is authoritatively evaluated by `CheckMembershipEligibilityHandler` on the server and verified by `Phase 5.5-H` comprehensive test suite:

|   #   | Permutation Condition                                                          | Eligibility Outcome        | Admission Result         | Notes & Invariants                                                                                                                    |
| :---: | :----------------------------------------------------------------------------- | :------------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | Valid Client + `ACTIVE` Membership + `startDate <= now < endDate` + Not Frozen | `ELIGIBLE`                 | `GRANTED`                | Full access. Returns `membershipId` and `planId`.                                                                                     |
| **2** | Valid Client + `EXPIRED` Membership (`now >= endDate` or status `EXPIRED`)     | `EXPIRED`                  | `DENIED_EXPIRED`         | Access denied. Reason: `"Membership expired on <endDate>"`.                                                                           |
| **3** | Valid Client + `FROZEN` Membership (active freeze window)                      | `FROZEN`                   | `DENIED_FROZEN`          | Access suspended. Reason: `"Membership is currently frozen"`.                                                                         |
| **4** | Valid Client + `CANCELLED` or `TERMINATED` Membership                          | `CANCELLED` / `TERMINATED` | `DENIED_NO_MEMBERSHIP`   | Terminal status. Cannot admit.                                                                                                        |
| **5** | Valid Client + `PENDING` (Future `startDate > now`)                            | `NOT_YET_ACTIVE`           | `DENIED_NO_MEMBERSHIP`   | Pre-start. Reason: `"Membership valid from <startDate>"`.                                                                             |
| **6** | Valid Client + No Membership Records on File                                   | `NO_MEMBERSHIP`            | `DENIED_NO_MEMBERSHIP`   | No agreement on file.                                                                                                                 |
| **7** | Client Inactive / Terminated in Client Management                              | `INACTIVE_CLIENT`          | `DENIED_INACTIVE_CLIENT` | Cross-context barrier: Inactive client blocked regardless of membership record.                                                       |
| **8** | Client with Multiple Memberships (Active + Expired/Future)                     | `ELIGIBLE`                 | `GRANTED`                | **Deterministic multi-membership resolution**: Searches for any currently eligible active membership before diagnosing ineligibility. |

### 7.2 Temporal Boundary Precision

- **$1\text{ ms}$ Before Expiration Boundary** (`endDate - 1ms`): **`GRANTED`** (Valid up to the final millisecond).
- **Exact Expiration Boundary** (`evalDate.getTime() >= endDate.getTime()`): **`DENIED_EXPIRED`** (Boundary is half-open $[ \text{startDate}, \text{endDate} )$).
- **$1\text{ ms}$ After Expiration Boundary** (`endDate + 1ms`): **`DENIED_EXPIRED`**.

### 7.3 Facility Timezone & GymDay Boundaries (ADR-0064)

- Turnstiles operate on **Facility-Local Business Days** (`GymDay`), not raw UTC.
- Evaluated via `GymDay.fromUtc(timestamp, timezone, facilityId)`:
  - `23:59:59.999` Guayaquil time (UTC-5) $\to$ mapped to current local date (`YYYY-MM-DD`).
  - `00:00:00.000` Guayaquil time (UTC-5) $\to$ mapped to the next local date.
- All daily attendance counters, KPIs, and turnover queries group by `gymDay`.

### 7.4 Duplicate Check-In, Anti-Passback & Concurrency Controls (ADR-0066, ADR-0067)

1. **Anti-Passback Cooldown**:
   - Exactly **5 minutes** ($300,000\text{ ms}$).
   - Any second check-in scan for the same client within 5 minutes of a prior `GRANTED` entry is rejected as `DENIED_DUPLICATE_CHECKIN`.
   - A subsequent scan after 5 minutes on the same calendar day is **`GRANTED`** (multiple legitimate workouts permitted).
2. **Turnstile Concurrency Mutex**:
   - `RecordCheckInHandler` acquires an asynchronous Promise mutex keyed by `clientId`:
     ```typescript
     while (this.clientLocks.has(clientId)) {
       await this.clientLocks.get(clientId);
     }
     ```
   - 10 concurrent requests submitted simultaneously for the same client result in **exactly 1 `GRANTED` and 9 `DENIED_DUPLICATE_CHECKIN`**.
   - _Limitation_: This mutex is in-memory. In multi-instance deployments, turnstiles must rely on database locking or Redis locks.
3. **Idempotency Replay Mechanics**:
   - If an API request supplies `idempotencyKey`, the handler caches the admission response for **10 minutes** (`IDEMPOTENCY_TTL_MS = 600,000ms`).
   - Network retries with the same key return the exact prior response with `isIdempotentReplay: true` without creating duplicate records in `attendance_records`.
4. **No Explicit Exception / Override Mechanism**:
   - **There is no override parameter in `RecordCheckInCommand`**. If a client is expired or frozen, the backend **cannot** be forced to grant entry without mutating the membership (`unfreeze` or `renew`). Front desk staff cannot record an "exception admission" through this endpoint.

### 7.5 Overlapping Membership Invariants (ADR-0060)

- Governed by `MembershipOverlapPolicy`.
- A client **cannot** possess two simultaneous active, pending, or frozen memberships whose validity periods overlap. Attempting to create or activate an overlapping membership throws `OverlappingMembershipException`.
- Adjacent periods (`next.startDate >= current.endDate`) are permitted to allow pre-scheduled renewals.

---

## 8. Permission and Audit Matrix

### 8.1 RBAC Permission Map

| Capability                  | Route                                           | Required Permission  | Allowed Platform Roles                      | Forbidden Roles (403)               |
| :-------------------------- | :---------------------------------------------- | :------------------- | :------------------------------------------ | :---------------------------------- |
| **Check-In Admission**      | `POST /api/v1/gym/attendance/check-in`          | `attendance.create`  | `Admin`, `Owner`, `Receptionist`            | `Trainer`, `Client`, `Member`       |
| **Read Attendance Logs**    | `GET /api/v1/gym/attendance/*`                  | `attendance.read`    | `Admin`, `Owner`, `Receptionist`, `Trainer` | `Client`, `Member`                  |
| **Create Membership Plan**  | `POST /api/v1/gym/membership-plans`             | `plans.create`       | `Admin`, `Owner`                            | `Receptionist`, `Trainer`, `Client` |
| **Update / Archive Plan**   | `PATCH/POST /api/v1/gym/membership-plans/:id/*` | `plans.update`       | `Admin`, `Owner`                            | `Receptionist`, `Trainer`, `Client` |
| **Enroll Member**           | `POST /api/v1/gym/memberships`                  | `memberships.create` | `Admin`, `Owner`, `Receptionist`            | `Trainer`, `Client`, `Member`       |
| **Read Memberships**        | `GET /api/v1/gym/memberships/*`                 | `memberships.read`   | `Admin`, `Owner`, `Receptionist`, `Trainer` | `Member`, Unrelated Client          |
| **Renew / Freeze / Cancel** | `POST /api/v1/gym/memberships/:id/*`            | `memberships.update` | `Admin`, `Owner`, `Receptionist`            | `Trainer`, `Client`, `Member`       |
| **Expire Batch Job**        | `POST /api/v1/gym/memberships/expire-batch`     | `memberships.update` | `Admin`, `Owner`                            | `Receptionist`, `Trainer`, `Client` |
| **Trainer Dashboard**       | `GET /api/v1/gym/trainer-dashboard/*`           | `clients.read`       | `Trainer`, `Admin`, `Owner`                 | `Receptionist`, `Client`, `Member`  |

### 8.2 Security & Data Privacy Protections

1. **Trainer Horizontal Isolation (ADR-0074)**:
   - Floor trainers calling `/api/v1/gym/trainer-dashboard/*` are strictly scoped to their own identity (`currentUser.id`). Passing an arbitrary `trainerId` query parameter is rejected unless the caller holds `Admin` or `Owner` roles.
2. **Commercial Price Masking (Least Privilege)**:
   - Floor trainers viewing assigned client memberships receive masked/omitted plan pricing details (`priceAmount` is suppressed). Commercial pricing is visible only to actors with `billing.read` or administrative roles.
3. **Turnstile Mutation Boundary**:
   - Floor trainers have zero write authority on turnstile admissions. Attempting to post check-ins yields HTTP 403 Forbidden.
4. **Append-Only Attendance Audit Trail**:
   - `attendance_records` is strictly append-only. There are no `UPDATE` or `DELETE` endpoints. Every granted, denied, and duplicate scan is permanently recorded for forensic and occupancy auditing.

---

## 9. Trainer Dashboard Readiness

### 9.1 Backend Endpoints & Query Contracts

The backend support for trainer operations (`TrainerDashboardController`) is fully implemented, verified, and mounted:

- `GET /api/v1/gym/trainer-dashboard/summary`: Top-line KPIs (`activeClientsCount`, `expiringSoonCount`, `todayCheckInsCount`).
- `GET /api/v1/gym/trainer-dashboard/clients`: Paginated roster of assigned clients with sorting and search.
- `GET /api/v1/gym/trainer-dashboard/expiring-memberships`: Expiring agreements radar within lookahead horizon (default 7 days).
- `GET /api/v1/gym/trainer-dashboard/attendance`: Today's arrival feed filtered strictly to the trainer's assigned clients.

### 9.2 Frontend Workspace (`apps/web/src/modules/gym/trainer-dashboard/`)

- **Route**: Mounted at `/gym/trainer-dashboard` via `TrainerDashboardSubRouter` in `gym.router.tsx`.
- **Page Component**: `TrainerDashboardPage` (`routes/trainer-dashboard-page.tsx`).
- **Sub-Components**:
  - `TrainerSummaryKpiBanner`: 3 metric cards with skeleton loading and error retry.
  - `AssignedClientsTable`: Paginated table with status badges and search.
  - `TrainerClientLookup`: Quick member search and real-time eligibility card.
  - `ExpiringMembershipsSection`: Urgent renewal list with `ExpiringMembershipBadge`.
  - `TrainerAttendanceFeed`: Scoped live arrival stream for assigned athletes.
- **Test State**: **9 test suites with 71 passing tests** across `apps/web/src/modules/gym/__tests__/` verify all trainer workflows.

---

## 10. Test Coverage and Automation Inventory

Comprehensive testing was verified across all layers using `nx test`:

### 10.1 Core Domain & Application Tests (`packages/core`)

**Result: 48 Suites Passed, 482 Tests Passed (100% Pass Rate)**

- `gym-attendance-comprehensive-verification.spec.ts`: Master turnstile verification (eligibility permutations, 1ms boundary precision, timezone boundaries, anti-passback cooldown, concurrency mutex, idempotency replay).
- `gym-temporal-lifecycle-comprehensive-verification.spec.ts`: Date math, freeze extension, lapse handling.
- `gym-lifecycle-invariants.spec.ts` & `gym-lifecycle-integration-consistency.spec.ts`: State machine transitions.
- `gym-commercial-integration.spec.ts`: Sales and POS integration contracts (ADR-0139).
- `membership-overlap.policy.spec.ts`: Multi-membership and overlap assertions.
- `trainer-dashboard-comprehensive-verification.spec.ts`, `trainer-authorization-security.spec.ts`, `trainer-cross-context-contracts.spec.ts`, `trainer-dashboard-performance-resilience.spec.ts`: Complete trainer subsystem verification.
- `prisma-gym-persistence.spec.ts`: Mapping fidelity with Prisma models.

### 10.2 NestJS API & HTTP Security Tests (`apps/api`)

**Result: 5 Suites Passed, 57 Tests Passed (100% Pass Rate)**

- `apps/api/src/gym/controllers/gym-controllers-comprehensive.spec.ts`: Unit tests for `AttendanceController`, `MembershipsController`, `MembershipPlansController`.
- `apps/api/src/gym/controllers/trainer-dashboard.controller.spec.ts`: Unit tests for `TrainerDashboardController`.
- `apps/api/src/gym/__tests__/gym-critical-business-workflows.e2e.spec.ts`: End-to-end HTTP integration workflows.
- `apps/api/src/gym/__tests__/gym-persistence.integration.spec.ts`: Integration test suite for Prisma repositories.
- `apps/api/src/gym/__tests__/gym.module.spec.ts`: Dependency injection container wiring.

### 10.3 Web Frontend Workflow Tests (`apps/web`)

**Result: 11 Suites Passed, 79 Tests Passed (100% Pass Rate)**

- `apps/web/src/modules/gym/__tests__/attendance-workflows.spec.tsx`: 9 tests verifying member search, eligibility card, admission flow, today's feed, and history dialog.
- `apps/web/src/modules/gym/__tests__/url-driven-state-hardening.spec.tsx`: URL synchronization tests for `/gym/attendance`.
- `apps/web/src/modules/gym/__tests__/gym-critical-business-workflows.e2e.spec.tsx`: Full gym operational scenarios.
- `apps/web/src/modules/gym/__tests__/memberships-workflows.spec.tsx`: Enrollment, renewal, freeze, cancellation.
- `apps/web/src/modules/gym/__tests__/plans-workflows.spec.tsx`: Catalog management, pricing updates, publishing, archiving.
- `apps/web/src/modules/gym/__tests__/trainer-dashboard-operational.spec.tsx`: Trainer dashboard UI tests.
- `apps/web/src/modules/attendance/__tests__/attendance-api.spec.ts`: 4 legacy tests.
- `apps/web/src/modules/attendance/__tests__/attendance-reception-workflow.spec.tsx`: 4 legacy tests.

---

## 11. Missing Backend Capabilities & Architectural Gaps

| Issue ID       | Severity | Category               | Description                                                                                                                                        | Operational Impact                                                                                                                                                    |
| :------------- | :------: | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DEF-GYM-01** |  **P0**  | **Backend DI**         | `GymModule` injects `DefaultClientLookupPort` which unconditionally returns `true` (`validateClientExists`).                                       | Client existence and active status in Client Management are skipped. Any non-existent or inactive client ID can be enrolled or admitted.                              |
| **DEF-GYM-02** |  **P0**  | **Backend DI**         | `GymModule` injects `DefaultGymEventPublisherPort` which drops all domain events in an empty async method.                                         | Domain events (`MembershipCreatedEvent`, `AttendanceCheckedInEvent`) are never dispatched. Cross-domain projections (such as client timeline) are dead in production. |
| **DEF-GYM-03** |  **P1**  | **Frontend Routing**   | `navigation.config.ts#L69` routes sidebar "Attendance & Check-In" to `/attendance` (obsolete module) instead of `/gym/attendance`.                 | Receptionists navigating from the primary sidebar load the deprecated screen with broken API contracts.                                                               |
| **DEF-GYM-04** |  **P1**  | **Frontend Dead Code** | Coexistence of `apps/web/src/modules/attendance/` alongside `apps/web/src/modules/gym/attendance/`.                                                | Duplicated maintenance overhead and architectural confusion; broken endpoints in `modules/attendance`.                                                                |
| **DEF-GYM-05** |  **P2**  | **Persistence OCC**    | `PrismaMembershipRepository.save()` executes `upsert` with `version: { increment: 1 }` without checking `where: { id, version: expectedVersion }`. | Concurrent membership modifications silently overwrite each other rather than rejecting with HTTP 409 Conflict.                                                       |
| **DEF-GYM-06** |  **P2**  | **Concurrency**        | Turnstile admission mutex in `RecordCheckInHandler` is an in-memory `Map`.                                                                         | Multi-instance / clustered deployments cannot serialize turnstile scans across different API servers.                                                                 |
| **DEF-GYM-07** |  **P2**  | **Domain Policy**      | No explicit exception or override mechanism for gym admission.                                                                                     | Receptionists cannot grant an audited one-time admission exception for an expired/frozen member without mutating the agreement.                                       |
| **DEF-GYM-08** |  **P3**  | **Persistence**        | `GymModule` binds `InMemoryGymFulfillmentStore` instead of database persistence for commercial fulfillment records.                                | Commercial payment fulfillment records are lost on API server restart.                                                                                                |

---

## 12. Recommended Implementation Sequence and Blockers

To execute Milestone 6 productization deterministically without regressions, adhere to the following sequence:

```mermaid
flowchart TD
    Step1["Step 1: Unify Frontend Attendance & Fix Navigation (P1)\n• Repoint navigation.config.ts to /gym/attendance\n• Add redirect from /attendance to /gym/attendance in app-router\n• Deprecate/retire apps/web/src/modules/attendance/"]
    Step2["Step 2: Harden Dependency Injection in GymModule (P0)\n• Wire ClientLookupAdapter delegating to PrismaClientRepository\n• Wire DomainEventPublisher for Gym events"]
    Step3["Step 3: Persistence Hardening & Concurrency Defense (P2)\n• Implement conditional version check in PrismaMembershipRepository\n• Replace in-memory turnstile mutex with Redis/Postgres advisory lock"]
    Step4["Step 4: Fulfillment Store Relational Persistence (P3)\n• Replace InMemoryGymFulfillmentStore with Prisma fulfillment repository"]
    Step5["Step 5: Full E2E Ingress Acceptance Verification\n• Execute end-to-end turnstile scan to commercial checkout"]

    Step1 --> Step2 --> Step3 --> Step4 --> Step5
```

### Critical Blockers to Resolve Before Phase 6 Implementation Begins

1. **Route Repointing & Module Consolidation**:
   - Repoint `navigation.config.ts` from `/attendance` to `/gym/attendance`.
   - Safely remove `apps/web/src/modules/attendance/` and update routing integration tests.
2. **Production Dependency Injection Wiring**:
   - Provide genuine `ClientLookupPort` in `apps/api/src/gym/gym.module.ts` backed by `PrismaService` checking client record existence and `status === 'ACTIVE'`.
   - Provide genuine `GymEventPublisherPort` delegating to platform event bus (`EventEmitter2` or outbox publisher).

---

## 13. Audit Sign-Off

- **Audited by:** Senior Software Architect & Full-Stack Engineer
- **Inspection Mode:** Read-Only
- **Artifact Location:** `docs/audits/milestone-6-1-gym-attendance-audit.md`
- **Verdict:** Gym core domain, API controllers, and `apps/web/src/modules/gym` frontend are highly mature and verified. Canonical attendance module firmly identified as `apps/web/src/modules/gym/attendance`. Retiring `apps/web/src/modules/attendance` and fixing DI stubs in `GymModule` are the remaining prerequisite blockers.
