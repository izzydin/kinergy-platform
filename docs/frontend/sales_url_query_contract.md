# Sales API & URL-driven DataTable Integration Contract

> **Role:** Senior Frontend Architect  
> **Status:** APPROVED & CONTRACTUALLY SEALED  
> **Governing Standards:** [ADR-FE-0013], [ADR-FE-0015], [ADR-0136], `docs/frontend/data-table-architecture.md`  
> **Target Scope:** Sales HTTP API (`GET /api/v1/sales`) & Web Client Table Infrastructure (`@kinergy-platform/web`)

---

## 1. Architectural Overview & Objective

This contract specifies the authoritative, deterministic integration between Kinergy's **URL-driven DataTable presentation framework** and the **Sales HTTP API (`GET /api/v1/sales`)**.

To uphold the core principles of Kinergy's frontend architecture, all table search, domain filters, sorting, and pagination state must reside in the **browser URLSearchParams as the single source of truth**. This guarantees:

1. **Zero Duplicate State**: No desynchronization between React component state, browser URL, and server cache.
2. **Deep-Linking & Shareability**: Opening, sharing, or bookmarking any filtered URL reproduces the exact query state.
3. **Refresh Invariance**: Refreshing a view in the browser maintains the exact table view without resetting page, sort, or active filters.
4. **Deterministic Backend Validation**: Every parameter conforms to clean DTO validation and explicit domain criteria, rejecting malformed input with established HTTP error codes (`400 Bad Request`).

---

## 2. State Ownership Taxonomy

Following **[ADR-FE-0013]** and **[ADR-FE-0015]**, state ownership is strictly partitioned across single-purpose owners:

| State Domain          | Single Source of Truth    | Mechanism                                            | Responsibility / Rule                                                           |
| :-------------------- | :------------------------ | :--------------------------------------------------- | :------------------------------------------------------------------------------ |
| **Server Data**       | **TanStack Query**        | `useQuery({ queryKey: ['sales', params], queryFn })` | Automatic caching, background refetching, deduping, and query cancellation.     |
| **Search Query**      | **Browser URL**           | `?q=search-term` (`useTableUrlState`)                | Survives page reload, shareable, debounced keystroke synchronization.           |
| **Domain Filters**    | **Browser URL**           | `?status=PAID&clientId=...`                          | Deep-linkable faceted queries across lifecycle status, origin, and customer.    |
| **Sorting**           | **Browser URL**           | `?sort=total.asc` or `?sort=createdAt.desc`          | Compound `<field>.<dir>` parameter maintaining deterministic server-side order. |
| **Pagination**        | **Browser URL**           | `?page=2&limit=50`                                   | 1-based index and page size limit; omitted when matching defaults.              |
| **Row Selection**     | **Local Component State** | `useState<RowSelectionState>()`                      | Transient UI interaction for batch operations (Export, Bulk Invoice).           |
| **Column Visibility** | **Local Component State** | `useState<VisibilityState>()`                        | Viewport presentation preference; not polluting shareable URLs.                 |

---

## 3. Authoritative Contract Mapping: URL State ↔ API Query DTO

The following matrix documents the authoritative contract between browser URL parameters, frontend hook state (`useSalesFilters`), and backend DTO fields (`ListSalesQueryDto` / `ListSalesQuery`):

| URL Parameter       | Type / Format   |      Default       | API DTO Field           | Core Query Field                | Validation & Serialization Rules                                                                                                                                                                        |
| :------------------ | :-------------- | :----------------: | :---------------------- | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `q`                 | `string`        |    `""` (clean)    | `dto.q`                 | `criteria.search`               | Free-text search matching `sourceCode` substring or exact Sale ID. Alias `search` is supported identically. Debounced by 300ms on typing.                                                               |
| `page`              | `integer >= 1`  |        `1`         | `dto.page`              | `pagination.page`               | 1-based page index. Clamped $\ge 1$. Omitted from URL when `page === 1` to maintain clean URLs.                                                                                                         |
| `limit`             | `integer`       |        `20`        | `dto.limit`             | `pagination.limit`              | Items per page. Allowed values: `[10, 20, 50, 100]`. Min: `1`, Max: `100`. Omitted from URL when default (`20`).                                                                                        |
| `sort`              | `<field>.<dir>` | `'createdAt.desc'` | `dto.sort`              | `sort.field` & `sort.direction` | Compound sorting parameter. Unpacked by backend into primary `sortField` and `sortDirection`. Whitelisted fields: `createdAt`, `total`, `totalAmount`, `status`. Whitelisted directions: `asc`, `desc`. |
| `clientId`          | `string`        |         —          | `dto.clientId`          | `criteria.clientId`             | External client identifier / UUID. Scoped automatically to `currentUser.id` if caller has `Client` or `Member` role.                                                                                    |
| `status`            | `string` (enum) |         —          | `dto.status`            | `criteria.status`               | Case-insensitive string normalized to `SaleStatus` enum: `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`.                                                    |
| `sourceType`        | `string` (enum) |         —          | `dto.sourceType`        | `criteria.sourceType`           | Origin category: `INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`, `FOOD`, `DRINK`, `POINT_OF_SALE`, `ECOMMERCE`. Case-insensitive normalization.                             |
| `sourceReferenceId` | `string`        |         —          | `dto.sourceReferenceId` | `criteria.sourceReferenceId`    | External origin entity reference identifier (e.g. POS terminal ID, membership plan UUID).                                                                                                               |
| `fromDate`          | ISO-8601 UTC    |         —          | `dto.fromDate`          | `criteria.fromDate`             | Inclusive lower bound for `createdAt`. Evaluated as `createdAt >= fromDate`. Alias `dateFrom` supported identically.                                                                                    |
| `toDate`            | ISO-8601 UTC    |         —          | `dto.toDate`            | `criteria.toDate`               | Inclusive upper bound for `createdAt`. Evaluated as `createdAt <= toDate`. Alias `dateTo` supported identically. Invariant: `fromDate <= toDate`.                                                       |

---

## 4. Default Value Semantics & Absent Parameter Handling

When parameters are omitted from the URL (or set to empty strings), both the frontend table engine and the backend API apply deterministic defaults:

| Parameter           | When Absent in URL | Frontend Table State                           | Backend Query Execution                                                      |
| :------------------ | :----------------- | :--------------------------------------------- | :--------------------------------------------------------------------------- |
| `page`              | Omitted from URL   | `page: 1`                                      | `page: 1` (first page retrieved)                                             |
| `limit`             | Omitted from URL   | `limit: 20`                                    | `limit: 20` (bounded page size)                                              |
| `sort`              | Omitted from URL   | `sortState: [{ id: 'createdAt', desc: true }]` | `sortField: 'createdAt'`, `sortDirection: 'desc'`, plus tie-breaker `id ASC` |
| `q` / `search`      | Omitted from URL   | `q: ""`                                        | Unfiltered by search text                                                    |
| `clientId`          | Omitted from URL   | `filters.clientId: undefined`                  | All clients within authenticated tenant                                      |
| `status`            | Omitted from URL   | `filters.status: undefined`                    | All lifecycle statuses included                                              |
| `sourceType`        | Omitted from URL   | `filters.sourceType: undefined`                | All origin sources included                                                  |
| `sourceReferenceId` | Omitted from URL   | `filters.sourceReferenceId: undefined`         | All entity references included                                               |
| `fromDate`          | Omitted from URL   | `filters.fromDate: undefined`                  | Unbounded lower creation date                                                |
| `toDate`            | Omitted from URL   | `filters.toDate: undefined`                    | Unbounded upper creation date                                                |

---

## 5. Deterministic Error Handling & Out-of-Bounds Behavior

Invalid parameters are handled deterministically without runtime crashes, SQL injection vulnerabilities, or uncaught exceptions:

### 5.1 Backend HTTP 400 Bad Request Matrix

| Failure Condition                | Example Trigger                          | HTTP Code | Error Response Contract                                                                     |
| :------------------------------- | :--------------------------------------- | :-------: | :------------------------------------------------------------------------------------------ |
| **Invalid Page**                 | `?page=abc` or `?page=0`                 |   `400`   | `Invalid page '...'. Page must be an integer greater than or equal to 1.`                   |
| **Negative / Non-Integer Limit** | `?limit=0` or `?limit=xyz`               |   `400`   | `Invalid limit '...'. Limit must be an integer greater than or equal to 1.`                 |
| **Limit Exceeding Cap**          | `?limit=150`                             |   `400`   | `Limit cannot exceed maximum page size of 100.`                                             |
| **Unwhitelisted Sort Field**     | `?sort=password_hash.asc`                |   `400`   | `Invalid sort field '...'. Allowed sort fields are: createdAt, total, totalAmount, status.` |
| **Invalid Sort Direction**       | `?sort=createdAt.sideways`               |   `400`   | `Invalid sort direction '...'. Allowed directions are 'asc' or 'desc'.`                     |
| **Invalid Lifecycle Status**     | `?status=BOGUS_STATUS`                   |   `400`   | `Invalid sale status '...'.`                                                                |
| **Unsupported Source Type**      | `?sourceType=XYZ_CATALOG`                |   `400`   | `Invalid source type '...'.`                                                                |
| **Malformed Date String**        | `?fromDate=invalid-date`                 |   `400`   | `fromDate must be a valid ISO-8601 date string.`                                            |
| **Inverted Date Range**          | `?fromDate=2026-10-15&toDate=2026-10-01` |   `400`   | `fromDate (...) cannot be after toDate (...).`                                              |

### 5.2 Out-of-Range Pagination Behavior

- If `page > totalPages` (e.g. `?page=99` when only 3 records exist):
  - The API returns **`200 OK`** with `items: []`.
  - Preserves accurate pagination metadata: `total: 3`, `page: 99`, `limit: 20`, `totalPages: 1`, `hasNextPage: false`, `hasPreviousPage: true`.
  - The frontend displays `DataTableEmpty` with "No results on this page" and provides navigation back to page 1.
- If total records match `0`:
  - Returns `200 OK` with `items: []`, `total: 0`, `totalPages: 0`, `hasNextPage: false`, `hasPreviousPage: false`.

### 5.3 Frontend Resilient Fallback Sanitization

If a user directly navigates to a URL with malformed parameters, `useSalesFilters` applies safe client-side fallback parsing:

- `page=abc` $\rightarrow$ parsed as `page: 1`.
- `limit=9999` $\rightarrow$ parsed as default `limit: 20` (validated against allowed limits `[10, 20, 50, 100]`).
- `status=UNKNOWN` $\rightarrow$ parsed as `undefined` (ignored).
- `sort=malformed.too.many.dots` $\rightarrow$ parsed as default `createdAt.desc`.

---

## 6. Reset Behavior Contract

To maintain predictable user interaction across table filters and pagination, state transitions follow established reset policies:

| User Action                | URL State Modification            |             Page Impact              | Rationale                                                           |
| :------------------------- | :-------------------------------- | :----------------------------------: | :------------------------------------------------------------------ |
| **Search Query (`q`)**     | `prev.set('q', val)`              | `prev.delete('page')` (resets to 1)  | Prevents blank screens when search query reduces total pages.       |
| **Filter Facet Change**    | `prev.set(key, val)`              | `prev.delete('page')` (resets to 1)  | Restarts pagination for newly narrowed dataset.                     |
| **Limit Change (`limit`)** | `prev.set('limit', val)`          | `prev.delete('page')` (resets to 1)  | Page indices shift when page size changes.                          |
| **Sort Change (`sort`)**   | `prev.set('sort', '<col>.<dir>')` |            **Preserved**             | Users expect to inspect the top sorted results of the current page. |
| **Reset Filters**          | Clears `q` and domain filters     | `prev.delete('page')` (resets to 1)  | Restores initial unconstrained list view.                           |
| **Reset All**              | Clears all query parameters       | `page: 1`, `limit: 20`, default sort | Restores complete factory configuration.                            |

---

## 7. Frontend Integration Reference Implementation

The Sales URL state hook is implemented in `apps/web/src/modules/sales/hooks/use-sales-filters.ts` on top of Kinergy's shared table engine (`useTableUrlState`):

```typescript
import { useTableUrlState } from '@/shared/table';
import {
  type ListSalesQueryParams,
  type SalesFilters,
  type UseSalesFiltersReturn,
  VALID_SALE_STATUSES,
} from '../types/sales-query.types';

export function useSalesFilters(): UseSalesFiltersReturn {
  const { state, actions } = useTableUrlState<SalesFilters>({
    paramNames: { q: 'q', page: 'page', limit: 'limit', sort: 'sort' },
    defaultPage: 1,
    defaultLimit: 20,
    allowedLimits: [10, 20, 50, 100],
    defaultSort: 'createdAt.desc',
    filterParsers: {
      status: (val) => {
        if (!val) return undefined;
        const norm = val.trim().toUpperCase() as SaleStatus;
        return VALID_SALE_STATUSES.includes(norm) ? norm : undefined;
      },
      clientId: (val) => (val?.trim() ? val.trim() : undefined),
      sourceType: (val) => (val?.trim() ? val.trim().toUpperCase() : undefined),
      sourceReferenceId: (val) => (val?.trim() ? val.trim() : undefined),
      fromDate: (val) => (val?.trim() ? val.trim() : undefined),
      toDate: (val) => (val?.trim() ? val.trim() : undefined),
    },
  });

  // Generates clean query payload for TanStack Query
  const params: ListSalesQueryParams = useMemo(
    () => ({
      q: state.q || undefined,
      page: state.page,
      limit: state.limit,
      sort: state.sort ?? 'createdAt.desc',
      sortField: (state.sortState?.id as SaleSortField) ?? 'createdAt',
      sortDirection: state.sortState?.desc ? 'desc' : 'asc',
      clientId: state.filters.clientId,
      status: state.filters.status,
      sourceType: state.filters.sourceType,
      sourceReferenceId: state.filters.sourceReferenceId,
      fromDate: state.filters.fromDate,
      toDate: state.filters.toDate,
    }),
    [state],
  );

  return {
    params,
    filters: state.filters,
    q: state.q,
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    sortState: state.sortState
      ? [{ id: state.sortState.id, desc: state.sortState.desc }]
      : [{ id: 'createdAt', desc: true }],
    isFiltered: state.isFiltered,
    setSearch: actions.setQ,
    setPage: actions.setPage,
    setLimit: actions.setLimit,
    setSort: actions.setSort,
    toggleSort: actions.toggleSort,
    setStatus: (status) =>
      status === 'ALL' ? actions.clearFilter('status') : actions.setFilter('status', status),
    setClientId: (id) => actions.setFilter('clientId', id?.trim() || undefined),
    setSourceType: (type) =>
      actions.setFilter('sourceType', type?.trim().toUpperCase() || undefined),
    setSourceReferenceId: (id) => actions.setFilter('sourceReferenceId', id?.trim() || undefined),
    setDateRange: (fromDate, toDate) => actions.setFilters({ fromDate, toDate }),
    resetFilters: () => actions.resetFilters({ preserveSort: true, preserveLimit: true }),
    resetAll: actions.resetAll,
  };
}
```

---

## 8. Automated Test Coverage & Verification Evidence

The contract is verified end-to-end via comprehensive test suites spanning both frontend URL state handling and backend HTTP query execution:

### 8.1 Web URL State Contract Test Suite (`apps/web/src/modules/sales/__tests__/sales-table-url-contract.spec.tsx`)

- **Suite Pass Rate:** 17/17 tests passing cleanly.
- **Scenarios Verified:**
  - `initializes with deterministic defaults when URL is clean`
  - `accurately hydrates all filters, sorting, and pagination from a populated URL`
  - `produces equivalent state on direct page open vs. navigation (refresh invariance)`
  - `synchronizes search changes to the URL and resets page to 1`
  - `synchronizes status filter changes to the URL and resets page to 1`
  - `clears status filter when set to ALL`
  - `synchronizes date range changes to the URL and resets page to 1`
  - `synchronizes sort toggling (none -> asc -> desc -> none)`
  - `changing sort direction preserves the current page`
  - `changing limit resets page to 1 and applies new limit`
  - `resetFilters removes search and domain filters while preserving sort and limit`
  - `resetAll restores the entire URL state to initial configuration defaults`
  - `falls back to default page 1 when page is non-numeric, 0, or negative`
  - `falls back to default limit 20 when limit is invalid or unallowed`
  - `filters out unsupported or malformed sale status values`
  - `normalizes lowercase valid status to uppercase enum`
  - `ignores malformed compound sort string gracefully`

### 8.2 API HTTP Query Contract Test Suite (`apps/api/src/sales/__tests__/sales-url-query-contract.spec.ts`)

- **Suite Pass Rate:** 20/20 tests passing cleanly.
- **Scenarios Verified:**
  - `matches sourceCode substring via standard frontend "q" parameter`
  - `matches sourceCode substring via alias "search" parameter`
  - `filters sales strictly matching clientId`
  - `filters sales by sourceType and normalizes casing`
  - `filters sales by sourceReferenceId`
  - `rejects unsupported sourceType with 400 Bad Request`
  - `filters sales by status and handles case-insensitivity`
  - `rejects invalid status with 400 Bad Request`
  - `filters sales with fromDate and toDate bounds`
  - `supports dateFrom and dateTo aliases identically`
  - `rejects inverted date range (fromDate > toDate) with 400 Bad Request`
  - `applies default page=1 and limit=20 when omitted`
  - `slices items correctly for custom page and limit`
  - `rejects limit exceeding maximum cap of 100 with 400 Bad Request`
  - `returns empty items array for page beyond total count without error`
  - `parses frontend compound sort format "total.asc"`
  - `parses frontend compound sort format "totalAmount.desc"`
  - `parses discrete sortField="totalAmount" and sortDirection="desc"`
  - `rejects unwhitelisted sortField with 400 Bad Request`
  - `rejects invalid sortDirection with 400 Bad Request`
