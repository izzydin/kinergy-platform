# 0113. Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement

- **Status**: Accepted
- **Date**: 2026-09-18
- **Deciders**: Architecture Review Board, Principal Financial Domain Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7.3 (Sales & Payments — Discount Domain Model & Deterministic Calculation). The commercial checkout model requires support for price reductions on sold items (promotions, memberships, retail, therapy) while safeguarding financial integrity, avoiding floating-point drift, and preserving point-in-time commercial snapshots.

---

## 1. Context and Problem Statement

In a wellness facility, commercial transactions often involve price reductions:

- Discretionary discounts applied by receptionists or managers (e.g. $10.00 off a promotional service).
- Percentage-based membership, student, or senior concessions (e.g. 15% off retail supplements or day-passes).
- Fully complimentary or promotional items (e.g. 100% discount on a promotional smoothie or consultation).

Without strict domain rules, discounting systems suffer from chronic financial failure modes:

1. **IEEE-754 Floating-Point Drift**: Calculating percentages with standard JavaScript floats (e.g. `19.99 * 0.15 = 2.9985000000000005`) introduces fractional sub-cent inaccuracies that cascade into balance-sheet reconciliation errors, incorrect receipts, and payment gateway mismatches.
2. **Excessive Discounts & Negative Balances**: If a fixed discount exceeds the price of an item (e.g. $25 discount on a $15 item), allowing negative totals corrupts revenue accounting. Silently clamping the discount masks cashier data entry mistakes or malicious manipulation.
3. **Cross-Line Allocation Entanglement**: Order-level discounts (e.g. "$20 off entire basket") require proportional distribution across heterogeneous lines, creating insoluble problems regarding penny allocation, tax apportionment, and partial returns before those domain models even exist.
4. **Dynamic Catalog Leakage**: If discounts or prices are dynamically recalculated from catalog tables when reading historical transactions, retroactively changing a promo rule alters settled accounting history.

We must define the domain architecture, ownership, supported types, deterministic calculation rules, rounding behavior, and aggregate invariants governing discounts.

---

## 2. Decision Drivers

- **Ownership in Sales Bounded Context**: Discounts are strictly commercial pricing adjustments belonging to Sales & Payments. They must not depend on catalog modules, pricing engines, or external frameworks.
- **Deterministic Cent-Guarded Calculation (ADR-0108)**: Financial calculations must execute exclusively in integer minor units (cents) with deterministic Half-Up rounding. Zero floating-point drift is tolerated.
- **Strict Financial Boundary Enforcement**: An item discount must never exceed the line item's subtotal. Excess discounts must be strictly rejected with typed domain exceptions rather than silently clamped.
- **Historical Snapshot Stability**: Once a `SaleItem` snapshot is established, its commercial terms (including applied discount) are frozen. Repricing or altering promotions in external catalogs must never alter historical records.
- **Scope Discipline (Item-Level First)**: Phase 7.3 explicitly restricts discounts to `SaleItem` level. Sale-level order discounts are deferred to avoid premature multi-item allocation complexity.

---

## 3. Considered Options

### Option 1: Generic Pricing & Promotion Engine with Order-Level Cross-Line Allocation

- Introduce a generalized rule-engine abstraction (`PricingEngine`, `PromotionRule`) that evaluates order-level discounts and dynamically prorates reductions across all lines.
- **Verdict**: **Rejected**. Introduces excessive speculative complexity. Distributing order discounts across heterogeneous lines requires residual penny distribution, tax apportionment policies, and partial refund clawback rules that are out of scope for Phase 7.3.

### Option 2: Silent Clamping of Excess Fixed Discounts

- If a user or API requests a $50 fixed discount on a $30 item, silently clamp the discount to $30.00 so the item total becomes $0.00.
- **Verdict**: **Rejected**. Silently mutating cashier input or API requests masks errors, bypasses audit review, and hides potentially fraudulent or incorrect intent. Invalid commercial terms must fail fast and explicitly.

### Option 3: Pure Domain `Discount` Value Object with Item-Level Scope and Strict Validation (Selected)

- Model `Discount` as an immutable Value Object (`FIXED` or `PERCENTAGE`) owned by the Sales bounded context.
- Limit initial operational scope strictly to `SaleItem` (`Sale` $\to$ `SaleItem` $\to$ `Discount?`).
- Fixed discount amount cannot exceed the eligible amount (the line subtotal); attempting to do so throws `InvalidDiscountException`.
- Percentage discounts are bounded strictly between $0\%$ and $100\%$.
- Calculation is deterministic via integer cent arithmetic and Commercial Half-Up rounding.
- **Verdict**: **Selected**.

---

## 4. Decision Outcome

Chosen Option: **Option 3: Pure Domain `Discount` Value Object with Item-Level Scope and Strict Validation**.

---

## 5. Architectural & Domain Specification

### 5.1 Bounded-Context Ownership

`Discount` belongs exclusively to the **Sales & Payments** bounded context:

- Implemented as a pure TypeScript Value Object (`packages/core/src/sales/domain/value-objects/discount.vo.ts`).
- Zero dependencies on NestJS (`@nestjs/*`), Prisma (`@prisma/*`), HTTP decorators, or external databases.
- Deeply immutable (`Object.freeze(this)`).

### 5.2 Taxonomy & Range Bounds

The `Discount` Value Object supports two discrete types:

```text
DiscountType
├── FIXED         (Monetary reduction in sale currency; alias: FIXED_AMOUNT)
└── PERCENTAGE    (Relative percentage reduction)
```

- **Percentage Range**: Must satisfy $0 \le \text{percentage} \le 100$. Values $< 0$ or $> 100$ throw `InvalidDiscountException`.
- **Fixed Amount Range**: Must satisfy $\text{amount} \ge 0.00$. Negative values throw `InvalidDiscountException`.
- **Input Validation**: `NaN`, `Infinity`, `-Infinity`, and non-numeric values are rejected. Scale is normalized to 2 decimal places.
- **Reason**: Optional audit justification string (`reason?: string | null`). If provided, it is stored trimmed.

### 5.3 Scope: Item-Level Only (No Sale-Level Discounts in Phase 7.3)

- **Supported in Phase 7.3**: `SaleItem`-level discounts. Each `SaleItem` may optionally hold at most one `Discount` instance (`SaleItem.discount`).
- **Deferred / Not Supported in Phase 7.3**: `Sale`-level order discounts. Sale-level discounts require proportional multi-item apportionment algorithms and tax distribution, which remain inactive until dedicated cross-line promotion architecture is established.

### 5.4 Eligible Amount & Financial Constraint

- **Eligible Amount**: The base amount to which an item discount applies is strictly the **SaleItem gross subtotal**:
  $$\text{eligibleAmount} = \text{SaleItem.subtotal} = \text{unitPrice} \times \text{normalizedQuantity}$$
- **Financial Constraint**:
  $$\text{discountAmount} \le \text{eligibleAmount}$$
- **Strict Rejection**: For a `FIXED` discount, if $\text{value} > \text{eligibleAmount.amount}$, the calculation **MUST FAIL** and throw `InvalidDiscountException`. The system does **not** silently reduce the discount to the eligible amount.

### 5.5 Deterministic Calculation & Rounding Formula

Calculation is invoked via `discount.calculate(eligibleAmount: Money): Money`:

1. **Fixed Discount**:
   $$\text{discountAmount} = \text{Money.create(this._value, eligibleAmount.currency)}$$
   (Asserting $\text{this._value} \le \text{eligibleAmount.amount}$).
2. **Percentage Discount**:
   $$\text{subtotalCents} = \text{Math.round}(\text{eligibleAmount.amount} \times 100)$$
   $$\text{discountCents} = \text{Math.round}\left(\frac{\text{subtotalCents} \times \text{this._value}}{100}\right)$$
   $$\text{discountAmount} = \text{Money.create}(\text{discountCents} / 100, \text{eligibleAmount.currency})$$
3. **Deterministic Rounding**: Uses **Commercial Half-Up** rounding (`Math.round`) applied at the integer cent boundary ($0.01$). Floating-point arithmetic is never leaked into financial results.

### 5.6 Historical Stability

`SaleItem` captures a historical commercial snapshot:

- `subtotal = unitPrice * quantity`
- `discountAmount = discount.calculate(subtotal)`
- `total = subtotal - discountAmount`
- These values are computed and stored at checkout. They are **never** dynamically recalculated from upstream catalogs, membership plans, or promotional tables at query time. Once a `Sale` departs `DRAFT` status, all commercial terms are permanently locked.

### 5.7 Aggregate Invariants

The `Sale` aggregate root guarantees the following exact financial reconciliation invariants:

$$\text{Sale.subtotal} = \sum_{i} \text{SaleItem}_{i}.\text{subtotal}$$
$$\text{Sale.discountTotal} = \sum_{i} \text{SaleItem}_{i}.\text{discountAmount}$$
$$\text{Sale.total} = \text{Sale.subtotal} - \text{Sale.discountTotal}$$
$$\text{Sale.total} \ge \$0.00$$

---

## 6. Traceability Matrix

| Requirement / Invariant      | Business Rule        | Domain Rule                               | Implementation                                            | Verification Test                                                           |
| :--------------------------- | :------------------- | :---------------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **Percentage Non-Negative**  | `ITEM-07`            | $0 \le \text{pct} \le 100$                | `Discount.percentage()` / assert                          | `discount.vo.spec.ts`                                                       |
| **Percentage Maximum**       | `ITEM-07`            | $\text{pct} \le 100$                      | `Discount.percentage()` throws `InvalidDiscountException` | `discount.vo.spec.ts`                                                       |
| **Fixed Non-Negative**       | `ITEM-07`, `MNY-05`  | $\text{fixed} \ge 0.00$                   | `Discount.fixed()` / assert                               | `discount.vo.spec.ts`                                                       |
| **Non-Exceeding Eligible**   | `ITEM-07`            | $\text{discount} \le \text{eligible}$     | `discount.calculate()` throws `InvalidDiscountException`  | `discount.calculate.spec.ts`, `sale-discount-invariants.spec.ts`            |
| **Deterministic Rounding**   | `MNY-01`, `MNY-02`   | Half-Up Cent Rounding                     | Integer minor units in `calculate()`                      | `discount.calculate.spec.ts`                                                |
| **No Floating-Point Math**   | `MNY-01`, ADR-0108   | Integer Cent Arithmetic                   | `Math.round(subtotalCents * pct / 100)`                   | `discount.calculate.spec.ts`                                                |
| **Item-Level Scope**         | `ITEM-01`, `ITEM-07` | Scope on `SaleItem`                       | `SaleItem.discount`, no sale-level discount               | `sale-item.entity.spec.ts`, `sale-discount-invariants.spec.ts`              |
| **Historical Stability**     | `SALE-08`, `ITEM-04` | Frozen Snapshot                           | Deep freeze, locked on departure from `DRAFT`             | `sale-item-historical-snapshot.spec.ts`, `sale-discount-invariants.spec.ts` |
| **Aggregate Reconciliation** | `SALE-07`, `ITEM-08` | $\text{Total} = \text{Sub} - \text{Disc}$ | `Sale.#recalculateTotals()`                               | `sale-discount-invariants.spec.ts`                                          |

---

## 7. Consequences

### Positive

- **Guaranteed Solvency**: An item discount can never turn a line item or order balance negative.
- **Accurate Auditability**: Fixed discounts exceeding line items fail fast, alerting cashiers to entry mistakes.
- **Zero Reconciliation Drift**: Integer cent Half-Up arithmetic ensures line items, sales orders, receipts, and payment transactions balance to the exact penny.
- **Clean Architecture**: Pure Value Object with zero framework or database dependencies.

### Negative / Trade-offs

- **Deferred Order Discounts**: Front-desk promotions offering blanket basket reductions (e.g. "$20 off your total order") must be decomposed into item-level discounts until the Phase 7 multi-line allocation engine is specified.
