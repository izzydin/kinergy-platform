# Phase 7: Sales & Payments — Milestone 7.4: Sale Totals & Canonical Money Rules Architecture Specification

- **Document**: `docs/architecture/sale-totals-and-money-rules.md`
- **Milestone**: 7.4 (Sale Totals & Money Rules)
- **Status**: **Certified Implemented Architecture Specification**
- **Role**: Senior Financial Domain Architect / Lead Platform Engineer
- **Date**: 2026-09-18
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
- **Related Documents**:
  - [`docs/domain/sale-totals-implementation.md`](../domain/sale-totals-implementation.md)
  - [`docs/architecture/sale-totals-acceptance.md`](sale-totals-acceptance.md)
  - [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
  - [`docs/domain/sales-payments.md`](../domain/sales-payments.md)
  - [`docs/api/README.md`](../api/README.md)
  - [`docs/testing/README.md`](../testing/README.md)

---

## 1. Executive Summary

This document establishes the authoritative architectural contract, mathematical specifications, persistence mapping, API transport representations, and verification criteria for **Milestone 7.4: Sale Totals & Canonical Money Rules** in the Kinergy Platform.

Milestone 7.4 delivers a completely deterministic, zero-drift financial calculation engine across the pure domain model, application use cases, relational persistence mappers, and REST API controllers. It eliminates all binary floating-point rounding hazards across multi-service therapy checkouts, bulk retail consumables, and membership plan purchases.

### Canonical Mathematical Model

$$\text{subtotal} = \sum_{i=1}^{n} (\text{item}_{i}.\text{quantity} \times \text{item}_{i}.\text{unitPrice})$$

$$\text{discountTotal} = \sum_{i=1}^{n} (\text{valid discounts}_{i})$$

$$\text{total} = \text{subtotal} - \text{discountTotal}$$

Subject to non-negotiable financial invariants:

$$\text{subtotal} \ge \$0.00, \quad \text{discountTotal} \ge \$0.00, \quad \text{total} \ge \$0.00$$

$$0.00 \le \text{discountTotal} \le \text{subtotal}$$

---

## 2. Canonical Monetary Representation & Conversion Boundaries

The platform operates across four architectural boundaries. Each boundary enforces a dedicated representation designed for its specific context, isolated through explicit bidirectional mappers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL FINANCIAL FLOW                        │
│                                                                        │
│  DOMAIN LAYER: Pure Money Value Object                                 │
│  - Immutable: amount: number (2 decimals), currency: string (ISO-4217) │
│  - Arithmetic: Operated entirely in integer cents                      │
│    add(a, b)      = (round(a*100 + eps) + round(b*100 + eps)) / 100    │
│    subtract(a, b) = (round(a*100 + eps) - round(b*100 + eps)) / 100    │
│    multiply(a, q) = round(round(a*100 + eps) * q + eps) / 100          │
│                                                                        │
│  APPLICATION LAYER: Command & Query Orchestration                      │
│  - Operates purely on Money instances and scalar DTOs                  │
│                                                                        │
│  MAPPER LAYER (Infrastructure): Bidirectional Anti-Corruption          │
│  - To Persistence: new Prisma.Decimal(money.amount)                    │
│  - To Domain:      Money.create(raw.amount.toNumber(), raw.currency)   │
│                                                                        │
│  PERSISTENCE LAYER: Relational Database                                │
│  - PostgreSQL Column: DECIMAL(12, 2) NOT NULL                          │
│                                                                        │
│  API TRANSPORT LAYER: Structured DTO Serialization                     │
│  - JSON Schema: { "amount": 49.99, "currency": "USD",                  │
│                   "formatted": "49.99", "cents": 4999 }                │
│                                                                        │
│  EXTERNAL GATEWAY ADAPTER (Stripe / POS Terminal):                     │
│  - amountInCents = money.cents                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Canonical Domain Representation (`Money` Value Object)

- **Class**: `packages/core/src/sales/domain/value-objects/money.vo.ts`
- **Internal State**:
  - `_amount: number`: Validated finite, non-negative JavaScript number constrained to 2 decimal places ($0.01$).
  - `_currency: string`: Normalized 3-letter uppercase ISO-4217 code (e.g. `'USD'`).
- **Encapsulation & Immutability**: All fields are `private readonly`; instances are frozen with `Object.freeze(this)`.
- **Arithmetic Foundation**: Arithmetic operators (`+`, `-`, `*`) are prohibited directly on major units. Operations execute in integer minor units (cents) via `Math.round((amount + Number.EPSILON) * 100)`.

### 2.2 Persistence Representation (PostgreSQL & Prisma)

- **PostgreSQL Column Type**: `DECIMAL(12, 2)` / `NUMERIC(12, 2)`.
- **Prisma Client Type**: `Prisma.Decimal` (from `@prisma/client/runtime/library`).
- **Isolation Rule**: `Prisma.Decimal` must **NEVER** enter the pure domain layer. The domain has zero imports from `@prisma/client`.
- **Mapper Contract** (`packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-sale.mapper.ts`):
  - **Domain $\to$ Prisma**: `new Prisma.Decimal(money.amount)`
  - **Prisma $\to$ Domain**: `Money.create(raw.amount.toNumber(), raw.currency)`

### 2.3 API Transport Representation (`MoneyResponseDto`)

- **Class**: `apps/api/src/sales/dto/money-response.dto.ts`
- **Dual-Mode Structure**:
  1. **Structured Object (`MoneyResponseDto`)**:
     ```json
     {
       "amount": 49.99,
       "currency": "USD",
       "formatted": "49.99",
       "cents": 4999
     }
     ```
  2. **Flat Read Projections**:
     - `subtotalAmount: number` (e.g. `49.99`)
     - `discountTotalAmount: number` (e.g. `10.00`)
     - `totalAmount: number` (e.g. `39.99`)
     - `currency: string` (e.g. `"USD"`)

### 2.4 External Payment Gateway Boundary

- External payment processors (Stripe, card terminals, ACH settlement) accept raw integer cents:
  ```ts
  const gatewayChargeCents = sale.total.cents; // e.g., 3999
  ```
- Guaranteed zero-loss, zero-fraction conversion.

---

## 3. Canonical Currency Policy

1. **Standardization**: Currency codes must be valid 3-letter uppercase strings conforming to ISO-4217 (`USD`, `CAD`, `EUR`, `GBP`, `AUD`).
2. **Mono-Currency per Transaction**:
   - Each tenant checkout session operates in exactly one functional currency (default: `"USD"`).
   - Every `SaleItem` added to a `Sale` must match the `Sale` currency.
   - Any attempt to add an item with a mismatched currency throws `InvalidSaleStateException` (`MISMATCHED_CURRENCY`).
3. **Domain Currency Guard**:
   - Arithmetic operations (`add`, `subtract`, comparisons) between `Money` instances of different currencies immediately throw `InvalidMoneyException` (`CURRENCY_MISMATCH`).
   - Equality comparison (`a.equals(b)`) returns `false` if currencies differ.

---

## 4. Precision Hierarchy & Database Scale

| Precision Tier            | Scale & Precision                    | Backing Implementation                           | Capacity / Range                                |
| :------------------------ | :----------------------------------- | :----------------------------------------------- | :---------------------------------------------- |
| **Calculation Precision** | Integer minor units (cents, $0.01$)  | `Math.round((units + Number.EPSILON) * 100)`     | Up to safe JavaScript integer limit ($10^{15}$) |
| **Persistence Precision** | Fixed-point `DECIMAL(12, 2)`         | PostgreSQL `@db.Decimal(12, 2)` / Prisma Decimal | $\pm \$9,999,999,999.99$                        |
| **Display / API Scale**   | Fixed 2 decimal places + cents       | Number `49.99`, String `"49.99"`, Int `4999`     | Exact two-decimal string format                 |
| **Quantity Precision**    | 3 decimal places (scale: 3, $0.001$) | Normalized via `(q + Number.EPSILON) * 1000`     | $0.001 \le \text{quantity} \le 999,999$         |

---

## 5. Rounding Rules & Execution Timing

### 5.1 Rounding Mode: Commercial Half-Up

The platform exclusively enforces **Commercial Half-Up Rounding** (`round-half-up`), where halfway values (e.g. $\$0.005$) consistently round away from zero to $\$0.01$.

To eliminate IEEE-754 floating-point midpoint drift (such as `0.285 * 100 = 28.499999999999996` which native `Math.round` would erroneously truncate down to 28 cents), every calculation applies `Number.EPSILON`:

```ts
const cents = Math.round((amount + Number.EPSILON) * 100);
```

### 5.2 Timing of Rounding Events

Rounding occurs **immediately at calculation boundaries**, preventing the propagation of fractional cents:

1. **Line Subtotal**:
   $$\text{itemSubtotalCents} = \text{Math.round}\left(\text{unitPriceCents} \times \text{quantity} + \text{Number.EPSILON}\right)$$
   $$\text{SaleItem.subtotal} = \text{Money.create}(\text{itemSubtotalCents} / 100, \text{currency})$$
2. **Percentage Discount**:
   $$\text{discountCents} = \text{Math.round}\left(\frac{\text{itemSubtotalCents} \times \text{percentage}}{100} + \text{Number.EPSILON}\right)$$
   $$\text{SaleItem.discountTotal} = \text{Money.create}(\text{discountCents} / 100, \text{currency})$$
3. **Line Net Total**:
   $$\text{lineTotalCents} = \text{itemSubtotalCents} - \text{discountCents}$$
   $$\text{SaleItem.total} = \text{Money.create}(\text{lineTotalCents} / 100, \text{currency})$$
4. **Final Sale Aggregation**:
   $$\text{Sale.subtotal} = \sum_{i=1}^n \text{SaleItem}_{i}.\text{subtotal}$$
   $$\text{Sale.discountTotal} = \sum_{i=1}^n \text{SaleItem}_{i}.\text{discountTotal}$$
   $$\text{Sale.total} = \text{Sale.subtotal} - \text{Sale.discountTotal}$$
   Because line subtotals and line discounts are already exact integer cents, order aggregation is a pure integer sum and difference. **Zero repeated rounding, zero fractional leakage, and zero cumulative drift.**

---

## 6. Financial Formulas & Calculations

### Formula 1: Gross Subtotal

$$\text{subtotal} = \sum_{i=1}^{n} (\text{item}_{i}.\text{quantity} \times \text{item}_{i}.\text{unitPrice})$$

### Formula 2: Discount Total

$$\text{discountTotal} = \sum_{i=1}^{n} (\text{valid line discounts}_{i})$$

### Formula 3: Net Payable Total

$$\text{total} = \text{subtotal} - \text{discountTotal}$$

---

## 7. Strict Financial Invariants

1. **Monetary Non-Negativity**:
   $$\text{subtotal} \ge \$0.00$$
   $$\text{discountTotal} \ge \$0.00$$
   $$\text{total} \ge \$0.00$$
2. **Discount Ceiling**:
   $$\text{discountTotal} \le \text{subtotal}$$
   A discount cannot reduce a line item or a sale below $\$0.00$.
3. **Currency Homogeneity**:
   All items, discounts, and aggregate totals in a `Sale` must share the same ISO-4217 currency.
4. **Reconstitution Integrity Law**:
   When rehydrating a `Sale` or `SaleItem` from persistence:
   - Line subtotals and discounts are recomputed from raw inputs (`quantity`, `unitPrice`, `discount`).
   - Recomputed values must match persisted snapshot values to the exact cent via `equals()`.
   - Any persisted mismatch of even 1 cent ($0.01$) throws `InvalidSaleStateException` or `InvalidSaleItemException`.
5. **Commercial Immutability**:
   Once a `Sale` departs `DRAFT` status (`PENDING_PAYMENT`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`), commercial terms freeze permanently. Any mutation throws `SaleAlreadyFinalizedException`.

---

## 8. Discount Behavior Specifications

| Discount Type              | Evaluation Rule                                               | Bounds / Validation                                                       | Behavior on Excessive Value                                                              |
| :------------------------- | :------------------------------------------------------------ | :------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| **Fixed (`FIXED`)**        | Absolute currency reduction subtracted from line subtotal     | $0.00 \le \text{value} \le \text{lineSubtotal}$; Currency must match item | Throws `InvalidDiscountException` (`FIXED_DISCOUNT_EXCEEDS_AMOUNT`). No silent clamping! |
| **Percentage (`PERCENT`)** | Relative percentage reduction evaluated against line subtotal | $0.00 \le \text{percentage} \le 100.00$; Rounded half-up to cent          | Values $< 0$ or $> 100$ throw `InvalidDiscountException` (`INVALID_PERCENTAGE`).         |
| **Zero Discount**          | Permitted; results in $\$0.00$ reduction                      | $0\%$ or $\$0.00$ fixed                                                   | Evaluates cleanly to $\$0.00$ without error.                                             |
| **Full 100% Discount**     | Permitted (promotional/complimentary)                         | $100\%$ or fixed equal to subtotal                                        | Line total evaluates to exactly $\$0.00$. Total invariant $\ge \$0.00$ holds.            |
| **Multiple Discounts**     | Evaluated per line item (`SaleItem.discount`) and aggregated  | Summed deterministically to `Sale.discountTotal`                          | Order-level discounts remain deferred to Phase 7.5.                                      |

---

## 9. Security & Data Integrity Rationale

### Why Floating-Point Arithmetic is Strictly Prohibited

Computers using IEEE-754 binary floating-point representation cannot natively represent decimal fractions whose denominators are not powers of two. In binary:

- `0.1` is a repeating fraction: `0.0001100110011...`
- `0.2` is a repeating fraction: `0.0011001100110...`
- `0.1 + 0.2` evaluates to `0.30000000000000004`
- `1.00 - 0.90` evaluates to `0.09999999999999998`
- `0.29 * 100` evaluates to `28.999999999999996`

In an enterprise healthcare, wellness, and fitness billing platform:

1. **Cashier Till Discrepancies**: Truncating `0.09999999999999998` to 9 cents creates phantom 1-cent shortages across daily register audits.
2. **Tax Non-Compliance**: Accumulated sub-cent floating-point errors create tax reporting discrepancies between line items and invoice summaries, failing fiscal audits.
3. **Gateway Authorization Failures**: Passing `28.999999999999996` to payment gateways can cause payment intent rejections or mismatched settlement amounts.
4. **Fraud & Exploitation**: Precision truncation can be exploited through split-transaction penny skimming.

By enforcing integer minor units with `Number.EPSILON` Commercial Half-Up rounding, Kinergy achieves 100% mathematical determinism.

---

## 10. API Specification & JSON Examples

### 10.1 Create Sale Session (`POST /api/v1/sales`)

**Request:**

```http
POST /api/v1/sales HTTP/1.1
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "currency": "USD",
  "clientId": "client_8b39c01",
  "source": {
    "sourceType": "RETAIL",
    "sourceId": "terminal_frontdesk_01"
  }
}
```

**Response (`201 Created`):**

```json
{
  "id": "sale_01j9876543210abcdef",
  "clientId": "client_8b39c01",
  "currency": "USD",
  "status": "DRAFT",
  "subtotal": {
    "amount": 0,
    "currency": "USD",
    "formatted": "0.00",
    "cents": 0
  },
  "discountTotal": {
    "amount": 0,
    "currency": "USD",
    "formatted": "0.00",
    "cents": 0
  },
  "total": {
    "amount": 0,
    "currency": "USD",
    "formatted": "0.00",
    "cents": 0
  },
  "subtotalAmount": 0,
  "discountTotalAmount": 0,
  "totalAmount": 0,
  "itemCount": 0,
  "items": [],
  "version": 1,
  "createdAt": "2026-09-18T16:00:00.000Z",
  "updatedAt": "2026-09-18T16:00:00.000Z"
}
```

### 10.2 Add Item with Percentage Discount (`POST /api/v1/sales/:id/items`)

**Request:**

```http
POST /api/v1/sales/sale_01j9876543210abcdef/items HTTP/1.1
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "description": "Premium Whey Protein Isolate (1.5 kg)",
  "skuOrCode": "RET-PROT-001",
  "unitPrice": {
    "amount": 49.99,
    "currency": "USD"
  },
  "quantity": 2,
  "discount": {
    "type": "PERCENTAGE",
    "value": 15,
    "reason": "VIP Member 15% Promotion"
  },
  "source": {
    "sourceType": "INVENTORY",
    "sourceId": "inv_item_9921"
  }
}
```

**Response (`201 Created`):**

```json
{
  "id": "sale_01j9876543210abcdef",
  "currency": "USD",
  "status": "DRAFT",
  "subtotal": {
    "amount": 99.98,
    "currency": "USD",
    "formatted": "99.98",
    "cents": 9998
  },
  "discountTotal": {
    "amount": 15.0,
    "currency": "USD",
    "formatted": "15.00",
    "cents": 1500
  },
  "total": {
    "amount": 84.98,
    "currency": "USD",
    "formatted": "84.98",
    "cents": 8498
  },
  "subtotalAmount": 99.98,
  "discountTotalAmount": 15.0,
  "totalAmount": 84.98,
  "itemCount": 1,
  "items": [
    {
      "id": "item_01j9877890123abcdef",
      "description": "Premium Whey Protein Isolate (1.5 kg)",
      "skuOrCode": "RET-PROT-001",
      "quantity": 2,
      "unitPrice": {
        "amount": 49.99,
        "currency": "USD",
        "formatted": "49.99",
        "cents": 4999
      },
      "subtotal": {
        "amount": 99.98,
        "currency": "USD",
        "formatted": "99.98",
        "cents": 9998
      },
      "discountTotal": {
        "amount": 15.0,
        "currency": "USD",
        "formatted": "15.00",
        "cents": 1500
      },
      "total": {
        "amount": 84.98,
        "currency": "USD",
        "formatted": "84.98",
        "cents": 8498
      },
      "discount": {
        "type": "PERCENTAGE",
        "value": 15,
        "reason": "VIP Member 15% Promotion"
      }
    }
  ],
  "version": 2,
  "createdAt": "2026-09-18T16:00:00.000Z",
  "updatedAt": "2026-09-18T16:05:00.000Z"
}
```

---

## 11. Complete Traceability Chain

Every Milestone 7.4 requirement is traceable from Business Requirement through to Automated Tests:

```text
Requirement
    ↓
Domain Rule
    ↓
Use Case
    ↓
Persistence
    ↓
API
    ↓
Frontend Contract
    ↓
Test
```

| Requirement ID | Business & Domain Rule                                                                                                            | Application Use Case                                        | Persistence Mapper                 | API Transport & DTO                      | Frontend Contract                 | Automated Test Suite                                                               |
| :------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :--------------------------------- | :--------------------------------------- | :-------------------------------- | :--------------------------------------------------------------------------------- |
| **REQ-7.4-01** | **Deterministic Totals Formula**<br/>$\text{subtotal} = \sum (q \times p)$<br/>$\text{total} = \text{subtotal} - \text{discount}$ | `AddSaleItemHandler`<br/>`CreateSaleHandler`                | `PrismaSaleMapper.toPersistence()` | `SaleResponseDto`<br/>`MoneyResponseDto` | `SaleSummary`<br/>`cart_subtotal` | `sale-application-totals.spec.ts`<br/>`sale.aggregate.spec.ts`                     |
| **REQ-7.4-02** | **Zero Float Drift**<br/>Integer minor units with `Number.EPSILON`                                                                | `Money.add()`<br/>`Money.subtract()`<br/>`Money.multiply()` | PostgreSQL `DECIMAL(12, 2)`        | `amount`, `cents`, `formatted`           | `cents` integer parsing           | `monetary-precision-safety-net.spec.ts`<br/>`sales-monetary-anti-patterns.spec.ts` |
| **REQ-7.4-03** | **Commercial Half-Up Rounding**<br/>$0.005 \to 0.01$, $0.0049 \to 0.00$                                                           | `Discount.calculate()`<br/>`SaleItem.create()`              | Fixed-point scale 2                | Fixed-point 2 decimals                   | Currency display formatter        | `monetary-precision-safety-net.spec.ts`<br/>`discount.vo.spec.ts`                  |
| **REQ-7.4-04** | **Strict Non-Negative Invariants**<br/>$\text{subtotal} \ge 0$, $\text{discount} \ge 0$, $\text{total} \ge 0$                     | `Sale.addItem()`<br/>`Sale.recalculateTotals()`             | DB Check constraints               | Positive number validation               | UI total >= $0.00                 | `sale-discount-invariants.spec.ts`<br/>`monetary-precision-safety-net.spec.ts`     |
| **REQ-7.4-05** | **Excessive Discount Rejection**<br/>$\text{fixed} > \text{subtotal}$ rejected                                                    | `SaleItem.create()`<br/>`Discount.calculate()`              | N/A (Transaction aborts)           | `400 Bad Request`<br/>`INVALID_DISCOUNT` | Form error alert                  | `phase-7-3-discount-test-matrix.spec.ts`<br/>`discount.vo.spec.ts`                 |
| **REQ-7.4-06** | **Currency Homogeneity**<br/>Single currency per sale session                                                                     | `Sale.addItem()`<br/>`Sale.assertDraftState()`              | Single currency column             | ISO-4217 validation                      | Tenant default currency           | `sale-item-integration.spec.ts`<br/>`monetary-precision-safety-net.spec.ts`        |
| **REQ-7.4-07** | **Domain Purity Boundary**<br/>Zero Prisma/NestJS imports in domain                                                               | Hexagonal Domain Kernel                                     | Explicit mapper layer              | DTO serialization layer                  | Decoupled client models           | `sales-monetary-anti-patterns.spec.ts`                                             |
| **REQ-7.4-08** | **Reconstitution Integrity**<br/>Rejects 1-cent corrupted persistence                                                             | `Sale.reconstitute()`<br/>`SaleItem.reconstitute()`         | `PrismaSaleMapper.toDomain()`      | Error 500 on corrupted DB                | Data integrity alert              | `monetary-precision-safety-net.spec.ts`                                            |
| **REQ-7.4-09** | **Commercial Immutability**<br/>Freeze terms on departure from `DRAFT`                                                            | `FinalizeSaleHandler`<br/>`Sale.finalize()`                 | Frozen records in DB               | Read-only order view                     | Disabled cart editing             | `sale-hardening.spec.ts`<br/>`monetary-precision-safety-net.spec.ts`               |
