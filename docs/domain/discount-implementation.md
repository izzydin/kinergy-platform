# Phase 7.3: Discount Implementation & Financial Contract Reconnaissance

- **Document**: `docs/domain/discount-implementation.md`
- **Phase**: `7.3 — Discount Domain Model & Hardening` (Domain Reconnaissance)
- **Role**: Principal Financial Domain Architect / Lead Platform Engineer
- **Status**: Authoritative Domain Specification & Implementation Contract
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
- **Related Documentation**:
  - [`docs/architecture/sales-payments.md`](../architecture/sales-payments.md)
  - [`docs/domain/sales-payments.md`](sales-payments.md)
  - [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
  - [`docs/domain/sale-item-implementation.md`](sale-item-implementation.md)
  - [`docs/architecture/sale-item-acceptance.md`](../architecture/sale-item-acceptance.md)
- **Date**: 2026-09-18

---

## 1. Executive Summary & Reconnaissance Scope

As Senior Financial Domain Engineer responsible for safeguarding Kinergy's financial integrity, this reconnaissance analyzes the repository's existing financial and domain foundations to establish the exact implementation contract for **Phase 7.3: Discount Domain Model**.

In accordance with strict architectural governance, **no implementation code is modified in this reconnaissance milestone**. Instead, this document:

1. Documents the precise financial and technical findings across Phase 7.0, 7.1, and 7.2 artifacts.
2. Validates the architectural boundary for Phase 7.3: **Item-level discounts only** (`Sale` $\to$ `SaleItem` $\to$ `Discount?`).
3. Establishes the exact mathematical, behavioral, and immutability contract that Phase 7.3 implementation will follow.

---

## 2. Repository Financial Contract Reconnaissance Findings

The repository audit evaluated the core financial representations and invariant patterns currently active in `packages/core/src/sales/domain/` and `packages/core/src/resources/domain/shared/`:

### 2.1 Money Representation & Numeric Foundation

- **Canonical Model**: The platform represents monetary amounts via the canonical `Money` Value Object (`packages/core/src/resources/domain/shared/value-objects/money.vo.ts`), re-exported in Sales at `packages/core/src/sales/domain/value-objects/money.vo.ts`.
- **Approved ADR**: [ADR-0108](../adr/0108-money-representation.md) officially approved **Option 3: Pure Domain `Money` Value Object with Cent-Guarded Integer Arithmetic + PostgreSQL Fixed-Point `Decimal(12, 2)` via Prisma**.
- **Internal Scale & Precision**:
  - `amount`: Validated finite, non-negative JavaScript `number` constrained strictly to 2 decimal places.
  - `currency`: Validated 3-letter uppercase ISO-4217 code (e.g. `'USD'`).
  - Arithmetic (`add`, `subtract`, `multiply`) executes in integer minor units (cents) via `Math.round(amount * 100) / 100`.
  - Rounding Mode: Commercial **Half-Up** rounding (`Math.round`) applied at the cent boundary ($0.01$).
  - Negative Values: Strictly rejected; `subtract` throws if the result would drop below zero.
- **Floating-Point Leakage Audit**: Current code does **not** permit floating-point financial drift. Calculations in `Money`, `SaleItem`, and `Sale` execute through cent-guarded methods. Intermediate floating division is avoided or immediately rounded to the nearest integer cent.

### 2.2 Value Object Architecture & Conventions

All domain value objects in Sales adhere to a uniform Clean Architecture pattern:

1. Implement the `ValueObject<TProps>` interface (`packages/core/src/sales/domain/shared/value-object.ts`).
2. Encapsulate state in `private readonly` instance variables.
3. Keep constructors `private`, routing instantiation through static factory methods (e.g. `Discount.percentage()`, `Discount.fixedAmount()`).
4. Enforce invariants immediately during instantiation, throwing typed domain exceptions upon violation.
5. Enforce deep immutability by executing `Object.freeze(this)` at the end of construction.
6. Provide pure equality checking via `equals(other)`.
7. Expose safe getters and plain serialization helpers (`getValue()`, `toJSON()`, `toString()`).

### 2.3 Domain Error Hierarchy

Domain exceptions form a strongly typed class hierarchy rooted in `SaleDomainException` (`packages/core/src/sales/domain/exceptions/sale-domain.exception.ts`):

- Each exception extends `SaleDomainException` (which extends `Error`).
- Every exception provides a descriptive message and a machine-readable `code` property (e.g. `'INVALID_DISCOUNT'`, `'INVALID_SALE_ITEM'`, `'SALE_ALREADY_FINALIZED'`).
- Prototypes are explicitly restored via `Object.setPrototypeOf(this, new.target.prototype)`.

### 2.4 Existing Discount Implementation & SaleItem Behavior

- **Current VO**: `Discount` exists in `packages/core/src/sales/domain/value-objects/discount.vo.ts` with properties `_type: DiscountType`, `_value: number`, and `_reason: string`.
- **Current Enum**: `DiscountType` (`packages/core/src/sales/domain/enums/discount-type.enum.ts`) currently defines `PERCENTAGE = 'PERCENTAGE'` and `FIXED_AMOUNT = 'FIXED_AMOUNT'`.
- **SaleItem Attachment**: `SaleItem` encapsulates an optional `_discount: Discount | null`.
  - When present, `SaleItem` calculates `discountTotal = discount.calculateReduction(subtotal)`.
  - `SaleItem.subtotal` = $\text{unitPrice} \times \text{normalizedQuantity}$.
  - `SaleItem.total` = $\text{subtotal} - \text{discountTotal}$ (guaranteed $\ge \$0.00$).
  - Immutability: Updating a discount on a `SaleItem` is purely functional via `withDiscount(discount)`, returning a new deeply frozen `SaleItem` instance preserving local identity.
- **Aggregate Total (`Sale.discountTotal`)**:
  - `Sale` **already maintains a derived aggregate value** `discountTotal: Money`.
  - It is dynamically recalculated in `Sale.#recalculateTotals()` as the sum of all item discount totals:
    $$\text{saleDiscountTotal} = \sum_{i} \text{item}_{i}.\text{discountTotal}$$
  - In `Sale.reconstitute()`, persisted `discountTotal` is strictly asserted to match the calculated line discounts to the exact cent.

---

## 3. Architectural Boundary Validation for Phase 7.3

### 3.1 Validated Domain Model: Item-Level Discounts Only

The model for Phase 7.3 is strictly:

```text
Sale (Aggregate Root)
 └── SaleItem (Internal Child Entity)
      └── Discount? (Optional Immutable Value Object)
           ├── type: DiscountType (FIXED | PERCENTAGE)
           ├── value: number (Non-negative, 2 decimal places)
           └── reason?: string | null (Audit justification)
```

### 3.2 Rationale for Limiting Initial Scope to Item-Level Discounts

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

The following formal specification governs the `Discount` Value Object and its integration with `SaleItem`:

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

### 4.5 Value Semantics & Precision

- **Data Type**: Finite JavaScript `number`.
- **Non-Negativity**: `value >= 0`. Negative discount values are strictly rejected with `InvalidDiscountException`.
- **Scale**: Normalized to 2 decimal places (`Math.round(value * 100) / 100`).
- **Zero Value**: A value of `0` (or `0%`) is valid; it produces a reduction of `$0.00` and leaves line total equal to line subtotal.
- **Invalid Inputs**: `NaN`, `Infinity`, `-Infinity`, and non-numeric values are rejected with `InvalidDiscountException`.

### 4.6 Percentage Maximum

- For `PERCENTAGE` discounts, `value` cannot exceed **`100`** ($100\%$).
- Values $> 100$ throw `InvalidDiscountException`. A 100% discount reduces the line net total to `$0.00` (representing a fully comped / promotional item).

### 4.7 Eligible Amount

- The eligible amount for a line-item discount is strictly the **gross line subtotal**:
  $$\text{eligibleAmount} = \text{lineSubtotal} = \text{unitPrice.multiply(normalizedQuantity)}$$
- If `lineSubtotal` is `$0.00` (complimentary or free item), the calculated reduction is always `$0.00`.

### 4.8 Rounding Policy

- Line discount reductions are computed in integer minor units (cents) using **Commercial Half-Up rounding**:
  $$\text{reductionInCents} = \text{Math.round}\left(\frac{\text{subtotalInCents} \times \text{percentage}}{100}\right)$$
- **Ceiling / Cap Rule**: An item discount can **never** exceed the line subtotal. If a fixed discount exceeds the line subtotal, the reduction is capped at the subtotal:
  $$\text{discountTotal} = \min(\text{lineSubtotal}, \text{calculatedReduction})$$
- This guarantees that the line total ($\text{lineSubtotal} - \text{discountTotal}$) is **never negative**:
  $$\text{lineTotal} \ge \$0.00$$

### 4.9 Money Representation

- The reduction returned by `discount.calculateReduction(subtotal)` is a canonical `Money` instance sharing the identical ISO-4217 currency of the `subtotal`.
- All internal arithmetic operates via integer cents, completely eliminating IEEE-754 floating-point drift.

### 4.10 Immutability Expectations

- `Discount` instances are deeply frozen at construction (`Object.freeze(this)`).
- `SaleItem` instances containing `Discount` are deeply frozen (`Object.freeze(this)`).
- Applying or removing a discount on a `SaleItem` executes functionally via `SaleItem.withDiscount(discount: Discount | null)` and returns a replacement child entity.
- Once the parent `Sale` transitions out of `DRAFT` status (finalized), **all discounts on all items are permanently frozen**. Any subsequent mutation attempt throws `SaleAlreadyFinalizedException`.

### 4.11 Reason Semantics

- **Attribute**: `reason?: string | null`.
- **Business Purpose**: Provides an audit trail explaining why the price reduction was granted (e.g. `"VIP Member Discount"`, `"Damaged Packaging"`, `"Manager Override"`).
- **Semantics**:
  - If provided, `reason` must be trimmed.
  - If a non-empty string is supplied, it is stored as trimmed text.
  - While previous prototypes mandated a non-empty reason, the contract supports optional reasons (`reason?: string | null`) where system-applied or automatic discounts do not supply custom cashier text, while ensuring that audit-mandated manual overrides supply a non-empty justification.

---

## 5. Explicit Out-of-Scope Functionality for Phase 7.3

To maintain architectural focus and prevent premature complexity, the following capabilities are explicitly **DEFERRED** and **OUT OF SCOPE** for Phase 7.3:

| Deferred Capability                  | Architectural Rationale & Deferred Milestone                                                                                                      |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sale-Level Multi-Item Allocation** | Requires allocation algorithms, residual penny distribution, and refund clawback policies. Deferred until cross-line promotion engine design.     |
| **Coupon / Promo Code Engine**       | Requires promotional campaign entities, coupon redemption limits, expiration dates, and usage tracking. Deferred to Marketing/Promotions context. |
| **Tax Adjustments on Discounts**     | Tax calculation (inclusive vs. exclusive tax) varies by jurisdiction and tenant policy. Deferred to Phase 7.3+ Tax Port.                          |
| **Volume / Tiered Pricing**          | Belongs to catalog pricing policies or application pricing pipelines prior to `SaleItem` snapshot creation.                                       |
| **Loyalty Point Redemptions**        | Belongs to Customer Loyalty bounded context. Points-as-tender belongs to Payment context (`PaymentMethod.LOYALTY_POINTS`).                        |
| **Prisma Schema Alterations**        | Persistence mappings for sales will be implemented during dedicated infrastructure milestones.                                                    |

---

## 6. Implementation Readiness Summary

The repository's existing foundations (ADR-0108, `Money`, `SaleItem`, `Sale` aggregate root, and typed domain exceptions) fully support this contract with zero architectural friction.

Phase 7.3 can proceed to harden the `Discount` Value Object and verify its integration with `SaleItem` within the approved boundaries.
