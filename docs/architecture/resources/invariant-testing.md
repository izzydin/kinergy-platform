# Automated Invariant Testing & Verification Strategy

- **Module**: `packages/core/src/resources/`
- **Status**: **AUTHORITATIVE QA SPECIFICATION & EVIDENCE (APPROVED & ACTIVE)**
- **Governing ADRs**:
  - [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
  - [ADR-0084: Inventory Concurrency Control & Race Condition Prevention](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)
  - [ADR-0085: Fixed Asset Operational Lifecycle State Machine & Terminal Disposal Policy](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)
  - [ADR-0089: Inventory Monetary, Quantity, and Unit of Measure Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
  - [ADR-0090: Fixed Asset Classification, Lifecycle State, and Condition Rating Strategy](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)

---

## 1. Testing Philosophy & Objective

The primary objective of the Resources test harness is to mathematically and transactionally prove business correctness under normal, invalid, transactional, and concurrent conditions.

```
       ┌─────────────────────────────────────────────────────────────┐
       │               RESOURCES QA TEST SUITE ARCHITECTURE          │
       ├─────────────────────────────────────────────────────────────┤
       │ 1. Deterministic Behavioral Tests (5x5 State Matrix)        │
       │ 2. Precision & Scale Boundaries (Scale 2 Fixed Point)       │
       │ 3. Concurrency Contention Scenarios (A, B, C)               │
       │ 4. Single-Transaction Rollback Verification (Atomicity)     │
       │ 5. Database Defense-in-Depth Floor Checks (OCC + CHECK)     │
       └─────────────────────────────────────────────────────────────┘
```

---

## 2. Fixed Asset 5x5 Transition Pair Matrix Coverage

Every cell in the 5x5 state transition matrix is exercised by dedicated unit/integration tests in [`resources-qa-invariant-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/resources-qa-invariant-hardening.spec.ts) and [`asset-lifecycle-transition-enforcement.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-transition-enforcement.spec.ts):

| Source State            |        Target: `ACTIVE`         |    Target: `UNDER_MAINTENANCE`    |       Target: `DAMAGED`       |       Target: `RETIRED`       |          Target: `SOLD`          |
| :---------------------- | :-----------------------------: | :-------------------------------: | :---------------------------: | :---------------------------: | :------------------------------: |
| **`ACTIVE`**            |    **THROWS** (No-op change)    | **ALLOWED** (`sendToMaintenance`) | **ALLOWED** (`markAsDamaged`) |    **ALLOWED** (`retire`)     |       **ALLOWED** (`sell`)       |
| **`UNDER_MAINTENANCE`** | **ALLOWED** (`restoreToActive`) |     **THROWS** (No-op change)     | **ALLOWED** (`markAsDamaged`) |    **ALLOWED** (`retire`)     | **ALLOWED** (`sell` liquidation) |
| **`DAMAGED`**           | **ALLOWED** (`restoreToActive`) | **ALLOWED** (`sendToMaintenance`) |   **THROWS** (No-op change)   |    **ALLOWED** (`retire`)     |    **ALLOWED** (`sell` scrap)    |
| **`RETIRED`**           |   **BLOCKED** (`[AST-INV-8]`)   |    **BLOCKED** (`[AST-INV-8]`)    |  **BLOCKED** (`[AST-INV-8]`)  | **BLOCKED** (Already retired) |   **ALLOWED** (`sell` auction)   |
| **`SOLD`**              |   **BLOCKED** (Terminal Sink)   |    **BLOCKED** (Terminal Sink)    |  **BLOCKED** (Terminal Sink)  |  **BLOCKED** (Terminal Sink)  |   **BLOCKED** (Terminal Sink)    |

---

## 3. Consumable Inventory Precision & Boundary Tests

The test suite validates the following numeric invariants defined in [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md):

1. **Purchase from Zero**: Initial stock $0.00 \xrightarrow{+10.00} 10.00$. Materializes balance and opening movement correctly.
2. **Precision Unit Boundary ($0.01$)**: When $QOH = 0.01$, an overdraft of $0.02$ is rejected (`InsufficientStockException`). Consuming $0.01$ leaves exactly $0.00$ (out of stock).
3. **Strict Input Magnitude**: Reject inputs $\le 0.00$ (`InvalidInventoryItemStateException` or `InvalidQuantityException`).
4. **Rounding Normalization**: Floating-point inputs are normalized via half-up rounding to Scale 2 cents/hundredths ($12.345 \rightarrow 12.35$, $12.344 \rightarrow 12.34$).

---

## 4. Concurrency Scenarios & Race Condition Proofs

Concurrency tests execute against realistic PostgreSQL transactional models with OCC version checks:

### Scenario A: Competing Consumers on Limited Stock

- **Setup**: Initial stock $= 5.00$, $\text{version} = 1$.
- **Execution**: Consumer 1 requests $4.00$, Consumer 2 requests $4.00$.
- **Outcome**: Consumer 1 commits ($QOH = 1.00$, $\text{version} = 2$). Consumer 2 collides on OCC, refreshes to $QOH = 1.00$, and is rejected by domain overdraft check ($1.00 < 4.00$).
- **Proof**: Final stock is exactly $1.00 \ge 0.00$. Successful movement count $= 1$.

### Scenario B: Multi-Consumer Overselling Contention

- **Setup**: Initial stock $= 10.00$, $\text{version} = 1$.
- **Execution**: 4 concurrent consumers each request $4.00$ (total demand $= 16.00$).
- **Outcome**: Exactly 2 consumers succeed ($10 - 4 - 4 = 2.00$ remaining). 2 consumers fail with `InsufficientStockException`.
- **Proof**: Final stock is exactly $2.00$. Zero overselling. Total movements match stock delta.

### Scenario C: Concurrent Interleaved Purchases & Sales

- **Setup**: Initial stock $= 10.00$.
- **Execution**: 2 purchases of $+5.00$ each, 2 sales of $-4.00$ each interleaved.
- **Outcome**: All operations commit atomically.
- **Proof**: Final stock $= 10 + 5 - 4 + 5 - 4 = 12.00$. Sum of movement deltas equals $12.00$. Zero lost updates.

---

## 5. Transactional Atomicity & Partial Failure Verification

| Test Target                  | Simulated Failure Point                                | Expected Behavior                                                                                  | Verification Status |
| :--------------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :-----------------: |
| **Asset Status Mutation**    | Secondary `AssetHistoryEvent` database insert failure. | Entire transaction aborts; `FixedAsset.status` reverts to prior status; version remains unmutated. |    **VERIFIED**     |
| **Asset Maintenance**        | Secondary `AssetMaintenanceRecord` insert failure.     | Transaction aborts; status and history unaffected.                                                 |    **VERIFIED**     |
| **Inventory Stock Mutation** | Secondary `StockMovement` ledger insert failure.       | Transaction aborts; `InventoryItem.quantityOnHand` remains intact; version remains unmutated.      |    **VERIFIED**     |
| **OCC Version Collision**    | Concurrent modification incremented version in DB.     | `updateMany` returns `count = 0`; throws `OptimisticLockException`; transaction rolls back.        |    **VERIFIED**     |

---

## 6. Test Suite Inventory

| Test Suite                          | Path                                                                                                                                                                                                     |        Test Count         |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------------: |
| **QA Invariant Hardening Suite**    | [`resources-qa-invariant-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/resources-qa-invariant-hardening.spec.ts)                                 |            27             |
| **Asset Transition Enforcement**    | [`asset-lifecycle-transition-enforcement.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-transition-enforcement.spec.ts)                     |            31             |
| **Asset State Machine FSM**         | [`asset-lifecycle-state-machine.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-lifecycle-state-machine.spec.ts)                                       |            27             |
| **Asset Business Invariants**       | [`asset-business-operations-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/asset-business-operations-invariants.spec.ts)                         |            15             |
| **Inventory Stock Invariants**      | [`inventory-stock-mutation-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-invariants.spec.ts)                           |            18             |
| **Inventory Concurrency & OCC**     | [`inventory-stock-mutation-concurrency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-concurrency.spec.ts)                         |            11             |
| **Prisma Asset Persistence**        | [`prisma-fixed-asset-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-fixed-asset-persistence.spec.ts)       |             3             |
| **Prisma Inventory Persistence**    | [`prisma-inventory-item-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-inventory-item-persistence.spec.ts) |             5             |
| **Total Dedicated Invariant Tests** | **All 8 Invariant Test Suites**                                                                                                                                                                          | **137 Tests (100% Pass)** |
