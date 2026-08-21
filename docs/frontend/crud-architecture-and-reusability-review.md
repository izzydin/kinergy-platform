# Track C — Step C3.5: CRUD Architecture and Reusability Review

## Architectural Objective & Principles

The objective of Step C3.5 is to conduct a strict architectural review of the CRUD framework implemented across Steps C3.0 through C3.4. The core guiding principle is:

> **"Abstract repeated behavior. Do not abstract hypothetical future behavior."**

This review verifies that the C3 CRUD architecture achieves maximum ergonomic reuse across future domain modules (e.g. Clients, Appointments, Exercises, Billing) without introducing monolithic anti-patterns, generic domain controllers, or leaky abstractions.

---

## 1. Abstractions Analysis

### A. Abstractions Created & Justified

The C3 implementation strictly adhered to composable presentation and lifecycle primitives rather than creating heavy, black-box abstractions:

| Abstraction                                                                                                                                                                                                                                   | Layer         | Justification & Responsibility                                                                                                                                                                                                   |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`<CrudLoading />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-loading.tsx)                                                                                                                                | `shared/crud` | **Justified:** Replaces ad-hoc skeleton markup with standard accessible loading presets (`table`, `card-grid`, `detail`, `form`). Preserves DOM layout preventing CLS (Cumulative Layout Shift).                                 |
| [`<CrudEmpty />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-empty.tsx)                                                                                                                                    | `shared/crud` | **Justified:** Standardizes empty state representation, providing clear distinction between _System Empty_ (0 records total with primary creation CTA) and _Filtered Empty_ (0 matching query results with filter reset action). |
| [`<CrudError />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-error.tsx)                                                                                                                                    | `shared/crud` | **Justified:** Enforces security and UX standards by sanitizing technical backend traces (SQL, Prisma, internal stack traces) into actionable user messages with correlation tracking and retry triggers.                        |
| [`<CrudStateView />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-state-view.tsx)                                                                                                                           | `shared/crud` | **Justified:** Provides a lightweight 4-state lifecycle container (`loading`, `empty`, `error`, `populated`) with support for non-blocking background refetch indicators (`isRefetching`).                                       |
| [`<CrudListLayout />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-list-layout.tsx) & [`<CrudListHeader />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-list-header.tsx) | `shared/crud` | **Justified:** Standardizes responsive list containers and page headers while supporting declarative action projection into shell slot targets (e.g. `slotTarget="header-actions"`).                                             |
| [`<CrudFormLayout />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-form-layout.tsx) & [`<CrudFormHeader />`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/crud/components/crud-form-header.tsx) | `shared/crud` | **Justified:** Standardizes create/edit view boundaries, back-navigation affordances, responsive width constraints (`sm` to `full`), and alert placements.                                                                       |

### B. Rejected & Omitted Anti-Patterns (Explicit Non-Goals)

To prevent architectural rot and premature over-engineering, the following patterns were explicitly rejected:

1. **Generic `<CrudPage />` Monolith:** Rejected because different domain entities have radically different layouts (modal dialogs vs sub-route pages, master-detail sidebars, split panes).
2. **Generic `<CrudForm />` Generator:** Rejected because automated schema-to-form generators break custom UI composition, complex field groupings, and bespoke interactive widgets.
3. **Generic `CrudService` / `CrudController` in `shared/`:** Rejected because data fetching, authorization rules, caching lifetimes, and mutation pipelines must remain strictly owned by individual domain feature modules.

---

## 2. Module Boundary & Isolation Verification

- **Domain Isolation Audit:**
  - Automated ripgrep searches confirmed **zero domain leaks** (no references to `User`, `Client`, `Appointment`, or domain-specific REST paths) inside `apps/web/src/shared/crud/` or `apps/web/src/shared/table/`.
  - All shared primitives operate purely on generic types (`TData`, `TFilters`, `ReactNode`).
- **Feature Public API Compliance:**
  - The first consumer (`modules/identity/user-management`) cleanly exports its public API via `modules/identity/user-management/index.ts`.
  - Feature-specific schemas, hooks, domain types, and sub-routers are encapsulated within the module.

---

## 3. State Ownership & Architecture Alignment

The C3 implementation enforces a single source of truth across all 5 state dimensions with zero duplicated stores:

```
┌─────────────────────────────────────────────────────────────┐
│                     STATE OWNERSHIP MATRIX                  │
├───────────────────────┬─────────────────────────────────────┤
│ State Type            │ Authoritative Owner                 │
├───────────────────────┼─────────────────────────────────────┤
│ Server State          │ TanStack Query (cache keys, refetch)│
│ Shareable List State  │ URL Search Parameters (search, sort)│
│ Form State            │ React Hook Form (RHF instance)      │
│ Validation State      │ Zod Resolver (schema contracts)     │
│ Local UI State        │ React useState (dialog visibility)  │
└───────────────────────┴─────────────────────────────────────┘
```

---

## 4. Mutation & Error Pipeline Audit

- **A6 Mutation Defaults:** Feature mutations (`useCreateUserMutation`, `useUpdateUserMutation`, `useActivateUserMutation`, `useDeactivateUserMutation`) inherit standard notification toasts and query cache invalidations from the central `QueryClient` and `useNotification()` infrastructure.
- **Form Server Error Mapping:** Server validation errors (`ValidationError.details`) are mapped directly to React Hook Form field errors using `useApplyServerErrors`, allowing simultaneous field-level messages and `<FormValidationSummary />` highlights.

---

## 5. Technical Debt & Recommendations

1. **Modal vs Sub-Route Uniformity:** User Management leverages modal dialogs for Create and Edit, whereas future features (e.g. Clients / Clinical Charting) may use dedicated sub-routes (`/clients/new`, `/clients/:id/edit`). The C3 primitives (`CrudFormLayout` / `CrudFormHeader`) were designed to seamlessly support both modalities without modification.
2. **Standardization for Future Features:** When implementing Track D (Client Domain) and Track E (Scheduling), developers must compose existing C1 form primitives, C2 DataTable, and C3 CRUD layout components directly without introducing duplicate wrapper abstractions.
