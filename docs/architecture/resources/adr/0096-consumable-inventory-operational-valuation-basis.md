# ADR-0096: Consumable Inventory Operational Valuation Basis

## Status

`ACCEPTED`

## Date

2026-08-31

## Context

In Phase 6 (Resources Management), Milestone 6.8 introduces business resource valuation capabilities. Consumable inventory items hold physical stock that represents operational working capital for wellness, fitness, therapy, and cafe services.

Management dashboards require a reliable, transparent, and reproducible calculation of inventory monetary value to support purchasing budgets, operational reporting, and business planning.

Multiple accounting and valuation strategies exist:

1. **Operational Standard Acquisition Cost Basis**: $\text{quantityOnHand} \times \text{purchaseCostAmount}$ derived directly from current aggregate state.
2. **Moving Weighted Average Cost**: Dynamic recalculation of average unit cost across receipts.
3. **FIFO Lot Layering**: Historical queue tracking and depletion of specific purchase batches.
4. **Retail Selling Price Valuation**: Valuation based on customer POS sales price.

## Decision

We adopt **Option 1: Operational Standard Acquisition Cost Basis** ($\text{quantityOnHand} \times \text{purchaseCostAmount}$) as the authoritative valuation model for consumable inventory.

### Key Rules:

1. **Authoritative State**: `InventoryItem.quantityOnHand` and `InventoryItem.purchaseCost` on the aggregate root are the single source of truth.
2. **Integer Cents Precision**: Arithmetic operations must perform integer-cents rounding at the line-item level ($\text{Math.round}(\text{quantity} \times \text{unitCost} \times 100)$) before summing into category and tenant aggregates to eliminate floating-point drift.
3. **Lifecycle Inclusion**: Active items (`status === 'ACTIVE'`) are included by default. Archived items with stock are excluded from standard working capital but can be audited via explicit query parameters (`includeArchived: true`).
4. **Zero & Non-Negative Quantities**: Zero-stock items contribute $\$0.00$. Invariant `[INV-1]` guarantees stock cannot be negative.
5. **Separation from General Accounting**: This model is explicitly defined as an _Operational Resource Valuation_ model, not a general ledger double-entry engine.

## Consequences

### Positive

- **Deterministic & Fast**: Calculations execute as high-performance SQL aggregations or pure query handlers without traversing historical movement trees.
- **Audit Transparency**: The owner or developer can directly verify any line-item valuation by multiplying the visible on-hand stock by current unit purchase cost.
- **Zero Drift**: Exact integer-cents arithmetic guarantees mathematical consistency across line items, category breakdowns, and grand totals.

### Negative / Trade-offs

- Does not reflect historical price variations across multiple purchase shipments of the same SKU over time (which would require lot-layer FIFO tracking).

## Compliance

- Aligns with [ADR-0095](0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md) response-shaping and dual-permission RBAC (`inventory.read` + `billing.read`).
- Implemented in `GetInventoryValuationHandler` (`packages/core/src/resources/application/handlers/get-inventory-valuation.handler.ts`).
