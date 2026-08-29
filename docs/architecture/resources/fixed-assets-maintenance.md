# Fixed Assets Maintenance Traceability & Servicing Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets (Capital Equipment)`  
**Milestone**: Phase 6.6 — Fixed Asset Application Layer  
**Document**: Authoritative Architectural Specification for Fixed Asset Maintenance Traceability  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 29, 2026

---

## 1. Executive Summary & Maintenance Contract

Equipment servicing, calibration, preventive maintenance, and mechanical repairs are captured as first-class, immutable business events.

The maintenance operation is invoked via [`RecordAssetMaintenanceHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/handlers/record-asset-maintenance.handler.ts) executing the [`RecordAssetMaintenanceCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/commands/record-asset-maintenance.command.ts).

```typescript
export interface RecordAssetMaintenanceInput {
  assetId: string; // Target FixedAsset UUID
  tenantId?: string; // Tenant isolation boundary
  serviceDate: Date | string; // Date servicing was performed
  description: string; // Detailed description of service/repairs (>= 3 chars)
  cost: {
    amount: number; // Servicing cost amount (>= 0.00)
    currency?: string; // ISO-4217 currency (defaults to asset currency)
  };
  performedBy: string; // Technician, specialist contractor, or OEM service team
  updateConditionTo?: AssetCondition; // Optional condition upgrade post-service
  notes?: string; // Optional technical observations or warranty details
  actorId: string; // Authenticated actor executing the command
}
```

---

## 2. Lifecycle Restrictions

| Asset Operational Status | Maintenance Permitted? | Business & Accounting Rationale                                                           | Invariant Rule |
| ------------------------ | :--------------------: | ----------------------------------------------------------------------------------------- | :------------: |
| `ACTIVE`                 |        **YES**         | Routine preventive maintenance, filter changes, and calibration during active deployment. | `[AST-INV-6]`  |
| `UNDER_MAINTENANCE`      |        **YES**         | Workshop repairs, corrective maintenance, part replacements, and recertification.         | `[AST-INV-6]`  |
| `DAMAGED`                |        **YES**         | Emergency triage, structural repair, and safety restorations.                             | `[AST-INV-6]`  |
| `RETIRED`                |         **NO**         | Prohibited. Decommissioned assets cannot incur new capital or maintenance expenses.       | `[AST-INV-1]`  |
| `SOLD`                   |         **NO**         | Prohibited. Permanently liquidated property is outside company custody and balance sheet. | `[AST-INV-1]`  |

---

## 3. Financial Cost Rules & Decimal Precision

1. **Non-Negative Cost Invariant**: Maintenance cost amount must be $\ge 0.00$.
2. **Zero-Cost Servicing**: `$0.00` cost is explicitly supported for manufacturer warranty service, in-house inspections, and complimentary vendor calibrations.
3. **Monetary Precision**: Handled via the [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/inventory/value-objects/money.vo.ts) Value Object, rounding to 2 fixed decimal places (`Math.round(amount * 100) / 100`) and verifying 3-letter ISO-4217 codes. JavaScript floating-point errors are eliminated.

---

## 4. Performed-By & Actor Provenance

To guarantee full audit traceability, every maintenance record captures two distinct provenance identities:

- **`performedBy`**: The actual physical entity performing the work (e.g. `"Dräger Medical Certified Technician"`, `"In-House Facilities Team"`, `"Siemens Healthineers Field Service"`).
- **`recordedByUserId` (`actorId`)**: The authenticated Kinergy user ID who logged the maintenance record in the platform.

---

## 5. Status & Condition Interplay

1. **Orthogonal Distinction**: Recording routine maintenance on an `ACTIVE` asset does **not** take the asset offline or alter its status to `UNDER_MAINTENANCE`.
2. **Automated Operational Restoration**: When maintenance is recorded on an asset in `UNDER_MAINTENANCE` or `DAMAGED` status, and the resulting condition is serviceable (`EXCELLENT`, `GOOD`, or `FAIR`), the aggregate **automatically restores** the status to `ACTIVE`.
3. **Condition Upgrade**: If `updateConditionTo` is supplied, the asset's physical condition is updated atomically as part of the aggregate transaction.

---

## 6. History Guarantees & Domain Events

1. **Immutable History Event**: Every maintenance record automatically generates an associated `AssetHistoryEvent` with type `MAINTENANCE_RECORDED`.
2. **Details Payload**: The history event details capture:
   ```json
   {
     "maintenanceRecordId": "rec_uuid_123",
     "cost": { "amount": 1250.75, "currency": "USD" },
     "performedBy": "OxyHealth Certified Technicians Inc.",
     "serviceDate": "2026-06-15T00:00:00.000Z"
   }
   ```
3. **Integration Event**: Publishes `AssetMaintenanceRecordedDomainEvent` over the event publisher port (`ResourcesEventPublisherPort`).

---

## 7. Transactional Atomicity & Rollback

The maintenance workflow commits all changes together in an atomic database transaction (`prisma.$transaction`):

1. Insert into `asset_maintenance_records`.
2. Append to `asset_history_events`.
3. Update `fixed_assets` (status, condition, version, updatedAt).

If any write fails (or optimistic concurrency conflict occurs), the entire transaction rolls back completely with zero orphaned records.
