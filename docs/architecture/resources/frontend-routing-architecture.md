# Phase 6: Frontend Routing Architecture & Navigation Specification

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: Route Hierarchy, URL Semantics, Navigation Integration, Parameter Validation & Failure Boundaries  
**Author**: Principal Frontend Architect & React Router Architecture Specialist  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Architecture Baseline**](./frontend-architecture-baseline.md)
- [**Phase 6 Frontend Feature Boundaries**](./frontend-feature-boundaries.md)

---

## 1. Route Hierarchy & URL Taxonomy

The Phase 6 Resources routing tree is anchored beneath the `/resources` URL prefix. It provides clean, semantic, bookmarkable URLs reflecting user workflows without exposing backend persistence implementation details:

```
/resources
├── /resources                           # 1. Landing Redirect (Redirects to /resources/overview)
├── /resources/overview                  # 2. Executive Resource Portfolio Overview & Valuation
│
├── /resources/inventory                 # 3. Consumable Inventory Product Catalog (DataTable)
│   ├── /resources/inventory/new         # 4. Product Registration Page / Modal
│   ├── /resources/inventory/alerts      # 5. Low-Stock & Urgent Reorder Alert Hub
│   └── /resources/inventory/:itemId     # 6. Product Detail, Live Stock & Movement Ledger
│
└── /resources/assets                    # 7. Fixed Asset Equipment Directory (DataTable)
    ├── /resources/assets/new            # 8. Asset Registration Page / Modal
    └── /resources/assets/:assetId       # 9. Asset Lifecycle Detail, History & Maintenance
```

---

## 2. Route Responsibilities & Contract Matrix

| Route Path                     | View / Component          | Workflow & Business Purpose                                                                                                                                                                                                             | Required Permission                                   | Layout Shell |
| :----------------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- | :----------- |
| `/resources`                   | `Navigate to="overview"`  | Landing redirect to primary executive overview.                                                                                                                                                                                         | `inventory.read` \| `assets.read` \| `valuation.read` | `MainLayout` |
| `/resources/overview`          | `ResourceValuationPage`   | Combined portfolio health: Working capital inventory value, Asset carrying value vs historical CAPEX, category allocation pie, and executive summary metric cards.                                                                      | `valuation.read`                                      | `MainLayout` |
| `/resources/inventory`         | `InventoryListPage`       | Paginated product table with URL-synchronized search, category faceted filter, status filter, and quick stock action triggers.                                                                                                          | `inventory.read`                                      | `MainLayout` |
| `/resources/inventory/new`     | `CreateInventoryItemPage` | Standardized `FormLayout` for registering new products, initial stock, unit costs, selling prices, and reorder thresholds.                                                                                                              | `inventory.write`                                     | `MainLayout` |
| `/resources/inventory/alerts`  | `LowStockAlertsPage`      | Dedicated view for inventory items at or below reorder threshold with rapid purchase restock CTAs.                                                                                                                                      | `inventory.read`                                      | `MainLayout` |
| `/resources/inventory/:itemId` | `InventoryDetailPage`     | Single-product overview: real-time stock gauge, price metrics, action buttons (Purchase, Sale, Consumption, Scrap, Adjust), and full `StockMovement` audit ledger table.                                                                | `inventory.read`                                      | `MainLayout` |
| `/resources/assets`            | `FixedAssetsListPage`     | Paginated asset directory with facility, room, condition, and lifecycle status filters, and "Register Asset" action.                                                                                                                    | `assets.read`                                         | `MainLayout` |
| `/resources/assets/new`        | `CreateFixedAssetPage`    | Multi-section form for asset onboarding: asset tag, category, location, purchase date, CAPEX value, and serial tracking.                                                                                                                | `assets.write`                                        | `MainLayout` |
| `/resources/assets/:assetId`   | `FixedAssetDetailPage`    | Complete asset workspace: physical location breadcrumb, lifecycle status badge, condition pill, quick actions (Transfer, Change Status, Log Maintenance, Revalue), chronological history stream, and maintenance service records table. | `assets.read`                                         | `MainLayout` |

---

## 3. Router Shell Architecture (`resources.router.tsx`)

Following Kinergy router conventions, the central router exports a declarative sub-router component and registers its route contract via `moduleRegistry`:

```tsx
// apps/web/src/modules/resources/routes/resources.router.tsx
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { RequirePermission } from '../../../app/routes/permission-guard';

import { InventorySubRouter } from '../inventory/routes/inventory.router';
import { FixedAssetsSubRouter } from '../assets/routes/assets.router';
import { ResourceValuationPage } from '../valuation/routes/resource-valuation-page';

export const ResourcesSubRouter: React.FC = () => (
  <Routes>
    <Route path="/" element={<Navigate to="overview" replace />} />
    <Route
      path="overview"
      element={
        <RequirePermission permission="valuation.read">
          <ResourceValuationPage />
        </RequirePermission>
      }
    />
    <Route path="inventory/*" element={<InventorySubRouter />} />
    <Route path="assets/*" element={<FixedAssetsSubRouter />} />
    <Route path="*" element={<NotFoundView message="Resource view not found." />} />
  </Routes>
);

// Module Route Registration
moduleRegistry.register({
  id: 'resources',
  prefix: '/resources',
  title: 'Resources & Asset Management',
  isProtected: true,
  requiredPermissions: ['inventory.read', 'assets.read', 'valuation.read'],
  component: ResourcesSubRouter,
});
```

---

## 4. Navigation Architecture & Shell Placement

### Core Navigation Configuration (`apps/web/src/app/navigation/navigation.config.ts`)

The Resources subsystem is integrated into the primary sidebar navigation under the `core` business operational section:

```typescript
{
  id: 'resources',
  label: 'Resources & Assets',
  path: '/resources',
  icon: Boxes, // Lucide React icon
  order: 25,
  section: 'core',
  requiredPermissions: ['inventory.read', 'assets.read', 'valuation.read'],
}
```

### In-Module Navigation Bar (Sub-Navigation Tabs)

At the top of all `/resources/*` pages, a standardized tab bar provides instant switching between sub-features:

- **Overview** (`/resources/overview`) — Gated by `valuation.read`.
- **Consumable Inventory** (`/resources/inventory`) — Gated by `inventory.read`.
- **Fixed Assets** (`/resources/assets`) — Gated by `assets.read`.

---

## 5. Permission-Aware Routing & Progressive Disclosure

1. **Top-Level Route Boundary**: `isProtected: true` ensures unauthenticated visitors are redirected to `/auth/login?redirect=/resources/...`.
2. **Sub-Route Gating**:
   - Accessing `/resources/inventory/*` requires `inventory.read`.
   - Accessing `/resources/assets/*` requires `assets.read`.
   - Accessing `/resources/overview` requires `valuation.read`.
3. **Unauthorized Handling**: If an authenticated user lacks the required permission, `RequirePermission` renders `ForbiddenView` (HTTP 403 equivalent) with a descriptive message and "Return to Overview" CTA.
4. **Action Mutation Gating**: Create (`/new`), edit, and state mutation buttons are conditionally rendered or disabled via `useAuth().hasPermission('inventory.write')` / `hasPermission('assets.write')`.

---

## 6. Route Parameter & URL Validation Rules

### Parameter Rules

- **`:itemId`**: String representing unique Inventory Product UUID.
- **`:assetId`**: String representing unique Fixed Asset UUID.

### Parameter Validation & Error Boundaries

- **UUID Format Guard**: Detail page hooks validate the identifier before executing TanStack queries (`enabled: Boolean(itemId && isValidUuid(itemId))`).
- **Malformed Identifier**: If an identifier is non-UUID or invalid, the detail view immediately renders `NotFoundView` with "Invalid resource identifier format".
- **404 Resource Not Found**: If the server returns a `NotFoundError` (`404`), the detail view catches the error and renders `CrudStateView` in its Error state with a distinct "Resource not found" illustration and "Back to Directory" button.

---

## 7. Modal vs. Dedicated Page Conventions

In alignment with Track C Form and DataTable standards:

- **Major Entity Creation** (`/resources/inventory/new`, `/resources/assets/new`): Dedicated full-page route with `FormLayout` and `useDirtyDialogGuard`.
- **Operational Transactions** (Purchase, Sale, Consumption, Scrap, Adjust, Transfer, Log Maintenance, Revalue): Contextual **Modal Dialogs** triggered directly from the List or Detail view, preserving the user's active table/detail context without jarring page transitions.

---

## 8. Future Route Extension Rules

When adding new resource sub-domains in future phases (e.g., Equipment Booking, Consignment Inventory, Vendor Catalog Sync):

1. Mount sub-routers beneath `/resources/<new-subdomain>/*`.
2. Register distinct permission codes in Phase 1 identity configuration.
3. Add a corresponding tab entry to the in-module sub-navigation header.
4. Never introduce top-level root paths outside `/resources/*` without explicit ARB approval.
