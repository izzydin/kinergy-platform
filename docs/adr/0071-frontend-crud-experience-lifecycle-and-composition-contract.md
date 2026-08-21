# ADR 0071: Frontend CRUD Experience Lifecycle and Composition Contract

## Status

Accepted

## Context

As Kinergy expands across diverse domains (Identity, Scheduling, Kinesiology, Gym/Attendance, Membership, Billing), frontend developers require a standardized, predictable way to implement Create, Read/List, Update, and Delete/Lifecycle operations.

Previously, frontend teams faced two problematic extremes:

1. **Ad-Hoc Duplication**: Every feature reinvented list filtering, loading spinners, form error display, and optimistic mutations with slight behavioral differences.
2. **Monolithic Over-Abstraction ("AutoCRUD")**: Heavy generic components that attempt to inspect schemas and automatically render entire views, creating rigid abstractions that break as soon as complex domain workflows or custom layouts are introduced.

## Decision

We establish a **Composable CRUD Experience and 4-State UI Lifecycle Contract** across all domain feature modules (`apps/web/src/modules/<domain>/`):

1. **Mandatory 4-State UI Matrix**: Every view (List, Create, Edit, Detail) must explicitly handle:
   - **Loading State**: Accessible skeleton loading with zero layout shift.
   - **Empty State**: Contextual differentiation between System Empty (0 records total with Call-to-Action) and Filtered Empty (0 matching records with "Reset Filters" action).
   - **Error State**: Non-blocking in-place Alert banners with actionable "Retry" triggers and correlation IDs.
   - **Populated State**: Semantic tables, detail cards, or populated forms.
2. **Strict State Ownership Taxonomy**:
   - **Server State**: Owned exclusively by TanStack Query (`useQuery`, `useMutation`).
   - **List & Filter State**: Owned exclusively by the Browser URL (`useTableUrlState`).
   - **Form State**: Owned exclusively by React Hook Form (`formState`).
   - **Validation**: Owned exclusively by Zod (`packages/validation` and domain schemas).
   - **Local UI State**: Owned by React `useState`.
3. **Composable Architectural Boundary**:
   - **Feature Module Owns**: Endpoints, queries, mutations, Zod schemas, table columns (`ColumnDef<TData, TValue>[]`), row actions, domain authorization checks, and modal dialog state.
   - **Shared Framework Owns**: Core presentation engines (`<DataTable />`, `<Form />`, `<FormActions />`, `<DataTableToolbar />`, `<DataTableRowActions />`, `<DataTablePagination />`, design-system primitives).
4. **Domain Lifecycle Actions Over Raw Deletion**: Hard deletion is prohibited by default. Features must model explicit lifecycle state transitions (`Activate`/`Deactivate`, `Cancel`, `Archive`) with confirmation dialogs.

## Consequences

### Positive

- **Predictable Developer Experience**: Developers assemble CRUD views rapidly using standardized composable blocks without fighting rigid frameworks.
- **Deep-Linkable & Shareable**: Filtered, sorted, and paginated lists are 100% shareable across browser sessions.
- **Enterprise WCAG 2.1 AA Compliance**: Keyboard navigation, focus management, ARIA live regions, and semantic landmarks work identically across all platform domains.
- **Zero Global State Bloat**: Server data is managed purely by TanStack Query with automatic cache invalidation on mutations.

### Negative

- Feature developers must author explicit column definitions and form schemas per domain entity, requiring initial boilerplate rather than 1-line "magic" generation.

## References

- [docs/frontend/crud-experience-contract.md](file:///c:/Projects/kinergy-platform/docs/frontend/crud-experience-contract.md)
- [docs/frontend/data-table-architecture.md](file:///c:/Projects/kinergy-platform/docs/frontend/data-table-architecture.md)
- [docs/frontend/form-framework-architecture.md](file:///c:/Projects/kinergy-platform/docs/frontend/form-framework-architecture.md)
