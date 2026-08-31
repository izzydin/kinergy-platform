# Resource Valuation Architecture & Domain Data Baseline

## Metadata

- **Author**: Principal Software Architect, Senior Backend Engineer, Financial Domain Reviewer
- **Phase**: Phase 6 — Resources Management
- **Milestone**: Milestone 6.8 — Resource Valuation
- **Status**: `AUTHORITATIVE ARCHITECTURAL BASELINE`
- **Review Date**: August 31, 2026

---

## 1. Executive Summary & Objective

The primary objective of Milestone 6.8 is to provide an authoritative, reproducible, and verifiable financial valuation capability for all business resources across Kinergy (Consumable Inventory working capital and Fixed Asset capital equipment).

When the business owner or financial administrator views the executive dashboard to answer:

> _"How much total value does the business currently hold across physical resources?"_

the resulting metrics directly inform capital allocation, purchasing budgets, insurance limits, maintenance expenditures, and asset write-down decisions.

To guarantee mathematical precision and auditability, this baseline establishes the single source of truth (SSOT), precision constraints, lifecycle inclusion criteria, and reporting boundaries before implementing aggregation pipelines or reporting endpoints.

---

## 2. Existing Architecture Relevant to Valuation

The Kinergy platform architecture enforces strict Domain-Driven Design (DDD), CQRS separation, and Hexagonal architecture:

1. **Domain Layer (`packages/core/src/resources/domain/`)**:
   - `InventoryItem`: Aggregate root managing physical SKU stock levels (`Quantity`), unit acquisition cost (`Money`), and selling price (`Money`).
   - `FixedAsset`: Aggregate root managing capital equipment acquisition value (`Money`), current estimated book value (`Money`), physical location, condition, and status.
   - `StockMovement`: Ledger entity recording append-only delta transactions and moving unit costs.
   - `AssetMaintenanceRecord`: Entity capturing historical maintenance costs.
2. **Application Layer (`packages/core/src/resources/application/`)**:
   - Queries and handlers (`GetInventoryValuationHandler`, `GetAssetValueHandler`) implement dedicated read-model projections.
   - Handlers perform calculation on authoritative aggregate representations without side effects.
3. **Persistence Layer (`prisma/schema.prisma`)**:
   - PostgreSQL backed storage using `Decimal(10, 2)` column precision for all monetary and physical quantity fields.
4. **Security Layer (`apps/api/src/platform/identity/authorization/`)**:
   - Dual-permission RBAC (`inventory.read` / `assets.read` + `billing.read`) governs sensitive valuation visibility (per [ADR-0095](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)).

---

## 3. Authoritative Inventory Valuation Inputs

For Consumable Inventory, working capital is calculated using the **Acquisition Cost Baseline (FIFO/Standard Cost)**:

$$\text{Item Valuation} = \text{quantityOnHand} \times \text{purchaseCostAmount}$$

| Property          | Authoritative Source                                                  | Representation                                | Lifecycle Rule                                                                                                                                                                                           |
| :---------------- | :-------------------------------------------------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Current Stock** | `InventoryItem.quantityOnHand` (`inventory_items.quantity_on_hand`)   | `Quantity` VO / `Decimal(10, 2)`              | Authoritative current quantity. Stock ledger (`stock_movements`) is used for transactional audits but aggregate root is the SSOT for current balance.                                                    |
| **Purchase Cost** | `InventoryItem.purchaseCost` (`inventory_items.purchase_cost_amount`) | `Money` VO / `Decimal(10, 2)`                 | Acquisition unit cost in specified currency (default `USD`).                                                                                                                                             |
| **Item Status**   | `InventoryItem.status` (`inventory_items.status`)                     | `InventoryItemStatus` (`ACTIVE` / `ARCHIVED`) | **Active Valuation**: Only `ACTIVE` items are included by default. `ARCHIVED` items holding stock are excluded from operational working capital unless explicitly requested via `includeArchived: true`. |
| **Selling Price** | `InventoryItem.sellingPrice` (`inventory_items.selling_price_amount`) | `Money` VO / `Decimal(10, 2)`                 | Retail price for POS; **NOT** used for balance sheet inventory valuation (to prevent unrealized revenue overstatement).                                                                                  |

---

## 4. Authoritative Fixed Asset Valuation Inputs

For Fixed Assets, capital equipment is evaluated through two distinct financial dimensions:

1. **Historical Acquisition Capital (CAPEX)**:
   $$\text{Total CAPEX} = \sum \text{purchaseValueAmount}$$
2. **Current Book Value (Carrying / Fair Market Value)**:
   $$\text{Total Carrying Value} = \sum \text{currentEstimatedValueAmount}$$

| Property                      | Authoritative Source                                                               | Representation                                                                   | Lifecycle Rule                                                                                                                                                                                                            |
| :---------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Current Book Value**        | `FixedAsset.currentEstimatedValue` (`fixed_assets.current_estimated_value_amount`) | `Money` VO / `Decimal(10, 2)`                                                    | Reflects current fair/depreciated carrying value.                                                                                                                                                                         |
| **Historical Purchase Value** | `FixedAsset.purchaseValue` (`fixed_assets.purchase_value_amount`)                  | `Money` VO / `Decimal(10, 2)`                                                    | Original purchase invoice cost.                                                                                                                                                                                           |
| **Asset Status**              | `FixedAsset.status` (`fixed_assets.status`)                                        | `AssetStatus` (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`)      | **Inclusion Rules**: Active operational assets (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`) are included in carrying value. Decommissioned assets (`RETIRED`, `SOLD`) are **excluded** from active business resource value. |
| **Asset Condition**           | `FixedAsset.condition` (`fixed_assets.condition`)                                  | `AssetCondition` (`EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`) | Operational health indicator; provides qualitative breakdown for replacement planning.                                                                                                                                    |
| **Maintenance Cost**          | `AssetMaintenanceRecord.cost` (`asset_maintenance_records.cost_amount`)            | `Money` VO / `Decimal(10, 2)`                                                    | Cumulative OpEx service expenditures; reported separately from capital asset value.                                                                                                                                       |

---

## 5. Monetary & Quantity Precision Conventions

### 5.1 Monetary Precision (`Money` VO)

- **Currency System**: Explicit ISO-4217 3-letter codes (`USD`, `EUR`, `CAD`, `GBP`).
- **Precision Scale**: Scale 2 fixed hundredths (cents).
- **Arithmetic Invariant**: Calculations must perform **integer cents arithmetic** (`Math.round(amount * 100)`) prior to division to prevent IEEE 754 floating-point drift across cumulative sums.
- **Database Column**: `Decimal(10, 2)`.

### 5.2 Quantity Precision (`Quantity` VO)

- **Precision Scale**: Scale 2 fixed hundredths (`0.01` minimum increment) to support fractional units (e.g. `2.50` kg, `1.75` liters, `10.00` boxed units).
- **Arithmetic Invariant**: Non-negative finite decimal numbers. Invariant `[INV-1]` prevents negative stock balances.

---

## 6. Cached Aggregate & Materialized Total Review

An architectural audit of the Kinergy repository was conducted to inspect stored totals:

- **Finding**: Kinergy does **not** store denormalized aggregate columns (such as `Business.totalResourcesValue` or `Tenant.inventoryTotal`).
- **Architectural Policy**:
  1. Stored totals in relational tables create concurrency race conditions and risk silent staleness.
  2. Aggregations and summaries must be computed **dynamically on-demand** from authoritative aggregate tables using filtered SQL aggregation (`SUM(...)`) or domain query handlers.
  3. Short-lived HTTP cache headers or read-through Redis caches (keyed by `tenantId` and invalidated on mutation events) may be considered for high-traffic dashboards, but no permanent denormalized database tables shall be created.

---

## 7. Existing Reporting & Aggregation Patterns

Existing query handlers establish clear conventions for valuation responses:

1. **DTO Contract & Metric Breakdown**:
   - `totalValueAmount` and `currency`: Top-level aggregate sum.
   - `totalDistinctItems` / `totalUnits`: Volume and unit counters.
   - `breakdownByCategory`: Grouped totals (`totalValueAmount`, `itemCount`, `totalUnits`) mapped by `InventoryCategory` or `AssetCategory`.
   - `calculatedAt`: ISO-8601 UTC timestamp indicating calculation freshness.
2. **Multi-Tenant Partitioning**:
   - All aggregations enforce mandatory `where: { tenantId }` filtering. Cross-tenant aggregation is prohibited.

---

## 8. Existing Authorization Policy for Valuation Data

Per [ADR-0095](file:///c:/Projects/kinergy-platform/docs/architecture/resources/adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md):

- **Commercial Valuation Segregation**: Valuation queries (`GET /inventory/valuation`, `GET /assets/:id/valuation`) require dual permissions:
  - Inventory: `inventory.read` **AND** `billing.read`.
  - Fixed Assets: `assets.read` **AND** `billing.read`.
- **Response Shaping**: Standard operational endpoints (`GET /inventory`, `GET /assets`) omit sensitive acquisition cost and total balance sheet values.

---

## 9. Lifecycle Inclusion & Exclusion Rules

To prevent financial distortions on management dashboards:

| Resource Type      | Status              | Active Valuation Status | Rationale                                                                       |
| :----------------- | :------------------ | :---------------------- | :------------------------------------------------------------------------------ |
| **Inventory Item** | `ACTIVE`            | **INCLUDED**            | Active stock on hand held for operations or sale.                               |
| **Inventory Item** | `ARCHIVED`          | **EXCLUDED (Default)**  | Discontinued SKU. Omitted from working capital unless explicitly requested.     |
| **Fixed Asset**    | `ACTIVE`            | **INCLUDED**            | Deployed operational equipment in service.                                      |
| **Fixed Asset**    | `UNDER_MAINTENANCE` | **INCLUDED**            | Temporary service state; asset remains capital property.                        |
| **Fixed Asset**    | `DAMAGED`           | **INCLUDED**            | Asset remains on balance sheet until repaired, written down, or retired.        |
| **Fixed Asset**    | `RETIRED`           | **EXCLUDED**            | Decommissioned/written off asset; carrying value removed from active equipment. |
| **Fixed Asset**    | `SOLD`              | **EXCLUDED**            | Disposed asset; physical ownership transferred outside business boundary.       |

---

## 10. Identified Risks & Architectural Guardrails

1. **Multi-Currency Aggregation Risk**:
   - _Risk_: A business operating with mixed currency items (e.g. USD and EUR) summing raw amounts without conversion produces meaningless totals.
   - _Guardrail_: Group aggregations by currency code or validate homogeneous tenant default currency before computing scalar totals.
2. **Fractional Quantity Precision Drift**:
   - _Risk_: Multiplying fractional quantities (e.g. `3.33` kg at `$12.99`/kg) causing cumulative penny rounding errors.
   - _Guardrail_: Enforce standard integer-cents rounding at the line-item level before accumulating into category and overall totals.
3. **Archived SKUs with Residual Stock**:
   - _Risk_: Archiving an item that still has non-zero `quantityOnHand` could silently hide physical stock value.
   - _Guardrail_: Valuation DTO must report `totalArchivedValueAmount` as a distinct audit metric if archived stock exists.

---

## 11. Recommended Implementation Boundaries for Milestone 6.8

1. **Unified Resource Valuation Projection**:
   - Create a dedicated application query (`GetComprehensiveResourceValuationQuery`) that combines:
     - Consumable Inventory working capital (`InventoryValuationDTO`).
     - Fixed Asset carrying and acquisition value (`FixedAssetValuationDTO`).
     - Executive summary KPIs (Total Resource Value, Inventory Share %, Fixed Asset Share %, Category Breakdown).
2. **Dedicated Controller Endpoint**:
   - Expose `GET /api/v1/resources/valuation/summary` protected by `inventory.read`, `assets.read`, and `billing.read`.
3. **Reproducibility Guarantee**:
   - Handlers must compute metrics directly from active repository records, ensuring 100% deterministic reproducibility across tests and executive queries.
