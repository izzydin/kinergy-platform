# Frontend CRUD Experience Lifecycle and Composition Contract

> **Track C — Step C3.0 Architectural Contract**  
> **Status:** APPROVED & MANDATORY  
> **Author:** Lead Frontend Architect  
> **Scope:** `@kinergy-platform/web` (All Domain Feature Modules: Identity, Scheduling, Kinesiology, Gym/Attendance, Membership, Billing)

---

## 1. Executive Summary & Core Architectural Principles

The Kinergy Platform rejects monolithic, opaque "AutoCRUD" or "UniversalCrudComponent" abstractions that hide lifecycle transitions, couple domain rules to generic wrappers, or hinder fine-grained UX customization.

Instead, this document establishes a **Composable, Standardized Lifecycle and Interaction Contract** that all domain feature modules must adhere to when implementing Create, Read/List, Update, and Delete/Lifecycle operations.

### 1.1 The Golden Invariant: 4-State UI Lifecycle

Every CRUD screen and view (List, Create, Edit, Detail) must explicitly, intentionally, and testably handle the 4 fundamental UI states:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 4-STATE UI MATRIX                               │
├─────────────────┬───────────────────┬─────────────────────┬─────────────────────┤
│ 1. LOADING      │ 2. EMPTY          │ 3. ERROR            │ 4. POPULATED        │
│ Skeleton loader │ System: Call-to-  │ HTTP Alert banner   │ Semantic table,     │
│ with aria-busy  │ Action.           │ with actionable     │ detail cards, or    │
│ & zero layout   │ Filtered: "Reset  │ retry & technical   │ fully populated     │
│ shift.          │ Filters" trigger. │ reference code.     │ interactive form.   │
└─────────────────┴───────────────────┴─────────────────────┴─────────────────────┘
```

---

## 2. Strict State Ownership Taxonomy

Following **[ADR-FE-0013]**, **[ADR-FE-0015]**, and Track C Architecture Contracts, state is segregated strictly by operational concern:

| State Domain               | Single Source of Truth | Mechanism                                                    | Responsibility & Boundary                                                                                               |
| :------------------------- | :--------------------- | :----------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **Server State**           | **TanStack Query**     | `useQuery`, `useMutation`, `QueryClient`                     | Data caching, background refetching, deduplication, cache invalidation.                                                 |
| **URL-Driven List State**  | **Browser URL**        | React Router `useSearchParams` via `useTableUrlState`        | Search (`q`), filters (`status`, `role`), pagination (`page`, `limit`), sorting (`sort`). Deep-linkable & bookmarkable. |
| **Form State**             | **React Hook Form**    | `useForm({ resolver: zodResolver(schema) })`                 | Field dirty tracking, field validation, transient input buffers, submission flags.                                      |
| **Client Validation**      | **Zod Schemas**        | `z.object({ ... })` (`packages/validation` & domain schemas) | Type coercion, client-side input validation, error message formatting.                                                  |
| **Local / Modal UI State** | **React `useState`**   | `const [isOpen, setIsOpen] = useState(false)`                | Dialog open/close, active tabs, client-only disclosure controls.                                                        |

---

## 3. Domain Feature Anatomy & Architecture Boundary

Feature modules in `apps/web/src/modules/<domain>/` must adhere to the standardized folder topology:

```
apps/web/src/modules/<domain>/
├── api/                   # Domain API clients and TanStack Query hook definitions
│   ├── <domain>-api.ts    # Pure fetcher functions calling /api/v1/...
│   └── <domain>-queries.ts# use<Domain>ListQuery, use<Domain>DetailQuery, use<Domain>Mutations
├── components/            # Composed domain-specific presentational & interactive components
│   ├── <domain>-list-table.tsx
│   ├── <domain>-create-dialog.tsx
│   ├── <domain>-edit-dialog.tsx
│   └── <domain>-status-badge.tsx
├── hooks/                 # Custom domain hooks (e.g. use<Domain>Filters bridging URL state)
├── schemas/               # Domain-specific Zod form validation schemas
├── types/                 # Domain entity types, DTOs, and filter contracts
├── views/                 # Route-level page containers (List Page, Detail Page)
└── index.ts               # Public module API barrel
```

### 3.1 Ownership Boundary Rules

1. **The Feature Module Owns**:
   - Query keys and caching policies.
   - API endpoints and DTO mappings.
   - Form schemas and domain validation rules.
   - Table column configurations (`ColumnDef<TData, TValue>[]`).
   - Row action menus and mutation triggers.
   - Domain authorization checks (e.g. `hasPermission('manage:users')`).
2. **Shared Infrastructure (`@/shared`, `@kinergy-platform/ui`) Owns**:
   - Headless table rendering engine (`<DataTable />`).
   - Reusable URL serialization and debouncing (`useTableUrlState`).
   - Accessible form primitives (`<Form />`, `<FormField />`, `<FormActions />`).
   - Design-system UI primitives (`<Button />`, `<Input />`, `<Badge />`, `<Alert />`, `<Dialog />`).
   - Global notification dispatcher (`useNotification`).

---

## 4. CRUD Screen Standards

### 4.1 List-Screen Standard

List views must compose the **C2 DataTable Framework**:

```tsx
// Pattern: apps/web/src/modules/<domain>/views/<domain>-list-page.tsx
export function DomainListPage() {
  const { filters, setFilter, setSearch, setPage, setLimit, setSort, resetFilters } =
    useDomainFilters();
  const { data, isLoading, isError, error, refetch } = useDomainListQuery(filters);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <DomainListHeader onCreateClick={handleOpenCreate} />

      <DataTableToolbar
        search={
          <DataTableSearch value={filters.q} onChange={setSearch} placeholder="Search records..." />
        }
        filters={<DomainFacetedFilters filters={filters} onFilterChange={setFilter} />}
        actions={<Button onClick={handleOpenCreate}>+ Create</Button>}
        onReset={resetFilters}
        hasActiveFilters={Boolean(filters.q || filters.status || filters.role)}
      />

      <DataTable<DomainEntity>
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onRetry={refetch}
        isEmpty={!isLoading && !isError && data?.total === 0}
        emptyTitle={filters.q ? 'No records matching search' : 'No records found'}
        emptyDescription={
          filters.q
            ? 'Try adjusting search query or filters'
            : 'Get started by creating a new record'
        }
        emptyAction={
          filters.q ? (
            <Button onClick={resetFilters}>Reset Filters</Button>
          ) : (
            <Button onClick={handleOpenCreate}>+ Create Record</Button>
          )
        }
        pageIndex={filters.page}
        pageSize={filters.limit}
        totalCount={data?.total}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        onSortChange={setSort}
      />
    </div>
  );
}
```

### 4.2 Create-Screen Standard

Create operations compose the **C1 Form Framework** and **A6 Mutation Infrastructure**:

- **Presentation**: Modal Dialog for streamlined entity creation; Full Page for multi-step or complex domain workflows.
- **Form Lifecycle**:
  1. Form initializes with clean schema defaults (`defaultValues`).
  2. Input validation triggers on change/blur via `zodResolver(schema)`.
  3. Form submission invokes TanStack Query mutation (`useMutation`).
  4. Submit button reflects `isPending` loading spinner and disables duplicate submissions.
  5. Upon success:
     - Dispatches success notification (`notifySuccess('Record created successfully')`).
     - Invalidates relevant query keys (`queryClient.invalidateQueries({ queryKey: ['<domain>'] })`).
     - Resets form state and closes dialog.
  6. Upon error:
     - Form displays `<FormValidationSummary errors={mutationError} />` or inline `<FormMessage />`.
     - Dispatches error notification (`notifyError(mutationError.message)`).

### 4.3 Edit-Screen Standard

Edit operations handle pre-populated server state and protect unsaved changes:

- **Data Loading**: Fetches entity by ID using `useDomainDetailQuery(id)`. Displays `<Skeleton />` loader during fetch.
- **Form Hydration**: Form populates with retrieved entity attributes via `reset(entityData)` or `values` prop.
- **Dirty State Guard**:
  - `formState.isDirty` serves as the authoritative indicator of unsaved changes.
  - When hosted on dedicated routes, integrates `<FormDirtyGuard isDirty={isDirty} />` to block accidental browser navigation or page reloads.
- **Submission & Invalidation**:
  - Executes update mutation with payload.
  - On success, invalidates detail query `['<domain>', id]` and list query `['<domain>']`.

### 4.4 Detail-Screen Standard (Read-Only)

- **Structure**: Breadcrumb navigation, primary header with semantic status badge, summary metrics card grid, and contextual action buttons (Edit, Activate/Deactivate, Export).
- **Tabbed Subviews**: For multi-faceted entities (e.g. Client Profile → General Info, Attendance History, Clinical Notes, Memberships), subviews compose dedicated read-only sections with independent query lifecycles.
- **NotFound State**: If query returns 404, renders dedicated `<StateView variant="not-found" />` with a "Return to List" navigation action.

---

## 5. Mutation & Lifecycle Operations Contract

### 5.1 Domain Lifecycle Actions vs Raw Deletion

In accordance with Enterprise DDD principles:

1. **Raw Hard-Deletion is Prohibited by Default**: Most business entities (Users, Memberships, Appointments, Clinical Records) must NEVER be hard-deleted from persistence.
2. **Lifecycle State Transitions**: Prefer explicit domain actions:
   - `Activate` / `Deactivate` (Status State Machine)
   - `Suspend` / `Resume`
   - `Archive` / `Restore`
   - `Cancel` / `Reschedule`
3. **Confirmation Dialogs**: Any destructive or irreversible lifecycle action (Deactivation, Cancellation) MUST require explicit user confirmation via an accessible `<Dialog />` outlining the impact of the action.

### 5.2 Optimistic Updates & Cache Synchronization

- **Standard Mutations (Pessimistic)**: For operations that trigger critical backend side-effects (e.g. creating invoice, booking appointment with concurrency lock, issuing access token), use pessimistic updates:
  ```ts
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: domainKeys.all });
    notifySuccess('Action completed successfully');
  };
  ```
- **Optimistic Updates**: Permitted ONLY for low-risk, reversible toggles (e.g. bookmarking, toggling local display flag) with mandatory `onMutate` snapshotting and `onError` rollback.

---

## 6. Error & Notification Handling Strategy

Errors must be categorized and displayed appropriately based on context:

| Error Category                         | Visual Presentation                                              | Recovery Mechanism                          | User Feedback                                                         |
| :------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------ | :-------------------------------------------------------------------- |
| **Initial Query Error** (500, Network) | `<DataTableError />` or `<StateView variant="error" />` in-place | "Retry" action button                       | Clear error description with correlation ID.                          |
| **Record Not Found** (404)             | `<StateView variant="not-found" />`                              | "Back to List" navigation button            | "The requested record could not be found or has been moved."          |
| **Validation Error** (422)             | `<FormValidationSummary />` + `<FormMessage />` inline           | Correcting invalid form fields              | Specific field constraint messages (e.g. "Email is already taken").   |
| **Mutation / Server Error** (500)      | Form alert banner + Global Toast notification                    | Form remains open with user input preserved | "Unable to save changes. Please check your connection and try again." |
| **Authorization Error** (403)          | Global Toast + Action button disabled                            | Contact organization administrator          | "You do not have permission to perform this action."                  |

---

## 7. Frontend Authorization Contract (UX Defense-in-Depth)

1. **UX Visibility Layer Only**: Hiding a button or disabling a menu item is a convenience for the user, NOT a security control. The backend API is the sole authoritative enforcement boundary.
2. **Permission Checking**: Features use `useAuth().hasPermission(requiredPermission)` or `useAuth().hasRole(requiredRole)`.
3. **Disabled vs Hidden Actions**:
   - **Hidden**: Top-level administrative navigation items or views that the user has zero permission to view.
   - **Disabled with Tooltip**: Action buttons where the user might understand the action exists but lacks specific privilege for this tenant/state.

---

## 8. Accessibility Requirements (WCAG 2.1 AA)

Every CRUD view must satisfy the following accessibility standards:

- **Keyboard Traversal**: Full operation achievable without a mouse (`Tab`, `Shift+Tab`, `Arrow` keys for tables/menus, `Enter`/`Space` to activate, `Escape` to dismiss overlays).
- **Focus Management**:
  - When a modal dialog opens, initial focus moves to the first focusable field or dialog title.
  - When a modal dialog closes, focus returns to the triggering element.
- **Semantic Headings**: Strict `<h1>` for page title, `<h2>` for major sections, `<h3>` for cards/dialog headers.
- **Form Labeling**: Every input associated with `<FormLabel htmlFor={id}>` and `<FormMessage id={errorId}>` via `aria-describedby` and `aria-invalid`.
- **Live Regions**: Asynchronous loading states and global alerts utilize `aria-live="polite"` or `aria-live="assertive"`.

---

## 9. Responsive Layout Strategy

- **Desktop (≥ 1024px)**: Full multi-column data tables, side-by-side filter bars, rich action menus.
- **Tablet (768px – 1023px)**: Horizontally scrollable tables with sticky action columns; collapsible filter bars.
- **Mobile (< 768px)**:
  - Tables maintain native tabular semantics with smooth horizontal touch-scrolling inside `overflow-x-auto`.
  - Filter bars wrap into vertical stacks.
  - Dialog forms stack fields vertically (`grid-cols-1`) with full-width primary submit buttons at the bottom.

---

## 10. Automated Testing Requirements

Every CRUD implementation in a domain module must provide:

1. **API & Query Tests (`api/__tests__/`)**:
   - Fetcher function parameter serialization.
   - Query hook caching and invalidation behavior.
2. **Dialog / Form Tests (`components/__tests__/`)**:
   - Initial form default values.
   - Client validation triggers and error displays.
   - Submission payload formatting and mutation execution.
   - Disabled state during submission.
3. **Table & List Page Integration Tests (`views/__tests__/`)**:
   - 4-State UI verification (Loading skeleton, Error with retry, System empty, Filtered empty, Populated).
   - URL search parameter derivation (`q`, `status`, `page`, `limit`, `sort`).
   - Sortable header clicks triggering sorted queries.
   - Pagination button clicks updating URL and query params.
   - Row action execution (Dialog open, mutation dispatch).

---

## 11. Explicit Architectural Non-Goals

1. **No "AutoCRUD" / "MagicCrud" Generators**: No components that attempt to inspect a TypeScript interface or database schema to automatically generate forms, tables, and mutation handlers.
2. **No Duplicated Global Entity Stores**: Domain entity collections must NOT be mirrored in Zustand or React Context. TanStack Query cache is the single server state repository.
3. **No Brittle Card Conversion for Tables**: We do not transform structured enterprise tabular data into unstructured cards on mobile unless explicitly specified for a specific consumer-facing card feed.
4. **No Client-Side In-Memory Pagination for Server Collections**: All large domain datasets must use server-driven pagination and filtering via the standardized URL parameters.
