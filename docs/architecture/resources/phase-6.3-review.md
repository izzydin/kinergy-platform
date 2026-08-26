# Milestone 6.3: State Machines & Invariants — Architectural Review

- **Review Date**: 2026-08-26
- **Reviewer**: Kinergy Architecture Review Board (ARB) / Principal Domain Architect
- **Milestone**: Phase 6.3 — State Machines & Invariants
- **Status**: **APPROVED — 100% ARCHITECTURAL & INVARIANT ALIGNMENT**

---

## 1. Executive Summary

Milestone 6.3 establishes, enforces, and mathematically proves deterministic business invariants across the **Resources Bounded Context**, specifically governing:

1. **Fixed Asset Operational Lifecycle State Machine** (5-state finite state machine, terminal state sinks, condition serviceability coupling, and location transfer restrictions).
2. **Consumable Inventory Stock Invariants & Concurrency Control** ($QOH \ge 0.00$ non-negative floor, Scale 2 fixed decimal arithmetic, 5 deterministic movement types, double-entry ledger reconciliation, and Optimistic Concurrency Control).

This formal Architecture Review Board (ARB) evaluation confirms that the active implementation in `@kinergy/core` matches approved Architectural Decision Records ([ADR-0081 through ADR-0090](./adr/)), master architectural specifications, and database schemas with **zero contradictions** and **zero architectural deviations**.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                   KINERGY RESOURCES BOUNDED CONTEXT — INVARIANT TOPOLOGY                 │
├─────────────────────────────────────────────┬────────────────────────────────────────────┤
│           FIXED ASSET SUB-DOMAIN            │        CONSUMABLE INVENTORY SUB-DOMAIN     │
├─────────────────────────────────────────────┼────────────────────────────────────────────┤
│ • 5-State Finite State Machine              │ • Strict Non-Negative Stock Floor (≥ 0.00) │
│ • Terminal Sinks (SOLD, RETIRED)            │ • Scale 2 Fixed Decimal Quantities         │
│ • Condition Serviceability Coupling         │ • 5 Deterministic Movement Types (Ledger)  │
│ • Transfer Restrictions (Active/Maint/Dmg)  │ • Double-Entry Reconciliation Formula      │
│ • Append-Only History Audit Trail           │ • 3-Layer Concurrency Defense (Domain+OCC) │
│ • Single-$transaction Atomic Rollback       │ • Single-$transaction Atomic Rollback      │
└─────────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Asset State Machine Review

### 2.1 Complete Transition Matrix Verification

The 5x5 operational transition graph is governed strictly by [`AssetLifecycleStateMachine`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/assets/services/asset-lifecycle.state-machine.ts) and verified cell-by-cell in [`resources-qa-invariant-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/resources-qa-invariant-hardening.spec.ts):

| Source Status           |        Target: `ACTIVE`         |    Target: `UNDER_MAINTENANCE`    |       Target: `DAMAGED`       |       Target: `RETIRED`       |          Target: `SOLD`          |
| :---------------------- | :-----------------------------: | :-------------------------------: | :---------------------------: | :---------------------------: | :------------------------------: |
| **`ACTIVE`**            |       **THROWS** (No-op)        | **ALLOWED** (`sendToMaintenance`) | **ALLOWED** (`markAsDamaged`) |    **ALLOWED** (`retire`)     |       **ALLOWED** (`sell`)       |
| **`UNDER_MAINTENANCE`** | **ALLOWED** (`restoreToActive`) |        **THROWS** (No-op)         | **ALLOWED** (`markAsDamaged`) |    **ALLOWED** (`retire`)     | **ALLOWED** (`sell` liquidation) |
| **`DAMAGED`**           | **ALLOWED** (`restoreToActive`) | **ALLOWED** (`sendToMaintenance`) |      **THROWS** (No-op)       |    **ALLOWED** (`retire`)     |    **ALLOWED** (`sell` scrap)    |
| **`RETIRED`**           |   **BLOCKED** (`[AST-INV-8]`)   |    **BLOCKED** (`[AST-INV-8]`)    |  **BLOCKED** (`[AST-INV-8]`)  | **BLOCKED** (Already retired) |   **ALLOWED** (`sell` auction)   |
| **`SOLD`**              |   **BLOCKED** (Terminal Sink)   |    **BLOCKED** (Terminal Sink)    |  **BLOCKED** (Terminal Sink)  |  **BLOCKED** (Terminal Sink)  |   **BLOCKED** (Terminal Sink)    |

### 2.2 State Machine Checklist

- [x] **Initial State**: Creation restricted strictly to `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`. Creation in `RETIRED` or `SOLD` throws `InvalidAssetStateException` (`[AST-INV-2]`).
- [x] **Terminal States**: `SOLD` is an absolute immutable sink. `RETIRED` permits only salvage auction liquidation (`sell()`).
- [x] **Invalid Transitions**: Any unmapped edge throws `InvalidAssetStateException` with descriptive context.
- [x] **Explicit Transition Enforcement**: All mutations pass through semantic aggregate operations (`sendToMaintenance`, `markAsDamaged`, `restoreToActive`, `retire`, `sell`).
- [x] **Status/History Atomicity**: Every valid status mutation atomically creates an `AssetHistoryEvent` and increments the aggregate version.
- [x] **No Arbitrary Enum Mutation**: Direct status assignment is impossible via public API.
- [x] **Condition/Status Coupling**: Reactivating an asset (`UNDER_MAINTENANCE` or `DAMAGED` $\rightarrow$ `ACTIVE`) requires a serviceable condition rating (`EXCELLENT`, `GOOD`, `FAIR`) (`[AST-INV-9]`).

---

## 3. Inventory Invariant Review

### 3.1 Mandatory Stock Invariants

- [x] **Invariant 1 ($currentStock \ge 0.00$)**: Verified by domain `Quantity` Value Object, `InventoryItem` guards, and PostgreSQL database `CHECK (quantity_on_hand >= 0)`.
- [x] **Invariant 2 ($stock\_after\_movement \ge 0.00$)**: Outflow mutations (`sellStock`, `consumeStock`, `adjustStockOut`) verify that available stock covers the requested delta prior to deduction.
- [x] **Invariant 3 (Audit Ledger Parity)**: Every stock mutation generates exactly one immutable `StockMovement` child entity.
- [x] **Invariant 4 (Atomic Commitment)**: Materialized stock update and movement creation persist inside a single `prisma.$transaction`.
- [x] **Invariant 5 (Failed Mutation Rollback)**: If a domain invariant fails, zero movements are created and no database writes occur.
- [x] **Invariant 6 (Failed Movement Rollback)**: If movement persistence fails, the entire database transaction aborts, preventing stock drift.

### 3.2 Movement Sign Semantics & Double-Entry Formula

All 5 movement types enforce deterministic delta signs and positive input magnitudes:

$$\text{Balance}_{\text{after}} = \text{Balance}_{\text{before}} + \Delta_{\text{signed}}$$

| Operation          | Movement Type    | Input ($\delta$) | Delta Sign ($\Delta_{\text{signed}}$) |  Formula Effect  |
| :----------------- | :--------------- | :--------------: | :-----------------------------------: | :--------------: |
| `receiveStock()`   | `PURCHASE`       |     $> 0.00$     |              $+ \delta$               | Increments $QOH$ |
| `sellStock()`      | `SALE`           |     $> 0.00$     |              $- \delta$               | Decrements $QOH$ |
| `consumeStock()`   | `CONSUMPTION`    |     $> 0.00$     |              $- \delta$               | Decrements $QOH$ |
| `adjustStockIn()`  | `ADJUSTMENT_IN`  |     $> 0.00$     |              $+ \delta$               | Increments $QOH$ |
| `adjustStockOut()` | `ADJUSTMENT_OUT` |     $> 0.00$     |              $- \delta$               | Decrements $QOH$ |

---

## 4. Concurrency Review

The documentation and implementation answer all authoritative concurrency questions:

| Concurrency Question                              | Architectural Answer                                                                                                       | Implementation Mechanism                                                                            |
| :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **What prevents lost updates?**                   | Optimistic Concurrency Control (OCC) with atomic version verification.                                                     | `UPDATE inventory_items SET ..., version = version + 1 WHERE id = :id AND version = :priorVersion`. |
| **What prevents overselling?**                    | Pre-mutation domain checks combined with OCC collision detection and DB `CHECK` constraints.                               | Domain `assertSufficientStock()` + OCC rollback on race collision.                                  |
| **What happens under concurrent consumers?**      | Exactly one consumer commits; competing consumers receive version conflicts and roll back cleanly.                         | Competing thread updates 0 rows, triggering `OptimisticLockException`.                              |
| **What happens when a mutation loses a race?**    | The transaction rolls back cleanly; the application catches `OptimisticLockException` and executes retry logic.            | Application layer re-fetches latest state, re-evaluates domain rules, and re-submits.               |
| **What error does the losing operation receive?** | `OptimisticLockException` (HTTP 409 Conflict equivalent).                                                                  | Explicit domain exception containing aggregate name, ID, and failed version.                        |
| **What locking mechanism is used?**               | Optimistic Concurrency Control (OCC) via integer version numbers.                                                          | PostgreSQL row update conditional matching; no long-lived pessimistic row locks.                    |
| **Why was OCC selected?**                         | High read/write throughput, zero risk of distributed deadlocks, and superior scalability under low-to-moderate contention. | [ADR-0084](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md).              |

---

## 5. Transaction Review

Both `PrismaFixedAssetRepository` and `PrismaInventoryItemRepository` enforce atomic unit-of-work boundaries:

```typescript
// Fixed Asset Save: Atomic single-$transaction
await this.prisma.$transaction(async (tx) => {
  const result = await tx.fixedAsset.updateMany({
    where: { id: rawAsset.id, version: priorVersion },
    data: { ...rawAsset, version: rawAsset.version },
  });
  if (result.count === 0)
    throw new OptimisticLockException('FixedAsset', rawAsset.id, priorVersion);
  if (rawHistory.length > 0) await tx.assetHistoryEvent.createMany({ data: rawHistory });
  if (rawMaintenance.length > 0)
    await tx.assetMaintenanceRecord.createMany({ data: rawMaintenance });
});
```

- **Partial Failure Immunity**: If any secondary write (history, maintenance, movement) fails, PostgreSQL automatically aborts the entire transaction.
- **Zero Inconsistent State**: An asset cannot change status without history; stock cannot mutate without a movement ledger record.

---

## 6. Persistence & Database Review

### 6.1 Schema Parity

- `packages/core/prisma/schema.prisma` models `FixedAsset`, `AssetHistoryEvent`, `AssetMaintenanceRecord`, `InventoryItem`, and `StockMovement` are 100% aligned with domain value objects and entities.
- All monetary and quantity values use `DECIMAL(10, 2)` (Scale 2 fixed-point).
- Optimistic locking `version` fields are present as non-nullable integers defaulted to 1.

### 6.2 Defense-in-Depth

- PostgreSQL `CHECK (quantity_on_hand >= 0)` guarantees that even if application logic were bypassed, the storage engine rejects negative stock balances.
- Unique constraints `UNIQUE(sku)` and `UNIQUE(asset_tag)` guarantee identity uniqueness.

---

## 7. Error Handling Review

Domain error semantics are explicit, descriptive, and strongly typed:

| Exception Class                      | Trigger Condition                                                                                    |         HTTP / App Mapping          |
| :----------------------------------- | :--------------------------------------------------------------------------------------------------- | :---------------------------------: |
| `InvalidAssetStateException`         | Invalid FSM edge, missing justification, terminal state modification, or unserviceable reactivation. | 400 Bad Request / 422 Unprocessable |
| `InsufficientStockException`         | Outflow quantity exceeds available quantity on hand ($QOH - \delta < 0$).                            |   400 Bad Request / 409 Conflict    |
| `InvalidInventoryItemStateException` | Mutation attempted on `INACTIVE` or `ARCHIVED` catalog item, or invalid input magnitude.             | 400 Bad Request / 422 Unprocessable |
| `OptimisticLockException`            | Concurrent update detected during repository save (`count === 0`).                                   |    409 Conflict (Triggers Retry)    |
| `InvalidQuantityException`           | Negative or invalid decimal quantity value object construction.                                      |           400 Bad Request           |

---

## 8. Test Review

The invariant test harness comprises **8 dedicated test suites** containing **137 individual tests** with 100% pass rates:

| Test Suite                          | Location                                                                                                                                                                                                 |  Tests  |    Result     |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: | :-----------: |
| **QA Invariant Hardening Suite**    | [`resources-qa-invariant-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/resources-qa-invariant-hardening.spec.ts)                                 |   27    |   **PASS**    |
| **Asset Transition Enforcement**    | [`asset-lifecycle-transition-enforcement.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-transition-enforcement.spec.ts)                     |   31    |   **PASS**    |
| **Asset State Machine FSM**         | [`asset-lifecycle-state-machine.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-state-machine.spec.ts)                                       |   27    |   **PASS**    |
| **Asset Business Invariants**       | [`asset-business-operations-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-business-operations-invariants.spec.ts)                         |   15    |   **PASS**    |
| **Inventory Stock Invariants**      | [`inventory-stock-mutation-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-invariants.spec.ts)                           |   18    |   **PASS**    |
| **Inventory Concurrency & OCC**     | [`inventory-stock-mutation-concurrency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-concurrency.spec.ts)                         |   11    |   **PASS**    |
| **Prisma Asset Persistence**        | [`prisma-fixed-asset-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-fixed-asset-persistence.spec.ts)       |    3    |   **PASS**    |
| **Prisma Inventory Persistence**    | [`prisma-inventory-item-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-inventory-item-persistence.spec.ts) |    5    |   **PASS**    |
| **Total Dedicated Invariant Tests** | **All Invariant Suites**                                                                                                                                                                                 | **137** | **100% PASS** |

---

## 9. ADR Review

| Architectural Decision        | Governing ADR                                                                                                                                                                       | Status | Audit Finding                                                                     |
| :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: | :-------------------------------------------------------------------------------- |
| **Domain Segregation**        | [ADR-0081](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md) & [ADR-0082](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md) | Active | Verified. Zero shared mutable entities between Assets and Inventory.              |
| **Materialized Stock Ledger** | [ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)                                                                                        | Active | Verified. $QOH$ cached on aggregate root; all deltas recorded in `StockMovement`. |
| **Inventory Concurrency**     | [ADR-0084](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)                                                                                               | Active | Verified. OCC versioning and database check constraints implemented.              |
| **Asset Lifecycle FSM**       | [ADR-0085](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)                                                                              | Active | Verified. 5-state deterministic FSM and terminal sinks enforced.                  |
| **Maintenance Tracking**      | [ADR-0086](./adr/0086-fixed-asset-maintenance-history-and-service-tracking-model.md)                                                                                                | Active | Verified. Lightweight service tracking with automatic audit logging.              |
| **Asset Valuation**           | [ADR-0087](./adr/0087-resource-valuation-and-on-demand-asset-depreciation-strategy.md)                                                                                              | Active | Verified. Purchase value and current estimated value in Scale 2 `Money`.          |
| **Inventory Classification**  | [ADR-0088](./adr/0088-inventory-category-classification-strategy.md)                                                                                                                | Active | Verified. Canonical 6-category registry and validation.                           |
| **Precision Semantics**       | [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)                                                                                                  | Active | Verified. Half-up Scale 2 arithmetic across all quantities and money.             |
| **Asset Classification**      | [ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)                                                                                  | Active | Verified. 6 categories, 5 statuses, 5 condition ratings registered.               |

**ADR Conclusion**: All existing ADRs are accurate, complete, and fully aligned with code. No ADR updates or new ADRs are required for Milestone 6.3.

---

## 10. Documentation Review

All architectural documentation in `docs/architecture/resources/` has been updated and cross-indexed in [`README.md`](file:///c:/Projects/kinergy-platform/docs/architecture/resources/README.md):

- [`domain-boundaries.md`](./domain-boundaries.md)
- [`persistence-strategy.md`](./persistence-strategy.md)
- [`domain-model.md`](./domain-model.md)
- [`business-rules.md`](./business-rules.md)
- [`asset-domain-model.md`](./asset-domain-model.md)
- [`asset-lifecycle.md`](./asset-lifecycle.md)
- [`asset-status-state-machine.md`](./asset-status-state-machine.md)
- [`asset-history.md`](./asset-history.md)
- [`asset-maintenance.md`](./asset-maintenance.md)
- [`inventory-invariants.md`](./inventory-invariants.md)
- [`invariant-enforcement.md`](./invariant-enforcement.md)
- [`invariant-testing.md`](./invariant-testing.md)

---

## 11. Deviations

- **Identified Deviations**: **0 (Zero)**.
- **Architectural Drift**: **0 (Zero)**.
- **Direct Enum / Stock Bypass Vectors**: **0 (Zero)**.

---

## 12. Risks & Mitigations

| Identified Risk                      | Severity | Mitigation Implemented                                                                                                                            |
| :----------------------------------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **High Contention Stock Hotspots**   |   Low    | OCC version check aborts colliding transactions immediately; application layer executes exponential backoff retry.                                |
| **Developer Direct Mutation Bypass** |   None   | Aggregates encapsulate all mutable state behind private fields with zero public setters; repositories expose no generic property update methods.  |
| **Partial Database Failure**         |   None   | All aggregate persistence operations execute within single `prisma.$transaction` boundaries, rolling back completely on secondary write failures. |

---

## 13. Blocking Issues

- **Blocking Issues**: **None**.

---

## 14. Architecture Review Board Recommendation

The Architecture Review Board unanimously **APPROVES** Phase 6, Milestone 6.3 (**State Machines & Invariants**).

The Resources Bounded Context is domain-safe, transaction-safe, concurrency-safe, and persistence-safe. Authorization is granted to proceed to the formal Milestone 6.3 Quality Gate.
