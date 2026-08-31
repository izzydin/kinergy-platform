# Resources Management OpenAPI Specification & API Documentation

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management (Consumable Inventory, Fixed Assets, Valuation)  
**Author**: Principal API Documentation Engineer & OpenAPI Reviewer  
**Governing Documents**:

- [**Resources Public HTTP API Surface**](./resource-api-surface.md)
- [**Resources API Contracts & Validation**](./resource-api-contracts.md)
- [**Resources HTTP Controller Architecture**](./resource-controller-architecture.md)
- [**Resources API Query Conventions**](./resource-api-query-conventions.md)
- [**Backend API Architecture Baseline**](./backend-api-baseline.md)

---

## 1. API Overview

The Resources Management API exposes enterprise-grade HTTP contracts for managing consumable inventory products, tracking fixed capital assets across their complete lifecycle, recording clinical supply consumption and maintenance events, and computing real-time resource balance sheet valuations.

All endpoints adhere to RESTful principles, enforce JSON payload boundaries via `GlobalSanitizationValidationPipe`, utilize CQRS query/command handlers, and produce standardized OpenAPI 3.0 documentation.

---

## 2. Endpoint Groups & URI Namespace

All resources routes are mounted under the base URI `/api/v1/resources`:

| Tag Group                              | Base Path                     | Primary Capabilities                                                                                                                                                                                                      |
| :------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Resources - Consumable Inventory`** | `/api/v1/resources/inventory` | Product catalog, static categories, stock movements ledger, POS sales, PO receipts, clinical session consumption, count adjustments, scrap, low-stock alerts, and working capital valuation.                              |
| **`Resources - Fixed Assets`**         | `/api/v1/resources/assets`    | Asset registry, hardware barcode/RFID scanner lookup, static categories, location transfers, lifecycle state machine mutations, condition scoring, servicing maintenance, audit event ledger, and carrying value summary. |
| **`Resources - Valuation`**            | `/api/v1/resources/valuation` | Cross-domain enterprise balance sheet valuation combining inventory working capital and fixed asset carrying value (ADR-0098).                                                                                            |

---

## 3. Authentication & Security Model

All Resources API routes are protected enterprise endpoints:

1. **Bearer Authentication**: Requires an `Authorization: Bearer <JWT>` header containing an active user token issued by the Kinergy Identity subsystem.
2. **Multi-Tenant Isolation**: The authenticated user's `tenantId` is automatically extracted and injected into CQRS commands and queries, guaranteeing strict tenant boundary isolation.
3. **Cross-Site Scripting (XSS) & Input Scrubbing**: All inbound payloads are pre-processed by `InputSanitizer` before schema validation to strip null bytes (`\u0000`) and neutralize embedded `<script>` tags.

---

## 4. Declarative RBAC Authorization Overview

Every route enforces role-based and permission-based authorization via `@UseGuards(AuthenticationGuard, AuthorizationGuard)`:

| Endpoint Pattern                                 | Required Permissions                            | Allowed Roles                                                    |
| :----------------------------------------------- | :---------------------------------------------- | :--------------------------------------------------------------- |
| `GET /api/v1/resources/inventory/categories`     | `inventory.read`                                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST` |
| `GET /api/v1/resources/inventory/**`             | `inventory.read`                                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST` |
| `POST /api/v1/resources/inventory`               | `inventory.write`                               | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `PATCH /api/v1/resources/inventory/:id`          | `inventory.write`                               | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `POST /api/v1/resources/inventory/:id/*`         | `inventory.write`                               | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `GET /api/v1/resources/inventory/valuation`      | `inventory.read`, `billing.read`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                  |
| `GET /api/v1/resources/assets/categories`        | `assets.read`                                   | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST` |
| `GET /api/v1/resources/assets/tag/:tag`          | `assets.read`                                   | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST` |
| `GET /api/v1/resources/assets/**`                | `assets.read`                                   | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`, `TRAINER`, `THERAPIST` |
| `POST /api/v1/resources/assets`                  | `assets.write`                                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `PATCH /api/v1/resources/assets/:id`             | `assets.write`                                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `POST /api/v1/resources/assets/:id/*`            | `assets.write`                                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `STAFF`                         |
| `GET /api/v1/resources/assets/valuation/summary` | `assets.read`, `billing.read`                   | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                  |
| `GET /api/v1/resources/valuation/summary`        | `inventory.read`, `assets.read`, `billing.read` | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                  |

---

## 5. Standardized Query, Pagination, Filtering & Sorting

### 5.1 Pagination

- **Parameters**: `page` (`default: 1`, `min: 1`), `limit` (`default: 20`, `max: 100`, `min: 1`).
- **Response Shape**:
  ```json
  {
    "items": [],
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
  ```

### 5.2 Multi-Dimensional Filtering & Search

- **Search Parameter**: `search` (case-insensitive substring match across SKU, asset tag, product name, and description).
- **Conjunctive Filtering (`AND`)**:
  - Inventory: `category`, `stockStatus` (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`), `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`).
  - Fixed Assets: `category`, `status`, `condition`, `facilityId`, `roomId`.

### 5.3 Bounded Sorting

- **Parameters**: `sortBy` (whitelisted fields), `sortOrder` (`'asc'` | `'desc'`).
- Inventory defaults to `name asc`; Assets default to `createdAt desc`; Movements and History default to `timestamp desc`.

---

## 6. Standardized Error Response Envelope

All API errors produce the unified platform error envelope formatted by `GlobalExceptionFilter`:

```json
{
  "statusCode": 400,
  "timestamp": "2026-08-31T20:55:00.000Z",
  "path": "/api/v1/resources/inventory/inv_123/sell",
  "error": {
    "statusCode": 400,
    "message": "Insufficient stock: cannot deduct 5 units from available 2 [INV-INV-2]",
    "error": "Bad Request"
  }
}
```

| HTTP Status            | Trigger Condition                                                                                                                     |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **`400 Bad Request`**  | DTO validation failure, negative quantity, domain invariant breach (`[INV-INV-2]`), illegal state machine transition (`[AST-INV-2]`). |
| **`401 Unauthorized`** | Missing, expired, or invalid JWT bearer token.                                                                                        |
| **`403 Forbidden`**    | Insufficient user role or permissions.                                                                                                |
| **`404 Not Found`**    | Requested item or asset ID does not exist within the tenant partition.                                                                |
| **`409 Conflict`**     | SKU duplicate collision (`[INV-INV-1]`) or duplicate asset tag.                                                                       |

---

## 7. Complete Operations Inventory

### 7.1 Consumable Inventory Endpoints

1. `GET /api/v1/resources/inventory/categories`: Static code-defined category taxonomy metadata.
2. `GET /api/v1/resources/inventory`: Paginated product search and filter collection.
3. `POST /api/v1/resources/inventory`: Create a new consumable inventory item.
4. `GET /api/v1/resources/inventory/low-stock`: Filter items where `quantityOnHand <= reorderThreshold`.
5. `GET /api/v1/resources/inventory/valuation`: Working capital valuation summary (`totalValueAmount`, `totalUnits`).
6. `GET /api/v1/resources/inventory/:id`: Retrieve single inventory item by ID.
7. `PATCH /api/v1/resources/inventory/:id`: Partial metadata update (`name`, `description`, `sellingPrice`, `reorderThreshold`).
8. `GET /api/v1/resources/inventory/:id/stock-level`: Real-time stock on hand and low-stock indicators.
9. `GET /api/v1/resources/inventory/:id/movements`: Paginated stock movement audit ledger.
10. `POST /api/v1/resources/inventory/:id/receive`: Stock replenishment receipt (`RECEIPT`).
11. `POST /api/v1/resources/inventory/:id/sell`: POS retail sale stock deduction (`SALE`).
12. `POST /api/v1/resources/inventory/:id/consume`: Clinical treatment session consumption (`CONSUMPTION`).
13. `POST /api/v1/resources/inventory/:id/scrap`: Damaged / expired product disposal (`SCRAP`).
14. `POST /api/v1/resources/inventory/:id/adjust`: Count discrepancy reconciliation (`ADJUSTMENT`).
15. `POST /api/v1/resources/inventory/:id/archive`: Archive product catalog item.
16. `POST /api/v1/resources/inventory/:id/activate`: Transition product to `ACTIVE` status.
17. `POST /api/v1/resources/inventory/:id/deactivate`: Transition product to `INACTIVE` status.

### 7.2 Fixed Assets Endpoints

1. `GET /api/v1/resources/assets/categories`: Static code-defined asset category taxonomy metadata.
2. `GET /api/v1/resources/assets/tag/:tag`: Hardware barcode / RFID scanner asset lookup.
3. `GET /api/v1/resources/assets`: Paginated fixed asset search and multi-criteria filter collection.
4. `POST /api/v1/resources/assets`: Commission and register a new fixed asset.
5. `GET /api/v1/resources/assets/valuation/summary`: Fixed asset carrying value portfolio summary.
6. `GET /api/v1/resources/assets/:id`: Retrieve single fixed asset details by ID.
7. `PATCH /api/v1/resources/assets/:id`: Partial descriptive metadata update (`name`, `description`, `notes`, `reason`).
8. `POST /api/v1/resources/assets/:id/transfer`: Transfer asset to a new physical facility / room / zone.
9. `POST /api/v1/resources/assets/:id/status`: Transition lifecycle state machine status (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
10. `POST /api/v1/resources/assets/:id/condition`: Update physical condition rating (`NEW`, `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`, `UNUSABLE`).
11. `POST /api/v1/resources/assets/:id/maintenance`: Record servicing / repair event with cost and technician notes.
12. `GET /api/v1/resources/assets/:id/maintenance`: Paginated servicing maintenance history records.
13. `POST /api/v1/resources/assets/:id/valuation`: Record updated estimated appraisal / carrying value.
14. `GET /api/v1/resources/assets/:id/valuation`: Retrieve current carrying value and currency.
15. `GET /api/v1/resources/assets/:id/history`: Retrieve immutable lifecycle audit event history.

### 7.3 Cross-Domain Valuation Endpoint

1. `GET /api/v1/resources/valuation/summary`: Composed balance sheet valuation summary combining consumable inventory working capital and fixed asset carrying value ([ADR-0098](./adr/0098-cross-domain-valuation-query-handler-composition.md)).

---

## 8. Category Taxonomy Strategy

In accordance with Phase 6 architectural standards, category taxonomies are code-defined enums backed by static metadata endpoints:

- `GET /api/v1/resources/inventory/categories`
- `GET /api/v1/resources/assets/categories`

These endpoints return localized human-readable labels, descriptions, and icon identifiers without requiring database table queries or schema migrations.

---

## 9. OpenAPI / Swagger Verification Status

The OpenAPI contract is verified by automated test suite [`apps/api/src/resources/__tests__/resources-openapi.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/resources-openapi.spec.ts):

- **31/31 tests passing** validating:
  - 100% path coverage for all 27 inventory, asset, and valuation endpoints.
  - Complete schema registration in OpenAPI components (`CreateInventoryItemRequestDto`, `InventoryItemResponseDto`, `PaginatedInventoryResponseDto`, `CreateFixedAssetRequestDto`, `FixedAssetResponseDto`, `PaginatedFixedAssetResponseDto`, `ResourceValuationSummaryResponseDto`).
  - BearerAuth security scheme binding.
  - Tag group consistency (`Resources - Consumable Inventory`, `Resources - Fixed Assets`, `Resources - Valuation`).
