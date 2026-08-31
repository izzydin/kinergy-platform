# Combined Resource Valuation Architecture

## Metadata

- **Author**: Principal Software Architect & Cross-Domain Reporting Lead
- **Phase**: Phase 6 — Resources Management
- **Milestone**: Milestone 6.8 — Resource Valuation
- **Status**: `AUTHORITATIVE ARCHITECTURE SPECIFICATION`
- **Review Date**: August 31, 2026

---

## 1. Cross-Domain Boundary Principles

In the Kinergy platform, **Consumable Inventory** and **Fixed Assets** represent two fundamentally distinct domain submodules with disparate lifecycles, invariants, and persistence schemas:

- **Consumable Inventory**: High-turnover, variable-quantity SKUs, stock ledger movements, retail POS pricing, and standard unit replacement costs.
- **Fixed Assets**: Discrete high-value capital equipment, serial tags, physical room assignments, qualitative condition ratings, and balance-sheet carrying values.

### The No-Domain-Merger Invariant

These two domains **must remain strictly separated**. They must not be collapsed into a generic "Resource" aggregate root or merged into a single relational table.

Cross-domain valuation is a **read-side reporting orchestration concern** handled at the application query layer, leaving domain boundaries pristine.

---

## 2. Conceptual Valuation Formula & Authoritative Inputs

The combined resource value is a **purely derived, on-demand calculation**:

$$\text{Combined Resource Value} = \text{Consumable Inventory Value} + \text{Fixed Asset Carrying Value}$$

$$\text{Combined CAPEX Investment} = \text{Consumable Inventory Value} + \text{Fixed Asset Acquisition CAPEX}$$

$$\text{Inventory Share \%} = \frac{\text{Consumable Inventory Value}}{\text{Combined Resource Value}} \times 100$$

$$\text{Fixed Asset Share \%} = \frac{\text{Fixed Asset Carrying Value}}{\text{Combined Resource Value}} \times 100$$

### Authoritative Domain Inputs:

1. **Consumable Inventory Working Capital**: Sourced from `InventoryItem` records (`quantityOnHand * purchaseCostAmount`) for active items (per [Consumable Inventory Valuation Policy](consumable-inventory-valuation-policy.md)).
2. **Fixed Asset Carrying Value**: Sourced from `FixedAsset` records (`currentEstimatedValueAmount`) for active, under-maintenance, and damaged assets (per [Fixed Asset Valuation Policy](fixed-asset-valuation-policy.md)).

---

## 3. Composition Location & Query Architecture

The composition is orchestrated at the **Application Query Layer** via a dedicated query handler: `GetResourceValuationSummaryHandler`.

```
                  ┌────────────────────────────────────────┐
                  │        Management Dashboard / API       │
                  │  GET /api/v1/resources/valuation/summary │
                  └───────────────────┬────────────────────┘
                                      │
                         [AuthenticationGuard]
                         [AuthorizationGuard]
                (inventory.read + assets.read + billing.read)
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │  GetResourceValuationSummaryHandler    │
                  └───────────┬────────────────┬───────────┘
                              │                │
           (Parallel Execution)                (Parallel Execution)
                              │                │
                              ▼                ▼
        ┌───────────────────────────┐    ┌───────────────────────────┐
        │  Inventory Query Engine   │    │    Asset Query Engine     │
        │ (InventoryItemRepository) │    │(FixedAssetRepositoryInter)│
        └─────────────┬─────────────┘    └─────────────┬─────────────┘
                      │                                │
                      ▼                                ▼
            [inventory_items]                    [fixed_assets]
```

### Execution Flow:

1. Handler receives `GetResourceValuationSummaryQuery({ tenantId, includeArchived, includeDecommissioned })`.
2. Concurrently fetches:
   - Inventory Valuation Summary (total value, SKU count, total units, category breakdown).
   - Fixed Asset Valuation Summary (total carrying value, total purchase value, asset count, category breakdown, condition breakdown).
3. Executes exact integer-cents summation:
   $$\text{totalCombinedCents} = \text{inventoryCents} + \text{fixedAssetCents}$$
   $$\text{totalCombinedValueAmount} = \frac{\text{totalCombinedCents}}{100}$$
4. Computes portfolio distribution ratios (Inventory Share %, Fixed Asset Share %).
5. Returns an immutable, strongly-typed `ResourceValuationSummaryDTO`.

---

## 4. Consistency Model: Operational Snapshot

Kinergy adopts **Option A: Best-Effort Operational Snapshot from Authoritative Aggregates**.

### Rationale:

- **Management Reporting Semantics**: Executive dashboard totals represent an operational balance sheet snapshot at a specific point in time (`calculatedAt` UTC timestamp).
- **Zero Lock Contention**: Eliminates expensive cross-table `SERIALIZABLE` isolation transactions that would lock physical inventory mutations and POS checkouts during long-running dashboard queries.
- **Microsecond Variance Tolerance**: In the rare event that a stock receipt or asset status change occurs between parallel query sub-executions, each domain remains internally consistent, and the snapshot reflects real-time business health within normal operational tolerances.

---

## 5. No-Duplication Rule & Caching Policy

### 5.1 The No-Duplication Invariant

- **Strictly Prohibited**: Storing denormalized total columns (such as `Business.totalResourcesValue`, `Tenant.inventoryValue`, or `Facility.assetValue`) in transactional database tables.
- **Why**: Stored aggregate columns in relational tables inevitably drift out of sync due to concurrent writes, partial rollbacks, or batch operations, creating catastrophic data inconsistencies across reports.

### 5.2 Dynamic Calculation vs. Cache Strategy

- **Baseline**: All totals are computed **dynamically on-demand** from authoritative tables.
- **Dashboard Caching (Optional / Future)**: Short-lived HTTP `ETag` / `Cache-Control` (e.g. 60 seconds) or in-memory Redis read-through caching keyed by `tenantId` may be introduced if query traffic demands it, with explicit invalidation upon resource domain events (`StockMovementRecordedEvent`, `FixedAssetCommissionedEvent`, `FixedAssetValuationUpdatedEvent`).

---

## 6. Precision & Monetary Safety

1. **Integer-Cents Summation**:
   - Both sub-queries return values normalized to integer cents.
   - The combined summation adds integers before converting to decimal representation:
     ```typescript
     const inventoryCents = Math.round(inventorySummary.totalValueAmount * 100);
     const assetCents = Math.round(assetSummary.totalCarryingValueAmount * 100);
     const combinedCents = inventoryCents + assetCents;
     const totalCombinedValueAmount = combinedCents / 100;
     ```
2. **Currency Consistency**:
   - Validates that both domain summaries share the same base currency (default `USD`).
   - If mixed currencies exist, totals are partitioned by ISO-4217 currency code.

---

## 7. Performance & Database Optimization

1. **Selective Indexed Queries**:
   - Queries leverage composite database indexes:
     - `inventory_items(tenant_id, status)`
     - `fixed_assets(tenant_id, status)`
2. **No Full Entity Hydration Required for Aggregation**:
   - Repository aggregation methods compute `SUM(...)` and `COUNT(...)` directly in SQL where available, avoiding hydrating hundreds of aggregate entities into Node.js process memory when only scalar sums are needed.

---

## 8. Rejected Alternatives

| Alternative                                           | Description                                                                         | Reason for Rejection                                                                                                           |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| **Alternative A: Materialized Summary Table**         | Create a `tenant_resource_summaries` table updated on every write.                  | High write amplification, extreme race conditions during concurrent POS sales, and severe risk of stale/divergent totals.      |
| **Alternative B: Merged "Resource" Super-Aggregate**  | Merge `InventoryItem` and `FixedAsset` into a single polymorphic `Resource` entity. | Destroys DDD domain boundaries, conflates physical stock count with serial equipment tracking, and creates leaky abstractions. |
| **Alternative C: Two-Phase Distributed Locking Read** | Wrap combined reads in distributed distributed locks across tables.                 | Unacceptable performance penalty on high-frequency POS checkouts for zero tangible business benefit.                           |
