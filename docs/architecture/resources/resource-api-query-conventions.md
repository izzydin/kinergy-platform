# Resources API Query, Pagination, Filtering, Sorting & Error Conventions

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management (Consumable Inventory & Fixed Assets)  
**Author**: Principal API Consistency Engineer & Backend Architecture Reviewer  
**Governing Documents**:

- [**Frontend DataTable Architecture Contract (`apps/web/src/shared/table/`)**](../../frontend/dashboard_auth_integration_contract.md)
- [**Resources API Contracts & Validation**](./resource-api-contracts.md)
- [**Resources HTTP Controller Architecture**](./resource-controller-architecture.md)
- [**Backend API Architecture Baseline**](./backend-api-baseline.md)

---

## 1. Architectural Objective

Ensure that all Phase 6 Resources endpoints (Consumable Inventory, Fixed Assets, Movements, and Maintenance History) behave with 100% consistency against the platform standards.

A client using the existing Kinergy DataTable infrastructure (`useTableUrlState`, `DataTablePagination`, `DataTableSearch`, `DataTableFacetedFilter`, `DataTableColumnHeader`) connects seamlessly to Resources list endpoints without requiring custom adapters or ad-hoc query parameter translators.

---

## 2. Standardized Pagination Behavior

All collection queries implement 1-based index pagination:

### 2.1 Query Parameters

| Parameter | Type     | Validation Decorator                                | Default | Maximum | Description                                                                        |
| :-------- | :------- | :-------------------------------------------------- | :------ | :------ | :--------------------------------------------------------------------------------- |
| `page`    | `number` | `@IsOptional()`, `@IsInt()`, `@Min(1)`              | `1`     | N/A     | 1-based page number. Values `< 1` rejected with `400 Bad Request`.                 |
| `limit`   | `number` | `@IsOptional()`, `@IsInt()`, `@Min(1)`, `@Max(100)` | `20`    | `100`   | Number of items per page. Values `< 1` or `> 100` rejected with `400 Bad Request`. |

### 2.2 Standardized Response Envelope

```json
{
  "items": [/* Strongly-typed DTOs */],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

### 2.3 Empty Collection Invariant

When a query produces 0 matching records:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0,
  "hasNextPage": false,
  "hasPreviousPage": false
}
```

---

## 3. Standardized Search Behavior

All list endpoints support free-text keyword search:

| Aspect             | Platform Standard                                        | Resources Implementation                                           |
| :----------------- | :------------------------------------------------------- | :----------------------------------------------------------------- |
| **Parameter Name** | `search` (aliased to `q` in frontend `useTableUrlState`) | Decorated with `@IsOptional()`, `@IsString()` in Query DTOs.       |
| **Case Behavior**  | Case-insensitive (`ILIKE` / `mode: 'insensitive'`)       | Matches regardless of casing.                                      |
| **Matching Mode**  | Substring / Partial wildcard                             | Matches `name`, `sku`, `assetTag`, and `description`.              |
| **Empty Search**   | Omitted / Empty string                                   | Ignored; returns unconstrained collection.                         |
| **Sanitization**   | Platform `InputSanitizer`                                | Automatically trims whitespace and neutralizes control characters. |

---

## 4. Standardized Filtering Behavior

Filters operate as conjunctive (`AND`) facets across multi-dimensional criteria:

### 4.1 Consumable Inventory Filters (`GET /api/v1/resources/inventory`)

- `search` (`string`): Partial match on SKU, name, or description.
- `category` (`InventoryCategory`): `SUPPLEMENTS`, `CLINICAL_SUPPLIES`, `REHAB_AIDS`, `TAPING_STRAPPING`, `BEVERAGES_NUTRITION`, `MERCHANDISE_APPAREL`, `OTHER`.
- `stockStatus` (`string`): `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`.
- `status` (`InventoryItemStatus`): `ACTIVE`, `INACTIVE`, `ARCHIVED`.

### 4.2 Fixed Asset Filters (`GET /api/v1/resources/assets`)

- `search` (`string`): Partial match on asset tag, name, or description.
- `category` (`AssetCategory`): `THERAPY_EQUIPMENT`, `GYM_EQUIPMENT`, `DIAGNOSTIC_TOOLS`, `FURNITURE_FIXTURES`, `ELECTRONICS_IT`, `FACILITY_INFRASTRUCTURE`, `OTHER`.
- `status` (`AssetStatus`): `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`.
- `condition` (`AssetCondition`): `NEW`, `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`, `UNUSABLE`.
- `facilityId` (`string`): Physical location facility partition ID.
- `roomId` (`string`): Specific room identifier within facility.

---

## 5. Standardized Sorting Behavior

Sorting prevents SQL injection and arbitrary column leakage by strictly validating against approved whitelist fields:

| Parameter   | Type     | Validation Decorator                      | Default                            | Description                   |
| :---------- | :------- | :---------------------------------------- | :--------------------------------- | :---------------------------- |
| `sortBy`    | `string` | `@IsOptional()`, `@IsString()`            | Contextual (`name` or `createdAt`) | Bounded whitelist field name. |
| `sortOrder` | `string` | `@IsOptional()`, `@IsIn(['asc', 'desc'])` | `'asc'`                            | Sort direction.               |

### 5.1 Allowed Sort Fields by Endpoint

| Endpoint                                        | Allowed `sortBy` Values                                                                                                      | Default Sorting    |
| :---------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :----------------- |
| `GET /api/v1/resources/inventory`               | `name`, `sku`, `category`, `sellingPrice`, `quantityOnHand`, `createdAt`                                                     | `name asc`         |
| `GET /api/v1/resources/assets`                  | `name`, `assetTag`, `category`, `status`, `condition`, `purchaseDate`, `purchaseValue`, `currentEstimatedValue`, `createdAt` | `createdAt desc`   |
| `GET /api/v1/resources/inventory/:id/movements` | `timestamp`, `quantityDelta`                                                                                                 | `timestamp desc`   |
| `GET /api/v1/resources/assets/:id/history`      | `timestamp`                                                                                                                  | `timestamp desc`   |
| `GET /api/v1/resources/assets/:id/maintenance`  | `serviceDate`, `createdAt`                                                                                                   | `serviceDate desc` |

---

## 6. Error Response Envelope & Mapping Consistency

All Phase 6 endpoints format errors via the unified `GlobalExceptionFilter`:

### 6.1 Standard Error Envelope

```json
{
  "statusCode": 400,
  "timestamp": "2026-08-31T20:25:00.000Z",
  "path": "/api/v1/resources/inventory",
  "error": {
    "statusCode": 400,
    "message": "quantity must be a positive number",
    "error": "Bad Request"
  }
}
```

### 6.2 Failure Mapping Matrix

| Domain / Application Failure     | HTTP Status        | Exception Class         | Reason / Example                                                                          |
| :------------------------------- | :----------------- | :---------------------- | :---------------------------------------------------------------------------------------- |
| **Missing Resource**             | `404 Not Found`    | `NotFoundException`     | Inventory item or Fixed asset ID does not exist in tenant partition.                      |
| **Domain Invariant Breach**      | `400 Bad Request`  | `BadRequestException`   | Stock cannot become negative (`[INV-INV-2]`); Cannot transfer sold asset (`[AST-INV-2]`). |
| **Invalid State Transition**     | `400 Bad Request`  | `BadRequestException`   | Terminal state machine transition attempted on `SOLD` or `RETIRED` asset.                 |
| **Duplicate Collision**          | `409 Conflict`     | `ConflictException`     | SKU collision (`[INV-INV-1]`) or duplicate asset tag.                                     |
| **Validation / Malformed Input** | `400 Bad Request`  | `BadRequestException`   | Extra non-whitelisted property injected, invalid enum, negative price.                    |
| **Unauthenticated Request**      | `401 Unauthorized` | `UnauthorizedException` | Missing, expired, or invalid JWT bearer token.                                            |
| **Insufficient Permissions**     | `403 Forbidden`    | `ForbiddenException`    | User lacking required permission (e.g. `inventory.write`, `assets.write`).                |

---

## 7. Explicitly Rejected Inconsistencies

During the Phase 6.9 Backend API consistency review, the following potential architectural anti-patterns were identified and strictly rejected:

1. **REJECTED: Ad-Hoc Pagination Field Names**:
   - Rejecting `offset`/`skip` or `size` in place of `page` and `limit`.
2. **REJECTED: Custom Array Response Bodies**:
   - List endpoints MUST return the envelope `{ items: [...], total, page, limit, totalPages, hasNextPage, hasPreviousPage }` rather than a bare JSON array `[...]`.
3. **REJECTED: Custom Search Parameter Keys**:
   - Rejecting `keyword`, `query`, or `filterText` in favor of standard `search`.
4. **REJECTED: Unvalidated Column Sorting**:
   - Raw database table column sorting is prohibited; all sortable fields must be explicitly validated.
5. **REJECTED: Domain Object Serialization Leakage**:
   - Internal `Prisma` models and raw `Decimal` objects are barred from HTTP response payloads.
