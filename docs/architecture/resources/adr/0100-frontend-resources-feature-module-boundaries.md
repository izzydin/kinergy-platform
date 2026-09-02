# ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation

**Status**: `ACCEPTED`  
**Date**: 2026-09-02  
**Context**: Phase 6.11 — Frontend Architecture Preparation  
**Deciders**: Principal Frontend Architect, Kinergy Architecture Review Board (ARB)

---

## 1. Context and Problem Statement

When implementing the Resources Management web frontend (`apps/web`), the platform must determine how to structure feature code across three distinct business sub-domains:

1. **Consumable Inventory**: Product catalogs, real-time stock levels, movement ledger audit streams, and operational stock transactions (purchase, sale, consumption, scrap, adjustment).
2. **Fixed Assets**: Capital equipment directory, physical location transfers, 5-state lifecycle transitions, maintenance servicing history, condition ratings, and fair market appraisals.
3. **Resource Valuation & Overview**: Aggregated working capital balances, historical CAPEX vs carrying value analytics, and combined portfolio health dashboards.

We must decide between:

- **Option A (Flat Module)**: Storing all resource files in a single flat directory `src/modules/resources/`.
- **Option B (Separate Independent Modules)**: Creating three decoupled top-level modules `src/modules/inventory/`, `src/modules/assets/`, `src/modules/valuation/`.
- **Option C (Composite Domain Module with Encapsulated Sub-Features)**: Creating `src/modules/resources/` containing sub-feature folders `inventory/`, `assets/`, `valuation/` with unified `/resources/*` routing and explicit public API gateways.

---

## 2. Decision Drivers

- **Architectural Parity**: The pattern must match established Kinergy frontend conventions (e.g. `src/modules/gym/` and `src/modules/identity/`).
- **Domain Encapsulation**: Prevent naming collisions (`types.ts`, `api.ts`, `schemas.ts`) and eliminate uncontrolled cross-feature dependencies between inventory and asset maintenance.
- **Route & Navigation Cohesion**: Unify URL paths beneath `/resources/*` (`/resources/inventory`, `/resources/assets`, `/resources/valuation`) with single-entry router registration.
- **Progressive Disclosure**: Enable clean permission boundaries (`inventory.read`, `assets.read`, `valuation.read`) at both route and component levels.

---

## 3. Considered Options

### Option 1: Single Flat Module (`src/modules/resources/`)

- All components, hooks, routes, schemas, and types placed in single flat subdirectories.
- _Rejected_: Creates massive cognitive overhead, filename collisions, and allows accidental tight coupling between asset depreciation and inventory stock movements.

### Option 2: Separate Independent Modules (`src/modules/inventory/`, `src/modules/assets/`, `src/modules/valuation/`)

- Three distinct top-level modules registered separately in `AppRouter`.
- _Rejected_: Fractures the unified Resources bounded context, clutters the root navigation menu, and complicates cross-subdomain composition in the Valuation dashboard.

### Option 3: Composite Domain Module with Encapsulated Sub-Features (SELECTED)

- Structured under `src/modules/resources/` containing:
  - `inventory/` (Sub-feature with its own `api/`, `components/`, `hooks/`, `routes/`, `schemas/`, `types/`, `index.ts`)
  - `assets/` (Sub-feature with its own `api/`, `components/`, `hooks/`, `routes/`, `schemas/`, `types/`, `index.ts`)
  - `valuation/` (Sub-feature with its own `api/`, `components/`, `hooks/`, `routes/`, `types/`, `index.ts`)
  - `routes/resources.router.tsx` (Central module router registered via `moduleRegistry`)
  - `index.ts` (Root public module barrel contract)

---

## 4. Decision Outcome

**Accepted Option 3**.

### Architectural Constraints & Import Rules:

1. **Public API Gateway Access**: Sibling sub-features (e.g. `valuation`) referencing types or hooks from `inventory` or `assets` MUST import strictly via the sub-feature root index (e.g. `import { InventoryItemVM } from '../inventory'`), never via deep internal paths.
2. **TanStack Query Cache Segregation**: Each sub-feature strictly manages its own query key namespace (`['inventory']`, `['fixed-assets']`, `['valuation']`). Cross-subfeature cache tampering is strictly prohibited.
3. **Single Router Shell**: `resources.router.tsx` owns all child routes beneath `/resources/*`, enforcing route-level `RequirePermission` guards.
