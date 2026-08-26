# Fixed Asset Maintenance Record Specification

- **Module**: `packages/core/src/resources/domain/assets`
- **Specification Status**: **APPROVED & ACTIVE**
- **Governing ADRs**: [ADR-0086: Fixed Asset Maintenance History & Service Tracking Model](./adr/0086-fixed-asset-maintenance-history-and-service-tracking-model.md), [ADR-0089: Inventory Monetary, Quantity, and Unit Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
- **Entity Implementation**: [`AssetMaintenanceRecord`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/assets/entities/asset-maintenance-record.entity.ts)

---

## 1. Purpose & Scope Boundary

The Maintenance Record model provides an immutable, audit-compliant ledger of maintenance, inspections, repairs, and calibration services performed on non-fungible capital equipment.

It is **deliberately scoped as a lightweight historical record** within the `resources` bounded context, capturing completed servicing events without the architectural bloat of a full Computerized Maintenance Management System (CMMS).

---

## 2. Entity Model & Data Contracts

```typescript
export class AssetMaintenanceRecord {
  readonly id: MaintenanceRecordId;
  readonly assetId: AssetId;
  readonly serviceDate: Date;
  readonly description: string;
  readonly cost: Money;
  readonly performedBy: string;
  readonly notes?: string;
  readonly recordedByUserId: string;
  readonly createdAt: Date;
}
```

### Field Semantics

| Field Name         | Type                  | Nullable | Business Semantics & Invariants                                                                |
| :----------------- | :-------------------- | :------: | :--------------------------------------------------------------------------------------------- |
| `id`               | `MaintenanceRecordId` |    No    | Strongly typed UUID v4 entity identifier.                                                      |
| `assetId`          | `AssetId`             |    No    | Reference to the parent `FixedAsset` aggregate root.                                           |
| `serviceDate`      | `Date`                |    No    | Point-in-time timestamp when the maintenance work took place.                                  |
| `description`      | `String`              |    No    | Clear summary of work performed (3–500 characters).                                            |
| `cost`             | `Money`               |    No    | Fixed Scale 2 monetary expense ($\ge 0.00$ USD). Zero-cost labor uses `Money.zero()`.          |
| `performedBy`      | `String`              |    No    | Free-text technician, vendor, or contractor identifier (2–120 characters).                     |
| `notes`            | `String`              |   Yes    | Optional technician notes, warranty coverage details, or observations ($\le 1000$ characters). |
| `recordedByUserId` | `String`              |    No    | Authenticated Kinergy staff member who logged the record into the system.                      |
| `createdAt`        | `Date`                |    No    | Immutable UTC timestamp when the record was persisted.                                         |

---

## 3. Allowed Asset States Matrix

| Asset Status            | Maintenance Recording Allowed? | Business Rationale & State Interaction                                                                                                                                                |
| :---------------------- | :----------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`ACTIVE`**            |            **YES**             | Routine preventive maintenance, filter cleaning, safety audit, or minor tuning performed on operational equipment without taking it offline. Status remains `ACTIVE`.                 |
| **`UNDER_MAINTENANCE`** |            **YES**             | Servicing completed for offline equipment. Upon successful recording, if resulting condition is serviceable (`EXCELLENT`, `GOOD`, `FAIR`), status automatically restores to `ACTIVE`. |
| **`DAMAGED`**           |            **YES**             | Corrective repair executed. If post-service condition is serviceable, status automatically transitions to `ACTIVE`.                                                                   |
| **`RETIRED`**           |             **NO**             | **PROHIBITED (`[AST-INV-6]`)**. Decommissioned assets are no longer in service and cannot incur maintenance expenditures.                                                             |
| **`SOLD`**              |             **NO**             | **PROHIBITED (`[AST-INV-1]`)**. Sold assets are in an absolute terminal sink state; legal ownership is outside the organization.                                                      |

---

## 4. Monetary Semantics

In accordance with [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md):

- **Fixed Precision**: Stored as exact Scale 2 decimal (`DECIMAL(10, 2)`). Zero floating-point arithmetic.
- **Non-Negative**: `cost.amount >= 0.00`.
- **Zero-Cost Servicing**: In-house labor without direct parts expense is logged as `$0.00` (`Money.create(0)`).
- **Currency Invariant**: Currency must match asset valuation currency (`USD`).

---

## 5. History & Domain Event Integration

Recording maintenance is an **atomic aggregate operation**:

1. **Child Entity Creation**: Instantiates an immutable `AssetMaintenanceRecord`.
2. **Condition Adjustment**: If `updateConditionTo` is specified, updates `asset.condition`.
3. **Status Restoration**: If status was `UNDER_MAINTENANCE` or `DAMAGED` and condition is serviceable, sets status to `ACTIVE`.
4. **History Entry**: Appends an `AssetHistoryEvent` with type `MAINTENANCE_RECORDED`.
5. **Domain Event**: Emits an `AssetMaintenanceRecordedDomainEvent`.

---

## 6. Explicit Non-Goals (CMMS Exclusions)

To maintain domain boundary integrity, the following features are **explicitly excluded** from Phase 6.2:

- **Work Order Management**: No pending, in-progress, or rejected work order state machines.
- **Preventive Maintenance Engines**: No automated cron triggers or recurring calendar scheduling.
- **Technician Shift Scheduling**: No staff roster integration (belongs to HR/scheduling).
- **Spare Parts Inventory Coupling**: No automatic consumable stock depletion on repair (addressed via standard Consumable Inventory usage in Phase 6.3).
