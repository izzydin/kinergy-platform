# Consumable Inventory Query & Filtering Architectural Contract

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Consumable Inventory`  
**Milestone**: Phase 6.5 — Consumable Inventory Application Layer  
**Document**: Authoritative Inventory Query, Filter, Sorting & Pagination Specification  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 28, 2026

---

## 1. Request & Filter Contract Definition

The `ListInventoryItemsQuery` provides deterministic, multi-criteria filtering, full-text search, and bounded pagination over the catalog.

```typescript
export interface ListInventoryItemsFilter {
  /** Optional case-insensitive substring search across name, SKU, and description */
  search?: string;

  /** Single category or array of categories to filter by */
  category?: InventoryCategory | InventoryCategory[];

  /** Stock availability status filter */
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  /** Lifecycle status filter (default: ['ACTIVE', 'INACTIVE'] excluding 'ARCHIVED') */
  status?: InventoryItemStatus | InventoryItemStatus[];

  /** Whether to include archived items in the result set (default: false) */
  includeArchived?: boolean;

  /** Pagination: 1-indexed page number (default: 1) */
  page?: number;

  /** Pagination: page size (default: 20, minimum: 1, maximum: 100) */
  limit?: number;

  /** Sort field from whitelist (default: 'name') */
  sortBy?:
    'name' | 'sku' | 'category' | 'quantityOnHand' | 'sellingPrice' | 'createdAt' | 'updatedAt';

  /** Sort direction (default: 'asc') */
  sortOrder?: 'asc' | 'desc';
}

export interface ListInventoryItemsQuery {
  tenantId: string;
  filter?: ListInventoryItemsFilter;
}
```

---

## 2. Search Semantics

1. **Searchable Fields**:
   - `name`: Substring match.
   - `sku`: Exact or prefix/substring match.
   - `description`: Substring match.
2. **Case Sensitivity**: Strictly **case-insensitive** (normalized to lowercase in query execution).
3. **Whitespace Normalization**: Leading and trailing whitespaces are trimmed (`trim()`). Multiple consecutive whitespace characters are collapsed to a single space.
4. **Empty Search Behavior**: If `search` is `undefined`, `null`, or an empty string `""` after trimming, the search filter is omitted (matches all records).
5. **Length Constraints**: Maximum search string length is clamped at **100 characters** to prevent ReDoS / excessive SQL parsing overhead. Searches exceeding 100 characters are trimmed to the first 100 characters.

---

## 3. Category Filter Semantics

- **Supported Formats**: Accepts either a single `InventoryCategory` enum value or an array of `InventoryCategory` enum values.
- **Matching Rule**: Set membership (`category IN (...)`).
- **Invalid Category Handling**: Non-enum category strings are rejected with an explicit validation error or sanitized by being excluded from the filter set.
- **Interaction with Other Filters**: Combines with `search`, `stockStatus`, and `status` via boolean conjunction (`AND`).

---

## 4. Stock Status Filter Semantics

To eliminate UI ambiguity and provide exact business reporting, `stockStatus` is partitioned into three mutually exclusive, non-overlapping categories:

| Status Category | Deterministic Mathematical Rule                                  | Business Meaning                                                       |
| :-------------- | :--------------------------------------------------------------- | :--------------------------------------------------------------------- |
| `OUT_OF_STOCK`  | `quantityOnHand == 0.00`                                         | Depleted inventory requiring immediate replenishment.                  |
| `LOW_STOCK`     | `quantityOnHand > 0.00` **AND** `quantityOnHand <= minimumStock` | Inventory below or equal to reorder threshold, but not fully depleted. |
| `IN_STOCK`      | `quantityOnHand > minimumStock`                                  | Healthy inventory levels above reorder threshold.                      |

> [!NOTE]
> For the separate query `GetLowStockInventoryItemsQuery` (automated reorder alerting), the broader business definition `quantityOnHand <= minimumStock` is used (which includes both `OUT_OF_STOCK` and `LOW_STOCK`). Within the multi-facet filter contract, the three categories above are non-overlapping.

---

## 5. Active / Archive Lifecycle Filter Semantics

1. **Default Behavior**: If neither `status` nor `includeArchived` is specified, the query returns only `ACTIVE` and `INACTIVE` items (`status IN ['ACTIVE', 'INACTIVE']`).
2. **Archived Isolation**: Archived items are strictly excluded by default to prevent discontinued products from cluttering operational ordering screens.
3. **Explicit Archive Access**:
   - Setting `includeArchived: true` includes `ACTIVE`, `INACTIVE`, and `ARCHIVED` items.
   - Setting `status: 'ARCHIVED'` returns only archived items.

---

## 6. Bounded Pagination Specification

1. **Page Numbering**: 1-indexed (`page >= 1`). If `page < 1` is supplied, it defaults to `1`.
2. **Page Size Defaults & Clamps**:
   - `DEFAULT_PAGE = 1`
   - `DEFAULT_LIMIT = 20`
   - `MAX_LIMIT = 100`
   - If `limit < 1`, defaults to `20`. If `limit > 100`, clamped to `100`.
3. **Response Shape**:
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
4. **Empty Page Boundary**: If `page > totalPages`, `items` returns `[]`, `hasNextPage: false`, and `hasPreviousPage: true` (if `total > 0`).

---

## 7. Sorting Whitelist & Deterministic Ordering

### 7.1 Whitelisted Sort Fields

Arbitrary client sorting strings are forbidden. Only the following whitelisted properties are allowed:

- `name`
- `sku`
- `category`
- `quantityOnHand`
- `sellingPrice`
- `createdAt`
- `updatedAt`

### 7.2 Default Ordering & Tie-Breaker

To prevent non-deterministic page shifts across paginated requests:

- **Default Sort**: Status `ACTIVE` first, then `name ASC`.
- **Tie-Breaker**: Secondary sort on `id ASC` is appended to guarantee deterministic ordering across identical values.

---

## 8. Filter Combination Rules

All active filter dimensions combine using **Boolean Conjunction (`AND`)**:

$$\text{Result Set} = \text{Tenant} \land \text{Search} \land \text{Category} \land \text{StockStatus} \land \text{LifecycleStatus}$$

---

## 9. Request / Response Examples

### Example A: Default Catalog Query (Page 1)

**Request**:

```json
{
  "tenantId": "tenant_kinergy_prime",
  "filter": {
    "page": 1,
    "limit": 20
  }
}
```

**Applied Logic**: `tenantId == 'tenant_kinergy_prime' AND status IN ['ACTIVE', 'INACTIVE']`, sorted by `name ASC, id ASC`.

---

### Example B: Search Low-Stock Clinical Supplies

**Request**:

```json
{
  "tenantId": "tenant_kinergy_prime",
  "filter": {
    "search": "tape",
    "category": "CLINICAL_SUPPLIES",
    "stockStatus": "LOW_STOCK",
    "page": 1,
    "limit": 10
  }
}
```

**Applied Logic**: `tenantId == 'tenant_kinergy_prime' AND category == 'CLINICAL_SUPPLIES' AND (name ILIKE '%tape%' OR sku ILIKE '%tape%' OR description ILIKE '%tape%') AND (quantityOnHand > 0 AND quantityOnHand <= minimumStock) AND status IN ['ACTIVE', 'INACTIVE']`.

---

## 10. Invalid Input & Defensive Behavior

| Invalid Input Case                 | Defensive Handling            | Result                      |
| :--------------------------------- | :---------------------------- | :-------------------------- |
| `page = -5`                        | Normalized to `page = 1`      | Page 1 returned             |
| `limit = 500`                      | Clamped to `limit = 100`      | Max 100 items returned      |
| `limit = 0`                        | Normalized to `limit = 20`    | Default 20 items returned   |
| `search = "   "` (whitespace only) | Treated as empty search       | All matching items returned |
| `sortBy = "malicious_column"`      | Fallback to `sortBy = 'name'` | Default name sort applied   |
| `sortOrder = "invalid"`            | Normalized to `'asc'`         | Ascending order applied     |

---

## 11. Deterministic Test Matrix

| Test ID   | Filter Criteria                                      | Expected Outcome                                                              | Verification          |
| :-------- | :--------------------------------------------------- | :---------------------------------------------------------------------------- | :-------------------- |
| **TM-01** | `search: "TAPE"`                                     | Matches items with "tape" in name, sku, or description (case-insensitive)     | Search accuracy       |
| **TM-02** | `category: 'REHABILITATION'`                         | Returns only rehabilitation category products                                 | Category filtering    |
| **TM-03** | `category: ['CLINICAL_SUPPLIES', 'RETAIL_PRODUCTS']` | Returns products matching either category                                     | Multi-category filter |
| **TM-04** | `stockStatus: 'OUT_OF_STOCK'`                        | Returns only items where `quantityOnHand == 0.00`                             | Zero stock filter     |
| **TM-05** | `stockStatus: 'LOW_STOCK'`                           | Returns items where `quantityOnHand > 0.00 && quantityOnHand <= minimumStock` | Threshold filter      |
| **TM-06** | `stockStatus: 'IN_STOCK'`                            | Returns items where `quantityOnHand > minimumStock`                           | Healthy stock filter  |
| **TM-07** | `includeArchived: false` (default)                   | Excludes archived items even if matching search/category                      | Archive isolation     |
| **TM-08** | `status: 'ARCHIVED'`                                 | Returns only archived items                                                   | Archive audit         |
| **TM-09** | Combined: `search` + `category` + `stockStatus`      | Returns strict intersection (`AND`)                                           | Conjunction test      |
| **TM-10** | `page: 2`, `limit: 5`                                | Returns items 6 to 10 with accurate `total` and `totalPages`                  | Pagination slicing    |
| **TM-11** | `page: 999` (out of range)                           | Returns `items: []`, `hasNextPage: false`, `hasPreviousPage: true`            | Pagination boundary   |
| **TM-12** | `sortBy: 'sellingPrice'`, `sortOrder: 'desc'`        | Returns items ordered by highest selling price first, tied with `id ASC`      | Deterministic sort    |
| **TM-13** | Invalid `sortBy: 'drop_table'`                       | Graceful fallback to `name ASC`                                               | Whitelist protection  |
