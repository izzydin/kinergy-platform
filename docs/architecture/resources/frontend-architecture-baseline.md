# Phase 6: Frontend Architecture Baseline & Resource Module Blueprint

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: Web Application Architecture, Server-State Strategy & Design System Standards  
**Author**: Principal Frontend Architect, Senior React Engineer & Kinergy ARB Member  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0095: Three-Layer Concurrency Defense Strategy for Stock Mutations**](./adr/0095-three-layer-concurrency-defense-for-inventory-mutations.md)
- [**ADR-0097: Resource Valuation Policy & Carrying Value Rules**](./adr/0097-resource-valuation-policy-and-carrying-value.md)
- [**Track A / B / C Frontend Framework Specifications**](../../frontend/dashboard_auth_integration_contract.md)

---

## 1. Existing Frontend Architecture Overview

The Kinergy web client (`apps/web`) is built with React 18, Vite, TypeScript, React Router v6, TanStack Query v5, React Hook Form, Zod, and the `@kinergy-platform/ui` design system.

Architecture is strictly modularized by business capabilities (`src/modules/*`) supported by standardized platform infrastructure (`src/app/*`) and cross-cutting reusable primitives (`src/shared/*`):

```
apps/web/src/
├── app/                  # Application bootstrap, navigation, routing shell & global providers
│   ├── config/           # Environment config (API URL, feature flags)
│   ├── layouts/          # MainLayout, DashboardLayout, AuthLayout shells
│   ├── navigation/       # NavigationRegistry, defaultNavigationItems, NavigationProvider
│   ├── providers/        # QueryProvider, AuthProvider, ThemeProvider, ToastProvider
│   └── routes/           # Central AppRouter, ModuleRegistry, PermissionGuard, LazyLoaders
├── modules/              # Feature domain modules (Auth, Identity, Attendance, Gym, Kinesiology)
│   └── <domain>/         # Self-contained domain module
│       ├── api/          # HTTP client wrappers, TanStack query key factories, custom hooks
│       ├── components/   # Domain-specific UI components & modals
│       ├── hooks/        # UI interaction & URL state hooks
│       ├── routes/       # Page components mapped to module sub-router
│       ├── schemas/      # Zod validation schemas for forms and mutations
│       ├── types/        # TypeScript DTOs, filter params, view models
│       ├── __tests__/    # Vitest / React Testing Library specs
│       └── index.ts      # Public module barrel export
└── shared/               # Reusable platform frameworks
    ├── api/              # HttpClient, AppError normalization, mutation pipeline
    ├── auth/             # Auth token storage, transport, redirect utilities
    ├── crud/             # CrudListLayout, CrudFormLayout, 4-state view loaders
    ├── forms/            # FormLayout, FormSection, FormFieldGroup, useDirtyDialogGuard
    ├── query/            # QueryClient factory, optimistic mutation helpers
    └── table/            # DataTable, useTableUrlState, pagination, faceted filters
```

---

## 2. Existing Feature-Module Conventions

Every domain module adheres to a standard 6-folder anatomy:

1. **`api/`**: Co-located HTTP transport functions, query key factories, and query/mutation hooks.
2. **`components/`**: Reusable feature presentation components, status badges, and action modals.
3. **`hooks/`**: Local view state controllers and composite domain hooks.
4. **`routes/`**: Top-level page views (e.g. `*ListPage`, `*DetailPage`, `*WorkspacePage`).
5. **`schemas/`**: Zod validation schemas governing user input forms and mutation payloads.
6. **`types/`**: Frontend TypeScript contracts, server response DTOs, and URL filter interfaces.
7. **`index.ts`**: Explicit public barrel export defining the module's public contract.

---

## 3. Existing Route & Navigation Conventions

### Route Registration (`apps/web/src/app/routes/`)

- Modules export a sub-router component (e.g., `ResourcesSubRouter`).
- Modules register themselves via `moduleRegistry.register({ id, prefix, title, isProtected, requiredPermissions, component })`.
- Routes are wrapped in `MainLayout` or `DashboardLayout` inside `AppRouter`.

### Navigation Shell (`apps/web/src/app/navigation/`)

- Main menu items are defined in `navigation.config.ts` or dynamically registered via `navigationRegistry`.
- Navigation items declare `id`, `label`, `path`, `icon` (Lucide React), `section` (`overview` | `core` | `admin`), and `requiredPermissions`.

---

## 4. Existing Server-State Conventions (TanStack Query v5)

Server state governance follows four non-negotiable rules:

1. **Zero Server State in Context/State**: Server data is exclusively cached and managed by TanStack Query (`apps/web/src/shared/query/`).
2. **Standard Query Cache Timings**:
   - `staleTime`: 5 minutes (`1000 * 60 * 5`) by default.
   - `gcTime`: 10 minutes (`1000 * 60 * 10`).
   - `refetchOnWindowFocus`: `false`.
   - `refetchOnReconnect`: `true`.
3. **Hierarchical Query Key Factories**: Defined via `createQueryKeyFactory('domain')`:
   ```typescript
   export const inventoryQueryKeys = {
     all: ['inventory'] as const,
     lists: () => [...inventoryQueryKeys.all, 'list'] as const,
     list: (filters?: InventoryFilters) => [...inventoryQueryKeys.lists(), filters] as const,
     details: () => [...inventoryQueryKeys.all, 'detail'] as const,
     detail: (id: string) => [...inventoryQueryKeys.details(), id] as const,
     movements: (id: string, filters?: MovementFilters) =>
       [...inventoryQueryKeys.detail(id), 'movements', filters] as const,
     lowStock: () => [...inventoryQueryKeys.all, 'low-stock'] as const,
   };
   ```

---

## 5. Existing Mutation & Optimistic Update Conventions

Mutations use `useStandardMutation` or custom `useMutation` hooks with the 3-phase lifecycle:

1. **`onMutate`**:
   - Cancels outgoing queries using `queryClient.cancelQueries`.
   - Snapshots previous cache and applies optimistic updates via `executeOptimisticUpdate`.
2. **`onError`**:
   - Automatically rolls back cache via `rollbackOptimisticUpdate`.
   - Displays toast error notification with normalized `AppError` message.
3. **`onSettled`**:
   - Invalidates targeted query keys to ensure final synchronization with server truth.

---

## 6. Existing Frontend Type & DTO Conventions

1. **Strict Immutability**: All DTO interfaces use `readonly` properties.
2. **Enum Fidelity**: Frontend uses the same domain enums exported from `@kinergy-platform/core` (`InventoryCategory`, `InventoryItemStatus`, `StockMovementType`, `AssetStatus`, `AssetCondition`).
3. **Money Types**: Currency and monetary figures use `{ amount: number; currency: string }` or normalized decimal numbers matching API payloads.

---

## 7. Existing URL Search Parameter Conventions (`shared/table`)

Data tables synchronize pagination, sorting, and filtering bidirectionally with URL query parameters using `useTableUrlState`:

- `page`: 1-based page index (e.g. `?page=1`).
- `pageSize`: Number of items per page (default: `10`, `25`, `50`).
- `sortBy`: Field name to sort by (e.g. `?sortBy=name`).
- `sortOrder`: Direction (`asc` | `desc`).
- `search`: Debounced text query (e.g. `?search=whey`).
- `filters`: JSON or flat parameter strings (e.g. `?category=CLINICAL_SUPPLIES&status=ACTIVE`).

---

## 8. Existing Permission Architecture (`shared/auth`)

Authorization is verified progressively:

1. **Route Level**: `RequirePermission` and `PermissionGuard` redirect unauthorized users to `/auth/unauthorized` (`ForbiddenView`).
2. **UI Component Level**: `useAuth().hasPermission(permission)` controls conditional rendering of action buttons, form inputs, and edit dialogs.
3. **Resource Permissions**:
   - `inventory.read`: Product catalogs, stock levels, movements, low-stock alerts.
   - `inventory.write`: Creating products, stock purchases, sales, consumptions, scrap, adjustments.
   - `assets.read`: Fixed asset list, details, location, maintenance history, audit history.
   - `assets.write`: Asset registration, transfers, maintenance logs, condition and status changes.
   - `valuation.read`: Total inventory working capital, asset carrying value, combined valuation dashboard.

---

## 9. Existing UX State Standards (4-State Pattern)

All list and detail views handle four mandatory UX states using `CrudStateView`:

1. **Loading State**: `Skeleton` / `DataTableSkeleton` reflecting the layout structure.
2. **Empty State**: `CrudEmpty` / `DataTableEmpty` with contextual illustration, description, and primary CTA.
3. **Error State**: `CrudError` / `DataTableError` with clear error description and "Retry" button.
4. **Success / Content State**: Full populated interactive table or detail workspace.

---

## 10. Existing Form Standards (`shared/forms`)

Forms adhere to standardized structural components:

- **`FormLayout`**: Single-column or two-column responsive form wrapper.
- **`FormSection`**: Semantic visual grouping with title, description, and divider.
- **`FormFieldGroup`**: Responsive grid alignment for 1, 2, or 3-column field groupings.
- **`FormActions`**: Standardized footer with "Cancel" and "Save Changes" (`FormSubmitButton` with loading spinner).
- **`useDirtyDialogGuard`**: Intercepts uncommitted navigation when form is dirty.
- **Form Libraries**: React Hook Form with `@hookform/resolvers/zod` and Zod schemas.

---

## 11. Existing Notification Standards

- Ephemeral user feedback is dispatched via `toast.success()`, `toast.error()`, and `toast.warning()`.
- Standard mutation pipeline (`useStandardMutation`) handles success and error toasts automatically based on action semantics.

---

## 12. Phase 6 Backend API Surface Mapping

The completed Phase 6 backend API contracts provide the following endpoints for the frontend module:

### A. Consumable Inventory Endpoints (`/api/v1/resources/inventory`)

- `GET /resources/inventory` (paginated list with search, category, status filters)
- `GET /resources/inventory/:id` (full product details)
- `GET /resources/inventory/:id/stock` (real-time stock level)
- `GET /resources/inventory/:id/movements` (paginated stock movement ledger)
- `GET /resources/inventory/alerts/low-stock` (low stock alert items)
- `POST /resources/inventory` (create new product)
- `PUT /resources/inventory/:id` (update product details)
- `POST /resources/inventory/:id/archive` (archive product)
- `POST /resources/inventory/:id/activate` (reactivate product)
- `POST /resources/inventory/:id/deactivate` (deactivate product)
- `POST /resources/inventory/:id/purchase` (record purchase receipt)
- `POST /resources/inventory/:id/sale` (record retail sale)
- `POST /resources/inventory/:id/consumption` (record clinical consumption)
- `POST /resources/inventory/:id/scrap` (record scrap / write-off)
- `POST /resources/inventory/:id/adjust` (record audit adjustment)

### B. Fixed Asset Endpoints (`/api/v1/resources/assets`)

- `GET /resources/assets` (paginated asset list with status, condition, facility filters)
- `GET /resources/assets/:id` (full asset details)
- `GET /resources/assets/tag/:tag` (lookup asset by barcode / RFID tag)
- `GET /resources/assets/:id/history` (chronological lifecycle audit trail)
- `GET /resources/assets/:id/maintenance` (maintenance service history)
- `GET /resources/assets/:id/valuation` (asset fair market value & book value)
- `POST /resources/assets` (register new fixed asset)
- `PUT /resources/assets/:id` (update asset metadata)
- `POST /resources/assets/:id/transfer` (relocate / transfer asset location)
- `POST /resources/assets/:id/status` (execute lifecycle status transition)
- `POST /resources/assets/:id/condition` (update physical condition rating)
- `POST /resources/assets/:id/maintenance` (log maintenance service record)
- `POST /resources/assets/:id/valuation` (revalue estimated carrying value)

### C. Resource Valuation Endpoints (`/api/v1/resources/valuation`)

- `GET /resources/valuation/inventory` (working capital inventory value by category)
- `GET /resources/valuation/assets` (asset carrying value vs CAPEX by status)
- `GET /resources/valuation/combined` (total combined resource valuation portfolio)

---

## 13. Phase 6 Frontend Architectural Blueprint

The Phase 6 frontend implementation will be structured under `apps/web/src/modules/resources/`:

```
apps/web/src/modules/resources/
├── api/
│   ├── inventory-api.ts              # HTTP client methods for inventory
│   ├── fixed-assets-api.ts           # HTTP client methods for fixed assets
│   ├── valuation-api.ts              # HTTP client methods for valuation
│   ├── query-keys.ts                 # Central TanStack query key factories
│   ├── use-inventory-queries.ts      # Query hooks for inventory
│   ├── use-inventory-mutations.ts    # Mutation hooks for inventory operations
│   ├── use-fixed-asset-queries.ts    # Query hooks for fixed assets
│   ├── use-fixed-asset-mutations.ts  # Mutation hooks for asset operations
│   ├── use-valuation-queries.ts      # Query hooks for valuation dashboards
│   └── index.ts
├── components/
│   ├── inventory/                    # Stock badges, movement ledger table, stock action modals
│   ├── assets/                       # Asset status badges, location badges, maintenance modals
│   ├── valuation/                    # Valuation summary metric cards, portfolio breakdown charts
│   └── index.ts
├── hooks/
│   ├── use-inventory-filters.ts      # URL search params hook for inventory tables
│   ├── use-asset-filters.ts          # URL search params hook for asset tables
│   └── index.ts
├── routes/
│   ├── inventory-list-page.tsx       # Paginated product catalog table page
│   ├── inventory-detail-page.tsx     # Single product overview, stock ledger & quick actions
│   ├── fixed-assets-list-page.tsx    # Paginated fixed asset directory page
│   ├── fixed-asset-detail-page.tsx   # Asset lifecycle view, history timeline & maintenance
│   ├── resource-valuation-page.tsx   # Financial portfolio valuation overview
│   ├── resources-sub-router.tsx      # Sub-router mapping module views to routes
│   └── index.ts
├── schemas/
│   ├── inventory.schema.ts           # Zod schemas for create/update/stock operations
│   ├── fixed-asset.schema.ts         # Zod schemas for asset creation, transfer, maintenance
│   └── index.ts
├── types/
│   ├── inventory.types.ts            # DTOs, stock operations, movement models
│   ├── fixed-asset.types.ts          # DTOs, asset transfer, maintenance, history models
│   ├── valuation.types.ts            # Valuation breakdown models
│   └── index.ts
├── __tests__/                        # Unit, integration and UX security tests
└── index.ts                          # Public module barrel export
```

---

## 14. Patterns Phase 6 Must Reuse

1. **`moduleRegistry.register`**: For zero-coupling module registration into the router.
2. **`useTableUrlState`**: For standardizing DataTable pagination, sorting, search, and URL filters.
3. **`CrudStateView` & `CrudListLayout`**: For unified 4-state view rendering.
4. **`FormLayout` & `useDirtyDialogGuard`**: For consistent form authoring and unsaved changes protection.
5. **`useAuth().hasPermission`**: For strict role-based progressive disclosure.
6. **`useStandardMutation`**: For automated optimistic updates, rollback, cache invalidation, and toasts.

---

## 15. Patterns Phase 6 Must NOT Introduce

- ❌ **No global Redux or Zustand state for server data**: Use TanStack Query exclusively.
- ❌ **No ad-hoc unstyled HTML tables**: Use `@kinergy-platform/ui` and `shared/table` primitives.
- ❌ **No direct cross-module query key invalidation**: Keep cache boundaries localized.
- ❌ **No client-side floating-point financial arithmetic**: Respect integer-cents backend monetary precision decisions.
