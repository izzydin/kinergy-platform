# Consumable Inventory Query Contracts & Valuation Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Consumable Inventory`  
**Milestone**: Phase 6.5 — Consumable Inventory Application Layer (Queries & Valuation)  
**Document**: Authoritative Specification for Inventory Read-Models, Movement Queries, and Asset Valuation  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 28, 2026

---

## 1. Executive Summary & Objective

Deterministic inventory querying provides operational clarity for clinical treatments, point-of-sale retail, and financial reporting across Kinergy facilities. This specification governs the four foundational query use cases:

1. **`GetStockLevel`** (`GetStockLevelHandler`): Single-item maintained stock level and replenishment threshold representation.
2. **`GetInventoryMovements`** (`ListStockMovementsHandler`): Filtered, paginated, append-only ledger transaction history.
3. **`GetLowStockProducts`** (`GetLowStockItemsHandler`): Reorder warning queue for items at or below safety stock thresholds.
4. **`GetInventoryValue`** (`GetInventoryValuationHandler`): Working capital valuation and category asset breakdown computed with exact fixed-scale decimal arithmetic.

---

## 2. Maintained State vs. Ledger Calculation (`GetStockLevel`)

### 2.1 Architectural Decision: Read Maintained State

- **Rule**: `GetStockLevel` reads directly from the aggregate root's materialized `quantityOnHand` field. It **never** scans or sums the complete historical `StockMovement` table on read queries.
- **Rationale**: The aggregate invariant guarantees that `quantityOnHand` is atomically synchronized on every mutation in the same database transaction. Reading maintained state delivers $O(1)$ indexed lookups.

### 2.2 Stock-Level Contract

- **Input**: `itemId` (UUID, required), `tenantId` (string, optional boundary check).
- **Archived Visibility**: Returns the item state with status `'ARCHIVED'` and `quantityOnHand: 0.00`.
- **Not-Found Behavior**: If the item does not exist or tenant mismatch occurs, returns `ApplicationResult.fail("Inventory item with id ... not found.")`.
- **DTO Output (`StockLevelDTO`)**:
  ```typescript
  export interface StockLevelDTO {
    itemId: string;
    sku: string;
    name: string;
    quantityOnHand: number;
    minimumStock: number;
    unit: string;
    status: string;
    isLowStock: boolean;
    isOutOfStock: boolean;
    category: string;
    version: number;
    updatedAt: string;
  }
  ```

---

## 3. Stock Movement Ledger Queries (`GetInventoryMovements`)

### 3.1 Unbounded Query Prevention

Unbounded table scans across the append-only ledger are strictly prohibited. Every movement query is bound by default pagination limits (`limit = 20`, max `100`).

### 3.2 Filtering Capabilities

- **`itemId`**: Restricts movements to a specific catalog item.
- **`tenantId`**: Enforces strict multi-tenant boundary isolation.
- **`movementType`**: Filters by operation type (`PURCHASE`, `SALE`, `CONSUMPTION`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `CORRECTION`, `SCRAP`).
- **`recordedByUserId`**: Filters by actor / staff ID.
- **`referenceId`**: Filters by external correlation ID (e.g. `PO-2026-8812`, `TX-SESSION-001`).
- **`fromDate` & `toDate`**: Temporal range boundaries.

### 3.3 Date Range Contract & Temporal Boundaries

- **Timezone**: All timestamps are parsed and formatted in standard UTC (ISO 8601).
- **Boundary Inclusion**:
  - `fromDate`: Inclusive ($\ge \text{fromDate}$).
  - `toDate`: Inclusive ($\le \text{toDate}$). If date-only string provided (e.g. `2026-08-29`), normalized to end-of-day UTC (`2026-08-29T23:59:59.999Z`).
- **Validation**: If `fromDate > toDate`, the handler returns a failure without hitting the database (`"fromDate cannot be after toDate."`).

### 3.4 Sorting & Determinism

- **Default Order**: `recordedAt DESC, id DESC`. Secondary sorting by unique `id` guarantees deterministic pagination order across high-frequency concurrent entries.

---

## 4. Low-Stock Reorder Detection (`GetLowStockProducts`)

### 4.1 Business Invariant & Canonical Rule

The canonical low-stock condition is defined across the domain as:

$$\text{currentStock} \le \text{minimumStock}$$

- **Zero-Stock Inclusion**: Items with `quantityOnHand == 0.00` are strictly included in low-stock queries.
- **Surplus Exclusion**: Items with `currentStock > minimumStock` are excluded.
- **Archived Default**: Discontinued (`ARCHIVED`) items are excluded by default, preventing discontinued items from cluttering procurement reorder dashboards. They can be inspected explicitly by passing `includeArchived: true`.
- **Infrastructure Reuse**: Reuses `FindInventoryItemsFilter` (`lowStockOnly: true`) to guarantee zero divergence in low-stock evaluation across the application.

---

## 5. Inventory Asset Valuation (`GetInventoryValue`)

### 5.1 Authoritative Valuation Strategy

- **Baseline Valuation Model**: **Acquisition / Procurement Cost (FIFO Base)**.
  $$\text{Item Valuation} = \text{round}(\text{quantityOnHand}_i \times \text{purchaseCost}_i, 2)$$
  $$\text{Total Valuation} = \sum_{i=1}^N \text{Item Valuation}_i$$

- **Zero-Stock Products**: Items with `0.00` stock contribute exactly `0.00` to total valuation.
- **Archived Products**: Excluded by default from working capital asset totals.
- **Missing Purchase Cost**: Defaults to `0.00` with warning provenance.

### 5.2 Decimal Precision & Zero Floating-Point Drift

To eliminate binary IEEE 754 floating-point rounding errors (e.g. `0.1 + 0.2 = 0.30000000000000004`), valuation accumulation executes in exact **integer cents** (fixed Scale 2 precision):

```typescript
const itemValueCents = Math.round(qty * unitCostAmount * 100);
totalCents += itemValueCents;
const totalValueAmount = totalCents / 100;
```

### 5.3 DTO Response Structure (`InventoryValuationDTO`)

```typescript
export interface InventoryValuationDTO {
  totalValueAmount: number;
  currency: string;
  totalDistinctItems: number;
  totalQuantityUnits: number;
  calculatedAt: string;
  breakdownByCategory: Record<
    string,
    {
      totalValueAmount: number;
      itemCount: number;
      totalUnits: number;
    }
  >;
  items: InventoryValuationItemDTO[];
}
```

---

## 6. Query Indexing & Performance Review

The database indexes established in Phase 6.4 provide optimal query path coverage:

1. **`inventory_items_tenant_id_sku_idx`**: Powers $O(1)$ unique SKU and stock level queries.
2. **`inventory_items_tenant_id_category_status_idx`**: Powers category and valuation aggregation scans.
3. **`stock_movements_inventory_item_id_recorded_at_idx`**: Powers timeline movement queries filtered by product.
4. **`stock_movements_recorded_at_idx`**: Powers facility-wide date-range movement queries and audit reviews.

No additional schema migrations or indexes are required for Phase 6.5.
