# Phase 7.3: Discount Implementation & Financial Specification

- **Document**: `docs/domain/discount-implementation.md`
- **Phase**: `7.3 — Discount Domain Model & Deterministic Calculation`
- **Role**: Principal Financial Domain Architect / Lead Platform Engineer
- **Status**: Authoritative Implemented Domain Specification
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)
- **Related Documentation**:
  - [`docs/architecture/sales-payments.md`](../architecture/sales-payments.md)
  - [`docs/domain/sales-payments.md`](sales-payments.md)
  - [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
  - [`docs/domain/sale-item-implementation.md`](sale-item-implementation.md)
  - [`docs/architecture/sale-item-acceptance.md`](../architecture/sale-item-acceptance.md)
- **Date**: 2026-09-18

---

## 1. Executive Summary & Implementation Status

As Senior Financial Domain Engineer safeguarding Kinergy's commercial integrity, this document establishes the authoritative domain specification and implementation contract for **Phase 7.3: Discount Domain Model & Deterministic Calculation**.

Phase 7.3 is **fully implemented and verified by automated regression test suites**:

1. **Pure Value Object**: `Discount` is an immutable domain Value Object in the Sales bounded context (`packages/core/src/sales/domain/value-objects/discount.vo.ts`).
2. **Supported Types**: `FIXED` (with `FIXED_AMOUNT` maintained as an alias) and `PERCENTAGE`.
3. **Deterministic Calculation**: Evaluated via `discount.calculate(eligibleAmount: Money): Money` using integer cents and Commercial Half-Up rounding. Zero floating-point arithmetic.
4. **Strict Boundary Enforcement**: Fixed discount cannot exceed the eligible amount; exceeding amounts throw `InvalidDiscountException` (no silent clamping).
5. **Item-Level Scope**: Phase 7.3 strictly supports item-level discounts attached to `SaleItem`. Sale-level order discounts are deferred.
6. **Historical Commercial Snapshotting**: `SaleItem` permanently stores historical commercial terms; it is never dynamically recalculated from source catalog entities.
7. **Aggregate Invariant Alignment**: `Sale` maintains exact mathematical reconciliation across all items.

---

## 2. Financial Contract & Foundational Principles

### 2.1 Money Representation & Numeric Foundation (ADR-0108)

- **Canonical Model**: The platform represents monetary amounts via the canonical `Money` Value Object (`packages/core/src/resources/domain/shared/value-objects/money.vo.ts`, re-exported in Sales at `packages/core/src/sales/domain/value-objects/money.vo.ts`).
- **Approved ADR**: [ADR-0108](../adr/0108-money-representation.md) mandates **Option 3: Pure Domain `Money` Value Object with Cent-Guarded Integer Arithmetic + PostgreSQL Fixed-Point `Decimal(12, 2)` via Prisma**.
- **Internal Scale & Precision**:
  - `amount`: Validated finite, non-negative JavaScript `number` constrained strictly to 2 decimal places.
  - `currency`: Validated 3-letter uppercase ISO-4217 code (e.g. `'USD'`).
  - Arithmetic (`add`, `subtract`, `multiply`) executes in integer minor units (cents) via `Math.round(amount * 100) / 100`.
  - Rounding Mode: Commercial **Half-Up** rounding (`Math.round`) applied at the cent boundary ($0.01$).
  - Negative Values: Strictly rejected; `subtract` throws if the result would drop below zero.
- **Zero Floating-Point Leakage**: Binary floating-point arithmetic (IEEE 754) is strictly prohibited from leaking into financial results. Intermediate calculations in `Discount.calculate()` use integer cents.

### 2.2 Value Object Architecture & Conventions

All domain value objects in Sales adhere to a uniform Clean Architecture pattern:

1. Implement the `ValueObject<TProps>` interface (`packages/core/src/sales/domain/shared/value-object.ts`).
2. Encapsulate state in `private readonly` instance variables.
3. Keep constructors `private`, routing instantiation through static factory methods (e.g. `Discount.percentage()`, `Discount.fixed()`).
4. Enforce invariants immediately during instantiation, throwing typed domain exceptions upon violation.
5. Enforce deep immutability by executing `Object.freeze(this)` at the end of construction.
6. Provide pure equality checking via `equals(other)`.
7. Expose safe getters and plain serialization helpers (`getValue()`, `toJSON()`, `toString()`).

### 2.3 Domain Error Hierarchy

Domain exceptions form a strongly typed class hierarchy rooted in `SaleDomainException` (`packages/core/src/sales/domain/exceptions/sale-domain.exception.ts`):

- Each exception extends `SaleDomainException` (which extends `Error`).
- Every exception provides a descriptive message and a machine-readable `code` property (e.g. `'INVALID_DISCOUNT'`, `'INVALID_SALE_ITEM'`, `'SALE_ALREADY_FINALIZED'`).
- Prototypes are explicitly restored via `Object.setPrototypeOf(this, new.target.prototype)`.

---

## 3. Scope & Boundary Decisions

### 3.1 Item-Level Discounts Only

The model for Phase 7.3 is strictly:

```text
Sale (Aggregate Root)
 └── SaleItem (Internal Child Entity)
      └── Discount? (Optional Immutable Value Object)
           ├── type: DiscountType (FIXED | PERCENTAGE)
           ├── value: number (Non-negative, 2 decimal places)
           └── reason?: string | null (Audit justification)
```

### 3.2 Rationale for Scope Restriction

Phase 7.3 intentionally restricts discount implementation to **item-level discounts** on `SaleItem` for the following architectural reasons:

1. **Commercial Snapshot Integrity**:  
   `SaleItem` represents the historical point-in-time commercial terms of an individual sold good or service. The price reduction (e.g. 10% student discount on a gym day-pass, or $5 promotional reduction on a protein container) is intrinsically tied to that item's line snapshot.
2. **Elimination of Cross-Item Allocation Complexity**:  
   Sale-level discounts (e.g. "$15 off the total order") require complex multi-item distribution semantics:
   - Proportional weighted distribution across heterogeneous line items.
   - Handling residual fractional pennies (deciding which line item absorbs the rounding cent).
   - Exempt items (handling lines that are legally or commercially ineligible for discounts, such as medical treatment sessions or gift vouchers).
   - Post-sale refund accounting (calculating how much discount to reverse when 1 of 4 items is returned).
3. **Decoupling from Deferred Subsystems**:  
   Tax calculations (Phase 7.3+), coupon codes, promotional campaign engines, and marketing rules are outside the scope of the core financial snapshot. Introducing order-level discount allocation before these policies exist creates speculative, fragile abstractions.

---

## 4. Phase 7.3 Discount Implementation Contract

### 4.1 Bounded-Context Ownership

- `Discount` belongs strictly to the **Sales & Payments** bounded context (`packages/core/src/sales/domain/value-objects/discount.vo.ts`).
- It has zero dependencies on external frameworks (`@nestjs/*`, `@prisma/*`), HTTP layers, or external catalog packages.

### 4.2 Responsibility & Contract

- `Discount` is a pure **Value Object**. It does not possess entity identity (`id`).
- Its sole responsibility is to encapsulate a commercial price reduction rule and compute the exact monetary reduction against an eligible base amount in integer cents with zero rounding drift.

### 4.3 SaleItem Relationship

- `SaleItem` holds an optional reference to `Discount` (`discount: Discount | null`).
- A `SaleItem` may have at most **one** line discount attached. Compound or stacked item discounts must be resolved prior to constructing the `Discount` VO.
- When `discount` is null or removed, `discountTotal` becomes `Money.zero(currency)`.

### 4.4 Supported Types

The Value Object supports two discrete discount types:

1. **`PERCENTAGE`**: Relative reduction expressed as a percentage of the line subtotal (e.g. `15` for 15%).
2. **`FIXED`** (aliased with canonical `FIXED_AMOUNT` for backward compatibility): Absolute monetary reduction in the sale's operating currency (e.g. `5.00` for $5.00 off).

### 4.5 Value Semantics & Bounds

- **Data Type**: Finite JavaScript `number`.
- **Non-Negativity**: `value >= 0`. Negative discount values are strictly rejected with `InvalidDiscountException`.
- **Scale**: Normalized to 2 decimal places (`Math.round(value * 100) / 100`).
- **Zero Value**: A value of `0` (or `0%`) is valid; it produces a reduction of `$0.00` and leaves line total equal to line subtotal.
- **Invalid Inputs**: `NaN`, `Infinity`, `-Infinity`, and non-numeric values are rejected with `InvalidDiscountException`.

### 4.6 Percentage Range

- For `PERCENTAGE` discounts, `value` must satisfy:
  $$0 \le \text{percentage} \le 100$$
- Values $< 0$ or $> 100$ throw `InvalidDiscountException`. A 100% discount reduces the line net total to `$0.00` (representing a fully comped / promotional item).

### 4.7 Eligible Amount

- The eligible amount for a line-item discount is strictly the **SaleItem gross subtotal**:
  $$\text{eligibleAmount} = \text{SaleItem.subtotal} = \text{unitPrice} \times \text{normalizedQuantity}$$
- If `SaleItem.subtotal` is `$0.00` (complimentary or free item), the calculated reduction is always `$0.00`.

### 4.8 Financial Constraint & Strict Rejection Policy

- **Financial Constraint**:
  $$\text{discountAmount} \le \text{eligibleAmount}$$
- **Strict Non-Exceeding Rejection**:
  For a `FIXED` discount, if $\text{value} > \text{eligibleAmount.amount}$, the calculation **MUST FAIL** and throw `InvalidDiscountException`:
  ```typescript
  if (this._type === DiscountType.FIXED && this._value > eligibleAmount.amount) {
    throw new InvalidDiscountException(
      `Fixed discount (${this._value}) cannot exceed eligible amount (${eligibleAmount.amount})`,
    );
  }
  ```
  The domain **never** silently clamps or reduces the discount to the eligible amount. Invalid commercial terms fail fast to protect audit and accounting integrity.

### 4.9 Deterministic Calculation & Rounding Formula

Calculation is executed via `discount.calculate(eligibleAmount: Money): Money`:

1. **Fixed Discount Formula**:
   $$\text{discountAmount} = \text{Money.create}(this.\_value, \text{eligibleAmount.currency})$$
2. **Percentage Discount Formula**:
   $$\text{subtotalCents} = \text{Math.round}(\text{eligibleAmount.amount} \times 100)$$
   $$\text{discountCents} = \text{Math.round}\left(\frac{\text{subtotalCents} \times this.\_value}{100}\right)$$
   $$\text{discountAmount} = \text{Money.create}(\text{discountCents} / 100, \text{eligibleAmount.currency})$$
3. **Rounding Mode**: Commercial **Half-Up** rounding (`Math.round`) applied at the integer cent boundary ($0.01$).
4. **Currency Safety**: The returned `Money` shares the identical ISO-4217 currency of `eligibleAmount`.

### 4.10 Historical Stability

- `SaleItem` captures and stores a historical commercial snapshot:
  - `subtotal = unitPrice * quantity`
  - `discountAmount = discount.calculate(subtotal)`
  - `total = subtotal - discountAmount`
- Once created, these values are **never dynamically recalculated** from upstream catalogs, membership plans, or promotional tables.
- If an upstream inventory product or treatment session is repriced or discontinued, settled sales and existing line items remain completely unchanged.
- Deep immutability: `SaleItem` and `Discount` are deeply frozen with `Object.freeze(this)`.

### 4.11 Aggregate Financial Invariants

The `Sale` aggregate root guarantees the following exact mathematical reconciliation invariants:

$$\text{Sale.subtotal} = \sum_{i} \text{SaleItem}_{i}.\text{subtotal}$$
$$\text{Sale.discountTotal} = \sum_{i} \text{SaleItem}_{i}.\text{discountAmount}$$
$$\text{Sale.total} = \text{Sale.subtotal} - \text{Sale.discountTotal}$$
$$\text{Sale.total} \ge \$0.00$$

---

## 5. Traceability Matrix

The following end-to-end traceability chain connects business requirements, domain rules, aggregate behaviors, and automated regression tests:

```text
Requirement
    ↓
Business Rule
    ↓
Domain Rule
    ↓
Use Case / Aggregate Behavior
    ↓
Test Suite
```

| Traceability Requirement                    | Business Rule        | Domain Rule                                 | Aggregate / VO Behavior                                | Test Suite Reference                                                        |
| :------------------------------------------ | :------------------- | :------------------------------------------ | :----------------------------------------------------- | :-------------------------------------------------------------------------- |
| **Percentage cannot be negative**           | `ITEM-07`            | $0 \le \text{percentage}$                   | `Discount.percentage(val)` rejects $< 0$               | `discount.vo.spec.ts`                                                       |
| **Percentage maximum (100)**                | `ITEM-07`            | $\text{percentage} \le 100$                 | `Discount.percentage(val)` rejects $> 100$             | `discount.vo.spec.ts`                                                       |
| **Fixed discount cannot be negative**       | `ITEM-07`, `MNY-05`  | $\text{fixed} \ge 0.00$                     | `Discount.fixed(val)` rejects $< 0$                    | `discount.vo.spec.ts`                                                       |
| **Discount cannot exceed eligible amount**  | `ITEM-07`            | $\text{discountAmount} \le \text{eligible}$ | `calculate()` rejects $\text{fixed} > \text{eligible}$ | `discount.calculate.spec.ts`, `sale-discount-invariants.spec.ts`            |
| **Deterministic calculation**               | `MNY-01`, `MNY-02`   | Half-Up Cent Rounding                       | `Math.round(cents * pct / 100)`                        | `discount.calculate.spec.ts`                                                |
| **No floating-point financial calculation** | `MNY-01`, ADR-0108   | Integer Cent Arithmetic                     | Integer arithmetic in `calculate()`                    | `discount.calculate.spec.ts`, `money.vo.spec.ts`                            |
| **Item-level discount scope**               | `ITEM-01`, `ITEM-07` | Scope on `SaleItem`                         | `SaleItem.discount`, no order discount                 | `sale-item.entity.spec.ts`, `sale-discount-invariants.spec.ts`              |
| **Historical discount stability**           | `SALE-08`, `ITEM-04` | Frozen Snapshot                             | Immutable snapshot, locked on finalization             | `sale-item-historical-snapshot.spec.ts`, `sale-discount-invariants.spec.ts` |
| **Aggregate invariant reconciliation**      | `SALE-07`, `ITEM-08` | $\text{Total} = \text{Sub} - \text{Disc}$   | `Sale.#recalculateTotals()`                            | `sale-discount-invariants.spec.ts`                                          |

---

## 6. Explicit Out-of-Scope Capabilities (Deferred)

| Deferred Capability                  | Architectural Rationale & Deferred Milestone                                                                                             |
| :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Sale-Level Multi-Item Allocation** | Requires proportional distribution algorithms and partial return allocation policies. Deferred until cross-line promotion engine design. |
| **Coupon / Promo Code Engine**       | Requires promotional campaign entities, coupon redemption limits, and marketing rules. Deferred to Marketing/Promotions context.         |
| **Tax Adjustments on Discounts**     | Tax calculations (inclusive vs. exclusive tax) vary by jurisdiction. Deferred to Phase 7.3+ Tax Port.                                    |
| **Volume / Tiered Pricing**          | Belongs to catalog pricing policies prior to `SaleItem` snapshot creation.                                                               |
| **Loyalty Point Redemptions**        | Belongs to Customer Loyalty bounded context. Points-as-tender belongs to Payment context (`PaymentMethod.LOYALTY_POINTS`).               |
