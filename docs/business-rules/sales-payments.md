# Sales & Payments — Executable Business Rules & Invariants Specification

- **Status**: Authoritative Behavioral Contract Baseline (APPROVED & EXECUTABLE)
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`, `apps/api/src/sales/`)
- **Author**: Principal Business Domain Engineer & Lead Financial Domain Architect
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)

---

## 1. Architectural Responsibility & Invariant Tiers

To maintain strict Clean Architecture boundaries and eliminate misplaced business logic, all business rules within Sales & Payments are classified into five explicit architectural tiers:

```mermaid
flowchart TD
    subgraph L1["Tier 1: Transport & Validation"]
        PV["HTTP DTO Whitelist Validation<br/>• Strip unknown properties<br/>• Non-negative monetary amounts<br/>• ISO-4217 currency validation"]
    end
    subgraph L2["Tier 2: Security & Authorization"]
        AC["AUTHORIZATION & TENANT TIER<br/>• Bearer JWT authentication<br/>• Dot-notation permission guards<br/>• Strict organization isolation (tenantId)"]
    end
    subgraph L3["Tier 3: Application Orchestration"]
        AO["APPLICATION CQRS ORCHESTRATION<br/>• Command / Query handlers<br/>• Port-driven stock/membership fulfillment<br/>• Transactional outbox event publishing<br/>• Actor ID injection"]
    end
    subgraph L4["Tier 4: Pure Domain Invariants"]
        DI["DOMAIN INVARIANT TIER<br/>• Aggregate Root invariants (Sale, Payment)<br/>• 13 exact reconciliation formulas<br/>• Progressive 4-tier immutability<br/>• State machine transitions"]
    end
    subgraph L5["Tier 5: Persistence Integrity"]
        PI["PERSISTENCE INTEGRITY TIER<br/>• PostgreSQL Decimal(12, 2) scale<br/>• Append-only payment tables<br/>• Optimistic Concurrency Control (version)<br/>• Atomic database transactions"]
    end

    PV --> AC --> AO --> DI --> PI
```

---

## 2. Sale Business Rules

| Rule ID       | Rule Statement                                                                                                                                                                                                             | Architectural Tier | Enforcement Mechanism                                                                                                        |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **`SALE-01`** | **Tenant Identity Invariant**: Every `Sale` must be explicitly associated with a non-empty `tenantId` at creation. Cross-tenant mutation or query is strictly impossible.                                                  | `DOMAIN INVARIANT` | `Sale.create({ tenantId, source, ... })` asserts non-empty `tenantId`                                                        |
| **`SALE-02`** | **Cashier Attribution**: Every `Sale` must record the authenticated user ID (`cashierId`) of the staff member who initiated checkout. Request bodies cannot supply `cashierId`.                                            | `SECURITY & APP`   | Extracted from `@CurrentUser().userId`, published in `SaleCreatedEvent`                                                      |
| **`SALE-03`** | **Optional Client Association**: `clientId` is optional (`clientId?: string`). Omitting `clientId` denotes an anonymous walk-in retail purchase. If provided, `clientId` must be non-empty and reference an active client. | `DOMAIN INVARIANT` | `Sale.create()` asserts `clientId !== ''`                                                                                    |
| **`SALE-04`** | **Initial Lifecycle State**: A newly instantiated `Sale` starts strictly in `DRAFT` status.                                                                                                                                | `DOMAIN INVARIANT` | `Sale.create()` initializes `_status = SaleStatus.DRAFT`                                                                     |
| **`SALE-05`** | **Empty Order Finalization Prohibition**: A `Sale` cannot transition out of `DRAFT` to `PENDING_PAYMENT` with zero line items.                                                                                             | `DOMAIN INVARIANT` | `Sale.finalize()` throws `EmptySaleException` (`EMPTY_SALE`)                                                                 |
| **`SALE-06`** | **Single Currency Homogeneity**: Every line item, discount, subtotal, and total within a `Sale` must use the identical ISO-4217 currency. Mixed currencies within a checkout session are rejected.                         | `DOMAIN INVARIANT` | `Sale.addItem()` throws `InvalidSaleStateException` on currency mismatch                                                     |
| **`SALE-07`** | **Non-Negative Total Guard**: The final payable order total (`total`) must always be $\ge 0.00$. Under no circumstance may discounts reduce the total below zero.                                                          | `DOMAIN INVARIANT` | Formula: $\text{total} = \max(0, \text{subtotal} - \text{discountTotal})$                                                    |
| **`SALE-08`** | **Finalization Immutability Milestone**: Once a `Sale` departs `DRAFT`, commercial terms are locked. Items cannot be added, modified, or deleted. Order discounts cannot be altered.                                       | `DOMAIN INVARIANT` | `Sale.assertDraftState()` throws `SaleAlreadyFinalizedException` (`SALE_ALREADY_FINALIZED`)                                  |
| **`SALE-09`** | **Cancellation Permissibility**: A `Sale` may transition to `CANCELLED` from `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID`. Requires a non-empty `cancellationReason`.                                                   | `DOMAIN INVARIANT` | `Sale.cancel(reason)` throws `InvalidSaleStateException` (`INVALID_CANCELLATION_REASON`) or `InvalidSaleTransitionException` |
| **`SALE-10`** | **Full Settlement Transition**: A `Sale` transitions to `PAID` upon full settlement confirmation. Permitted from `PENDING_PAYMENT` or `PARTIALLY_PAID`.                                                                    | `DOMAIN INVARIANT` | `Sale.markPaid()` throws `InvalidSaleTransitionException` from invalid states                                                |
| **`SALE-11`** | **Partial Settlement Transition**: A `Sale` transitions to `PARTIALLY_PAID` upon recording a partial payment tender. Permitted only from `PENDING_PAYMENT`.                                                                | `DOMAIN INVARIANT` | `Sale.markPartiallyPaid()` throws `InvalidSaleTransitionException` from invalid states                                       |
| **`SALE-12`** | **Order Completion Prerequisite**: A `Sale` transitions to `COMPLETED` from `PAID` upon outbound fulfillment confirmation.                                                                                                 | `DOMAIN & APP`     | `Sale.markCompleted()` sets `completedAt`, throws `InvalidSaleTransitionException` if not `PAID`                             |
| **`SALE-13`** | **Compensating Refund Transition**: A `Sale` transitions to `REFUNDED` upon execution of a full compensating refund. Permitted from `PAID` or `COMPLETED`.                                                                 | `DOMAIN INVARIANT` | `Sale.markRefunded(reason?)` sets `refundedAt`, throws `InvalidSaleTransitionException` if not `PAID`/`COMPLETED`            |

---

## 3. SaleItem Business Rules

| Rule ID       | Rule Statement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Architectural Tier     | Enforcement Mechanism                                                                       |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------- | :------------------------------------------------------------------------------------------ |
| **`ITEM-01`** | **Exclusive Parent Ownership**: `SaleItem` has no global identity or standalone repository. It is an internal child entity exclusively created, updated, and persisted through the `Sale` aggregate root (`addItem`, `updateItemQuantity`, `applyItemDiscount`, `removeItemDiscount`, `removeItem`).                                                                                                                                                                                                                                              | `DOMAIN INVARIANT`     | `Sale.addItem()`, `Sale.removeItem()`                                                       |
| **`ITEM-02`** | **Strict Positive Quantity**: Quantity must be a finite, strictly positive number: $$0.001 \le \text{quantity} \le 999,999$$ Normalized to 3 decimal places (`Math.round((q + EPS) * 1000) / 1000`). Values $< 0.0005$ round down to 0 and throw `InvalidSaleItemException`. Values $> 999,999$ are rejected.                                                                                                                                                                                                                                     | `DOMAIN INVARIANT`     | `SaleItem.assertValidQuantity()` throws `InvalidSaleItemException`                          |
| **`ITEM-03`** | **Non-Negative Unit Price Snapshot**: Gross unit price snapshot must be non-negative: $$\text{unitPrice} \ge 0.00$$ Stored as canonical `Money`. Zero-price items represent authorized promotional complimentary gifts. Negative values rejected. Once established, unit price is never dynamically recalculated.                                                                                                                                                                                                                                 | `DOMAIN INVARIANT`     | `Money.create()`, `SaleItem.assertValidUnitPrice()`                                         |
| **`ITEM-04`** | **Permanent Commercial Snapshotting**: `SaleItem` must permanently freeze `description`, `skuOrCode`, and `unitPrice` at checkout. Dynamic SQL joins to source catalog tables at query time are strictly prohibited.                                                                                                                                                                                                                                                                                                                              | `DOMAIN & PERSISTENCE` | Stored as immutable entity fields and standalone columns in `sale_items`                    |
| **`ITEM-05`** | **Unconstrained Source Reference**: `SourceReference` must be recorded as an immutable Value Object (`sourceType`, `sourceId`, `sourceCode`). No relational foreign keys to upstream tables may exist in `schema.prisma`.                                                                                                                                                                                                                                                                                                                         | `DOMAIN INVARIANT`     | `SourceReference` Value Object (`Object.freeze(this)`)                                      |
| **`ITEM-06`** | **Source Existence & Tenant Verification**: When an item is added, Sales queries the owning domain's query port to verify that the entity exists, is `ACTIVE`, and belongs to the identical `tenantId`.                                                                                                                                                                                                                                                                                                                                           | `APPLICATION`          | `AddSaleItemUseCase`                                                                        |
| **`ITEM-07`** | **Item Discount Determinism & Non-Exceeding Guard**: Line-item discounts apply strictly to the item gross subtotal ($\text{eligibleAmount} = \text{lineSubtotal}$). Fixed discounts cannot exceed subtotal; $\text{fixedDiscount} > \text{subtotal}$ is strictly rejected with `InvalidDiscountException` (no silent clamping). Percentage discounts are bounded: $0 \le \text{percentage} \le 100$. Commercial Half-Up cent rounding in integer minor units. Total line discount cannot exceed subtotal, ensuring $\text{lineTotal} \ge \$0.00$. | `DOMAIN INVARIANT`     | `Discount.calculate()`, `SaleItem.discountTotal`                                            |
| **`ITEM-08`** | **Line Net & Total Determinism**: Item financial amounts are calculated deterministically: $$\text{subtotal} = \text{unitPrice} \times \text{quantity}$$ $$\text{total} = \text{subtotal} - \text{discountTotal}$$ Pre-tax line net total is guaranteed $\ge 0.00$. (Tax calculation deferred to Phase 7.3+).                                                                                                                                                                                                                                     | `DOMAIN INVARIANT`     | `SaleItem.subtotal`, `SaleItem.total`, `Money.multiply()`                                   |
| **`ITEM-09`** | **Post-Finalization Freeze**: `SaleItem` attributes, quantities, discounts, and parent collection cannot be updated, adjusted, or deleted once the parent `Sale` departs `DRAFT` status.                                                                                                                                                                                                                                                                                                                                                          | `DOMAIN INVARIANT`     | `Sale.assertDraftState()` throws `SaleAlreadyFinalizedException` (`SALE_ALREADY_FINALIZED`) |

### Historical Snapshot & Discount Traceability Chain

```text
Requirement: REQ-HIST-01 (Historical Commercial Truth) & REQ-DISC-01 (Deterministic Discounts)
    ↓
Business Rules: SALE-08 (Commercial Lock), ITEM-04 (Permanent Snapshot), ITEM-07 (Discount Guard), ITEM-09 (Post-Finalization Freeze)
    ↓
SaleItem Invariants: ITEM-01 (Ownership), ITEM-02 (Quantity), ITEM-03 (Price), ITEM-07 (Discount Bounds & Non-Exceeding)
    ↓
Domain Implementation:
  - packages/core/src/sales/domain/sale.aggregate.ts
  - packages/core/src/sales/domain/entities/sale-item.entity.ts
  - packages/core/src/sales/domain/value-objects/discount.vo.ts
  - packages/core/src/sales/domain/value-objects/source-reference.vo.ts
    ↓
Executable Test Suites:
  - packages/core/src/sales/domain/__tests__/sale-discount-invariants.spec.ts (Phase 7.3 Regression)
  - packages/core/src/sales/domain/__tests__/discount.calculate.spec.ts
  - packages/core/src/sales/domain/__tests__/discount.vo.spec.ts
  - packages/core/src/sales/domain/__tests__/sale-item-historical-snapshot.spec.ts (Scenarios 1–8)
  - packages/core/src/sales/domain/__tests__/sale-item-integration.spec.ts
  - packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts
```

| Traceability Requirement                    | Business Rule        | Domain Rule                                 | Implementation                                  | Verification Test                                                           |
| :------------------------------------------ | :------------------- | :------------------------------------------ | :---------------------------------------------- | :-------------------------------------------------------------------------- |
| **Percentage cannot be negative**           | `ITEM-07`            | $0 \le \text{percentage}$                   | `Discount.percentage()` assertion               | `discount.vo.spec.ts`                                                       |
| **Percentage maximum (100)**                | `ITEM-07`            | $\text{percentage} \le 100$                 | `Discount.percentage()` assertion               | `discount.vo.spec.ts`                                                       |
| **Fixed discount cannot be negative**       | `ITEM-07`, `MNY-05`  | $\text{fixed} \ge 0.00$                     | `Discount.fixed()` assertion                    | `discount.vo.spec.ts`                                                       |
| **Discount cannot exceed eligible amount**  | `ITEM-07`            | $\text{discountAmount} \le \text{eligible}$ | `calculate()` throws `InvalidDiscountException` | `discount.calculate.spec.ts`, `sale-discount-invariants.spec.ts`            |
| **Deterministic calculation**               | `MNY-01`, `MNY-02`   | Half-Up Cent Rounding                       | Minor units in `calculate()`                    | `discount.calculate.spec.ts`                                                |
| **No floating-point financial calculation** | `MNY-01`, ADR-0108   | Integer Cent Arithmetic                     | Strict cent math in `Discount` and `Money`      | `discount.calculate.spec.ts`, `money.vo.spec.ts`                            |
| **Item-level scope**                        | `ITEM-01`, `ITEM-07` | Scope on `SaleItem`                         | `SaleItem.discount` (no order discount)         | `sale-item.entity.spec.ts`, `sale-discount-invariants.spec.ts`              |
| **Historical discount stability**           | `SALE-08`, `ITEM-04` | Frozen Snapshot                             | Frozen terms, locked on finalization            | `sale-item-historical-snapshot.spec.ts`, `sale-discount-invariants.spec.ts` |

---

## 4. Payment Business Rules

| Rule ID      | Rule Statement                                                                                                                                                                                                                                   | Architectural Tier     | Enforcement Mechanism                                     |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------- | :-------------------------------------------------------- |
| **`PAY-01`** | **Autonomous Aggregate Root**: `Payment` is an autonomous aggregate root linked to `Sale` via scalar `saleId`. Multiple payments may settle one sale (`Sale 1 -> 0..* Payment`).                                                                 | `DOMAIN INVARIANT`     | `Payment` aggregate boundary                              |
| **`PAY-02`** | **Strict Positive Tender Amount**: The amount of a charge payment must be strictly positive: $$\text{amount} > 0.00$$ Zero-amount or negative payments are rejected.                                                                             | `DOMAIN INVARIANT`     | `Payment.create()` throws `InvalidPaymentAmountException` |
| **`PAY-03`** | **Tender Method Taxonomy**: Currently supported payment methods are strictly: `CASH`, `QR`. The architecture intentionally leaves room for `CARD`, `TRANSFER`, `ONLINE` without implementing them yet (`InvalidPaymentMethodException`).         | `DOMAIN INVARIANT`     | `PaymentMethod` enum & domain guard                       |
| **`PAY-04`** | **Implemented Payment State Taxonomy**: Exact implemented payment states are strictly: `PENDING`, `SETTLED`, `FAILED`, `CANCELLED` (no `AUTHORIZED` or intermediate hold state exists in Phase 7.5).                                             | `DOMAIN INVARIANT`     | `PaymentStatus` enum                                      |
| **`PAY-05`** | **Tender Initiation**: Cash tenders create directly settled records (`createSettled()`) with immediate `paidAt` timestamp. Asynchronous tenders (`QR`) create pending records (`createPending()`) with `paidAt = null`.                          | `DOMAIN INVARIANT`     | `Payment.createSettled()`, `Payment.createPending()`      |
| **`PAY-06`** | **Settlement Transition**: A payment transitions `PENDING` $\rightarrow$ `SETTLED` via `payment.settle(clock?)`. Funds collection is confirmed, immutable `paidAt` timestamp is recorded, and parent `Sale` balance is updated.                  | `DOMAIN INVARIANT`     | `Payment.settle()`, `SettlePaymentHandler`                |
| **`PAY-07`** | **Settlement Immutability Invariant**: A `Payment` in `SETTLED` status is **permanently immutable**. Zero in-place mutations or deletions are permitted. State transitions out of `SETTLED` are strictly prohibited.                             | `DOMAIN & PERSISTENCE` | `Payment.settle()`, DB FK `RESTRICT`                      |
| **`PAY-08`** | **Electronic Overpayment Prohibition**: An electronic payment (`QR`) cannot exceed the outstanding balance: $$\text{Payment.amount} \le \text{Sale.balanceRemaining}$$ Attempts to charge an amount exceeding the balance are rejected with 422. | `APPLICATION`          | `RecordPaymentHandler`                                    |
| **`PAY-09`** | **Cash Overpayment & Change Handling**: When physical cash tendered exceeds the balance: `Payment.amount` is recorded as the exact balance-settling amount; the POS captures `tenderedAmount` and `changeGiven` for drawer balancing.            | `APPLICATION & UI`     | `RecordPaymentHandler`                                    |
| **`PAY-10`** | **Partial Payment Acceptance**: Partial payments are permitted. Settling a partial payment decrements `Sale.balanceRemaining` and places the sale in `PARTIALLY_PAID`.                                                                           | `DOMAIN INVARIANT`     | `Sale.markPartiallyPaid()`, `RecordPaymentHandler`        |
| **`PAY-11`** | **Tender Cancellation**: A payment may transition to `CANCELLED` only from `PENDING` via `payment.cancel(reason?, clock?)`. Settled payments cannot be cancelled. Once cancelled, it is terminal.                                                | `DOMAIN INVARIANT`     | `Payment.cancel()`, `CancelPaymentHandler`                |
| **`PAY-12`** | **Append-Only Compensating Refunds**: Refunds are never in-place mutations of original payments. Refunds are autonomous compensating records (`PaymentRefund` or direction `REFUND`) referencing `originalPaymentId` and `saleId`.               | `DOMAIN INVARIANT`     | `RefundPaymentUseCase` (Phase 7.x extension)              |
| **`PAY-13`** | **Refund Ceiling**: The cumulative refunded amount for a payment cannot exceed the original settled tender amount: $$\sum \text{Refunds} \le \text{originalPayment.amount}$$                                                                     | `DOMAIN INVARIANT`     | `Payment.assertRefundWithinLimit()`                       |

---

## 5. Receipt Business Rules

| Rule ID      | Rule Statement                                                                                                                                                                                                                                                                                            | Architectural Tier | Enforcement Mechanism                         |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- | :-------------------------------------------- |
| **`REC-01`** | **Voucher Nature (Not Financial Truth)**: A `Receipt` is an immutable, customer-facing legal proof-of-purchase voucher. Financial source of truth resides strictly in `Sale` and settled `Payment` aggregates. Formally defined in [ADR-0117](../adr/0117-receipt-domain-boundary-and-document-model.md). | `DOMAIN LAW`       | Architectural documentation & model           |
| **`REC-02`** | **Automatic Issuance Trigger**: A `Receipt` is generated automatically when a `Sale` transitions to `PAID` (full settlement). Receipt issuance is strictly prohibited for `DRAFT`, `PENDING_PAYMENT`, and `CANCELLED` sales.                                                                              | `APPLICATION`      | `IssueReceiptUseCase`                         |
| **`REC-03`** | **Sequential Monotonic Numbering**: Every receipt receives a gap-free, monotonically increasing alphanumeric receipt number per tenant (e.g. `REC-2026-000421`). Counter is tenant-partitioned.                                                                                                           | `PERSISTENCE`      | Database sequence / counter table             |
| **`REC-04`** | **Permanent Data Immutability**: Once created, a `Receipt` record can never be updated or deleted. Database foreign key constraints enforce `RESTRICT` on parent sales.                                                                                                                                   | `PERSISTENCE`      | DB triggers / Prisma middleware               |
| **`REC-05`** | **No Receipt Regeneration / Idempotency**: A settled transaction cannot generate a second primary receipt. Exactly one primary receipt exists per `(tenantId, saleId)`. Duplicate customer requests must re-render the existing receipt snapshot.                                                         | `APPLICATION`      | `IssueReceiptUseCase` & `GetReceiptByIdQuery` |
| **`REC-06`** | **Mandatory Duplicate Watermark**: Any reprint of an existing receipt must visibly render a `DUPLICATE / REPRINT` watermark, display the reprint timestamp, and log cashier attribution.                                                                                                                  | `APPLICATION & UI` | `RenderReceiptView`                           |
| **`REC-07`** | **Refund Voucher Separation**: Refunding a sale does not mutate or void the original receipt. A separate `RefundReceipt` or `CreditNote` (e.g. `CN-2026-000012`) is generated.                                                                                                                            | `DOMAIN INVARIANT` | `IssueCreditNoteUseCase`                      |
| **`REC-08`** | **Zero Runtime Database Joins**: Point-in-time customer and item attributes are permanently snapshotted in the `Receipt`. Relational joins to live catalog or client profile records on read are prohibited.                                                                                              | `DOMAIN INVARIANT` | `Receipt` Snapshot Value Objects              |
| **`REC-09`** | **Accounting & Fiscal Exclusion**: General ledger accounting, double-entry bookkeeping, tax accounting/VAT declarations, and fiscal printer hardware drivers are strictly out of scope for the Receipt domain.                                                                                            | `ARCHITECTURE`     | Context Boundary Enforcement                  |

---

## 6. Deterministic Money & Arithmetic Rules

> **There is exactly one canonical monetary policy for Sales.**
>
> In accordance with [ADR-0108](../adr/0108-money-representation.md) and [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md), all monetary calculations, conversions, persistence mappings, and API serializations in Phase 7 must strictly execute through this unified policy. Binary floating-point arithmetic (IEEE 754), `parseFloat()`, `Number()`, and `toFixed()` are strictly prohibited as calculation mechanisms.

The domain enforces the following **canonical reconciliation formulas**, executing in integer cents (`Math.round((amount + Number.EPSILON) * 100)`):

```text
1. Line Subtotal:
   lineSubtotal = round(round(unitPrice.amount * 100 + Number.EPSILON) * quantity + Number.EPSILON) / 100

2. Line Discount (Phase 7.3 Item-Level Discount):
   eligibleAmount = lineSubtotal
   lineDiscount = discount ? discount.calculate(eligibleAmount) : Money.zero(currency)
   (Fixed discount > eligibleAmount is strictly rejected; percentage 0 <= p <= 100)
   (Guaranteeing lineDiscount <= lineSubtotal and lineNet >= 0.00)

3. Line Net Amount (Pre-Tax):
   lineNet = lineSubtotal - lineDiscount

4. Line Tax:
   lineTax = round(lineNet * taxRate * 100) / 100  (Deferred to Tax Milestone)

5. Line Total:
   lineTotal = lineNet + lineTax

6. Sale Gross Subtotal:
   saleSubtotal = Sum(lineSubtotal[i])

7. Sale Total Line Discounts:
   saleDiscountTotal = Sum(lineDiscount[i])

8. Sale Net (Pre-Tax, Pre-Order Discount):
   saleNet = saleSubtotal - saleDiscountTotal

9. Order-Level Discount:
   (Deferred / Out-of-Scope for Phase 7.3 & 7.4; orderDiscount = null)

10. Total Discounts:
    totalDiscounts = saleDiscountTotal

11. Total Sale Tax:
    saleTaxTotal = Sum(lineTax[i])

12. Sale Total (Final Net Payable):
    saleTotal = saleSubtotal - saleDiscountTotal + saleTaxTotal
    (Guaranteed >= 0.00 since each lineDiscount <= lineSubtotal)

13. Balance Remaining:
    balanceRemaining = max(0, saleTotal - Sum(SettledPayments.amount))
```

### Money Representation & Precision Rules

| Rule ID      | Rule Statement                                                                                                                                                                                                                                                                                     | Architectural Tier | Enforcement Mechanism                               |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- | :-------------------------------------------------- |
| **`MNY-01`** | **Integer Minor-Unit Math**: All intermediate addition, subtraction, and multiplications must operate on 64-bit safe integer minor units (cents) via `Math.round((amount + Number.EPSILON) * 100)`. Float arithmetic is banned.                                                                    | `DOMAIN INVARIANT` | `Money` Value Object                                |
| **`MNY-02`** | **Commercial Half-Up Cent Rounding**: Fractional cent calculations must round half-up at the 2nd decimal place: $$\text{cents} = \text{round}((\text{rawUnits} + \text{Number.EPSILON}) \times 100)$$ Half-way values ($0.005$) round away from zero.                                              | `DOMAIN INVARIANT` | `Money.round()`, `Discount.calculate()`             |
| **`MNY-03`** | **Database Scale & Precision**: Persisted in PostgreSQL as fixed-point decimal `@db.Decimal(12, 2)` (supporting amounts up to $\$9,999,999,999.99$).                                                                                                                                               | `PERSISTENCE`      | `schema.prisma`                                     |
| **`MNY-04`** | **Structured API Serialization**: Emitted over REST JSON as structured `MoneyResponseDto` (`{ "amount": 49.99, "currency": "USD", "formatted": "49.99", "cents": 4999 }`) and flat summaries (`subtotalAmount`, `discountTotalAmount`, `totalAmount`). Never serialized as unformatted raw floats. | `TRANSPORT`        | `MoneyResponseDto` serializer                       |
| **`MNY-05`** | **Non-Negative Guard**: Prices, subtotals, totals, payments, and discounts must be $\ge 0.00$. Negative values are rejected by constructor assertion.                                                                                                                                              | `DOMAIN INVARIANT` | `Money.create()` throws `InvalidMoneyException`     |
| **`MNY-06`** | **Prohibited Calculation Mechanism**: Using `0.1 + 0.2`, `parseFloat()`, `Number()`, or `toFixed()` as domain calculation mechanisms is strictly prohibited.                                                                                                                                       | `DOMAIN & CI`      | Lint rules & domain invariant tests                 |
| **`MNY-07`** | **Discrete Rounding Timing**: Rounding occurs immediately at discrete commercial snapshot boundaries (`SaleItem.create`, `discount.calculate`). Line items are already cent-exact; summing items introduces zero drift.                                                                            | `DOMAIN INVARIANT` | `SaleItem.create()`, `Sale.recalculateTotals()`     |
| **`MNY-08`** | **Quantity Precision**: Quantity supports up to 3 decimal places ($0.001$), normalized via `Math.round((q + Number.EPSILON) * 1000) / 1000`. Range: $0.001 \le q \le 999,999$.                                                                                                                     | `DOMAIN INVARIANT` | `SaleItem.assertValidQuantity()`                    |
| **`MNY-09`** | **Currency Homogeneity**: Every line item, discount, subtotal, and total within a `Sale` must match the parent Sale's 3-letter ISO-4217 currency code.                                                                                                                                             | `DOMAIN INVARIANT` | `Sale.addItem()` throws `InvalidSaleStateException` |
| **`MNY-10`** | **Reconstitution Verification**: Aggregate reconstitution must recalculate all line subtotals and discounts from scratch. Any mismatch against persisted totals strictly throws `InvalidSaleStateException`.                                                                                       | `DOMAIN INVARIANT` | `Sale.reconstitute()`, `SaleItem.reconstitute()`    |

---

## 7. Organization & Multi-Tenant Isolation Rules

| Rule ID      | Rule Statement                                                                                                                                                                                                                                                                                          | Architectural Tier | Enforcement Mechanism                                  |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------- | :----------------------------------------------------- |
| **`ORG-01`** | **Cross-Tenant Sale Isolation**: Every sale query and command requires verified `tenantId`. A user cannot view or mutate a `Sale` belonging to another organization.                                                                                                                                    | `SECURITY & APP`   | `where: { id, tenantId }`; throws `404 / 403`          |
| **`ORG-02`** | **Cross-Tenant Payment Isolation**: A `Payment` can only settle a `Sale` where `payment.tenantId === sale.tenantId === context.tenantId`.                                                                                                                                                               | `DOMAIN & APP`     | Handler assertion                                      |
| **`ORG-03`** | **Cross-Tenant Receipt Isolation**: Receipts are partitioned by `tenantId`. Numbering sequences advance independently per tenant.                                                                                                                                                                       | `PERSISTENCE`      | Multi-column sequence key `(tenant_id, sequence_name)` |
| **`ORG-04`** | **Cross-Tenant SourceReference Guard**: Capability query ports resolving catalog items (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`) assert `sourceItem.tenantId === context.tenantId`. Attempting to sell an item belonging to another tenant is rejected with `TenantMismatchException`. | `APPLICATION`      | `SourceVerificationPort`                               |

---

## 8. Authorization & Access Control Rules

In accordance with Phase 1 IAM architecture, permissions follow canonical dot notation:

| Rule ID       | Operation                                                    | Required Permission | Allowed Roles                                                  | Classification            |
| :------------ | :----------------------------------------------------------- | :------------------ | :------------------------------------------------------------- | :------------------------ |
| **`AUTH-01`** | View sales orders and order summaries                        | `sales.read`        | `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff` | **Read-Only**             |
| **`AUTH-02`** | Create new checkout sessions & add draft items               | `sales.create`      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`            | **Transactional**         |
| **`AUTH-03`** | Apply discretionary discounts above cashier limit ($> 15\%$) | `sales.manage`      | `Owner`, `Manager`                                             | **Financially Sensitive** |
| **`AUTH-04`** | Cancel or void a draft or finalized sale                     | `sales.cancel`      | `Receptionist` (drafts), `Owner`/`Manager` (finalized)         | **Destructive**           |
| **`AUTH-05`** | View payment transaction histories & gateway logs            | `payments.read`     | `Owner`, `Manager`, `Receptionist`                             | **Read-Only**             |
| **`AUTH-06`** | Record cash tender or trigger terminal payment               | `payments.create`   | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`            | **Transactional**         |
| **`AUTH-07`** | Authorize compensating refunds or manual exceptions          | `payments.manage`   | `Owner`, `Manager`                                             | **Financially Sensitive** |
| **`AUTH-08`** | View and download customer receipts                          | `receipts.read`     | `Owner`, `Manager`, `Receptionist`, `Trainer`, `Client` (own)  | **Read-Only**             |
| **`AUTH-09`** | Authorize duplicate receipt reprints or credit notes         | `receipts.manage`   | `Owner`, `Manager`, `Receptionist` (reprints)                  | **Financially Sensitive** |

### Backward Compatibility

- Tokens with `billing.read` grant `sales.read`, `payments.read`, and `receipts.read`.
- Tokens with `billing.write` grant `sales.create` and `payments.create`.

---

## 9. Audit & Security Rules

### 9.1 Business Audit Logging (Durable Compliance Events)

| Rule ID      | Event Trigger                           | Audited Event Name        | Payload Captured                                                                                |
| :----------- | :-------------------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------- |
| **`AUD-01`** | `Sale` enters `PENDING_PAYMENT`         | `SaleFinalized`           | `saleId`, `tenantId`, `cashierId`, `totalAmount`, `itemCount`, timestamp                        |
| **`AUD-02`** | `Sale` enters `CANCELLED`               | `SaleCancelled`           | `saleId`, `tenantId`, `actorId`, `cancellationReason`, timestamp                                |
| **`AUD-03`** | Discretionary discount override applied | `DiscountOverrideApplied` | `saleId`, `tenantId`, `actorId`, `authorizedByUserId`, `discountValue`, `reason`                |
| **`AUD-04`** | `Payment` enters `SETTLED`              | `PaymentSettled`          | `paymentId`, `saleId`, `tenantId`, `cashierId`, `method`, `amount`, timestamp                   |
| **`AUD-05`** | Payment terminal/gateway failure        | `PaymentFailed`           | `paymentId`, `saleId`, `tenantId`, `method`, `errorCode`, `reason` (Security Log)               |
| **`AUD-06`** | Compensating refund executed            | `PaymentRefunded`         | `refundId`, `originalPaymentId`, `saleId`, `tenantId`, `authorizedByUserId`, `amount`, `reason` |
| **`AUD-07`** | Customer receipt generated              | `ReceiptIssued`           | `receiptId`, `receiptNumber`, `saleId`, `tenantId`, `totalAmount`, timestamp                    |
| **`AUD-08`** | Duplicate receipt reprint performed     | `ReceiptReprinted`        | `receiptId`, `receiptNumber`, `saleId`, `tenantId`, `actorId`, timestamp (Security Log)         |

### 9.2 Excluded Ephemeral Cart Churn

- Draft cart modifications (`SaleItemAddedToDraft`, `SaleItemQuantityChangedInDraft`) are **NOT** business audit events. They are captured exclusively in transient application debug logs to prevent audit database pollution.

### 9.3 Sensitive Payment Data Redaction (PCI-DSS)

| Rule ID      | Rule Statement                                                                                                                                          | Architectural Tier | Enforcement Mechanism                     |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------- | :---------------------------------------- |
| **`SEC-01`** | **Primary Account Number (PAN) Prohibition**: Full 16-digit card numbers must never be logged, cached, or persisted in application databases.           | `INFRASTRUCTURE`   | Zero PAN storage policy; PCI tokenization |
| **`SEC-02`** | **Sensitive Authentication Data (SAD) Prohibition**: Card CVV/CVC, expiration dates, terminal PINs, and PIN blocks must never enter the backend API.    | `TRANSPORT`        | Client-side PSP iframe tokenization       |
| **`SEC-03`** | **Provider Secret Protection**: Gateway secret keys, terminal HMAC secrets, and webhook signing secrets must never appear in log payloads.              | `INFRASTRUCTURE`   | Environment secrets manager               |
| **`SEC-04`** | **Permitted Cardholder Data**: Only card brand (`VISA`), masked PAN (`**** **** **** 4242`), and external reference (`ch_123`) may be logged or stored. | `APPLICATION`      | Payload sanitization interceptor          |

---

## 10. Traceability Matrix

### 10.1 Phase 7.1 Sale Domain Traceability

```text
Business Requirement
        ↓
Business Rule
        ↓
Sale Domain Rule
        ↓
Sale Aggregate Behavior
        ↓
Domain Test
```

| Business Requirement             | Business Rule                   | Domain Concept                        | Domain Behavior Guarantee                                                                           | Phase 7.1 Automated Test Suite (`packages/core/src/sales/domain/`)                                                                  |
| :------------------------------- | :------------------------------ | :------------------------------------ | :-------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-Service POS Checkout**   | `SALE-01`, `SALE-05`, `ITEM-05` | `Sale`, `SaleItem`, `SourceReference` | `Sale.create()`, `Sale.addItem()`, `Sale.finalize()`                                                | [`__tests__/sale.aggregate.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)                       |
| **Price & Catalog Decoupling**   | `ITEM-04`, `ITEM-09`            | `SaleItem` snapshot attributes        | `SaleItem.create()`, `SaleItem.reconstitute()` freeze description, SKU, unitPrice, discount         | [`__tests__/sale-item.entity.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)                   |
| **Positive Quantity & Pricing**  | `ITEM-02`, `ITEM-03`            | `SaleItem` domain invariants          | Rejects zero/negative quantities, normalizes to 3 decimals, enforces non-negative Money             | [`__tests__/sale-item.entity.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)                   |
| **Exact Cent Reconciliation**    | `MNY-01`, `MNY-02`, `SALE-07`   | `Money` VO, 13 Formulas               | `recalculateTotals()` computes subtotals, item discounts, order discount, and total payable $\ge 0$ | [`__tests__/sale.aggregate.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)                       |
| **Commercial Immutability**      | `SALE-08`, `ITEM-09`            | Progressive Immutability Milestone    | `assertDraftState()` blocks adding, removing, editing items or discounts after departing `DRAFT`    | [`__tests__/sale-hardening.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)                       |
| **Collection Safety**            | `ITEM-01`, `SALE-08`            | Encapsulated Collections              | `items` getter returns `Object.freeze([...items])`; date getters return defensive clones            | [`__tests__/sale-hardening.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)                       |
| **7-State Commercial Lifecycle** | `SALE-04`, `SALE-09` to `13`    | `SaleStatus` State Machine            | `finalize()`, `markPartiallyPaid()`, `markPaid()`, `markCompleted()`, `markRefunded()`, `cancel()`  | [`__tests__/sale-lifecycle.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)                       |
| **Cancellation Invariants**      | `SALE-09`                       | Order Cancellation Rule               | Allowed from `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`; requires non-empty reason string         | [`__tests__/sale-lifecycle.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)                       |
| **Deterministic Domain Errors**  | `SALE-05`, `SALE-08`, `SALE-09` | `SaleDomainException` Hierarchy       | Throws typed errors with machine-readable `code` properties (`EMPTY_SALE`, etc.)                    | [`__tests__/sale-deterministic-errors.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-deterministic-errors.spec.ts) |
| **Failure Atomicity**            | `SALE-01` to `SALE-13`          | Aggregate Consistency Boundary        | Failed operations abort prior to mutation; zero uncommitted events staged                           | [`__tests__/sale-deterministic-errors.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-deterministic-errors.spec.ts) |
| **Exception Inheritance**        | `SALE-05`, `SALE-08`            | Domain Exception Classes              | Prototype chain preserved (`instanceof Error`, `instanceof SaleDomainException`)                    | [`exceptions/exceptions.spec.ts`](file:///packages/core/src/sales/domain/exceptions/exceptions.spec.ts)                             |
| **Discount Boundaries & Caps**   | `SALE-07`, `ITEM-07`            | `Discount` Value Object               | Validates percentage ($0-100\%$) and fixed amount; caps reduction at subtotal; requires reason      | [`__tests__/discount.vo.spec.ts`](file:///packages/core/src/sales/domain/__tests__/discount.vo.spec.ts)                             |
| **Unconstrained Source Ref**     | `ITEM-05`                       | `SourceReference` Value Object        | Validates sourceType, scalar sourceId, optional sourceCode without cross-context foreign keys       | [`__tests__/source-reference.vo.spec.ts`](file:///packages/core/src/sales/domain/__tests__/source-reference.vo.spec.ts)             |

### 10.2 Milestone Implementation & Verification Status

| Milestone     | Area Covered                                        | Implemented & Certified Status                                          | Governing Test Suites                                                                                                                   |
| :------------ | :-------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 7.1** | Sale Domain Foundation & Invariants                 | **CERTIFIED PASS** (`docs/architecture/sales-foundation-acceptance.md`) | `sale.aggregate.spec.ts`, `sale-lifecycle.spec.ts`, `sale-hardening.spec.ts`                                                            |
| **Phase 7.2** | SaleItem Entity & Historical Snapshots              | **CERTIFIED PASS** (`docs/architecture/sale-item-acceptance.md`)        | `sale-item.entity.spec.ts`, `sale-item-historical-snapshot.spec.ts`                                                                     |
| **Phase 7.3** | Item-Level Discounts & Bounds                       | **CERTIFIED PASS** (`docs/architecture/discount-domain-acceptance.md`)  | `discount.vo.spec.ts`, `phase-7-3-discount-test-matrix.spec.ts`                                                                         |
| **Phase 7.4** | Deterministic Sale Totals, Money Rules & Safety Net | **CERTIFIED PASS** (`docs/architecture/sale-totals-acceptance.md`)      | `sale-application-totals.spec.ts`, `monetary-precision-safety-net.spec.ts`, `sales-monetary-anti-patterns.spec.ts`                      |
| **Phase 7.5** | Multi-Tender Settlement & Payments                  | **CERTIFIED PASS** (`docs/architecture/payment-domain-acceptance.md`)   | `payment.aggregate.spec.ts`, `payment-application.spec.ts`, `phase-7-5-payment-qa-safety-net.spec.ts`, `payments-qa-safety-net.spec.ts` |
| **Phase 7.6** | Payment State Machine & Lifecycle Determinism       | **CERTIFIED PASS** (`docs/architecture/payment-domain-acceptance.md`)   | `payment-lifecycle-qa-matrix.spec.ts`, `payments-lifecycle-api-qa.spec.ts`                                                              |
