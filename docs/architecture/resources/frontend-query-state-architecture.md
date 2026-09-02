# Phase 6: Frontend Query State & Cache Management Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: TanStack Query v5 Cache Architecture, Canonical Query Keys & Mutation Invalidation  
**Author**: Principal React Engineer & TanStack Query Architecture Specialist  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0095: Three-Layer Concurrency Defense Strategy for Stock Mutations**](./adr/0095-three-layer-concurrency-defense-for-inventory-mutations.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Architecture Baseline**](./frontend-architecture-baseline.md)

---

## 1. Query Key Conventions & Design Rules

Query keys are treated as client-side distributed cache identifiers. In strict compliance with Kinergy TanStack Query standards (ADR-FE-0018):

1. **Root Namespace Segregation**: All resources query keys start with the tuple `['resources', '<subdomain>']`.
2. **Canonical Filter Input Representation**: Collection query keys include exact search, pagination, and filter parameters to guarantee cache identity per URL state.
3. **No Unstructured Key Arrays**: Ad-hoc query key arrays in components are strictly forbidden. All hooks consume canonical key factories.
4. **Targeted Invalidation vs. Global Invalidation**: Mutations invalidate only affected query sub-trees, preserving unrelated cache entries.

---

## 2. Inventory Query Key Model (`inventoryQueryKeys`)

```typescript
// apps/web/src/modules/resources/inventory/api/inventory-query-keys.ts
import type {
  ListInventoryFilterParams,
  ListMovementsFilterParams,
  LowStockFilterParams,
} from '../types';

export const inventoryQueryKeys = {
  all: ['resources', 'inventory'] as const,

  // Lists & Filtered Collections
  lists: () => [...inventoryQueryKeys.all, 'list'] as const,
  list: (params?: ListInventoryFilterParams) =>
    [...inventoryQueryKeys.lists(), params ?? {}] as const,

  // Single Entity Details
  details: () => [...inventoryQueryKeys.all, 'detail'] as const,
  detail: (itemId: string) => [...inventoryQueryKeys.details(), itemId] as const,

  // Sub-Resource Ledger & Real-Time Stock
  stock: (itemId: string) => [...inventoryQueryKeys.detail(itemId), 'stock'] as const,
  movements: (itemId: string, params?: ListMovementsFilterParams) =>
    [...inventoryQueryKeys.detail(itemId), 'movements', params ?? {}] as const,

  // Urgent Alerts
  lowStock: (params?: LowStockFilterParams) =>
    [...inventoryQueryKeys.all, 'low-stock', params ?? {}] as const,

  // Subdomain Valuation Aggregate
  valuation: () => [...inventoryQueryKeys.all, 'valuation'] as const,
};
```

---

## 3. Fixed Assets Query Key Model (`fixedAssetsQueryKeys`)

```typescript
// apps/web/src/modules/resources/assets/api/fixed-assets-query-keys.ts
import type {
  ListFixedAssetsFilterParams,
  AssetHistoryFilterParams,
  AssetMaintenanceFilterParams,
} from '../types';

export const fixedAssetsQueryKeys = {
  all: ['resources', 'assets'] as const,

  // Lists & Filtered Collections
  lists: () => [...fixedAssetsQueryKeys.all, 'list'] as const,
  list: (params?: ListFixedAssetsFilterParams) =>
    [...fixedAssetsQueryKeys.lists(), params ?? {}] as const,

  // Single Entity Details & Tag Lookup
  details: () => [...fixedAssetsQueryKeys.all, 'detail'] as const,
  detail: (assetId: string) => [...fixedAssetsQueryKeys.details(), assetId] as const,
  byTag: (tag: string) => [...fixedAssetsQueryKeys.all, 'tag', tag] as const,

  // Sub-Resource Audit Trail & Maintenance
  history: (assetId: string, params?: AssetHistoryFilterParams) =>
    [...fixedAssetsQueryKeys.detail(assetId), 'history', params ?? {}] as const,
  maintenance: (assetId: string, params?: AssetMaintenanceFilterParams) =>
    [...fixedAssetsQueryKeys.detail(assetId), 'maintenance', params ?? {}] as const,

  // Single Asset Valuation & Subdomain Aggregates
  valuation: (assetId: string) => [...fixedAssetsQueryKeys.detail(assetId), 'valuation'] as const,
  valuationSummary: () => [...fixedAssetsQueryKeys.all, 'valuation-summary'] as const,
};
```

---

## 4. Resource Valuation Query Key Model (`valuationQueryKeys`)

```typescript
// apps/web/src/modules/resources/valuation/api/valuation-query-keys.ts

export const valuationQueryKeys = {
  all: ['resources', 'valuation'] as const,
  combined: () => [...valuationQueryKeys.all, 'combined'] as const,
  inventory: () => [...valuationQueryKeys.all, 'inventory'] as const,
  assets: () => [...valuationQueryKeys.all, 'assets'] as const,
};
```

---

## 5. Collection Query Parameter Identity

To guarantee bookmarkability and distinct cache entries across DataTable states:

| Parameter Key | Type              | Description                 | Query Key Serialization             |
| :------------ | :---------------- | :-------------------------- | :---------------------------------- |
| `page`        | `number`          | 1-based page index          | `{ page: 1 }`                       |
| `pageSize`    | `number`          | Items per page (10, 25, 50) | `{ pageSize: 25 }`                  |
| `search`      | `string`          | Debounced text query        | `{ search: 'ultrasound' }`          |
| `category`    | `string`          | Category filter             | `{ category: 'CLINICAL_SUPPLIES' }` |
| `status`      | `string`          | Status filter               | `{ status: 'ACTIVE' }`              |
| `condition`   | `string`          | Physical condition          | `{ condition: 'EXCELLENT' }`        |
| `facilityId`  | `string`          | Facility location           | `{ facilityId: 'fac_north' }`       |
| `sortBy`      | `string`          | Sort field name             | `{ sortBy: 'name' }`                |
| `sortOrder`   | `'asc' \| 'desc'` | Sort direction              | `{ sortOrder: 'asc' }`              |

---

## 6. Targeted Cache Invalidation Matrix

| Mutation Action          | Triggered Hook                      | Affected Entity Cache                                                               | Collection Caches              | Financial & Alert Caches                                                    |
| :----------------------- | :---------------------------------- | :---------------------------------------------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------- |
| **Create Product**       | `useCreateInventoryItemMutation`    | —                                                                                   | Invalidate `inventory.lists()` | Invalidate `inventory.valuation()`, `valuation.all`                         |
| **Update Product**       | `useUpdateInventoryItemMutation`    | Invalidate `inventory.detail(id)`                                                   | Invalidate `inventory.lists()` | Invalidate `inventory.valuation()`, `valuation.all`                         |
| **Archive Product**      | `useArchiveInventoryItemMutation`   | Invalidate `inventory.detail(id)`                                                   | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`                                           |
| **Purchase Receipt**     | `useRecordPurchaseMutation`         | Invalidate `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)` | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| **Retail Sale**          | `useRecordSaleMutation`             | Invalidate `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)` | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| **Clinical Consumption** | `useRecordConsumptionMutation`      | Invalidate `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)` | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| **Stock Scrap**          | `useScrapStockMutation`             | Invalidate `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)` | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| **Stock Adjustment**     | `useAdjustStockMutation`            | Invalidate `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)` | Invalidate `inventory.lists()` | Invalidate `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| **Register Asset**       | `useCreateFixedAssetMutation`       | —                                                                                   | Invalidate `assets.lists()`    | Invalidate `assets.valuationSummary()`, `valuation.all`                     |
| **Update Asset Details** | `useUpdateFixedAssetMutation`       | Invalidate `assets.detail(id)`                                                      | Invalidate `assets.lists()`    | —                                                                           |
| **Transfer Location**    | `useTransferAssetMutation`          | Invalidate `assets.detail(id)`, `assets.history(id)`                                | Invalidate `assets.lists()`    | —                                                                           |
| **Change Asset Status**  | `useChangeAssetStatusMutation`      | Invalidate `assets.detail(id)`, `assets.history(id)`                                | Invalidate `assets.lists()`    | Invalidate `assets.valuationSummary()`, `valuation.all`                     |
| **Update Condition**     | `useUpdateAssetConditionMutation`   | Invalidate `assets.detail(id)`, `assets.history(id)`                                | Invalidate `assets.lists()`    | —                                                                           |
| **Log Maintenance**      | `useRecordAssetMaintenanceMutation` | Invalidate `assets.detail(id)`, `assets.maintenance(id)`, `assets.history(id)`      | Invalidate `assets.lists()`    | Invalidate `assets.valuationSummary()`                                      |
| **Revalue Asset**        | `useUpdateAssetValuationMutation`   | Invalidate `assets.detail(id)`, `assets.valuation(id)`, `assets.history(id)`        | Invalidate `assets.lists()`    | Invalidate `assets.valuationSummary()`, `valuation.all`                     |

---

## 7. Cache Update & Optimistic UI Boundaries

### Safe Optimistic Updates (Applied Immediately)

- **Metadata Editing** (Product Name, Description, Reorder Threshold, Asset Description): Applied via `executeOptimisticUpdate` on the detail query key with rollback snapshot in `onMutate`.
- **Condition Updates**: Optimistically updates condition badge on detail view.

### Explicit Invalidation Required (No Client-Side Calculation Guessing)

- **Stock Mutations** (Purchase, Sale, Consumption, Adjust): The client does **NOT** attempt client-side stock subtraction arithmetic in cache. Instead, upon mutation completion, `invalidateQueries` refetches authoritative database state. This prevents race-condition drift with other concurrent users.
- **State Machine Transitions**: Transitions trigger server invalidation to ensure exact server timestamps, actor IDs, and OCC version increments are reflected.

---

## 8. Stale-Data Recovery & Concurrency Conflict Strategy

When a mutation fails due to Optimistic Concurrency Control (`409 Conflict`) or business rule violation (`400 Bad Request`):

```
[Concurrent User Mutation Rejection (409 Conflict / 400 Invariant)]
                                │
                      `onError` Callback
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
      [Rollback Cache Snapshot]          [Display Toast Error]
               │                                 │
               └────────────────┬────────────────┘
                                │
                    [Invalidate Query Keys]
                                │
               [Refetch Authoritative Server State]
                                │
                 [UI Automatically Synchronized]
```

1. **Automatic Snapshot Rollback**: Reverts optimistic cache data immediately.
2. **Actionable Toast Notification**: Displays normalized error message (e.g. `"Optimistic lock conflict: entity was modified concurrently. Refreshing state."`).
3. **Automated Cache Invalidation**: Forces background refetch of current server state, eliminating stale UI presentation without requiring a manual browser reload.
