# Fixed Assets Query & Filtering Architectural Contract

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets (Capital Equipment)`  
**Milestone**: Phase 6.6 — Fixed Asset Application Layer  
**Document**: Authoritative Fixed Asset Query, Filter, Sorting & Pagination Specification  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 29, 2026

---

## 1. Request & Filter Contract Definition

The `ListFixedAssetsQuery` provides deterministic, multi-criteria filtering, full-text search, whitelist sorting, and bounded pagination over physical capital equipment.

```typescript
export interface ListFixedAssetsFilter {
  /** Optional case-insensitive substring search across name, assetTag, and description */
  search?: string;

  /** Single category or array of categories to filter by */
  category?: AssetCategory | AssetCategory[];

  /** Operational lifecycle status filter (single or multiple) */
  status?: AssetStatus | AssetStatus[];

  /** Physical condition rating filter (single or multiple) */
  condition?: AssetCondition | AssetCondition[];

  /** Physical location facility identifier filter */
  facilityId?: string;

  /** Physical location specific room identifier filter */
  roomId?: string;

  /** Whether to include decommissioned/liquidated assets (RETIRED, SOLD) (default: false) */
  includeDecommissioned?: boolean;

  /** Pagination: 1-indexed page number (default: 1) */
  page?: number;

  /** Pagination: page size limit (default: 20, minimum: 1, maximum: 100) */
  pageSize?: number;

  /** Sort field from strict whitelist (default: 'name') */
  sortBy?:
    | 'name'
    | 'assetTag'
    | 'category'
    | 'status'
    | 'condition'
    | 'purchaseDate'
    | 'purchaseValueAmount'
    | 'currentEstimatedValueAmount'
    | 'createdAt'
    | 'updatedAt';

  /** Sort direction (default: 'asc') */
  sortOrder?: 'asc' | 'desc';
}

export interface ListFixedAssetsQuery {
  tenantId: string;
  filter?: ListFixedAssetsFilter;
}
```

---

## 2. Search Semantics

1. **Searchable Fields**:
   - `name`: Case-insensitive substring match (`contains`, `mode: 'insensitive'`).
   - `assetTag`: Exact, prefix, or substring match (`AST-GYM-001`, `001`).
   - `description`: Case-insensitive substring match.
2. **Case Sensitivity**: Strictly **case-insensitive**.
3. **Whitespace Normalization**:
   - Leading and trailing whitespace is stripped via `.trim()`.
   - Multiple consecutive whitespace characters are collapsed to a single space.
4. **Empty Search Handling**:
   - If `search` is `undefined`, `null`, or an empty string `""` after trimming, the search clause is omitted (matches all records).
5. **Length Constraints**:
   - Search strings are capped at **100 characters** to prevent SQL parser exhaustion. Queries exceeding 100 characters are trimmed to the first 100 characters.

---

## 3. Category Filter Semantics

1. **Approved Taxonomy**:
   - `GYM_MACHINERY`: Strength machines, cardio equipment, treadmills, cables.
   - `CLINICAL_EQUIPMENT`: Ultrasound, laser therapy, EMG, diagnostic devices.
   - `REHAB_DEVICE`: Traction tables, balance platforms, dynamometers.
   - `FACILITY_FIXTURE`: Treatment plinths, lockers, refrigeration units.
   - `IT_HARDWARE`: Check-in kiosks, biometric scanners, reception terminals.
2. **Matching Rule**: Set membership (`category IN (...)`).
3. **Multi-Category Support**: Accepts a single `AssetCategory` or an array of categories (`[AssetCategory.GYM_MACHINERY, AssetCategory.REHAB_DEVICE]`).
4. **Validation**: Non-enum values trigger an explicit `400 Bad Request` or are sanitized.

---

## 4. Status Filter Semantics (Operational Lifecycle)

1. **Approved Status Values**:
   - `ACTIVE`: Available for member bookings, treatments, or operational use.
   - `UNDER_MAINTENANCE`: Offline for scheduled inspection, servicing, or calibration.
   - `DAMAGED`: Offline due to breakdown, defect, or structural failure.
   - `RETIRED`: Decommissioned from service; permanently halted from operational use.
   - `SOLD`: Permanently liquidated and transferred outside the company boundary ([AST-INV-1]).
2. **Default Lifecycle Visibility**:
   - If `status` is **not specified** and `includeDecommissioned` is `false` (default):
     - Returns only operational assets: `status IN ['ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED']`.
   - Decommissioned assets (`RETIRED`, `SOLD`) are excluded by default to avoid cluttering daily facility operations.
3. **Explicit Decommissioned Inclusion**:
   - `includeDecommissioned: true` $\rightarrow$ returns all statuses (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
   - `status: 'RETIRED'` or `status: ['RETIRED', 'SOLD']` $\rightarrow$ returns specifically requested lifecycle statuses.

---

## 5. Condition Filter Semantics (Physical Integrity)

Status and Condition are **independent business dimensions**:

- `status` represents **operational workflow state** (where the asset is in its lifecycle).
- `condition` represents **physical equipment grading** (how well the asset performs).

| Condition Rating | Engineering Description                                    |
| ---------------- | ---------------------------------------------------------- |
| `EXCELLENT`      | Like-new condition, fully calibrated, zero wear.           |
| `GOOD`           | Normal operational condition, minor cosmetic wear.         |
| `FAIR`           | Operational with moderate wear; inspection recommended.    |
| `POOR`           | Heavy wear, reduced performance; nearing end-of-life.      |
| `NEEDS_REPAIR`   | Faulty component; servicing required before intensive use. |
| `OUT_OF_SERVICE` | Severe damage or hazard; prohibited from `ACTIVE` status.  |

1. **Matching Rule**: Set membership (`condition IN (...)`).
2. **Multi-Condition Filtering**: Supports array filtering (e.g. `condition: ['NEEDS_REPAIR', 'OUT_OF_SERVICE']` for maintenance triage).

---

## 6. Location Filter Semantics

Physical placement is modeled as a structured JSON value object (`AssetLocation`):

```json
{
  "facilityId": "fac_downtown_01",
  "roomId": "room_physio_204",
  "building": "West Wing",
  "floor": "2",
  "zone": "Treatment Area B"
}
```

1. **`facilityId` Filter**: Exact string match (`location->>'facilityId' = :facilityId`).
2. **`roomId` Filter**: Exact string match (`location->>'roomId' = :roomId`).
3. **No Fuzzy Guessing**: Identifier matching is exact to ensure multi-facility security and room isolation.

---

## 7. Pagination Contract

Follows the global Kinergy pagination contract:

```typescript
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

1. **1-Indexed Pagination**: `page = 1` is the first page. `page < 1` automatically normalizes to `1`.
2. **Page Size Bounds**:
   - Default: `pageSize = 20`.
   - Minimum: `pageSize = 1`.
   - Maximum: `pageSize = 100` (requests for $>100$ are clamped to `100`).
3. **Calculation Rules**:
   - `offset = (page - 1) * pageSize`.
   - `totalPages = Math.ceil(total / pageSize) || 1`.
4. **Out-of-Bounds Pages**: If `page > totalPages`, returns `items: []`, with accurate `total` and `totalPages`.

---

## 8. Sorting Whitelist & Determinism

### 8.1 Whitelisted Columns

Only database-indexed and business-meaningful fields may be sorted:

| `sortBy` Key                  | Target Database Field                         | Default Direction                     |
| ----------------------------- | --------------------------------------------- | ------------------------------------- |
| `name` (Default)              | `fixed_assets.name`                           | `asc` (A $\rightarrow$ Z)             |
| `assetTag`                    | `fixed_assets.asset_tag`                      | `asc` (AST-001 $\rightarrow$ AST-999) |
| `category`                    | `fixed_assets.category`                       | `asc`                                 |
| `status`                      | `fixed_assets.status`                         | `asc`                                 |
| `condition`                   | `fixed_assets.condition`                      | `asc`                                 |
| `purchaseDate`                | `fixed_assets.purchase_date`                  | `desc` (Newest first)                 |
| `purchaseValueAmount`         | `fixed_assets.purchase_value_amount`          | `desc` (Highest first)                |
| `currentEstimatedValueAmount` | `fixed_assets.current_estimated_value_amount` | `desc` (Highest first)                |
| `createdAt`                   | `fixed_assets.created_at`                     | `desc`                                |
| `updatedAt`                   | `fixed_assets.updated_at`                     | `desc`                                |

### 8.2 Tie-Breaking & Deterministic Pagination

To prevent row skipping or duplicate entries across page boundaries when identical values exist:

- **Secondary Sort Key**: Every query appends `id: 'asc'` as the tie-breaker.
- **Example**: `ORDER BY name ASC, id ASC`.

---

## 9. Filter Combination Semantics (Conjunction)

All filter criteria combine via **strict boolean intersection (`AND`)**:

$$\text{Match} = \text{Tenant} \land \text{Category} \land \text{Status} \land \text{Condition} \land \text{Facility} \land \text{Room} \land \text{Search}$$

```sql
WHERE tenant_id = :tenantId
  AND category IN (:categories)
  AND status IN (:statuses)
  AND condition IN (:conditions)
  AND location->>'facilityId' = :facilityId
  AND location->>'roomId' = :roomId
  AND (name ILIKE :search OR asset_tag ILIKE :search OR description ILIKE :search)
```

---

## 10. Query Examples

### Example A: Maintenance Triage in Downtown Facility

**Intent**: Find all damaged equipment or assets needing repair in Facility `fac_downtown_01`.

```json
{
  "tenantId": "tenant_kinergy_production",
  "filter": {
    "facilityId": "fac_downtown_01",
    "status": ["UNDER_MAINTENANCE", "DAMAGED"],
    "condition": ["NEEDS_REPAIR", "OUT_OF_SERVICE"],
    "sortBy": "updatedAt",
    "sortOrder": "desc",
    "page": 1,
    "pageSize": 25
  }
}
```

### Example B: Search for Clinical Ultrasound Devices

**Intent**: Search for specific ultrasound equipment across all operational rooms.

```json
{
  "tenantId": "tenant_kinergy_production",
  "filter": {
    "category": "CLINICAL_EQUIPMENT",
    "search": "Ultrasound",
    "sortBy": "name",
    "sortOrder": "asc"
  }
}
```

---

## 11. Invalid Input Handling

| Scenario                                                | Behavior                                                | HTTP Status       |
| ------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| Unrecognized `sortBy` value (e.g. `sortBy: 'password'`) | Rejected with whitelist error or falls back to `'name'` | `400 Bad Request` |
| Invalid `sortOrder` (e.g. `sortOrder: 'random'`)        | Falls back to `'asc'`                                   | `200 OK`          |
| Non-numeric `page` or `page <= 0`                       | Clamped to `page = 1`                                   | `200 OK`          |
| `pageSize > 100`                                        | Clamped to `pageSize = 100`                             | `200 OK`          |
| Unrecognized `category` string                          | Validation exception with list of valid categories      | `400 Bad Request` |
| Unrecognized `status` string                            | Validation exception with valid statuses                | `400 Bad Request` |

---

## 12. QA Verification Matrix for ListFixedAssets

- [ ] **Search**: Partial match on `name`, exact match on `assetTag`, partial match on `description`. Case-insensitivity verified.
- [ ] **Category Filter**: Single category and multi-category array matching.
- [ ] **Status Filter**: Default exclusion of `RETIRED`/`SOLD`; inclusion when `includeDecommissioned: true`.
- [ ] **Condition Filter**: Filter by single/multiple condition ratings independent of status.
- [ ] **Location Filter**: Exact match on `facilityId` and `roomId`.
- [ ] **Combined Filters**: Intersection of category, status, condition, facility, and search term.
- [ ] **Pagination**: First page, middle page, out-of-bounds page, empty dataset.
- [ ] **Sorting Whitelist**: Verification of all 10 sort keys in `asc` and `desc` directions.
- [ ] **Tie-Breaking Stability**: Verification of stable ordering across identical names.
