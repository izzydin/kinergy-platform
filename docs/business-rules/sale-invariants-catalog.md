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
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [Sale Lifecycle & State Transition Matrix](sale-lifecycle-transition-matrix.md)
  - [Sale-Payment Cross-Aggregate Coordination](sale-payment-coordination.md)
  - [Cancelled Sale Immutability & Financial Integrity Policy](sale-cancelled-immutability.md)
- **Executable Test Suites**:
  - Invariant Catalog Suite: [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - Invariant Property Matrix: [`sale-aggregate-invariants-property-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-property-matrix.spec.ts)
  - Complete Behavioral Suite: [`sale-aggregate-complete-behavioral.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-complete-behavioral.spec.ts)
  - Persistence Atomicity & Rollback: [`sale-persistence-atomicity-rollback.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-persistence-atomicity-rollback.spec.ts)
  - Repository Aggregate Boundary: [`sale-repository-aggregate-boundary.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-repository-aggregate-boundary.spec.ts)

---

## 1. Overview and Invariant Hierarchy

The `Sale` aggregate root is the transactional consistency boundary for commercial checkout transactions in the Kinergy Platform. This catalog establishes the formal specification of all business and technical invariants governing the `Sale` aggregate, its child entities (`SaleItem`), and its cross-aggregate boundaries with `Payment` and `Receipt`.

Every invariant in this catalog specifies:

1. **Identifier**: Unique machine-readable code (`SALE-001` through `SALE-022`).
2. **Description**: Exact behavioral requirement and mathematical constraint.
3. **Enforcement Location**: Domain class, method, or architectural layer where enforcement is guaranteed.
4. **Failure Behavior**: Specific domain exception class, error code, and HTTP mapping.
5. **Test Coverage**: Executable automated test suites proving invariant compliance.
6. **Architectural Justification**: Business or distributed systems rationale justifying the constraint.

---

## 2. Master Invariant Catalog Matrix

| Invariant ID   | Name / Short Summary                            | Enforcement Location                                                                           | Failure Behavior                                                                                      | Test Coverage                                                                                 |
| :------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| **`SALE-001`** | Commercial Non-Emptiness                        | `Sale.finalize()`                                                                              | `EmptySaleException` (`EMPTY_SALE`, 400)                                                              | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                         |
| **`SALE-002`** | Deterministic Totals Calculation                | `Sale.recalculateTotals()`, `Sale.reconstitute()`                                              | `InvalidSaleStateException` (reconstitution mismatch, 500)                                            | `sale-aggregate-invariants-catalog.spec.ts`, `sale-totals-deterministic.spec.ts`              |
| **`SALE-003`** | Non-Negative Total Floor                        | `Sale.recalculateTotals()`, `Money.create()`                                                   | `InvalidMoneyException` (`NEGATIVE_MONEY_AMOUNT`, 400)                                                | `sale-aggregate-invariants-catalog.spec.ts`, `money.vo.spec.ts`                               |
| **`SALE-004`** | Non-Negative Subtotal Guard                     | `SaleItem.create()`, `Money.create()`                                                          | `InvalidSaleItemException` (`INVALID_UNIT_PRICE`, 400)                                                | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                       |
| **`SALE-005`** | Non-Negative Discount Total                     | `Discount.create()`, `Discount.calculateReduction()`                                           | `InvalidDiscountException` (`NEGATIVE_DISCOUNT_AMOUNT`, 400)                                          | `sale-aggregate-invariants-catalog.spec.ts`, `discount.vo.spec.ts`                            |
| **`SALE-006`** | Valid ISO-4217 Currency                         | `Sale.create()`, `Sale.reconstitute()`                                                         | `InvalidSaleStateException` (`INVALID_CURRENCY`, 400)                                                 | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                         |
| **`SALE-007`** | Settlement Precondition for PAID                | `Sale.markPaid()`, `RecordPaymentHandler`                                                      | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)                                     | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-008`** | Terminal Immutability of Cancelled Sales        | `Sale.assertDraftState()`, transition guards                                                   | `SaleAlreadyFinalizedException` (409), `InvalidSaleTransitionException` (409)                         | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-009`** | SaleItem Parent Ownership                       | `Sale.addItem()`, `Sale.reconstitute()`                                                        | `InvalidSaleStateException` (`SALE_ITEM_OWNERSHIP_MISMATCH`, 500)                                     | `sale-aggregate-invariants-catalog.spec.ts`, `sale-hardening.spec.ts`                         |
| **`SALE-010`** | 1-to-1 Commercial Transaction Integrity         | `CreateSaleHandler` idempotency, `PrismaSaleRepository.save()`, `@@unique([tenantId, saleId])` | `DuplicateSaleException` (`DUPLICATE_SALE_DETECTED`, 409), DB Unique Violation                        | `sale-commercial-transaction-uniqueness.spec.ts`, `sale-aggregate-invariants-catalog.spec.ts` |
| **`SALE-011`** | Valid Item Quantity ($0.001 \le q \le 999,999$) | `SaleItem.assertValidQuantity()`                                                               | `InvalidSaleItemException` (`INVALID_QUANTITY`, 400)                                                  | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                       |
| **`SALE-012`** | Non-Negative Item Price ($\ge \$0.00$)          | `Money.create()`, `SaleItem.assertValidUnitPrice()`                                            | `InvalidSaleItemException` (`INVALID_UNIT_PRICE`, 400)                                                | `sale-aggregate-invariants-catalog.spec.ts`, `sale-item.entity.spec.ts`                       |
| **`SALE-013`** | Discount Bounds & Non-Exceeding Guard           | `Discount.create()`, `Discount.calculateReduction()`                                           | `InvalidDiscountException` (`DISCOUNT_EXCEEDS_AMOUNT`, 400)                                           | `sale-aggregate-invariants-catalog.spec.ts`, `sale-discount-invariants.spec.ts`               |
| **`SALE-014`** | Currency Consistency across Aggregate           | `Sale.addItem()`, `Sale.reconstitute()`                                                        | `InvalidSaleStateException` (`CURRENCY_MISMATCH`, 400)                                                | `sale-aggregate-invariants-catalog.spec.ts`, `sale.aggregate.spec.ts`                         |
| **`SALE-015`** | Forward Lifecycle State Progression             | State machine transition guards                                                                | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)                                     | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-016`** | Terminal Lifecycle Irreversibility              | Status transition guards (`COMPLETED`, `REFUNDED`)                                             | `InvalidSaleTransitionException` (`INVALID_SALE_TRANSITION`, 409)                                     | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-017`** | Causal Timestamp Consistency                    | `Sale.reconstitute()`, `Clock`                                                                 | `InvalidSaleStateException` (`INVALID_TIMESTAMPS`, 500)                                               | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-018`** | Post-Finalization Commercial Freeze             | `Sale.assertDraftState()`                                                                      | `SaleAlreadyFinalizedException` (`SALE_ALREADY_FINALIZED`, 409)                                       | `sale-aggregate-invariants-catalog.spec.ts`, `sale-hardening.spec.ts`                         |
| **`SALE-019`** | Tender Coverage for Settlement                  | `RecordPaymentHandler`, `CompletePaymentHandler`                                               | `SaleNotPayableException` (422), `InsufficientPaymentException` (422)                                 | `sale-aggregate-invariants-catalog.spec.ts`, `payment-application.spec.ts`                    |
| **`SALE-020`** | Receipt Issuance Exclusivity & Post-Settlement  | `IssueReceiptHandler`, `@@unique([tenantId, saleId])`                                          | `ReceiptAlreadyIssuedException` (409), `SaleNotPaidException` (422)                                   | `sale-aggregate-invariants-catalog.spec.ts`, `issue-receipt.handler.spec.ts`                  |
| **`SALE-021`** | Non-Empty Cancellation Reason                   | `Sale.cancel(reason)`                                                                          | `InvalidSaleStateException` (`INVALID_CANCELLATION_REASON`, 400)                                      | `sale-aggregate-invariants-catalog.spec.ts`, `sale-lifecycle.spec.ts`                         |
| **`SALE-022`** | Commercial Origin Immutability (`SaleSource`)   | `Sale.create()`, `Sale.changeSource()`, `Sale.assignSource()`, `Sale.removeSource()`           | `InvalidSaleStateException` (`SALE_SOURCE_IMMUTABLE`, 400/409), `SaleAlreadyFinalizedException` (409) | `sale-source-lifecycle-matrix.spec.ts`, `sale-source.vo.spec.ts`                              |

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
  - [`sale-authoritative-totals-calculation.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-authoritative-totals-calculation.spec.ts)
- **Architectural Justification**: Eliminates floating-point discrepancies, database tampering, and rounding drifts across clients and servers.

---

### SALE-003: Non-Negative Total Floor

- **Description**: The payable order total cannot be less than zero ($\text{total} \ge \$0.00$). Under no circumstance may discounts, promotional credits, or vouchers reduce the payable total below zero.
- **Enforcement Location**: [`Sale.recalculateTotals()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) via $\max(0, \text{subtotal} - \text{discountTotal})$ and [`Money.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts).
- **Failure Behavior**: Attempting to construct negative `Money` or calculate a negative total throws [`InvalidMoneyException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-money.exception.ts) or [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`NEGATIVE_SALE_TOTAL`, HTTP 400).
- **Test Coverage**:
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`money.vo.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/money.vo.spec.ts)
  - [`sale-authoritative-totals-calculation.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-authoritative-totals-calculation.spec.ts)
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
- **Enforcement Location**: [`Sale.assertDraftState()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts), state transition guards in `Sale`, and persistence guard in [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts).
- **Failure Behavior**: Cart/discount/financial modifications throw [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (HTTP 409). Status transitions throw [`InvalidSaleTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-transition.exception.ts) (HTTP 409). Persistence updates to already cancelled records throw [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`TERMINAL_SALE_IMMUTABLE`, HTTP 500).
- **Test Coverage**:
  - [`sale-cancelled-immutability.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-cancelled-immutability.spec.ts)
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`sale-lifecycle.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)
  - [`sale-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)
- **Detailed Specification**: [Cancelled Sale Immutability & Financial Integrity Policy](sale-cancelled-immutability.md)
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

### SALE-010: 1-to-1 Commercial Transaction Integrity (Exactly One Sale Invariant)

- **Description**: Exactly one `Sale` aggregate represents each commercial transaction. Accidental duplicate Sale creation is strictly prevented across all operational modes:
  1. **Idempotent Replay**: Automated network retries or cashier double-clicks submitting identical transaction identities (`id` / `idempotencyKey` or order `sourceCode`) return the existing Sale without duplicating database records or monetary ledgers.
  2. **Conflict Rejection**: Submitting conflicting transaction parameters for an already existing transaction identity throws [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts) (HTTP 409 Conflict).
  3. **Single-Billing Operational Entities**: Clinical treatment sessions (`SourceType.TREATMENT_SESSION`) can be bound to at most one active (non-cancelled) Sale. Attempting duplicate billing for an active treatment session is strictly rejected.
  4. **Post-Settlement Proof**: An issued `Sale` maps to at most one primary legal customer `Receipt` via `@@unique([tenantId, saleId])`.
- **Enforcement Location**: [`CreateSaleHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/create-sale.handler.ts), [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts), and PostgreSQL primary/unique constraints.
- **Failure Behavior**: Duplicate creation throws [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts) (`DUPLICATE_SALE_DETECTED`, HTTP 409).
- **Test Coverage**:
  - [`sale-commercial-transaction-uniqueness.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/sale-commercial-transaction-uniqueness.spec.ts)
  - [`sale-aggregate-invariants-catalog.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-aggregate-invariants-catalog.spec.ts)
  - [`receipt-concurrency-idempotency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/receipt-concurrency-idempotency.spec.ts)
- **Detailed Specification**: [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
- **Architectural Justification**: Ensures deterministic 1-to-1 accountability between commercial purchases, billing charges, and customer tax vouchers. Prevents double-billing and phantom orders under high-concurrency network retries.

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

---

### SALE-022: Commercial Origin Immutability (`SaleSource`)

- **Description**: A `Sale` must be created with an explicit, valid `SaleSource` (`type` and `referenceId`). Once created, the commercial origin is permanently bound and strictly immutable across all lifecycle states (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`). It cannot be reassigned, changed, or removed. If the wrong origin was selected, the commercial checkout must be cancelled and re-created under the proper origin context.
- **Enforcement Location**: [`Sale.create()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts), [`Sale.changeSource()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts), [`Sale.assignSource()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts), [`Sale.removeSource()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts).
- **Failure Behavior**: Throws [`InvalidSaleStateException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-sale-state.exception.ts) (`SALE_SOURCE_IMMUTABLE`, HTTP 400/409), [`SaleAlreadyFinalizedException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/sale-already-finalized.exception.ts) (HTTP 409 on settled states), or `CANNOT_MODIFY_CANCELLED_SALE` (HTTP 409 on `CANCELLED`).
- **Test Coverage**:
  - [`sale-source-lifecycle-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-source-lifecycle-matrix.spec.ts)
  - [`sale-source-aggregate-integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-source-aggregate-integration.spec.ts)
  - [`sale-source.vo.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-source.vo.spec.ts)
- **Architectural Justification**: Under ADR-0121 §4.9 & §4.10, commercial origin dictates downstream journal routing, tax reporting, and operational entity settlement. Allowing in-flight or post-settlement mutability compromises transactional audit integrity.

---

## 4. Aggregate Architecture, Boundary, and Structural Enforcements

### 4.1 Sale Aggregate Definition & Factory Contracts

The `Sale` aggregate root is defined in [`packages/core/src/sales/domain/sale.aggregate.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts). It enforces that:

- **Private Construction**: Direct instantiation via `new Sale(...)` is restricted to private scope. Callers must invoke `Sale.create(...)` for new checkout sessions or `Sale.reconstitute(...)` for hydration from persistence.
- **Immutable Aggregate Identity**: `SaleId`, `tenantId`, and `currency` are assigned at creation and remain immutable for the aggregate's entire lifecycle.
- **Strict Version Tracking**: Every state-changing domain operation increments `version` monotonically ($v_{n+1} = v_n + 1$) to support Optimistic Concurrency Control (OCC).

### 4.2 Strict Aggregate Boundary & Encapsulation Perimeter

The `Sale` aggregate encapsulates its child entities and financial calculations behind a strict encapsulation barrier:

- **Zero Public Setters**: No properties on `Sale` or `SaleItem` expose public setters (`set status()`, `set subtotal()`, `set total()`).
- **Read-Only Getters with Defensive Copies**: The `items` getter returns `Object.freeze([...this._items])`. Mutating the returned array (`push`, `pop`, `splice`) or modifying item properties directly cannot penetrate or corrupt internal aggregate state.
- **Exclusive Mutation Routes**: All business mutations must flow through explicit domain methods: `addItem()`, `removeItem()`, `updateItemQuantity()`, `updateItem()`, `applyItemDiscount()`, `removeItemDiscount()`, `applyOrderDiscount()`, `removeOrderDiscount()`, `finalize()`, `markPartiallyPaid()`, `markPaid()`, `markCompleted()`, `cancel()`, `markRefunded()`.

### 4.3 SaleItem Ownership & Alien Attachment Prevention

`SaleItem` is a dependent entity owned exclusively by its parent `Sale`:

- **Parent Identity Anchor**: Every `SaleItem` stores `item.saleId`.
- **Cross-Sale Attachment Prohibition**: Attempting to attach a `SaleItem` whose `saleId` differs from the target `Sale` throws `InvalidSaleStateException` with explicit error code `CROSS_SALE_ITEM_ATTACHMENT_PROHIBITED`.
- **Entity Immutability**: `SaleItem` executes `Object.freeze(this)` upon construction. Modifications (e.g. quantity or discount updates) yield new immutable instances via `withQuantity()`, `withDiscount()`, or `withSaleId()`.

### 4.4 Universal Financial Mathematical Invariants

For any valid collection of line items and discounts, the `Sale` aggregate structurally enforces:

1. **Gross Subtotal Invariant**: $\text{subtotal} = \sum_{i=1}^n (\text{quantity}_i \times \text{unitPrice}_i) \ge 0$.
2. **Discount Total Invariant**: $\text{discountTotal} = \sum_{i=1}^n \text{lineDiscount}_i + \text{orderDiscount} \ge 0$.
3. **Payable Total Invariant**: $\text{total} = \max(0, \text{subtotal} - \text{discountTotal}) \ge 0$.
4. **Exact Reconciliation**: $\text{total} = \text{subtotal} - \text{discountTotal}$ whenever total discount $\le \text{subtotal}$. If discount exceeds subtotal, total clamps to zero without becoming negative.
5. **Single-Currency Homogeneity**: Every line item must match the parent `Sale.currency`. Cross-currency line items are rejected.
6. **Minor-Unit Determinism**: All monetary values are computed using integer cents with half-up rounding, eliminating IEEE-754 binary floating-point drift.

### 4.5 Lifecycle State Progression Invariants

The `Sale` aggregate enforces a unidirectional finite state machine:

- **Valid Forward Transitions**:
  - $\text{DRAFT} \to \text{PENDING\_PAYMENT}$ (via `finalize()`, requires $\ge 1$ item).
  - $\text{PENDING\_PAYMENT} \to \text{PARTIALLY\_PAID}$ (via `markPartiallyPaid()`, upon partial payment).
  - $\text{PENDING\_PAYMENT} \to \text{PAID}$ (via `markPaid()`, upon full payment settlement).
  - $\text{PARTIALLY\_PAID} \to \text{PAID}$ (via `markPaid()`, once cumulative tenders $\ge \text{total}$).
  - $\text{PAID} \to \text{COMPLETED}$ (via `markCompleted()`, upon fulfillment).
  - $\text{PAID} \mid \text{COMPLETED} \to \text{REFUNDED}$ (via `markRefunded()`).
  - $\text{DRAFT} \mid \text{PENDING\_PAYMENT} \mid \text{PARTIALLY\_PAID} \to \text{CANCELLED}$ (via `cancel(reason)`).
- **Invalid Transition Atomicity**: Any illegal transition (e.g. `markPaid()` from `DRAFT`, `finalize()` from `CANCELLED`) throws `InvalidSaleTransitionException` and leaves aggregate state completely unchanged.
- **Commercial Terms Freeze**: Once finalized (`PENDING_PAYMENT` or beyond), items, prices, discounts, and totals are permanently immutable.

### 4.6 Payment Coordination & Settlement Preconditions

- **Settlement Guard**: A `Sale` cannot become `PAID` without a verified, completed `Payment` matching `saleId`, `currency`, and satisfying debt coverage ($\sum \text{completedPayments} \ge \text{sale.total}$).
- **Aggregate Independence**: `Payment` and `Sale` are distinct aggregate roots. `Payment` manages payment gateway tenders and authorization lifecycles; `Sale` manages the commercial contract and customer debt. Coordination is orchestrated via application services ([`SalePaymentCoordinationService`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/services/sale-payment-coordination.service.ts), [`RecordPaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/record-payment.handler.ts)) that invoke domain methods on each root.

### 4.7 Permanent Cancellation Freeze

A cancelled `Sale` is permanently frozen:

- Rejects all line-item modifications (`addItem`, `removeItem`, `updateItemQuantity`, `updateItem`).
- Rejects all discount modifications (`applyItemDiscount`, `applyOrderDiscount`, etc.).
- Rejects all financial recalculations and client assignments.
- Rejects all state transitions (`finalize`, `markPaid`, `cancel` again).
- All rejected attempts preserve identical aggregate snapshot state.

### 4.8 Persistence Transaction Behavior, Atomicity, and OCC

Persistence of the `Sale` aggregate in [`PrismaSaleRepository`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts) enforces:

- **Transaction Atomicity**: Updating a `Sale` and its child `SaleItem` records executes inside `prisma.$transaction`. Partial writes (e.g. `Sale` updated but `SaleItem` failing) trigger a complete database rollback.
- **Optimistic Concurrency Control (OCC)**: Updates execute with `where: { id, version: priorVersion }`. If a concurrent worker updated the record, `count === 0` and `SaleOptimisticLockException` is thrown.
- **Terminal State Persistence Guard**: If database state is already `CANCELLED` or `REFUNDED`, the repository rejects updates with `TERMINAL_SALE_IMMUTABLE`.
- **Status Regression Guard**: Persisting a `DRAFT` payload over a non-draft record is rejected with `ILLEGAL_STATUS_REGRESSION`.

### 4.9 Operational Single-Billing & Duplicate Transaction Rules (ADR-0120 & ADR-0121)

- **Operational Single-Billing (SALE-010)**: For discrete clinical appointment sessions (`KINESIOLOGY_SESSION` / `TREATMENT_SESSION`), at most one **active (non-cancelled)** `Sale` may exist per operational source entity per tenant. During initial creation (`version === 1`), `CreateSaleHandler` and `PrismaSaleRepository.save()` inspect existing sales and reject duplicates with `DuplicateSaleException`. When a prior sale is `CANCELLED`, a replacement sale is permitted.
- **Multiple Sales Validity (Retail, Memberships & Rentals)**: For consumables (`FOOD`, `DRINK`), recurring membership plans (`GYM_MEMBERSHIP`), and space rentals (`ROOM_RENTAL`), multiple distinct Sales legitimately and frequently share the same `SaleSource` reference. No global composite database uniqueness constraint is enforced on `(sourceType, sourceId)`.
- **Idempotency Key Deduplication**: Cashier and POS checkout requests support `x-idempotency-key` and `id`. Identical retries return the existing sale without creating duplicate commercial debt.

---

## 5. Cross-Aggregate Invariant Ownership Matrix

| Responsibility / Domain Invariant                                       | `Sale` Aggregate | `Payment` Aggregate | `Receipt` Aggregate |
| :---------------------------------------------------------------------- | :--------------: | :-----------------: | :-----------------: |
| **Commercial cart line items & SKU snapshots**                          |    **OWNER**     |         No          |   Read-only copy    |
| **Gross subtotal, discounts, and net payable debt**                     |    **OWNER**     |         No          |   Read-only copy    |
| **Commercial checkout lifecycle (DRAFT $\to$ PENDING $\to$ PAID)**      |    **OWNER**     |         No          |         No          |
| **Cancellation and audit justification reason**                         |    **OWNER**     |         No          |         No          |
| **Tender authorization, capture, gateway transaction IDs**              |        No        |      **OWNER**      | Read-only reference |
| **Tender lifecycle (PENDING $\to$ COMPLETED $\to$ FAILED / CANCELLED)** |        No        |      **OWNER**      |         No          |
| **Proof-of-purchase legal document number (monotonic sequence)**        |        No        |         No          |      **OWNER**      |
| **Reprint audit trail & historical frozen tax snapshot**                |        No        |         No          |      **OWNER**      |

---

## 6. Complete Multi-Tier Invariant Traceability Matrix

| Invariant ID   | Business Rule                                                 | Governing ADR      | Domain Method                                   | Application Use Case               | Persistence Constraint                   | Executable Test Suites                                                                           |
| :------------- | :------------------------------------------------------------ | :----------------- | :---------------------------------------------- | :--------------------------------- | :--------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **`SALE-001`** | Finalize requires $\ge 1$ item                                | ADR-0119           | `Sale.finalize()`                               | `FinalizeSaleHandler`              | N/A (enforced in domain)                 | `sale-aggregate-invariants-catalog.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts` |
| **`SALE-002`** | Deterministic totals: $\text{sub} - \text{disc} = \text{tot}$ | ADR-0108, ADR-0114 | `Sale.calculateTotals()`, `Sale.reconstitute()` | All item/discount use cases        | Minor integer cents reconciliation       | `sale-totals-deterministic.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`         |
| **`SALE-003`** | Non-negative total floor ($\ge \$0.00$)                       | ADR-0108, ADR-0114 | `Sale.calculateTotals()`, `Money.create()`      | `ApplyOrderDiscountHandler`        | `total_amount >= 0` check                | `money.vo.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                          |
| **`SALE-004`** | Non-negative subtotal guard                                   | ADR-0108, ADR-0119 | `SaleItem.create()`, `Money.create()`           | `AddSaleItemHandler`               | `subtotal_amount >= 0`                   | `sale-item.entity.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                  |
| **`SALE-005`** | Non-negative discount total                                   | ADR-0113, ADR-0114 | `Discount.calculateReduction()`                 | `ApplyOrderDiscountHandler`        | `discount_total_amount >= 0`             | `discount.vo.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                       |
| **`SALE-006`** | Valid ISO-4217 Currency                                       | ADR-0108, ADR-0119 | `Sale.create()`, `Sale.reconstitute()`          | `CreateSaleHandler`                | `VARCHAR(3)` currency column             | `sale.aggregate.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-007`** | Settlement precondition for PAID                              | ADR-0115, ADR-0116 | `Sale.markPaid()`, `Sale.markPartiallyPaid()`   | `CoordinateSalePaymentHandler`     | Status check in DB                       | `sale-lifecycle.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-008`** | Terminal immutability of CANCELLED                            | ADR-0119, Policy   | `Sale.assertNotCancelled()`, state guards       | All sales mutation handlers        | `TERMINAL_SALE_IMMUTABLE` repo guard     | `sale-cancelled-immutability.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`       |
| **`SALE-009`** | SaleItem parent ownership                                     | ADR-0119           | `Sale.addItem()`, `Sale.reconstitute()`         | `AddSaleItemHandler`               | `sale_id` FK foreign key constraint      | `sale-hardening.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-010`** | Single-billing transaction uniqueness                         | ADR-0119, ADR-0120 | `Sale.create()`                                 | `CreateSaleHandler`                | Source pre-check, DB unique indexes      | `sale-commercial-transaction-uniqueness.spec.ts`, `sale-repository-aggregate-boundary.spec.ts`   |
| **`SALE-011`** | Valid quantity ($0.001 \le q \le 999,999$)                    | ADR-0119           | `SaleItem.assertValidQuantity()`                | `AddSaleItemHandler`               | `quantity Decimal(10,3)`                 | `sale-item.entity.spec.ts`, `sale-aggregate-complete-behavioral.spec.ts`                         |
| **`SALE-012`** | Non-negative price ($\ge \$0.00$)                             | ADR-0108, ADR-0119 | `SaleItem.assertValidUnitPrice()`               | `AddSaleItemHandler`               | `unit_price_amount Decimal(12,2)`        | `sale-item.entity.spec.ts`, `sale-aggregate-complete-behavioral.spec.ts`                         |
| **`SALE-013`** | Discount bounds (0-100% or $\le \text{amount}$)               | ADR-0113           | `Discount.create()`, `calculateReduction()`     | `ApplySaleDiscountRequestDto`      | Discount value schema checks             | `sale-discount-invariants.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`          |
| **`SALE-014`** | Single currency homogeneity                                   | ADR-0108, ADR-0119 | `Sale.addItem()` currency check                 | `AddSaleItemHandler`               | `unit_price_currency = sale.currency`    | `sale.aggregate.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-015`** | Forward state progression                                     | ADR-0119, Matrix   | `Sale.finalize()`, `markPaid()`, etc.           | All lifecycle handlers             | State transition validation              | `sale-lifecycle.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-016`** | Terminal state irreversibility                                | ADR-0119, Matrix   | `Sale.assertNotTerminal()`                      | All handlers                       | `ILLEGAL_STATUS_REGRESSION` guard        | `sale-lifecycle.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-017`** | Causal timestamp consistency                                  | ADR-0119           | `Sale.reconstitute()`, `Clock`                  | All handlers                       | Timestamps ordering check                | `sale-lifecycle.spec.ts`, `sale-aggregate-complete-behavioral.spec.ts`                           |
| **`SALE-018`** | Post-finalization commercial freeze                           | ADR-0119           | `Sale.assertDraftState()`                       | `AddSaleItemHandler`, `RemoveItem` | Rejects mutation on non-draft            | `sale-hardening.spec.ts`, `sale-aggregate-complete-behavioral.spec.ts`                           |
| **`SALE-019`** | Settlement coverage for PAID                                  | ADR-0115, ADR-0116 | `Sale.markPaid()`, Coordination                 | `CoordinateSalePaymentHandler`     | Verified completed payments sum          | `payment-application.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`               |
| **`SALE-020`** | Receipt issuance exclusivity                                  | ADR-0117, ADR-0118 | `Receipt.fromSettledSale()`                     | `IssueReceiptHandler`              | `@@unique([tenantId, saleId])`           | `issue-receipt.handler.spec.ts`, `receipt-concurrency-idempotency.spec.ts`                       |
| **`SALE-021`** | Non-empty cancellation reason                                 | ADR-0119, Policy   | `Sale.cancel(reason)`                           | `CancelSaleHandler`                | `cancellation_reason` NOT NULL on cancel | `sale-lifecycle.spec.ts`, `sale-aggregate-invariants-property-matrix.spec.ts`                    |
| **`SALE-022`** | Commercial origin immutability (`SaleSource`)                 | ADR-0121           | `Sale.create()`, `changeSource()`               | `CreateSaleHandler`                | `source_type` & `source_id` NOT NULL     | `sale-source-lifecycle-matrix.spec.ts`, `sale-source-aggregate-integration.spec.ts`              |

---

## 7. Anti-Drift Architecture Safeguards

To prevent architectural drift over time, the following explicit architectural boundaries are codified and enforced:

### 7.1 Prevention of Receipt Becoming Sale Source of Truth

- **Rule**: `Receipt` is a downstream, point-in-time legal proof-of-purchase voucher. It does NOT own commercial debt and cannot alter `Sale` state.
- **Enforcement**: [`IssueReceiptHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/issue-receipt.handler.ts) only reads `Sale`. It never calls `saleRepository.save(sale)` and exposes no methods to mutate sales.

### 7.2 Prevention of Payment Becoming Sale Lifecycle Owner

- **Rule**: `Payment` is an independent aggregate root managing tender transactions. A payment record does NOT directly overwrite `sale.status`.
- **Enforcement**: Payment application handlers ([`RecordPaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/record-payment.handler.ts), [`CompletePaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/complete-payment.handler.ts)) call domain methods (`sale.markPaid(clock)`, `sale.markPartiallyPaid(clock)`). All status transitions remain strictly governed by `Sale` domain invariants.

### 7.3 Prevention of Persistence Layer Becoming Domain Owner

- **Rule**: The repository is a persistence mechanism, not a secondary business logic engine. It must never calculate totals, apply discounts, or alter business fields.
- **Enforcement**: [`PrismaSaleRepository`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts) exposes only `findById`, `findBySourceReference`, `findBySourceCode`, and `save(sale: Sale)`. There are no ad-hoc patch methods (`updateStatus`, `patchTotals`, `deleteItemDirectly`).

### 7.4 Prevention of Controller Becoming Financial Calculator

- **Rule**: Controllers are HTTP adapters. They must NEVER calculate subtotals, apply percentage reductions, or determine net balances.
- **Enforcement**: [`SalesController`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/controllers/sales.controller.ts) contains zero arithmetic operations. It translates incoming DTOs into application commands and forwards them to use case handlers.

### 7.5 Prevention of Frontend Becoming Financial Authority

- **Rule**: Client-side UI is an untrusted presentation layer. Frontend carts and calculations are purely advisory.
- **Enforcement**: API contracts strictly reject client-supplied `subtotal`, `discountTotal`, `total`, or `status`. Authoritative amounts are computed solely inside `Sale.calculateTotals()`.

### 7.6 Prevention of Sales Becoming Source Domain Owner (ADR-0121)

- **Rule**: The Sales bounded context must NEVER own, load, or inspect concrete source-domain entities (`Food`, `Drink`, `Membership`, `TreatmentSession`, `Room`).
  - The **source domain** owns: source entity lifecycle, source-specific validation, source-specific business rules, source-specific state, and source-specific persistence.
  - The **Sales domain** owns: storing the source type and reference, generic `SaleSource` validity, and `Sale` lifecycle rules.
  - Existence verification of referenced upstream entities belongs strictly to **Application Orchestration** prior to command dispatch.
  - No repositories are called inside `SaleSource` or `Sale`.
- **Enforcement**: Automated static architecture boundary test suite [`sales-architecture-boundaries.spec.ts`](../../packages/core/src/sales/sales-architecture-boundaries.spec.ts).

---

## 8. Canonical Terminology & Cross-Tier Consistency Glossary

| Concept               | ADR Terminology   | Domain Class / VO    | API Request / Response DTO                         | Prisma Schema Column                      | OpenAPI Swagger Description                      |
| :-------------------- | :---------------- | :------------------- | :------------------------------------------------- | :---------------------------------------- | :----------------------------------------------- |
| **Sale Identity**     | Sale ID           | `SaleId`             | `id` (UUID string)                                 | `id` (`String @id`)                       | `Unique Sale ID (e.g. sale_01j9876543210abcdef)` |
| **Monetary Value**    | Minor unit cents  | `Money`              | `MoneyResponseDto` (`amount`, `currency`, `cents`) | `Decimal(12,2)` + `VarChar(3)`            | `Exact monetary value with minor integer cents`  |
| **Gross Amount**      | Subtotal          | `sale.subtotal`      | `subtotal`                                         | `subtotal_amount`                         | `Gross sum of item subtotals before discounts`   |
| **Discount Total**    | Total Discount    | `sale.discountTotal` | `discountTotal`                                    | `discount_total_amount`                   | `Cumulative line-item and order-level discounts` |
| **Net Payable**       | Order Total       | `sale.total`         | `total`                                            | `total_amount`                            | `Net debt obligation payable by client`          |
| **Sale Status**       | Commercial Status | `SaleStatus` (Enum)  | `status` (Enum string)                             | `status` (`SaleStatus @default(DRAFT)`)   | `Commercial checkout lifecycle status`           |
| **Origin Entity**     | Source Reference  | `SourceReference`    | `SourceReferenceInputDto`                          | `source_type`, `source_id`, `source_code` | `Catalog origin category and entity reference`   |
| **Tender Record**     | Payment Aggregate | `Payment`            | `PaymentResponseDto`                               | `model Payment` in `payments` table       | `Financial tender transaction record`            |
| **Proof of Purchase** | Receipt Aggregate | `Receipt`            | `ReceiptResponseDto`                               | `model Receipt` in `receipts` table       | `Authoritative legal proof-of-purchase receipt`  |
