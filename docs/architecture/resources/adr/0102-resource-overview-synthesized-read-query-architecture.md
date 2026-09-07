# ADR-0102: Resource Overview Synthesized Read-Query Architecture & Executive Cockpit

**Status**: `ACCEPTED & AUTHORITATIVE`  
**Date**: 2026-09-06  
**Deciders**: Principal Enterprise Architect, Senior Full-Stack Platform Engineer, Resource Domain Lead, ARB  
**Subsystem**: Resources Management (`packages/core`, `apps/api`, `apps/web/src/modules/resources/overview`)  
**Related ADRs**:

- [ADR-0081: Resources Bounded Context Topology & Domain Segregation](./0081-resources-bounded-context-topology-and-domain-segregation.md)
- [ADR-0082: Fixed Asset Domain Modeling & Complete Segregation from Inventory](./0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)
- [ADR-0094: Resources Authorization & Permission Taxonomy Model](./0094-resources-authorization-and-permission-taxonomy-model.md)
- [ADR-0095: Resource Sensitive Valuation Data Access & Response-Shaping Policy](./0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)
- [ADR-0096: Consumable Inventory Operational Valuation Basis](./0096-consumable-inventory-operational-valuation-basis.md)
- [ADR-0097: Fixed Asset Carrying Valuation & Lifecycle Inclusion Matrix](./0097-fixed-asset-carrying-valuation-and-lifecycle-inclusion-matrix.md)
- [ADR-0098: Cross-Domain Derived Resource Valuation Architecture](./0098-cross-domain-derived-resource-valuation-architecture.md)
- [ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation](./0100-frontend-resources-feature-module-boundaries.md)

---

## 1. Context and Problem Statement

Enterprise owners and executive management in wellness and clinic operations require a high-level operational cockpit answering three fundamental business questions at a glance:

1. **"What do I have available for sale or consumption?"** (Working capital and stock replenishment urgency)
2. **"What does the business own?"** (Long-term capital equipment carrying value and maintenance health)
3. **"What is my total physical resource position?"** (Consolidated balance sheet exposure across working capital and fixed capital equipment)

Prior to Milestone 6.14, retrieving this telemetry required making multiple uncoordinated HTTP requests across disparate sub-endpoints (`/api/v1/resources/inventory/valuation`, `/api/v1/resources/inventory/low-stock`, `/api/v1/resources/assets/valuation/summary`, and `/api/v1/resources/assets`), causing:

- Waterfall network latency on mobile and low-bandwidth connections.
- Inconsistent point-in-time calculation timestamps across separate queries.
- UI complexity in managing multiple loading/error states and independently stitching cross-domain metrics.

We must establish the authoritative architectural pattern for the Resource Overview read model across backend application queries, persistence aggregations, API contracts, and frontend presentation.

---

## 2. Decision Drivers

- **Strict Domain Boundary Preservation**: Maintain complete architectural and schema segregation between **Consumable Inventory** and **Fixed Assets** (ADR-0081, ADR-0082). Never collapse them into a single generic table or aggregate.
- **Single Network Round-Trip**: Provide an atomic, unified read query delivering executive financial and operational telemetry in a single payload.
- **Mathematical & Decimal Integrity**: Eliminate binary floating-point drift using strict integer-cents arithmetic (ADR-0089, ADR-0098).
- **High Concurrency & Low Latency**: Implement high-performance persistence aggregations (`getOverviewMetrics`) that do not lock write-side inventory transactions.
- **Strict Authorization Governance**: Enforce composed claims for confidential financial balance sheet data while permitting executive role access (ADR-0094, ADR-0095).

---

## 3. Considered Options

### Option 1: Client-Side Fan-Out & Aggregation

The web frontend independently calls `GET /resources/inventory/valuation`, `GET /resources/inventory/low-stock`, and `GET /resources/assets/valuation/summary`, recalculating totals client-side.

- _Rejected_: Violates the single-source-of-truth rule. Frontend client recalculations drift, network waterfalls harm mobile performance, and independent timestamps confuse financial auditing.

### Option 2: Denormalized Materialized Database Overview Table

A persistent `resource_overview_snapshots` table maintained via database triggers or domain event listeners.

- _Rejected_: Materialized tables create data synchronization drift, transaction lock contention during high-volume retail checkouts, and severe schema maintenance overhead.

### Option 3: Unified Application Query with Optimized Database Aggregation (SELECTED)

A dedicated CQRS query handler (`GetResourceOverviewHandler`) exposed via `GET /api/v1/resources/overview`. The handler checks for optimized database aggregation support on repositories (`getOverviewMetrics`), falling back to concurrent domain query handler composition.

---

## 4. Architectural Decision & Technical Specification

### 4.1 Canonical Business Distinction

The architecture mandates strict conceptual and presentation separation between the two physical resource domains:

| Dimension             | Domain A: Consumable Inventory                           | Domain B: Fixed Assets                                     |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| **Core Concept**      | _"What we have available for sale or consumption"_       | _"What the business owns as fixed assets"_                 |
| **Accounting Nature** | Current Assets / Working Capital                         | Non-Current Physical Assets / Capital Equipment (CAPEX)    |
| **Unit Nature**       | Fungible quantities across catalog SKUs                  | Non-fungible, uniquely tagged serial hardware units        |
| **Operational Focus** | Stock turnover, replenishment thresholds, reorder queues | Operational lifecycle, maintenance logs, condition ratings |
| **Primary Valuation** | Total acquisition cost of stock on hand                  | Net carrying book value across active equipment            |

> [!IMPORTANT]
> **No-Conflation Rule**: Fixed Assets must NEVER be termed "inventory" or grouped under inventory headings. The consolidated balance must ALWAYS be labeled **Combined Resource Value**, never "Inventory Value".

---

### 4.2 Authoritative Valuation Formulas

All monetary valuations are computed using integer-cents arithmetic before decimal formatting:

1. **Consumable Inventory Value**:
   $$\text{Inventory Value} = \sum_{i \in \text{Active Items}} (\text{currentStock}_i \times \text{purchaseCost}_i)$$
   _Excludes archived products unless `includeArchived: true` is explicitly requested._

2. **Fixed Asset Carrying Value**:
   $$\text{Fixed Asset Value} = \sum_{a \in \text{Carrying Assets}} \text{currentEstimatedValue}_a$$
   _Strictly restricted to assets in `ACTIVE`, `UNDER_MAINTENANCE`, and `DAMAGED` lifecycle statuses per ADR-0097. Assets in `RETIRED` or `SOLD` statuses carry $0.00._

3. **Combined Resource Value**:
   $$\text{Combined Resource Value} = \text{Inventory Value} + \text{Fixed Asset Value}$$

---

### 4.3 Operational Risk Metrics

The overview query concurrently surfaces five critical operational health indicators:

- **Low Stock Items**: Count of inventory SKUs where $\text{quantityOnHand} \le \text{minimumStock}$ (including zero-stock items).
- **Active Assets**: Count of fixed equipment units currently operational and in service (`status = ACTIVE`).
- **Assets Under Maintenance**: Count of equipment currently offline for servicing or repair (`status = UNDER_MAINTENANCE`).
- **Damaged Assets**: Count of equipment impaired and awaiting repair or write-off (`status = DAMAGED`).
- **Retired Assets**: Count of decommissioned or salvaged historical assets (`status = RETIRED`).

---

### 4.4 Read-Query Execution Topology

```
                  ┌──────────────────────────────────────────────┐
                  │          Executive Web Dashboard             │
                  │        GET /api/v1/resources/overview        │
                  └───────────────────────┬──────────────────────┘
                                          │
                             [AuthenticationGuard]
                             [AuthorizationGuard]
                   (Roles: ADMIN, SUPER_ADMIN, OWNER OR
                    Perms: inventory.read + assets.read + billing.read)
                                          │
                                          ▼
                  ┌──────────────────────────────────────────────┐
                  │         ResourceOverviewController           │
                  └───────────────────────┬──────────────────────┘
                                          │
                                          ▼
                  ┌──────────────────────────────────────────────┐
                  │          GetResourceOverviewHandler          │
                  └───────────────┬───────────────┬──────────────┘
                                  │               │
             (Concurrent Branch)  │               │  (Concurrent Branch)
                                  ▼               ▼
           ┌───────────────────────────┐     ┌───────────────────────────┐
           │ Inventory Query Strategy  │     │   Asset Query Strategy    │
           │  (getOverviewMetrics)     │     │   (getOverviewMetrics)    │
           └──────────────┬────────────┘     └─────────────┬─────────────┘
                          │                                │
                 (Database SQL Query)             (Database SQL Query)
                          │                                │
                          ▼                                ▼
                 [inventory_items]                  [fixed_assets]
```

Where supported by the persistence tier (e.g. `PrismaInventoryItemRepository` and `PrismaFixedAssetRepository`), the query executes single-round-trip database aggregations:

- `PrismaInventoryItemRepository.getOverviewMetrics`: Computes total items, total units, total valuation in cents, and low stock count.
- `PrismaFixedAssetRepository.getOverviewMetrics`: Executes a single `groupBy` across asset `status` summing `currentEstimatedValueAmount` and counts.

---

### 4.5 API Contract & DTO Specification

- **Endpoint**: `GET /api/v1/resources/overview`
- **Query Parameters**:
  - `includeArchived` (boolean, optional, default: `false`): When true, includes soft-archived items in calculations.
- **Response DTO**: `ResourceOverviewResponseDto`
  ```json
  {
    "consumableInventory": {
      "totalValueAmount": 38450.0,
      "lowStockItemCount": 3,
      "totalDistinctItems": 42,
      "totalQuantityUnits": 1250
    },
    "fixedAssets": {
      "totalCarryingValueAmount": 185000.0,
      "activeAssetCount": 14,
      "underMaintenanceAssetCount": 1,
      "damagedAssetCount": 0,
      "retiredAssetCount": 2,
      "totalAssetCount": 17
    },
    "combined": {
      "totalCombinedValueAmount": 223450.0
    },
    "currency": "USD",
    "calculatedAt": "2026-09-07T12:00:00.000Z"
  }
  ```

---

### 4.6 Authorization & Permission Security Model

The Resource Overview synthesizes confidential balance sheet working capital and capital asset carrying values. Access is governed at two layers:

1. **Executive Roles**: `ADMIN`, `SUPER_ADMIN`, and `OWNER` are granted automatic access to the dashboard.
2. **Composed Granular Claims**: Non-executive users must possess all three domain permissions:
   - `inventory.read` (permits viewing inventory stock telemetry)
   - `assets.read` (permits viewing capital equipment operational status)
   - `billing.read` or `valuation.read` (permits viewing financial carrying values)

Requests lacking valid authentication receive `401 Unauthorized`. Requests lacking the required role or composed permissions receive `403 Forbidden`.

---

### 4.7 Frontend Presentation Architecture

The frontend implementation (`apps/web/src/modules/resources/overview/`) adheres to the following rules:

- **Hierarchical Layout**: Divided into 3 conceptual areas:
  1. Executive Balance Sheet Summary (`OverallResourceValueCard`) featuring Combined Resource Value and distribution breakdown.
  2. Consumable Inventory Section (`ConsumableInventorySection`) with low-stock replenishment telemetry.
  3. Fixed Assets Section (`FixedAssetsSection`) with operational lifecycle counts.
- **Intentional Zero States**:
  - Empty estate (zero items, zero assets) presents a guided onboarding card to register first products and assets.
  - Domain-specific zero states (e.g. 0 inventory items) display clear `No Products` badges rather than false-positive `Stock Healthy` badges.
- **Accessibility & Responsiveness**:
  - Semantic heading hierarchy ($h1 \to h2 \to h3$).
  - All status badges combine visual color tokens with explicit textual labels.
  - Value containers apply `flex-wrap` and `tabular-nums` formatting to prevent clipping on mobile screens.

---

## 5. Consequences

### Positive

- **Atomic Read Efficiency**: Executive dashboard renders in a single HTTP request with sub-50ms database aggregation latency.
- **Audit Consistency**: All three conceptual areas share an identical point-in-time calculation timestamp (`calculatedAt`).
- **No Conflation Risk**: Absolute structural and visual segregation between working capital inventory and fixed capital equipment.
- **Zero Floating-Point Drift**: Integer cents normalization across all sum and percentage calculations.

### Negative / Trade-offs

- Adding new cross-domain metrics to the overview requires updating the composite DTO contract and both repository aggregation queries.
