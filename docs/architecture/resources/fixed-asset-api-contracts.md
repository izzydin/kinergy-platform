# Fixed Asset HTTP API Contracts & Lifecycle Architecture

**Status**: Approved & Active  
**Milestone**: Phase 6.9 — Backend API Layer  
**Domain**: Resources Management — Fixed Assets Sub-Domain  
**Author**: Senior Backend API Engineer & Asset Lifecycle Boundary Reviewer  
**Governing Documents**:

- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**Resources Public HTTP API Surface**](./resource-api-surface.md)
- [**Consumable Inventory API Contracts**](./inventory-api-contracts.md)
- [**Asset Application Layer Baseline**](./asset-application-baseline.md)
- [**Asset State Machine Specification**](./asset-state-machine.md)

---

## 1. Architectural Role & Boundary Principles

The Fixed Assets HTTP Controller ([`FixedAssetsController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/fixed-assets.controller.ts)) serves strictly as an HTTP transport adapter delegating to CQRS command and query handlers.

### Strict Architectural Boundaries:

1. **Generic Update Boundary**:
   - `PATCH /api/v1/resources/assets/:id` is strictly limited to non-state descriptive metadata (`name`, `description`, `notes`, `reason`).
   - Generic update **strictly prohibits** mutating:
     - `status` (requires `POST :id/status`);
     - `condition` (requires `POST :id/condition`);
     - `location` (requires `POST :id/transfer`);
     - `estimatedValue` (requires `POST :id/valuation`).
2. **Explicit Lifecycle State Transitions**:
   - Status changes are governed by the domain state machine (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`). The controller delegates directly to `ChangeFixedAssetStatusHandler` and never implements transition logic.
3. **Atomic Location Transfers**:
   - Location transfer (`POST :id/transfer`) invokes `TransferFixedAssetLocationHandler`, which atomically verifies asset existence, validates active state (preventing transfer of retired/sold assets per `[AST-INV-2]`), records the new physical location, and emits a `TRANSFERRED` lifecycle event into the append-only history ledger.
4. **Dedicated Maintenance Work Orders**:
   - Servicing and calibration cannot be persisted via arbitrary metadata updates. `POST :id/maintenance` records an immutable `AssetMaintenanceRecord`, logs the servicing technician, cost, work details, and conditionally updates operational condition.
5. **Static Taxonomy Metadata**:
   - Fixed asset categories (`AssetCategory`) are code-defined. `GET /api/v1/resources/assets/categories` exposes taxonomy descriptors, display names, and default inspection schedules without database lookup overhead.

---

## 2. Complete Fixed Assets Route Specification

Base URI Prefix: `/api/v1/resources/assets`

### 2.1 Static Taxonomy & Hardware Barcode Lookup

| Method | Route         | Permission Required | Request DTO | Response Type                | Description                                                  |
| :----- | :------------ | :------------------ | :---------- | :--------------------------- | :----------------------------------------------------------- |
| `GET`  | `/categories` | `assets.read`       | _None_      | `AssetCategoryMetadataDto[]` | Retrieves static category metadata and inspection intervals. |
| `GET`  | `/tag/:tag`   | `assets.read`       | _None_      | `FixedAssetResponseDto`      | Hardware barcode/RFID scanner lookup resolving asset record. |

#### Category Taxonomy Metadata Schema (`AssetCategoryMetadataDto`):

```json
[
  {
    "code": "GYM_EQUIPMENT",
    "displayName": "Gym Equipment",
    "description": "Heavy machinery, cardio machines, free weights, and functional training stations.",
    "requiresMaintenance": true,
    "defaultInspectionIntervalDays": 90
  },
  {
    "code": "THERAPY_EQUIPMENT",
    "displayName": "Therapy Equipment",
    "description": "Clinical lasers, ultrasound machines, shockwave units, and treatment tables.",
    "requiresMaintenance": true,
    "defaultInspectionIntervalDays": 60
  },
  {
    "code": "KITCHEN_EQUIPMENT",
    "displayName": "Kitchen Equipment",
    "description": "Commercial blenders, refrigeration, shake station appliances, and ice machines.",
    "requiresMaintenance": true,
    "defaultInspectionIntervalDays": 180
  },
  {
    "code": "OFFICE_FURNITURE",
    "displayName": "Office Furniture",
    "description": "Desks, consultation chairs, reception counters, and filing cabinets.",
    "requiresMaintenance": false
  },
  {
    "code": "ELECTRONICS",
    "displayName": "Electronics",
    "description": "POS terminals, sound systems, computers, tablets, and network infrastructure.",
    "requiresMaintenance": true,
    "defaultInspectionIntervalDays": 180
  },
  {
    "code": "CLEANING_EQUIPMENT",
    "displayName": "Cleaning Equipment",
    "description": "Industrial floor scrubbers, sanitization foggers, and wet-dry vacuums.",
    "requiresMaintenance": true,
    "defaultInspectionIntervalDays": 90
  }
]
```

---

### 2.2 Asset Registration, Retrieval & Catalog Querying

#### 1. Commission & Register Asset (`POST /api/v1/resources/assets`)

- **Required Permission**: `assets.write`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`
- **Status Code**: `201 Created`
- **Request Body (`CreateFixedAssetRequestDto`)**:
  ```json
  {
    "assetTag": "AST-KNE-2026-001",
    "name": "Biodex System 4 Pro Isokinetic Dynamometer",
    "description": "Multi-joint testing and rehabilitation system",
    "category": "THERAPY_EQUIPMENT",
    "purchaseDate": "2026-01-15T00:00:00.000Z",
    "purchaseValueAmount": 45000.0,
    "purchaseValueCurrency": "USD",
    "condition": "EXCELLENT",
    "status": "ACTIVE",
    "location": {
      "facilityId": "fac_main",
      "roomId": "room_rehab_01",
      "zone": "Zone A",
      "description": "Physical Therapy Suite 1"
    }
  }
  ```
- **Response**: `FixedAssetResponseDto` (`201 Created`)

#### 2. Get Asset Details (`GET /api/v1/resources/assets/:id`)

- **Required Permission**: `assets.read`
- **Roles**: `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST`
- **Status Code**: `200 OK`
- **Response**: `FixedAssetResponseDto`

#### 3. List Assets (`GET /api/v1/resources/assets`)

- **Required Permission**: `assets.read`
- **Query Parameters (`ListFixedAssetsQueryDto`)**:
  - `search`: Fuzzy search matching `assetTag`, `name`, `description`.
  - `category`: Filter by `AssetCategory`.
  - `status`: Filter by `AssetStatus` (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
  - `condition`: Filter by `AssetCondition` (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`).
  - `facilityId`: Filter by facility identifier.
  - `roomId`: Filter by specific room.
  - `includeDecommissioned`: Boolean flag (default `false`).
  - `page`: 1-indexed page integer (default `1`).
  - `limit`: Items per page (default `20`, max `100`).
  - `sortBy`: `createdAt`, `name`, `assetTag`, `purchaseDate`, `currentEstimatedValueAmount` (default `createdAt`).
  - `sortOrder`: `asc` or `desc` (default `desc`).
- **Response (`PaginatedFixedAssetResponseDto`)**:
  ```json
  {
    "items": [
      {
        "id": "ast_123",
        "assetTag": "AST-KNE-2026-001",
        "name": "Biodex System 4 Pro Isokinetic Dynamometer",
        "description": "Multi-joint testing and rehabilitation system",
        "category": "THERAPY_EQUIPMENT",
        "status": "ACTIVE",
        "condition": "EXCELLENT",
        "purchaseDate": "2026-01-15T00:00:00.000Z",
        "location": {
          "facilityId": "fac_main",
          "roomId": "room_rehab_01",
          "zone": "Zone A",
          "description": "Physical Therapy Suite 1"
        },
        "version": 1,
        "createdAt": "2026-01-15T00:00:00.000Z",
        "updatedAt": "2026-01-15T00:00:00.000Z"
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

#### 4. Generic Details Update (`PATCH /api/v1/resources/assets/:id`)

- **Required Permission**: `assets.write`
- **Request Body (`UpdateFixedAssetDetailsRequestDto`)**:
  ```json
  {
    "name": "Biodex System 4 Pro (Calibrated)",
    "description": "Updated calibration profile",
    "notes": "Monthly maintenance certified",
    "reason": "Periodic description enhancement"
  }
  ```
- **Response**: `FixedAssetResponseDto` (`200 OK`)

---

### 2.3 Explicit State & Lifecycle Operations

| Method | Endpoint           | Permission                            | Payload DTO                            | Purpose & Invariant Rules                                                                                                                                  |
| :----- | :----------------- | :------------------------------------ | :------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/:id/transfer`    | `assets.write`                        | `TransferFixedAssetLocationRequestDto` | Relocate asset between rooms/facilities. Emits `TRANSFERRED` history event. Rejected if `RETIRED` or `SOLD` (`[AST-INV-2]`).                               |
| `POST` | `/:id/status`      | `assets.write`                        | `ChangeFixedAssetStatusRequestDto`     | Execute state machine transition (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`). Terminal status `SOLD` cannot be reversed (`[AST-INV-1]`). |
| `POST` | `/:id/condition`   | `assets.write`                        | `UpdateFixedAssetConditionRequestDto`  | Record operational condition rating (`EXCELLENT` $\rightarrow$ `DAMAGED`).                                                                                 |
| `POST` | `/:id/maintenance` | `assets.write`                        | `RecordAssetMaintenanceRequestDto`     | Record technician service work order, parts cost, and post-service condition.                                                                              |
| `POST` | `/:id/valuation`   | `assets.write` **AND** `billing.read` | `UpdateFixedAssetValuationRequestDto`  | Record appraisal/depreciation book value update.                                                                                                           |

---

### 2.4 History & Financial Valuation Queries

#### 1. Lifecycle Audit History (`GET /api/v1/resources/assets/:id/history`)

- **Permission**: `assets.read`
- **Query Params (`GetAssetHistoryQueryDto`)**: `eventType`, `recordedByUserId`, `fromDate`, `toDate`, `page`, `limit`, `sortOrder`.
- **Response**: `PaginatedResultDTO<AssetHistoryEventDTO>`

#### 2. Servicing Maintenance History (`GET /api/v1/resources/assets/:id/maintenance`)

- **Permission**: `assets.read`
- **Query Params (`GetMaintenanceHistoryQueryDto`)**: `performedBy`, `fromDate`, `toDate`, `page`, `limit`, `sortOrder`.
- **Response**: `PaginatedResultDTO<AssetMaintenanceRecordDTO>`

#### 3. Single Asset Valuation (`GET /api/v1/resources/assets/:id/valuation`)

- **Permissions**: `assets.read` **AND** `billing.read`
- **Response (`FixedAssetValuationResponseDto`)**:
  ```json
  {
    "assetId": "ast_123",
    "assetTag": "AST-KNE-2026-001",
    "name": "Biodex System 4 Pro",
    "purchaseValueAmount": 45000.0,
    "purchaseValueCurrency": "USD",
    "currentEstimatedValueAmount": 38000.0,
    "currentEstimatedValueCurrency": "USD",
    "lastValuationDate": "2026-08-30T00:00:00.000Z"
  }
  ```

#### 4. Capital Estate Valuation Summary (`GET /api/v1/resources/assets/valuation/summary`)

- **Permissions**: `assets.read` **AND** `billing.read`
- **Query Params**: `category`, `includeDecommissioned`.
- **Response (`FixedAssetValuationSummaryResponseDto`)**:
  ```json
  {
    "totalCarryingValueAmount": 185000.0,
    "totalPurchaseValueAmount": 220000.0,
    "currency": "USD",
    "totalAssetCount": 15,
    "activeAssetCount": 14,
    "calculatedAt": "2026-08-31T15:00:00.000Z",
    "breakdownByCategory": {},
    "breakdownByStatus": {},
    "breakdownByCondition": {}
  }
  ```

---

## 3. Verification & Test Evidence

The Fixed Asset HTTP contracts are verified by automated unit, contract, and authorization test suites:

1. **Fixed Asset Contract Suite**: [`apps/api/src/resources/__tests__/fixed-assets-api.contract.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/fixed-assets-api.contract.spec.ts) (17 passing tests)
2. **Fixed Asset Authorization Suite**: [`apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/__tests__/fixed-assets.authorization.spec.ts) (23 passing tests)
3. **Combined Resources Suites**: 6 suites / 120 unit & integration tests passing in `apps/api/src/resources/__tests__/`.
