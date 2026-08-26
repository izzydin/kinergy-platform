# Architectural Boundary & Invariant Enforcement Specification

- **Module**: `packages/core/src/resources/`
- **Status**: **AUTHORITATIVE ARCHITECTURAL AUDIT & SPECIFICATION (APPROVED & ACTIVE)**
- **Governing ADRs**:
  - [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
  - [ADR-0084: Inventory Concurrency Control & Race Condition Prevention](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)
  - [ADR-0085: Fixed Asset Operational Lifecycle State Machine & Terminal Disposal Policy](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)
  - [ADR-0089: Inventory Monetary, Quantity, and Unit of Measure Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
  - [ADR-0090: Fixed Asset Classification, Lifecycle State, and Condition Rating Strategy](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)

---

## 1. Domain Boundary Architecture & Segregation Principle

In strict accordance with Domain-Driven Design (DDD) principles and Kinergy Clean Architecture:

> [!IMPORTANT]
> **No Generic "Resource Mutation" Abstraction**:
> We explicitly **REJECT** combining Fixed Asset lifecycle management and Consumable Inventory stock into a single generic `ResourceMutationService` or `ResourceStateManager`.

### 1.1 Why Asset Lifecycle and Consumable Inventory are Separate Bounded Sub-Domains

| Architectural Dimension | Fixed Asset Sub-Domain (`FixedAsset`)                                                                                                | Consumable Inventory Sub-Domain (`InventoryItem`)                                                                                                 |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Domain Problem**      | Managing individual, non-fungible capital equipment, physical location tracking, service maintenance, and depreciation across years. | Managing discrete and continuous fungible consumable stock, clinical usage, retail sales, and inventory replenishments.                           |
| **Entity Nature**       | **Non-fungible physical item** identified by unique `AssetTag` and `AssetId`.                                                        | **Fungible SKU** identified by alphanumeric `SKU` and `InventoryItemId`.                                                                          |
| **Lifecycle Model**     | **Explicit 5-State Finite State Machine** (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`) with terminal sink states.   | **Catalog Status** (`ACTIVE`, `INACTIVE`, `ARCHIVED`) governing whether real-time stock mutations are permitted.                                  |
| **Mutation Mechanics**  | State transitions, physical condition assessments, location transfers, maintenance logs, and financial salvage revaluations.         | Double-entry stock deltas ($+\Delta$ on purchase/adjustment-in, $-\Delta$ on sale/consumption/scrap), low-stock threshold alerts.                 |
| **Audit Ledger Model**  | Structured `AssetHistoryEvent` log capturing categorical business provenance and actor attribution.                                  | Immutable `StockMovement` accounting journal capturing `balanceBefore`, strictly positive `quantity`, signed `quantityDelta`, and `balanceAfter`. |

### 1.2 Shared Infrastructure vs. Distinct Domain Semantics

```
                               ┌──────────────────────────────────────────────┐
                               │           SHARED INFRASTRUCTURE LAYER        │
                               │ - Database Connection & prisma.$transaction  │
                               │ - Optimistic Concurrency Control (version)   │
                               │ - Domain Exceptions & Result Monads          │
                               │ - Test Harness & Assertion Utilities         │
                               └──────────────────────┬───────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
       ┌───────────────────────────────┐                             ┌───────────────────────────────┐
       │   FIXED ASSET DOMAIN BOUNDARY │                             │   CONSUMABLE INVENTORY DOMAIN │
       │ - FixedAsset Aggregate Root   │                             │ - InventoryItem Aggregate Root│
       │ - AssetLifecycleStateMachine  │                             │ - StockMovement Entity        │
       │ - AssetHistoryEvent Entity    │                             │ - Quantity / SKU Value Objects│
       │ - AssetMaintenanceRecord      │                             │ - Double-Entry Ledger Math    │
       └───────────────────────────────┘                             └───────────────────────────────┘
```

---

## 2. Fixed Asset Invariant Boundary

The `FixedAsset` aggregate root encapsulates all invariants governing capital equipment:

### 2.1 Enforced Invariants

1. **Zero Arbitrary Status Assignment**: `_status` is private with no public setter. All transitions strictly invoke domain methods (`changeStatus`, `sendToMaintenance`, `markAsDamaged`, `restoreToActive`, `retire`, `sell`).
2. **Deterministic State Machine Enforcement**: Validates every requested transition against the 5x5 state transition matrix (`AssetLifecycleStateMachine.assertTransitionValid`).
3. **Terminal Sink Protection**:
   - `SOLD`: Inviolably terminal (`assertNotSold` blocks all 7 mutating domain methods).
   - `RETIRED`: Decommissioned sink state (`assertNotRetired` blocks transfers, condition rating changes, status updates, and maintenance recordings; allows salvage revaluation for auction disposal).
4. **Condition Serviceability Guard**: An asset in `OUT_OF_SERVICE` condition cannot transition to `ACTIVE` without formal restoration and condition update (`[AST-INV-9]`).
5. **Mandatory Provenance**: Every state mutation requires an actor ID (`actorId`) and a valid business reason ($\ge 3$ non-whitespace characters).

---

## 3. Consumable Inventory Invariant Boundary

The `InventoryItem` aggregate root encapsulates all invariants governing physical stock:

### 3.1 Enforced Invariants

1. **Absolute Non-Negative Stock Floor (`[INV-STK-1]`)**: Materialized balance $QOH \ge 0.00$. Any decrement that would result in $QOH < 0.00$ throws `InsufficientStockException`.
2. **Deterministic Movement Direction (`[INV-STK-2]`)**:
   - `receiveStock` $\rightarrow$ `PURCHASE` ($+\Delta$)
   - `sellStock` $\rightarrow$ `SALE` ($-\Delta$)
   - `consumeStock` $\rightarrow$ `CONSUMPTION` ($-\Delta$)
   - `adjustStockIn` $\rightarrow$ `ADJUSTMENT_IN` ($+\Delta$)
   - `adjustStockOut` $\rightarrow$ `ADJUSTMENT_OUT` ($-\Delta$)
3. **Strict Input Magnitude Validation**: Callers submit strictly positive magnitudes ($\text{qty} > 0.00$). Zero and negative inputs are rejected at domain boundary with `InvalidInventoryItemStateException` or `InvalidQuantityException`.
4. **Double-Entry Ledger Reconciliation**: Every movement records $\text{balanceBefore} + \text{signedDelta} = \text{balanceAfter}$, ensuring total movements equal current stock.
5. **Catalog Status Lock**: All stock mutations on `INACTIVE` or `ARCHIVED` items are blocked (`assertActiveCatalogStatus`).

---

## 4. Transaction Boundaries & Partial Failure Guarantees

Every business operation executes inside an explicit transactional boundary ensuring **Zero Inconsistent Partial State**:

| Sub-Domain    | Business Operation        | Materialized State Change                                 | Audit Ledger / Child Entity                           | Transaction Boundary         | Behavior if Second Write Fails                                                                      |
| :------------ | :------------------------ | :-------------------------------------------------------- | :---------------------------------------------------- | :--------------------------- | :-------------------------------------------------------------------------------------------------- |
| **Asset**     | **Status Transition**     | `fixed_assets.status`, `version` increment                | Insert `AssetHistoryEvent` (`STATUS_CHANGED`)         | Single `prisma.$transaction` | **Rollback**: Status reverts to prior state; OCC version un-incremented; zero history rows written. |
| **Asset**     | **Location Transfer**     | `fixed_assets.facility_id`, `room_id`, `version`          | Insert `AssetHistoryEvent` (`TRANSFERRED`)            | Single `prisma.$transaction` | **Rollback**: Location reverts to prior room/facility; zero history rows written.                   |
| **Asset**     | **Condition Update**      | `fixed_assets.condition`, `version`                       | Insert `AssetHistoryEvent` (`CONDITION_UPDATED`)      | Single `prisma.$transaction` | **Rollback**: Condition reverts; zero history rows written.                                         |
| **Asset**     | **Salvage Revaluation**   | `fixed_assets.estimated_value_amount`, `version`          | Insert `AssetHistoryEvent` (`VALUATION_UPDATED`)      | Single `prisma.$transaction` | **Rollback**: Valuation reverts; zero history rows written.                                         |
| **Asset**     | **Record Maintenance**    | `fixed_assets.status` (if modified), `version`            | Insert `AssetMaintenanceRecord` + `AssetHistoryEvent` | Single `prisma.$transaction` | **Rollback**: Maintenance record not saved; status unchanged; zero history rows written.            |
| **Asset**     | **Decommission / Retire** | `fixed_assets.status = RETIRED`, `version`                | Insert `AssetHistoryEvent` (`RETIRED`)                | Single `prisma.$transaction` | **Rollback**: Status remains active/damaged; zero history rows written.                             |
| **Asset**     | **Liquidation / Sale**    | `fixed_assets.status = SOLD`, `version`                   | Insert `AssetHistoryEvent` (`SOLD`)                   | Single `prisma.$transaction` | **Rollback**: Status remains active/retired; zero history rows written.                             |
| **Inventory** | **Receive Stock**         | `inventory_items.quantity_on_hand` ($+\Delta$), `version` | Insert `StockMovement` (`PURCHASE`)                   | Single `prisma.$transaction` | **Rollback**: Stock balance unchanged; zero movement rows written.                                  |
| **Inventory** | **Retail Sale**           | `inventory_items.quantity_on_hand` ($-\Delta$), `version` | Insert `StockMovement` (`SALE`)                       | Single `prisma.$transaction` | **Rollback**: Stock balance unchanged; zero movement rows written.                                  |
| **Inventory** | **Clinical Consumption**  | `inventory_items.quantity_on_hand` ($-\Delta$), `version` | Insert `StockMovement` (`CONSUMPTION`)                | Single `prisma.$transaction` | **Rollback**: Stock balance unchanged; zero movement rows written.                                  |
| **Inventory** | **Inventory Adjust In**   | `inventory_items.quantity_on_hand` ($+\Delta$), `version` | Insert `StockMovement` (`ADJUSTMENT_IN`)              | Single `prisma.$transaction` | **Rollback**: Stock balance unchanged; zero movement rows written.                                  |
| **Inventory** | **Inventory Adjust Out**  | `inventory_items.quantity_on_hand` ($-\Delta$), `version` | Insert `StockMovement` (`ADJUSTMENT_OUT`)             | Single `prisma.$transaction` | **Rollback**: Stock balance unchanged; zero movement rows written.                                  |

---

## 5. Direct Mutation & Bypass Vector Audit Results

A systematic codebase inspection was performed to verify that no public or repository paths allow bypassing domain invariants:

### 5.1 Aggregate Encapsulation

- `FixedAsset`: `_status`, `_condition`, `_locationRef`, `_estimatedValue`, `_version` are private with **no public setters**.
- `InventoryItem`: `_quantityOnHand`, `_version`, `_status`, `_minimumStock` are private with **no public setters**.
- `InventoryItem.updateCatalogDetails()`: Strictly limits mutations to catalog metadata (`name`, `description`, `category`, `unit`, `minimumStock`, `purchaseCost`, `sellingPrice`, `locationRef`). Accepts zero stock arguments.

### 5.2 Repository Interface Boundaries

- `FixedAssetRepositoryInterface`: Exposes `save(asset: FixedAsset)`, `findById()`, `findByAssetTag()`, `findAll()`, `count()`, `delete()`. Exposes **zero generic update or direct status mutation methods**.
- `InventoryItemRepository`: Exposes `save(item: InventoryItem)`, `findById()`, `findBySku()`, `findMany()`, `count()`, `delete()`. Exposes **zero generic update or direct stock mutation methods**.

### 5.3 Infrastructure Persistence Mappings

- `PrismaFixedAssetRepository.save()`: Uses `tx.fixedAsset.updateMany({ where: { id, version: priorVersion } })`. Any OCC version mismatch throws `OptimisticLockException` and rolls back the transaction.
- `PrismaInventoryItemRepository.save()`: Uses `tx.inventoryItem.updateMany({ where: { id, version: priorVersion } })`. Any OCC version mismatch throws `OptimisticLockException` and rolls back the transaction.

### 5.4 Seed and Test Fixtures

- All production repository implementations strictly accept valid domain aggregates.
- Test suites utilize `FixedAsset.create()`, `InventoryItem.create()`, or explicit reconstituted states via `FixedAsset.reconstitute()` and `InventoryItem.reconstitute()` for deterministic snapshot seeding without violating DDD aggregate boundaries.

---

## 6. Database Defense-in-Depth Hardening

In addition to rich domain validations, the PostgreSQL persistence tier enforces non-negotiable structural constraints:

1. **PostgreSQL Check Constraint**: `CHECK (quantity_on_hand >= 0)` on `inventory_items` table prevents corrupted negative stock at storage engine level.
2. **OCC Version Increment**: `version INTEGER NOT NULL DEFAULT 1` with atomic conditional `WHERE version = :priorVersion` prevents lost updates and phantom writes under concurrent contention.
3. **Foreign Key Referential Integrity**: `asset_history_events.asset_id` and `stock_movements.inventory_item_id` link directly to parent tables with cascading delete protection.
4. **Immutability of Ledgers**: History events and stock movement records have no update methods in domain or persistence layers (append-only journals).

---

## 7. Quality & Verification Evidence

All boundary protections and invariant guarantees are verified across the automated test suite:

- [`asset-lifecycle-transition-enforcement.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-transition-enforcement.spec.ts) (31 tests)
- [`asset-business-operations-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-business-operations-invariants.spec.ts) (15 tests)
- [`inventory-stock-mutation-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-invariants.spec.ts) (18 tests)
- [`inventory-stock-mutation-concurrency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-concurrency.spec.ts) (11 tests)
- [`prisma-fixed-asset-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-fixed-asset-persistence.spec.ts) (3 tests)
- [`prisma-inventory-item-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-inventory-item-persistence.spec.ts) (5 tests)
- **Monorepo Validation**: Passed 100% Prettier formatting, ESLint, TypeScript compilation, 141 test suites (1417 tests passing in `@kinergy/core`), and production builds across all 10 monorepo projects.
