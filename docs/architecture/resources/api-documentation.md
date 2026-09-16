# Resources Management — Authoritative API Reference & Integration Contract

- **Status**: Authoritative Behavioral & HTTP Interface Contract Baseline (APPROVED & ACTIVE)
- **Bounded Context**: Resources Management (`packages/core/src/resources/`, `apps/api/src/resources/`)
- **Sub-Domains**: Consumable Inventory, Fixed Assets, Resource Overview & Cross-Domain Valuation
- **Author**: Principal API Architect & Systems Engineer
- **Base URI Namespace**: `/api/v1/resources`
- **Governing ADRs**:
  - [ADR-0081: Resources Bounded Context Topology & Domain Segregation](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md)
  - [ADR-0094: Resources Authorization & Permission Taxonomy Model](./adr/0094-resources-authorization-and-permission-taxonomy-model.md)
  - [ADR-0095: Resource Sensitive Valuation Data Access & Response-Shaping Policy](./adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)
  - [ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
  - [ADR-0102: Resource Overview Synthesized Read-Query Architecture & Executive Cockpit](./adr/0102-resource-overview-synthesized-read-query-architecture.md)

---

## 1. Global Architectural & Security Conventions

### 1.1 Authentication & Security

- **Bearer Authentication**: Every endpoint requires an `Authorization: Bearer <JWT>` header containing an active token issued by the Kinergy IAM subsystem.
- **Tenant Boundary Isolation**: The authenticated user's `tenantId` is automatically resolved from `AuthenticatedUserContext` and injected into the underlying CQRS command/query. Access to resources belonging to other tenants is rejected with `404 Not Found`.
- **RBAC / ABAC Permissions**: Evaluated using `@UseGuards(AuthenticationGuard, AuthorizationGuard)`. Endpoints enforce `@Permissions()` and `@Roles()`. Sensitive financial endpoints require multi-permission composition (`billing.read` combined with domain permissions).

### 1.2 Standardized Error Envelope

When any endpoint encounters a failure, the platform's `GlobalExceptionFilter` serializes the error into this uniform structure:

```json
{
  "statusCode": 400,
  "timestamp": "2026-09-16T10:00:00.000Z",
  "path": "/api/v1/resources/inventory/inv_123/sell",
  "error": {
    "statusCode": 400,
    "message": "Insufficient stock: cannot deduct 5 units from available 2 [INV-INV-2]",
    "error": "Bad Request"
  }
}
```

Common status codes across all endpoints:

- `400 Bad Request`: Validation failure, negative delta, or domain invariant violation.
- `401 Unauthorized`: Missing, expired, or malformed JWT bearer token.
- `403 Forbidden`: Authenticated user lacks the required permission or role.
- `404 Not Found`: Target entity ID or SKU does not exist within the tenant partition.
- `409 Conflict`: Optimistic Concurrency Control collision (`OptimisticLockException`) or SKU/tag uniqueness conflict.

---

## 2. Consumable Inventory API Specification

Base Path: `/api/v1/resources/inventory`

---

### 2.1 List Inventory Products

- **Method**: `GET`
- **Path**: `/api/v1/resources/inventory`
- **Purpose**: Paginated catalog browsing with multi-criteria filtering, search, and sorting.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER`.
- **Request Parameters (Query)**:
  - `search` (string, optional): Substring match across SKU, product name, and description.
  - `category` (`InventoryCategory`, optional): Filter by category enum.
  - `status` (`InventoryItemStatus`, optional): Filter by `ACTIVE`, `INACTIVE`, or `ARCHIVED`.
  - `stockStatus` (string, optional): `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`.
  - `includeArchived` (boolean, optional, default: `false`): Include archived tombstone items.
  - `page` (integer, optional, default: `1`, min: `1`): 1-indexed page number.
  - `limit` (integer, optional, default: `20`, min: `1`, max: `100`): Page size.
  - `sortBy` (string, optional, default: `'name'`): `'name'`, `'sku'`, `'quantityOnHand'`, `'createdAt'`.
  - `sortOrder` (string, optional, default: `'asc'`): `'asc'` | `'desc'`.
- **Validation**: Query DTO validated via `ListInventoryItemsQueryDto` (`@IsOptional`, `@IsEnum`, `@IsInt`, `@Min(1)`).
- **Response**: `200 OK` (`PaginatedInventoryResponseDto`)
  ```json
  {
    "items": [
      {
        "id": "c1f7a01a-86c4-4d8e-9d21-4f114631aa01",
        "sku": "SUP-TAPE-001",
        "name": "Kinesiology Therapeutic Tape (5cm x 5m)",
        "description": "Waterproof elastic cotton tape for muscle support",
        "category": "THERAPY_CONSUMABLES",
        "status": "ACTIVE",
        "purchaseCostAmount": 4.5,
        "purchaseCostCurrency": "USD",
        "unitCost": 4.5,
        "sellingPriceAmount": 12.0,
        "sellingPriceCurrency": "USD",
        "sellingPrice": 12.0,
        "quantityOnHand": 45,
        "reorderThreshold": 10,
        "unitOfMeasure": "ROLLS",
        "version": 3,
        "createdAt": "2026-08-15T08:00:00.000Z",
        "updatedAt": "2026-09-10T14:30:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
  ```
- **Errors**: `400 Bad Request` (invalid query params), `401 Unauthorized`, `403 Forbidden`.
- **Business Rules**: Inactive products are included by default; archived items are excluded unless `includeArchived=true`.
- **Side Effects**: None (read-only query).

---

### 2.2 Get Inventory Product Detail

- **Method**: `GET`
- **Path**: `/api/v1/resources/inventory/:id`
- **Purpose**: Retrieve complete details for a single inventory catalog item.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER`.
- **Request Parameters (Path)**:
  - `id` (string, required): Inventory Item UUID.
- **Validation**: UUID format checked.
- **Response**: `200 OK` (`InventoryItemResponseDto`)
  ```json
  {
    "id": "c1f7a01a-86c4-4d8e-9d21-4f114631aa01",
    "sku": "SUP-TAPE-001",
    "name": "Kinesiology Therapeutic Tape (5cm x 5m)",
    "description": "Waterproof elastic cotton tape for muscle support",
    "category": "THERAPY_CONSUMABLES",
    "status": "ACTIVE",
    "purchaseCostAmount": 4.5,
    "purchaseCostCurrency": "USD",
    "unitCost": 4.5,
    "sellingPriceAmount": 12.0,
    "sellingPriceCurrency": "USD",
    "sellingPrice": 12.0,
    "quantityOnHand": 45,
    "reorderThreshold": 10,
    "unitOfMeasure": "ROLLS",
    "version": 3,
    "createdAt": "2026-08-15T08:00:00.000Z",
    "updatedAt": "2026-09-10T14:30:00.000Z"
  }
  ```
- **Errors**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found` (item does not exist).
- **Business Rules**: Tenant isolation strictly checked.
- **Side Effects**: None (read-only query).

---

### 2.3 Create Inventory Product

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory`
- **Purpose**: Register a new consumable inventory item/SKU in the catalog.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`.
- **Request Body (`CreateInventoryItemRequestDto`)**:
  ```json
  {
    "sku": "PROT-WHEY-VAN-1KG",
    "name": "Organic Grass-Fed Whey Isolate (Vanilla, 1kg)",
    "description": "Pure whey protein isolate with zero artificial sweeteners",
    "category": "SUPPLEMENTS",
    "unitCost": 28.5,
    "sellingPrice": 52.0,
    "quantityOnHand": 20,
    "reorderThreshold": 5,
    "unitOfMeasure": "TUB"
  }
  ```
- **Validation**:
  - `sku`: string, `@MinLength(3)`, matches `^[A-Z0-9_-]{3,50}$` (`[INV-INV-1]`).
  - `name`: string, `@MinLength(3)`, max 120 chars.
  - `category`: valid `InventoryCategory` enum.
  - `unitCost`: number, `@Min(0)`.
  - `sellingPrice`: number, `@Min(0)`.
  - `quantityOnHand`: optional int, `@Min(0)`, default `0`.
  - `reorderThreshold`: optional int, `@Min(0)`, default `5`.
  - `unitOfMeasure`: optional string, default `'UNIT'`.
- **Response**: `201 Created` (`InventoryItemResponseDto`)
- **Errors**: `400 Bad Request` (validation failure), `409 Conflict` (SKU already exists in tenant).
- **Business Rules**:
  - SKU must be unique per tenant across all statuses.
  - If initial `quantityOnHand > 0`, an initial stock movement is atomically recorded.
- **Side Effects**: Persists aggregate to `inventory_items`, creates opening `StockMovement` if stock $> 0$, emits `InventoryItemCreatedEvent`.

---

### 2.4 Update Inventory Product Metadata

- **Method**: `PATCH`
- **Path**: `/api/v1/resources/inventory/:id`
- **Purpose**: Update catalog details, reorder thresholds, and pricing. Stock quantity cannot be mutated here.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`.
- **Request Body (`UpdateInventoryItemRequestDto`)**:
  ```json
  {
    "name": "Organic Grass-Fed Whey Isolate (Vanilla Bean, 1kg)",
    "description": "Updated formulation with organic Madagascar vanilla extract",
    "sellingPrice": 54.0,
    "reorderThreshold": 8
  }
  ```
- **Validation**: Partial fields validated; `unitCost` $\ge 0$, `sellingPrice` $\ge 0$, `reorderThreshold` $\ge 0$.
- **Response**: `200 OK` (`InventoryItemResponseDto`)
- **Errors**: `400 Bad Request`, `404 Not Found`, `409 Conflict` (OCC version mismatch).
- **Business Rules**: Prohibited on `ARCHIVED` items. UOM cannot be altered if item has positive stock or movement history.
- **Side Effects**: Updates `inventory_items`, increments `version`, emits domain event.

---

### 2.5 Record Purchase Receipt (`PURCHASE`)

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory/:id/receive`
- **Purpose**: Record incoming shipment receipt from a vendor, increasing physical stock balance.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`.
- **Request Body (`ReceiveStockRequestDto`)**:
  ```json
  {
    "quantity": 24,
    "unitCost": 27.5,
    "supplier": "Apex Nutrition Distributors",
    "referenceNumber": "PO-2026-0881",
    "notes": "Delivered in perfect condition batch #BN-9021"
  }
  ```
- **Validation**: `quantity`: integer, `@IsPositive()`. `unitCost`: optional number, `@Min(0)`.
- **Response**: `200 OK` (`StockMovementResponseDto`)
  ```json
  {
    "id": "mov_88a1b2c3-d4e5-6f7a-8b9c-0d1e2f3a4b5c",
    "itemId": "c1f7a01a-86c4-4d8e-9d21-4f114631aa01",
    "type": "PURCHASE",
    "quantity": 24,
    "balanceAfter": 69,
    "unitPrice": 27.5,
    "referenceId": "PO-2026-0881",
    "reason": "Delivered in perfect condition batch #BN-9021",
    "recordedByUserId": "usr_77a1b2c3",
    "recordedAt": "2026-09-16T10:15:00.000Z"
  }
  ```
- **Errors**: `400 Bad Request` (item inactive/archived, quantity $\le 0$), `404 Not Found`, `409 Conflict` (OCC collision).
- **Business Rules**: Increases stock balance: $\text{QOH}_{\text{new}} = \text{QOH} + \Delta Q$. Prohibited on `INACTIVE` or `ARCHIVED` items.
- **Side Effects**: Atomically updates `quantity_on_hand`, inserts immutable `stock_movements` row, bumps `version`, emits `StockReceivedDomainEvent`.

---

### 2.6 Record Retail Sale (`SALE`)

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory/:id/sell`
- **Purpose**: Record front-desk counter sale to a gym member or client, deducting stock.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`.
- **Request Body (`SellStockRequestDto`)**:
  ```json
  {
    "quantity": 2,
    "unitPrice": 52.0,
    "referenceId": "inv_pos_99412",
    "notes": "Direct counter purchase"
  }
  ```
- **Validation**: `quantity`: integer, `@IsPositive()`. `unitPrice`: optional number, `@Min(0)`.
- **Response**: `200 OK` (`StockMovementResponseDto`)
- **Errors**: `400 Bad Request` (insufficient stock `[INV-INV-2]`, inactive catalog status), `404 Not Found`, `409 Conflict` (OCC collision).
- **Business Rules**: Rejects if $\Delta Q > \text{quantityOnHand}$ (`InsufficientStockException`).
- **Side Effects**: Atomically updates balance, writes negative delta movement, evaluates low-stock threshold, emits `StockSoldDomainEvent`.

---

### 2.7 Record Clinical Consumption (`CONSUMPTION`)

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory/:id/consume`
- **Purpose**: Record internal usage of clinical materials during a treatment session or training workout.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `TRAINER`.
- **Request Body (`ConsumeStockRequestDto`)**:
  ```json
  {
    "quantity": 1,
    "treatmentSessionId": "sess_kine_4412",
    "notes": "Applied 1 roll during ankle rehabilitation session"
  }
  ```
- **Validation**: `quantity`: integer, `@IsPositive()`.
- **Response**: `200 OK` (`StockMovementResponseDto`)
- **Errors**: `400 Bad Request` (insufficient stock), `404 Not Found`, `409 Conflict`.
- **Business Rules**: In-service operational consumption; requires sufficient balance.
- **Side Effects**: Deducts stock, inserts `CONSUMPTION` movement, emits `StockConsumedDomainEvent`.

---

### 2.8 Record Physical Count Adjustment (`ADJUSTMENT`)

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory/:id/adjust`
- **Purpose**: Reconcile physical inventory discrepancies discovered during audited cycle counts.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`.
- **Request Body (`AdjustStockRequestDto`)**:
  ```json
  {
    "deltaQuantity": -2,
    "reason": "Cycle count discrepancy: 2 damaged tubs removed from shelf",
    "notes": "Audited by inventory supervisor"
  }
  ```
- **Validation**: `deltaQuantity`: integer ($\neq 0$). `reason`: string, `@MinLength(3)`.
- **Response**: `200 OK` (`StockMovementResponseDto`)
- **Errors**: `400 Bad Request` (reason $< 3$ chars, negative balance breach), `404 Not Found`, `409 Conflict`.
- **Business Rules**: Automatically routes to `ADJUSTMENT_IN` if $\Delta Q > 0$ or `ADJUSTMENT_OUT` if $\Delta Q < 0$. Rejects if negative adjustment exceeds available stock.
- **Side Effects**: Updates balance, records signed delta movement, emits `StockAdjustedDomainEvent`.

---

### 2.9 Record Disposal Write-Off (`SCRAP`)

- **Method**: `POST`
- **Path**: `/api/v1/resources/inventory/:id/scrap`
- **Purpose**: Record disposal of spoiled, contaminated, or damaged stock.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`.
- **Request Body (`ScrapStockRequestDto`)**:
  ```json
  {
    "quantity": 3,
    "reason": "Seal broken during warehouse handling; contaminated powder",
    "notes": "Disposed in hazardous organic waste container"
  }
  ```
- **Validation**: `quantity`: number, `@IsPositive()`. `reason`: string, `@MinLength(3)`.
- **Response**: `200 OK` (`StockMovementResponseDto`)
- **Errors**: `400 Bad Request` (insufficient stock, reason $< 3$ chars), `404 Not Found`, `409 Conflict`.
- **Side Effects**: Deducts stock, records `SCRAP` movement, emits `StockScrappedDomainEvent`.

---

### 2.10 Catalog Operational State Actions (`ARCHIVE`, `ACTIVATE`, `DEACTIVATE`)

- **Archive**: `POST /api/v1/resources/inventory/:id/archive`
  - Invariant: Allowed **only** when $\text{quantityOnHand} == 0.00$. Throws `400 Bad Request` if stock $> 0$.
- **Deactivate**: `POST /api/v1/resources/inventory/:id/deactivate`
  - Transitions to `INACTIVE`. Suspends all stock mutations without archiving.
- **Activate**: `POST /api/v1/resources/inventory/:id/activate`
  - Restores an `INACTIVE` item back to `ACTIVE`.

---

### 2.11 Stock Movement History Ledger

- **Method**: `GET`
- **Path**: `/api/v1/resources/inventory/:id/movements`
- **Purpose**: Inspect the chronological immutable double-entry movement ledger for a specific SKU.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.read`.
- **Query Parameters**: `page` (int, default 1), `limit` (int, default 20), `movementType` (`StockMovementType`, optional).
- **Response**: `200 OK` (`PaginatedMovementResponseDto`)

---

### 2.12 Low Stock Query

- **Method**: `GET`
- **Path**: `/api/v1/resources/inventory/low-stock`
- **Purpose**: Retrieve items where $\text{quantityOnHand} \le \text{minimumStock}$ (including the exact equality case).
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `inventory.read`.
- **Response**: `200 OK` (array of `InventoryItemResponseDto`).

---

### 2.13 Consumable Inventory Valuation

- **Method**: `GET`
- **Path**: `/api/v1/resources/inventory/valuation`
- **Purpose**: Compute total working capital value of active inventory in exact integer cents.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: Composed: `inventory.read` **AND** `billing.read`.
- **Response**: `200 OK` (`InventoryValuationResponseDto`)
  ```json
  {
    "totalDistinctItems": 42,
    "totalQuantityUnits": 1250,
    "totalValueAmount": 38450.0,
    "currency": "USD",
    "calculatedAt": "2026-09-16T10:20:00.000Z"
  }
  ```
- **Errors**: `403 Forbidden` if user lacks `billing.read`.
- **Formula**: $\sum (\text{quantityOnHand}_i \times \text{purchaseCostAmount}_i)$ across `ACTIVE` and `INACTIVE` items.

---

## 3. Fixed Assets API Specification

Base Path: `/api/v1/resources/assets`

---

### 3.1 List Fixed Assets

- **Method**: `GET`
- **Path**: `/api/v1/resources/assets`
- **Purpose**: Paginated asset registry browsing with category, lifecycle status, condition, and room filtering.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST`.
- **Request Parameters (Query)**:
  - `search` (string, optional): Search barcode tag, asset name, or description.
  - `category` (`AssetCategory`, optional): Filter by category.
  - `status` (`AssetStatus`, optional): `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`.
  - `condition` (`AssetCondition`, optional): `EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`.
  - `facilityId` (string, optional): Target facility UUID.
  - `roomId` (string, optional): Target room identifier.
  - `includeDecommissioned` (boolean, optional, default `false`): Include `RETIRED` and `SOLD` assets.
  - `page` (integer, default `1`), `limit` (integer, default `20`), `sortBy` (default `'createdAt'`), `sortOrder` (default `'desc'`).
- **Response**: `200 OK` (`PaginatedFixedAssetResponseDto`)
  ```json
  {
    "items": [
      {
        "id": "a9e2c11b-55d3-4f8e-8a12-7f339184cb02",
        "assetTag": "AST-KNE-2026-001",
        "name": "Biodex System 4 Pro Isokinetic Dynamometer",
        "description": "Multi-joint clinical testing and orthopedic rehabilitation station",
        "category": "THERAPY_EQUIPMENT",
        "status": "ACTIVE",
        "condition": "EXCELLENT",
        "location": {
          "facilityId": "fac_main",
          "roomId": "room_kine_1",
          "zone": "East Rehab Wing",
          "description": "Stationary bay 2"
        },
        "purchaseDate": "2026-01-15T00:00:00.000Z",
        "purchaseValueAmount": 45000.0,
        "purchaseValueCurrency": "USD",
        "currentEstimatedValueAmount": 42500.0,
        "currentEstimatedValueCurrency": "USD",
        "version": 4,
        "createdAt": "2026-01-15T09:00:00.000Z",
        "updatedAt": "2026-08-30T11:20:00.000Z"
      }
    ],
    "total": 17,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
  ```

---

### 3.2 Get Fixed Asset Detail

- **Method**: `GET`
- **Path**: `/api/v1/resources/assets/:id`
- **Purpose**: Retrieve complete details for a single fixed asset.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.read`.
- **Response**: `200 OK` (`FixedAssetResponseDto`)

---

### 3.3 Hardware Barcode / RFID Tag Lookup

- **Method**: `GET`
- **Path**: `/api/v1/resources/assets/tag/:tag`
- **Purpose**: Hardware scanner integration endpoint resolving physical barcode or RFID tag to asset record.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.read`.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `404 Not Found` if tag does not match any registered asset in tenant.

---

### 3.4 Commission & Register Fixed Asset

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets`
- **Purpose**: Register a newly acquired capital asset into the facility registry.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Request Body (`CreateFixedAssetRequestDto`)**:
  ```json
  {
    "assetTag": "AST-GYM-2026-014",
    "name": "Concept2 RowErg Model D PM5",
    "description": "Commercial indoor rowing machine with PM5 performance monitor",
    "category": "GYM_EQUIPMENT",
    "purchaseDate": "2026-08-20T00:00:00.000Z",
    "purchaseValueAmount": 1250.0,
    "purchaseValueCurrency": "USD",
    "currentEstimatedValueAmount": 1250.0,
    "condition": "EXCELLENT",
    "status": "ACTIVE",
    "location": {
      "facilityId": "fac_main",
      "roomId": "room_cardio_1",
      "zone": "Rowing Bay",
      "description": "Row 1, Unit 4"
    },
    "notes": "Acquired brand new from Concept2 direct"
  }
  ```
- **Validation**:
  - `assetTag`: string, `@MinLength(3)`, alphanumeric.
  - `name`: string, `@MinLength(2)`.
  - `category`: valid `AssetCategory` enum.
  - `purchaseDate`: ISO Date string.
  - `purchaseValueAmount`: number, `@Min(0)`.
  - `status`: optional `AssetStatus`. **Invariant `[AST-INV-3]`**: Must be one of `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`. Creating directly as `RETIRED` or `SOLD` throws `400 Bad Request`.
  - `location`: nested `AssetLocationDto` with required `facilityId`.
- **Response**: `201 Created` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request`, `409 Conflict` (duplicate `assetTag` in tenant).
- **Side Effects**: Persists to `fixed_assets`, appends initial `CREATED` `AssetHistoryEvent`, emits `FixedAssetCreatedDomainEvent`.

---

### 3.5 Update Fixed Asset Descriptive Metadata

- **Method**: `PATCH`
- **Path**: `/api/v1/resources/assets/:id`
- **Purpose**: Update descriptive metadata (name, description, notes). Status, condition, location, and valuation cannot be altered here.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Request Body (`UpdateFixedAssetDetailsRequestDto`)**:
  ```json
  {
    "name": "Concept2 RowErg Model D (PM5 Firmware 168)",
    "notes": "Firmware updated to v168 during network audit",
    "reason": "Annual IT equipment audit notes"
  }
  ```
- **Validation**: `name`: optional string $\ge 2$ chars.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request`, `404 Not Found`, `409 Conflict` (OCC collision).
- **Business Rules**: Anti-noise suppression: if no fields changed, produces zero history events and does not bump version.
- **Side Effects**: Updates `fixed_assets`, appends `UPDATED` history event.

---

### 3.6 Transfer Fixed Asset Location

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets/:id/transfer`
- **Purpose**: Transfer physical placement location of an asset.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`.
- **Request Body (`TransferFixedAssetLocationRequestDto`)**:
  ```json
  {
    "location": {
      "facilityId": "fac_main",
      "roomId": "room_therapy_2",
      "zone": "Treatment Bay B",
      "description": "Relocated for dedicated post-op patient care"
    },
    "reason": "Reassigned to Room 2 following orthopedic clinic expansion"
  }
  ```
- **Validation**: `location`: valid `AssetLocationDto` with non-empty `facilityId`.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request` (`RETIRED` or `SOLD` status blocks transfers `[AST-INV-2]`), `404 Not Found`, `409 Conflict`.
- **Business Rules**: Prohibited on `RETIRED` and `SOLD` assets. Transfer to identical location is a no-op (produces no history event).
- **Side Effects**: Updates location in `fixed_assets`, appends `TRANSFERRED` history event, emits `AssetTransferredDomainEvent`.

---

### 3.7 Transition Lifecycle Status

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets/:id/status`
- **Purpose**: Transition asset status across the authoritative 5x5 state machine.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Request Body (`ChangeFixedAssetStatusRequestDto`)**:
  ```json
  {
    "status": "UNDER_MAINTENANCE",
    "reason": "Scheduled quarterly load cell calibration and overhaul"
  }
  ```
- **Validation**: `status`: valid `AssetStatus` enum. `reason`: string, `@MinLength(3)`.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request` (illegal state machine transition, missing reason, condition `OUT_OF_SERVICE` blocking `ACTIVE` `[AST-INV-9]`), `404 Not Found`, `409 Conflict`.
- **Business Rules**: Enforces the 5x5 adjacency matrix in `AssetLifecycleStateMachine`. Direct transition to `SOLD` via this endpoint is prohibited (liquidation requires explicit sale amount).
- **Side Effects**: Updates status, appends `STATUS_CHANGED` history event, emits `AssetStatusChangedDomainEvent`.

---

### 3.8 Update Physical Condition Rating

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets/:id/condition`
- **Purpose**: Record qualitative condition rating (`EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`).
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`.
- **Request Body (`UpdateFixedAssetConditionRequestDto`)**:
  ```json
  {
    "condition": "NEEDS_REPAIR",
    "reason": "Drive chain exhibiting mechanical resistance and slippage"
  }
  ```
- **Validation**: `condition`: valid `AssetCondition` enum.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request` (prohibited on `RETIRED` or `SOLD` assets), `404 Not Found`, `409 Conflict`.
- **Business Rules**: Condition is orthogonal to status; setting `NEEDS_REPAIR` does not silently change status to `UNDER_MAINTENANCE`. Setting current condition is an idempotent no-op.
- **Side Effects**: Updates condition, appends `CONDITION_CHANGED` history event, emits `AssetConditionChangedDomainEvent`.

---

### 3.9 Record Maintenance Servicing Work Order

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets/:id/maintenance`
- **Purpose**: Record servicing, calibration, or overhaul work order. Conditionally auto-restores asset status to `ACTIVE`.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: `assets.write`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`.
- **Request Body (`RecordAssetMaintenanceRequestDto`)**:
  ```json
  {
    "serviceDate": "2026-09-15T10:00:00.000Z",
    "description": "Full load cell re-calibration, cable lubrication, and safety certification",
    "costAmount": 450.0,
    "costCurrency": "USD",
    "performedBy": "Biodex Certified Field Tech #88",
    "updateConditionTo": "EXCELLENT",
    "notes": "Passed all NIST-traceable calibration tests. Work order #WO-9912."
  }
  ```
- **Validation**:
  - `serviceDate`: ISO Date string.
  - `description`: string, `@MinLength(3)`.
  - `costAmount`: number, `@Min(0)`.
  - `performedBy`: string, `@MinLength(2)`.
  - `updateConditionTo`: optional `AssetCondition` enum.
- **Response**: `200 OK` (`AssetMaintenanceRecordDTO`)
  ```json
  {
    "id": "rec_mnt_11a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c",
    "assetId": "a9e2c11b-55d3-4f8e-8a12-7f339184cb02",
    "serviceDate": "2026-09-15T10:00:00.000Z",
    "description": "Full load cell re-calibration, cable lubrication, and safety certification",
    "costAmount": 450.0,
    "costCurrency": "USD",
    "performedBy": "Biodex Certified Field Tech #88",
    "notes": "Passed all NIST-traceable calibration tests. Work order #WO-9912.",
    "recordedByUserId": "usr_77a1b2c3",
    "recordedAt": "2026-09-16T10:25:00.000Z"
  }
  ```
- **Errors**: `400 Bad Request` (`RETIRED` or `SOLD` status blocks servicing `[AST-INV-1]`, `[AST-INV-4]`), `404 Not Found`, `409 Conflict`.
- **Business Rules (Maintenance Auto-Restoration)**:
  - If the asset was in `UNDER_MAINTENANCE` or `DAMAGED` status, and the resulting condition is serviceable (`EXCELLENT`, `GOOD`, `FAIR`), the asset's status **automatically restores to `ACTIVE`**.
  - If resulting condition remains unserviceable (`NEEDS_REPAIR`, `OUT_OF_SERVICE`), status remains `UNDER_MAINTENANCE` (or `DAMAGED`).
- **Side Effects**: Inserts `asset_maintenance_records` row, appends `MAINTENANCE_RECORDED` history event, atomically updates status/condition in `fixed_assets`, emits `AssetMaintenanceRecordedDomainEvent`.

---

### 3.10 Update Asset Valuation (Revaluation / Appraisal)

- **Method**: `POST`
- **Path**: `/api/v1/resources/assets/:id/valuation`
- **Purpose**: Record official economic appraisal, accounting write-down, or market revaluation.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: Composed: `assets.write` **AND** `billing.read`.
- **Request Body (`UpdateFixedAssetValuationRequestDto`)**:
  ```json
  {
    "estimatedValueAmount": 38000.0,
    "currency": "USD",
    "reason": "Annual accounting straight-line book depreciation write-down"
  }
  ```
- **Validation**: `estimatedValueAmount`: number, `@Min(0)`.
- **Response**: `200 OK` (`FixedAssetResponseDto`)
- **Errors**: `400 Bad Request` (prohibited on `SOLD` assets), `403 Forbidden` (missing `billing.read`), `404 Not Found`, `409 Conflict`.
- **Side Effects**: Updates `currentEstimatedValue`, appends `VALUE_UPDATED` history event, emits `AssetValuationUpdatedDomainEvent`.

---

### 3.11 Fixed Asset History & Maintenance Queries

- **Get History Ledger**: `GET /api/v1/resources/assets/:id/history`
  - Query params: `eventType`, `recordedByUserId`, `fromDate`, `toDate`, `page`, `limit`, `sortOrder`.
  - Returns chronological immutable lifecycle audit trail.
- **Get Maintenance History**: `GET /api/v1/resources/assets/:id/maintenance`
  - Query params: `performedBy`, `fromDate`, `toDate`, `page`, `limit`, `sortOrder`.
  - Returns paginated maintenance work orders.
- **Get Asset Valuation Detail**: `GET /api/v1/resources/assets/:id/valuation`
  - Required permissions: `assets.read` **AND** `billing.read`.
  - Returns `{ assetId, assetTag, name, purchaseValueAmount, currentEstimatedValueAmount, lastValuationDate }`.

---

### 3.12 Fixed Asset Portfolio Valuation Summary

- **Method**: `GET`
- **Path**: `/api/v1/resources/assets/valuation/summary`
- **Purpose**: Aggregate portfolio balance sheet carrying value across active capital equipment according to ADR-0097.
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: Composed: `assets.read` **AND** `billing.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Query Parameters**:
  - `category` (string, optional): Filter by category enum.
  - `includeDecommissioned` (boolean, optional, default `false`): Include `RETIRED` assets.
- **Response**: `200 OK` (`FixedAssetValuationSummaryResponseDto`)
  ```json
  {
    "totalCarryingValueAmount": 185000.0,
    "totalPurchaseValueAmount": 210000.0,
    "currency": "USD",
    "totalAssetCount": 17,
    "activeAssetCount": 14,
    "calculatedAt": "2026-09-16T10:30:00.000Z",
    "breakdownByCategory": {
      "THERAPY_EQUIPMENT": {
        "totalCarryingValueAmount": 110000.0,
        "totalPurchaseValueAmount": 125000.0,
        "assetCount": 6
      },
      "GYM_EQUIPMENT": {
        "totalCarryingValueAmount": 75000.0,
        "totalPurchaseValueAmount": 85000.0,
        "assetCount": 8
      }
    },
    "breakdownByStatus": {
      "ACTIVE": { "count": 14, "totalCarryingValueAmount": 185000.0 },
      "UNDER_MAINTENANCE": { "count": 1, "totalCarryingValueAmount": 0.0 },
      "RETIRED": { "count": 2, "totalCarryingValueAmount": 0.0 }
    },
    "breakdownByCondition": {
      "EXCELLENT": { "count": 10, "totalCarryingValueAmount": 145000.0 },
      "GOOD": { "count": 4, "totalCarryingValueAmount": 40000.0 }
    }
  }
  ```
- **Business Rules (ADR-0097)**:
  - Included in Carrying Value: `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`.
  - Excluded from Carrying Value ($0.00): `RETIRED`, `SOLD`.

---

## 4. Resource Overview & Combined Valuation API

---

### 4.1 Resource Overview Dashboard (Executive Cockpit)

- **Method**: `GET`
- **Path**: `/api/v1/resources/overview`
- **Purpose**: Executive dashboard telemetry synthesizing consumable inventory working capital and item counts with capital fixed asset carrying values and lifecycle metrics ([ADR-0102](./adr/0102-resource-overview-synthesized-read-query-architecture.md)).
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: Composed: `inventory.read` **AND** `assets.read` **AND** `billing.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Query Parameters**:
  - `includeArchived` (boolean, optional, default `false`): Include archived consumable items in calculations.
- **Response**: `200 OK` (`ResourceOverviewResponseDto`)
  ```json
  {
    "consumableInventory": {
      "totalValueAmount": 38450.0,
      "lowStockItemCount": 3,
      "totalDistinctItems": 42,
      "totalQuantityUnits": 1250
    },
    "fixedAssets": {
      "totalCarryingValueAmount": 185000.0,
      "activeAssetCount": 14,
      "underMaintenanceAssetCount": 1,
      "damagedAssetCount": 0,
      "retiredAssetCount": 2,
      "totalAssetCount": 17
    },
    "combined": {
      "totalCombinedValueAmount": 223450.0
    },
    "currency": "USD",
    "calculatedAt": "2026-09-16T10:30:00.000Z"
  }
  ```
- **Errors**: `401 Unauthorized`, `403 Forbidden` (missing any of `inventory.read`, `assets.read`, `billing.read`).
- **Business Rules**:
  - The Combined Value is computed as:
    $$\text{Total Combined Value} = \text{Consumable Inventory Total Value} + \text{Fixed Asset Total Carrying Value}$$
  - Synthesized on-demand via parallel CQRS queries; never persisted in a denormalized cache table.

---

### 4.2 Combined Resource Valuation Summary

- **Method**: `GET`
- **Path**: `/api/v1/resources/valuation/summary`
- **Purpose**: Cross-domain enterprise balance sheet valuation calculating total capital exposure and portfolio breakdown percentages ([ADR-0098](./adr/0098-cross-domain-derived-resource-valuation-architecture.md)).
- **Authentication**: Required (`Bearer <JWT>`).
- **Required Permissions**: Composed: `inventory.read` **AND** `assets.read` **AND** `billing.read`. Allowed roles: `ADMIN`, `SUPER_ADMIN`, `OWNER`.
- **Query Parameters**:
  - `includeArchived` (boolean, optional, default `false`).
  - `includeDecommissioned` (boolean, optional, default `false`).
- **Response**: `200 OK` (`ResourceValuationSummaryResponseDto`)
  ```json
  {
    "totalCombinedValueAmount": 223450.0,
    "totalCombinedPurchaseValueAmount": 248450.0,
    "currency": "USD",
    "calculatedAt": "2026-09-16T10:30:00.000Z",
    "consumableInventory": {
      "totalValueAmount": 38450.0,
      "totalDistinctItems": 42,
      "totalQuantityUnits": 1250,
      "sharePercentage": 17.21
    },
    "fixedAssets": {
      "totalCarryingValueAmount": 185000.0,
      "totalPurchaseValueAmount": 210000.0,
      "totalAssetCount": 17,
      "activeAssetCount": 14,
      "sharePercentage": 82.79
    }
  }
  ```
- **Business Rules**:
  - Exact integer-cents arithmetic with rounding to 2 decimal places.
  - Shares sum to 100.0%.
