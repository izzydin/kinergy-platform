# Monetary Persistence Hardening Specification

- **Status**: Certified Architecture Specification
- **Milestone**: Phase 7 Financial Hardening (Milestones 7.4 & 7.10)
- **Role**: Senior Financial Database Engineer / Principal Database Architect
- **Date**: 2026-10-01
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Relational Integrity Model](../adr/0122-phase-7-financial-persistence-architecture.md)

---

## 1. Executive Summary

This specification establishes the authoritative persistence architecture and precision guarantees for all financial data in Phase 7 (Sales, Payments, and Receipts).

The architecture preserves absolute financial determinism, guarantees zero binary floating-point drift across calculations and storage, and enforces relational integrity at the PostgreSQL database engine layer without compromising Clean Architecture domain isolation.

---

## 2. Authoritative Financial Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DETERMINISTIC FINANCIAL TIERS                        │
│                                                                        │
│  DOMAIN LAYER: Pure Money Value Object                                 │
│  - Storage: _cents: number (Guaranteed Safe Integer: Math.abs <= 9e15) │
│  - Currency: Normalized ISO-4217 uppercase 3-letter code (e.g. "USD")  │
│  - Rounding Mode: Commercial Half-Up at cent boundary (Number.EPSILON) │
│  - Arithmetic: add, subtract, multiply executed strictly in cents       │
│                                                                        │
│  PERSISTENCE LAYER: PostgreSQL & Prisma ORM                            │
│  - Column Type: PostgreSQL NUMERIC / DECIMAL(12, 2)                    │
│  - Representation: Prisma.Decimal (decimal.js instance)                │
│  - Capacity: Up to $9,999,999,999.99 (10 billion minus 1 cent)         │
│  - Database Invariants: CHECK constraints (non-negative / positive)    │
│                                                                        │
│  MAPPER LAYER (Infrastructure Boundary):                               │
│  - To Decimal: minor cents -> string "whole.frac" -> Prisma.Decimal    │
│  - To Money:   decimal.toFixed(2) -> exact string -> Money.create()    │
│  - Strict Prohibition: NO .toNumber(), NO Number(), NO parseFloat()    │
│                                                                        │
│  API TRANSPORT & AUDIT LAYER:                                          │
│  - Flat read projections: subtotalAmount, discountTotalAmount, total   │
│  - Structured payloads: { amount: 49.99, currency: "USD", cents: 4999 }│
│  - Receipt Snapshots: Frozen JSON preserving both formatted and cents  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Currency Model

- **Standard**: Normalized uppercase 3-letter ISO-4217 code (e.g. `"USD"`, `"CAD"`, `"EUR"`).
- **Tenant Scope**: Mono-currency per tenant (`tenantId`). All items, discounts, and payments within a single sale must share the sale's functional currency.
- **Relational Column**: `VARCHAR(3) NOT NULL DEFAULT 'USD'`.

### 2.2 Decimal Precision & Scale

- **Primary Monetary Columns**: `DECIMAL(12, 2)`.
  - 12 total digits of precision, 2 scale digits (cents / minor units: $0.01).
  - Valid range: `0.00` to `9,999,999,999.99`.
- **Item Quantity**: `DECIMAL(10, 3)`.
  - Up to 3 decimal places ($0.001$) to support fractional bulk consumables (e.g. 1.250 kg protein powder, 0.750 hr therapy).
- **Discount Value**: `DECIMAL(10, 2)`.
  - Fixed monetary discounts (up to $99,999,999.99) or percentage discounts ($0.00\%$ to $100.00\%$).

### 2.3 Rounding Strategy

- **Rounding Algorithm**: Commercial Half-Up (`Math.round(x + Number.EPSILON)`).
- **Application Boundary**: Exclusively at the cent ($0.01$) boundary.
- **Timing of Rounding**:
  - Line items round immediately upon calculation into integer minor units (cents).
  - Order aggregations sum these already-rounded integer cents:
    $$\text{Sale.subtotal} = \sum \text{SaleItem.subtotal}$$
    $$\text{Sale.discountTotal} = \sum \text{SaleItem.discountTotal}$$
    $$\text{Sale.total} = \text{Sale.subtotal} - \text{Sale.discountTotal}$$
  - Zero cumulative rounding drift: Because line subtotals and discounts are already rounded to exact integer cents, summation yields bit-for-bit identical penny reconciliation.

### 2.4 Persistence vs Domain Representation Choice: Decimal vs Integer Minor Units

- **Relational Persistence**: **Fixed-point `DECIMAL(12, 2)`** is authoritative.
  - _Why not integer minor units in PostgreSQL?_ As established in ADR-0108 (§5.2) and ADR-0114 (§3.2), persisting raw integer cents in database columns breaks standard SQL reporting tools (Metabase, Tableau, accounting exports) which expect standard monetary decimal values (`$49.99`, not `4999`). It also introduces high developer cognitive hazard across application and reporting queries (risk of billing $1050.00 instead of $10.50).
  - _Why not PostgreSQL Floating-Point (`FLOAT`, `DOUBLE PRECISION`)?_ Binary floating-point introduces non-deterministic representation errors (`0.1 + 0.2 != 0.3`) and is strictly forbidden for financial records.
- **Domain Kernel**: Pure `Money` Value Object storing normalized major units while executing all arithmetic internally in integer minor units (`_cents: number`).

---

## 3. Evaluation of Every Phase 7 Financial Field

| Aggregate / Entity    | Field Name                          | Relational Column                     | Database Type             | Established Decision | Rationale                                                                    |
| :-------------------- | :---------------------------------- | :------------------------------------ | :------------------------ | :------------------- | :--------------------------------------------------------------------------- |
| **Sale**              | `subtotal`                          | `subtotal_amount`                     | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Sum of line subtotals. Standard fixed-point decimal up to $9.99B.            |
| **Sale**              | `discountTotal`                     | `discount_total_amount`               | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Sum of line discounts plus order discount. Fixed-point non-negative decimal. |
| **Sale**              | `total`                             | `total_amount`                        | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Net payable order amount ($\text{subtotal} - \text{discountTotal}$).         |
| **Sale**              | `orderDiscount.value`               | `order_discount_value`                | `DECIMAL(10, 2) NULL`     | **Decimal**          | Monetary amount (fixed) or percentage value (0-100%).                        |
| **SaleItem**          | `unitPrice`                         | `unit_price_amount`                   | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Base catalog unit selling price.                                             |
| **SaleItem**          | `subtotal`                          | `subtotal_amount`                     | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Line gross total ($\text{quantity} \times \text{unitPrice}$).                |
| **SaleItem**          | `discountTotal`                     | `discount_total_amount`               | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Line item discount reduction amount in currency.                             |
| **SaleItem**          | `total`                             | `total_amount`                        | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Line net total ($\text{subtotal} - \text{discountTotal}$).                   |
| **SaleItem**          | `discount.value`                    | `discount_value`                      | `DECIMAL(10, 2) NULL`     | **Decimal**          | Line discount parameter (fixed monetary amount or percentage).               |
| **Payment**           | `amount`                            | `amount`                              | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Tendered transaction amount. Strictly positive ($> 0.00$).                   |
| **Receipt**           | `subtotal`                          | `subtotal_amount`                     | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Frozen historical subtotal snapshot for legal proof of purchase.             |
| **Receipt**           | `discountTotal`                     | `discount_total_amount`               | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Frozen historical discount total snapshot.                                   |
| **Receipt**           | `total`                             | `total_amount`                        | `DECIMAL(12, 2) NOT NULL` | **Decimal**          | Frozen historical total snapshot.                                            |
| **Receipt Snapshots** | `itemsSnapshot`, `paymentsSnapshot` | `items_snapshot`, `payments_snapshot` | `JSONB NOT NULL`          | **Structured JSON**  | Preserves both 2-decimal formatted `amount` and integer minor units `cents`. |

---

## 4. PostgreSQL Relational Engine Check Constraints

Database structural invariants are reinforced via explicit PostgreSQL `CHECK` constraints added in migration `20261001000000_add_phase_7_monetary_check_constraints`:

```sql
-- Sales Table Constraints
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_total" CHECK ("total_amount" >= 0.00);
ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_non_negative_order_discount_val" CHECK ("order_discount_value" IS NULL OR "order_discount_value" >= 0.00);

-- Sale Items Table Constraints
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_unit_price" CHECK ("unit_price_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_total" CHECK ("total_amount" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_non_negative_discount_val" CHECK ("discount_value" IS NULL OR "discount_value" >= 0.00);
ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_positive_quantity" CHECK ("quantity" > 0.000);

-- Payments Table Constraints
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_positive_amount" CHECK ("amount" > 0.00);

-- Receipts Table Constraints
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_subtotal" CHECK ("subtotal_amount" >= 0.00);
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_discount_total" CHECK ("discount_total_amount" >= 0.00);
ALTER TABLE "receipts" ADD CONSTRAINT "chk_receipts_non_negative_total" CHECK ("total_amount" >= 0.00);
```

---

## 5. Hexagonal Serialization & Floating-Point Prohibition

To prevent subtle JavaScript binary floating-point leakage during persistence operations:

1. **`PrismaMoneyMapper.toDecimal(money: Money): Prisma.Decimal`**:
   - Converts internal cents to exact string representation without division:
     ```typescript
     const sign = money.cents < 0 ? '-' : '';
     const absCents = Math.abs(money.cents);
     const whole = Math.floor(absCents / 100);
     const frac = String(absCents % 100).padStart(2, '0');
     const decimalString = `${sign}${whole}.${frac}`;
     return new Prisma.Decimal(decimalString);
     ```
2. **`PrismaMoneyMapper.toMoney(decimal: Prisma.Decimal, currency: string): Money`**:
   - Extracts exact 2-decimal string via `decimal.toFixed(2)`.
   - Passes exact string directly to `Money.create(exactString, currency)` which parses whole and fractional digits via integer parsing (`parseInt`).
3. **Prohibition Verification**:
   - Automated tests spy on `Prisma.Decimal.prototype.toNumber` to guarantee it is **never called** during persistence mapping, saving, or reconstitution.

---

## 6. Verification and Test Proofs

The persistence hardening suite is codified in [`prisma-monetary-persistence-hardening.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/prisma-monetary-persistence-hardening.spec.ts):

| Test Suite Section                          | Verified Behaviors                                                                                                                                            |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Authoritative Persistence Types**      | Verifies all monetary fields in `Sale`, `SaleItem`, `Payment`, and `Receipt` persist strictly as `Prisma.Decimal` instances.                                  |
| **2. Exact Decimal Retrieval & Round-Trip** | Proves bit-for-bit round-trip equality for commercial numbers (`$49.99`, `$19.99`), exact cent boundary (`$0.01`), and trailing zeroes (`$10.00`, `$25.50`).  |
| **3. Rounding Consistency & Midpoint**      | Validates Commercial Half-Up rounding at $0.005$ midpoint ($0.005 \to 0.01$, $0.004 \to 0.00$), fractional quantities, and `Number.EPSILON` drift protection. |
| **4. Large Valid Values & Scale**           | Tests maximum column capacity ($9,999,999,999.99) and large corporate sales ($50,000,000.00), verifying cents remain within `Number.MAX_SAFE_INTEGER`.        |
| **5. Zero and Boundary Values**             | Confirms $0.00 zero-total sales (100% discount), $0.00 unit prices (promotional gifts), and $0.01 minimal payments.                                           |
| **6. Database Constraints**                 | Simulates PostgreSQL `CHECK` constraint violations for negative amounts and verifies domain/mapper defense.                                                   |
| **7. Floating-Point Prohibition**           | Spies on `Prisma.Decimal.prototype.toNumber` to verify zero calls during mapping and reconstitution.                                                          |
| **8. Receipt Audit Snapshots**              | Validates that JSON snapshots preserve exact formatted amounts and integer cents.                                                                             |
