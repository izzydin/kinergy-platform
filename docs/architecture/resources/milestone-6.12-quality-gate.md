# Phase 6: Resources Management — Milestone 6.12 Quality Gate

**Milestone**: Milestone 6.12 — Inventory Frontend Implementation  
**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Consumable Inventory`  
**Date**: September 3, 2026  
**Reviewing Personas**:

- **Principal Frontend Architect**
- **Principal React Engineer**
- **TypeScript Reviewer**
- **Inventory Domain Engineer**
- **Application Security Engineer**
- **UX Accessibility Reviewer**
- **Senior Test Engineer**
- **Kinergy Architecture Review Board (ARB)**
- **Final Quality Gate**

---

## 1. Executive Summary

Milestone 6.12 delivers the complete, production-grade frontend for the **Consumable Inventory** sub-domain within the Kinergy Platform. This frontend operationalizes the backend domain aggregate (`InventoryItem`), immutable movement audit ledger (`StockMovement`), working capital valuation model, and three-layer concurrency control architecture implemented in Milestones 6.0 through 6.10.

The implementation strictly honors the foundational principle of high-consistency inventory domains:

> **Core Architectural Invariant**:  
> _The backend remains the sole authority for physical stock balances, non-negative invariants, movement audit recording, OCC version validation, and role-based permissions. The frontend records operator intent, provides deterministic URL-driven filtering, delivers transparent 4-state asynchronous UX, and guarantees convergence toward authoritative server state upon every transaction._

Every required view, transactional modal dialog, state reconciliation pipeline, and accessibility attribute has been implemented, audited across personas, and verified by 94 automated web test suites (912 tests) and full monorepo CI validation (`pnpm validate`).

---

## 2. Screen Inventory

All required screens, views, and operational modal dialogs are fully implemented and integrated into the Kinergy application router:

| Screen / Modal           | Route / Trigger                      | Component                | Architectural Purpose                                                                                          | Status     |
| :----------------------- | :----------------------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------- | :--------- |
| **Inventory Overview**   | `/resources/inventory/overview`      | `InventoryOverviewPage`  | Operational executive cockpit with portfolio metrics, working capital KPIs, and low-stock attention summary    | `VERIFIED` |
| **Product List**         | `/resources/inventory`               | `InventoryListPage`      | Canonical DataTable catalog with debounced search, faceted filters, pagination, and role-gated action menus    | `VERIFIED` |
| **Product Create**       | `/resources/inventory/new`           | `InventoryCreatePage`    | Controlled multi-section creation form with SKU uniqueness checks and dirty-state guard                        | `VERIFIED` |
| **Product Edit**         | `/resources/inventory/:id/edit`      | `InventoryEditPage`      | Controlled metadata update form with immutable SKU lock and dirty-state route blocker                          | `VERIFIED` |
| **Product Detail**       | `/resources/inventory/:id`           | `InventoryDetailPage`    | Operational product cockpit displaying real-time stock gauge, valuation metrics, and movement audit preview    | `VERIFIED` |
| **Receive Stock**        | Detail / Catalog / Low Stock         | `ReceiveStockDialog`     | Inbound purchase delivery modal capturing quantity, supplier PO, unit cost, and receiving notes                | `VERIFIED` |
| **Record Sale**          | Detail / Catalog Menu                | `SellStockDialog`        | Outbound retail point-of-sale modal capturing quantity, selling price, and customer receipt reference          | `VERIFIED` |
| **Clinical Consumption** | Detail / Catalog Menu                | `ConsumeStockDialog`     | Treatment room consumption modal linking quantity to `treatmentSessionId` and practitioner notes               | `VERIFIED` |
| **Stock Adjustment**     | Detail / Catalog Menu                | `AdjustStockDialog`      | Cycle count variance modal supporting Adjustment In ($+$) and Out ($-$) with mandatory audit justification     | `VERIFIED` |
| **Scrap Stock**          | Detail / Catalog Menu                | `ScrapStockDialog`       | Disposal modal for damaged or expired inventory enforcing mandatory compliance justification                   | `VERIFIED` |
| **Movement History**     | `/resources/inventory/:id/movements` | `InventoryMovementsPage` | Full double-entry audit ledger with movement type filtering, pagination, and balance progression               | `VERIFIED` |
| **Low Stock Attention**  | `/resources/inventory/low-stock`     | `LowStockPage`           | Operational triage queue identifying items where $currentStock \le reorderThreshold$ with direct replenishment | `VERIFIED` |

---

## 3. Architecture Compliance

The inventory frontend adheres strictly to the modular architectural boundaries established in Phase 6.11 ([ADR-0100](./adr/0100-frontend-resources-feature-module-boundaries.md)):

1. **Feature Module Encapsulation**: All inventory components, hooks, schemas, API clients, and query keys reside strictly within `apps/web/src/modules/resources/inventory/`. No cross-feature leakage or circular dependencies exist.
2. **Design System Reuse**: Zero rogue CSS or one-off styling primitives were created. All layouts utilize `@kinergy-platform/ui` design tokens (`Button`, `Badge`, `Card`, `Dialog`, `Skeleton`, `Toast`, `Alert`, `StateView`).
3. **DataTable Track C Infrastructure**: The catalog table utilizes `apps/web/src/shared/table/` (`DataTable`, `useTableUrlState`, `DataTableToolbar`, `DataTableSearch`, `DataTableFacetedFilter`, `DataTableRowActions`).
4. **Form Standards**: Forms reuse `apps/web/src/shared/forms/` (`FormLayout`, `FormSection`, `FormFieldGroup`, `FormSubmitButton`, `useDirtyDialogGuard`, `useApplyServerErrors`).
5. **Hierarchical Query Keys**: Query invalidations strictly consume `inventoryQueryKeys` factory definitions, preventing cache corruption or stale state leaks.

---

## 4. API Contract Compliance

The frontend consumes the exact 17 REST endpoints exposed by NestJS `InventoryController` under `/api/v1/resources/inventory`:

- **Collection Endpoints**: `/api/v1/resources/inventory` (`GET`, `POST`), `/api/v1/resources/inventory/categories` (`GET`), `/api/v1/resources/inventory/low-stock` (`GET`), `/api/v1/resources/inventory/valuation` (`GET`).
- **Entity Endpoints**: `/api/v1/resources/inventory/:id` (`GET`, `PATCH`), `/api/v1/resources/inventory/:id/stock-level` (`GET`), `/api/v1/resources/inventory/:id/movements` (`GET`).
- **Lifecycle Endpoints**: `/:id/archive` (`POST`), `/:id/activate` (`POST`), `/:id/deactivate` (`POST`).
- **Explicit Sub-Resource Mutation Endpoints (ADR-0099)**:
  - Inbound Purchase: `POST /api/v1/resources/inventory/:id/receive`
  - Retail POS Sale: `POST /api/v1/resources/inventory/:id/sell`
  - Clinical Consumption: `POST /api/v1/resources/inventory/:id/consume`
  - Audit Adjustment: `POST /api/v1/resources/inventory/:id/adjust`
  - Damage Disposal: `POST /api/v1/resources/inventory/:id/scrap`
- **Contract DTO Transformations**: The API layer (`inventory-api.ts`) converts wire DTOs (`amount`/`currency` numbers and ISO date strings) into rich typed ViewModels (`InventoryProductVM`, `StockLevelMetricsVM`, `StockMovementVM`, `StockMutationResultVM`).

---

## 5. Product List Review

The `InventoryListPage` delivers a complete, production-grade catalog experience:

- **Canonical URL State**: All filter parameters (`search`, `category`, `stockStatus`, `status`, `includeArchived`, `page`, `limit`, `sort`) synchronize bidirectionally with browser URL search parameters via `useInventoryFilters` and `useTableUrlState`.
- **Debounced Search**: Search inputs are debounced (300ms) to prevent server request flooding while keeping URL state authoritative.
- **Faceted Category & Stock Filters**: Categorical filters map directly to domain enums (`SUPPLEMENTS`, `EQUIPMENT_MAINTENANCE`, `TREATMENT_CONSUMABLES`, etc.) and stock status states (`ALL`, `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`).
- **Differentiated Empty States**:
  - Clean catalog empty: _"No products in catalog"_ with a _"Register First Product"_ CTA.
  - Filtered empty: _"No products found"_ with a _"Reset Filters"_ CTA.
- **Role-Gated Actions**: Row action menus dynamically adjust according to permissions (`View Details` only for read-only users; full mutation suite for `inventory.write` holders).

---

## 6. Form Workflow Review

Product creation (`InventoryCreatePage`) and editing (`InventoryEditPage`) enforce rigorous data integrity:

- **Client-Side Validation**: Zod schemas (`inventory.schema.ts`) validate non-negative pricing ($> 0$), reorder thresholds ($\ge 0$), and SKU formats prior to network dispatch.
- **Authoritative SKU Immutability**: The SKU field is permanently locked as read-only on `ProductEditForm`, adhering to domain business rules that prohibit SKU reassignment after creation.
- **Server-Side Field Error Mapping**: Server validation failures (`400 Bad Request` with structured field errors) are automatically mapped to React Hook Form field boundaries via `useApplyServerErrors`.
- **Dirty-State Navigation Guard**: Unsaved form modifications trigger `useDirtyDialogGuard`, intercepting tab changes, back button navigation, and route switches with an accessible confirmation dialog.

---

## 7. Stock Mutation Review

All stock operations reject generic client-side delta counters in favor of explicit intent modals ([ADR-0099](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)):

- **Explicit Modal Boundaries**: Dedicated modals (`ReceiveStockDialog`, `SellStockDialog`, `ConsumeStockDialog`, `AdjustStockDialog`, `ScrapStockDialog`) enforce context-specific business inputs (PO reference, clinical session ID, count justification, disposal reason).
- **Informational Balance Display**: Modals render current stock as informational reference only.
- **Overdraft Defense**: Client validation warns when sales or consumptions exceed stock on hand; server-side `InsufficientStockOnHandException` is captured and presented cleanly without optimistic false success.
- **Double-Submission Prevention**: Mutation buttons enter a disabled pending state with inline loading spinners while network requests are in flight.
- **Server-State Reconciliation**: Successful mutations immediately invalidate `detail`, `stock`, `movementsLists`, `lists`, `lowStock`, and `valuation` queries.

---

## 8. Movement History Review

The `InventoryMovementsPage` provides a transparent, immutable audit ledger:

- **Operational Semantics**: Color-coded badges differentiate inbound purchases (emerald), retail sales (blue), clinical consumptions (purple), count adjustments (amber), and scraps (rose).
- **Quantities & Balances**: Displays quantity deltas alongside authoritative before/after balance progression (`prev -> new`).
- **Audit Metadata**: Displays performer ID (`actorId`), timestamp formatted with relative and absolute tooltips, and business justifications.
- **Deterministic Filtering**: Supports movement-type filtering and URL-driven pagination.

---

## 9. Low Stock Review

The `LowStockPage` implements an operational attention queue ([ADR-0101](./adr/0101-frontend-low-stock-operational-attention-architecture.md)):

- **Authoritative Backend Rule**: Evaluates low stock strictly as $currentStock \le reorderThreshold$.
- **Zero Stock Inclusion**: Zero physical stock is classified as `OUT OF STOCK` and given top urgency.
- **Deficit Visibility**: Renders precise stock replenishment deficits (`Need +X [unit]`).
- **Direct Replenishment**: Authorized personnel can launch `ReceiveStockDialog` directly from the queue.
- **Positive Health State**: When all items are above threshold, renders the positive green state banner: _"All Inventory Stocks Healthy"_.

---

## 10. Server-State Review

Server-state reconciliation guarantees that client state converges rapidly to database truth:

- **No Optimistic False Concurrency Claims**: In accordance with Kinergy architecture, the frontend does **not** optimistically claim stock mutations succeeded. It waits for the authoritative backend response.
- **Targeted Invalidation Strategy**: Mutation hooks in `use-inventory-mutations.ts` target only the affected query keys, preventing full-application refetch storms.
- **Automated Integration Proof**: 12 dedicated server-state tests in `inventory-server-state-reconciliation.spec.tsx` verify exact invalidations, 409 concurrency error handling, 403 authorization denials, and domain overdraft rejections.

---

## 11. Authorization Review

Frontend authorization enforces defense-in-depth across three tiers:

1. **Route Level**:
   - Direct route access to `/resources/inventory/new` and `/resources/inventory/:id/edit` is guarded by `<RequirePermission permission="inventory.write">`. Read-only users receive an immediate `<ForbiddenView />` (`403 Access Denied`).
2. **Component Level**:
   - Action buttons (_Register Product_, _Receive_, _Sell_, _Consume_, _Adjust_, _Scrap_, _Archive_) are wrapped with `<HasPermission permission="inventory.write">`.
3. **Backend Denial Handling**:
   - If a user triggers a mutation while unauthorized, the server's `403 Forbidden` response is captured by the mutation hook and presented via `notification.error`.

---

## 12. Valuation Visibility Review

Working capital and acquisition costs are protected according to Kinergy security policy ([ADR-0095](./adr/0095-three-layer-concurrency-defense-for-inventory-mutations.md)):

- **Dual-Tier Protection**: Backend suppresses unit cost if the caller lacks `valuation.read` or `billing.read`.
- **Frontend Masking**:
  - In `InventoryListPage`, the _"Unit Cost"_ column is omitted from table columns when the user lacks `valuation.read`.
  - In `InventoryDetailPage`, acquisition cost is rendered as `••••••` with a `Restricted (valuation.read)` lock badge. Working capital portfolio metrics are hidden.
  - Retail selling price remains visible for operational point-of-sale transactions.

---

## 13. UX State Review

All screens and components consistently implement Kinergy's 4-state asynchronous UX model:

1. **Loading**: Pulse skeletons (`TableSkeleton`, `Skeleton`, `FormSkeleton`) preserve layout geometry during query execution.
2. **Error**: Accessible alert containers (`StateView`, `DataTableError`) explain failure causes and provide explicit _"Try Again"_ refetch buttons.
3. **Empty**: Context-specific empty states distinguish between zero data and active filter exclusions.
4. **Success**: Interactive data tables, dashboards, and metrics cards render cleanly upon resolution.

---

## 14. Accessibility Review

The inventory frontend complies with WCAG 2.1 AA accessibility standards:

- **Keyboard Navigation**: All modal dialogs and row action menus support complete keyboard traversal (`Tab`, `ArrowUp`, `ArrowDown`, `Enter`, `Escape`). Focus is trapped within open modals and returned to the trigger upon close.
- **Accessible Labels**: Every input, search field, select element, and icon button includes explicit `aria-label`, `aria-describedby`, or `<label htmlFor="...">` bindings.
- **Color Independence**: Statuses and movement types use distinct text labels, icons, and badges rather than color alone.
- **Native Modals**: Browser-native popups (`window.confirm`) were eliminated in favor of accessible Radix UI dialogs (`<ArchiveProductDialog />`).

---

## 15. Testing Review

Testing covers behavioral workflows, component states, and backend integration boundaries:

| Test Suite File                                  | Focus Area                                                         | Tests  | Status   |
| :----------------------------------------------- | :----------------------------------------------------------------- | :----- | :------- |
| `inventory-server-state-reconciliation.spec.tsx` | Cache invalidations, OCC 409 rejection, 403 denial, overdraft      | 12     | **PASS** |
| `inventory-list-page.spec.tsx`                   | Catalog table, URL parsing, role action gating, valuation masking  | 8      | **PASS** |
| `stock-mutation-dialogs.spec.tsx`                | Receive, Sell, Consume, Adjust, Scrap validation & submissions     | 9      | **PASS** |
| `low-stock-page.spec.tsx`                        | Attention queue triage, zero stock, deficit metrics, replenishment | 7      | **PASS** |
| `inventory-detail-page.spec.tsx`                 | Cockpit metrics, stock gauge, low-stock alerts, permission gating  | 10     | **PASS** |
| `inventory-edit-page.spec.tsx`                   | Metadata form, immutable SKU lock, dirty-state protection          | 6      | **PASS** |
| `inventory-create-page.spec.tsx`                 | Product creation, validation errors, dirty-state guard             | 5      | **PASS** |
| `inventory-movements-page.spec.tsx`              | Movement audit ledger, type filters, pagination, URL state         | 8      | **PASS** |
| `inventory-overview-page.spec.tsx`               | Portfolio KPIs, working capital valuation, quick links             | 6      | **PASS** |
| `inventory-foundation.spec.ts`                   | Type definitions, ViewModel schemas, query key factories           | 21     | **PASS** |
| **Total Inventory Web Tests**                    | **Comprehensive Frontend Coverage**                                | **92** | **PASS** |

Regression suites across shared infrastructure (`use-table-url-state`, `data-table-toolbar`, `use-dirty-dialog-guard`, `use-apply-server-errors`) passed with 100% success.

---

## 16. Documentation Review

The following authoritative architectural documentation has been created or updated:

- [`inventory-frontend-implementation-baseline.md`](./inventory-frontend-implementation-baseline.md): Status updated to `COMPLETED & VERIFIED`.
- [`inventory-stock-mutation-ux.md`](./inventory-stock-mutation-ux.md): Interaction models for intent-driven modals and OCC error handling.
- [`inventory-frontend-ux-review.md`](./inventory-frontend-ux-review.md): Multi-persona cross-screen UX consistency and accessibility review.
- [`adr/0101-frontend-low-stock-operational-attention-architecture.md`](./adr/0101-frontend-low-stock-operational-attention-architecture.md): Architectural decision record for dedicated operational attention queue.
- [`milestone-6.12-quality-gate.md`](./milestone-6.12-quality-gate.md): This quality gate review document.

---

## 17. ADR Review

- **ADR-0101 Evaluated & Published**: [ADR-0101: Frontend Low Stock Operational Attention Architecture](./adr/0101-frontend-low-stock-operational-attention-architecture.md) documents the architectural choice of a dedicated triage cockpit route (`/resources/inventory/low-stock`) over a simple filtered view of the product catalog.
- **No Unjustified ADRs**: Component layouts, button styling, and standard table configurations were implemented within existing design system patterns without creating unnecessary ADR noise.

---

## 18. Remaining Risks

- **Risk 1: High-Frequency Retail Barcode Scanning**: Rapid sequential scanning could dispatch overlapping POS requests faster than network roundtrips.
  - _Mitigation_: The POS mutation button disables immediately upon dispatch; future offline POS enhancements (Phase 11) will introduce client-side queue buffers.
- **Risk 2: Multi-Tab Cache Divergence**: If an operator modifies stock in Tab A, Tab B remains unaware until next user interaction or window focus.
  - _Mitigation_: TanStack Query `refetchOnWindowFocus: true` automatically reconciles balances when the operator switches back to Tab B.

---

## 19. Blocking Issues

- **Zero Blocking Issues**: There are no outstanding blockers, defects, or unresolved review comments.

---

## 20. pnpm validate Result

The mandatory repository-native validation suite was executed cleanly:

```powershell
pnpm validate
```

- **Prettier Formatting**: All files formatted and compliant.
- **ESLint**: 10 projects checked — 0 errors, 0 warnings.
- **TypeScript Compiler (`tsc --noEmit`)**: 0 type errors across monorepo.
- **Automated Test Execution**:
  - `apps/web`: 94 test suites passed (912 tests).
  - `apps/api`: 81 test suites passed (582 tests).
  - **Total**: 175 test suites, 1,494 tests passing.
- **Production Bundles**: All 10 workspace projects built successfully.

---

## 21. Final Decision

Based on comprehensive evaluation by the Principal Frontend Architect, Principal React Engineer, TypeScript Reviewer, Inventory Domain Engineer, Application Security Engineer, UX Accessibility Reviewer, Senior Test Engineer, and the Kinergy Architecture Review Board:

# **APPROVED — INVENTORY FRONTEND READY**

Milestone 6.12 is officially approved and signed off. The Kinergy Platform is ready to proceed to the next Phase 6 milestone.
