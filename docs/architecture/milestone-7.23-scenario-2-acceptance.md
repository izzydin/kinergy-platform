# Milestone 7.23: Scenario 2 Acceptance Certification & Cross-Domain Integration Report

- **Document**: `docs/architecture/milestone-7.23-scenario-2-acceptance.md`
- **Milestone**: Phase 7.23 — End-to-End Sales & Payments Scenarios Verification (Scenario 2)
- **Status**: **PARTIAL** (Commercial Sale & Payment: **PASS**; Automated Inventory Consumption: **OWNER-CONTROLLED SEPARATE FULFILLMENT**)
- **Date**: 2026-10-19
- **Role**: Senior Cross-Domain Integration Architect
- **Target Scenario**: S2 — Healthy Drink Commercial Sale, Payment Lifecycle, and Resources Inventory Boundaries

---

## 1. Executive Summary

Milestone 7.23 Scenario 2 audits, exercises, and certifies the cross-domain commercial checkout of a **Healthy Drink** consumable product between the **Sales & Payments** subsystem and the **Resources Management (Inventory)** subsystem:

$$\text{Healthy Drink Product} \longrightarrow \text{Create Sale} \longrightarrow \text{Authoritative Pricing} \longrightarrow \text{Calculate Total} \longrightarrow \text{Cash Payment} \longrightarrow \text{Sale PAID} \longrightarrow \text{Receipt} \longrightarrow \text{[Inventory Fulfillment]}$$

All domain, application, API, and persistence boundaries were executed against deterministic integration suites without mocking core business logic.

### Evidence-Based Final Determination

| Subsystem / Dimension                 | Determination | Justification & Architectural Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| :------------------------------------ | :-----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sales & Payment Lifecycle**         |  **`PASS`**   | A valid drink transaction creates exactly one Sale (`sourceType: 'DRINK'`). The aggregate enforces DRAFT $\to$ PENDING_PAYMENT $\to$ PAID lifecycle. Payment settles via CASH tender, authoritative total ($6.00) is preserved, idempotent retries prevent duplicates, repeatable purchases of the same SKU are supported, and receipt voucher is accessible.                                                                                                                                                  |
| **Inventory Consumption Integration** | **`PARTIAL`** | **Sales never mutates inventory tables or adjusts stock directly** (zero architectural leakage). The Resources domain provides an owner-controlled fulfillment capability port (`InventoryStockDecrementPort` / `SellStockHandler`), which successfully decrements stock ($15 \to 14$), logs append-only `SALE` movements, and deduplicates retries. However, **automated background saga/event consumption directly from Sales is not implemented**, as no event bus saga exists in the current architecture. |

---

## 2. Canonical Transaction Identity vs. Reusable Catalog Product

In retail concessions (`FOOD`, `DRINK`), a critical architectural distinction exists between **Catalog Product Identity** and **Commercial Transaction Identity** ([ADR-0110](file:///c:/Projects/kinergy-platform/docs/adr/0110-sale-ownership.md), [ADR-0121](file:///c:/Projects/kinergy-platform/docs/adr/0121-sale-source-modeling.md)):

1. **Reusable Consumable Product Identity**:
   - Upstream entity: `InventoryItem` with `category: InventoryCategory.HEALTHY_DRINKS`, `sku: 'DRINK-SMOOTHIE-GRE'`, and primary key `id`.
   - Consumables are **repeatable catalog definitions**. A purchase does not consume or retire the SKU definition. Multiple customers and separate sales legitimately reference the identical `sourceId` repeatedly.
   - The clinical `findBySourceReference` single-billing check strictly exempts `FOOD` and `DRINK` products.
2. **Canonical Commercial Transaction Identity**:
   - The transaction is identified by the caller-supplied commercial identity: `command.id` / `command.idempotencyKey` (e.g. `sale_drink_tx_001`).
   - Retrying the exact transaction identity returns the existing Sale without duplicating persistence rows.
   - Re-executing with the same transaction identity but conflicting parameters is rejected with HTTP 409 Conflict.
   - An independent checkout by another customer generates a new `SaleId`, purchasing the same drink SKU independently.

---

## 3. Real Workflow Trace & Domain Separation

| Step  | Bounded Context             | Component / Handler                              | API / Port Boundary               | Domain Invariant & State Transition                                                                                                                                             |
| :---- | :-------------------------- | :----------------------------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **Resources**               | `InventoryItem` Aggregate                        | Inventory Domain                  | Item seeded in `InventoryCategory.HEALTHY_DRINKS`, `unit: UnitOfMeasure.BOTTLES`, `status: 'ACTIVE'`, `initialStock: 15`, `sellingPrice: $6.00`.                                |
| **2** | **Hexagonal ACL**           | `ResourcesSourceValidatorAdapter`                | `SaleSourceValidatorPort`         | Resolves item via `GetInventoryItemByIdHandler`. Verifies `status === 'ACTIVE'` and `quantityOnHand >= 1`. Converts price to authoritative integer cents (`600` cents = $6.00). |
| **3** | **Sales**                   | `CreateSaleHandler`, `Sale.create()`             | `POST /api/v1/sales`              | Initializes Sale in `DRAFT` status with line item (`Cold-Pressed Green Detox Smoothie 500ml`, qty 1, price $6.00, total $6.00).                                                 |
| **4** | **Sales**                   | `CalculateSaleHandler`                           | `GET /api/v1/sales/:id/calculate` | Read-only calculation of subtotal ($6.00), discount ($0.00), total ($6.00). Zero database mutations.                                                                            |
| **5** | **Sales**                   | `FinalizeSaleHandler`                            | `POST /api/v1/sales/:id/finalize` | Commercial lock: Sale transitions `DRAFT` $\to$ `PENDING_PAYMENT`. Line items and pricing become immutable.                                                                     |
| **6** | **Payments**                | `RecordPaymentHandler` / `CreatePaymentHandler`  | `POST /api/v1/sales/:id/payments` | Records tender method `CASH` for $6.00. Payment becomes `COMPLETED`. Sale transitions `PENDING_PAYMENT` $\to$ `PAID`.                                                           |
| **7** | **Receipts**                | `IssueReceiptHandler`, `GetReceiptBySaleHandler` | `POST & GET /sales/:id/receipt`   | Issues sequential receipt voucher (`REC-YYYY-NNNNNN`). Enforces object-level ownership: staff can access walk-in receipts; unrelated clients are denied (403).                  |
| **8** | **Resources (Fulfillment)** | `SellStockHandler`                               | `InventoryStockDecrementPort`     | **Owner-Controlled Fulfillment**: Decrements stock ($15 \to 14$), logs `StockMovementType.SALE` with `referenceId: 'sale_drink_tx_001:line_1'`. Deduplicates repeated calls.    |

---

## 4. Verification of Domain Boundary Purity

1. **Zero Persistence Leaks**: The Sales bounded context has zero imports of `@prisma/client` inventory models, zero database foreign keys into `inventory_items`, and zero code modifying `quantityOnHand`.
2. **Purity Confirmed by Persistence Reload**:
   - Reloading the `InventoryItem` aggregate after full checkout and payment confirms `quantityOnHand` remains **15** (unmutated by Sales).
   - Reloading the `Sale` aggregate confirms status is **`PAID`** and total is **$6.00**.
   - Reloading the `Payment` aggregate confirms method is **`CASH`** and status is **`COMPLETED`**.
   - Reloading the `Receipt` aggregate confirms status is **`ISSUED`**.

---

## 5. Inventory Consumption Integration Status Analysis

### 5.1 What Is Implemented & Enabled

- **Inventory Stock Decrement Port**: [`InventoryStockDecrementPort`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/ports/inventory-stock-decrement.port.ts) is implemented by [`SellStockHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/handlers/sell-stock.handler.ts).
- **Public API Endpoint**: `POST /api/v1/inventory/items/:id/sell` is exposed on [`InventoryController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/inventory.controller.ts#L495-L519).
- **Ledger Invariants**: Decrementing stock records append-only movements, enforces non-negative stock limits, and supports idempotent deduplication via `referenceId`.

### 5.2 What Is Not Implemented (Pending Architectural Roadmap)

- In accordance with Prompt Constraints:
  > _"If inventory integration is not implemented or enabled, test and document the supported Sales/Payment journey and explicitly mark inventory consumption as pending or out of scope. Do not build an unplanned integration just to make the test pass."_
- **No Background Event Saga**: There is currently no message broker, outbox consumer, or event listener that automatically invokes `SellStockHandler` when `PaymentCompletedEvent` fires.
- **Consistency Model**: The documented and approved consistency model between Sales and Resources is **Separate Owner-Controlled Fulfillment** (or future eventual consistency via Saga). Two-phase commit (2PC) or synchronous distributed transactions across bounded contexts are explicitly prohibited by Kinergy architecture ([ADR-0112](file:///c:/Projects/kinergy-platform/docs/adr/0112-sales-bounded-context.md)).

---

## 6. Test Execution Evidence

### 6.1 Integration Test Suite

- **File**: [`apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-2.e2e.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-2.e2e.spec.ts)
- **Command**: `npx nx test api --testFile=sales-milestone-7-23-scenario-2.e2e.spec.ts`

```text
> nx run api:test --testFile=sales-milestone-7-23-scenario-2.e2e.spec.ts

 PASS   api  apps/api/src/sales/__tests__/sales-milestone-7-23-scenario-2.e2e.spec.ts (6.942 s)
  Milestone 7.23 Scenario 2: Healthy Drink Commercial Sale, Payment, and Resources Integration
    Primary Business Journey: Healthy Drink Sale, Calculation, Cash Payment, and Receipt
      √ executes legitimate healthy-drink checkout, completes cash settlement, and verifies domain boundary independence (71 ms)
    Consumable Retail Repeatability & Idempotency Invariants
      √ Invariant 1: Idempotent network retry returns existing Sale without creating duplicate rows (15 ms)
      √ Invariant 2: Rejects conflicting re-execution with altered parameters under identical transaction ID (7 ms)
      √ Invariant 3: Permits multiple independent commercial sales for the SAME consumable drink product (7 ms)
      √ Invariant 4: Rejects checkout when consumable stock is insufficient (0 on-hand) (3 ms)
      √ Invariant 5: Rejects checkout when consumable drink item is DEACTIVATED (INACTIVE status) (3 ms)
    Owner-Controlled Inventory Fulfillment via Resources Capability Port
      √ executes explicit stock deduction through InventoryStockDecrementPort and verifies ledgering (10 ms)
    Security & Multi-Tenant Boundary Enforcement
      √ enforces strict IAM role authorization and cross-tenant resource concealment (11 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        7.239 s
```

### 6.2 Full Milestone 7.23 Regression Suite

- **Command**: `npx nx test api --testFile=sales-milestone-7-23`
- **Result**: **2 test suites passed, 16 passed, 16 total** (Scenario 1: 8/8 passed, Scenario 2: 8/8 passed).
- **Core Domain Tests**: [`food-drink-sales-integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/__tests__/food-drink-sales-integration.spec.ts) (14/14 passed), [`cross-domain-commercial-integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/cross-domain-commercial-integration.spec.ts) (21/21 passed).
