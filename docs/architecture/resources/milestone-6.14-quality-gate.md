# Milestone 6.14: Resource Overview Dashboard Quality Gate & Architectural Sign-Off

**Milestone**: Phase 6.14 — Resource Overview Dashboard  
**Bounded Context**: `Resources Management`  
**Sub-Domains**: `Consumable Inventory`, `Fixed Assets`, `Cross-Domain Valuation`  
**Review Date**: September 7, 2026  
**Reviewers**:

- Principal Enterprise Architect
- Senior Full-Stack Platform Engineer
- Resource Domain Lead
- Financial & Valuation Specialist
- Application Security Engineer
- Principal Frontend Architect & UX Accessibility Reviewer
- Senior Test & QA Governance Engineer
- Kinergy Architecture Review Board (ARB)

**Decision**: **APPROVED — RESOURCE OVERVIEW DASHBOARD READY FOR PRODUCTION**

---

## 1. Executive Summary

Milestone 6.14 delivers the authoritative, production-grade **Resource Overview Dashboard** for the `Resources Management` bounded context.

Executive leadership and facility managers require instant visibility into their complete operational and capital position without navigating across disparate subsystems or manually calculating balances. Milestone 6.14 synthesizes two fundamentally segregated domains into a single unified executive cockpit:

1. **Consumable Inventory**: High-turnover, variable-quantity working capital stock available for sale or operational consumption.
2. **Fixed Assets**: Long-lived capital equipment, machinery, and physical infrastructure owned and utilized by the enterprise.

### Core Architectural Mandates Satisfied:

- **Strict Domain Boundary Preservation**: Complete adherence to [ADR-0081](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md) and [ADR-0082](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md). Consumable inventory and fixed assets maintain independent aggregate models, separate database schemas, and orthogonal domain lifecycles.
- **Strict No-Conflation Rule**: Fixed assets are **never** labeled as "inventory." The combined enterprise balance is **never** labeled as "Inventory Value"; it is strictly designated **Combined Resource Value**.
- **Atomic Read Query Architecture**: Governed by [ADR-0102](./adr/0102-resource-overview-synthesized-read-query-architecture.md), a dedicated CQRS query handler (`GetResourceOverviewHandler`) provides a single-round-trip read model (`GET /api/v1/resources/overview`) leveraging concurrent repository database aggregations.
- **Integer-Cents Arithmetic & Decimal Integrity**: All balance sheet aggregations are calculated using exact integer-cents arithmetic to prevent binary floating-point drift.
- **Dual-Layer Authorization Governance**: Protected by composed granular permissions (`inventory.read` + `assets.read` + `billing.read`) or executive leadership roles (`ADMIN`, `SUPER_ADMIN`, `OWNER`).
- **Comprehensive Test Verification**: 100% test pass rate across 109 test suites (**1,038 total passing tests**), including a dedicated 16-test end-to-end domain QA suite ([`resource-overview-qa-pass.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/__tests__/resource-overview-qa-pass.spec.ts)).

---

## 2. Business Distinctions & Domain Boundaries

The Resource Overview interface and backing contracts enforce complete separation between working capital and fixed capital:

| Dimension             | Domain A: Consumable Inventory                     | Domain B: Fixed Assets                          | Combined Enterprise Position          |
| :-------------------- | :------------------------------------------------- | :---------------------------------------------- | :------------------------------------ |
| **Core Concept**      | _"What we have available for sale or consumption"_ | _"What the business owns as capital equipment"_ | _"Total physical resources position"_ |
| **Accounting Nature** | Current Assets / Working Capital                   | Non-Current Capital Equipment (CAPEX)           | Consolidated Physical Asset Base      |
| **Unit Nature**       | Fungible quantities across catalog SKUs            | Non-fungible, uniquely serialized hardware      | Cross-domain portfolio synthesis      |
| **Lifecycle**         | Fast turnover, replenishment thresholds            | Multi-year operational service, maintenance     | Multi-lifecycle executive telemetry   |
| **Primary Valuation** | Total acquisition cost of stock on hand            | Net carrying book value of operational assets   | **Combined Resource Value**           |
| **Operational Focus** | Low stock alerts, stockout prevention              | Machine health, servicing, condition rating     | Capital allocation & operational risk |

---

## 3. Mathematical Valuation Models

All monetary valuations are computed deterministically in integer cents before formatting to standard currency decimals:

### 3.1 Consumable Inventory Valuation

$$\text{Inventory Value} = \sum_{i \in \text{Active Items}} (\text{currentStock}_i \times \text{purchaseCost}_i)$$

- Sourced from active `InventoryItem` records.
- Soft-archived products are excluded by default, included only when `includeArchived: true` is explicitly requested.
- Preserves exact unit purchase cost historical baselines.

### 3.2 Fixed Asset Carrying Valuation

$$\text{Fixed Asset Value} = \sum_{a \in \text{Carrying Assets}} \text{currentEstimatedValue}_a$$

- Strictly bounded by the lifecycle valuation policy defined in [ADR-0097](./adr/0097-fixed-asset-carrying-valuation-and-lifecycle-inclusion-matrix.md):
  - `ACTIVE`: Included at 100% carrying value.
  - `UNDER_MAINTENANCE`: Included at 100% carrying value (asset is temporarily offline for servicing).
  - `DAMAGED`: Included at 100% carrying value (impaired but retains residual appraisal until formal disposal).
  - `RETIRED`: Explicitly excluded ($0.00 contribution).
  - `SOLD`: Explicitly excluded ($0.00 contribution; proceeds realized through liquidation).

### 3.3 Combined Resource Value

$$\text{Combined Resource Value} = \text{Inventory Value} + \text{Fixed Asset Value}$$

- **Invariant**: Must never be described as "Inventory Value" or "Total Stock Value".
- Portfolio distribution shares are derived as:
  $$\text{Inventory Share \%} = \frac{\text{Inventory Value}}{\text{Combined Resource Value}} \times 100$$
  $$\text{Fixed Asset Share \%} = \frac{\text{Fixed Asset Value}}{\text{Combined Resource Value}} \times 100$$
- If Combined Resource Value is $0.00, distribution percentages gracefully evaluate to 0% without division-by-zero errors.

---

## 4. Operational Risk Metrics

The overview query concurrently surfaces five critical operational health indicators:

1. **Low Stock Items**: Count of active inventory SKUs where $\text{quantityOnHand} \le \text{minimumStock}$ (including zero-stock stockouts).
2. **Active Assets**: Count of fixed equipment units currently operational and in service (`status = ACTIVE`).
3. **Assets Under Maintenance**: Count of equipment currently offline for servicing or preventative maintenance (`status = UNDER_MAINTENANCE`).
4. **Damaged Assets**: Count of equipment impaired and awaiting repair assessment or write-off (`status = DAMAGED`).
5. **Retired Assets**: Count of historical decommissioned or salvaged assets (`status = RETIRED`).

---

## 5. Public HTTP API Contract

The overview query is exposed via NestJS under the versioned API namespace:

- **Endpoint**: `GET /api/v1/resources/overview`
- **Controller**: [`ResourceOverviewController`](file:///c:/Projects/kinergy-platform/apps/api/src/resources/controllers/resource-overview.controller.ts)
- **Guards**: `AuthenticationGuard`, `AuthorizationGuard`
- **Roles**: `@Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')`
- **Permissions**: `@Permissions('inventory.read', 'assets.read', 'billing.read')`
- **Query Parameters**:
  - `includeArchived` (boolean, optional, default: `false`)

### Response DTO Contract (`ResourceOverviewResponseDto`):

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

## 6. Synthesized Read-Query Architecture

Governed by [ADR-0102](./adr/0102-resource-overview-synthesized-read-query-architecture.md), the read model executes as follows:

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

- **Persistence Layer Optimization**: Where repositories implement `getOverviewMetrics`, the query delegates directly to database-level `SUM` and `COUNT` aggregations, avoiding entity hydration overhead.
- **Fallback In-Memory Aggregation**: In-memory and non-relational test fixtures gracefully aggregate domain entity collections using identical business semantics.
- **Zero Write Lock Contention**: All queries execute read-only without transaction locks (`NOLOCK` / `READ COMMITTED`), ensuring high-volume POS checkouts and equipment scans are never delayed.

---

## 7. Frontend Presentation & UX Architecture

The frontend module is encapsulated under `apps/web/src/modules/resources/overview/`:

1. **Executive Balance Sheet Header (`OverallResourceValueCard`)**:
   - Displays prominent **Combined Resource Value** with ISO currency formatting.
   - Dual-color distribution progress bar indicating the exact working capital vs. fixed asset capital split.
   - Responsive flex-wrap and `tabular-nums` formatting to eliminate mobile viewport clipping.
2. **Consumable Inventory Section (`ConsumableInventorySection`)**:
   - Executive subtitle: _"What you have available for sale or consumption"_.
   - Key metrics: Total Working Capital Value, Low Stock Alert Count, Distinct SKUs, Total Units.
   - Low stock badge triage: `Stock Healthy` (green) when 0 low stock items; `Replenish Required` (red alert) when $\ge 1$; `No Products` (neutral) when 0 products exist.
   - Quick CTA to navigate to product catalog or replenishment alert queue.
3. **Fixed Assets Section (`FixedAssetsSection`)**:
   - Executive subtitle: _"What the business owns as capital equipment"_.
   - Key metrics: Total Carrying Book Value, Active Assets, Under Maintenance, Damaged, Retired.
   - Operational health badge: `All Operational` (green) when 0 damaged/maintenance assets; `Requires Attention` (amber) when assets are impaired or under service; `No Assets` (neutral) when 0 assets exist.
   - Quick CTA to navigate to equipment directory.
4. **Resilient UX States**:
   - Full-bleed animated skeleton loading placeholders.
   - Descriptive error banners with retry buttons.
   - Permission-denied screens with humanized explanations of missing roles/claims.
   - Empty estate onboarding banner when an organization has zero inventory products and zero fixed assets.

---

## 8. Test Matrix & Verification Coverage

Milestone 6.14 is backed by extensive automated test coverage across all architecture layers:

### 8.1 Domain QA Pass Suite (`resource-overview-qa-pass.spec.ts` — 16 Tests)

- `Σ(currentStock × purchaseCost)` calculation accuracy.
- `Σ(currentEstimatedValue)` carrying value accuracy across asset states.
- Exact combined valuation: `inventoryValue + fixedAssetValue`.
- Low-stock boundary conditions (0 items, 1 item, multiple items, stockout `QOH = 0`, boundary `QOH = minimumStock`, boundary `QOH = minimumStock + 1`).
- Inactive and archived inventory filtering rules.
- Complete 4-state asset lifecycle isolation (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`).
- Dramatic valuation asymmetry testing (high inventory / low assets vs. low inventory / high assets).
- Empty estate baseline verification ($0.00 / 0 counts).
- Floating-point drift resistance with multi-decimal costs.

### 8.2 API Controller & Authorization Suites (18 Tests)

- `apps/api/src/resources/__tests__/resource-overview.controller.spec.ts` (9 tests): Validates DTO serialization, query parameter parsing, and application result mapping.
- `apps/api/src/resources/__tests__/resource-overview.authorization.spec.ts` (9 tests): Asserts 401 Unauthorized for unauthenticated callers, 403 Forbidden for missing individual permissions, and 200 OK for callers with composed claims or executive roles (`ADMIN`, `SUPER_ADMIN`, `OWNER`).

### 8.3 Frontend React Component & Integration Suites (22 Tests)

- `resource-overview-page.spec.tsx` (6 tests): End-to-end page rendering, loading skeletons, error trapping, permission gating.
- `overall-resource-value-card.spec.tsx` (5 tests): Value formatting, distribution ratio calculation, zero-state defense.
- `consumable-inventory-section.spec.tsx` (5 tests): Metric cards, low stock alerts, zero-item badge states.
- `fixed-assets-section.spec.tsx` (6 tests): Carrying value, lifecycle status cards, zero-asset badge states.

### 8.4 Full Monorepo Health

```bash
> pnpm validate
✔ format:check passed
✔ lint passed (10 projects)
✔ typecheck passed (tsc --noEmit -p tsconfig.base.json)
✔ test passed (1038 passed, 109 test suites)
✔ build passed (10 projects)
```

---

## 9. Architectural Decision Records (ADR) Governance

Milestone 6.14 operates strictly under approved ADRs:

- **[ADR-0081](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md)**: Resources Bounded Context Topology & Domain Segregation.
- **[ADR-0082](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)**: Fixed Asset Domain Modeling & Complete Segregation from Inventory.
- **[ADR-0094](./adr/0094-resources-authorization-and-permission-taxonomy-model.md)**: Resources Authorization & Permission Taxonomy Model.
- **[ADR-0095](./adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)**: Resource Sensitive Valuation Data Access & Response-Shaping Policy.
- **[ADR-0096](./adr/0096-consumable-inventory-operational-valuation-basis.md)**: Consumable Inventory Operational Valuation Basis.
- **[ADR-0097](./adr/0097-fixed-asset-carrying-valuation-and-lifecycle-inclusion-matrix.md)**: Fixed Asset Carrying Valuation & Lifecycle Inclusion Matrix.
- **[ADR-0098](./adr/0098-cross-domain-derived-resource-valuation-architecture.md)**: Cross-Domain Derived Resource Valuation Architecture.
- **[ADR-0100](./adr/0100-frontend-resources-feature-module-boundaries.md)**: Frontend Resources Feature-Module Boundaries & Encapsulation.
- **[ADR-0102](./adr/0102-resource-overview-synthesized-read-query-architecture.md)**: Resource Overview Synthesized Read-Query Architecture & Executive Cockpit.

---

## 10. Final Architecture Governance Decision

### **APPROVED — RESOURCE OVERVIEW DASHBOARD PRODUCTION READY**

The Resource Overview Dashboard fulfills all business, architectural, mathematical, security, and UX requirements established for Milestone 6.14. It is formally approved by the Kinergy Architecture Review Board.
