# Resources Backend Testing Architecture Baseline & Gap Analysis

**Status**: Authoritative & Active  
**Milestone**: Phase 6.10 — Backend Testing  
**Domain**: Resources Management (Consumable Inventory, Fixed Assets, Cross-Domain Valuation)  
**Author**: Principal QA Architect, Senior Backend Engineer, Test Infrastructure Specialist & ARB Member  
**Governing Baseline Documents**:

- [**Resources Public HTTP API Surface**](./resource-api-surface.md)
- [**Resources API Contracts & Validation**](./resource-api-contracts.md)
- [**Resources API Testing & Quality Specification**](./resource-api-testing.md)
- [**Milestone 6.9 Quality Gate**](./milestone-6.9-quality-gate.md)

---

## 1. Existing Kinergy Testing Architecture & Framework Tooling

The Kinergy platform enforces a multi-tier testing pyramid implemented with **Jest 29.7.0**, orchestrated by **Nx**, and standardized through the shared testing platform [`@kinergy-platform/testing`](file:///c:/Projects/kinergy-platform/packages/testing/README.md):

```
                       ▲
                      / \
                     /   \     E2E & API Contract (11 Suites / 205 Tests)
                    / E2E \    Controller Integration, Validation, OpenAPI, RBAC
                   /───────\
                  /         \   Application CQRS (16 Suites / 215 Tests)
                 / App / CQRS\  Use Cases, Workflows, Valuation, Invariants
                /─────────────\
               / Persistence   \ Persistence & Mappers (5 Suites / 62 Tests)
              /   & Mappers     \ Optimistic Concurrency, Bi-directional Mappings
             /───────────────────\
            /    Domain Core      \ Domain Aggregates & VOs (16 Suites / 248 Tests)
           /   Invariants & Rules  \ State Machines, Stock Math, Invariant Hardening
          /─────────────────────────\
```

### Technical Discovery Inventory (25 Dimensions)

| Dimension                      | Platform Standard               | Implementation Details                                                                                                 |
| :----------------------------- | :------------------------------ | :--------------------------------------------------------------------------------------------------------------------- |
| **1. Test Framework**          | Jest 29.7.0                     | Configured with `ts-jest` for TypeScript compilation and isolated VM runners.                                          |
| **2. Test Runner**             | Nx CLI (`nx test <project>`)    | Supports parallel task execution, targeted pattern filtering (`--testPathPattern`), and artifact caching.              |
| **3. Assertion Library**       | Jest `expect` + Custom Matchers | Extended with custom domain matchers (`customTestMatchers`) in `@kinergy-platform/testing`.                            |
| **4. Mocking Conventions**     | Type-Safe Mocks                 | `jest.fn()`, `RepositoryMockFactory.createMockRepository<T>()`, and in-memory test doubles.                            |
| **5. File Naming**             | Suffix Conventions              | `*.spec.ts` (unit/integration), `*.e2e.spec.ts` (external contract/e2e), `*.contract.spec.ts` (controller DTO).        |
| **6. Directory Conventions**   | Co-located `__tests__/`         | Folders co-located in `domain/__tests__/`, `application/__tests__/`, `persistence/__tests__/`, `resources/__tests__/`. |
| **7. Unit Conventions**        | Pure Domain Isolation           | Zero external I/O, zero database dependencies; exercises aggregates, value objects, and pure calculations.             |
| **8. Integration Conventions** | Mock Repository & In-Memory     | CQRS handlers wired with mock repositories, validating orchestration, results, and failure branches.                   |
| **9. API/E2E Conventions**     | Controller + Pipe + Handler     | Multi-step user journey tests verifying input sanitization, DTO transformation, and HTTP status codes.                 |
| **10. Database Test Strategy** | In-Memory Doubles & Mocks       | Unit testing uses in-memory repository doubles; mapper tests verify bi-directional Prisma schema transformations.      |
| **11. Test DB Configuration**  | Containerless / Mock Isolation  | Containerless fast execution avoids slow database spin-up during pre-commit checks and CI.                             |
| **12. Prisma Conventions**     | Mapper Bi-Directional Checks    | Explicitly verifies `toDomain`, `toPrismaCreate`, `toPrismaUpdate`, and Prisma `Decimal` conversions.                  |
| **13. Transaction Strategy**   | Isolated Mock States            | `beforeEach` instantiates fresh mock repository instances, ensuring zero cross-test state leakage.                     |
| **14. Fixture Strategy**       | Static Domain Fixtures          | Reusable static objects defined in `@kinergy-platform/testing/fixtures`.                                               |
| **15. Factory Strategy**       | Fluent Persona Factories        | `UserTestFactory`, `createOwner()`, `createTrainer()`, `createReceptionist()` with deterministic counters.             |
| **16. Seed Strategy**          | Seed Helpers                    | Role and permission seed tables populated via `DatabaseSeedHelper`.                                                    |
| **17. Authentication Helpers** | Single-Line `auth(user)`        | Generates signed test JWTs and HTTP request headers without calling `POST /auth/login`.                                |
| **18. Authorization Helpers**  | `SecurityContextTestMock`       | Mocks actor context, active permissions, and evaluates RBAC security policies.                                         |
| **19. Time/Date Strategy**     | `MockClock` & Fixed UTC Dates   | UTC ISO-8601 timestamps (`2026-01-01T00:00:00.000Z`) prevent timezone discrepancies.                                   |
| **20. Money/Decimal Strategy** | Explicit IEEE-754 Numbers       | Numbers in DTOs; `Money` value object in domain; Prisma `Decimal` in database mappers.                                 |
| **21. Parallel Execution**     | Fully Parallelized              | Nx runs project test suites in parallel worker threads (`nx run-many -t test`).                                        |
| **22. Test Isolation**         | Zero Shared State               | No global mutable variables; test suites instantiate distinct controller/service graphs per test.                      |
| **23. CI Test Command**        | `pnpm validate`                 | Full linting, formatting check, typechecking, 81 API suites (582 tests), 84 web suites (820 tests), and builds.        |
| **24. Coverage Tooling**       | Jest Coverage Engine            | Supports statement, branch, function, and line coverage reporting (`--coverage`).                                      |
| **25. Flakiness Mitigation**   | Zero Arbitrary Sleep            | No `setTimeout` or `sleep()`; deterministic async event awaits and mock clocks.                                        |

---

## 2. Existing Phase 6 Test Inventory Baseline

The Phase 6 codebase currently contains **48 test suites** comprising **730 passing automated tests**:

### 2.1 Domain Layer Test Suites (`packages/core/src/resources/domain/`) — 16 Suites / 248 Tests

1. `inventory-item.aggregate.spec.ts` — Item initialization, identity, validation, and immutability.
2. `inventory-item-value-objects.spec.ts` — `SKU`, `Quantity`, `Money`, and custom value object invariants.
3. `inventory-category.spec.ts` — Category taxonomy and categorization rules.
4. `inventory-monetary-and-quantity-semantics.spec.ts` — Unit cost, selling price, and quantity precision.
5. `inventory-movement.spec.ts` — Movement aggregate, ledger records, and delta calculations.
6. `inventory-stock-mutation-invariants.spec.ts` — Receipt, sale, consumption, scrap, and variance adjustment invariants.
7. `inventory-stock-mutation-concurrency.spec.ts` — Optimistic concurrency and race condition resilience.
8. `resources-qa-invariant-hardening.spec.ts` — Invariant hardening, boundary conditions, and invalid inputs.
9. `fixed-asset.aggregate.spec.ts` — Asset commissioning, identification, and location tracking.
10. `asset-classification-and-state-vocabulary.spec.ts` — Asset category, condition, and status vocabulary.
11. `asset-business-operations-invariants.spec.ts` — Commissioning, transfer, condition, and valuation rules.
12. `asset-lifecycle-state-machine.spec.ts` — State transitions (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
13. `asset-lifecycle-transition-enforcement.spec.ts` — Invariant enforcement and rejection of forbidden transitions.
14. `asset-maintenance-record.spec.ts` — Servicing records, maintenance intervals, and cost tracking.
15. `asset-history-meaningful-audit.spec.ts` — Immutable audit ledger and historical event capture.
16. `resources-architecture-boundaries.spec.ts` — Architecture boundaries and import restrictions.

### 2.2 Application Layer Test Suites (`packages/core/src/resources/application/`) — 16 Suites / 215 Tests

1. `product-lifecycle-use-cases.spec.ts` — Commissioning, updating, activating, deactivating, and archiving products.
2. `inventory-business-rules-and-operations.spec.ts` — Inventory orchestration and CQRS handler execution.
3. `stock-operations-foundation.spec.ts` — Foundation stock mutations and movement creation.
4. `inventory-workflows-purchase-sale-consumption.spec.ts` — PO receipts, POS sales, and clinical consumption.
5. `adjust-stock.spec.ts` — Variance count reconciliations and audit logging.
6. `inventory-queries.spec.ts` — Product searches, category filters, low-stock queries, and movement history.
7. `inventory-workflows-qa-hardening.spec.ts` — QA edge cases, failure recovery, and handler boundaries.
8. `fixed-assets-core-operations.spec.ts` — Asset commissioning and metadata updates.
9. `fixed-assets-transfer.spec.ts` — Location transfers and relocation history.
10. `fixed-assets-status-transitions.spec.ts` — Lifecycle status changes and terminal state rejection.
11. `fixed-assets-condition-operations.spec.ts` — Condition scoring updates and inspection logs.
12. `fixed-assets-maintenance.spec.ts` — Maintenance event recording and servicing history.
13. `fixed-assets-valuation-operations.spec.ts` — Appraisal updates and carrying value history.
14. `fixed-assets-query-operations.spec.ts` — Multi-facet asset queries, scanner lookups, and audit history.
15. `fixed-assets-workflows-qa-hardening.spec.ts` — Hardened asset workflows and validation error handling.
16. `resource-valuation-operations.spec.ts` — FIFO inventory valuation, asset carrying value, and combined summaries.

### 2.3 Persistence Layer Test Suites (`packages/core/src/resources/infrastructure/persistence/`) — 5 Suites / 62 Tests

1. `prisma-inventory-item-persistence.spec.ts` — Inventory Prisma repository and mapper tests.
2. `prisma-fixed-asset-persistence.spec.ts` — Fixed asset Prisma repository and mapper tests.
3. `prisma-resources-persistence.spec.ts` — End-to-end repository persistence and entity hydration.
4. `prisma-persistence-boundaries-and-invariants.spec.ts` — Transaction isolation, foreign keys, and multi-tenant constraints.
5. `prisma-resources-comprehensive-persistence-invariants.spec.ts` — Comprehensive persistence invariants and OCC versioning.

### 2.4 API & External Contract Layer Test Suites (`apps/api/src/resources/`) — 11 Suites / 205 Tests

1. `inventory-api.contract.spec.ts` — Consumable Inventory controller contract and response mapping.
2. `fixed-assets-api.contract.spec.ts` — Fixed Assets controller contract and action dispatch.
3. `resource-valuation-api.contract.spec.ts` — Cross-domain valuation controller contract.
4. `inventory.authorization.spec.ts` — Inventory RBAC permissions and security negative tests.
5. `fixed-assets.authorization.spec.ts` — Fixed Assets RBAC permissions and role restrictions.
6. `resource-valuation.authorization.spec.ts` — Valuation RBAC permissions (`billing.read` enforcement).
7. `resources-security-negative-and-side-effects.spec.ts` — State machine bypass prevention and property whitelisting.
8. `resources-validation.spec.ts` — Input sanitization, DTO validation, and bounds checking.
9. `resources-query-consistency.spec.ts` — DataTable query parameters, pagination, filtering, and sorting.
10. `resources-openapi.spec.ts` — Automated OpenAPI 3.0 path and schema registration verification.
11. `resources-external-api-contract.e2e.spec.ts` — End-to-end multi-step business journeys.

---

## 3. Test Gap Analysis & Classification

| Functional Area & Behavior                          | Current Classification   | Assessment & Rationale                                                                                                                                      |
| :-------------------------------------------------- | :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventory: Product Lifecycle & Archival**         | **COVERED AND ADEQUATE** | Tested at Domain, Application, and HTTP layers with full status transitions.                                                                                |
| **Inventory: Stock Deductions & Invariants**        | **COVERED AND ADEQUATE** | Negative stock prevention (`[INV-INV-2]`) rigorously verified across all layers.                                                                            |
| **Inventory: Stock Concurrency & Race Conditions**  | **COVERED AND ADEQUATE** | OCC (`version`) and concurrent mutation resilience verified in domain & persistence.                                                                        |
| **Assets: Commissioning & Scanner Tag Lookup**      | **COVERED AND ADEQUATE** | Unique barcode indexing and instant tag retrieval verified in all layers.                                                                                   |
| **Assets: Location Transfers & Terminal States**    | **COVERED AND ADEQUATE** | Relocation history and terminal `SOLD` rejection (`[AST-INV-1]`) verified.                                                                                  |
| **Assets: Maintenance & Condition Updates**         | **COVERED AND ADEQUATE** | Service records, technician logging, and condition degradation verified.                                                                                    |
| **Valuation: Working Capital & Carrying Value**     | **COVERED AND ADEQUATE** | FIFO valuation math, asset appraisal tracking, and combined summary verified.                                                                               |
| **Security: RBAC & Permission Boundaries**          | **COVERED AND ADEQUATE** | `inventory.read/write`, `assets.read/write`, `billing.read` verified for all roles.                                                                         |
| **Security: Anti-Bypass / Generic PATCH Injection** | **COVERED AND ADEQUATE** | Whitelisting and explicit sub-resource action security verified ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)). |
| **Query: Pagination, Multi-Filter & Sorting**       | **COVERED AND ADEQUATE** | Query consistency, default bounds, and DataTable compatibility verified.                                                                                    |
| **OpenAPI: Contract & Schema Generation**           | **COVERED AND ADEQUATE** | Automated Swagger 3.0 generation tested with 100% path coverage.                                                                                            |

---

## 4. Concurrency, Isolation & Flakiness Risk Assessment

1. **Concurrency Safety**:
   - Aggregate version incrementing (`version: 1 -> 2`) guarantees that simultaneous conflicting mutations trigger optimistic locking failures rather than silent state corruption.
   - Tested in `inventory-stock-mutation-concurrency.spec.ts` and `prisma-resources-comprehensive-persistence-invariants.spec.ts`.
2. **Test Isolation Guarantees**:
   - Zero shared state across tests.
   - All tests use independent mock instances or freshly instantiated aggregate roots.
3. **Flakiness Risks**:
   - **Zero Flakiness Detected**: All 48 test suites execute deterministically without timing dependencies, external network calls, or unseeded pseudo-random values.

---

## 5. Milestone 6.10 Execution Constraints & Scope

1. **Maintain Testing Pyramid Integrity**: Do not convert fast, pure domain tests into slow E2E tests unnecessarily.
2. **Zero Redundant Duplicate Tests**: New test scenarios in Milestone 6.10 must target non-trivial edge cases, complex multi-aggregate scenarios, cross-domain interactions, or stress benchmarks.
3. **Strict Validation Rule**: Every testing addition must continuously pass `pnpm validate` without warning or error.
