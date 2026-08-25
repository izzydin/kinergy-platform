# Fixed Asset Domain Model & Lifecycle Specification (Milestone 6.2)

**Status**: Approved Specification  
**Bounded Context**: `resources` (Subdomain: `fixed-assets`)  
**Deciders**: Principal Domain Architect, Lead Financial Architect, Principal Engineer  
**Date**: 2026-08-25

---

## 1. Purpose

The **Fixed Asset Domain Model** governs non-fungible capital physical equipment, clinical devices, gym machinery, furniture, electronics, and facility apparatus across Kinergy wellness and sports clinics.

Unlike consumable inventory items (which are fungible, tracked in aggregate quantity balances, and depleted through sales or treatment consumption), fixed assets are **individually identified, non-fungible physical units** that possess an operational lifecycle spanning years, incur ongoing maintenance costs, undergo location transfers between rooms and branches, and require accurate balance sheet valuation tracking.

---

## 2. Asset Domain Vocabulary

- **Fixed Asset**: An identifiable physical item of durable capital property owned or operated by Kinergy facilities.
- **Asset Category**: A code-defined classification grouping assets by operational domain (e.g. gym machinery, laser devices).
- **Asset Status**: The primary operational lifecycle state of the asset (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
- **Asset Condition**: The physical health rating of the asset (`EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`).
- **Asset Location**: A value object capturing the current physical placement (facility, branch, room, or zone).
- **Asset History Event**: An immutable, chronological audit entry capturing every meaningful operational transition.
- **Asset Maintenance Record**: An immutable record of servicing, inspection, calibration, or repair performed on the asset.
- **Purchase Value / Acquisition Cost**: The initial gross financial cost paid to acquire the asset.
- **Current Estimated Value / Book Value**: The real-time estimated economic value of the asset.

---

## 3. Fixed Asset Aggregate Root

```mermaid
classDiagram
    class FixedAsset {
        -AssetId _id
        -TenantId _tenantId
        -String _assetTag
        -String _name
        -String _description
        -AssetCategory _category
        -Date _purchaseDate
        -Money _purchaseValue
        -Money _currentEstimatedValue
        -AssetCondition _condition
        -AssetStatus _status
        -AssetLocation _location
        -String _notes
        -AssetHistoryEvent[] _historyEvents
        -AssetMaintenanceRecord[] _maintenanceRecords
        -Number _version
        -Date _createdAt
        -Date _updatedAt
        +create()
        +updateDetails()
        +transferLocation()
        +changeStatus()
        +updateCondition()
        +updateEstimatedValue()
        +recordMaintenance()
        +retire()
        +sell()
    }

    class AssetHistoryEvent {
        -AssetHistoryId _id
        -AssetId _assetId
        -AssetHistoryEventType _eventType
        -String _description
        -JSON _details
        -UserId _recordedByUserId
        -Date _recordedAt
    }

    class AssetMaintenanceRecord {
        -MaintenanceRecordId _id
        -AssetId _assetId
        -Date _serviceDate
        -String _description
        -Money _cost
        -String _performedBy
        -String _notes
        -UserId _recordedByUserId
        -Date _createdAt
    }

    class AssetLocation {
        -String _facilityId
        -String _roomId
        -String _zone
    }

    class Money {
        -Number _amount
        -String _currency
    }

    FixedAsset "1" *-- "many" AssetHistoryEvent : owns & appends
    FixedAsset "1" *-- "many" AssetMaintenanceRecord : owns & appends
    FixedAsset "1" *-- "1" AssetLocation : located at
    FixedAsset "1" *-- "2" Money : values
```

### 3.1 Aggregate Attributes

| Field Name              | Type / VO        | Multiplicity | Nullable | Business Invariant & Meaning                                       |
| :---------------------- | :--------------- | :----------: | :------: | :----------------------------------------------------------------- |
| `id`                    | `AssetId`        |      1       |    No    | Strongly typed UUID v4 unique aggregate identifier.                |
| `tenantId`              | `TenantId`       |      1       |    No    | Multi-tenant isolation partition boundary.                         |
| `assetTag`              | `String`         |      1       |    No    | Alphanumeric unique barcode/tag identifier (e.g. `AST-GYM-00123`). |
| `name`                  | `String`         |      1       |    No    | Human-readable name (2–120 characters).                            |
| `description`           | `String`         |     0..1     |   Yes    | Optional detailed equipment description ($\le 500$ characters).    |
| `category`              | `AssetCategory`  |      1       |    No    | Closed code-defined classification enum.                           |
| `purchaseDate`          | `Date`           |      1       |    No    | UTC timestamp when asset was acquired.                             |
| `purchaseValue`         | `Money`          |      1       |    No    | Fixed Scale 2 acquisition cost ($\ge 0.00$).                       |
| `currentEstimatedValue` | `Money`          |      1       |    No    | Fixed Scale 2 current valuation ($\ge 0.00$).                      |
| `condition`             | `AssetCondition` |      1       |    No    | Physical rating (`EXCELLENT` through `OUT_OF_SERVICE`).            |
| `status`                | `AssetStatus`    |      1       |    No    | Operational lifecycle state (`ACTIVE` through `SOLD`).             |
| `location`              | `AssetLocation`  |      1       |    No    | Value object representing facility, room, and zone.                |
| `notes`                 | `String`         |     0..1     |   Yes    | General administrative notes.                                      |
| `version`               | `Number`         |      1       |    No    | Integer for Optimistic Concurrency Control (OCC).                  |
| `createdAt`             | `Date`           |      1       |    No    | Immutable UTC creation timestamp.                                  |
| `updatedAt`             | `Date`           |      1       |    No    | Auto-updating UTC modification timestamp.                          |

---

## 4. Category Semantics

Fixed Assets belong to a strict, code-defined **`AssetCategory`** domain taxonomy:

```typescript
export enum AssetCategory {
  GYM_EQUIPMENT = 'GYM_EQUIPMENT',
  THERAPY_EQUIPMENT = 'THERAPY_EQUIPMENT',
  KITCHEN_EQUIPMENT = 'KITCHEN_EQUIPMENT',
  OFFICE_FURNITURE = 'OFFICE_FURNITURE',
  ELECTRONICS = 'ELECTRONICS',
  CLEANING_EQUIPMENT = 'CLEANING_EQUIPMENT',
}
```

### Category Metadata Registry

| Category Code        | Display Name       |       Maintenance Requirement       | Primary Operational Subdomain             |
| :------------------- | :----------------- | :---------------------------------: | :---------------------------------------- |
| `GYM_EQUIPMENT`      | Gym Equipment      | Periodic Safety & Cable Inspection  | Strength, Cardio, Functional Fitness      |
| `THERAPY_EQUIPMENT`  | Therapy Equipment  | Clinical Calibration & Safety Audit | Kinesiology, Physical Therapy, Ultrasound |
| `KITCHEN_EQUIPMENT`  | Kitchen Equipment  |    Hygiene & Electrical Testing     | Nutrition, Athlete Shake Bar, Cafeteria   |
| `OFFICE_FURNITURE`   | Office Furniture   |          As-Needed Repair           | Administration, Consultation Desks        |
| `ELECTRONICS`        | Electronics        |  Electrical Compliance & Firmware   | Front Desk POS, Audio Systems, Computers  |
| `CLEANING_EQUIPMENT` | Cleaning Equipment |        Mechanical Servicing         | Facility Janitorial, Floor Polishers      |

---

## 5. Status Semantics

Asset operational lifecycle is governed by the **`AssetStatus`** finite state machine:

```typescript
export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  DAMAGED = 'DAMAGED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}
```

### State Semantics

- **`ACTIVE`**: Fully operational and available for staff, clinicians, and members.
- **`UNDER_MAINTENANCE`**: Temporarily taken out of service for inspection, repair, or calibration.
- **`DAMAGED`**: Physically defective or impaired; unsafe for use until repaired.
- **`RETIRED`**: Formally decommissioned from active service; stored permanently or pending disposal.
- **`SOLD`**: Transferred to a third party for salvage or liquidation value (Terminal State).

---

## 6. Condition Semantics

Physical equipment condition is evaluated via the **`AssetCondition`** scale:

```typescript
export enum AssetCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}
```

### Condition Guidelines

- `EXCELLENT`: Like-new condition with full cosmetic and functional integrity.
- `GOOD`: Minor normal wear-and-tear; 100% operational functionality.
- `FAIR`: Noticeable cosmetic wear; fully operational but approaching service interval.
- `NEEDS_REPAIR`: Functional impairment requiring scheduled maintenance before deterioration.
- `OUT_OF_SERVICE`: Severe mechanical or electrical defect; strictly prohibited from operation.

---

## 7. Location Semantics

Asset physical placement is encapsulated in the **`AssetLocation`** Value Object:

```typescript
export class AssetLocation extends ValueObject<{
  facilityId: string;
  roomId?: string;
  zone?: string;
}> {
  get facilityId(): string;
  get roomId(): string | undefined;
  get zone(): string | undefined;
}
```

- **Immutability**: Location changes require instantiating a new `AssetLocation` and calling `asset.transferLocation(...)`.
- **Cross-Context Reference**: `facilityId` and `roomId` are scalar identifiers referencing facility and room master records without direct ORM coupling.

---

## 8. Monetary Semantics

In accordance with [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md):

1. **Scale 2 Fixed Precision**: All monetary values (`purchaseValue`, `currentEstimatedValue`, `maintenanceCost`, `saleAmount`) use the `Money` Value Object with Scale 2 fixed decimal precision (`DECIMAL(10, 2)`).
2. **Zero-Float Arithmetic**: Prevents binary floating-point drift.
3. **Non-Negative Constraints**: `purchaseValue >= 0.00` and `currentEstimatedValue >= 0.00`.
4. **Currency Invariant**: All values must share the same ISO-4217 currency (`USD`).

---

## 9. Lifecycle State Machine & Transition Rules

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : Asset Registered & Commissioned

    ACTIVE --> UNDER_MAINTENANCE : Scheduled / Unscheduled Service
    UNDER_MAINTENANCE --> ACTIVE : Service Complete & Passed

    ACTIVE --> DAMAGED : Defect Reported
    DAMAGED --> UNDER_MAINTENANCE : Sent for Repair
    UNDER_MAINTENANCE --> DAMAGED : Repair Unsuccessful

    ACTIVE --> RETIRED : Decommissioned
    UNDER_MAINTENANCE --> RETIRED : Decommissioned
    DAMAGED --> RETIRED : Decommissioned

    RETIRED --> SOLD : Salvage / Asset Sale
    ACTIVE --> SOLD : Direct Sale

    SOLD --> [*] : Terminal State (Read-Only)
```

### Transition Governance Rules

1. **Commissioning**: Asset is created in `ACTIVE` status with a valid initial location.
2. **Maintenance Dispatch**: Moving to `UNDER_MAINTENANCE` requires a non-empty reason and stamps history.
3. **Decommissioning**: Retiring an asset blocks scheduling availability and flags for removal.
4. **Terminal Liquidation (`SOLD`)**: Terminal state. Sold assets **cannot** be transferred, repaired, or reactivated.

---

## 10. History Semantics

Meaningful historical events are appended to the immutable `AssetHistoryEvent` log:

```typescript
export enum AssetHistoryEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  TRANSFERRED = 'TRANSFERRED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  CONDITION_CHANGED = 'CONDITION_CHANGED',
  VALUE_UPDATED = 'VALUE_UPDATED',
  MAINTENANCE_RECORDED = 'MAINTENANCE_RECORDED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}
```

### History Invariants

- **Append-Only Immutability**: Historical events are write-once; updates and deletions are strictly forbidden.
- **Audit Provenance**: Every event captures `recordedByUserId`, UTC `recordedAt`, `description`, and contextual `details` (e.g. prior location $\rightarrow$ new location).

---

## 11. Maintenance Semantics

Maintenance is modeled as an aggregate child entity **`AssetMaintenanceRecord`**:

```typescript
export class AssetMaintenanceRecord {
  readonly id: MaintenanceRecordId;
  readonly assetId: AssetId;
  readonly serviceDate: Date;
  readonly description: string;
  readonly cost: Money;
  readonly performedBy: string;
  readonly notes?: string;
  readonly recordedByUserId: UserId;
  readonly createdAt: Date;
}
```

- **Scope Defense**: Maintenance logs capture service date, cost, technician/vendor, and description. Full work order dispatch and technician scheduling are explicit non-goals.
- **Historical Linkage**: Recording maintenance automatically triggers an `AssetHistoryEventType.MAINTENANCE_RECORDED` event on the parent aggregate.

---

## 12. Business Invariants

| Code             | Invariant Name                       | Enforcing Rule                                                                |
| :--------------- | :----------------------------------- | :---------------------------------------------------------------------------- |
| **[AST-INV-1]**  | **Terminal Sold Immutability**       | Assets in `SOLD` status cannot be transferred, repaired, or updated.          |
| **[AST-INV-2]**  | **Retired Transfer Restriction**     | Assets in `RETIRED` status cannot undergo location transfers.                 |
| **[AST-INV-3]**  | **Audited Location Transfer**        | Every location transfer MUST append an immutable `TRANSFERRED` history event. |
| **[AST-INV-4]**  | **Audited Status Transition**        | Every status transition MUST append a `STATUS_CHANGED` history event.         |
| **[AST-INV-5]**  | **Audited Condition Transition**     | Every condition change MUST append a `CONDITION_CHANGED` history event.       |
| **[AST-INV-6]**  | **Maintenance Audit Linkage**        | Every maintenance record MUST append a `MAINTENANCE_RECORDED` history event.  |
| **[AST-INV-7]**  | **Non-Negative Acquisition Value**   | `purchaseValue.amount >= 0.00`.                                               |
| **[AST-INV-8]**  | **Non-Negative Estimated Valuation** | `currentEstimatedValue.amount >= 0.00`.                                       |
| **[AST-INV-9]**  | **Unique Asset Tag per Tenant**      | `assetTag` must be unique across all active assets within a tenant.           |
| **[AST-INV-10]** | **Optimistic Concurrency Control**   | Aggregate root increments integer `version` upon every mutation.              |

---

## 13. Aggregate Boundaries & Clean Architecture Isolation

```
packages/core/src/resources/
├── domain/
│   ├── inventory/                   <-- Completely Segregated
│   │   └── ...
│   ├── assets/                      <-- Fixed Asset Subdomain
│   │   ├── fixed-asset.aggregate.ts
│   │   ├── asset-history-event.entity.ts
│   │   ├── asset-maintenance-record.entity.ts
│   │   ├── enums/
│   │   │   ├── asset-category.enum.ts
│   │   │   ├── asset-status.enum.ts
│   │   │   ├── asset-condition.enum.ts
│   │   │   └── asset-history-event-type.enum.ts
│   │   ├── value-objects/
│   │   │   ├── asset-id.vo.ts
│   │   │   ├── maintenance-record-id.vo.ts
│   │   │   ├── asset-history-id.vo.ts
│   │   │   └── asset-location.vo.ts
│   │   ├── events/
│   │   │   ├── asset-created.event.ts
│   │   │   ├── asset-transferred.event.ts
│   │   │   ├── asset-status-changed.event.ts
│   │   │   ├── asset-maintenance-recorded.event.ts
│   │   │   └── asset-sold.event.ts
│   │   ├── exceptions/
│   │   │   ├── invalid-asset-state.exception.ts
│   │   │   └── asset-not-found.exception.ts
│   │   └── repositories/
│   │       └── fixed-asset.repository.interface.ts
│   └── shared/                      <-- Shared Value Objects (Money, TenantId, UserId)
```

---

## 14. Persistence Principles

1. **Table Isolation**: Fixed assets are persisted to `fixed_assets`, `asset_history_events`, and `asset_maintenance_records`. No shared tables with inventory.
2. **Transaction Atomicity**: Updating an asset and appending child history/maintenance records executes inside an atomic `prisma.$transaction`.
3. **Database Constraints**: Engine-level `CHECK (purchase_value >= 0)` and `CHECK (current_estimated_value >= 0)`.

---

## 15. Explicit Non-Goals

- ❌ **No CRUD REST Endpoints**: API controllers and routes belong to Phase 6.3.
- ❌ **No Frontend UI**: React screens, DataTables, and forms belong to Phase 6.3.
- ❌ **No CMMS Work Order Dispatch**: Automated technician dispatching and parts inventory allocation are out of scope.
- ❌ **No Generic Resource Model**: Zero class inheritance or polymorphic database tables shared between inventory and assets.

---

## 16. Open Questions & Resolutions

- **Q1: Should assetTag be mandatory or optional?**  
  _Resolution_: Mandatory string (e.g., `AST-00123`). Every physical asset requires an authoritative tag/barcode for audit compliance.
- **Q2: Does changing estimated value trigger a general ledger accounting journal?**  
  _Resolution_: No. Kinergy computes valuations on-demand. Accounting journal posting is handled via downstream financial exports.
