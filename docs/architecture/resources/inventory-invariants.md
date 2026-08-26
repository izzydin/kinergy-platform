# Consumable Inventory Invariants & Concurrency Specification

- **Module**: `packages/core/src/resources/domain/inventory`
- **Status**: **AUTHORITATIVE SPECIFICATION (APPROVED & ACTIVE)**
- **Governing ADRs**:
  - [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
  - [ADR-0084: Inventory Concurrency Control & Race Condition Prevention](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)
  - [ADR-0089: Inventory Monetary, Quantity, and Unit of Measure Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
- **Domain Aggregate**: [`InventoryItem`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/inventory/inventory-item.aggregate.ts)
- **Persistence Engine**: [`PrismaInventoryItemRepository`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-inventory-item.repository.ts)

---

## 1. Mandatory Stock Invariants

The Consumable Inventory domain enforces six inviolable mathematical and transactional invariants:

| Invariant ID      | Formulation                               | Business & System Meaning                                                                             | Enforcement Point                                        |
| :---------------- | :---------------------------------------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| **`[INV-STK-1]`** | $\text{currentStock} \ge 0.00$            | Materialized physical stock on hand can never be negative under any circumstance.                     | Domain (`Quantity`) + DB `CHECK`                         |
| **`[INV-STK-2]`** | $\text{stock\_after} \ge 0.00$            | Every individual movement must result in a valid non-negative post-movement balance.                  | Aggregate (`assertActiveCatalogStatus`, overdraft check) |
| **`[INV-STK-3]`** | $\forall \Delta S \implies \exists M$     | Every successful stock mutation must produce an immutable, auditable `StockMovement` ledger entry.    | Aggregate method (`_movements.push`)                     |
| **`[INV-STK-4]`** | $\text{Atomic}(\Delta S, M)$              | Materialized stock balance update and `StockMovement` creation commit or roll back as an atomic unit. | Repository (`prisma.$transaction`)                       |
| **`[INV-STK-5]`** | $\text{Failed}(\Delta S) \implies \neg M$ | If a stock mutation fails domain validation, no movement record is generated or persisted.            | Aggregate method rejection                               |
| **`[INV-STK-6]`** | $\text{Failed}(M) \implies \neg \Delta S$ | If persisting the movement ledger fails, the stock balance mutation is completely rolled back.        | Database transaction rollback                            |

---

## 2. Movement Types & Deterministic Stock Effects

The domain supports five closed, canonical movement types:

| Movement Type        | Business Context & Operational Trigger                          |  Balance Effect  | Formula                                                        |
| :------------------- | :-------------------------------------------------------------- | :--------------: | :------------------------------------------------------------- |
| **`PURCHASE`**       | Supplier delivery received, purchase order fulfilled.           | **Increase (+)** | $\text{stock\_after} = \text{stock\_before} + \text{quantity}$ |
| **`SALE`**           | Member/client retail checkout purchase.                         | **Decrease (-)** | $\text{stock\_after} = \text{stock\_before} - \text{quantity}$ |
| **`CONSUMPTION`**    | Internal facility use (e.g. clinic therapy supplies, cleaning). | **Decrease (-)** | $\text{stock\_after} = \text{stock\_before} - \text{quantity}$ |
| **`ADJUSTMENT_IN`**  | Physical inventory count discrepancy (found surplus).           | **Increase (+)** | $\text{stock\_after} = \text{stock\_before} + \text{quantity}$ |
| **`ADJUSTMENT_OUT`** | Shrinkage, expiration write-off, or damaged stock.              | **Decrease (-)** | $\text{stock\_after} = \text{stock\_before} - \text{quantity}$ |

- **No Signed Ambiguity**: Callers submit strictly positive mutation quantities ($\text{input} > 0.00$). The domain method deterministically applies the sign based on the movement type.

---

## 3. Quantity Precision Semantics

Governed by [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md):

- **Data Representation**: Immutable `Quantity` Value Object.
- **Precision & Scale**: Exact Fixed Scale 2 (`DECIMAL(10, 2)`).
- **Smallest Discrete Unit**: `0.01` (hundredths).
- **Rounding Policy**: Half-Up Rounding to two decimal places ($\text{Math.round}(v \times 100) / 100$).
- **Zero Floating-Point Drift**: All balance arithmetic uses integer-scaled cents/hundredths arithmetic to eliminate IEEE-754 floating-point inaccuracies.

---

## 4. Zero & Negative Quantity Semantics

### 4.1 Zero Quantity Semantics

- **Stock Balance**: $\text{quantityOnHand} = 0.00$ is completely valid and represents an out-of-stock / depleted state.
- **Minimum Stock Alert Threshold**: $\text{minimumStock} = 0.00$ is valid and denotes that no low-stock replenishment alert is configured for the item.
- **Mutation Delta Inputs**: Input quantity for `receiveStock`, `sellStock`, `consumeStock`, `adjustStockIn`, and `adjustStockOut` **MUST BE STRICTLY POSITIVE** ($\text{qty} > 0.00$). An input of `0.00` is rejected with `InvalidQuantityException` or `InvalidInventoryItemStateException`.

### 4.2 Negative Quantity Semantics

- **Negative Input Quantities**: Calling mutation methods with negative values (e.g. `consumeStock(-5)`) is strictly rejected with `InvalidQuantityException`.
- **Negative Resulting Balances**: If $\text{stock\_before} - \text{input} < 0.00$, the operation is blocked with `InsufficientStockException`.

---

## 5. Stock-Before and Stock-After Ledger Reconstruction

Every `StockMovement` entity captures the complete double-entry delta snapshot:

```typescript
interface StockMovementSnapshot {
  readonly id: MovementId;
  readonly itemId: InventoryItemId;
  readonly type: MovementType;
  readonly quantity: Quantity; // Strictly positive magnitude (e.g. 5.00)
  readonly balanceBefore: Quantity; // Materialized balance prior to mutation (e.g. 12.00)
  readonly balanceAfter: Quantity; // Materialized balance resulting from mutation (e.g. 7.00)
  readonly reason?: string;
  readonly performedByUserId: string;
  readonly createdAt: Date;
}
```

- **Reconciliation Invariant**:
  $$\text{balanceBefore} + \text{signedDelta} = \text{balanceAfter}$$
- **Historical Reconstruction**:
  $$\text{currentStock} = \sum_{m \in \text{Movements}} \text{signedDelta}(m)$$

---

## 6. Concurrency Model & Race Condition Prevention

### 6.1 The High-Contention Race Hazard

Consider two simultaneous requests attempting to consume inventory when physical stock is low:

```
Initial State: quantity_on_hand = 5.00, version = 1

Thread A (User 1 - Consume 4.00)           Thread B (User 2 - Consume 4.00)
--------------------------------           --------------------------------
1. Read quantity_on_hand = 5.00 (v1)       1. Read quantity_on_hand = 5.00 (v1)
2. Validates 4.00 <= 5.00 (PASS)           2. Validates 4.00 <= 5.00 (PASS)
3. Calculates new balance = 1.00           3. Calculates new balance = 1.00
4. Executes UPDATE WHERE version = 1       4. Executes UPDATE WHERE version = 1
   -> Rows affected = 1 (SUCCESS)             -> Rows affected = 0 (OCC CONFLICT!)
5. Commits version = 2                     5. Rolls back transaction
                                           6. Throws OptimisticLockException
```

### 6.2 The 3-Layer Defense-in-Depth Architecture

```
+-----------------------------------------------------------------------------+
| LAYER 1: DOMAIN AGGREGATE INVARIANTS                                        |
| - In-memory overdraft verification: assert(qty <= quantityOnHand)           |
| - Atomic version increment: this._version += 1                              |
| - Emits domain events only upon successful domain calculation               |
+-----------------------------------------------------------------------------+
                                     │
                                     ▼
+-----------------------------------------------------------------------------+
| LAYER 2: ORM / APPLICATION OCC VERSION MATCHING                             |
| - UPDATE inventory_items SET quantity_on_hand = :new, version = :newVersion |
|   WHERE id = :id AND version = :priorVersion                                |
| - If result.count === 0, throws OptimisticLockException (HTTP 409 Conflict) |
+-----------------------------------------------------------------------------+
                                     │
                                     ▼
+-----------------------------------------------------------------------------+
| LAYER 3: DATABASE ENGINE CONSTRAINTS                                        |
| - PostgreSQL Table Constraint: CHECK (quantity_on_hand >= 0)                |
| - Single atomic prisma.$transaction for aggregate + movement inserts        |
| - Absolute hard barrier preventing corrupt negative values in DB            |
+-----------------------------------------------------------------------------+
```

### 6.3 Evaluation of Concurrency Strategies

| Concurrency Strategy                                | Strengths                                                                                          | Weaknesses                                                                             |        Decision         |
| :-------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- | :---------------------: |
| **Pessimistic Row Lock (`SELECT FOR UPDATE`)**      | Guarantees FIFO execution.                                                                         | Vulnerable to deadlocks in multi-item batch orders; locks rows during long operations. | **Rejected as primary** |
| **Serializable Transaction Isolation**              | Maximum theoretical isolation.                                                                     | High rate of serialization failures in PostgreSQL across unrelated queries.            |      **Rejected**       |
| **Optimistic Concurrency Control (OCC) + DB Check** | High throughput, zero row lock deadlocks, 100% mathematical consistency, matches Kinergy ADR-0021. | Requires retry handling on 409 conflict.                                               |  **ACCEPTED & ACTIVE**  |

---

## 7. Transaction Model & Failure Behavior

### 7.1 Transaction Boundaries

All persistence occurs in `PrismaInventoryItemRepository.save()` inside a single `prisma.$transaction`:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Conditional OCC Update of InventoryItem table
  const result = await tx.inventoryItem.updateMany({
    where: { id: item.id.value, version: priorVersion },
    data: { quantityOnHand: item.quantityOnHand.value, version: item.version, ... },
  });

  if (result.count === 0) {
    throw new OptimisticLockException('InventoryItem', item.id.value, priorVersion);
  }

  // 2. Insert new StockMovement ledger records
  for (const movement of newMovements) {
    await tx.stockMovement.upsert({ ... });
  }
});
```

### 7.2 Failure & Rollback Semantics

1. **Domain Failure**: Overdraft throws `InsufficientStockException` immediately; zero database calls are executed.
2. **OCC Collision**: `result.count === 0` throws `OptimisticLockException`; transaction rolls back; zero movement rows are written.
3. **Database Disk / Network Failure**: `prisma.$transaction` rolls back all table updates; state remains unmutated.

---

## 8. Retry Behavior & Conflict Resolution

When an `OptimisticLockException` occurs:

1. **Application Command Retry**: The application use-case handler or API controller catches the OCC exception.
2. **Fresh Aggregate Fetch**: The repository reloads the latest aggregate state from the database with the updated `version` and `quantityOnHand`.
3. **Re-evaluation**: The business operation is re-attempted against the fresh stock balance.
   - If stock is still sufficient, the transaction succeeds transparently.
   - If stock was depleted by the concurrent transaction, `InsufficientStockException` is returned to the user with the actual remaining quantity.

---

## 9. Explicit Non-Goals

To maintain high performance and simplicity:

- **No Distributed Two-Phase Commit (2PC)**: Single database boundary.
- **No Complex Manufacturing Bill of Materials (BOM)**: Resources domain handles finished goods and supply items, not multi-stage assembly lines.
- **No Speculative Stock Reservations / Holds**: Immediate double-entry decrements prevent dangling reservation timeouts.

---

## 10. Direct Mutation & Bypass Vector Audit

| Target Path / Operation                 | Audit Finding & Protection                                                                                                                                                                                 |    Status     |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: |
| `item.quantityOnHand = newQty`          | **Impossible**: `_quantityOnHand` is private; no public setters exist on `InventoryItem`.                                                                                                                  | **PROTECTED** |
| `item.updateCatalogDetails({ ... })`    | **Protected**: Only mutates catalog metadata (`name`, `description`, `category`, `unit`, `minimumStock`, `purchaseCost`, `sellingPrice`, `locationRef`). Zero stock fields can be passed.                  | **PROTECTED** |
| `repository.update({ quantityOnHand })` | **Impossible**: `InventoryItemRepository` interface only exposes `save(item: InventoryItem)`.                                                                                                              | **PROTECTED** |
| Direct Negative Delta input (`-5`)      | **Protected**: `parsePositiveQuantity()` asserts strictly positive input magnitudes ($> 0.00$) on all 5 mutation methods (`receiveStock`, `sellStock`, `consumeStock`, `adjustStockIn`, `adjustStockOut`). | **PROTECTED** |
| Zero Delta input (`0.00`)               | **Protected**: `parsePositiveQuantity()` rejects zero inputs with `InvalidInventoryItemStateException`.                                                                                                    | **PROTECTED** |
| Mutations on `INACTIVE` item            | **Protected**: `assertActiveCatalogStatus()` blocks any stock mutation on suspended items.                                                                                                                 | **PROTECTED** |
| Mutations on `ARCHIVED` item            | **Protected**: `assertActiveCatalogStatus()` blocks any stock mutation on terminal items.                                                                                                                  | **PROTECTED** |

---

## 11. Automated Test Suite Verification & Proof of Invariants

The implementation is verified by 34 dedicated unit and integration tests across 3 suites:

### 11.1 Test Suite Breakdown

| Test Suite                                      | File Location                                                                                                                                                                                            | Tests | Verification Focus                                                                                                                                                                          |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stock Mutation & Concurrency Invariants**     | [`inventory-stock-mutation-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-invariants.spec.ts)                           |  18   | Deterministic 5 movement types, zero/negative rejection, exact depletion, catalog bypass audit, lost update race proof, overdraft race proof, competing sales/adjustments, atomic rollback. |
| **Stock Mutation Atomicity & OCC Verification** | [`inventory-stock-mutation-concurrency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/domain/__tests__/inventory-stock-mutation-concurrency.spec.ts)                         |  11   | Multi-operation sequence proofs, ledger reconciliation invariant ($\text{balance} = \sum \Delta$), concurrent consumer race simulation.                                                     |
| **Prisma Repository Transactional Persistence** | [`prisma-inventory-item-persistence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/infrastructure/persistence/prisma/repositories/prisma-inventory-item-persistence.spec.ts) |   5   | Single `$transaction` execution, OCC version checking in `updateMany`, `OptimisticLockException` trigger, rollback on movement insertion failure.                                           |

### 11.2 Proof of Lost Update & Overdraft Prevention

```
[TEST PROVEN: Lost Update Race]
Thread A (v1) reads QOH = 10 ───> Consumes 3 ───> Commits QOH = 7, v2
Thread B (v1) reads QOH = 10 ───> Consumes 4 ───> Collides on OCC WHERE v1 (count=0) ───> Throws OptimisticLockException
Thread B retries ───> Reads QOH = 7, v2 ───> Consumes 4 ───> Commits QOH = 3, v3
Final Stock = 3.00 (Zero Lost Updates)

[TEST PROVEN: Overdraft Race]
Initial QOH = 5.00
Thread A (v1) consumes 4.00 ───> Commits QOH = 1.00, v2
Thread B (v1) attempts 4.00 ───> Fails OCC / Domain re-evaluation (1.00 < 4.00) ───> Throws InsufficientStockException
Final Stock = 1.00 (NEVER -3.00, and NEVER 1.00 with 8.00 total consumed)
```
