# Fixed Asset Application Use Cases & Operation Contracts

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets (Capital Equipment)`  
**Milestone**: Phase 6.6 — Application Layer Contracts  
**Architectural Role**: Principal Application Architect  
**Status**: `APPROVED CONTRACTS`  
**Date**: August 29, 2026

---

## 1. Application Dependency Architecture

```mermaid
graph TD
    subgraph Presentation / API Layer
        REST[REST Controllers / GraphQL]
    end

    subgraph Application Layer (Contracts & Handlers)
        CMD[Commands & Handlers]
        QRY[Queries & Handlers]
        DTO[Application DTOs & Mappers]
        EVT_PORT[ResourcesEventPublisherPort]
    end

    subgraph Domain Layer
        AGG[FixedAsset Aggregate Root]
        SM[AssetLifecycleStateMachine]
        ENT[AssetHistoryEvent / MaintenanceRecord]
        VO[AssetId / AssetLocation / Money]
        REPO_IF[FixedAssetRepositoryInterface]
    end

    subgraph Infrastructure / Persistence
        REPO_IMPL[PrismaFixedAssetRepository]
        PRISMA[PrismaClient / PostgreSQL]
        EVENT_BUS[Event Bus / Outbox]
    end

    REST --> CMD
    REST --> QRY
    CMD --> DTO
    QRY --> DTO
    CMD --> AGG
    CMD --> REPO_IF
    CMD --> EVT_PORT
    QRY --> REPO_IF
    AGG --> SM
    AGG --> ENT
    AGG --> VO
    REPO_IF <|.. REPO_IMPL
    REPO_IMPL --> PRISMA
    EVT_PORT <|.. EVENT_BUS
```

---

## 2. Update Boundary & Field Governance Matrix

To prevent invariant bypasses, generic `UpdateAsset` is strictly restricted to descriptive attributes. Fields that represent physical placement, state transitions, condition ratings, servicing, or economic valuation **must** execute through dedicated business operations.

| Field                       | Governed By Operation                             | UpdateAsset Permitted? | Invariant / Reason                                                 |
| --------------------------- | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| **`assetTag`**              | `CreateFixedAsset`                                | ❌ **FORBIDDEN**       | Immutable unique identifier across physical asset lifecycle.       |
| **`category`**              | `CreateFixedAsset`                                | ❌ **FORBIDDEN**       | Tax and physical classification immutable once commissioned.       |
| **`purchaseDate`**          | `CreateFixedAsset`                                | ❌ **FORBIDDEN**       | Historical financial provenance immutable.                         |
| **`purchaseValue`**         | `CreateFixedAsset`                                | ❌ **FORBIDDEN**       | Historical capital expenditure invoice cost immutable.             |
| **`name`**                  | `UpdateFixedAssetDetails`                         | ✅ **ALLOWED**         | Operational title (2–120 chars); records history if changed.       |
| **`description`**           | `UpdateFixedAssetDetails`                         | ✅ **ALLOWED**         | Descriptive details; records history if changed.                   |
| **`notes`**                 | `UpdateFixedAssetDetails`                         | ✅ **ALLOWED**         | Internal notes; records history if changed.                        |
| **`location`**              | `TransferFixedAssetLocation`                      | ❌ **FORBIDDEN**       | Physical transfer requires provenance audit trail (`TRANSFERRED`). |
| **`status`**                | `ChangeFixedAssetStatus` / `Retire` / `Sell`      | ❌ **FORBIDDEN**       | Governed by `AssetLifecycleStateMachine` and terminal locks.       |
| **`condition`**             | `UpdateFixedAssetCondition` / `RecordMaintenance` | ❌ **FORBIDDEN**       | Requires condition rating validation and audit history.            |
| **`currentEstimatedValue`** | `UpdateFixedAssetValuation` / `Sell`              | ❌ **FORBIDDEN**       | Revaluation requires business justification and audit event.       |

---

## 3. Detailed Use Case Contracts

### 3.1 Core Asset Operations

---

#### Use Case 1: `CreateFixedAsset`

1. **Purpose**: Register and commission a newly acquired physical capital asset into the facility catalog.
2. **Actor**: Facility Manager, Clinical Director, Equipment Administrator.
3. **Required Authorization**: `resources:asset:create`.
4. **Input (`CreateFixedAssetInput`)**:
   ```typescript
   export interface CreateFixedAssetInput {
     tenantId?: string;
     assetTag: string; // e.g. "AST-GYM-001" (3-32 alphanumeric characters)
     name: string; // 2-120 characters
     description?: string;
     category: AssetCategory; // GYM_MACHINERY, CLINICAL_EQUIPMENT, REHAB_DEVICE, FACILITY_FIXTURE, IT_HARDWARE
     purchaseDate: Date; // ISO string / Date object (past or today)
     purchaseValue: { amount: number; currency: string };
     currentEstimatedValue?: { amount: number; currency: string };
     condition?: AssetCondition; // Default: EXCELLENT
     status?: AssetStatus; // Default: ACTIVE (Allowed: ACTIVE, UNDER_MAINTENANCE, DAMAGED)
     location: {
       facilityId: string;
       roomId?: string;
       building?: string;
       floor?: string;
       zone?: string;
     };
     notes?: string;
     actorId: string;
   }
   ```
5. **Input Validation**:
   - `assetTag`: Non-empty, matches `/^[A-Z0-9_-]{3,32}$/i`.
   - `name`: 2–120 characters.
   - `category`: Valid `AssetCategory` enum member.
   - `purchaseValue.amount`: Decimal $\ge 0.00$.
   - `purchaseDate`: Valid date not in the future.
   - `location.facilityId`: Non-empty string.
   - `status`: Must be one of `VALID_INITIAL_STATUSES` (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`). `RETIRED` or `SOLD` is prohibited.
6. **Required Existing State**: No existing fixed asset with the same `assetTag` in the same `tenantId`.
7. **Business Invariants**: [AST-INV-1], [AST-INV-2], [AST-INV-7]. Initial estimated value defaults to `purchaseValue` if omitted.
8. **Lifecycle Restrictions**: New assets cannot be created in terminal or decommissioned states (`SOLD`, `RETIRED`).
9. **Transaction Requirement**: Single aggregate commit with initial `AssetHistoryEvent` (`CREATED`).
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.CREATED` containing full registration snapshot.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**:
    - `AssetTagDuplicateException` -> 409 Conflict.
    - `InvalidAssetStateException` -> 400 Bad Request.
    - `UnauthorizedException` -> 403 Forbidden.
14. **Side Effects**: Emits `AssetCreatedDomainEvent`.

---

#### Use Case 2: `UpdateFixedAssetDetails`

1. **Purpose**: Modify non-lifecycle descriptive metadata (`name`, `description`, `notes`).
2. **Actor**: Facility Staff, Inventory Admin.
3. **Required Authorization**: `resources:asset:update`.
4. **Input (`UpdateFixedAssetDetailsInput`)**:
   ```typescript
   export interface UpdateFixedAssetDetailsInput {
     id: string; // AssetId
     tenantId?: string;
     name?: string;
     description?: string;
     notes?: string;
     reason?: string;
     actorId: string;
   }
   ```
5. **Input Validation**:
   - `id`: Non-empty string.
   - `name` (if provided): 2–120 characters.
   - At least one field (`name`, `description`, `notes`) must be provided.
6. **Required Existing State**: Asset exists and matches `tenantId`.
7. **Business Invariants**: [AST-INV-1] Cannot update details of an asset in terminal status `SOLD`.
8. **Lifecycle Restrictions**: Allowed in `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, and `RETIRED`. Blocked in `SOLD`.
9. **Transaction Requirement**: OCC versioned transaction (`WHERE version = priorVersion`).
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.UPDATED` created **only** if at least one field changed (no-op updates generate zero history entries).
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**:
    - `AssetNotFoundException` -> 404 Not Found.
    - `InvalidAssetStateException` (Terminal state violation) -> 400 Bad Request.
    - `OptimisticLockException` -> 409 Conflict.
14. **Side Effects**: Touches aggregate `version` and `updatedAt`.

---

#### Use Case 3: `GetFixedAssetById` & `GetFixedAssetByTag`

1. **Purpose**: Retrieve the full representation of a single fixed asset, including recent history and maintenance records.
2. **Actor**: Authenticated User with Resource Read permissions.
3. **Required Authorization**: `resources:asset:read`.
4. **Input**:
   - `GetFixedAssetByIdQuery`: `{ id: string; tenantId?: string }`
   - `GetFixedAssetByTagQuery`: `{ assetTag: string; tenantId?: string }`
5. **Input Validation**: `id` or `assetTag` must be a non-empty string.
6. **Required Existing State**: Asset exists.
7. **Business Invariants**: Multi-tenant isolation (`tenantId` boundary).
8. **Lifecycle Restrictions**: Available for all lifecycle statuses (including `RETIRED` and `SOLD`).
9. **Transaction Requirement**: None (Read-only query).
10. **Persistence Operations**: `FixedAssetRepositoryInterface.findById(id)` or `findByAssetTag(assetTag)`.
11. **Required History Creation**: None.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**: `AssetNotFoundException` -> 404 Not Found.
14. **Side Effects**: None.

---

#### Use Case 4: `ListFixedAssets`

1. **Purpose**: Search and filter fixed assets across facilities, categories, conditions, and lifecycle statuses with deterministic pagination.
2. **Actor**: Authenticated User.
3. **Required Authorization**: `resources:asset:read`.
4. **Input (`ListFixedAssetsInput`)**:
   ```typescript
   export interface ListFixedAssetsInput {
     tenantId?: string;
     category?: AssetCategory;
     status?: AssetStatus;
     condition?: AssetCondition;
     facilityId?: string;
     roomId?: string;
     search?: string; // Substring match against name, assetTag, description
     sortBy?:
       | 'name'
       | 'assetTag'
       | 'category'
       | 'purchaseDate'
       | 'purchaseValue'
       | 'currentEstimatedValue'
       | 'status'
       | 'condition'
       | 'createdAt'
       | 'updatedAt';
     sortOrder?: 'asc' | 'desc'; // Default: 'asc'
     page?: number; // Default: 1
     pageSize?: number; // Default: 20, Max: 100
   }
   ```
5. **Input Validation**: Whitelist validation on `sortBy`, `sortOrder`, `page >= 1`, `1 <= pageSize <= 100`.
6. **Required Existing State**: None.
7. **Business Invariants**: Multi-tenant isolation.
8. **Lifecycle Restrictions**: None.
9. **Transaction Requirement**: None (Read-only query).
10. **Persistence Operations**: `FixedAssetRepositoryInterface.findAll(filter)` and `count(filter)`.
11. **Required History Creation**: None.
12. **Result**: `ApplicationResult<PaginatedResult<FixedAssetDTO>, string>`.
13. **Expected Failures**: Invalid filter parameters -> 400 Bad Request.
14. **Side Effects**: None.

---

### 3.2 Physical Location & Lifecycle Workflows

---

#### Use Case 5: `TransferFixedAssetLocation`

1. **Purpose**: Transfer physical location of equipment between rooms, facilities, buildings, or zones.
2. **Actor**: Facility Coordinator, Operations Manager.
3. **Required Authorization**: `resources:asset:transfer`.
4. **Input (`TransferFixedAssetLocationInput`)**:
   ```typescript
   export interface TransferFixedAssetLocationInput {
     id: string;
     tenantId?: string;
     location: {
       facilityId: string;
       roomId?: string;
       building?: string;
       floor?: string;
       zone?: string;
     };
     reason?: string;
     actorId: string;
   }
   ```
5. **Input Validation**: `id` non-empty; `location.facilityId` non-empty; `actorId` mandatory.
6. **Required Existing State**: Asset exists in non-terminal and non-decommissioned status.
7. **Business Invariants**: [AST-INV-1], [AST-INV-2], [AST-INV-3]. Cannot transfer decommissioned (`RETIRED`) or sold (`SOLD`) assets.
8. **Lifecycle Restrictions**: Allowed in `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`. Prohibited in `RETIRED` and `SOLD`.
9. **Transaction Requirement**: Atomic OCC transaction appending `AssetHistoryEvent`.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.TRANSFERRED` capturing `priorLocation`, `newLocation`, and `reason`.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**:
    - `AssetNotFoundException` -> 404.
    - `InvalidAssetStateException` -> 400.
    - `OptimisticLockException` -> 409.
14. **Side Effects**: Emits `AssetTransferredDomainEvent`.

---

#### Use Case 6: `ChangeFixedAssetStatus`

1. **Purpose**: Transition operational lifecycle state (e.g. `ACTIVE` $\leftrightarrow$ `UNDER_MAINTENANCE` $\leftrightarrow$ `DAMAGED`).
2. **Actor**: Maintenance Tech, Facility Director, Clinician.
3. **Required Authorization**: `resources:asset:status`.
4. **Input (`ChangeFixedAssetStatusInput`)**:
   ```typescript
   export interface ChangeFixedAssetStatusInput {
     id: string;
     tenantId?: string;
     status: AssetStatus; // TARGET STATUS
     reason: string; // Mandatory (min 3 characters)
     actorId: string;
   }
   ```
5. **Input Validation**: `reason` $\ge 3$ characters; `status` is a valid `AssetStatus` enum value. Direct transition to `SOLD` via this use case is prohibited (must use `SellFixedAsset`).
6. **Required Existing State**: Asset exists; transition allowed by `AssetLifecycleStateMachine`.
7. **Business Invariants**: [AST-INV-1], [AST-INV-4], [AST-INV-5]. Cannot restore to `ACTIVE` if condition is `OUT_OF_SERVICE`. Cannot transition out of `SOLD`.
8. **Lifecycle Restrictions**: Evaluated against the transition graph in `AssetLifecycleStateMachine`.
9. **Transaction Requirement**: Atomic OCC transaction with `AssetHistoryEvent`.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.STATUS_CHANGED` with `priorStatus`, `newStatus`, and mandatory `reason`.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**:
    - Illegal transition path -> `InvalidAssetStateException` (400).
    - Missing reason -> 400.
14. **Side Effects**: Emits `AssetStatusChangedDomainEvent`.

---

#### Use Case 7: `RetireFixedAsset`

1. **Purpose**: Decommission asset permanently from active operational service (due to wear, obsolescence, or total loss).
2. **Actor**: Facility Director, Finance Admin.
3. **Required Authorization**: `resources:asset:retire`.
4. **Input (`RetireFixedAssetInput`)**:
   ```typescript
   export interface RetireFixedAssetInput {
     id: string;
     tenantId?: string;
     reason: string; // Mandatory (min 3 characters)
     actorId: string;
   }
   ```
5. **Input Validation**: `id` non-empty; `reason` $\ge 3$ characters; `actorId` mandatory.
6. **Required Existing State**: Asset exists in non-sold state.
7. **Business Invariants**: [AST-INV-1]. Retired assets cannot be transferred, repaired, or returned to `ACTIVE`. They can only be liquidated via `SellFixedAsset`.
8. **Lifecycle Restrictions**: Allowed from `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`. Prohibited from `SOLD`.
9. **Transaction Requirement**: Atomic OCC transaction.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.RETIRED`.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**: `InvalidAssetStateException` -> 400.
14. **Side Effects**: Emits `AssetRetiredDomainEvent`.

---

#### Use Case 8: `SellFixedAsset`

1. **Purpose**: Liquidate and permanently sell equipment for scrap, salvage, or third-party resale proceeds (Terminal State).
2. **Actor**: Executive Director, Finance Admin.
3. **Required Authorization**: `resources:asset:sell`.
4. **Input (`SellFixedAssetInput`)**:
   ```typescript
   export interface SellFixedAssetInput {
     id: string;
     tenantId?: string;
     saleAmount: { amount: number; currency: string };
     reason: string; // Mandatory (min 3 characters)
     actorId: string;
   }
   ```
5. **Input Validation**: `saleAmount.amount >= 0.00`; `reason` $\ge 3$ characters; `actorId` mandatory.
6. **Required Existing State**: Asset exists and is not already `SOLD`.
7. **Business Invariants**: [AST-INV-1] Permanent terminal lock. Replaces `currentEstimatedValue` with realized `saleAmount`.
8. **Lifecycle Restrictions**: Allowed from any status except `SOLD`.
9. **Transaction Requirement**: Atomic OCC transaction.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.SOLD` containing `saleAmount`, `priorStatus`, and `reason`.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**: Terminal state violation -> 400 Bad Request.
14. **Side Effects**: Emits `AssetSoldDomainEvent`.

---

### 3.3 Condition, Maintenance, and Valuation Workflows

---

#### Use Case 9: `UpdateFixedAssetCondition`

1. **Purpose**: Record routine condition assessment (e.g. quarterly safety audit rating change).
2. **Actor**: Maintenance Tech, Facility Inspector.
3. **Required Authorization**: `resources:asset:condition`.
4. **Input (`UpdateFixedAssetConditionInput`)**:
   ```typescript
   export interface UpdateFixedAssetConditionInput {
     id: string;
     tenantId?: string;
     condition: AssetCondition; // EXCELLENT, GOOD, FAIR, POOR, NEEDS_REPAIR, OUT_OF_SERVICE
     reason?: string;
     actorId: string;
   }
   ```
5. **Input Validation**: `condition` is a valid `AssetCondition` enum member; `actorId` mandatory.
6. **Required Existing State**: Asset exists in non-terminal, non-retired status.
7. **Business Invariants**: [AST-INV-1], [AST-INV-5]. Prohibited on `SOLD` or `RETIRED` assets.
8. **Lifecycle Restrictions**: Allowed in `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`.
9. **Transaction Requirement**: Atomic OCC transaction.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.CONDITION_CHANGED` (no-op updates generate zero history).
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**: `InvalidAssetStateException` -> 400.
14. **Side Effects**: Emits `AssetConditionChangedDomainEvent`.

---

#### Use Case 10: `RecordAssetMaintenance`

1. **Purpose**: Log equipment servicing, repairs, calibration, or routine inspection, append a structured maintenance record, and optionally update condition or restore operational status.
2. **Actor**: Certified Technician, Maintenance Lead, Contractor.
3. **Required Authorization**: `resources:asset:maintenance`.
4. **Input (`RecordAssetMaintenanceInput`)**:
   ```typescript
   export interface RecordAssetMaintenanceInput {
     assetId: string;
     tenantId?: string;
     serviceDate: Date; // Past or today
     description: string; // 3-500 characters
     cost: { amount: number; currency: string }; // >= 0.00
     performedBy: string; // 2-120 characters (technician name or service company)
     notes?: string;
     updateConditionTo?: AssetCondition; // Optional condition update
     actorId: string;
   }
   ```
5. **Input Validation**: `cost.amount >= 0.00`; `description` $\ge 3$ characters; `performedBy` $\ge 2$ characters.
6. **Required Existing State**: Asset exists in serviceable status (not `SOLD` or `RETIRED`).
7. **Business Invariants**: [AST-INV-1], [AST-INV-6]. If asset was `UNDER_MAINTENANCE` or `DAMAGED`, and the new condition is serviceable (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`), aggregate automatically restores status to `ACTIVE`.
8. **Lifecycle Restrictions**: Prohibited on `SOLD` or `RETIRED` assets.
9. **Transaction Requirement**: Atomic transaction inserting `AssetMaintenanceRecord`, appending `AssetHistoryEvent`, and updating aggregate version.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.MAINTENANCE_RECORDED`.
12. **Result**: `ApplicationResult<AssetMaintenanceRecordResultDTO, string>`.
13. **Expected Failures**: `InvalidAssetStateException` -> 400.
14. **Side Effects**: Emits `AssetMaintenanceRecordedDomainEvent`.

---

#### Use Case 11: `UpdateFixedAssetValuation`

1. **Purpose**: Revalue estimated book value following accounting depreciation, appraisal, or physical damage.
2. **Actor**: Finance Manager, Asset Accountant.
3. **Required Authorization**: `resources:asset:revalue`.
4. **Input (`UpdateFixedAssetValuationInput`)**:
   ```typescript
   export interface UpdateFixedAssetValuationInput {
     id: string;
     tenantId?: string;
     estimatedValue: { amount: number; currency: string };
     reason?: string;
     actorId: string;
   }
   ```
5. **Input Validation**: `estimatedValue.amount >= 0.00`; `actorId` mandatory.
6. **Required Existing State**: Asset exists in non-sold status.
7. **Business Invariants**: [AST-INV-1], [AST-INV-8]. Sold assets cannot be revalued.
8. **Lifecycle Restrictions**: Allowed in `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`. Prohibited in `SOLD`.
9. **Transaction Requirement**: Atomic OCC transaction.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.save(asset)`.
11. **Required History Creation**: `AssetHistoryEventType.VALUE_UPDATED`.
12. **Result**: `ApplicationResult<FixedAssetDTO, string>`.
13. **Expected Failures**: `InvalidAssetStateException` -> 400.
14. **Side Effects**: Emits `AssetValuationUpdatedDomainEvent`.

---

#### Use Case 12: `GetFixedAssetsValuation`

1. **Purpose**: Compute total portfolio acquisition cost, total current estimated book value, and category breakdown.
2. **Actor**: Executive, Finance Admin, Facility Director.
3. **Required Authorization**: `resources:asset:valuation`.
4. **Input (`GetFixedAssetsValuationInput`)**:
   ```typescript
   export interface GetFixedAssetsValuationInput {
     tenantId?: string;
     includeRetired?: boolean; // Default: false
   }
   ```
5. **Input Validation**: Boolean flag validation.
6. **Required Existing State**: None.
7. **Business Invariants**: Monetary precision calculated in Scale 2 fixed integer cents (`Math.round(val * 100)`), avoiding IEEE-754 floating-point drift.
8. **Lifecycle Restrictions**: `SOLD` assets are excluded from active book value totals; `RETIRED` assets are excluded unless `includeRetired: true`.
9. **Transaction Requirement**: Read-only query.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.findAll(filter)`.
11. **Required History Creation**: None.
12. **Result**: `ApplicationResult<FixedAssetsValuationDTO, string>`.
13. **Expected Failures**: None.
14. **Side Effects**: None.

---

### 3.4 History & Audit Queries

---

#### Use Case 13: `GetFixedAssetHistory`

1. **Purpose**: Retrieve the chronologically ordered immutable audit trail for a specific fixed asset.
2. **Actor**: Compliance Officer, Facility Auditor, Administrator.
3. **Required Authorization**: `resources:asset:history`.
4. **Input (`GetFixedAssetHistoryInput`)**:
   ```typescript
   export interface GetFixedAssetHistoryInput {
     assetId: string;
     tenantId?: string;
   }
   ```
5. **Input Validation**: `assetId` non-empty string.
6. **Required Existing State**: Asset exists.
7. **Business Invariants**: Full provenance visibility across all past lifecycle transitions.
8. **Lifecycle Restrictions**: Accessible for all asset states (including `RETIRED` and `SOLD`).
9. **Transaction Requirement**: Read-only query.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.findById(id)` -> maps `asset.historyEvents`.
11. **Required History Creation**: None.
12. **Result**: `ApplicationResult<AssetHistoryEventDTO[], string>`.
13. **Expected Failures**: `AssetNotFoundException` -> 404.
14. **Side Effects**: None.

---

#### Use Case 14: `GetFixedAssetMaintenanceHistory`

1. **Purpose**: Retrieve the servicing and repair log for an asset.
2. **Actor**: Maintenance Tech, Facility Director.
3. **Required Authorization**: `resources:asset:read`.
4. **Input (`GetFixedAssetMaintenanceHistoryInput`)**:
   ```typescript
   export interface GetFixedAssetMaintenanceHistoryInput {
     assetId: string;
     tenantId?: string;
   }
   ```
5. **Input Validation**: `assetId` non-empty string.
6. **Required Existing State**: Asset exists.
7. **Business Invariants**: Multi-tenant isolation.
8. **Lifecycle Restrictions**: Accessible for all asset states.
9. **Transaction Requirement**: Read-only query.
10. **Persistence Operations**: `FixedAssetRepositoryInterface.findById(id)` -> maps `asset.maintenanceRecords`.
11. **Required History Creation**: None.
12. **Result**: `ApplicationResult<AssetMaintenanceRecordDTO[], string>`.
13. **Expected Failures**: `AssetNotFoundException` -> 404.
14. **Side Effects**: None.
