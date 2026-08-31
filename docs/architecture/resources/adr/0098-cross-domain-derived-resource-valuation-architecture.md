# ADR-0098: Cross-Domain Derived Resource Valuation Architecture

## Status

`ACCEPTED`

## Date

2026-08-31

## Context

In Phase 6 (Resources Management), Milestone 6.8 establishes executive valuation reporting across the entire physical resource estate of the business.

Executive management dashboards require a combined, authoritative metric:
$$\text{Combined Resource Value} = \text{Consumable Inventory Working Capital} + \text{Fixed Asset Carrying Value}$$

Multiple architectural patterns exist for producing this combined metric:

1. **Application-Layer Derived Composition**: Dynamic on-demand execution of independent domain query handlers, combining integer-cents results in an orchestration handler.
2. **Denormalized Database Aggregate Tables**: Storing a materialized `TenantResourceTotal` table maintained via triggers or application events.
3. **Domain Aggregate Merger**: Merging `InventoryItem` and `FixedAsset` into a single polymorphic `Resource` database table and aggregate root.

## Decision

We adopt **Option 1: Application-Layer Derived Composition** (`GetResourceValuationSummaryHandler`).

### Key Decisions:

1. **Preserve Domain Separation**: `InventoryItem` and `FixedAsset` remain strictly segregated domain models with separate tables (`inventory_items`, `fixed_assets`) and separate repositories.
2. **No Stored Totals**: Storing denormalized summary totals in relational database tables is strictly prohibited.
3. **Operational Snapshot Consistency**: Cross-domain valuation executes as an operational snapshot without heavy `SERIALIZABLE` cross-table locking.
4. **Integer Cents Precision**: Summation is performed using integer-cents arithmetic ($\text{inventoryCents} + \text{assetCents}$) before converting to decimal representation.
5. **Dual-Domain Security Gate**: Combined valuation endpoints require `inventory.read`, `assets.read`, and `billing.read`.

## Consequences

### Positive

- **Single Source of Truth**: Eliminates bugs where stored totals drift out of sync with actual line-item records.
- **Architectural Cleanliness**: Consumable inventory and capital fixed assets maintain distinct, focused aggregate roots.
- **High Concurrency & Low Latency**: Read queries execute without taking locks on physical inventory write operations.

### Negative / Trade-offs

- Summing extremely large catalogs on-demand requires optimized indexed database queries rather than reading a static pre-computed field.

## Compliance

- Aligns with [ADR-0094](0094-resources-authorization-and-permission-taxonomy-model.md), [ADR-0095](0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md), [ADR-0096](0096-consumable-inventory-operational-valuation-basis.md), and [ADR-0097](0097-fixed-asset-lifecycle-valuation-inclusion-policy.md).
