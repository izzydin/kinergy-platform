# ADR-0089: Inventory Monetary, Quantity, and Unit of Measure Precision Semantics

- **Status**: Accepted
- **Deciders**: Principal Domain Engineer, Principal Financial Architect, Lead Backend Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6.1 — Consumable Inventory Domain Model & Business Rules

---

## Context and Problem Statement

The Consumable Inventory sub-domain handles commercially and clinically critical numbers:

1. **Acquisition & Valuation Costs** (`purchaseCost`): Unit cost paid to suppliers per unit of measure.
2. **Commercial Pricing** (`sellingPrice`): Retail price charged to clients and patients at checkout.
3. **Safety & Reorder Thresholds** (`minimumStock`): Alert threshold below which replenishment triggers.
4. **Authoritative Balances** (`quantityOnHand` / `currentStock`): Real-time physical inventory available.
5. **Stock Mutation Deltas** (`StockMovement.quantityDelta`): Immutable physical additions and deductions.
6. **Units of Measurement** (`UnitOfMeasure`): The physical metrics governing discrete and continuous stock.

Using IEEE-754 floating-point arithmetic (`number`) for financial storage or arbitrary unconstrained precision for physical quantities risks precision loss, rounding drift, non-deterministic ledger sums, and impossible negative balance states.

We must formalize the precision, scale, rounding, validation, and serialization semantics for all monetary, quantity, and unit attributes across the domain and persistence layers.

---

## Decision Drivers

- **Zero Floating-Point Financial Drift**: Money calculations (asset valuation, COGS, retail margins) must be mathematically exact without binary floating-point rounding artifacts (e.g., `0.1 + 0.2 === 0.30000000000000004`).
- **Discrete & Continuous Stock Support**: The domain must seamlessly support discrete counts (meals, drinks, boxes, bottles) and fractional continuous supplies (liters/milliliters of sanitizers/ultrasound gel, grams of nutritional supplements) without introducing unbounded arbitrary precision.
- **Strict Non-Negative Invariant Enforcement**: Physical stock balances and financial costs must never drop below zero ($QOH \ge 0$, $\text{Money} \ge 0.00$).
- **Kinergy Architectural Consistency**: Alignment with existing monetary patterns in `Gym` (`PlanPrice`, `Decimal(10, 2)`) and database conventions in `prisma/schema.prisma`.
- **Single Operational Currency Baseline**: Kinergy facilities currently operate with USD standard baseline, while structuring `Money` to capture standard ISO-4217 3-letter currency codes for multi-tenant extensibility without building premature exchange-rate conversion engines.

---

## Decision Outcome

We establish explicit **Fixed-Point Decimal (Scale 2)** semantics for all monetary and quantity domain attributes, backed by immutable Value Objects (`Money`, `Quantity`) and code-defined `UnitOfMeasure` taxonomy.

### 1. Monetary Semantics (`purchaseCost`, `sellingPrice`, `unitCost`)

| Dimension               | Specification                            | Implementation Rule                                                                                                        |
| :---------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Data Representation** | `Money` Value Object                     | Wraps `amount: number` (fixed 2 decimals) and `currency: string`.                                                          |
| **Precision & Scale**   | Fixed Scale 2 (`DECIMAL(10, 2)`)         | Represents currency in cents/hundredths (e.g., `$12.50`).                                                                  |
| **Currency Code**       | ISO-4217 3-Letter Uppercase              | Validates `/^[A-Z]{3}$/` (e.g., `USD`, `CAD`, `EUR`). Default: `USD`.                                                      |
| **Zero Behavior**       | Non-negative ($\ge 0.00$)                | `sellingPrice = 0.00` permitted for internal clinical supplies. `purchaseCost = 0.00` permitted for donated/bundled items. |
| **Negative Behavior**   | Strictly prohibited ($< 0.00$)           | Negative monetary amounts throw `InvalidMoneyException`.                                                                   |
| **Rounding Policy**     | Half-Up Rounding to Cents                | Normalizes arithmetic via `Math.round(amount * 100) / 100`.                                                                |
| **Database Storage**    | `Decimal(10, 2)` / `DECIMAL`             | Stored as `purchase_cost_amount DECIMAL(10, 2)` and `purchase_cost_currency VARCHAR(3)`.                                   |
| **Serialization**       | JSON `{ amount: 12.5, currency: "USD" }` | `toString()` formats as `"12.50 USD"`.                                                                                     |

### 2. Quantity Semantics (`quantityOnHand`, `minimumStock`, `quantityDelta`)

| Dimension                     | Specification                    | Implementation Rule                                                                                                                                                              |
| :---------------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Representation**       | `Quantity` Value Object          | Wraps normalized finite `number` (fixed 2 decimals).                                                                                                                             |
| **Precision & Scale**         | Fixed Scale 2 (`DECIMAL(10, 2)`) | Exactly 2 decimal places (hundredths). Minimum discrete delta is `0.01`.                                                                                                         |
| **Discrete Items**            | Whole numbers with `.00`         | E.g., `10.00` units of healthy meals, `24.00` bottles of electrolyte drinks.                                                                                                     |
| **Continuous Items**          | Fractional decimals              | E.g., `2.50` bottles of sanitizer, `500.00` milliliters of gel, `25.50` grams of powder.                                                                                         |
| **Zero Behavior**             | Non-negative ($\ge 0.00$)        | `minimumStock >= 0.00` (0 means no safety alert threshold). `quantityOnHand >= 0.00` (0 means stock depleted).                                                                   |
| **Mutation Delta Positivity** | Strictly positive ($> 0.00$)     | Mutation inputs (`receiveStock`, `consumeStock`, `sellStock`) must be $> 0.00$. Zero or negative delta inputs throw `InvalidInventoryItemStateException`.                        |
| **Signed Movement Deltas**    | Signed $+ / -$                   | Inbound movements (`PURCHASE`, `ADJUSTMENT_IN`) have $+\Delta$; outbound (`SALE`, `CONSUMPTION`, `ADJUSTMENT_OUT`, `SCRAP`) have $-\Delta$; `CORRECTION` has signed $\pm\Delta$. |
| **Negative Balances**         | Strictly prohibited ($< 0.00$)   | Overdrafts throw `InsufficientStockException`. Database has `CHECK (quantity_on_hand >= 0)`.                                                                                     |
| **Rounding Policy**           | Half-Up Rounding to Hundredths   | Normalizes arithmetic via `Math.round(value * 100) / 100`.                                                                                                                       |
| **Database Storage**          | `Decimal(10, 2)` / `DECIMAL`     | Stored in PostgreSQL as `DECIMAL(10, 2)` preventing floating-point drift.                                                                                                        |

### 3. Unit of Measure Semantics (`unit`)

| Unit Code     | Display Name     | Classification     | Standard Business Meaning                 | Concrete Usage Example                         |
| :------------ | :--------------- | :----------------- | :---------------------------------------- | :--------------------------------------------- |
| `UNITS`       | Units (each)     | Discrete count     | Individual physical item or meal portion. | `1.00` container of grilled salmon prep.       |
| `BOXES`       | Boxes            | Discrete package   | Packaged multi-item container or carton.  | `5.00` boxes of sterile acupuncture needles.   |
| `BOTTLES`     | Bottles          | Discrete container | Individual drink or lotion bottle.        | `12.00` bottles of recovery electrolyte juice. |
| `ROLLS`       | Rolls            | Discrete roll      | Continuous rolled physical material.      | `10.00` rolls of elastic kinesiology tape.     |
| `MILLILITERS` | Milliliters (ml) | Continuous volume  | Volumetric liquid/gel measurement.        | `250.00` ml of diagnostic ultrasound gel.      |
| `GRAMS`       | Grams (g)        | Continuous mass    | Weight measurement for powders.           | `50.00` grams of whey isolate supplement.      |

- **Taxonomy Strategy**: Code-defined domain enum `UnitOfMeasure` backed by `UNIT_OF_MEASURE_REGISTRY` metadata and native PostgreSQL enum `UnitOfMeasure`, consistent with `InventoryCategory` ([ADR-0088](./0088-inventory-category-classification-strategy.md)).

---

## Concrete Operational Examples

1. **Purchasing Discrete Retail Drinks**:
   - `quantity = 48.00`, `unit = UnitOfMeasure.BOTTLES`
   - `purchaseCost = Money.create(1.75, "USD")` ($1.75 / bottle)
   - `sellingPrice = Money.create(3.50, "USD")` ($3.50 / bottle)
   - Total Batch Cost $= 48.00 \times \$1.75 = \$84.00\text{ USD}$.
2. **Clinical Ultrasound Gel Consumption**:
   - Initial stock: `quantityOnHand = 5.00`, `unit = UnitOfMeasure.BOTTLES`
   - Therapist consumes fractional bottle: `quantity = 0.25`
   - Resulting balance: `balanceAfter = 4.75`, `quantityDelta = -0.25`
   - Ledger record: `StockMovement` with type `CONSUMPTION`, reason `"Knee ultrasound therapy Session #88"`.
3. **Zero-Priced Clinical Consumable**:
   - Disinfectant Wipes: `purchaseCost = Money.create(8.20, "USD")`, `sellingPrice = Money.zero("USD")`
   - Item is marked clinical-only; retail checkout blocked by domain validation.

---

## Consequences

### Positive

- **Deterministic Math**: Total stock valuation ($\sum QOH \times \text{purchaseCost}$) and ledger reconstruction ($\sum \Delta$) are 100% consistent and verifiable.
- **Safety**: Floating-point NaN/Infinity/precision truncation bugs are completely prevented.
- **Audit Compliance**: Financial auditors and tax reporting receive exact 2-decimal currency amounts.

### Negative / Trade-Offs

- High-precision laboratory scales requiring 3 or 4 decimal places (e.g., $0.0001\text{ mg}$) are not supported; 2 decimal places is the fixed platform standard, which is optimal for wellness and clinical sports therapy.
