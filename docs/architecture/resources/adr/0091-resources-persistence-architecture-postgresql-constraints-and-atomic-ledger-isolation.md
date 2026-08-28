# ADR-0091: Resources Persistence Architecture, PostgreSQL Engine Constraints & Atomic Ledger Isolation

- **Status**: Accepted
- **Deciders**: Principal Architect, Principal Database Engineer, Lead Backend Engineer
- **Date**: 2026-08-27
- **Context/Milestone**: Phase 6 — Milestone 6.4 (Persistence Layer)

---

## Context and Problem Statement

Milestone 6.4 requires establishing a production persistence model for the Resources Bounded Context (`InventoryItem`, `StockMovement`, `FixedAsset`, `AssetHistoryEvent`, `AssetMaintenanceRecord`) in the existing Prisma schema and PostgreSQL database.

We must decide:

1. How domain aggregates map to relational storage while strictly insulating domain logic from `@prisma/client` leaking.
2. How to ensure double-entry stock movement ledgers and asset audit trails cannot be bypassed or corrupted by raw SQL or direct ORM updates.
3. How to enforce monetary and quantity precision across database columns.
4. How to structure transaction boundaries for atomic unit-of-work persistence.

---

## Decision Drivers

- **Domain Isolation**: Domain and application layers must have zero dependencies on Prisma models, generated input types, or `Prisma.Decimal`.
- **Ledger Invariant Durability**: Non-negative stock levels, non-negative monetary amounts, and immutable historical records must be protected by database defense-in-depth.
- **Relational Integrity**: Foreign keys must prevent silent deletion of parent items when historical movements or service records exist (`ON DELETE RESTRICT`).
- **Precision Guarantees**: Monetary amounts and quantities must use explicit Scale 2 decimal representation (`Decimal(10,2)`).

---

## Decision Outcome

1. **Prisma Repository & Two-Way Mapper Isolation**:
   - Repositories (`PrismaInventoryItemRepository`, `PrismaFixedAssetRepository`) implement clean domain repository interfaces.
   - Reconstitution and persistence serialization are isolated entirely within dedicated mappers (`PrismaInventoryItemMapper`, `PrismaFixedAssetMapper`, `PrismaStockMovementMapper`, etc.).
2. **PostgreSQL Engine-Level CHECK Constraints**:
   - 7 engine-level check constraints are added to the migration DDL (`chk_inventory_items_non_negative_stock`, `chk_inventory_items_non_negative_min_stock`, `chk_inventory_items_non_negative_cost`, `chk_inventory_items_non_negative_price`, `chk_fixed_assets_non_negative_purchase_val`, `chk_fixed_assets_non_negative_est_val`, `chk_asset_maintenance_non_negative_cost`).
3. **Foreign Key RESTRICT Actions**:
   - All parent-child relations (`InventoryItem -> StockMovement`, `FixedAsset -> AssetHistoryEvent`, `FixedAsset -> AssetMaintenanceRecord`) use `ON DELETE RESTRICT`.
4. **Scale 2 Fixed Decimal Precision**:
   - All monetary and quantity database fields use PostgreSQL `DECIMAL(10,2)` and bidirectional conversion with Domain `Money` and `Quantity` Value Objects.
5. **Atomic Unit-of-Work Persistence**:
   - Aggregate persistence (e.g. stock mutation + movement creation, asset state transition + history event) executes atomically within a single `$transaction`.

---

## Alternatives Considered

1. **Permissive `ON DELETE CASCADE` on Stock Movements / Asset History**:
   - _Rejected_: Deleting a product must never silently erase historical financial and operational audit records.
2. **Domain-Only Invariant Validation without Database CHECK Constraints**:
   - _Rejected_: Fails defense-in-depth requirements; bugs or external data migrations could cause negative inventory or negative prices.
3. **Using IEEE-754 `Float` Types for Monetary Values**:
   - _Rejected_: Violates strict accounting precision due to binary floating-point drift.

---

## Consequences

- **Positive**: Complete defense-in-depth, 100% domain layer purity, zero floating-point drift, and durable audit trail preservation.
- **Negative**: Deletion of active catalog records with history requires archiving/deactivation rather than physical row deletion.
