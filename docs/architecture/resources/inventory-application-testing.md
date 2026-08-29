# Consumable Inventory Application-Layer QA Hardening & Testing Specification

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Consumable Inventory`  
**Milestone**: Phase 6.5 — Application Layer QA Verification & Hardening  
**Lead Engineers**: Senior QA Engineer & Principal Backend Engineer  
**Status**: `VERIFIED & COMPLETE`  
**Date**: August 28, 2026

---

## 1. Test Strategy & Objectives

The primary goal of this verification suite is **workflow correctness under real business conditions** rather than superficial line coverage. The test strategy exercises:

- **End-to-End Application Handlers**: Validating complete use-case boundaries from command intake to event publication.
- **Transactional Atomicity & Rollback Integrity**: Verifying that failures mid-transaction leave zero partial state or orphaned movement ledger rows.
- **Race Condition & OCC Concurrency Resistance**: Proving that competing parallel operations (e.g. concurrent sales and clinical consumption) cannot double-spend stock or produce negative balances.
- **Scale 2 Fixed Arithmetic Accuracy**: Guaranteeing financial precision across all valuation calculations.

---

## 2. Comprehensive Workflow Matrix

### 2.1 Product Lifecycle Matrix

| Scenario                    | Tested Invariant / Constraint                                                | Result                           |
| --------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| **Create Product**          | Non-empty SKU, name, unit, category, positive initial stock opening movement | `PASSED`                         |
| **SKU Collision**           | Unique SKU constraint within tenant boundary                                 | `PASSED` (Rejects duplicate SKU) |
| **Update Metadata**         | Catalog metadata editable, direct `quantityOnHand` writes strictly blocked   | `PASSED`                         |
| **Deactivate & Reactivate** | State machine transitions (`ACTIVE` <-> `INACTIVE`)                          | `PASSED`                         |
| **Archive Active Item**     | Requires `quantityOnHand == 0.00`; blocks post-archive mutations             | `PASSED`                         |

### 2.2 Stock Mutation & Ledger Operations Matrix

| Scenario                 | Operation        | Direction | Ledger Record                                         | Atomicity Check                                   |
| ------------------------ | ---------------- | --------- | ----------------------------------------------------- | ------------------------------------------------- |
| **Purchase Receipt**     | `ReceiveStock`   | `+Delta`  | `StockMovementType.PURCHASE` with `unitCost`          | Atomic aggregate + movement commit                |
| **Retail Sale**          | `SellStock`      | `-Delta`  | `StockMovementType.SALE` with `sellingPrice`          | Prevents overdraw; allows exact depletion to 0    |
| **Clinical Consumption** | `ConsumeStock`   | `-Delta`  | `StockMovementType.CONSUMPTION` with clinical context | Retains clinician actor and treatment session ref |
| **Audit Adjustment In**  | `AdjustStockIn`  | `+Delta`  | `StockMovementType.ADJUSTMENT_IN`                     | Requires $\ge 3$ char justification               |
| **Audit Adjustment Out** | `AdjustStockOut` | `-Delta`  | `StockMovementType.ADJUSTMENT_OUT`                    | Rejects insufficient stock                        |

---

## 3. Concurrency Strategy & Race Condition Proof

### 3.1 Double-Spend Prevention Test

- **Initial Stock**: `10.00` units.
- **Concurrent Operations**:
  - Worker A: Attempts `SellStock` of `7.00` units.
  - Worker B: Attempts `ConsumeStock` of `7.00` units.
- **Execution**: Run in parallel via `Promise.allSettled()` with simulated network latency to ensure simultaneous aggregate mutation attempts.
- **Observed Behavior**:
  - Exactly **one** operation succeeds, decrementing stock to `3.00`.
  - The competing operation fails with an `InventoryOptimisticLockException` or `InsufficientStockException`.
  - Final repository stock balance: **`3.00`** (Strictly adhering to `currentStock >= 0`).
  - Total movement count: Exactly **`2`** (Initial opening + 1 winning transaction).
  - **Zero ledger corruption or phantom decrements**.

---

## 4. Failure Atomicity & Rollback Verification

- **Simulated DB Failure**: Repository `save()` injected with mid-transaction abort exception.
- **Observed Behavior**:
  - `ApplicationResult.fail()` cleanly returned to caller.
  - In-memory aggregate mutations are discarded.
  - Zero movement rows inserted into the database.
  - Domain events are suppressed (never published to message bus).

---

## 5. Deterministic Query Contract & Reorder Tests

1. **`GetStockLevel`**:
   - Reads maintained `quantityOnHand` and `minimumStock` ($O(1)$ lookup).
   - Accurately computes `isLowStock` and `isOutOfStock`.
2. **`GetLowStockProducts`**:
   - Accurately captures items where `currentStock == minimumStock`, `currentStock < minimumStock`, and `currentStock == 0.00`.
   - Strictly excludes surplus items (`currentStock > minimumStock`).
   - Excludes archived items by default.
3. **`ListStockMovements`**:
   - Enforces pagination (`page=1`, `limit=20`, max `100`).
   - Resolves inclusive date boundaries (`fromDate` and `toDate`) with end-of-day UTC expansion.

---

## 6. Asset Valuation & Financial Precision Tests

- **Formula**: Acquisition Cost Baseline $\sum (\text{quantityOnHand}_i \times \text{purchaseCost}_i)$.
- **Fixed Cents Arithmetic**: Exact Scale 2 precision without IEEE 754 floating-point drift:
  - Example: `15` units @ `$19.99` ($299.85) + `8.5` units @ `$7.30` ($62.05) = **`$361.90`**.
- **Edge Cases Tested**:
  - Zero-stock items: contribute exactly `$0.00`.
  - Archived items: excluded from active valuation by default.
  - Empty inventory: evaluates to `$0.00` total value and `0` total units.

---

## 7. Known Limitations & Scope Boundaries

1. **Valuation Method**: Current valuation uses **Standard Acquisition / Purchase Cost**. Moving Average Cost (MAC) and FIFO lot-tracking may be introduced in future enterprise financial modules if required by accounting regulations.
2. **Distributed OCC Retries**: Application layer returns clean OCC failure results to API callers; automatic exponential backoff retry policies can be configured at the API gateway / controller layer.
