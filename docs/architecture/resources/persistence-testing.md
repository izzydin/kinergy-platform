# Resources Persistence Layer Testing Specification & Quality Verification Report

**Bounded Context**: `Resources Management`  
**Milestone**: Phase 6.4 — Persistence Layer  
**Document**: Authoritative Persistence Invariants & Testing Standard  
**Status**: `APPROVED`  
**Date**: August 27, 2026

---

## 1. Test Strategy Overview

The testing strategy for the **Resources Management Persistence Layer** focuses on **persistence correctness, invariant durability, and historical ledger integrity** rather than superficial line coverage.

Persistence tests prove that:

1. All domain invariants established in Phase 6.1 (Consumable Inventory), Phase 6.2 (Fixed Assets), and Phase 6.3 (State Machines & Invariants) are preserved durably across database boundaries.
2. Repositories and mappers reconstitute rich domain aggregates with 100% fidelity without requiring controllers or presentation callers to reconstruct missing data.
3. Historical records (`StockMovement`, `AssetHistoryEvent`, `AssetMaintenanceRecord`) remain self-contained, immutable, and fully meaningful even after parent catalog attributes mutate.
4. Scale 2 monetary and quantity values are strictly insulated from IEEE-754 floating-point drift.
5. Concurrent updates trigger deterministic Optimistic Concurrency Control (OCC) collisions (`OptimisticLockException`).

---

## 2. Test Architecture & Database Setup

Persistence tests are organized in `packages/core/src/resources/infrastructure/persistence/prisma/__tests__/` and execute via Jest & Nx:

```
packages/core/src/resources/infrastructure/persistence/prisma/
  ├── mappers/
  │   ├── prisma-inventory-item.mapper.ts
  │   ├── prisma-stock-movement.mapper.ts
  │   ├── prisma-fixed-asset.mapper.ts
  │   ├── prisma-asset-history-event.mapper.ts
  │   └── prisma-asset-maintenance-record.mapper.ts
  ├── repositories/
  │   ├── prisma-inventory-item.repository.ts
  │   ├── prisma-fixed-asset.repository.ts
  │   ├── prisma-inventory-item-persistence.spec.ts
  │   └── prisma-fixed-asset-persistence.spec.ts
  └── __tests__/
      ├── prisma-resources-persistence.spec.ts
      ├── prisma-persistence-boundaries-and-invariants.spec.ts
      └── prisma-resources-comprehensive-persistence-invariants.spec.ts
```

---

## 3. Precision Verification Tests

| Field                              | Domain Type   | Storage Representation                         | Test Case               | Precision Invariant                           |
| :--------------------------------- | :------------ | :--------------------------------------------- | :---------------------- | :-------------------------------------------- |
| `InventoryItem.purchaseCost`       | `Money` VO    | `purchase_cost_amount Decimal(10,2)`           | `$6.25`, `$19.99`       | No binary float drift; exact 2 decimal places |
| `InventoryItem.sellingPrice`       | `Money` VO    | `selling_price_amount Decimal(10,2)`           | `$14.99`, `$39.95`      | No binary float drift; exact 2 decimal places |
| `InventoryItem.quantityOnHand`     | `Quantity` VO | `quantity_on_hand Decimal(10,2)`               | `50.00`, `100.33`       | Non-negative decimal stock                    |
| `FixedAsset.purchaseValue`         | `Money` VO    | `purchase_value_amount Decimal(10,2)`          | `$8999.50`, `$12500.00` | Non-negative capital valuation                |
| `FixedAsset.currentEstimatedValue` | `Money` VO    | `current_estimated_value_amount Decimal(10,2)` | `$5800.00`, `$7800.00`  | Non-negative asset revaluation                |
| `AssetMaintenanceRecord.cost`      | `Money` VO    | `cost_amount Decimal(10,2)`                    | `$285.50`, `$0.00`      | Non-negative servicing cost                   |

---

## 4. Relational Topology & Deletion Behavior Tests

1. **Inventory Aggregate Hierarchy (`1:N`)**:
   - `inventory_items` (Parent Root) $\rightarrow$ `stock_movements` (Child Ledger)
   - Foreign key constraint: `stock_movements_inventory_item_id_fkey` with `ON DELETE RESTRICT`.
   - Verified: Parent items with existing stock movements cannot be hard-deleted from the database, enforcing ledger preservation.
2. **Fixed Asset Aggregate Hierarchy (`1:N`)**:
   - `fixed_assets` (Parent Root) $\rightarrow$ `asset_history_events` (Audit Trail)
   - `fixed_assets` (Parent Root) $\rightarrow$ `asset_maintenance_records` (Service Logs)
   - Foreign key constraints: `ON DELETE RESTRICT`.
   - Verified: Capital assets with audit history or servicing records are permanent records and cannot be silently deleted.

---

## 5. Constraint & Database Invariant Verification

- **Unique Constraints**:
  - `inventory_items_sku_key`: Enforces global uniqueness on `sku`.
  - `fixed_assets_asset_tag_key`: Enforces global uniqueness on `asset_tag`.
- **PostgreSQL Engine-Level CHECK Constraints**:
  - `chk_inventory_items_non_negative_stock`: Rejects mutations resulting in `quantity_on_hand < 0.00`.
  - `chk_inventory_items_non_negative_min_stock`: Rejects `minimum_stock < 0.00`.
  - `chk_inventory_items_non_negative_cost`: Rejects `purchase_cost_amount < 0.00`.
  - `chk_inventory_items_non_negative_price`: Rejects `selling_price_amount < 0.00`.
  - `chk_fixed_assets_non_negative_purchase_val`: Rejects `purchase_value_amount < 0.00`.
  - `chk_fixed_assets_non_negative_est_val`: Rejects `current_estimated_value_amount < 0.00`.
  - `chk_asset_maintenance_non_negative_cost`: Rejects `cost_amount < 0.00`.

---

## 6. Historical Integrity & Immutability Verification

Persistence tests prove that historical records are self-contained and retain original contextual values even when parent mutable catalog properties change:

1. **Stock Movement Historical Isolation**:
   - When a Product's `name`, `sellingPrice`, `purchaseCost`, or `status` is updated, existing `StockMovement` records retain their immutable snapshot of `quantity_delta`, `balance_after`, `unit_cost_amount`, `recorded_by_user_id`, and `reason`.
2. **Asset History Meaningful Audit**:
   - Every lifecycle state transition (`ACTIVE -> UNDER_MAINTENANCE -> ACTIVE -> RETIRED -> SOLD`) writes an immutable `AssetHistoryEvent` containing structured JSONB diff payloads explaining why the change occurred and who authorized it.

---

## 7. Transaction Support & Unit-of-Work Verification

- **Atomic Stock Mutation**: Repository `save(item)` executes `inventoryItem.upsert()` and `stockMovement.upsert()` in a single `$transaction`. If any child insertion fails, the parent stock balance is rolled back.
- **Optimistic Concurrency Control (OCC)**:
  - Version increment is verified during updates (`version = priorVersion + 1`).
  - Concurrent version collisions trigger `OptimisticLockException`.

---

## 8. Clean Database & Monorepo Validation Results

- **Persistence Integration Test Suites**:
  - `prisma-resources-persistence.spec.ts`: PASSED (100%)
  - `prisma-inventory-item-persistence.spec.ts`: PASSED (100%)
  - `prisma-fixed-asset-persistence.spec.ts`: PASSED (100%)
  - `prisma-persistence-boundaries-and-invariants.spec.ts`: PASSED (100%)
  - `prisma-resources-comprehensive-persistence-invariants.spec.ts`: PASSED (100%)
- **Resources Bounded Context Test Suite**: 22 test suites (337 tests) passing cleanly.
- **Full Monorepo Validation (`pnpm validate`)**: 143 test suites, 1459 tests passing in `@kinergy/core`.

---

## 9. Known Limitations & Non-Goals

1. **No Outbox Table in Milestone 6.4**: Domain events are emitted in-process; transactional outbox pattern is deferred to cross-context integration milestones where distributed message brokers are introduced.
2. **Read-Model Views**: Reporting and aggregated financial analytics query materialized aggregate fields directly; dedicated denormalized read-models are deferred to Phase 6.6+.
