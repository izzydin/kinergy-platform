# Phase 6: Frontend API Query and Mutation Hook Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: TanStack Query Hooks, API Transport Abstraction, Notification Boundaries & Error Normalization  
**Author**: Senior Frontend Engineer, TanStack Query Specialist & API Boundary Architect  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Query State Architecture**](./frontend-query-state-architecture.md)

---

## 1. API Boundary Architecture & Governance

The API layer bridges UI components and backend REST endpoints across three strictly separated sub-features (`inventory`, `assets`, `valuation`):

```
┌────────────────────────────────────────────────────────┐
│ UI Presentation Components (Tables, Modals, Forms)     │
└───────────────────────────┬────────────────────────────┘
                            │ Calls custom domain hooks
                            ▼
┌────────────────────────────────────────────────────────┐
│ Custom Query & Mutation Hooks (`hooks/`)               │
│ - Encapsulates TanStack Query cache logic              │
│ - Dispatches standardized user feedback toasts         │
│ - Orchestrates targeted query invalidation             │
└───────────────────────────┬────────────────────────────┘
                            │ Consumes typed API clients
                            ▼
┌────────────────────────────────────────────────────────┐
│ Typed API Clients (`api/*-api.ts`)                     │
│ - Serializes REST parameters and payloads              │
│ - Invokes shared `HttpClient` (`axios` instance)       │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP JSON over Wire
                            ▼
┌────────────────────────────────────────────────────────┐
│ Backend REST API (`apps/api/src/resources/`)           │
└────────────────────────────────────────────────────────┘
```

---

## 2. Consumable Inventory Hooks (`src/modules/resources/inventory/`)

### Query Hooks (`use-inventory-queries.ts`)

| Hook Name               | Input Parameters                                     | Endpoint                                    | Return Type                          | Stale Time | Cache Key                                      |
| :---------------------- | :--------------------------------------------------- | :------------------------------------------ | :----------------------------------- | :--------- | :--------------------------------------------- |
| `useInventoryList`      | `params?: ListInventoryFilterParams`                 | `GET /resources/inventory`                  | `PaginatedResponse<InventoryItemVM>` | 30s        | `inventoryQueryKeys.list(params)`              |
| `useInventoryItem`      | `itemId: string`                                     | `GET /resources/inventory/:id`              | `InventoryItemVM`                    | 60s        | `inventoryQueryKeys.detail(itemId)`            |
| `useInventoryStock`     | `itemId: string`                                     | `GET /resources/inventory/:id/stock`        | `StockLevelVM`                       | 15s        | `inventoryQueryKeys.stock(itemId)`             |
| `useInventoryMovements` | `itemId: string, params?: ListMovementsFilterParams` | `GET /resources/inventory/:id/movements`    | `PaginatedResponse<StockMovementVM>` | 30s        | `inventoryQueryKeys.movements(itemId, params)` |
| `useLowStockAlerts`     | `params?: LowStockFilterParams`                      | `GET /resources/inventory/alerts/low-stock` | `LowStockAlertVM[]`                  | 30s        | `inventoryQueryKeys.lowStock(params)`          |
| `useInventoryValuation` | —                                                    | `GET /resources/valuation/inventory`        | `InventoryValuationVM`               | 60s        | `inventoryQueryKeys.valuation()`               |

### Mutation Hooks (`use-inventory-mutations.ts`)

| Mutation Hook                     | Input Payload                                     | Endpoint                                    | Target Server Invalidation                                                                                                                                      |
| :-------------------------------- | :------------------------------------------------ | :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCreateInventoryItemMutation`  | `CreateInventoryItemInput`                        | `POST /resources/inventory`                 | `inventory.lists()`, `inventory.valuation()`, `valuation.all`                                                                                                   |
| `useUpdateInventoryItemMutation`  | `{ id: string; input: UpdateInventoryItemInput }` | `PATCH /resources/inventory/:id`            | `inventory.detail(id)`, `inventory.lists()`, `inventory.valuation()`                                                                                            |
| `useArchiveInventoryItemMutation` | `itemId: string`                                  | `POST /resources/inventory/:id/archive`     | `inventory.detail(id)`, `inventory.lists()`, `inventory.lowStock()`                                                                                             |
| `useRecordPurchaseMutation`       | `{ id: string; input: RecordPurchaseInput }`      | `POST /resources/inventory/:id/purchase`    | `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)`, `inventory.lists()`, `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| `useRecordSaleMutation`           | `{ id: string; input: RecordSaleInput }`          | `POST /resources/inventory/:id/sale`        | `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)`, `inventory.lists()`, `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| `useRecordConsumptionMutation`    | `{ id: string; input: RecordConsumptionInput }`   | `POST /resources/inventory/:id/consumption` | `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)`, `inventory.lists()`, `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| `useScrapStockMutation`           | `{ id: string; input: ScrapStockInput }`          | `POST /resources/inventory/:id/scrap`       | `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)`, `inventory.lists()`, `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |
| `useAdjustStockMutation`          | `{ id: string; input: AdjustStockInput }`         | `POST /resources/inventory/:id/adjust`      | `inventory.detail(id)`, `inventory.stock(id)`, `inventory.movements(id)`, `inventory.lists()`, `inventory.lowStock()`, `inventory.valuation()`, `valuation.all` |

---

## 3. Fixed Asset Hooks (`src/modules/resources/assets/`)

### Query Hooks (`use-fixed-asset-queries.ts`)

| Hook Name                  | Input Parameters                                         | Endpoint                                | Return Type                              | Stale Time | Cache Key                                           |
| :------------------------- | :------------------------------------------------------- | :-------------------------------------- | :--------------------------------------- | :--------- | :-------------------------------------------------- |
| `useFixedAssetsList`       | `params?: ListFixedAssetsFilterParams`                   | `GET /resources/assets`                 | `PaginatedResponse<FixedAssetVM>`        | 30s        | `fixedAssetsQueryKeys.list(params)`                 |
| `useFixedAssetDetail`      | `assetId: string`                                        | `GET /resources/assets/:id`             | `FixedAssetVM`                           | 60s        | `fixedAssetsQueryKeys.detail(assetId)`              |
| `useFixedAssetByTag`       | `assetTag: string`                                       | `GET /resources/assets/tag/:tag`        | `FixedAssetVM`                           | 60s        | `fixedAssetsQueryKeys.byTag(assetTag)`              |
| `useFixedAssetHistory`     | `assetId: string, params?: AssetHistoryFilterParams`     | `GET /resources/assets/:id/history`     | `PaginatedResponse<AssetHistoryEventVM>` | 30s        | `fixedAssetsQueryKeys.history(assetId, params)`     |
| `useFixedAssetMaintenance` | `assetId: string, params?: AssetMaintenanceFilterParams` | `GET /resources/assets/:id/maintenance` | `PaginatedResponse<AssetMaintenanceVM>`  | 30s        | `fixedAssetsQueryKeys.maintenance(assetId, params)` |
| `useFixedAssetValuation`   | `assetId: string`                                        | `GET /resources/assets/:id/valuation`   | `AssetValuationVM`                       | 60s        | `fixedAssetsQueryKeys.valuation(assetId)`           |
| `useAssetValuationSummary` | —                                                        | `GET /resources/valuation/assets`       | `AssetValuationSummaryVM`                | 60s        | `fixedAssetsQueryKeys.valuationSummary()`           |

### Mutation Hooks (`use-fixed-asset-mutations.ts`)

| Mutation Hook                       | Input Payload                                       | Endpoint                                 | Target Server Invalidation                                                                                      |
| :---------------------------------- | :-------------------------------------------------- | :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `useCreateFixedAssetMutation`       | `CreateFixedAssetInput`                             | `POST /resources/assets`                 | `assets.lists()`, `assets.valuationSummary()`, `valuation.all`                                                  |
| `useUpdateFixedAssetMutation`       | `{ id: string; input: UpdateFixedAssetInput }`      | `PATCH /resources/assets/:id`            | `assets.detail(id)`, `assets.lists()`                                                                           |
| `useTransferAssetMutation`          | `{ id: string; input: TransferAssetLocationInput }` | `POST /resources/assets/:id/transfer`    | `assets.detail(id)`, `assets.history(id)`, `assets.lists()`                                                     |
| `useChangeAssetStatusMutation`      | `{ id: string; input: ChangeAssetStatusInput }`     | `POST /resources/assets/:id/status`      | `assets.detail(id)`, `assets.history(id)`, `assets.lists()`, `assets.valuationSummary()`, `valuation.all`       |
| `useUpdateAssetConditionMutation`   | `{ id: string; input: UpdateAssetConditionInput }`  | `POST /resources/assets/:id/condition`   | `assets.detail(id)`, `assets.history(id)`, `assets.lists()`                                                     |
| `useRecordAssetMaintenanceMutation` | `{ id: string; input: RecordMaintenanceInput }`     | `POST /resources/assets/:id/maintenance` | `assets.detail(id)`, `assets.maintenance(id)`, `assets.history(id)`, `assets.lists()`                           |
| `useUpdateAssetValuationMutation`   | `{ id: string; input: UpdateAssetValuationInput }`  | `POST /resources/assets/:id/valuation`   | `assets.detail(id)`, `assets.valuation(id)`, `assets.history(id)`, `assets.valuationSummary()`, `valuation.all` |

---

## 4. Resource Valuation Hooks (`src/modules/resources/valuation/`)

### Query Hooks (`use-valuation-queries.ts`)

| Hook Name                      | Input Parameters | Endpoint                             | Return Type                   | Stale Time | Cache Key                        |
| :----------------------------- | :--------------- | :----------------------------------- | :---------------------------- | :--------- | :------------------------------- |
| `useCombinedResourceValuation` | —                | `GET /resources/valuation/combined`  | `CombinedResourceValuationVM` | 60s        | `valuationQueryKeys.combined()`  |
| `useInventoryValuationSummary` | —                | `GET /resources/valuation/inventory` | `InventoryValuationVM`        | 60s        | `valuationQueryKeys.inventory()` |
| `useAssetValuationSummary`     | —                | `GET /resources/valuation/assets`    | `AssetValuationSummaryVM`     | 60s        | `valuationQueryKeys.assets()`    |

---

## 5. Notification & Feedback Ownership

To prevent duplicate toast popups:

1. **Mutation Hooks Own User Feedback**: The mutation hook's `onSuccess` dispatches a positive toast (`success('Purchase recorded successfully')`), and `onError` dispatches an error toast (`error(err)`).
2. **Components Do NOT Dispatch Redundant Toasts**: Components simply trigger `mutateAsync()` and handle local UI state (e.g. closing modals, resetting forms).
3. **HTTP Client Does NOT Intercept Toast Notifications**: The HTTP transport client remains a pure network fetcher without UI side effects.

---

## 6. Optimistic UI Classification

| Classification                         | Mutation Operations                                                                                    | Execution Strategy                                                                                                          | Rationale                                                                                                        |
| :------------------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| **Optimistic UX**                      | Product metadata update, Asset metadata update, Condition rating update                                | Immediate local query cache modification with snapshot rollback in `onError`.                                               | Low collision rate, purely descriptive fields without multi-step financial or transactional invariants.          |
| **Pessimistic / Server-Authoritative** | Purchase, Sale, Consumption, Scrap, Adjust, Location Transfer, Status Change, Maintenance, Revaluation | No client cache guessing. Modal remains in loading state until server confirms; then triggers explicit `invalidateQueries`. | Must preserve exact double-entry ledger timestamps, OCC version increments, and physical concurrency guarantees. |
