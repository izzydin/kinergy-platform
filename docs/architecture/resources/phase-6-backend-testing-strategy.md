# Phase 6: Resources Management — Authoritative Backend Testing Strategy

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.10 — Backend Testing  
**Domain**: Resources Management (Consumable Inventory, Fixed Assets, Cross-Domain Valuation)  
**Author**: Principal QA Architect, Domain Testing Strategist & ARB Member  
**Governing Documents**:

- [**Backend Testing Baseline & Gap Analysis**](./backend-testing-baseline.md)
- [**Resources Architecture Baseline & Capability Gap Analysis**](./backend-api-baseline.md)
- [**Resource API Testing & Quality Specification**](./resource-api-testing.md)
- [**Milestone 6.9 Quality Gate**](./milestone-6.9-quality-gate.md)

---

## 1. Testing Philosophy: Tests as Executable Architecture

Tests in Kinergy are **executable architecture documentation**. When an engineer modifies code six months from now, failing tests must immediately communicate the exact domain rule, security boundary, or persistence guarantee that would be violated.

```
┌─────────────────────────────────────────────────────────────┐
│                 Testing Philosophy Invariants               │
├─────────────────────────────────────────────────────────────┤
│ 1. Prove Business Behavior — not mere line execution.       │
│ 2. Test at the Right Level — respect the testing pyramid.   │
│ 3. Every Invariant Has an Owner — no orphaned rules.        │
│ 4. Zero Flakiness — deterministic time, sorting, and state. │
│ 5. Concurrency Is Proven — not assumed from sequence.       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Kinergy Phase 6 Testing Pyramid

The testing pyramid partitions verification into distinct, non-overlapping levels of abstraction:

```
                          ▲
                         / \
                        /   \     Level 4: API & E2E Contract Tests
                       / E2E \    HTTP Boundaries, DTO Validation, OpenAPI, RBAC
                      /───────\   (11 Suites / 205 Tests)
                     /         \
                    /Concurrenc \ Level 3: Concurrency & Race Tests
                   /  & Locking  \ Optimistic Locking (version), Collisions
                  /───────────────\ (2 Dedicated Suites / 30 Tests)
                 /                 \
                / Application CQRS  \ Level 2: Application & Persistence Integration
               /    & Persistence    \ CQRS Handlers, Prisma Mappers, Transactions
              /───────────────────────\ (21 Suites / 277 Tests)
             /                         \
            /   Domain Aggregates & VOs \ Level 1: Pure Domain Unit Tests
           /   Invariants & State Machine\ Business Rules, Math, State Machines
          /───────────────────────────────\ (16 Suites / 248 Tests)
```

---

## 3. Test Level Scopes & Responsibilities

### Level 1: Pure Domain Unit Tests (`packages/core/src/resources/domain/__tests__/`)

- **Scope**: Isolated domain aggregates (`InventoryItem`, `FixedAsset`), value objects (`SKU`, `Money`, `Quantity`, `AssetLocation`), pure arithmetic, state transition matrices, and boundary validations.
- **Rules**: Zero external I/O, zero mock repositories, zero database dependencies, 100% synchronous or pure asynchronous calculations.
- **Primary Assertions**: Aggregate domain invariants (`[INV-INV-1]` through `[INV-INV-6]`, `[AST-INV-1]` through `[AST-INV-7]`), exception types, and event emission.

### Level 2: Application & Persistence Integration Tests (`packages/core/src/resources/application/` & `persistence/`)

- **Scope**: CQRS command and query handlers, Prisma repositories, bi-directional entity mappers (`toDomain`, `toPrismaCreate`, `toPrismaUpdate`), database transaction boundaries, movement ledgers, and valuation calculations.
- **Rules**: Wired with in-memory repository doubles or mocked Prisma client. Validates orchestration, optimistic concurrency checks, multi-tenant scoping, and result packaging (`ResourcesApplicationResult.ok/fail`).

### Level 3: Concurrency & Race Condition Tests (`packages/core/src/resources/domain/` & `persistence/`)

- **Scope**: Multi-threaded or simulated parallel operations contending for the same resource aggregate (e.g., two simultaneous stock-deducting requests when only sufficient quantity exists for one).
- **Rules**: Exercises optimistic concurrency versioning (`version: 1 -> 2`) without arbitrary delays. Verifies that one request succeeds while the second fails with a concurrency conflict.

### Level 4: External API & HTTP Contract Tests (`apps/api/src/resources/__tests__/`)

- **Scope**: NestJS controllers, `GlobalSanitizationValidationPipe`, `GlobalExceptionFilter`, `AuthorizationGuard`, route resolution, and OpenAPI 3.0 document generation.
- **Rules**: Tests observable external HTTP behavior (status codes, JSON envelopes, header compliance). Does not re-test pure domain arithmetic already proven at Level 1.

---

## 4. Comprehensive Behavior Coverage & Test Ownership Matrix

| Subsystem       | Specific Business Behavior / Invariant                                                                                   | Primary Level (Owner) | Secondary Level  | Required Assertions                                                        |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------- | :-------------------- | :--------------- | :------------------------------------------------------------------------- |
| **Inventory**   | SKU format validation & normalization                                                                                    | **Level 1 (Domain)**  | Level 4 (API)    | Rejects invalid SKU formats; enforces uppercase normalization.             |
| **Inventory**   | Commission new product (Status `ACTIVE`, stock 0)                                                                        | **Level 2 (App)**     | Level 4 (API)    | Persists new item with version 1; returns `201 Created` DTO.               |
| **Inventory**   | Stock PO receipt (`PURCHASE` movement)                                                                                   | **Level 2 (App)**     | Level 1 (Domain) | Increases `quantityOnHand`, records unit cost, creates ledger record.      |
| **Inventory**   | Stock POS sale (`SALE` movement)                                                                                         | **Level 2 (App)**     | Level 1 (Domain) | Decreases `quantityOnHand`, records selling price, creates ledger record.  |
| **Inventory**   | Stock clinical consumption (`CONSUMPTION`)                                                                               | **Level 2 (App)**     | Level 1 (Domain) | Decreases stock; records mandatory `treatmentSessionId` reference.         |
| **Inventory**   | Negative stock prevention `[INV-INV-2]`                                                                                  | **Level 1 (Domain)**  | Level 4 (API)    | Rejects deduction when `requested > available`; returns `400 Bad Request`. |
| **Inventory**   | Stock count adjustment variance                                                                                          | **Level 2 (App)**     | Level 1 (Domain) | Computes delta; adjusts quantity; records mandatory reason.                |
| **Inventory**   | Low stock detection (`quantity <= threshold`)                                                                            | **Level 1 (Domain)**  | Level 4 (API)    | Correctly sets boolean `isLowStock: true` when at/below threshold.         |
| **Inventory**   | Product archival (`ARCHIVED` status)                                                                                     | **Level 1 (Domain)**  | Level 2 (App)    | Transitions status to `ARCHIVED`; disables active sale mutations.          |
| **Inventory**   | Working capital FIFO valuation math                                                                                      | **Level 1 (Domain)**  | Level 2 (App)    | Calculates total valuation = sum(`quantityOnHand * unitCost`).             |
| **Assets**      | Asset commissioning & barcode indexing                                                                                   | **Level 2 (App)**     | Level 4 (API)    | Generates `assetTag`; saves with initial facility/room location.           |
| **Assets**      | Barcode hardware scanner instant lookup                                                                                  | **Level 4 (API)**     | Level 2 (App)    | `GET /assets/tag/:tag` retrieves exact asset in <10ms.                     |
| **Assets**      | Physical location relocation (`/transfer`)                                                                               | **Level 1 (Domain)**  | Level 2 (App)    | Updates location; appends `TRANSFERRED` event to history.                  |
| **Assets**      | Terminal state transfer block `[AST-INV-2]`                                                                              | **Level 1 (Domain)**  | Level 4 (API)    | Cannot relocate assets in `SOLD` or `RETIRED` state.                       |
| **Assets**      | State machine transition validation                                                                                      | **Level 1 (Domain)**  | Level 4 (API)    | Validates allowed transitions (`ACTIVE` <-> `UNDER_MAINTENANCE`, etc.).    |
| **Assets**      | Terminal state resurrection block `[AST-INV-1]`                                                                          | **Level 1 (Domain)**  | Level 4 (API)    | Rejects transitioning `SOLD` or `RETIRED` asset back to `ACTIVE`.          |
| **Assets**      | Physical condition scoring degradation                                                                                   | **Level 1 (Domain)**  | Level 2 (App)    | Updates condition (`NEW` -> `GOOD` -> `FAIR` -> `DAMAGED`).                |
| **Assets**      | Maintenance servicing event recording                                                                                    | **Level 2 (App)**     | Level 1 (Domain) | Records service date, technician, cost amount, and new condition.          |
| **Assets**      | Fair market value appraisal update                                                                                       | **Level 2 (App)**     | Level 1 (Domain) | Updates `currentEstimatedValueAmount`; appends appraisal notes.            |
| **Assets**      | Immutable history audit ledger                                                                                           | **Level 1 (Domain)**  | Level 2 (App)    | Captures chronological events with actor ID, timestamp, and metadata.      |
| **Valuation**   | Cross-domain combined balance sheet                                                                                      | **Level 2 (App)**     | Level 4 (API)    | Composes inventory + assets; computes portfolio percentage shares.         |
| **Concurrency** | Simultaneous stock deductions (Race)                                                                                     | **Level 3 (Locking)** | Level 1 (Domain) | OCC version check: 1st transaction succeeds, 2nd fails with collision.     |
| **Concurrency** | Zero negative stock under collision                                                                                      | **Level 3 (Locking)** | Level 1 (Domain) | Total stock never drops below 0 regardless of concurrency level.           |
| **Security**    | Unauthenticated request rejection                                                                                        | **Level 4 (API)**     | Level 2 (App)    | Missing JWT returns `401 Unauthorized`.                                    |
| **Security**    | Role-based read permissions (`*.read`)                                                                                   | **Level 4 (API)**     | Level 2 (App)    | Members/unauthorized roles cannot read staff resources (`403 Forbidden`).  |
| **Security**    | Role-based write permissions (`*.write`)                                                                                 | **Level 4 (API)**     | Level 2 (App)    | Trainers/receptionists cannot mutate restricted assets (`403 Forbidden`).  |
| **Security**    | Valuation financial permissions (`billing.read`)                                                                         | **Level 4 (API)**     | Level 2 (App)    | Accessing financial valuation summaries requires `billing.read`.           |
| **Security**    | State machine bypass immunity ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)) | **Level 4 (API)**     | Level 1 (Domain) | Non-whitelisted fields in `PATCH` rejected with `400 Bad Request`.         |

---

## 5. Test Data, Persona & Factory Strategy

- **Persona Factories**: Built upon `@kinergy-platform/testing`:
  - `createOwner()`, `createTrainer()`, `createReceptionist()`, `createClientUser()`.
  - Deterministic sequence counters guarantee unique emails and user IDs across test runs.
- **Domain Entity Builders**:
  - `InventoryItemBuilder` and `FixedAssetBuilder` in test suites instantiate valid baseline entities with customizable prop overrides.
- **Zero Production Data Dependency**: Tests must never rely on pre-existing database rows. All test state is initialized within the test fixture or factory.

---

## 6. Database Isolation & Transaction Strategy

1. **In-Memory Repository Pattern**: For Unit and Application CQRS tests, repository interfaces are satisfied by in-memory mock doubles (`MockInventoryItemRepository`, `MockFixedAssetRepository`), guaranteeing sub-millisecond execution and zero cross-test contamination.
2. **Containerless Execution**: Avoids starting heavy Docker containers during local test runs and pre-commit checks, keeping test execution under 25 seconds for the entire monorepo.
3. **Prisma Mapper Verification**: Database persistence correctness is proven through dedicated mapper test suites (`prisma-inventory-item-persistence.spec.ts`, `prisma-fixed-asset-persistence.spec.ts`) that test bi-directional data conversions.

---

## 7. Time Handling & Determinism Strategy

- **`MockClock` & Fixed UTC Timestamps**:
  - All time-dependent domain tests use `MockClock` initialized to fixed UTC timestamps (e.g. `2026-08-31T12:00:00.000Z`).
  - Tests must never call `new Date()` directly without controlling the system clock.
- **Timezone Immunity**: Timestamps are parsed and formatted as strict ISO-8601 UTC strings, preventing failure when executed in different timezones.

---

## 8. Monetary Precision & Decimal Assertion Strategy

- **Domain Core**: Monetary values are encapsulated in the `Money` value object (`amount: number`, `currency: string`) with exact arithmetic rounding rules.
- **Database Mappers**: Bi-directional conversion ensures JavaScript numbers are mapped to Prisma `Decimal` instances and restored without floating-point drift.
- **HTTP DTO Layer**: Monetary values are serialized as standard IEEE-754 numbers in response payloads, avoiding internal Decimal object leakage to frontend clients.

---

## 9. Flakiness Prevention Strategy

1. **Zero `sleep()` / `setTimeout()`**: All asynchronous testing relies on explicit Promise resolutions, event listeners, or atomic CQRS handler returns.
2. **Deterministic List Ordering**: All collection queries enforce deterministic fallback sorting (`sortBy: 'name'`, `sortOrder: 'asc'`) to eliminate test flakiness caused by database row ordering.
3. **Strict Whitelisting**: Request pipes run with `whitelist: true, forbidNonWhitelisted: true`, catching accidental property leaks during test setup.

---

## 10. Definition of Adequate Coverage for Milestone 6.10

Phase 6 testing is declared **adequate and complete** when:

1. Every domain invariant and business rule has an identified primary test owner in the test matrix.
2. 100% of all 27 HTTP routes have automated contract and validation coverage.
3. Concurrency safety under race conditions is explicitly proven with optimistic locking tests.
4. Security boundaries (authentication, RBAC, anti-bypass) are verified with negative test suites.
5. Monorepo quality gate (`pnpm validate`) passes 100% cleanly across all 10 projects.
