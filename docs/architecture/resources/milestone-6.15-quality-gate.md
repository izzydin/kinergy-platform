# Milestone 6.15: Phase 6 Frontend Hardening, Accessibility & UX Quality Gate Sign-Off

**Milestone**: Phase 6.15 — Frontend Hardening, Interaction Standards & Accessibility Verification  
**Bounded Context**: `Resources Management`  
**Sub-Domains**: `Consumable Inventory`, `Fixed Assets`, `Executive Resource Overview`  
**Review Date**: September 10, 2026  
**Reviewers**:

- Principal Enterprise Architect
- Principal Frontend Architect
- Senior Interaction Engineer
- Senior Accessibility (WCAG) Specialist
- Senior Test & QA Governance Engineer
- Kinergy Architecture Review Board (ARB)

**Decision**: **APPROVED — PHASE 6 FRONTEND READY FOR PRODUCTION DEPLOYMENT**

---

## 1. Executive Summary

Milestone 6.15 delivers the final quality hardening, accessibility compliance, interaction engineering standards, and production sign-off for the complete **Phase 6: Resources Management** frontend (`apps/web/src/modules/resources/`).

Building upon the domain models, application orchestrations, and API endpoints delivered in Milestones 6.0 through 6.14, Milestone 6.15 ensures that the end-user experience is coherent, resilient, accessible, and aligned with Kinergy enterprise UI conventions:

- **100% Screen State Coverage**: Every screen explicitly implements the 4-State UI Matrix (`LOADING`, `EMPTY`, `ERROR`, `POPULATED`).
- **Safe-by-Default Modal Dialogs**: Destructive actions direct initial focus to safe Cancel buttons, Escape dismissal is locked during active mutations, and focus deterministically returns upon closure.
- **Pessimistic Data Integrity**: Hazardous physical stock operations and capital equipment retirements enforce pessimistic execution, preventing client-side state divergence.
- **Deep-Linkable Table Architecture**: Browser URL is the single authoritative source of truth for search, category, status, condition, pagination, and sorting across all ledgers.
- **Dual-Layer Authorization**: Clear architectural boundary between frontend UX hiding/disabling and backend NestJS `PermissionGuard` security enforcement.
- **100% Automated Test Pass Rate**: Verified via uncached test runs across all 122 frontend test suites (**1,205 passing tests**) and full monorepo build validation.

---

## 2. Mandatory Screen States Matrix

Every view within Phase 6 was inspected, hardened, and verified against the 4 fundamental UI states:

| Screen / View                                                                                                                                      | `LOADING`                                                   | `EMPTY` (or business-safe zero state)                   | `ERROR` (with retry & recovery)                                                        | `POPULATED`                                                                          |
| :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **[ResourceOverviewPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/overview/routes/resource-overview-page.tsx)**         | Skeleton layout with `role="status"` and `aria-busy="true"` | Dedicated zero-estate banner with quick onboarding CTAs | Alert card with technical error message and "Try Again" trigger                        | Full executive balance sheet dashboard with non-destructive `Refresh`                |
| **[InventoryOverviewPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/inventory-overview-page.tsx)**      | Card skeletons matching KPI layout                          | Clean empty state when no items require reorder         | Error state with refetch trigger                                                       | Fully hydrated cards + top-level non-destructive cache-invalidation `Refresh`        |
| **[LowStockPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/low-stock-page.tsx)**                        | Table skeleton rows with accessible busy state              | "Inventory Well-Stocked" zero-deficit confirmation view | Card alert with contextual error message and retry action                              | Deficit table with quick reorder mutations and top-level Refresh control             |
| **[AssetOverviewPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/assets/routes/asset-overview-page.tsx)**                 | Card skeletons matching layout                              | "No Assets In Fleet" empty state                        | Error alert card with refetch                                                          | Operational asset telemetry + top-level non-destructive cache-invalidation `Refresh` |
| **[InventoryDetailPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/inventory/routes/inventory-detail-page.tsx)**          | Full page skeleton                                          | 404 handled                                             | "Product Not Found" card with "Return to Catalog" and retry actions                    | Full product detail cockpit with operational dialog triggers                         |
| **[AssetDetailPage](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/assets/routes/asset-detail-page.tsx)**                     | Full page skeleton                                          | 404 handled                                             | "Asset Not Found" card with "View All Assets" and retry actions                        | Full asset lifecycle cockpit, decommissioned guard banner, and toolbar               |
| **[AssetHistoryPreview](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/assets/components/asset-history-preview.tsx)**         | Spinner feedback                                            | "No lifecycle events recorded" (clean zero state)       | Explicit `role="alert"` error banner with "Retry" action (prevents false empty states) | Chronological event list preview                                                     |
| **[AssetMaintenancePreview](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/assets/components/asset-maintenance-preview.tsx)** | Spinner feedback                                            | "No maintenance records logged" (clean zero state)      | Explicit `role="alert"` error banner with "Retry" action (prevents false empty states) | Work order history preview                                                           |

---

## 3. Mutation Architecture & TanStack Query Synchronization

Governed by **[ADR 0072](../../../adr/0072-frontend-optimistic-ux-architecture-and-decision-policy.md)** and **[ADR-0103](./adr/0103-frontend-modal-interaction-and-safe-focus-policy.md)**:

### A. Pessimistic Default for Hazardous Operations

- Physical stock movements (`receiveStock`, `sellStock`, `consumeStock`, `scrapStock`, `adjustStock`) and asset lifecycle transitions (`retireAsset`, `transferLocation`, `recordMaintenance`) are strictly **pessimistic**.
- Mutations display immediate in-flight visual feedback (disabled submit button, `Loader2` spinner, status text) while awaiting backend database transaction resolution.
- Optimistic updates are strictly disallowed for operations with physical inventory, balance sheet, or irreversible lifecycle consequences.

### B. Precision Cache Invalidation

- Successful mutations invalidate only affected cache keys:
  - Local record: `inventoryQueryKeys.detail(id)`, `inventoryQueryKeys.stock(id)`, `assetsQueryKeys.detail(id)`.
  - Sub-ledgers: `inventoryQueryKeys.movementsLists(id)`, `assetsQueryKeys.historyLists(id)`, `assetsQueryKeys.maintenanceLists(id)`.
  - Catalog collections: `inventoryQueryKeys.lists()`, `assetsQueryKeys.lists()`, `inventoryQueryKeys.lowStock()`.
  - Cross-domain executive dashboard: `resourceOverviewQueryKeys.all` and valuation summaries (`['resources', 'valuation']`).

### C. Recoverable Error Preservation

- When a server mutation fails, form inputs and dirty state are preserved inside the open modal dialog.
- An inline alert displays the server error message so the user can correct validation failures or retry without re-entering data.

---

## 4. Form Architecture & Dirty State Navigation Protection

1. **Schema Validation**: All forms (`ProductCreateForm`, `ProductEditForm`, `AssetCreateForm`, `AssetEditForm`) use strict Zod schemas with `zodResolver`.
2. **Dirty Navigation Guard**: Forms integrate `useDirtyGuard` (`ConfirmDiscardDialog`). Navigating away or closing a dirty modal form via `Escape` or backdrop click intercepts dismissal and prompts confirmation, preventing accidental loss of uncommitted data.
3. **Double-Submit Lock**: Submit buttons are disabled immediately upon form submission (`isSubmitting === true`), suppressing rapid duplicate clicks.

---

## 5. Table Architecture & Authoritative URL State

Governed by **[ADR 0071](../../../adr/0071-frontend-crud-experience-lifecycle-and-composition-contract.md)**:

1. **Authoritative URL State**: All list views (`InventoryListPage`, `AssetsListPage`, `InventoryMovementsPage`, `AssetHistoryPage`, `AssetMaintenancePage`) synchronize search terms (`q`), categorical filters (`category`, `status`, `condition`, `movementType`), pagination (`page`, `limit`), and sorting (`sort`) bidirectionally with `useSearchParams`.
2. **Browser History**: Full support for native browser Back and Forward navigation with state preservation.
3. **Reset Filters**: Clear reset triggers restore default catalog queries with a single click.

---

## 6. Non-Destructive Refresh Controls

- Added top-level `Refresh` buttons with animated spinner icons (`<RefreshCw />`) to:
  - `InventoryOverviewPage` (`data-testid="refresh-inventory-overview-btn"`): invalidates `inventoryQueryKeys.all` and valuation queries.
  - `LowStockPage` (`data-testid="refresh-low-stock-btn"`): triggers `refetch()` and provides `isFetching` disabled animation.
  - `AssetOverviewPage` (`data-testid="refresh-assets-overview-btn"`): invalidates `assetsQueryKeys.all` and valuation cache.
  - `ResourceOverviewPage`: triggers overview refetch.
- Refresh operations are non-destructive: active filters, pagination, and scroll positions are preserved.

---

## 7. Permission Architecture: Frontend UX vs Backend Security Boundary

### A. Frontend Responsibility (Affordance & Progressive Disclosure)

- Frontend guards (`HasPermission`, `useAuth`) serve strictly as **user experience affordances**:
  - Hiding or disabling action buttons (`inventory.write`, `assets.write`) to prevent user frustration from attempting unauthorized actions.
  - Displaying informative access-denied views (`data-testid="resource-overview-forbidden"`) for restricted dashboards.
  - Obfuscating sensitive balance sheet carrying values unless the user holds `billing.read` or `valuation.read`.

### B. Backend Responsibility (Authoritative Security Enforcement)

- The backend NestJS API (`ResourceOverviewController`, `InventoryController`, `FixedAssetsController`) remains the **sole authoritative security boundary**:
  - Every endpoint enforces `@RequirePermissions(...)` and `@UseGuards(JwtAuthGuard, PermissionGuard)`.
  - Frontend bypass attempts (e.g. manual fetch calls) are rejected with HTTP 401 Unauthorized or HTTP 403 Forbidden.

---

## 8. Accessibility & Interaction Engineering Hardening

1. **Safe-by-Default Focus Policy**: Destructive dialogs (`RetireAssetDialog`, `ScrapStockDialog`, `ArchiveProductDialog`, `ConfirmDiscardDialog`) automatically direct initial focus to the **Cancel** button (`cancelBtnRef`), preventing accidental destruction on `Enter`.
2. **Operative Input Focus**: Modal forms auto-focus the primary operational input control (e.g. quantity, location, justification).
3. **Focus Restoration**: Dialogs implement `onCloseAutoFocus`, returning keyboard focus to the triggering element upon dismissal.
4. **Escape Key Dismissal Suppression**: `Escape` key dismissal is suppressed during active in-flight mutations.
5. **Non-Color-Alone Destructive Semantics**: Destructive actions reinforce consequence with invariant text, alert iconography, and clear descriptions rather than relying solely on red color.
6. **Screen Reader Semantics**: Skeletons use `role="status"` and `aria-busy="true"`. Error banners use `role="alert"`. Dialogs declare accessible titles and descriptions.

---

## 9. Automated Verification Evidence

### A. Phase 6 Automated Test Suites

| Test Suite                         | File                                           | Tests Passing | Focus Area                                                    |
| :--------------------------------- | :--------------------------------------------- | :------------ | :------------------------------------------------------------ |
| **Screen States Hardening**        | `phase6-screen-states-hardening.spec.tsx`      | 16            | 4-State UI Matrix, refresh controls, preview error recovery   |
| **Dialog Interactions**            | `phase6-dialog-interactions.spec.tsx`          | 23            | Safe focus policy, Escape suppression, focus restoration      |
| **Permission-Aware UX**            | `phase6-permission-aware-ux.spec.tsx`          | 16            | Granular action visibility, route protection, valuation gates |
| **Accessibility Compliance**       | `phase6-accessibility.spec.tsx`                | 18            | WCAG 2.1 AA keyboard navigation, ARIA landmarks, roles        |
| **Predictable Refresh**            | `phase6-predictable-refresh-behavior.spec.tsx` | 12            | Non-destructive refresh, cache invalidation, loading spinners |
| **Inventory Foundations & Tables** | `inventory-*.spec.tsx` (14 suites)             | 148           | URL state, forms, mutations, movements, stock operations      |
| **Asset Foundations & Workflows**  | `asset-*.spec.tsx` (16 suites)                 | 128           | Lifecycle workflows, maintenance, transfer, valuation         |
| **Resource Overview Dashboard**    | `resource-overview-*.spec.tsx` (3 suites)      | 20            | Dual-domain synthesis, routing, integer arithmetic            |
| **Total Phase 6 Test Coverage**    | **38 Test Suites**                             | **381 Tests** | **100% Passing**                                              |

### B. Full Monorepo Validation Results

```bash
> pnpm validate
✔ format:check: All matched files use Prettier code style!
✔ lint: All 10 projects pass linting without errors or warnings
✔ typecheck: tsc --noEmit passed with 0 errors
✔ test: 122 test suites passed, 1,205 tests passed across all packages
✔ build: 10 projects compiled and built production bundles successfully
```

---

## 10. Architectural Sign-Off

The **Kinergy Architecture Review Board (ARB)** hereby issues formal sign-off for **Milestone 6.15: Phase 6 Frontend Hardening, Accessibility & UX Quality Gate**.

The Resources Management frontend (`Consumable Inventory`, `Fixed Assets`, and `Resource Overview`) is certified as production-ready, fully accessible, and resilient against all interaction and concurrency failure modes.
