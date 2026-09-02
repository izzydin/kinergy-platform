# Phase 6: Frontend URL-Driven State & DataTable Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: URLSearchParams Single Source of Truth, Track C DataTable Integration & Query Parameter Serialization  
**Author**: Principal Frontend Engineer & URL-Driven State Architecture Specialist  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Routing Architecture**](./frontend-routing-architecture.md)
- [**Phase 6 Frontend Query State Architecture**](./frontend-query-state-architecture.md)

---

## 1. URL State Philosophy & Single Source of Truth

In strict conformance with Kinergy Track C DataTable Architecture, browser `URLSearchParams` serves as the **exclusive and authoritative single source of truth** for collection state (search query, pagination, sorting, and faceted filters).

```
                      ┌──────────────────────────────────────┐
                      │ Browser Address Bar (URLSearchParams) │
                      │ `/resources/inventory?page=2&cat=...` │
                      └──────────────────┬───────────────────┘
                                         │ 1. Synchronizes URL changes
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ `useTableUrlState` Controller Hook    │
                      │ - Parses & validates raw query params │
                      │ - Debounces text search inputs (300ms)│
                      └──────────────────┬───────────────────┘
                                         │ 2. Emits typed params
                                         ▼
         ┌───────────────────────────────┴───────────────────────────────┐
         │                                                               │
         ▼                                                               ▼
┌─────────────────────────────────┐             ┌─────────────────────────────────┐
│ `useInventoryList(queryParams)` │             │ `<DataTable />` Presentation    │
│ - Canonical TanStack Query Key  │             │ - Column sorting headers        │
│ - Zero cache collision          │             │ - Faceted filter toolbars       │
└─────────────────────────────────┘             │ - Pagination footer controls    │
                                                └─────────────────────────────────┘
```

> [!IMPORTANT]
> **No Dual State**: Feature components MUST NOT maintain isolated React `useState` for filters or pagination. All user filter interactions update the URL via `history.replaceState` / `history.pushState`, guaranteeing that table views are 100% bookmarkable, shareable, and refresh-safe.

---

## 2. Consumable Inventory URL State Contract (`useInventoryFilters`)

### URL Query Parameters Map

| URL Parameter | Type      | Default     | Validation & Parsing Rules                                                               | Example                       |
| :------------ | :-------- | :---------- | :--------------------------------------------------------------------------------------- | :---------------------------- |
| `search`      | `string`  | `""`        | Free-text search matching SKU or Product Name (debounced 300ms).                         | `?search=massage+oil`         |
| `page`        | `number`  | `1`         | 1-based integer $\ge 1$. Invalid non-numeric values fallback to `1`.                     | `?page=2`                     |
| `limit`       | `number`  | `25`        | Allowed: `[10, 25, 50, 100]`. Invalid values fallback to `25`.                           | `?limit=50`                   |
| `sort`        | `string`  | `name.asc`  | Format: `<field>.<asc\|desc>`. Supported: `name`, `sku`, `currentStock`, `purchaseCost`. | `?sort=currentStock.asc`      |
| `category`    | `string`  | `undefined` | Must match `InventoryCategory` enum; otherwise stripped.                                 | `?category=CLINICAL_SUPPLIES` |
| `isActive`    | `boolean` | `undefined` | Parsed from `"true"` / `"false"`.                                                        | `?isActive=true`              |
| `isLowStock`  | `boolean` | `undefined` | Parsed from `"true"` / `"false"`.                                                        | `?isLowStock=true`            |

---

## 3. Stock Movement Ledger URL State Contract (`useMovementFilters`)

Used on the Product Detail movement sub-table (`/resources/inventory/:itemId`):

| URL Parameter | Type     | Default          | Validation & Parsing Rules                                  | Example                     |
| :------------ | :------- | :--------------- | :---------------------------------------------------------- | :-------------------------- |
| `movPage`     | `number` | `1`              | Prefixed to avoid collision with parent detail context.     | `?movPage=1`                |
| `movLimit`    | `number` | `10`             | Allowed: `[10, 25, 50]`. Default: `10`.                     | `?movLimit=10`              |
| `movType`     | `string` | `undefined`      | Validated against `StockMovementType` enum.                 | `?movType=PURCHASE_RECEIPT` |
| `movSort`     | `string` | `createdAt.desc` | Format: `createdAt.<asc\|desc>`. Default: `createdAt.desc`. | `?movSort=createdAt.desc`   |

---

## 4. Fixed Assets URL State Contract (`useFixedAssetFilters`)

### URL Query Parameters Map

| URL Parameter | Type     | Default          | Validation & Parsing Rules                                                                | Example                         |
| :------------ | :------- | :--------------- | :---------------------------------------------------------------------------------------- | :------------------------------ |
| `search`      | `string` | `""`             | Free-text search matching Asset Tag, Name, or Serial No.                                  | `?search=reformer`              |
| `page`        | `number` | `1`              | 1-based integer $\ge 1$. Invalid non-numeric values fallback to `1`.                      | `?page=1`                       |
| `limit`       | `number` | `25`             | Allowed: `[10, 25, 50, 100]`. Default: `25`.                                              | `?limit=25`                     |
| `sort`        | `string` | `createdAt.desc` | Supported: `name`, `assetTag`, `carryingValue`, `purchaseDate`, `createdAt`.              | `?sort=carryingValue.desc`      |
| `category`    | `string` | `undefined`      | Validated against `AssetCategory` enum.                                                   | `?category=KINESIOLOGY_DEVICES` |
| `status`      | `string` | `undefined`      | Validated against `FixedAssetStatus` enum (`ACTIVE`, `UNDER_MAINTENANCE`, etc.).          | `?status=UNDER_MAINTENANCE`     |
| `condition`   | `string` | `undefined`      | Validated against `AssetCondition` enum (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`). | `?condition=GOOD`               |
| `facilityId`  | `string` | `undefined`      | Validated facility UUID or identifier string.                                             | `?facilityId=fac_downtown`      |

---

## 5. Asset History & Maintenance URL Contracts

- **Asset History Stream** (`/resources/assets/:assetId?tab=history`):
  - `histPage`: 1-based integer (default `1`).
  - `histLimit`: Items per page (default `10`).
  - `eventType`: Filter by lifecycle transition or update event.
- **Maintenance Records Table** (`/resources/assets/:assetId?tab=maintenance`):
  - `maintPage`: 1-based integer (default `1`).
  - `maintLimit`: Items per page (default `10`).
  - `maintSort`: Format: `serviceDate.<asc|desc>` (default `serviceDate.desc`).

---

## 6. Pagination Reset & URL Normalization Rules

To prevent blank pages or inconsistent table views:

1. **Search Query Mutation**: Modifying the search text input resets `page` to `1`.
2. **Faceted Filter Change**: Adding, removing, or changing any faceted filter (`category`, `status`, `condition`, `facilityId`) resets `page` to `1`.
3. **Page Size Limit Change**: Changing `limit` (e.g. from 25 to 50) resets `page` to `1`.
4. **Column Sorting Change**: Changing sort column or direction preserves the current `page` unless the active page index exceeds total pages after refetch.
5. **Empty Filter Cleanup**: When a filter is cleared or matches the default value, the parameter is cleanly deleted from the URL query string rather than serialized as `?category=null` or `?category=`.

---

## 7. URL State Synchronization Implementation Pattern

```typescript
// Example Controller Hook Pattern for Inventory List
export function useInventoryFilters() {
  const { state, actions } = useTableUrlState<InventoryFiltersState>({
    paramNames: {
      q: 'search',
      page: 'page',
      limit: 'limit',
      sort: 'sort',
    },
    defaultLimit: 25,
    allowedLimits: [10, 25, 50, 100],
    defaultSort: 'name.asc',
    filterParsers: {
      category: (val) => (val && isValidInventoryCategory(val) ? val : undefined),
      isActive: (val) => (val === 'true' ? true : val === 'false' ? false : undefined),
      isLowStock: (val) => (val === 'true' ? true : undefined),
    },
    filterSerializers: {
      category: (val) => val ?? undefined,
      isActive: (val) => (val !== undefined ? String(val) : undefined),
      isLowStock: (val) => (val ? 'true' : undefined),
    },
  });

  const queryParams: ListInventoryFilterParams = useMemo(
    () => ({
      search: state.q || undefined,
      category: state.filters.category,
      isActive: state.filters.isActive,
      isLowStock: state.filters.isLowStock,
      page: state.page,
      limit: state.limit,
      sortBy: state.sort?.id,
      sortOrder: state.sort?.desc ? 'desc' : 'asc',
    }),
    [state],
  );

  return { state, actions, queryParams };
}
```
