# Consumable Inventory HTTP API Contracts & Controller Architecture

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management — Consumable Inventory Sub-Domain  
**Author**: Senior Backend API Engineer & Domain Boundary Reviewer  
**Governing Documents**:

- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**Resources Public HTTP API Surface**](./resource-api-surface.md)
- [**Backend API Architecture Baseline**](./backend-api-baseline.md)
- [**Inventory Application Layer Baseline**](./inventory-application-baseline.md)

---

## 1. Architectural Role & Boundary Principles

The Consumable Inventory HTTP Controller (`InventoryController`) acts strictly as a **thin HTTP transport adapter** in the hexagonal architecture topology.

### Strict Architectural Invariants:

1. **Thin Controller Law**:
   - The controller's sole responsibilities are:
     $$\text{HTTP Request} \rightarrow \text{DTO Validation} \rightarrow \text{Authentication/RBAC} \rightarrow \text{CQRS Command/Query Dispatch} \rightarrow \text{DTO Response Mapping}$$
   - No inventory invariant, stock arithmetic, or lifecycle state transition may depend exclusively on controller behavior.
2. **Explicit Mutation Sub-Resources ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md))**:
   - Generic `PATCH /inventory/:id` is strictly limited to non-state metadata (title, description, pricing, reorder thresholds). Stock quantity on hand cannot be mutated here.
   - All physical inventory mutations require dedicated action endpoints (`/receive`, `/sell`, `/consume`, `/scrap`, `/adjust`).
3. **Zero Trust for Resulting Stock Levels**:
   - Clients submit operation parameters (quantity delta, invoice cost, reason, reference ID). The application domain layer owns balance computation, OCC version verification, and movement ledger generation.

---

## 2. Complete Inventory Route Specification

Base URI Prefix: `/api/v1/resources/inventory`

### 2.1 Static Taxonomy & Categories

| Method | Route         | Permission       | Description                                                                                           |
| :----- | :------------ | :--------------- | :---------------------------------------------------------------------------------------------------- |
| `GET`  | `/categories` | `inventory.read` | Retrieves the static, code-defined taxonomy metadata for frontend dropdowns without database lookups. |

#### Response Schema (`CategoryMetadataDto[]`):

```json
[
  {
    "code": "HEALTHY_MEALS",
    "displayName": "Healthy Meals",
    "description": "Prepared nutritious meals and fresh food consumables."
  },
  {
    "code": "HEALTHY_DRINKS",
    "displayName": "Healthy Drinks",
    "description": "Fresh juices, smoothies, and functional beverages."
  },
  {
    "code": "CLEANING_SUPPLIES",
    "displayName": "Cleaning Supplies",
    "description": "Facility sanitization, towels, and hygiene supplies."
  },
  {
    "code": "OFFICE_SUPPLIES",
    "displayName": "Office Supplies",
    "description": "Stationery, paper, and administrative consumables."
  },
  {
    "code": "SUPPLEMENTS",
    "displayName": "Supplements & Nutrition",
    "description": "Nutritional powders, vitamins, and wellness supplements."
  },
  {
    "code": "CLINICAL_SUPPLIES",
    "displayName": "Clinical Supplies",
    "description": "Medical, kinesiology, and physical therapy consumables."
  },
  {
    "code": "THERAPY_CONSUMABLES",
    "displayName": "Therapy Consumables",
    "description": "Massage oils, kinesiology tape, and treatment supplies."
  },
  {
    "code": "RETAIL_PRODUCTS",
    "displayName": "Retail Products",
    "description": "Branded merchandise, apparel, and consumer goods."
  }
]
```

---

### 2.2 Catalog Product Management

#### 1. Create Product (`POST /api/v1/resources/inventory`)

- **Required Permission**: `inventory.write`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`
- **Status Code**: `201 Created`
- **Request Body (`CreateInventoryItemRequestDto`)**:
  ```json
  {
    "sku": "PROT-WHEY-VAN-1KG",
    "name": "Organic Grass-Fed Whey Isolate",
    "description": "100% natural vanilla protein powder",
    "category": "SUPPLEMENTS",
    "unitCost": 25.5,
    "sellingPrice": 45.0,
    "quantityOnHand": 20,
    "reorderThreshold": 5,
    "unitOfMeasure": "UNITS"
  }
  ```
- **Response**: `InventoryItemResponseDto` (`201 Created`)

#### 2. Get Product Details (`GET /api/v1/resources/inventory/:id`)

- **Required Permission**: `inventory.read`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER`
- **Status Code**: `200 OK`
- **Response**: `InventoryItemResponseDto`

#### 3. List Catalog Products (`GET /api/v1/resources/inventory`)

- **Required Permission**: `inventory.read`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER`
- **Query Parameters (`ListInventoryItemsQueryDto`)**:
  - `search`: Fuzzy search across SKU, name, description.
  - `category`: Filter by `InventoryCategory` enum.
  - `status`: Filter by `InventoryItemStatus` (`ACTIVE`, `INACTIVE`, `ARCHIVED`).
  - `stockStatus`: Filter by `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`.
  - `includeArchived`: Boolean flag (default `false`).
  - `page`: 1-indexed page integer (default `1`, minimum `1`).
  - `limit`: Page size limit (default `20`, maximum `100`).
  - `sortBy`: `name`, `sku`, `category`, `quantityOnHand`, `sellingPrice`, `createdAt`, `updatedAt` (default `name`).
  - `sortOrder`: `asc` or `desc` (default `asc`).
- **Response (`PaginatedInventoryResponseDto`)**:
  ```json
  {
    "items": [
      {
        "id": "c1f7b8a0-0000-4000-8000-000000000001",
        "sku": "PROT-WHEY-VAN-1KG",
        "name": "Organic Grass-Fed Whey Isolate",
        "description": "100% natural vanilla protein powder",
        "category": "SUPPLEMENTS",
        "status": "ACTIVE",
        "purchaseCostAmount": 25.5,
        "purchaseCostCurrency": "USD",
        "sellingPriceAmount": 45.0,
        "sellingPriceCurrency": "USD",
        "quantityOnHand": 20,
        "minimumStock": 5,
        "unit": "UNITS",
        "version": 1,
        "createdAt": "2026-08-31T10:00:00.000Z",
        "updatedAt": "2026-08-31T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
  ```

#### 4. Update Product Metadata (`PATCH /api/v1/resources/inventory/:id`)

- **Required Permission**: `inventory.write`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`
- **Request Body (`UpdateInventoryItemRequestDto`)**:
  ```json
  {
    "name": "Organic Grass-Fed Whey Isolate (Updated)",
    "description": "Enhanced formulation",
    "sellingPrice": 48.0,
    "reorderThreshold": 8
  }
  ```
- **Response**: `InventoryItemResponseDto` (`200 OK`)

#### 5. Product Lifecycle State Transitions

- **Archive Product**: `POST /api/v1/resources/inventory/:id/archive` (`inventory.write`)
- **Activate Product**: `POST /api/v1/resources/inventory/:id/activate` (`inventory.write`)
- **Deactivate Product**: `POST /api/v1/resources/inventory/:id/deactivate` (`inventory.write`)

---

### 2.3 Physical Stock Mutation Endpoints

| Method | Endpoint       | Permission        | Payload DTO              | Purpose                                          |
| :----- | :------------- | :---------------- | :----------------------- | :----------------------------------------------- |
| `POST` | `/:id/receive` | `inventory.write` | `ReceiveStockRequestDto` | Replenishment receipt from purchase invoice/PO.  |
| `POST` | `/:id/sell`    | `inventory.write` | `SellStockRequestDto`    | POS retail sale deduction with receipt ID.       |
| `POST` | `/:id/consume` | `inventory.write` | `ConsumeStockRequestDto` | Clinical treatment session internal consumption. |
| `POST` | `/:id/scrap`   | `inventory.write` | `ScrapStockRequestDto`   | Damaged / expired / contaminated disposal.       |
| `POST` | `/:id/adjust`  | `inventory.write` | `AdjustStockRequestDto`  | Physical count audit variance reconciliation.    |

---

### 2.4 Ledger Queries & Working Capital Valuation

#### 1. Stock Level Query (`GET /api/v1/resources/inventory/:id/stock-level`)

- **Permission**: `inventory.read`
- **Response (`StockLevelDTO`)**:
  ```json
  {
    "itemId": "c1f7b8a0-0000-4000-8000-000000000001",
    "sku": "PROT-WHEY-VAN-1KG",
    "name": "Organic Grass-Fed Whey Isolate",
    "quantityOnHand": 20,
    "minimumStock": 5,
    "unit": "UNITS",
    "status": "ACTIVE",
    "isLowStock": false,
    "isOutOfStock": false,
    "category": "SUPPLEMENTS",
    "version": 1,
    "updatedAt": "2026-08-31T10:00:00.000Z"
  }
  ```

#### 2. Stock Movements Ledger (`GET /api/v1/resources/inventory/:id/movements`)

- **Permission**: `inventory.read`
- **Query Params**: `page` (default 1), `limit` (default 20).
- **Response**: `PaginatedResultDTO<StockMovementDTO>`

#### 3. Low Stock Alerts (`GET /api/v1/resources/inventory/low-stock`)

- **Permission**: `inventory.read`
- **Response**: `PaginatedResultDTO<InventoryItemDTO>` with items satisfying $\text{quantityOnHand} \le \text{minimumStock}$.

#### 4. Inventory Working Capital Valuation (`GET /api/v1/resources/inventory/valuation`)

- **Permissions**: `inventory.read` **AND** `billing.read`
- **Response (`InventoryValuationResponseDto`)**:
  ```json
  {
    "totalDistinctItems": 42,
    "totalQuantityUnits": 1250,
    "totalValueAmount": 38450.0,
    "currency": "USD",
    "calculatedAt": "2026-08-31T15:00:00.000Z"
  }
  ```

---

## 3. Verification & Test Evidence

The Consumable Inventory HTTP contracts are covered by automated unit and contract test suites:

1. **Contract Suite**: `apps/api/src/resources/__tests__/inventory-api.contract.spec.ts` (18 passing tests)
2. **Authorization & RBAC Suite**: `apps/api/src/resources/__tests__/inventory.authorization.spec.ts` (22 passing tests)
3. **Security Invariants & Side-Effects Suite**: `apps/api/src/resources/__tests__/resources-security-negative-and-side-effects.spec.ts` (passing)
4. **Platform Full API Validation**: 75 test suites (478 passing tests) across `apps/api`.
