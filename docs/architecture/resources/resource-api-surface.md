# Phase 6 — Resources Management: Public HTTP API Surface Specification

**Bounded Context**: `Resources Management`  
**Sub-Domains**: `Consumable Inventory`, `Fixed Assets`, `Resource Valuation`  
**Milestone**: Phase 6.9 — Backend API Layer  
**Document**: Authoritative Public HTTP API Contract & Interface Specification  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 31, 2026

---

## 1. Executive Summary & Design Principles

This specification defines the complete, public REST API surface for the **Resources Management** bounded context of the Kinergy Platform.

### Core Architectural Principles:

1. **Explicit Domain Operations over Generic PATCH ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md))**: State machine transitions (`status`, `condition`), physical room transfers, and stock movements are exposed through dedicated action sub-resources (`POST :id/<action>`) rather than mutable fields in generic `PATCH` payloads.
2. **Deterministic Double-Entry Provenance**: Every inventory mutation creates an immutable `InventoryMovement` record; every asset relocation creates an `AssetHistory` record; every maintenance service creates a `MaintenanceRecord`.
3. **No Denormalized Aggregates**: Collection valuations are derived on-demand in exact integer cents without persistent aggregate column drift.
4. **Zero Frontend Trust & Composed RBAC**: Endpoints strictly enforce multi-permission compositions (`billing.read` + domain permissions) directly on the backend.
5. **Standard Kinergy Pagination & Error Envelopes**: Complete parity with platform conventions (`{ items, pagination }` and `{ statusCode, timestamp, path, error }`).

---

## 2. Resource Hierarchy & Topology

All Phase 6 endpoints reside under the global versioned API namespace: `/api/v1/resources`.

```
/api/v1/resources
├── /inventory                        --> Consumable Inventory Aggregate Root
│   ├── (GET)                         --> List products (paginated, filtered, sorted)
│   ├── (POST)                        --> Create product catalog item
│   ├── /categories                   --> (GET) Static enum taxonomy metadata
│   ├── /low-stock                    --> (GET) Low stock replenishment alerts
│   ├── /valuation                    --> (GET) Total working capital valuation
│   └── /:id                          --> Single Product Resource
│       ├── (GET)                     --> Get product details
│       ├── (PATCH)                   --> Update generic metadata (name, pricing, thresholds)
│       ├── /stock-level              --> (GET) Current physical stock on hand
│       ├── /movements                --> (GET) Chronological movement ledger
│       ├── /receive                  --> (POST) Replenish stock (PO receipt)
│       ├── /sell                     --> (POST) POS retail sale
│       ├── /consume                  --> (POST) Internal facility consumption
│       ├── /scrap                    --> (POST) Disposal of damaged/spoiled stock
│       ├── /adjust                   --> (POST) Audit stock reconciliation
│       ├── /archive                  --> (POST) Soft-archive catalog item
│       ├── /activate                 --> (POST) Re-activate catalog item
│       └── /deactivate               --> (POST) Deactivate catalog item (seasonal freeze)
│
├── /assets                           --> Fixed Assets Aggregate Root
│   ├── (GET)                         --> List fixed assets (paginated, filtered, sorted)
│   ├── (POST)                        --> Commission / register new fixed asset
│   ├── /categories                   --> (GET) Static enum taxonomy metadata
│   ├── /tag/:tag                     --> (GET) Lookup asset by barcode / RFID tag
│   ├── /valuation/summary            --> (GET) Capital equipment carrying value summary
│   └── /:id                          --> Single Fixed Asset Resource
│       ├── (GET)                     --> Get asset details
│       ├── (PATCH)                   --> Update generic metadata (name, description, notes)
│       ├── /transfer                 --> (POST) Physical room/facility relocation
│       ├── /status                   --> (POST) Operational lifecycle transition
│       ├── /condition                --> (POST) Qualitative condition rating update
│       ├── /maintenance              --> (GET/POST) Log service work order / view service history
│       ├── /history                  --> (GET) Chronological audit & transfer history
│       └── /valuation                --> (GET/POST) Fair appraisal valuation query / update
│
└── /valuation
    └── /summary                      --> (GET) Derived cross-domain resource balance sheet
```

---

## 3. Complete Route Inventory

### 3.1 Consumable Inventory API Surface

| HTTP Method | Route Path                                    | Operation Name            | Required Permissions             | Allowed Roles                                                               | Description                                                                        |
| :---------- | :-------------------------------------------- | :------------------------ | :------------------------------- | :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `GET`       | `/api/v1/resources/inventory`                 | `ListProducts`            | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER` | Paginated search, category, and status filtered catalog.                           |
| `POST`      | `/api/v1/resources/inventory`                 | `CreateProduct`           | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | Register a new product SKU with initial stock & pricing.                           |
| `GET`       | `/api/v1/resources/inventory/categories`      | `ListInventoryCategories` | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER` | Returns static code-defined category enum metadata.                                |
| `GET`       | `/api/v1/resources/inventory/low-stock`       | `GetLowStockProducts`     | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | List products with `quantityOnHand <= minimumStock`.                               |
| `GET`       | `/api/v1/resources/inventory/valuation`       | `GetInventoryValuation`   | `inventory.read`, `billing.read` | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                             | Working capital valuation ($\sum \text{currentStock} \times \text{purchaseCost}$). |
| `GET`       | `/api/v1/resources/inventory/:id`             | `GetProduct`              | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER` | Retrieve single product details by ID.                                             |
| `PATCH`     | `/api/v1/resources/inventory/:id`             | `UpdateProduct`           | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | Update product title, description, pricing, reorder thresholds.                    |
| `GET`       | `/api/v1/resources/inventory/:id/stock-level` | `GetStockLevel`           | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`, `TRAINER` | Get current materialized physical stock on hand.                                   |
| `GET`       | `/api/v1/resources/inventory/:id/movements`   | `GetInventoryMovements`   | `inventory.read`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | Chronological immutable movement audit ledger.                                     |
| `POST`      | `/api/v1/resources/inventory/:id/receive`     | `RecordPurchase`          | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | Replenish stock via PO receipt (generates `PURCHASE_RECEIPT`).                     |
| `POST`      | `/api/v1/resources/inventory/:id/sell`        | `RecordSale`              | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `RECEPTIONIST`            | Record POS sale deduction (generates `SALE`).                                      |
| `POST`      | `/api/v1/resources/inventory/:id/consume`     | `RecordConsumption`       | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`, `TRAINER`                 | Record internal usage (generates `INTERNAL_CONSUMPTION`).                          |
| `POST`      | `/api/v1/resources/inventory/:id/scrap`       | `RecordScrap`             | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `KITCHEN_STAFF`                            | Record damaged/spoiled item disposal (generates `SCRAP`).                          |
| `POST`      | `/api/v1/resources/inventory/:id/adjust`      | `AdjustStock`             | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                             | Reconcile physical count discrepancy (generates `AUDIT_ADJUSTMENT`).               |
| `POST`      | `/api/v1/resources/inventory/:id/archive`     | `ArchiveProduct`          | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                             | Transition product to `ARCHIVED` status.                                           |
| `POST`      | `/api/v1/resources/inventory/:id/activate`    | `ActivateProduct`         | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                             | Re-activate archived or inactive product to `ACTIVE`.                              |
| `POST`      | `/api/v1/resources/inventory/:id/deactivate`  | `DeactivateProduct`       | `inventory.write`                | `ADMIN`, `SUPER_ADMIN`, `OWNER`                                             | Deactivate product to `INACTIVE` (seasonal freeze).                                |

---

### 3.2 Fixed Assets API Surface

| HTTP Method | Route Path                                   | Operation Name                  | Required Permissions           | Allowed Roles                                              | Description                                                                             |
| :---------- | :------------------------------------------- | :------------------------------ | :----------------------------- | :--------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `GET`       | `/api/v1/resources/assets`                   | `ListAssets`                    | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST` | Paginated search, category, status, condition, and location filter.                     |
| `POST`      | `/api/v1/resources/assets`                   | `CreateAsset`                   | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Commission and register a new capital fixed asset.                                      |
| `GET`       | `/api/v1/resources/assets/categories`        | `ListAssetCategories`           | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST` | Returns static code-defined category enum metadata.                                     |
| `GET`       | `/api/v1/resources/assets/tag/:tag`          | `GetAssetByTag`                 | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST` | Lookup asset via unique barcode or RFID hardware tag.                                   |
| `GET`       | `/api/v1/resources/assets/valuation/summary` | `GetFixedAssetValuationSummary` | `assets.read`, `billing.read`  | `ADMIN`, `SUPER_ADMIN`, `OWNER`                            | Capital estate carrying value summary & category breakdown.                             |
| `GET`       | `/api/v1/resources/assets/:id`               | `GetAsset`                      | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`, `RECEPTIONIST` | Retrieve asset operational details.                                                     |
| `PATCH`     | `/api/v1/resources/assets/:id`               | `UpdateAssetDetails`            | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Update asset name, description, and general notes.                                      |
| `POST`      | `/api/v1/resources/assets/:id/transfer`      | `TransferAssetLocation`         | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Move asset to new room/facility (logs `AssetHistory`).                                  |
| `POST`      | `/api/v1/resources/assets/:id/status`        | `ChangeAssetStatus`             | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | 5x5 lifecycle state transition (`ACTIVE`, `MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`). |
| `POST`      | `/api/v1/resources/assets/:id/condition`     | `UpdateAssetCondition`          | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Update physical condition rating (`EXCELLENT` through `DAMAGED`).                       |
| `GET`       | `/api/v1/resources/assets/:id/maintenance`   | `GetMaintenanceHistory`         | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | View chronological service and work order history.                                      |
| `POST`      | `/api/v1/resources/assets/:id/maintenance`   | `RecordAssetMaintenance`        | `assets.write`                 | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Log maintenance work order, cost, vendor, and outcome.                                  |
| `GET`       | `/api/v1/resources/assets/:id/history`       | `GetAssetHistory`               | `assets.read`                  | `ADMIN`, `SUPER_ADMIN`, `OWNER`, `TRAINER`                 | Immutable location, status, and condition audit log.                                    |
| `GET`       | `/api/v1/resources/assets/:id/valuation`     | `GetAssetValue`                 | `assets.read`, `billing.read`  | `ADMIN`, `SUPER_ADMIN`, `OWNER`                            | Item-level acquisition and current carrying appraisal value.                            |
| `POST`      | `/api/v1/resources/assets/:id/valuation`     | `UpdateAssetValuation`          | `assets.write`, `billing.read` | `ADMIN`, `SUPER_ADMIN`, `OWNER`                            | Record formal asset appraisal and updated carrying value.                               |

---

### 3.3 Cross-Domain Resource Valuation Surface

| HTTP Method | Route Path                            | Operation Name                 | Required Permissions                            | Allowed Roles                   | Description                                           |
| :---------- | :------------------------------------ | :----------------------------- | :---------------------------------------------- | :------------------------------ | :---------------------------------------------------- |
| `GET`       | `/api/v1/resources/valuation/summary` | `GetCombinedResourceValuation` | `inventory.read`, `assets.read`, `billing.read` | `ADMIN`, `SUPER_ADMIN`, `OWNER` | Real-time derived cross-domain balance sheet summary. |

---

## 4. Request & Response Contracts

### 4.1 Consumable Inventory Contracts

#### `CreateInventoryItemRequestDto`

```typescript
export class CreateInventoryItemRequestDto {
  @ApiProperty({ description: 'Stock Keeping Unit (SKU)', example: 'PROT-WHEY-1KG' })
  @IsString()
  @MinLength(3)
  sku!: string;

  @ApiProperty({ description: 'Product title / name', example: 'Grass-Fed Whey Isolate' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ description: 'Detailed product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: InventoryCategory })
  @IsEnum(InventoryCategory)
  category!: InventoryCategory;

  @ApiProperty({ description: 'Purchase acquisition cost per unit', example: 25.5 })
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @ApiProperty({ description: 'Retail selling price per unit', example: 45.0 })
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({ description: 'Initial opening stock', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityOnHand?: number;

  @ApiPropertyOptional({ description: 'Reorder alert threshold', default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderThreshold?: number;

  @ApiPropertyOptional({ enum: UnitOfMeasure, default: UnitOfMeasure.UNITS })
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;
}
```

#### `ReceiveStockRequestDto`

```typescript
export class ReceiveStockRequestDto {
  @ApiProperty({ description: 'Quantity of units received', example: 50 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Purchase unit cost override', example: 24.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Supplier Purchase Order / Invoice #',
    example: 'PO-2026-881',
  })
  @IsOptional()
  @IsString()
  referenceNote?: string;
}
```

#### `SellStockRequestDto`

```typescript
export class SellStockRequestDto {
  @ApiProperty({ description: 'Quantity of units sold', example: 2 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({
    description: 'POS receipt or transaction reference',
    example: 'POS-REC-9941',
  })
  @IsOptional()
  @IsString()
  receiptReference?: string;
}
```

#### `ConsumeStockRequestDto`

```typescript
export class ConsumeStockRequestDto {
  @ApiProperty({ description: 'Quantity of units consumed internally', example: 5 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Department, practitioner, or session reference',
    example: 'Physio Room 3',
  })
  @IsOptional()
  @IsString()
  departmentReference?: string;

  @ApiPropertyOptional({
    description: 'Reason for consumption',
    example: 'Patient therapy treatment',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
```

#### `ScrapStockRequestDto`

```typescript
export class ScrapStockRequestDto {
  @ApiProperty({ description: 'Quantity of units to scrap / dispose', example: 3 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({
    description: 'Mandatory reason for scrapping (damaged, expired, contaminated)',
    example: 'Expired on 2026-08-01',
  })
  @IsString()
  @MinLength(5)
  reason!: string;
}
```

#### `AdjustStockRequestDto`

```typescript
export class AdjustStockRequestDto {
  @ApiProperty({ description: 'Actual physical count verified during stock audit', example: 42 })
  @IsNumber()
  @Min(0)
  physicalCount!: number;

  @ApiProperty({
    description: 'Audit reconciliation reason code',
    example: 'Q3 Physical Inventory Audit Variance',
  })
  @IsString()
  @MinLength(5)
  reason!: string;
}
```

---

### 4.2 Fixed Asset Contracts

#### `CreateFixedAssetRequestDto`

```typescript
export class CreateFixedAssetRequestDto {
  @ApiProperty({ description: 'Unique physical barcode/RFID asset tag', example: 'AST-GYM-0081' })
  @IsString()
  @MinLength(3)
  assetTag!: string;

  @ApiProperty({ description: 'Asset display name', example: 'Commercial Treadmill Pro T9' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ description: 'Asset description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssetCategory })
  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @ApiProperty({ description: 'Original acquisition purchase price in USD', example: 5400.0 })
  @IsNumber()
  @Min(0)
  purchaseValue!: number;

  @ApiPropertyOptional({ description: 'Initial fair estimated carrying value', example: 5400.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentEstimatedValue?: number;

  @ApiProperty({ description: 'Facility ID where asset is located', example: 'fac_main_01' })
  @IsString()
  facilityId!: string;

  @ApiProperty({ description: 'Room ID where asset is placed', example: 'room_cardio_02' })
  @IsString()
  roomId!: string;

  @ApiPropertyOptional({ enum: AssetCondition, default: AssetCondition.EXCELLENT })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;
}
```

#### `TransferFixedAssetLocationRequestDto`

```typescript
export class TransferFixedAssetLocationRequestDto {
  @ApiProperty({ description: 'Target facility identifier', example: 'fac_main_01' })
  @IsString()
  facilityId!: string;

  @ApiProperty({ description: 'Target room identifier', example: 'room_strength_01' })
  @IsString()
  roomId!: string;

  @ApiPropertyOptional({ description: 'Reason for relocation', example: 'Cardio floor re-layout' })
  @IsOptional()
  @IsString()
  reason?: string;
}
```

#### `ChangeFixedAssetStatusRequestDto`

```typescript
export class ChangeFixedAssetStatusRequestDto {
  @ApiProperty({ enum: AssetStatus, description: 'Target lifecycle status' })
  @IsEnum(AssetStatus)
  status!: AssetStatus;

  @ApiPropertyOptional({ description: 'Operational reason or work order reference' })
  @IsOptional()
  @IsString()
  reason?: string;
}
```

#### `UpdateFixedAssetConditionRequestDto`

```typescript
export class UpdateFixedAssetConditionRequestDto {
  @ApiProperty({ enum: AssetCondition, description: 'Updated physical condition rating' })
  @IsEnum(AssetCondition)
  condition!: AssetCondition;

  @ApiPropertyOptional({ description: 'Inspection report findings' })
  @IsOptional()
  @IsString()
  notes?: string;
}
```

#### `RecordAssetMaintenanceRequestDto`

```typescript
export class RecordAssetMaintenanceRequestDto {
  @ApiProperty({ enum: MaintenanceType, description: 'Type of maintenance performed' })
  @IsEnum(MaintenanceType)
  type!: MaintenanceType;

  @ApiProperty({
    description: 'Detailed work order description',
    example: 'Replaced motor drive belt and lubricated deck.',
  })
  @IsString()
  @MinLength(5)
  description!: string;

  @ApiProperty({ description: 'Direct service / repair cost in USD', example: 350.0 })
  @IsNumber()
  @Min(0)
  cost!: number;

  @ApiPropertyOptional({
    description: 'Technician or service vendor name',
    example: 'TechFit Repairs Inc.',
  })
  @IsOptional()
  @IsString()
  technician?: string;

  @ApiPropertyOptional({
    description: 'External work order or invoice number',
    example: 'WO-88912',
  })
  @IsOptional()
  @IsString()
  workOrderNumber?: string;
}
```

---

## 5. Category Strategy & Static Metadata Endpoints

### 5.1 Architecture Decision Summary

`InventoryCategory` and `AssetCategory` are strictly code-defined domain enums in `@kinergy-platform/core`:

- `InventoryCategory`: `HEALTHY_MEALS`, `HEALTHY_DRINKS`, `CLEANING_SUPPLIES`, `OFFICE_SUPPLIES`, `SUPPLEMENTS`, `CLINICAL_SUPPLIES`, `THERAPY_CONSUMABLES`, `RETAIL_PRODUCTS`.
- `AssetCategory`: `GYM_EQUIPMENT`, `FACILITY_FIXTURE`, `THERAPY_EQUIPMENT`, `IT_HARDWARE`, `OFFICE_FURNITURE`, `SAFETY_EQUIPMENT`.

### 5.2 Category Endpoints

To provide frontend UI filter dropdowns with localized display labels and descriptions without database overhead, two read-only endpoints are exposed:

- `GET /api/v1/resources/inventory/categories`
- `GET /api/v1/resources/assets/categories`

**Response Structure**:

```json
[
  {
    "code": "SUPPLEMENTS",
    "displayName": "Supplements & Nutrition",
    "description": "Nutritional powders, vitamins, and fitness supplements."
  },
  {
    "code": "GYM_EQUIPMENT",
    "displayName": "Gym & Training Equipment",
    "description": "Cardio machines, free weights, and strength stations."
  }
]
```

_Note_: No `POST`, `PUT`, `PATCH`, or `DELETE` routes exist for categories.

---

## 6. Valuation Endpoint Strategy

1. **Read-Only Invariant**: All valuation queries (`/inventory/valuation`, `/assets/valuation/summary`, `/assets/:id/valuation`, `/valuation/summary`) are strictly read-only and execute without database transaction locks.
2. **Precision Guarantee**: Evaluated in exact integer cents and serialized as deterministic two-decimal numbers.
3. **Cross-Domain Consistency**: `totalCombinedValueAmount` matches $\text{inventory.totalValueAmount} + \text{fixedAssets.totalCarryingValueAmount}$.

---

## 7. Deprecated & Non-Selected Alternatives

| Alternative Evaluated                                            | Rejection Rationale                                                                             |
| :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **Unrestricted `PATCH /assets/:id` with nested location/status** | Violates ADR-0099. Bypasses 5x5 state machine and audit ledgers.                                |
| **Dynamic Category CRUD (`/resources/categories`)**              | Dynamic database categories create taxonomy fragmentation and unclassified balance sheet risks. |
| **Denormalized `totalInventoryValue` column in Tenant table**    | Prone to cache-invalidation bugs and out-of-sync financial reports (ADR-0098).                  |
| **Direct Stock Overwrite in Product Update**                     | Direct stock edits destroy double-entry movement traceability.                                  |
