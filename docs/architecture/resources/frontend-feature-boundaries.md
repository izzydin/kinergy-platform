# Phase 6: Frontend Feature-Module Boundaries & Architectural Ownership

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: Modular Monolith Architecture, Feature Ownership & Dependency Direction  
**Author**: Principal Frontend Architect & Modular Monolith Boundary Reviewer  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0098: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0098-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Architecture Baseline**](./frontend-architecture-baseline.md)
- [**Phase 6 Frontend Domain Contract Map**](./frontend-domain-contract-map.md)

---

## 1. Selected Module Structure & Architectural Topology

In strict alignment with established Kinergy multi-domain feature modules (e.g., `src/modules/gym/` and `src/modules/identity/`), the Resources frontend is organized as a **Composite Domain Module** with clearly segregated sub-feature boundaries:

```
apps/web/src/modules/resources/
├── inventory/                  # 1. Consumable Inventory Sub-Feature Boundary
│   ├── api/                    # HTTP client methods, query keys, query/mutation hooks
│   ├── components/             # Inventory badges, stock action modals, movement ledger
│   ├── hooks/                  # URL filter state & table controllers
│   ├── routes/                 # InventoryListPage, InventoryDetailPage
│   ├── schemas/                # Zod validation schemas for products & stock actions
│   ├── types/                  # ViewModels, filter parameters, mutation payloads
│   └── index.ts                # Public API barrel export for Inventory
├── assets/                     # 2. Fixed Assets Sub-Feature Boundary
│   ├── api/                    # HTTP client methods, query keys, query/mutation hooks
│   ├── components/             # Asset status badges, location transfer modals, maintenance forms
│   ├── hooks/                  # URL filter state & asset table controllers
│   ├── routes/                 # FixedAssetsListPage, FixedAssetDetailPage
│   ├── schemas/                # Zod validation schemas for assets, transfers, maintenance
│   ├── types/                  # ViewModels, filter parameters, mutation payloads
│   └── index.ts                # Public API barrel export for Fixed Assets
├── valuation/                  # 3. Portfolio Valuation & Executive Overview Sub-Feature
│   ├── api/                    # HTTP client methods, query keys, valuation query hooks
│   ├── components/             # Portfolio metric cards, category breakdown charts
│   ├── hooks/                  # Valuation tab & period controllers
│   ├── routes/                 # ResourceValuationPage (Executive Portfolio Overview)
│   ├── types/                  # Valuation summary & breakdown ViewModels
│   └── index.ts                # Public API barrel export for Valuation
├── routes/                     # Central Router Shell for /resources/*
│   ├── resources.router.tsx    # Sub-router mapping routes to sub-feature page views
│   └── index.ts
├── __tests__/                  # Sub-feature unit, integration, and security test suites
└── index.ts                    # Root public module barrel export (Module Contract)
```

---

## 2. Rationale: Why This Topology Matches Kinergy

1. **Architectural Parity with `src/modules/gym`**: The Gym module successfully encapsulates `memberships/`, `plans/`, `attendance/`, and `trainer-dashboard/` under a single bounded context root (`/gym/*`) with a unified sub-router (`gym.router.tsx`). Applying this exact pattern to `resources/` guarantees zero cognitive friction for platform engineers.
2. **Strict Encapsulation Over Blind Flatness**: A flat `modules/resources/` folder would quickly suffer from name collisions (`types.ts`, `api.ts`, `schemas.ts`) and loose imports between asset maintenance and inventory stock mutations. Sub-feature directories enforce clear domain isolation.
3. **Route & Permission Cohesion**: The sub-features are governed by the unified route prefix `/resources/*` (`/resources/inventory`, `/resources/assets`, `/resources/valuation`) with role-based progressive disclosure (`inventory.read`, `assets.read`, `valuation.read`).

---

## 3. Sub-Feature Architectural Ownership

### A. Consumable Inventory Sub-Feature (`src/modules/resources/inventory/`)

- **Exclusive Responsibilities**:
  - Paginated product catalog listing with search, category, and status filters.
  - Product creation and metadata update forms with Zod validation.
  - Product lifecycle actions (archive, reactivate, deactivate).
  - Stock transaction modals (Purchase receipt, Retail sale, Clinical consumption, Scrap, Audit adjustment).
  - Real-time stock level monitoring and chronological movement audit ledger.
  - Low-stock urgent reorder alert tables and badges.
  - Inventory-specific query keys (`inventoryQueryKeys`), query hooks, and mutation hooks.
  - Inventory ViewModels (`InventoryItemVM`, `StockLevelVM`, `StockMovementVM`).

### B. Fixed Asset Sub-Feature (`src/modules/resources/assets/`)

- **Exclusive Responsibilities**:
  - Paginated asset directory with facility, room, condition, and status filters.
  - Fixed asset registration and detail update forms.
  - Location relocation / transfer modals and location breadcrumb formatting.
  - Lifecycle state machine status transitions (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
  - Physical condition rating updates (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`).
  - Maintenance servicing logs, technician attribution, and maintenance history.
  - Chronological lifecycle audit history timeline streams.
  - Single-asset book value inspection and fair market revaluation forms.
  - Asset-specific query keys (`fixedAssetQueryKeys`), query hooks, and mutation hooks.
  - Asset ViewModels (`FixedAssetVM`, `AssetLocationVM`, `AssetMaintenanceVM`, `AssetHistoryEventVM`).

### C. Resource Valuation & Overview Sub-Feature (`src/modules/resources/valuation/`)

- **Exclusive Responsibilities**:
  - Executive portfolio overview dashboard (`/resources/valuation`).
  - Total working capital inventory valuation by category breakdown.
  - Fixed asset historical CAPEX vs current carrying value breakdown by status.
  - Combined resource allocation ratios and executive metric summary cards.
  - Valuation-specific query keys (`valuationQueryKeys`) and query hooks (`useCombinedResourceValuation`).
  - Valuation ViewModels (`InventoryValuationVM`, `AssetValuationSummaryVM`, `CombinedResourceValuationVM`).
- **Boundaries**: The valuation sub-feature consumes aggregated financial endpoints; it does NOT duplicate individual product tables or asset maintenance forms.

---

## 4. Shared vs. Feature-Specific Abstraction Rules

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Abstraction Placement Grid                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ Feature-Local Code             │ Specific to 1 sub-feature             │
│ (e.g. `inventory/components/`) │ (e.g. `StockMovementTypeBadge`,       │
│                                │  `RecordPurchaseModal`)               │
├────────────────────────────────┼───────────────────────────────────────┤
│ Module-Level Code              │ Shared across resources sub-features  │
│ (e.g. `resources/routes/`)     │ (e.g. `ResourcesRouter`,              │
│                                │  `ResourcesNavigationHeader`)         │
├────────────────────────────────┼───────────────────────────────────────┤
│ Shared Platform Frameworks     │ Shared across ALL web modules         │
│ (`src/shared/*`)               │ (e.g. `DataTable`, `useTableUrlState`,│
│                                │  `FormLayout`, `HttpClient`)          │
├────────────────────────────────┼───────────────────────────────────────┤
│ UI Design System Primitives    │ Pure presentation components          │
│ (`@kinergy-platform/ui`)       │ (e.g. `Button`, `Badge`, `Card`,      │
│                                │  `Dialog`, `Skeleton`, `Toast`)       │
└────────────────────────────────┴───────────────────────────────────────┘
```

> [!IMPORTANT]
> **Outward Movement Rule**: An abstraction is placed in `src/shared/*` only when proven reusable across multiple distinct domain modules (e.g. `gym` and `resources`). Hypothetical reuse is strictly prohibited.

---

## 5. Dependency Direction & Import Rules

```
                      ┌────────────────────────┐
                      │ apps/web/src/app/      │ (Router shell & Providers)
                      └───────────┬────────────┘
                                  │ imports root module contract
                                  ▼
                      ┌────────────────────────┐
                      │ modules/resources/     │ (Root barrel export)
                      └───────────┬────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ valuation/      │      │ inventory/      │      │ assets/         │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │ shared/* & @ui         │ (Platform Frameworks & UI)
                      └────────────────────────┘
```

### Dependency Rules:

1. **Unidirectional Inward-to-Outward**: Sub-features may import from `@kinergy-platform/core`, `@kinergy-platform/ui`, and `src/shared/*`.
2. **Public API Gateways**: If `valuation` references an inventory or asset type, it MUST import strictly from `../inventory` (the sub-feature `index.ts`), never via deep internal paths like `../inventory/api/internal-helper.ts`.
3. **Zero Cross-Module Pollution**: `src/modules/resources` MUST NEVER import internal files from `src/modules/gym` or `src/modules/kinesiology`.

---

## 6. Forbidden Dependency Violations (Architectural Anti-Patterns)

| Forbidden Pattern                 | Example                                                           | Why Forbidden                                     | Correct Approach                                                       |
| :-------------------------------- | :---------------------------------------------------------------- | :------------------------------------------------ | :--------------------------------------------------------------------- |
| **Deep Sub-Feature Import**       | `import { x } from '../inventory/api/inventory-api'`              | Bypasses public sub-feature barrel contract.      | `import { x } from '../inventory'`                                     |
| **Cross-Module Deep Import**      | `import { y } from '../../gym/memberships/api/...'`               | Breaks modular monolith boundary.                 | Import shared contracts from `@kinergy-platform/core` or `src/shared`. |
| **Direct Persistence Leak**       | `import { Prisma } from '@prisma/client'`                         | Frontend MUST NOT couple to backend ORM/DB types. | Import pure DTO types from `src/modules/resources/types`.              |
| **Cross-Feature Cache Tampering** | `queryClient.setQueryData(['gym', ...], data)` inside `inventory` | Violates query cache ownership isolation.         | Invalidate only local `['inventory']` query keys.                      |

---

## 7. Public API Definitions

### 1. `src/modules/resources/inventory/index.ts`

```typescript
export * from './types';
export * from './schemas';
export * from './api';
export * from './components';
export * from './routes';
```

### 2. `src/modules/resources/assets/index.ts`

```typescript
export * from './types';
export * from './schemas';
export * from './api';
export * from './components';
export * from './routes';
```

### 3. `src/modules/resources/valuation/index.ts`

```typescript
export * from './types';
export * from './api';
export * from './components';
export * from './routes';
```

### 4. `src/modules/resources/index.ts` (Root Module Contract)

```typescript
export * from './inventory';
export * from './assets';
export * from './valuation';
export * from './routes';
```
