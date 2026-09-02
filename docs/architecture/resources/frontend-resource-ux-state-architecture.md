# Phase 6: Frontend Resource UX & Asynchronous State Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: 4-State UI UX Contract, Loading Skeletons, Business Error Handling & Empty-State Resilience  
**Author**: Principal UX Engineer, Senior Frontend Engineer & Resilience Architecture Reviewer  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**Phase 6 Frontend Architecture Baseline**](./frontend-architecture-baseline.md)
- [**Phase 6 Frontend Query State Architecture**](./frontend-query-state-architecture.md)

---

## 1. Asynchronous State Philosophy & The 4-State UI Contract

Every data-driven view in the Resources module (`inventory`, `assets`, `valuation`) strictly implements the **Mandatory 4-State UI Contract**:

```
┌────────────────────────────────────────────────────────┐
│ 1. Loading State                                       │
│ Rendered on initial mount or full-page filter fetch.   │
│ Visual: Structural Skeleton layouts (Zero spinners)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Error State                                         │
│ Query failed (Network down, 500, 403 Forbidden).       │
│ Visual: Inline Alert with retry CTA & error details    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Empty State                                         │
│ Resolved 200 OK with 0 records.                        │
│ Visual: Distinct "Zero items" vs "Filtered no results" │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Populated / Success State                           │
│ Resolved with data. Smooth transitions on updates.     │
│ Visual: Interactive DataTable, Metric Cards & Timeline │
└────────────────────────────────────────────────────────┘
```

---

## 2. Loading State Strategy

| Context                                 | Visual Representation                        | Component / Primitive                                | Blocking Behavior                                       |
| :-------------------------------------- | :------------------------------------------- | :--------------------------------------------------- | :------------------------------------------------------ |
| **Catalog Tables** (Inventory / Assets) | Tabular row and column skeleton blocks       | `<DataTableSkeleton columns={6} rows={10} />`        | Non-blocking to global shell; local table area only.    |
| **Entity Detail Pages**                 | Form section and metric card skeletons       | `<Skeleton className="h-32 w-full" />`               | Structural skeleton mirrors final layout.               |
| **Background Refetching**               | Subtle top loading progress bar or indicator | Native TanStack `isFetching && !isLoading` indicator | **Non-blocking**: Active table rows remain interactive. |
| **Modal Form Submissions**              | Button spinner and disabled inputs           | `<FormSubmitButton isSubmitting={isPending} />`      | Disables form inputs to prevent double-submission.      |

---

## 3. Error State Strategy & Classification

```
[Query / Mutation Error Triggered]
                 │
                 ├──► 401 Unauthorized ──► Redirect to `/auth/login?redirect=...`
                 │
                 ├──► 403 Forbidden ──► Render `<ForbiddenView />` or toast denial
                 │
                 ├──► 404 Not Found ──► Render `<NotFoundView />` with Back CTA
                 │
                 ├──► 409 Conflict ──► Auto-rollback snapshot + Invalidate Cache + Toast
                 │
                 ├──► 400 Bad Request ──► Display domain business message in Modal Alert
                 │
                 └──► 500 / Network Down ──► `<DataTableError onRetry={refetch} />`
```

---

## 4. Business Error Representation Matrix

Raw technical stack traces or database constraint violations are never exposed to the user. Normalized, human-friendly business messages are rendered:

| Backend Error Code            | Domain Cause                                                    | Frontend UI Presentation                                                     |
| :---------------------------- | :-------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| `INSUFFICIENT_STOCK`          | Sale or consumption exceeds current stock on hand               | Form Alert: _"Insufficient stock available. Current stock is {qty} {unit}."_ |
| `INVALID_STATE_TRANSITION`    | Attempting forbidden status change (e.g. `SOLD` $\to$ `ACTIVE`) | Modal Alert: _"Asset cannot transition from {from} to {to}."_                |
| `TRANSFER_OCCUPANCY_EXCEEDED` | Target room capacity exceeded                                   | Modal Alert: _"Target room has reached maximum equipment occupancy."_        |
| `NEGATIVE_VALUATION_REJECTED` | Fair market revaluation is less than 0                          | Form Field Error: _"Carrying value must be greater than or equal to $0.00."_ |
| `OPTIMISTIC_LOCK_CONFLICT`    | Resource was modified concurrently by another user              | Toast: _"Record modified concurrently. State refreshed."_                    |

---

## 5. Empty State Taxonomy

The architecture strictly differentiates between a **clean empty collection** and an **overly restrictive search filter**:

### 1. Zero Records Created Yet (Global Empty)

- **Inventory**: _"No inventory items registered yet."_
  - **CTA**: `<Button>Register First Product</Button>` (Gated by `inventory.write`).
- **Fixed Assets**: _"No capital equipment or assets registered yet."_
  - **CTA**: `<Button>Register First Asset</Button>` (Gated by `assets.write`).

### 2. Search / Filter Yielded No Matches (Filtered Empty)

- **Visual**: `<DataTableEmpty title="No matching results found" description="Try adjusting your search terms or clearing active filters." />`
- **Action**: `<Button variant="outline" onClick={resetFilters}>Clear All Filters</Button>`.

### 3. Sub-Resource Empty States

- **Stock Movement Ledger**: _"No stock movements recorded for this item yet."_
- **Asset Maintenance History**: _"No maintenance records logged for this asset."_
- **Low-Stock Alert Hub**: _"All inventory items are currently above reorder thresholds."_ (Positive health state).

---

## 6. Mutation Feedback Ownership & Notification Rules

To prevent toast spam and duplicate alerts:

1. **Mutation Hooks Own Toasts**: Dispatches standard positive feedback via `useNotification().success(message)` upon confirmation.
2. **Form Layouts Own Inline Validation**: Field-level validation errors from React Hook Form + Zod appear directly below inputs.
3. **Modal Dialogs Own Server Business Errors**: Invariant failures (e.g. `INSUFFICIENT_STOCK`) are displayed within the modal body via `<Alert variant="destructive">`, keeping the user in context to fix their input.

---

## 7. Destructive & High-Impact Operation Safeguards

Confirmation dialogs are reserved exclusively for irreversible or high-impact operational changes:

| Operation                              | Safeguard Type                  | Confirmation Text / Requirement                                                                   |
| :------------------------------------- | :------------------------------ | :------------------------------------------------------------------------------------------------ |
| **Archive Product**                    | Confirmation Dialog             | _"Archiving this product will hide it from active sale and consumption workflows. Are you sure?"_ |
| **Audit Stock Adjustment (Shrinkage)** | Required Reason Field           | Form requires non-empty explanation (`min(5)` chars).                                             |
| **Asset Retirement / Disposal**        | Destructive Confirmation Dialog | _"Retiring this asset is permanent and marks it as disposed. Confirm asset retirement?"_          |
| **Asset Revaluation**                  | Confirmation Banner             | _"Updating carrying value will adjust portfolio balance sheet metrics."_                          |

---

## 8. Accessibility & Screen Reader Standards

1. **Non-Color Reliance**: Status pills (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`) combine distinct icons (Check, Wrench, AlertTriangle) alongside accessible text labels.
2. **Live Regions for Async Updates**: Real-time stock alerts and table updates utilize `aria-live="polite"` regions.
3. **Focus Management**: Closing modal action dialogs automatically returns keyboard focus to the triggering action button.
4. **Accessible Skeletons**: Skeleton loading blocks include `aria-busy="true"` and `aria-label="Loading resources data"`.

---

## 9. Reusable Existing Component Inventory

| Component Name          | Source Path                  | Purpose in Phase 6                                      |
| :---------------------- | :--------------------------- | :------------------------------------------------------ |
| `<StateView />`         | `@kinergy-platform/ui`       | Generic 4-state container for cards and detail sections |
| `<Skeleton />`          | `@kinergy-platform/ui`       | Layout skeleton building blocks                         |
| `<DataTableSkeleton />` | `apps/web/src/shared/table`  | Table skeleton with configurable rows and columns       |
| `<DataTableEmpty />`    | `apps/web/src/shared/table`  | Filtered and global empty state views                   |
| `<DataTableError />`    | `apps/web/src/shared/table`  | Standardized query failure and retry banner             |
| `<ForbiddenView />`     | `apps/web/src/app/routes`    | Full-page 403 access denied fallback                    |
| `<NotFoundView />`      | `apps/web/src/app/routes`    | Full-page 404 resource not found fallback               |
| `useNotification()`     | `apps/web/src/app/providers` | Standardized toast dispatching hook                     |
