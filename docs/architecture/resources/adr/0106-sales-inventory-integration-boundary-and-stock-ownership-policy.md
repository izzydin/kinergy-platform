# ADR 0106: Sales ↔ Inventory Integration Boundary and Stock Ownership Policy

- **Status**: Accepted
- **Date**: 2026-09-11
- **Author**: Senior Domain Architect
- **Domain**: Resources (Consumable Inventory) / Commercial Integration Boundary

---

## 1. Context & Problem Statement

As Kinergy plans for future commercial workflows (Point-of-Sale retail sales, online class registrations with consumable packages, nutrition/food orders, WhatsApp automated bookings, recurring subscriptions), a fundamental architectural boundary must be established:

**Who owns inventory stock mutations and inventory business invariants?**

In naive monolithic architectures, Sales modules often bypass domain boundaries and directly execute SQL/Prisma updates:

```ts
// ANTIPATTERN (FORBIDDEN IN KINERGY):
await prisma.inventoryItem.update({
  where: { id: lineItem.productId },
  data: { quantityOnHand: { decrement: lineItem.quantity } },
});
```

This antipattern produces catastrophic architectural debt:

1. **Bypasses Domain Invariants**: Circumvents negative-stock policies, shelf-life verification, item active status, and minimum thresholds.
2. **Double-Ledger Desynchronization**: Updates physical stock quantity without appending immutable `StockMovement` records, destroying valuation (FIFO/WAVG) and audit trails.
3. **Lost Updates & Concurrency Anomalies**: Bypasses Optimistic Concurrency Control (OCC `version`), allowing concurrent sales to drive stock below zero.
4. **Scattered Business Logic**: Forces every consumer (POS, Food, Subscriptions, API) to duplicate validation and deduction math.

---

## 2. Mandatory Stock Ownership Rule

> **The Inventory Domain owns ALL stock mutation rules.**

Specifically, the Inventory domain strictly and exclusively owns:

- Current stock quantity tracking (`quantityOnHand`, `allocatedQuantity`, `availableQuantity`).
- Immutable stock movement append-only ledger (`StockMovement`).
- Negative-stock prevention invariants.
- Optimistic Concurrency Control (`version` checking and retry mechanisms).
- Stock movement validation (product active state, positive non-zero quantity).
- Stock valuation impacts (FIFO layer depletion, moving average recalculation).

### Invariant for External Domains (Sales, Orders, Subscriptions)

**Sales MUST NOT directly update:**

- `Product` stock or `InventoryItem` records.
- Inventory database tables.
- Stock movement ledger records.

Sales and all other prospective consumers are strictly **downstream callers of the Inventory Application Port**.

---

## 3. Current Codebase State: Sales Module Audit

A comprehensive reconnaissance of the Kinergy codebase confirmed:

- **No Sales domain or module currently exists.**
- In accordance with Milestone 6.16 principles, **no speculative Sales module or tables were created.**
- Instead, the integration contract has been formalized and validated via an application port in the Resources domain (`InventoryStockDecrementPort`).

---

## 4. Architectural Boundary

Kinergy enforces hexagonal architecture. The integration boundary follows this unidirectional dependency chain:

```text
  [ Future Sales Module / Food Orders / WhatsApp Consumer ]
                          │
                          ▼ (Dependency Injection / Contract)
             InventoryStockDecrementPort
                          │
                          ▼
                   SellStockHandler
                          │
                          ▼
              StockOperationOrchestrator
                          │
                          ▼
            InventoryItem Aggregate Root (Domain)
                          │ (Applies OCC, Invariants, Movement)
                          ▼
                 InventoryItemRepository
                          │
                          ▼
                      Database
```

### Application Port Contract

The port contract is defined at `packages/core/src/resources/application/ports/inventory-stock-decrement.port.ts`:

```typescript
export interface DecrementStockParams {
  tenantId: string;
  itemId: string;
  quantity: number;
  referenceType?: string; // e.g., 'SALE', 'POS_ORDER', 'SUBSCRIPTION'
  referenceId?: string; // e.g., 'sale-order-10492'
  performedBy: string; // Phase 1 IAM User ID
  notes?: string;
}

export interface InventoryStockDecrementPort {
  sellStock(params: DecrementStockParams): Promise<ApplicationResult<void>>;
}
```

The application port implementation delegates directly to `SellStockHandler`, reusing the hardened `StockOperationOrchestrator` which guarantees:

1. Active tenant isolation (`tenantId`).
2. Input parameter validation (rejects `<= 0` quantities, missing IDs).
3. Existence and active status check of the `InventoryItem`.
4. Domain invariant enforcement (rejection if `quantityOnHand < quantity`).
5. Transactional atomicity: decrements stock and appends a `StockMovement` (type `SALE`) in a single atomic commit.
6. OCC version incrementing and conflict protection.

---

## 5. Transaction Boundary & Atomicity Analysis

### Does Sale Creation + Inventory Decrease Require a Distributed Transaction?

**No.** Kinergy explicitly avoids distributed 2-phase commit (2PC) transactions.

When a Sales module is implemented in the future, the transaction boundary is structured as follows:

1. **Option A: Modular Monolith Shared Transaction (Prisma Client)**
   - If both Sales and Inventory run in the same physical modular monolith database, Sales initiates an application use case. Sales creates the order record, calls `InventoryStockDecrementPort.sellStock(...)`, and if the result is `isFailure`, Sales rolls back its transaction and returns a 422 Unprocessable Entity (`INSUFFICIENT_STOCK`).
2. **Option B: Two-Phase Local Reservation / Orchestrated Workflow**
   - Step 1: Sales receives a checkout request.
   - Step 2: Sales invokes `InventoryStockDecrementPort.sellStock(...)`.
   - Step 3:
     - **Success**: Sales writes the completed `Order` record with state `PAID_FULFILLED`.
     - **Failure**: Sales cancels the checkout session immediately, explaining to the customer: _"Insufficient stock available"_.
   - **Compensating Action**: If payment or receipt generation fails downstream, Sales calls `InventoryStockRestockPort.returnStock(...)` to restock the item with movement type `RETURN`.

Under no circumstances does Sales write directly to Inventory tables inside its own transaction block.

---

## 6. Concurrency & Negative-Stock Guarantees

The `InventoryItem` aggregate utilizes Optimistic Concurrency Control (OCC):

- Every read retrieves the entity's current `version`.
- During stock decrements, the repository executes:
  ```sql
  UPDATE inventory_items
  SET quantity_on_hand = quantity_on_hand - :qty,
      version = version + 1
  WHERE id = :id AND version = :expectedVersion;
  ```
- If another concurrent sale decremented stock simultaneously, the version check fails with `ConcurrencyConflictError`.
- The orchestrator retries up to 3 times with exponential backoff.
- If stock is exhausted during retries, the domain throws `InsufficientStockError`, cleanly rejecting the second sale with zero negative stock and zero phantom movement records.

---

## 7. Future Consumer Compatibility

This boundary natively supports all future consumers without changes to core inventory logic:

- **POS Cash Register**: Calls `sellStock` with `referenceType: 'POS_TERMINAL'`.
- **Food & Beverage Kitchen**: Calls `sellStock` with `referenceType: 'KITCHEN_ORDER'`.
- **WhatsApp Bot**: Calls `sellStock` with `referenceType: 'WHATSAPP_CHECKOUT'`.
- **Member Subscriptions**: Calls `sellStock` with `referenceType: 'SUBSCRIPTION_RENEWAL'`.

All consumers obtain deterministic failure messages, audit trails, and strict tenant isolation for free.

---

## 8. Verification & Testing

The boundary contract has been verified with comprehensive unit and contract tests in `packages/core/src/resources/application/__tests__/sales-inventory-integration-port.spec.ts`:

- Retail sale deduction with verified ledger entry (`SALE`).
- Negative stock rejection without state change or ledger pollution.
- Rejection of invalid quantities (zero, negative numbers).
- Rejection of non-existent items.
- Multi-tenant boundary enforcement (cannot sell across tenants).
