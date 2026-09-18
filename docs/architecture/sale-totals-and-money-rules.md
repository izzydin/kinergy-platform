# Phase 7: Sales & Payments — Milestone 7.4: Sale Totals & Money Rules Discovery & Architecture Proposal

- **Document**: `docs/architecture/sale-totals-and-money-rules.md`
- **Milestone**: 7.4 (Sale Totals & Money Rules)
- **Status**: Discovery & Proposal Complete (APPROVED FOR IMPLEMENTATION PLANNING)
- **Role**: Senior Financial Domain Architect
- **Date**: 2026-09-18
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)

---

## 1. Executive Summary

This architecture proposal establishes the exact integration points, domain representations, calculation ownership, and validation rules for **Milestone 7.4: Sale Totals & Money Rules** in the Kinergy Platform.

In accordance with the Milestone 7.4 mandate, **this step does NOT implement monetary calculations yet**. It provides an exhaustive reconnaissance of the existing repository, catalogs all current monetary representations and risks, determines PostgreSQL persistence characteristics, formalizes discount integration semantics, and specifies the target deterministic architecture.

### Target Financial Model for Milestone 7.4

$$\text{subtotal} = \sum_{i} (\text{item}_{i}.\text{quantity} \times \text{item}_{i}.\text{unitPrice})$$

$$\text{discountTotal} = \sum_{i} (\text{valid discounts}_{i})$$

$$\text{total} = \text{subtotal} - \text{discountTotal}$$

Subject to strict non-negative invariants:

$$\text{subtotal} \ge \$0.00, \quad \text{discountTotal} \ge \$0.00, \quad \text{total} \ge \$0.00$$

---

## 2. Exact Files Inspected

### 2.1 Sales Bounded Context (`packages/core/src/sales/`)

- `packages/core/src/sales/index.ts`
- `packages/core/src/sales/domain/index.ts`
- `packages/core/src/sales/domain/sale.aggregate.ts`
- `packages/core/src/sales/domain/entities/sale-item.entity.ts`
- `packages/core/src/sales/domain/entities/index.ts`
- `packages/core/src/sales/domain/value-objects/money.vo.ts`
- `packages/core/src/sales/domain/value-objects/discount.vo.ts`
- `packages/core/src/sales/domain/value-objects/sale-id.vo.ts`
- `packages/core/src/sales/domain/value-objects/sale-item-id.vo.ts`
- `packages/core/src/sales/domain/value-objects/source-reference.vo.ts`
- `packages/core/src/sales/domain/value-objects/index.ts`
- `packages/core/src/sales/domain/enums/sale-status.enum.ts`
- `packages/core/src/sales/domain/enums/source-type.enum.ts`
- `packages/core/src/sales/domain/enums/discount-type.enum.ts`
- `packages/core/src/sales/domain/enums/index.ts`
- `packages/core/src/sales/domain/events/index.ts`
- `packages/core/src/sales/domain/exceptions/index.ts`
- `packages/core/src/sales/domain/shared/aggregate-root.ts`
- `packages/core/src/sales/domain/shared/entity.ts`
- `packages/core/src/sales/domain/shared/value-object.ts`
- `packages/core/src/sales/domain/shared/clock.ts`

### 2.2 Sales Domain Test Suites (`packages/core/src/sales/domain/__tests__/`)

- `packages/core/src/sales/domain/__tests__/phase-7-3-discount-test-matrix.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-discount-invariants.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts`
- `packages/core/src/sales/domain/__tests__/discount.vo.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-deterministic-errors.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-item-historical-snapshot.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-item-integration.spec.ts`
- `packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts`
- `packages/core/src/sales/domain/__tests__/source-reference.vo.spec.ts`

### 2.3 Peer Context Monetary & Pricing Implementations

- `packages/core/src/resources/domain/shared/value-objects/money.vo.ts` (Phase 6 canonical VO)
- `packages/core/src/resources/domain/shared/exceptions/invalid-money.exception.ts`
- `packages/core/src/resources/infrastructure/persistence/prisma/mappers/prisma-inventory-item.mapper.ts`
- `packages/core/src/resources/infrastructure/persistence/prisma/mappers/prisma-fixed-asset.mapper.ts`
- `packages/core/src/gym/domain/plan/plan-price.vo.ts` (Phase 5 ad-hoc price VO)

### 2.4 Persistence & Schema

- `prisma/schema.prisma`
- `prisma/migrations/20260826000000_add_resources_management/migration.sql`

### 2.5 API Layer & DTOs

- `apps/api/src/resources/dto/inventory.dto.ts`
- `apps/api/src/resources/dto/fixed-assets.dto.ts`
- `apps/api/src/resources/dto/resource-valuation.dto.ts`
- `apps/api/src/app.module.ts`

### 2.6 Architecture & Business Rules Documentation

- `docs/adr/0108-money-representation.md`
- `docs/adr/0109-payment-lifecycle.md`
- `docs/adr/0110-sale-ownership.md`
- `docs/adr/0111-sales-payments-authorization-and-audit.md`
- `docs/adr/0112-sales-bounded-context.md`
- `docs/adr/0113-item-level-discounts.md`
- `docs/business-rules/sales-payments.md`
- `docs/domain/sales-payments.md`
- `docs/domain/discount-implementation.md`
- `docs/architecture/sales-payments.md`
- `docs/architecture/discount-domain-acceptance.md`
- `docs/architecture/discount-domain-review.md`
- `docs/architecture/sale-item-acceptance.md`
- `docs/architecture/sales-foundation-acceptance.md`

---

## 3. Existing Patterns Discovered

1. **Pure Domain Value Object Pattern**:
   - `Money` and `Discount` are implemented as pure TypeScript Value Objects.
   - Deeply immutable (`Object.freeze(this)`).
   - Zero framework dependencies (`@nestjs/*`, `@prisma/*`, HTTP decorators).
   - Co-located domain tests assert isolation from external infrastructure.

2. **Re-Export / Anti-Duplication Pattern**:
   - `packages/core/src/sales/domain/value-objects/money.vo.ts` re-exports `Money` from `packages/core/src/resources/domain/shared/value-objects/money.vo.ts`.
   - Prevents code duplication between Phase 6 (Resources) and Phase 7 (Sales).

3. **Reconstitution Invariant Enforcement**:
   - Both `SaleItem.reconstitute()` and `Sale.reconstitute()` recalculate mathematical totals from granular line items and assert equality with persisted values using `equals()`.
   - Any persisted mismatch throws `InvalidSaleStateException` or `InvalidSaleItemException`.

4. **Progressive Immutability Lifecycle**:
   - Mutations (`addItem`, `updateItemQuantity`, `applyItemDiscount`, `removeItemDiscount`, `removeItem`) are permitted strictly in `DRAFT` status (`assertDraftState()`).
   - Calling `sale.finalize()` transitions to `PENDING_PAYMENT` and permanently locks commercial terms (`SaleAlreadyFinalizedException`).

5. **Prisma Decimal Mapping**:
   - Repositories map domain `Money` to `new Prisma.Decimal(money.amount)` on write.
   - Mappers convert `raw.amount.toNumber()` or `Number(raw.amount)` into domain `Money.create(...)` on read.

---

## 4. Current Monetary Representation & Discovered Risks

### 4.1 Taxonomy of Current Representations

| Layer / Component       | Current Representation                                       | Exact File Location                                                   | Evaluation                                                                      |
| :---------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **Sales Domain VO**     | `Money` wrapping `_amount: number` & `_currency: string`     | `packages/core/src/sales/domain/value-objects/money.vo.ts`            | **Good baseline**, but internal arithmetic carries float drift risks (see 4.2). |
| **Resources Domain VO** | `Money` wrapping `_amount: number` & `_currency: string`     | `packages/core/src/resources/domain/shared/value-objects/money.vo.ts` | Source definition re-exported by Sales.                                         |
| **Gym Domain VO**       | `PlanPrice` wrapping `_amount: number` & `_currency: string` | `packages/core/src/gym/domain/plan/plan-price.vo.ts`                  | **Isolated ad-hoc VO** earmarked for deprecation in ADR-0108.                   |
| **Discount VO**         | `_value: number` (fixed currency amount or percentage)       | `packages/core/src/sales/domain/value-objects/discount.vo.ts`         | Validated $0 \le \text{pct} \le 100$ or $\text{amt} \ge 0$.                     |
| **Domain Events**       | `unitPrice: number`, `totalAmount: number`                   | `packages/core/src/sales/domain/events/`                              | Flat numbers in event payloads.                                                 |
| **Snapshots**           | `unitPrice: number`, `subtotal: number`, `total: number`     | `packages/core/src/sales/domain/entities/sale-item.entity.ts`         | Flat numbers in read projection snapshot.                                       |
| **Prisma Schema**       | `Decimal(10, 2)`                                             | `prisma/schema.prisma` (Resources models)                             | Currently only in Resources; Sales models not yet created.                      |
| **API DTOs**            | `number` with `@IsNumber()`, `@Min(0)`                       | `apps/api/src/resources/dto/`                                         | Flat JSON numbers representing major units.                                     |

### 4.2 Monetary Risks Discovered

1. **Float Addition/Subtraction Before Cent Conversion in `Money`**:
   - In `packages/core/src/resources/domain/shared/value-objects/money.vo.ts`:
     ```ts
     // Line 65:
     return new Money(Math.round((this._amount + other.amount) * 100) / 100, this._currency);
     // Line 74:
     const result = Math.round((this._amount - other.amount) * 100) / 100;
     ```
   - **Risk**: Adding or subtracting two IEEE-754 floats before converting to integer cents can suffer precision drop. For example, `1.005 - 1.000` evaluates in binary floating-point to `0.004999999999999893`. Multiplying by 100 yields `0.4999999999999893`, which `Math.round()` truncates to `0` instead of rounding half-up to `1` cent!
   - **Remedy**: Convert each operand to integer cents first:
     ```ts
     const centsA = Math.round((this._amount + Number.EPSILON) * 100);
     const centsB = Math.round((other.amount + Number.EPSILON) * 100);
     return Money.create((centsA + centsB) / 100, this._currency);
     ```

2. **Inconsistent `Number.EPSILON` Rounding Guard**:
   - `Discount.ts` uses `Math.round((props.value + Number.EPSILON) * 100) / 100` in its constructor.
   - `Money.ts` omits `Number.EPSILON` in `constructor`, `add`, `subtract`, and `multiply`.
   - **Risk**: Values at exact midpoint boundaries (e.g. `0.285 * 100 = 28.499999999999996`) round downward in standard JavaScript without the epsilon guard.

3. **Cross-Bounded-Context Direct Import**:
   - `packages/core/src/sales/domain/value-objects/money.vo.ts` imports from `packages/core/src/resources/...`.
   - **Risk**: Coupling Sales to Resources violates DDD independent context boundaries. ADR-0108 Section 8.1 mandates elevating `Money` to a shared kernel (`packages/core/src/shared/kernel/value-objects/money.vo.ts`).

4. **Dead Code / Speculative Order-Level Discount in `Sale`**:
   - `Sale.aggregate.ts` includes `_orderDiscount: Discount | null`, `applyOrderDiscount()`, and `removeOrderDiscount()`.
   - Milestone 7.3 explicitly established that **discounts are item-level only** (`SaleItem.discount`). Order-level discounts are deferred to avoid cross-line apportionment complexity.
   - **Risk**: Leaving speculative order discount logic in `Sale.#recalculateTotals()` creates ambiguity over whether order discounts are active.

---

## 5. Current PostgreSQL & Prisma Representation

- **Database Provider**: PostgreSQL (`provider = "postgresql"` in `prisma/schema.prisma`).
- **Current Monetary Columns**:
  - `inventory_items.purchase_cost_amount`: `Decimal(10, 2)`
  - `inventory_items.selling_price_amount`: `Decimal(10, 2)`
  - `stock_movements.unit_cost_amount`: `Decimal(10, 2)`
  - `fixed_assets.purchase_value_amount`: `Decimal(10, 2)`
  - `fixed_assets.current_estimated_value_amount`: `Decimal(10, 2)`
  - `asset_maintenance_records.cost_amount`: `Decimal(10, 2)`
- **Precision / Scale Decision for Sales**:
  - Resources uses `Decimal(10, 2)` (up to $99,999,999.99).
  - Per **ADR-0108 Section 8.2**, Sales tables must use `Decimal(12, 2)` (up to $9,999,999,999.99) to accommodate cumulative order totals, annual revenue reporting, and high-volume multi-year transactions.
- **Migration Conventions**:
  - SQL migrations live in `prisma/migrations/` with timestamped folders (`YYYYMMDDHHMMSS_name/migration.sql`).
  - No migration is required for Milestone 7.4. Sales persistence models will be created in the dedicated persistence milestone.

---

## 6. Discount Semantics (From Milestone 7.3)

1. **Supported Types**:
   - `PERCENTAGE`: Relative reduction, $0 \le \text{percentage} \le 100$.
   - `FIXED`: Absolute currency reduction, $\text{value} \ge 0.00$ (with `FIXED_AMOUNT` compatibility alias).

2. **Attachment & Scope**:
   - Attached strictly to `SaleItem` (`SaleItem.discount`).
   - Scope is item-level only. No order-level discounts in Phase 7.3 / 7.4.

3. **Eligible Amount & Financial Boundary**:
   - Eligible amount is strictly the item gross subtotal:
     $$\text{eligibleAmount} = \text{SaleItem.subtotal} = \text{unitPrice} \times \text{normalizedQuantity}$$
   - **Strict Rejection Rule**: If $\text{fixedDiscount.value} > \text{eligibleAmount}$, `discount.calculate()` strictly throws `InvalidDiscountException`. It is **NEVER** silently clamped.
   - Total line discount cannot exceed gross subtotal: $\text{lineTotal} \ge \$0.00$.

4. **Calculation Method**:
   - `discount.calculate(eligibleAmount: Money): Money` executes strictly in integer cents using Commercial Half-Up rounding.
   - Percentage formula:
     $$\text{cents} = \text{Math.round}\left(\frac{\text{subtotalCents} \times \text{percentage}}{100}\right)$$

5. **Lifecycle Mutability**:
   - Mutable only in `DRAFT` status via `sale.applyItemDiscount()` and `sale.removeItemDiscount()`.
   - Permanently locked once `Sale` transitions to `PENDING_PAYMENT` or beyond.

---

## 7. Recommended Architecture Decision Proposal

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   DETERMINISTIC FINANCIAL TIERS FOR MILESTONE 7.4                │
│                                                                                  │
│  DOMAIN LAYER                                                                    │
│  - Value Object: Money (Shared Kernel elevation or canonical Sales VO)           │
│  - Storage: _amount (number, 2 decimal places), _currency (string, ISO-4217)     │
│  - Arithmetic: Pure integer-cents arithmetic with Number.EPSILON Half-Up guard   │
│    add(a, b)      = (round(a*100 + eps) + round(b*100 + eps)) / 100             │
│    subtract(a, b) = (round(a*100 + eps) - round(b*100 + eps)) / 100             │
│    multiply(a, q) = round(round(a*100 + eps) * q + eps) / 100                   │
│                                                                                  │
│  CALCULATION OWNERSHIP                                                           │
│  - SaleItem.subtotal      = unitPrice.multiply(quantity)                         │
│  - SaleItem.discountTotal = discount ? discount.calculate(subtotal) : zero       │
│  - SaleItem.total         = subtotal.subtract(discountTotal)                     │
│  - Sale.subtotal          = Σ(item.subtotal)                                     │
│  - Sale.discountTotal     = Σ(item.discountTotal)                                │
│  - Sale.total             = subtotal.subtract(discountTotal)                     │
│                                                                                  │
│  PERSISTENCE LAYER (Deferred to Persistence Milestone)                           │
│  - Column Definition: Decimal(12, 2) on Sale & SaleItem                          │
│  - Mappers: Prisma.Decimal <-> Money conversion with round-trip reconciliation   │
│                                                                                  │
│  API LAYER (Deferred to API Milestone)                                           │
│  - DTO Contract: { amount: 49.99, currency: "USD" }                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Key Decisions

1. **Money Domain Representation**:
   - Retain `Money` as an immutable Value Object storing `amount` as a 2-decimal JavaScript number and `currency` as an ISO-4217 string.
   - Refactor internal arithmetic in `Money` to convert both operands to integer cents with `Number.EPSILON` **before** executing `+` or `-`, completely eliminating float subtraction drift.

2. **Persistence Representation**:
   - PostgreSQL `Decimal(12, 2)` via Prisma `Decimal`.
   - Scale: 2 decimal places. Precision: 12 digits (capacity: $9,999,999,999.99).

3. **API Representation**:
   - Inbound: `@IsNumber() @Min(0)` for amounts, `@IsString() @Length(3, 3)` for currency.
   - Outbound: Structured `{ amount: number, currency: string }` or snapshot values.

4. **Conversion Boundaries**:
   - Domain to Persistence: `new Prisma.Decimal(money.amount)`.
   - Persistence to Domain: `Money.create(raw.amount.toNumber(), raw.currency)`.
   - Domain to External Gateway (e.g. Stripe): `Math.round((money.amount + Number.EPSILON) * 100)`.

5. **Calculation Ownership**:
   - Line items: `SaleItem` owns `subtotal`, `discountTotal`, and `total`.
   - Order totals: `Sale` aggregate root owns `subtotal`, `discountTotal`, and `total`.
   - Controllers and repositories contain zero financial math.

6. **Rounding Ownership**:
   - Commercial Half-Up rounding is exclusively owned by `Money` and `Discount` Value Objects at the 1-cent boundary.

7. **Discount Application Point**:
   - Solely on `SaleItem` (`item.discount`).
   - Order-level discount remains deferred.

8. **Invariants**:
   - $\text{subtotal} \ge \$0.00$
   - $\text{discountTotal} \ge \$0.00$
   - $\text{total} \ge \$0.00$
   - $\text{total} = \text{subtotal} - \text{discountTotal}$
   - Currency homogeneity across all items and order totals.

9. **Required Prisma Changes**:
   - None in Milestone 7.4.

10. **Required Tests**:
    - Cent-guarded arithmetic precision tests (midpoints, epsilon drift).
    - Fractional quantity calculations (e.g. 1.25 kg @ $24.50).
    - Aggregate reconciliation tests for multi-item baskets with mixed discounts.
    - Zero-amount and full 100% discount tests.
    - Currency mismatch rejection tests.
    - Reconstitution reconciliation assertion tests.

---

## 8. Unresolved Decisions

1. **Elevation of `Money` to Shared Kernel vs. Canonical Sales VO**:
   - _Option A_: Move `Money` to `packages/core/src/shared/kernel/value-objects/money.vo.ts` and update Resources, Gym, and Sales imports.
   - _Option B_: Enhance `packages/core/src/sales/domain/value-objects/money.vo.ts` as an autonomous, hardened implementation within the Sales bounded context, leaving Resources untouched until the platform-wide shared kernel migration.
   - _Recommendation_: **Option B** for Milestone 7.4 to respect the constraint "Do not modify unrelated bounded contexts", followed by platform-wide consolidation in the Shared Kernel milestone.

2. **Order-Level Discount Deprecation in `Sale` Aggregate**:
   - _Option A_: Retain `orderDiscount` in `Sale` aggregate with a no-op / warning.
   - _Option B_: Formally remove or disable `orderDiscount` from `CreateSaleProps`, `ReconstituteSaleProps`, and `Sale` aggregate methods so that `discountTotal` strictly equals $\sum \text{SaleItem.discountTotal}$ in Milestone 7.4.
   - _Recommendation_: **Option B** — align `Sale` aggregate directly with Milestone 7.3 acceptance and the target financial model $\text{discountTotal} = \sum \text{valid line discounts}$.

---

## 9. Exact Files Expected to Change in Milestone 7.4 Implementation

When proceeding to the implementation phase of Milestone 7.4:

1. **`packages/core/src/sales/domain/value-objects/money.vo.ts`**:
   - Transition from pass-through re-export to autonomous, cent-guarded Value Object with `Number.EPSILON` precision arithmetic and integer-cent addition/subtraction.
2. **`packages/core/src/sales/domain/sale.aggregate.ts`**:
   - Hardened deterministic reconciliation formulas in `recalculateTotals()` and `reconstitute()`.
   - Clarify / streamline discount aggregation strictly to item discounts.
3. **`packages/core/src/sales/domain/entities/sale-item.entity.ts`**:
   - Verify deterministic `subtotal`, `discountTotal`, and `total` calculation alignment.
4. **`packages/core/src/sales/domain/__tests__/sale-totals-and-money-rules.spec.ts`** (NEW):
   - Comprehensive test suite specifically verifying the Milestone 7.4 test matrix.
5. **Documentation**:
   - `docs/business-rules/sales-payments.md` and `docs/domain/sales-payments.md` (record Milestone 7.4 certifications).
