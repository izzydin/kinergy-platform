# Consumable Inventory Application Layer Baseline & Architectural Specification

**Bounded Context**: `Resources Management`  
**Milestone**: Phase 6.5 — Consumable Inventory Application Layer  
**Document**: Authoritative Application Architecture Baseline & Workflow Standard  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 28, 2026

---

## 1. Executive Summary & Context

Milestone 6.5 establishes the **Application Services and CQRS Use Cases** for the **Consumable Inventory** sub-domain within the `Resources Management` bounded context (`packages/core/src/resources/application`).

Building on the approved **Domain Model (Milestone 6.1)**, **Lifecycle State Machines & Invariants (Milestone 6.3)**, and **Prisma Persistence Layer (Milestone 6.4)**, this milestone turns domain models into secure, authorized, deterministic, and transactionally isolated business workflows without leaking persistence or presentation concerns.

---

## 2. Existing Application Architecture Analysis

The **Kinergy Platform** follows **Clean Architecture**, **Domain-Driven Design (DDD)**, and **Hexagonal (Ports & Adapters)** principles:

```
packages/core/src/resources/
├── domain/                      <-- Pure business logic, zero framework/Prisma dependencies
│   └── inventory/
│       ├── inventory-item.aggregate.ts
│       ├── stock-movement.entity.ts
│       ├── value-objects/
│       ├── enums/
│       ├── events/
│       └── repositories/
├── application/                 <-- Orchestration layer: CQRS Commands, Queries, Handlers, DTOs
│   ├── commands/                <-- Write intention definitions (payload + actor metadata)
│   ├── queries/                 <-- Read intention definitions (filters + pagination parameters)
│   ├── handlers/                <-- Command and Query executors
│   ├── dtos/                    <-- Plain data transfer contracts (DTOs)
│   ├── mappers/                 <-- Two-way aggregate-to-DTO translators
│   ├── ports/                   <-- Outbound interface contracts (Event publishers, Clocks)
│   └── shared/                  <-- ApplicationResult, CommandHandler, QueryHandler interfaces
└── infrastructure/              <-- Framework adapters (Prisma persistence, mappers, repositories)
    └── persistence/prisma/
```

### Core Architectural Invariants:

1. **Domain Independence**: The domain and application layers remain 100% pure TypeScript with zero imports from `@prisma/client`, `@nestjs`, or ORM decorators.
2. **CQRS Separation**: State-modifying operations (Commands) are strictly segregated from read-only projections (Queries).
3. **No Anemic Bypasses**: Handlers do not perform arbitrary property mutation. All state transitions occur through explicit methods on the `InventoryItem` aggregate root.

---

## 3. Existing Use-Case & Handler Conventions

Kinergy enforces uniform handler contracts across all bounded contexts (`gym`, `scheduling`, `kinesiology`):

### Command Handlers:

- Implement `CommandHandler<TCommand, ApplicationResult<TDto>>`.
- Validate input presence and format.
- Load aggregate from repository.
- Invoke rich domain aggregate methods.
- Save aggregate (participating in atomic unit-of-work persistence).
- Publish domain events via outbound ports.
- Return `ApplicationResult.ok(Mapper.toDTO(aggregate))` or `ApplicationResult.fail(errorMessage)`.

### Query Handlers:

- Implement `QueryHandler<TQuery, ApplicationResult<TDto>>`.
- Execute query filters, search strings, and bounded pagination.
- Apply deterministic sorting (e.g. `status ACTIVE` first, `createdAt DESC`, `id ASC`).
- Return sanitized, presentation-ready DTOs wrapped in `ApplicationResult`.

---

## 4. Existing Authorization & Actor Context Conventions

- **Actor Provenance**: Every write command requires an `actorId` / `recordedByUserId`. Anonymous or unattributed mutations are strictly prohibited.
- **Tenant Isolation**: Multi-tenancy is enforced on all repository queries and mutations via `tenantId`. Cross-tenant queries are blocked.
- **Role-Based Permissions**: Application handlers verify actor context before executing administrative actions (e.g., catalog archiving, price updates, manual stock corrections).

---

## 5. Existing Transaction & Concurrency Conventions

- **Atomic Unit-of-Work**: A product stock mutation and its corresponding `StockMovement` ledger entry are persisted atomically in a single `$transaction` in the repository layer.
- **Optimistic Concurrency Control (OCC)**: `InventoryItem` maintains an integer `version` field. Concurrent writes increment `version`. Collisions trigger an `OptimisticLockException` which surfaces as a structured concurrency failure in `ApplicationResult.fail()`.
- **Database Engine Defense-in-Depth**: Engine-level PostgreSQL `CHECK` constraints prevent negative stock (`quantity_on_hand >= 0.00`) and negative pricing at the storage layer.

---

## 6. Existing Query, Filter & Pagination Conventions

Query handlers follow standard pagination parameters:

- `DEFAULT_PAGE = 1`
- `DEFAULT_LIMIT = 20`
- `MAX_LIMIT = 100`

Standard Paginated Response Shape:

```typescript
export interface PaginatedResultDTO<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

Filtering & Search Conventions:

- Case-insensitive substring matching across `name`, `sku`, and `description`.
- Exact filtering by `category` (enum) and `status` (enum).
- Low-stock threshold filter (`quantityOnHand <= minimumStock`).

---

## 7. Existing Error Handling Conventions

- Handlers wrap execution in `try-catch` blocks and never throw unhandled exceptions to callers.
- Domain-level exceptions (`InsufficientStockException`, `InvalidStockOperationException`, `InvalidQuantityException`, `OptimisticLockException`) are caught and mapped into descriptive, user-actionable error messages within `ApplicationResult.fail(message)`.

---

## 8. Required Inventory Use Cases Catalog

| Use Case                  | Type    | Handler Class                      | Description & Business Rules                                                                                             |
| :------------------------ | :------ | :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **CreateProduct**         | Command | `CreateInventoryItemHandler`       | Registers a new catalog item with unique SKU, pricing, unit, and optional opening stock balance.                         |
| **UpdateProduct**         | Command | `UpdateInventoryItemHandler`       | Updates mutable catalog metadata (`name`, `description`, `minimumStock`, `purchaseCost`, `sellingPrice`, `locationRef`). |
| **GetProduct**            | Query   | `GetInventoryItemByIdHandler`      | Retrieves a single inventory item by ID with tenant validation.                                                          |
| **ListProducts**          | Query   | `ListInventoryItemsHandler`        | Paginated search and filtering across catalog products by category, status, and search query.                            |
| **DeactivateProduct**     | Command | `DeactivateInventoryItemHandler`   | Transitions item status from `ACTIVE` to `INACTIVE`, preventing sales/consumption while preserving stock ledger.         |
| **ActivateProduct**       | Command | `ActivateInventoryItemHandler`     | Restores an `INACTIVE` item back to `ACTIVE`.                                                                            |
| **ArchiveProduct**        | Command | `ArchiveInventoryItemHandler`      | Terminal archiving of a discontinued product. Requires non-negative stock invariants.                                    |
| **RecordPurchase**        | Command | `ReceiveStockHandler`              | Increases stock on hand upon supplier delivery with unit cost attribution and purchase order reference ID.               |
| **RecordSale**            | Command | `SellStockHandler`                 | Decreases stock on hand upon retail/service sale with unit price attribution and invoice/order reference ID.             |
| **RecordConsumption**     | Command | `ConsumeStockHandler`              | Decreases stock on hand for internal clinical treatment or operational facility consumption.                             |
| **AdjustStockIn**         | Command | `AdjustStockInHandler`             | Incremental stock reconciliation increase (e.g. found inventory) with mandatory audit reason.                            |
| **AdjustStockOut**        | Command | `AdjustStockOutHandler`            | Incremental stock reconciliation decrease (e.g. inventory loss) with mandatory audit reason.                             |
| **CorrectStock**          | Command | `CorrectStockHandler`              | Absolute count reconciliation (e.g. physical inventory audit count) calculating required delta.                          |
| **ScrapStock**            | Command | `ScrapStockHandler`                | Removes damaged, expired, or spoiled inventory with mandatory scrap justification.                                       |
| **GetStockLevel**         | Query   | `GetStockLevelHandler`             | Fast query returning current stock on hand, minimum threshold, and reorder recommendation.                               |
| **GetInventoryMovements** | Query   | `ListStockMovementsHandler`        | Paginated chronological audit ledger of stock movements for an item or across the tenant.                                |
| **GetLowStockProducts**   | Query   | `GetLowStockInventoryItemsHandler` | Returns all active items whose `quantityOnHand <= minimumStock` for automated replenishment alerting.                    |
| **GetInventoryValue**     | Query   | `GetInventoryValuationHandler`     | Calculates total asset valuation of consumable stock across catalog categories using purchase cost basis.                |

---

## 9. Proposed Implementation Sequence

1. **Commands & Command Handlers**: Complete write workflows (`Create`, `Update`, `Deactivate`, `Activate`, `Archive`, `Receive`, `Sell`, `Consume`, `AdjustIn`, `AdjustOut`, `Correct`, `Scrap`).
2. **Queries & Query Handlers**: Complete read workflows (`GetById`, `ListPaginated`, `GetStockLevel`, `ListMovements`, `GetLowStock`, `GetValuation`).
3. **DTOs & Mappers**: Implement strongly-typed DTO contracts and bidirectional aggregate mappers.
4. **Unit & Application Tests**: Comprehensive test suite verifying authorization, validation, domain invariant enforcement, OCC handling, and pagination.
5. **Monorepo Quality Gate**: Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm validate`.

---

## 10. Risks & Architectural Gaps

| Risk                                        | Severity | Mitigation Strategy                                                                                                                   |
| :------------------------------------------ | :------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Concurrent Stock Depletion**              | High     | Domain OCC (`version` matching) combined with PostgreSQL engine-level `CHECK (quantity_on_hand >= 0)` guarantees zero negative stock. |
| **Unattributed Stock Corrections**          | Medium   | All mutation commands strictly enforce non-empty `actorId` and mandatory `reason` strings.                                            |
| **Unbounded List Query Memory Consumption** | Low      | Hard limit clamp (`MAX_LIMIT = 100`) and deterministic offset/limit pagination enforced in all query handlers.                        |
