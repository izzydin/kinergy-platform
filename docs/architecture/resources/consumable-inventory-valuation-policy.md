# Consumable Inventory Valuation Policy

## Metadata

- **Author**: Principal Domain Architect & Senior Backend Engineer
- **Phase**: Phase 6 — Resources Management
- **Milestone**: Milestone 6.8 — Resource Valuation
- **Status**: `AUTHORITATIVE POLICY`
- **Review Date**: August 31, 2026

---

## 1. Business Purpose

The consumable inventory valuation policy provides an authoritative, deterministic, and reproducible calculation of working capital held in consumable goods across all Kinergy facilities and operations.

When the business owner or management team inspects the inventory valuation dashboard to answer:

> _"Why is our consumable inventory worth this exact amount ($X.XX)?"_

the system must provide a mathematically transparent, reproducible calculation rooted in authoritative domain data, without hidden assumptions, floating-point rounding drift, or unstated data exclusions.

---

## 2. Selected Valuation Basis: Operational Standard Acquisition Cost

Kinergy Phase 6 establishes **Option A: Current Stock $\times$ Current Purchase Cost** (Operational Standard Acquisition Cost Basis).

$$\text{Item Valuation} = \text{quantityOnHand} \times \text{purchaseCostAmount}$$

$$\text{Total Inventory Value} = \sum_{i \in \text{EligibleItems}} (\text{quantityOnHand}_i \times \text{purchaseCostAmount}_i)$$

### Rationale:

- **Operational Resource Management Focus**: Phase 6 provides physical resource lifecycle management, stock control, and operational capital monitoring.
- **Single Source of Truth**: Evaluated directly from the authoritative `InventoryItem` aggregate root (`quantityOnHand` and `purchaseCost`).
- **Transparency & Auditability**: Enables instantaneous verification between on-hand physical stock counts and replacement acquisition costs without relying on complex, asynchronous lot-layer accounting tables.

---

## 3. Mandatory Valuation Questions & Architectural Determinations

### 3.1 Which products are included?

All `InventoryItem` aggregates belonging to the querying `tenantId` (with optional category filtering) that satisfy the status inclusion rules.

### 3.2 Are archived products included?

- **Default Operational View (`includeArchived = false`)**: Only active products (`status === 'ACTIVE'`) are included in standard working capital totals.
- **Physical Audit & Comprehensive View (`includeArchived = true`)**: Archived products holding non-zero physical stock (`quantityOnHand > 0`) are included.
- **Invariant**: Archiving a product **does not silently destroy physical value**. If an archived SKU holds physical inventory, its residual value is tracked and exposed via dedicated query filters.

### 3.3 Are inactive products included?

In Kinergy, product deactivation is managed via `status: ARCHIVED`. There is no separate `INACTIVE` state. Status inclusion strictly follows Section 3.2.

### 3.4 Are products with zero stock included?

- **Valuation Contribution**: An item with $\text{quantityOnHand} = 0.00$ contributes exactly $\$0.00$ to the valuation sum ($\text{productValue} = 0.00 \times \text{purchaseCost} = 0.00$).
- **Itemized Reporting**: Zero-stock items are included in itemized catalog lists with `quantityOnHand: 0.00` and `totalValueAmount: 0.00`, but do not inflate distinct stocked item totals.

### 3.5 Can `purchaseCost` be zero?

- **Yes**. Complimentary supplies, promotional kits, or donated samples may have a `purchaseCost` of $\$0.00$.
- Contribution to inventory value: $\text{quantityOnHand} \times 0.00 = \$0.00$.

### 3.6 Can `purchaseCost` be null?

- **No**. `purchaseCost` is a mandatory `Money` Value Object in the domain model and non-null in the database (`purchase_cost_amount Decimal(10, 2) DEFAULT 0.00`).

### 3.7 What is the exact quantity precision?

- **Scale 2 Fixed Precision (`0.01` minimum unit)**.
- Governed by `Quantity` VO and database column `quantity_on_hand Decimal(10, 2)`.
- Supports integer units (`10.00` bottles) and fractional measurements (`2.50` kg, `0.75` liters).

### 3.8 What is the exact monetary precision?

- **Scale 2 Fixed Hundredths (Cents)**.
- Governed by `Money` VO and database column `purchase_cost_amount Decimal(10, 2)`.
- Explicit ISO-4217 3-letter currency code (default `USD`).

### 3.9 How are intermediate calculations handled?

- Intermediate calculations perform **integer-cents arithmetic** at the line-item level:
  $$\text{itemValueCents} = \text{Math.round}(\text{quantityOnHand} \times \text{purchaseCostAmount} \times 100)$$
  $$\text{itemValueAmount} = \frac{\text{itemValueCents}}{100}$$
- Eliminates floating-point accumulation errors across thousands of items.

### 3.10 How is the final aggregate rounded?

- Total cents are accumulated as an integer:
  $$\text{totalCents} = \sum \text{itemValueCents}$$
  $$\text{totalValueAmount} = \frac{\text{totalCents}}{100}$$
- Guaranteed zero decimal drift between the sum of line items and the reported category/total aggregates.

### 3.11 Is current `purchaseCost` the authoritative valuation basis?

- **Yes**. The `purchaseCost` property on `InventoryItem` represents the current standard acquisition cost.

### 3.12 Does historical movement cost affect current valuation?

- **No**. Historical movements (`StockMovement`) capture point-in-time receipt costs (`unitCostAmount`) for transactional audit trails, but do not override the aggregate root's current standard `purchaseCost`.

### 3.13 Does the architecture support FIFO or Weighted Average Costing?

- **No**. Phase 6 does not implement historical FIFO depletion queues or moving-average perpetual ledgers.

### 3.14 Explicit Characterization

- **Phase 6 consumable inventory valuation is an Operational Resource Valuation model**. It reflects standard acquisition replacement working capital for operations, planning, and executive reporting.

---

## 4. Invariants & Business Boundary Guarantees

1. **Non-Negative Invariant `[INV-1]`**:
   - Stock quantities cannot be negative. Valuation arithmetic never encounters negative quantities.
2. **Multi-Tenant Boundary `[SEC-TENANT]`**:
   - Every valuation query enforces mandatory `where: { tenantId }` filtering.
3. **Dual-Permission Gate `[SEC-AUTH]`**:
   - Valuation queries require both `inventory.read` and `billing.read` (per ADR-0095).

---

## 5. Explicit Non-Goals

1. **General Ledger Journalizing**: Phase 6 does not generate double-entry debits/credits or COGS journal vouchers.
2. **Tax / LIFO Accounting**: Phase 6 does not implement tax-specific inventory valuation methods (e.g. LIFO, Lower of Cost or Market adjustments).
3. **Multi-Currency Auto-Conversion**: Aggregations are grouped by native currency; cross-currency FX conversion is out of scope for Milestone 6.8.

---

## 6. Rejected Alternatives

| Alternative                                  | Description                                                                                | Reason for Rejection                                                                                                                                              |
| :------------------------------------------- | :----------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option B: Perpetual Moving Average Cost**  | Recalculate average unit cost upon every purchase receipt.                                 | Adds significant concurrency write contention and state mutation complexity to simple receipt workflows without business requirement.                             |
| **Option C: FIFO Lot-Layer Depletion**       | Track individual purchase batches and deplete oldest batches on sales/consumption.         | Requires dedicated lot-tracking tables, complex partial-lot splits, and historical ledger traversals disproportionate to operational gym/wellness resource needs. |
| **Option D: Retail Selling Price Valuation** | Evaluate inventory at retail selling price ($\text{quantity} \times \text{sellingPrice}$). | Rejected because it overstates inventory value on balance sheets by including unrealized gross profit margins.                                                    |
