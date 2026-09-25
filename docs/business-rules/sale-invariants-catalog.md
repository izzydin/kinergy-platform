# Authoritative Sale Invariant Catalog — Milestone 7.8

- **Status**: Authoritative Architectural Baseline (APPROVED & EXECUTABLE)
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`, `apps/api/src/sales/`)
- **Aggregate Root**: `Sale` (`packages/core/src/sales/domain/sale.aggregate.ts`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](../adr/0119-sale-aggregate-boundary-and-invariants.md)
- **Executable Test Suite**: [`packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)

---

## 1. Overview and Invariant Hierarchy

The `Sale` aggregate root is the transactional consistency boundary for commercial checkout transactions in the Kinergy Platform. This catalog establishes the formal specification of all business and technical invariants governing the `Sale` aggregate, its child entities (`SaleItem`), and its cross-aggregate boundaries with `Payment` and `Receipt`.

Every invariant in this catalog specifies:

1. **Identifier**: Unique machine-readable code (`SALE-001` through `SALE-021`).
2. **Description**: Exact behavioral requirement and mathematical constraint.
3. **Enforcement Location**: Domain class, method, or architectural layer where enforcement is guaranteed.
4. **Failure Behavior**: Specific domain exception class, error code, and HTTP mapping.
5. **Test Coverage**: Executable automated test suites proving invariant compliance.
6. **Architectural Justification**: Business or distributed systems rationale justifying the constraint.

---

## 2. Master Invariant Catalog Matrix

| Invariant ID   | Name / Short Summary                            | Enforcement Location                                  | Failure Behavior                                                              | Test Coverage                                                                          |
| :------------- | :---------------------------------------------- | :---------------------------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **`SALE-001`** | Commercial Non-Emptiness                        | `Sale.finalize()`                                     | `EmptySaleException` (`EMPTY_SALE`, 400)                                      | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                  |
| **`SALE-002`** | Deterministic Totals Calculation                | `Sale.recalculateTotals()`, `Sale.reconstitute()`     | `InvalidSaleStateException` (reconstitution mismatch, 500)                    | `sale-aggregate-invariants-catalog.spec.ts`, `sale-totals-deterministic.spec.ts`       |
| **`SALE-003`** | Non-Negative Total Floor                        | `Sale.recalculateTotals()`, `Money.create()`          | `InvalidMoneyException` (`NEGATIVE_MONEY_AMOUNT`, 400)                        | `sale-aggregate-invariants-catalog.spec.ts`, `money.vo.spec.ts`                        |
| **`SALE-004`** | Non-Negative Subtotal Guard                     | `SaleItem.create()`, `Money.create()`                 | `InvalidSaleItemException` (`INVALID_UNIT_PRICE`, 400)                        | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                |
| **`SALE-005`** | Non-Negative Discount Total                     | `Discount.create()`, `Discount.calculateReduction()`  | `InvalidDiscountException` (`NEGATIVE_DISCOUNT_AMOUNT`, 400)                  | `sale-aggregate-invariants-catalog.spec.ts`, `discount.vo.spec.ts`                     |
| **`SALE-006`** | Valid ISO-4217 Currency                         | `Sale.create()`, `Sale.reconstitute()`                | `InvalidSaleStateException` (`INVALID_CURRENCY`, 400)                         | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                  |
| **`SALE-007`** | Settlement Precondition for PAID                | `Sale.markPaid()`, `RecordPaymentHandler`             | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)             | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |
| **`SALE-008`** | Terminal Immutability of Cancelled Sales        | `Sale.assertDraftState()`, transition guards          | `SaleAlreadyFinalizedException` (409), `InvalidSaleTransitionException` (409) | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |
| **`SALE-009`** | SaleItem Parent Ownership                       | `Sale.addItem()`, `Sale.reconstitute()`               | `InvalidSaleStateException` (`SALE_ITEM_OWNERSHIP_MISMATCH`, 500)             | `sale-aggregate-invariants-catalog.spec.ts`, `sale-hardening.spec.ts`                  |
| **`SALE-010`** | 1-to-1 Commercial Transaction Integrity         | `SaleId` uniqueness, `@@unique([tenantId, saleId])`   | `InvalidSaleTransitionException` (reopening), DB Unique Violation             | `sale-aggregate-invariants-catalog.spec.ts`, `receipt-concurrency-idempotency.spec.ts` |
| **`SALE-011`** | Valid Item Quantity ($0.001 \le q \le 999,999$) | `SaleItem.assertValidQuantity()`                      | `InvalidSaleItemException` (`INVALID_QUANTITY`, 400)                          | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                |
| **`SALE-012`** | Non-Negative Item Price ($\ge \$0.00$)          | `Money.create()`, `SaleItem.assertValidUnitPrice()`   | `InvalidSaleItemException` (`INVALID_UNIT_PRICE`, 400)                        | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                |
| **`SALE-013`** | Discount Bounds & Non-Exceeding Guard           | `Discount.create()`, `Discount.calculateReduction()`  | `InvalidDiscountException` (`DISCOUNT_EXCEEDS_AMOUNT`, 400)                   | `sale-aggregate-invariants-catalog.spec.ts`, `sale-discount-invariants.spec.ts`        |
| **`SALE-014`** | Currency Consistency across Aggregate           | `Sale.addItem()`, `Sale.reconstitute()`               | `InvalidSaleStateException` (`CURRENCY_MISMATCH`, 400)                        | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                  |
| **`SALE-015`** | Forward Lifecycle State Progression             | State machine transition guards                       | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)             | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |
| **`SALE-016`** | Terminal Lifecycle Irreversibility              | Status transition guards (`COMPLETED`, `REFUNDED`)    | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)             | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |
| **`SALE-017`** | Causal Timestamp Consistency                    | `Sale.reconstitute()`, `Clock`                        | `InvalidSaleStateException` (`INVALID_TIMESTAMPS`, 500)                       | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |
| **`SALE-018`** | Post-Finalization Commercial Freeze             | `Sale.assertDraftState()`                             | `SaleAlreadyFinalizedException` (`SALE_ALREADY_FINALIZED`, 409)               | `sale-aggregate-invariants-catalog.spec.ts`, `sale-hardening.spec.ts`                  |
| **`SALE-019`** | Tender Coverage for Settlement                  | `RecordPaymentHandler`, `CompletePaymentHandler`      | `SaleNotPayableException` (422), `InsufficientPaymentException` (422)         | `sale-aggregate-invariants-catalog.spec.ts`, `payment-application.spec.ts`             |
| **`SALE-020`** | Receipt Issuance Exclusivity & Post-Settlement  | `IssueReceiptHandler`, `@@unique([tenantId, saleId])` | `ReceiptAlreadyIssuedException` (409), `SaleNotPaidException` (422)           | `sale-aggregate-invariants-catalog.spec.ts`, `issue-receipt.handler.spec.ts`           |
| **`SALE-021`** | Non-Empty Cancellation Reason                   | `Sale.cancel(reason)`                                 | `InvalidSaleStateException` (`INVALID_CANCELLATION_REASON`, 400)              | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                  |

---

## 3. Detailed Invariant Specifications

### SALE-001: Commercial Non-Emptiness

- **Description**: A `Sale` cannot transition out of `DRAFT` status (to `PENDING_PAYMENT`, `PARTIALLY_PAID`, or `PAID`) without containing at least one `SaleItem`. An empty cart is permitted in `DRAFT` during initial cashier session preparation, but finalization requires $\ge 1$ item.
- **Enforcement Location**: [`Sale.finalize()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`EmptySaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/empty-sale.exception.ts) with code `EMPTY_SALE` (HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale.aggregate.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)
- **Architectural Justification**: Commercial agreements without goods or services have no legal consideration and cannot incur a payable financial debt obligation.

---

### SALE-002: Deterministic Totals Calculation

- **Description**: The final order total must equal the exact deterministic sum of item line subtotals minus cumulative item and order discounts using the 13 canonical formulas (ADR-0114) in integer minor units (cents) with Commercial Half-Up rounding. Persisted totals must strictly reconcile during reconstitution.
- **Enforcement Location**: [`Sale.recalculateTotals()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and [`Sale.reconstitute()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) if persisted totals do not reconcile with line sums (HTTP 500).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-totals-deterministic.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-totals-deterministic.spec.ts)
- **Architectural Justification**: Eliminates floating-point discrepancies, database tampering, and rounding drifts across clients and servers.

---

### SALE-003: Non-Negative Total Floor

- **Description**: The payable order total cannot be less than zero ($\text{total} \ge \$0.00$). Under no circumstance may discounts, promotional credits, or vouchers reduce the payable total below zero.
- **Enforcement Location**: [`Sale.recalculateTotals()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) via $\max(0, \text{subtotal} - \text{discountTotal})$ and [`Money.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts).
- **Failure Behavior**: Attempting to construct negative `Money` throws [`InvalidMoneyException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-money.exception.ts) (`NEGATIVE_MONEY_AMOUNT`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`money.vo.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/money.vo.spec.ts)
- **Architectural Justification**: A point-of-sale checkout agreement cannot create a negative debt obligation (which would turn a commercial purchase into an unauthorized cashier cash payout).

---

### SALE-004: Non-Negative Subtotal Guard

- **Description**: Gross subtotal is the sum of all item line subtotals. Because individual unit prices ($\ge \$0.00$) and quantities ($> 0$) are strictly non-negative, the subtotal is mathematically guaranteed to be $\ge \$0.00$.
- **Enforcement Location**: [`SaleItem.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/entities/sale-item.entity.ts), [`Money.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts).
- **Failure Behavior**: Throws [`InvalidSaleItemException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-item.exception.ts) (`INVALID_UNIT_PRICE`, HTTP 400) or [`InvalidMoneyException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-money.exception.ts).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-item.entity.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)
- **Architectural Justification**: Compensating credits or refunds are handled via autonomous refund flows or explicit discounts, never by injecting negative-priced cart items.

---

### SALE-005: Non-Negative Discount Total

- **Description**: The cumulative applied discount (line discounts plus order discount) cannot be negative. Discounts can only reduce or maintain the debt obligation, never inflate it.
- **Enforcement Location**: [`Discount.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts), [`Discount.percentage()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts), [`Discount.fixed()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts).
- **Failure Behavior**: Throws [`InvalidDiscountException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-discount.exception.ts) (HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`discount.vo.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/discount.vo.spec.ts)
- **Architectural Justification**: Negative discounts represent surcharges or tax additions, which belong to distinct price adjustments rather than discount reductions.

---

### SALE-006: Valid ISO-4217 Currency

- **Description**: The currency of a `Sale` must be a valid 3-letter ISO-4217 uppercase alphabetic string (e.g. `USD`, `EUR`, `CAD`). Lowercase, numbers, whitespace, or invalid string lengths are strictly rejected.
- **Enforcement Location**: [`Sale.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and [`Sale.reconstitute()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (HTTP 400 / 500).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale.aggregate.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)
- **Architectural Justification**: Standardized currency codes prevent invalid payment gateway dispatch and cross-border arithmetic corruption.

---

### SALE-007: Settlement Precondition for PAID

- **Description**: A `Sale` cannot transition to `PAID` status without valid, completed settlement. The sum of settled payments must equal or exceed the total order debt obligation ($\sum \text{payments.cents} \ge \text{sale.total.cents}$), and the transition must originate from `PENDING_PAYMENT` or `PARTIALLY_PAID`. Direct transition from `DRAFT` is prohibited.
- **Enforcement Location**: [`Sale.markPaid()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and application payment handlers (`RecordPaymentHandler`, `CompletePaymentHandler`).
- **Failure Behavior**: In domain: throws [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, HTTP 409). In application handler: rejects with `SaleNotPayableException` or `InsufficientPaymentException` (HTTP 422).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
  - [`payment-application.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/payment-application.spec.ts)
- **Architectural Justification**: Prevents unauthorized debt forgiveness or premature fulfillment without verified tender collection.

---

### SALE-008: Terminal Immutability of Cancelled Sales

- **Description**: Once a `Sale` transitions to `CANCELLED`, it is locked in an irreversible terminal state. Any attempt to add items, modify quantities, change discounts, or trigger subsequent status transitions must be immediately rejected.
- **Enforcement Location**: [`Sale.assertDraftState()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and state transition guards in `Sale`.
- **Failure Behavior**: Cart modifications throw [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (HTTP 409). Status transitions throw [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (HTTP 409).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
  - [`sale-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)
- **Architectural Justification**: Preserves non-repudiation and auditability; voided agreements cannot be silently revived or altered.

---

### SALE-009: SaleItem Parent Ownership

- **Description**: Every `SaleItem` within a `Sale` aggregate must have a `saleId` matching the parent `Sale` aggregate root's `id`. Alien items belonging to another `Sale` cannot be injected during addition or reconstitution.
- **Enforcement Location**: [`Sale.addItem()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and [`Sale.reconstitute()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (HTTP 500).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)
- **Architectural Justification**: DDD aggregate boundary law: child entities cannot belong to multiple aggregate roots or cross aggregate consistency boundaries.

---

### SALE-010: 1-to-1 Commercial Transaction Integrity

- **Description**: A `Sale` aggregate instance represents exactly one commercial transaction agreement. It cannot be repurposed for subsequent purchases, cannot be reset to `DRAFT`, and maps to at most one primary customer `Receipt`.
- **Enforcement Location**: Globally unique UUID `SaleId`, unidirectional state machine, composite unique constraint `@@unique([tenantId, saleId])` on `Receipt`.
- **Failure Behavior**: Attempting to reopen throws [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (HTTP 409); duplicate receipt issuance throws `ReceiptAlreadyIssuedException` (HTTP 409).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`receipt-concurrency-idempotency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/receipt-concurrency-idempotency.spec.ts)
- **Architectural Justification**: Ensures clear traceability from commercial order to inventory deduction, cash collection, and customer tax vouchers.

---

### SALE-011: Valid Item Quantity

- **Description**: A line item quantity must be a strictly positive finite number within bounds: $$0.001 \le \text{quantity} \le 999,999$$ Normalized to 3 decimal places. Quantities $\le 0$ or $> 999,999$ are strictly rejected.
- **Enforcement Location**: [`SaleItem.assertValidQuantity()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/entities/sale-item.entity.ts).
- **Failure Behavior**: Throws [`InvalidSaleItemException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-item.exception.ts) (`INVALID_QUANTITY`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-item.entity.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)
- **Architectural Justification**: Sales transactions cannot sell negative or zero physical/service units; upper limits prevent integer overflow and denial-of-service cart inflation.

---

### SALE-012: Non-Negative Item Price

- **Description**: Unit price snapshot must be non-negative: $$\text{unitPrice} \ge \$0.00$$ Zero-price items represent authorized promotional complimentary gifts. Negative values are strictly forbidden.
- **Enforcement Location**: [`Money.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts), [`SaleItem.assertValidUnitPrice()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/entities/sale-item.entity.ts).
- **Failure Behavior**: Throws [`InvalidSaleItemException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-item.exception.ts) (`INVALID_UNIT_PRICE`, HTTP 400) or [`InvalidMoneyException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-money.exception.ts).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-item.entity.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)
- **Architectural Justification**: Prevents accidental negative inventory valuation and cash leakages.

---

### SALE-013: Discount Bounds & Non-Exceeding Guard

- **Description**: Fixed discounts cannot exceed the eligible line item subtotal ($\text{fixedDiscount} \le \text{lineSubtotal}$). Attempts to apply a fixed discount exceeding the price are strictly rejected with an error (no silent clamping). Percentage discounts are bounded: $0 \le \text{percentage} \le 100$.
- **Enforcement Location**: [`Discount.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts), [`Discount.calculateReduction()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts), [`SaleItem.calculateDiscount()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/entities/sale-item.entity.ts).
- **Failure Behavior**: Throws [`InvalidDiscountException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-discount.exception.ts) (`DISCOUNT_EXCEEDS_AMOUNT`, `INVALID_DISCOUNT_PERCENTAGE`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-discount-invariants.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-discount-invariants.spec.ts)
- **Architectural Justification**: Rejects erroneous cashier entries explicitly instead of silently converting them to lower amounts or negative prices.

---

### SALE-014: Currency Consistency across Aggregate

- **Description**: Every child line item, discount, and calculated total attached to a `Sale` must match the parent Sale's ISO-4217 currency.
- **Enforcement Location**: [`Sale.addItem()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and [`Sale.reconstitute()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`CURRENCY_MISMATCH`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale.aggregate.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)
- **Architectural Justification**: Prevents summing amounts across different fiat currencies without foreign exchange conversion.

---

### SALE-015: Forward Lifecycle State Progression

- **Description**: The `Sale` status must advance strictly along legal forward paths:
  $$\text{DRAFT} \longrightarrow \text{PENDING\_PAYMENT} \longrightarrow \{\text{PARTIALLY\_PAID}, \text{PAID}\} \longrightarrow \text{COMPLETED}$$
  Skipping intermediate required states or moving backwards is strictly rejected.
- **Enforcement Location**: State transition methods on [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) (`finalize()`, `markPartiallyPaid()`, `markPaid()`, `markCompleted()`).
- **Failure Behavior**: Throws [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, HTTP 409).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
- **Architectural Justification**: Enforces operational discipline: cart ringing must finalize before payment, and payment must settle before fulfillment.

---

### SALE-016: Terminal Lifecycle Irreversibility

- **Description**: Once a `Sale` enters a terminal state (`CANCELLED`, `COMPLETED`, `REFUNDED`), it is permanently locked. No further state transitions can occur.
- **Enforcement Location**: State transition guards in [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (`INVALID_SALE_TRANSITION`, HTTP 409).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
- **Architectural Justification**: Completed orders represent executed legal contracts; cancelled orders represent terminated negotiations. Neither can be resurrected without creating a new transaction.

---

### SALE-017: Causal Timestamp Consistency

- **Description**: Aggregate event timestamps must maintain causal chronological consistency: `createdAt <= updatedAt`, and terminal timestamps (`finalizedAt`, `completedAt`, `cancelledAt`, `refundedAt`) must be $\ge createdAt$.
- **Enforcement Location**: [`Sale.reconstitute()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) and domain methods injecting timestamps from `Clock`.
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (HTTP 500).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
- **Architectural Justification**: Chronological integrity is required for legal audit trails, tax compliance reporting, and event sourcing ordering.

---

### SALE-018: Immutable Commercial Snapshots (Post-Finalization Freeze)

- **Description**: Once a `Sale` departs `DRAFT` status (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`), all commercial terms (`items`, `unitPrice`, `quantity`, `description`, `skuOrCode`, `discounts`, `totals`) are permanently frozen. No items can be added, updated, or removed.
- **Enforcement Location**: [`Sale.assertDraftState()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (`SALE_ALREADY_FINALIZED`, HTTP 409).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)
  - [`sale-item-historical-snapshot.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-item-historical-snapshot.spec.ts)
- **Architectural Justification**: Once presented to the customer for payment, the commercial agreement cannot be modified under their feet.

---

### SALE-019: Payment Amount Consistency (Settlement Coverage)

- **Description**: A `Sale` can only transition to `PAID` if the sum of settled payment tender amounts equals or exceeds the total order debt obligation ($\sum \text{payments.cents} \ge \text{sale.total.cents}$). If $0 < \sum \text{payments.cents} < \text{sale.total.cents}$, the sale may only transition to `PARTIALLY_PAID`.
- **Enforcement Location**: Application orchestration handlers ([`RecordPaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/record-payment.handler.ts), [`CompletePaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/complete-payment.handler.ts)).
- **Failure Behavior**: Rejects with `SaleNotPayableException` or `InsufficientPaymentException` (HTTP 422).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`payment-application.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/payment-application.spec.ts)
- **Architectural Justification**: Cross-aggregate consistency: coordinates tender settlement with commercial debt discharge without coupling aggregates.

---

### SALE-020: Receipt Issuance Exclusivity & Post-Settlement

- **Description**: Exactly one primary customer `Receipt` can be issued for a `Sale`, and only when the `Sale` is in a fully settled state (`PAID` or `COMPLETED`). Receipts capture point-in-time JSON snapshots and do not own commercial debt.
- **Enforcement Location**: [`IssueReceiptHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/issue-receipt.handler.ts), database constraint `@@unique([tenantId, saleId])`.
- **Failure Behavior**: Duplicate issuance throws `ReceiptAlreadyIssuedException` (HTTP 409); issuing on unsettled sale throws `SaleNotPaidException` (HTTP 422).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`issue-receipt.handler.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/issue-receipt.handler.spec.ts)
  - [`receipt-concurrency-idempotency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/receipt-concurrency-idempotency.spec.ts)
- **Architectural Justification**: Legal vouchers cannot be issued for unpaid or voided agreements, and customers cannot receive duplicate primary receipts for a single transaction.

---

### SALE-021: Non-Empty Cancellation Reason

- **Description**: A `Sale` cannot transition to `CANCELLED` without an explicit, non-empty cancellation reason string. Permitted only from non-terminal states (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`).
- **Enforcement Location**: [`Sale.cancel(reason)`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`INVALID_CANCELLATION_REASON`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
- **Architectural Justification**: Mandatory staff audit accountability for voided sales prevents cashier fraud and inventory shrinkage.
