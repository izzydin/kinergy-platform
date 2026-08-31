# Resource Valuation Precision & Arithmetic Policy

## Metadata

- **Author**: Senior Backend Engineer & Financial Correctness Specialist
- **Phase**: Phase 6 — Resources Management
- **Milestone**: Milestone 6.8 — Resource Valuation
- **Status**: `AUTHORITATIVE ARITHMETIC & PRECISION SPECIFICATION`
- **Review Date**: August 31, 2026

---

## 1. Executive Summary & Purpose

Financial metrics and physical resource valuations directly drive purchasing decisions, insurance assessments, executive reports, and balance sheet calculations.

A valuation system that permits IEEE 754 floating-point drift, imprecise intermediate rounding, or inconsistent column casting is defective.

This document defines the authoritative persistence precision, mathematical representation, intermediate calculation rules, rounding standards, and serialization contracts across the Kinergy Resources module.

---

## 2. Authoritative Persistence Precision & Schema Grounding

Based on direct inspection of `prisma/schema.prisma`, all monetary and quantity columns in PostgreSQL are mapped with exact fixed-point precision:

| Entity                       | Field Name                    | Database Column Type | Precision (Total Digits) | Scale (Decimal Places) | Range / Constraints                      |
| :--------------------------- | :---------------------------- | :------------------- | :----------------------- | :--------------------- | :--------------------------------------- |
| **`InventoryItem`**          | `quantityOnHand`              | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`InventoryItem`**          | `purchaseCostAmount`          | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`InventoryItem`**          | `sellingPriceAmount`          | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`InventoryItem`**          | `minimumStock`                | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`StockMovement`**          | `quantityDelta`               | `Decimal(10, 2)`     | 10                       | 2                      | `-99,999,999.99` to `+99,999,999.99`     |
| **`StockMovement`**          | `balanceAfter`                | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`StockMovement`**          | `unitCostAmount`              | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`FixedAsset`**             | `purchaseValueAmount`         | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`FixedAsset`**             | `currentEstimatedValueAmount` | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |
| **`AssetMaintenanceRecord`** | `costAmount`                  | `Decimal(10, 2)`     | 10                       | 2                      | `0.00` to `99,999,999.99` (non-negative) |

---

## 3. Domain Value Object Precision Constraints

1. **`Quantity` Value Object (`packages/core/src/resources/domain/inventory/value-objects/quantity.vo.ts`)**:
   - Fixed Scale 2 precision (`0.01` minimum resolution).
   - Invariant: $\text{Quantity} \ge 0.00$ (enforced by constructor validation; `[INV-1]`).
   - Normalization: `this._value = Math.round(value * 100) / 100`.
   - Supports fractional measurements (e.g. `2.50` kg, `0.75` liters, `10.00` discrete units).
2. **`Money` Value Object (`packages/core/src/resources/domain/inventory/value-objects/money.vo.ts`)**:
   - Fixed Scale 2 precision (`0.01` minimum resolution / hundredths / cents).
   - Invariant: $\text{Amount} \ge 0.00$, Currency = 3-letter ISO-4217 string (e.g. `USD`).
   - Normalization: `this._amount = Math.round(amount * 100) / 100`.

---

## 4. Intermediate Calculations & Arithmetic Safety

### 4.1 The Floating-Point Drift Hazard

In standard JavaScript floating-point arithmetic (IEEE 754):
$$0.1 + 0.2 = 0.30000000000000004$$
$$19.99 \times 3 = 59.970000000000006$$
Summing thousands of float products introduces cumulative rounding errors, resulting in off-by-a-penny discrepancies between line items and summary totals.

### 4.2 Standard Integer-Cents Calculation Rule

To guarantee 100% mathematical reproducibility across application and database layers, all line-item valuations and summations must execute **integer-cents arithmetic**:

1. **Line-Item Product Valuation**:
   $$\text{itemValueCents} = \text{Math.round}(\text{quantityOnHand} \times \text{purchaseCostAmount} \times 100)$$
   $$\text{itemValueAmount} = \frac{\text{itemValueCents}}{100}$$
2. **Category / Tenant Accumulation**:
   $$\text{totalCents} = \sum \text{itemValueCents}$$
   $$\text{totalValueAmount} = \frac{\text{totalCents}}{100}$$
3. **Database Aggregation SQL Equivalent**:
   ```sql
   SELECT
     SUM(ROUND(quantity_on_hand * purchase_cost_amount, 2)) AS total_value_amount,
     SUM(quantity_on_hand) AS total_quantity_units,
     COUNT(id) AS total_item_count
   FROM inventory_items
   WHERE tenant_id = :tenantId AND status = 'ACTIVE';
   ```

---

## 5. Null, Zero, and Edge-Case Handling

| Scenario                      | Input Condition                   | Deterministic Behavior                                  | Resulting Valuation                                                        |
| :---------------------------- | :-------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------- |
| **Zero Stock**                | `quantityOnHand = 0.00`           | $0.00 \times \text{cost}$                               | Exactly `$0.00`. Reported in line-items, does not inflate financial total. |
| **Zero Purchase Cost**        | `purchaseCost = 0.00`             | $\text{quantity} \times 0.00$                           | Exactly `$0.00` (e.g. promotional supplies).                               |
| **Zero Asset Book Value**     | `currentEstimatedValue = 0.00`    | Additive sum                                            | Exactly `$0.00` (fully depreciated/scrapped asset).                        |
| **Nullable Database Columns** | `purchase_cost_amount`            | Schema enforces `NOT NULL DEFAULT 0.00`.                | Coercion not needed; guaranteed non-null by Prisma schema.                 |
| **Fractional Quantities**     | `quantity = 1.33`, `cost = 10.00` | $\text{Math.round}(1.33 \times 10.00 \times 100) / 100$ | Exactly `$13.30`.                                                          |

---

## 6. Serialization & DTO Formatting

1. **JSON Payload Format**:
   - Monetary amounts are serialized as standard JSON numbers with 2 decimal places:
     ```json
     {
       "totalValueAmount": 45250.75,
       "currency": "USD",
       "totalQuantityUnits": 1250.5,
       "calculatedAt": "2026-08-31T12:00:00.000Z"
     }
     ```
2. **Currency Association**:
   - Every monetary field is paired with an ISO-4217 currency identifier.
   - Cross-currency summation without explicit grouping is prohibited.

---

## 7. Precision Test Verification Matrix

The test suite must explicitly validate the following numerical edge cases:

| Test ID    | Test Scenario                            | Inputs                                                             | Expected Line Values                | Expected Aggregate              |
| :--------- | :--------------------------------------- | :----------------------------------------------------------------- | :---------------------------------- | :------------------------------ |
| **PRC-01** | Integer Quantity $\times$ 2-Decimal Cost | Qty: `10.00`, Cost: `$12.50`                                       | Line: `$125.00`                     | Total: `$125.00`                |
| **PRC-02** | Fractional Quantity $\times$ Odd Cost    | Qty: `2.50`, Cost: `$10.99`                                        | Line: `$27.48` ($27.475 \to 27.48$) | Total: `$27.48`                 |
| **PRC-03** | Multiple Odd Fractional Products         | Item A: `3.33` $\times$ `$1.99`<br>Item B: `1.77` $\times$ `$4.55` | Line A: `$6.63`<br>Line B: `$8.05`  | Total: `$14.68` ($6.63 + 8.05$) |
| **PRC-04** | Small Value Threshold                    | Qty: `0.01`, Cost: `$0.01`                                         | Line: `$0.00` ($0.0001 \to 0.00$)   | Total: `$0.00`                  |
| **PRC-05** | Large Upper Boundary                     | Qty: `10,000.00`, Cost: `$9,999.99`                                | Line: `$99,999,900.00`              | Total: `$99,999,900.00`         |
| **PRC-06** | Zero Quantity Multiplier                 | Qty: `0.00`, Cost: `$500.00`                                       | Line: `$0.00`                       | Total: `$0.00`                  |
| **PRC-07** | Zero Cost Multiplier                     | Qty: `500.00`, Cost: `$0.00`                                       | Line: `$0.00`                       | Total: `$0.00`                  |
| **PRC-08** | Sum vs Line-Item Consistency             | 100 items of `1.33` $\times$ `$1.33` ($=\$1.77$ each)              | 100 $\times$ `$1.77`                | Total: `$177.00` (Exact match)  |
