# Fixed Asset History & Audit Trail Specification

- **Module**: `packages/core/src/resources/domain/assets`
- **Specification Status**: **APPROVED & ACTIVE**
- **Governing ADRs**: [ADR-0086: Fixed Asset Maintenance History & Service Tracking Model](./adr/0086-fixed-asset-maintenance-history-and-service-tracking-model.md), [ADR-0085: Fixed Asset Operational Lifecycle State Machine & Terminal Disposal Policy](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)
- **Entity Implementation**: [`AssetHistoryEvent`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/assets/entities/asset-history-event.entity.ts)

---

## 1. Purpose

The Fixed Asset History subsystem provides a deterministic, immutable, and human-auditable chronicle of significant lifecycle changes for capital equipment across all Kinergy facilities.

It empowers clinical directors, facility managers, and financial controllers to answer six fundamental questions for every asset:

1. **What happened?** (`eventType`, human-readable `description`)
2. **When?** (Immutable ISO-8601 UTC timestamp `recordedAt`)
3. **To which asset?** (`assetId`, `assetTag`)
4. **Who performed it?** (`recordedByUserId` / `actorId`)
5. **What changed?** (Structured `details` payload capturing before/after diffs)
6. **Why?** (`reason` metadata when applicable)

---

## 2. Event Vocabulary

The domain defines a closed set of 9 meaningful event types:

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

---

## 3. Event Payload Semantics & Data Contracts

| Event Type                 | Triggering Domain Action                                                      | Meaningful Change                                          | Minimum Required Payload (`details`)                                                        |
| :------------------------- | :---------------------------------------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **`CREATED`**              | `FixedAsset.create`                                                           | Asset tagged, registered, and commissioned into service.   | `{ assetTag, category, purchaseValue, currentEstimatedValue, condition, status, location }` |
| **`UPDATED`**              | `asset.updateDetails`                                                         | Mutable metadata modified (name, description, notes).      | `{ changedFields: { [field]: { from, to } }, reason? }`                                     |
| **`TRANSFERRED`**          | `asset.transferLocation`                                                      | Asset physically relocated across facility, room, or zone. | `{ priorLocation, newLocation, reason? }`                                                   |
| **`STATUS_CHANGED`**       | `asset.changeStatus`, `sendToMaintenance`, `markAsDamaged`, `restoreToActive` | Operational lifecycle phase transition.                    | `{ priorStatus, newStatus, reason }`                                                        |
| **`CONDITION_CHANGED`**    | `asset.updateCondition`                                                       | Physical wear-and-tear rating updated after inspection.    | `{ priorCondition, newCondition, reason? }`                                                 |
| **`VALUE_UPDATED`**        | `asset.updateEstimatedValue`                                                  | Financial book revaluation or scheduled depreciation.      | `{ priorValue, newValue, difference?, reason? }`                                            |
| **`MAINTENANCE_RECORDED`** | `asset.recordMaintenance`                                                     | Preventive servicing, calibration, or repair executed.     | `{ maintenanceRecordId, cost, performedBy, serviceDate, notes?, updateConditionTo? }`       |
| **`RETIRED`**              | `asset.retire`                                                                | Asset permanently decommissioned from service.             | `{ priorStatus, newStatus: 'RETIRED', reason }`                                             |
| **`SOLD`**                 | `asset.sell`                                                                  | Terminal salvage sale / liquidation proceeds realized.     | `{ priorStatus, newStatus: 'SOLD', priorEstimatedValue, saleAmount, reason }`               |

---

## 4. Actor Semantics

- Every history entry requires an authenticated user identity (`recordedByUserId`).
- Anonymous or unauthenticated mutations are strictly prohibited by domain invariants (`assertActor`).
- System-automated jobs (e.g. automated monthly depreciation batch calculation) record a dedicated system service actor ID (e.g. `usr_system_depreciation_engine`).

---

## 5. Meaningful vs Technical Changes (Anti-Noise Policy)

To preserve audit clarity and avoid database bloat, the history ledger records **only meaningful domain changes**:

- **No-Op Details Updates**: If `asset.updateDetails({ name: 'Same' })` is invoked with identical values, **NO** history entry is generated.
- **ORM Timestamp Updates**: Routine ORM touches (e.g. updated `updatedAt` without field mutation) do **NOT** generate history events.
- **Failed Mutations**: When domain invariant validation fails, no history record is appended.

---

## 6. Immutability & Append-Only Guarantees

- `AssetHistoryEvent` instances are frozen upon instantiation (`Object.freeze(this)`).
- Historical records are strictly append-only; database update (`UPDATE`) and delete (`DELETE`) operations on the `AssetHistoryEvent` table are prohibited.
- Once recorded, past entries cannot be modified or purged.

---

## 7. Correction Strategy

When an erroneous entry is recorded (e.g. equipment mistakenly marked as `DAMAGED` instead of `UNDER_MAINTENANCE`, or an incorrect estimated valuation entered):

1. **No Retrospective Rewriting**: The original history record is preserved unaltered.
2. **Compensating Action**: The operator executes a correcting domain action (e.g. `restoreToActive` or `updateEstimatedValue`) supplying a clear correction reason (`reason: "Correction: Reverted mistaken valuation input"`).
3. **Audit Trail Continuity**: Both the initial erroneous event and the subsequent compensating event remain visible in chronological sequence.

---

## 8. Atomicity & Transaction Boundaries

History records are appended and persisted atomically with aggregate state changes:

1. **In-Memory Atomicity**:
   - The aggregate state mutation and history event creation happen within the same domain method invocation.
2. **Database Transaction Atomicity**:
   - `PrismaFixedAssetRepository.save(asset)` writes the `FixedAsset` aggregate and inserts all new `AssetHistoryEvent` records within a single `prisma.$transaction`.
   - If history insertion fails, the entire transaction rolls back.

---

## 9. Non-Goals

- **Event Sourcing Engine**: The history ledger is an audit mechanism, not an Event Sourcing event store. Aggregate state is persisted in the normalized `FixedAsset` table, not replayed from history events.
- **General User Activity Feed**: The history ledger is scoped exclusively to asset governance and accounting, not generic clickstream tracking.
