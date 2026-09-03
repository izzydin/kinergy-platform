# Phase 6: Inventory Frontend Cross-Screen UX & Consistency Review

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.12 — Inventory Frontend Implementation Review  
**Reviewers**: Principal Frontend Architect, Application Security Engineer, UX Accessibility Reviewer, Kinergy Design System Reviewer  
**Governing Documents**:

- [ADR-0094: Resources Authorization & Permission Taxonomy Model](./adr/0094-resources-authorization-and-permission-taxonomy-model.md)
- [ADR-0095: Resource Sensitive Valuation Data Access & Response Shaping Policy](./adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)
- [ADR-0101: Frontend Low Stock Operational Attention Architecture](./adr/0101-frontend-low-stock-operational-attention-architecture.md)
- [Frontend Resource Authorization Architecture](./frontend-resource-authorization.md)
- [Phase 6 Frontend Routing Architecture](./frontend-routing-architecture.md)

---

## 1. Executive Summary & Review Scope

This review evaluates the consistency, security posture, accessibility compliance, and operational ergonomics across all 8 screens and modal workflows of the **Consumable Inventory** module within the Kinergy Platform:

1. **Inventory Overview** (`/resources/overview`)
2. **Product List / Catalog** (`/resources/inventory`)
3. **Product Create** (`/resources/inventory/new`)
4. **Product Edit** (`/resources/inventory/:id/edit`)
5. **Product Detail Cockpit** (`/resources/inventory/:id`)
6. **Stock Movement Workflows** (Receive, Record Sale, Treatment Usage, Adjust Count, Scrap Loss)
7. **Movement History Audit Ledger** (`/resources/inventory/:id/movements`)
8. **Low Stock Attention Queue** (`/resources/inventory/low-stock`)

The audit was conducted against three distinct user personas:

- **Persona 1: Operational Reader** (`inventory.read` only — e.g., Trainers, Practitioners, Assistants).
- **Persona 2: Operations Manager** (`inventory.read` + `inventory.write`, plus optional `valuation.read` / admin roles — e.g., Head Coach, Inventory Manager, Facility Owner).
- **Persona 3: Unauthorized User** (No inventory permissions — e.g., standard gym members, external guests, unprivileged staff).

---

## 2. Screen Consistency Matrix

| Screen / Workflow      | Route / Entry                                                  | Primary Purpose                                                 | Auth Guard (`RequirePermission`) | Action Guard (`HasPermission`)                                   | Sensitive Financial Policy                                                | Loading Pattern                                          | Error Pattern                                                    | Empty State Pattern                                                       |
| :--------------------- | :------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Inventory Overview** | `/resources/overview`                                          | Executive & operational health overview                         | `inventory.read` (module)        | `inventory.write` (Register Product CTA)                         | Segregated: working capital KPI requires `valuation.read`                 | Skeleton KPI cards & alert table rows                    | Alert banner + Retry query button                                | Positive health state: "All Inventory Stocks Healthy"                     |
| **Product List**       | `/resources/inventory`                                         | Searchable, filterable catalog data table                       | `inventory.read` (module)        | `inventory.write` (Create CTA, table row action dropdown)        | Dynamic: Unit Cost column hidden without `valuation.read`                 | Skeleton table rows (`DataTableSkeleton`)                | Alert banner with error message + Retry query button             | Differentiated: Initial empty catalog vs Filtered empty search with reset |
| **Product Create**     | `/resources/inventory/new`                                     | Register new consumable product                                 | `inventory.write` (route-level)  | N/A (entire route restricted)                                    | Financial inputs required for catalog setup                               | Button spinner (`isSubmitting`) + form input disablement | Inline Zod validation + Server error alert banner                | N/A (Form input interface)                                                |
| **Product Edit**       | `/resources/inventory/:id/edit`                                | Update product metadata and commercial pricing                  | `inventory.write` (route-level)  | N/A (entire route restricted)                                    | Retail price and unit cost update fields                                  | Full-card skeleton loading state                         | Inline Zod validation + Server error alert banner + 404 fallback | N/A (Form input interface)                                                |
| **Product Detail**     | `/resources/inventory/:id`                                     | Operational cockpit, stock gauge & ledger preview               | `inventory.read` (module)        | `inventory.write` (Receive, Sale, Consume, Adjust, Scrap, Edit)  | Purchase unit cost masked (`••••••`) + Lock icon without `valuation.read` | Hero & card skeleton blocks                              | Alert banner with retry + Accessible 404 not-found card          | N/A (Single product entity view)                                          |
| **Stock Movements**    | Modal Dialogs (Receive, Sell, Consume, Adjust, Scrap, Archive) | Execute double-entry operational transactions                   | Triggered from Detail / Queue    | `inventory.write` required to render trigger buttons             | No unit costs exposed in operational transactions                         | Button spinner (`isPending`) + input disablement         | Inline form error + destructive server alert                     | N/A (Modal transaction interface)                                         |
| **Movement History**   | `/resources/inventory/:id/movements`                           | Chronological audit ledger explaining operational stock changes | `inventory.read` (module)        | Read-only ledger (No write triggers in history)                  | Audit quantities only; unit costs strictly omitted                        | Summary cards & table skeleton rows                      | Alert banner with error message + Retry query button             | Differentiated: Initial no movements recorded vs Filtered empty           |
| **Low Stock Queue**    | `/resources/inventory/low-stock`                               | Operational attention queue answering "What needs attention?"   | `inventory.read` (module)        | `inventory.write` (In-flow "Receive Stock" replenishment button) | Quantities and deficits only; financial costs omitted                     | Metric cards & table skeleton rows                       | Alert banner with error message + Retry query button             | Positive health banner: "All Inventory Stocks Healthy"                    |

---

## 3. Persona Navigation & Permission Consistency Results

### Persona 1: Operational Reader (`inventory.read` without `inventory.write`)

- **Navigation Visibility**: The "Resources" menu item and "Inventory" tab are visible. "Fixed Assets" or "Valuation" tabs appear only if those specific claims are held.
- **Catalog Browsing**: The user can view the complete product catalog, search by name/SKU, and filter by category or stock status.
- **Action Gating**:
  - The "Register Product" CTA is hidden from both the overview page, list toolbar, and quick actions.
  - Row action dropdowns in the Product List hide all mutation options (Edit, Receive, Sell, Consume, Adjust, Scrap, Archive), exposing only "View Details".
  - In the Product Detail view, all mutation trigger buttons (Receive, Sale, Usage, Adjust Count, Scrap, Edit Details, Archive) are cleanly suppressed via `canWriteInventory`.
  - In the Low Stock Queue, the in-flow "Receive Stock" button is suppressed via `<HasPermission name="inventory.write">`, while the "Details" link remains accessible.
- **Route Protection**: If the reader directly inputs `/resources/inventory/new` or `/resources/inventory/:id/edit` in the browser address bar, the route-level `<RequirePermission permission="inventory.write">` guard intercepts the request and renders `<ForbiddenView />` (`403 Access Denied: You lack the required permission: inventory.write`), preventing unauthorized form display.
- **Zero Misleading Affordances**: No disabled buttons with ambiguous tooltips exist; unauthorized write actions are completely hidden from readers.

### Persona 2: Operations Manager (`inventory.read` + `inventory.write` + `valuation.read`)

- **Full Operational Capabilities**: Can register new products, update existing details, archive inactive items, and execute all 5 stock mutation workflows.
- **Integrated In-Flow Workflows**: Can trigger replenishment receipts directly from the Low Stock Queue without navigating away from the triage list.
- **Commercial Valuation**: Because the user possesses `valuation.read` (or administrative roles), the Inventory Overview displays total portfolio working capital, the Product List displays the Unit Cost column, and the Product Detail cockpit displays unmasked purchase costs and working capital calculations.
- **Clean Audit Trail**: Every mutation performed by the manager is recorded with their actor ID and timestamp, visible in the Movement History ledger.

### Persona 3: Unauthorized User (No inventory permissions)

- **Navigation Suppression**: The navigation sidebar completely suppresses the "Resources" module item.
- **Module Boundary Guard**: If the user navigates directly to any `/resources/*` URL (e.g., `/resources/inventory`, `/resources/overview`), the top-level module registry guard `<RequirePermission permissions={['inventory.read']}>` renders `<ForbiddenView />`.
- **Zero Data Leakage**: No inventory data, product names, stock quantities, or pricing are ever queried from the backend or rendered in the DOM.

---

## 4. Sensitive Valuation & Financial Data Review

In strict adherence to **ADR-0095** and **Section 4 of `frontend-resource-authorization.md`**, financial acquisition data is segregated from operational catalog data:

1. **Product List (`InventoryListTable`)**:
   - `sellingPrice` (Retail Price) is visible to all inventory readers because front-desk and coaching staff require retail pricing for POS and client inquiries.
   - `unitCost` (Purchase Unit Cost) is conditionally pushed into `columns` **only** if `hasValuationPermission` is truthy (`valuation.read`, `billing.read`, `ADMIN`, `OWNER`, `SUPER_ADMIN`).
   - When the user lacks permission, the column is completely omitted from table definition, ensuring no DOM node or CSS-hidden element contains financial acquisition amounts.
2. **Product Detail (`InventoryDetailPage`)**:
   - The commercial pricing card presents Retail Price prominently.
   - The "Purchase Unit Cost" block evaluates `canViewCost`. When false, the acquisition amount is replaced with `••••••` and a lock icon with the label `"Restricted (valuation.read)"`.
   - The "Current Working Capital Value" sub-card (`currentStock * unitCost.amount`) is omitted when `canViewCost` is false.
3. **Inventory Overview (`InventoryOverviewSummary`)**:
   - The "Inventory Working Capital" KPI card evaluates `hasValuationPermission`.
   - When false, it renders a clean card state: `"Financial Access Restricted — Requires valuation.read or administrative permission."`
4. **Movement History (`MovementHistoryTable`) & Low Stock Queue (`LowStockAttentionQueue`)**:
   - Exclusively display operational quantities, balance deltas, and deficit counts. Neither view exposes sensitive monetary unit costs.

---

## 5. Async State & Loading Experience Review

Every screen and asynchronous component implements standard three-phase state handling:

```
[Initial Mount / Query Idle]
            │
            ▼
┌───────────────────────┐
│     Loading State     │ ──► High-fidelity Skeleton primitives (Card, Table, Header)
└───────────────────────┘     No jarring layout shifts or full-page blank screens
            │
            ├────────────────────────────────────────┬────────────────────────────────────────┐
            ▼                                        ▼                                        ▼
┌───────────────────────┐                ┌───────────────────────┐                ┌───────────────────────┐
│     Success State     │                │   Query Error State   │                │   Empty State State   │
│ Normal content render │                │ Alert + Retry Button  │                │ Informative / Action  │
└───────────────────────┘                └───────────────────────┘                └───────────────────────┘
```

1. **Loading Feedback**:
   - Overview: 3 skeleton metric cards and skeleton alert table rows.
   - Product List: `DataTableSkeleton` matching configured page size.
   - Product Detail: Header skeleton, stock health card skeleton, and 2-column info skeletons.
   - Movement History: 4 skeleton KPI cards and 5 table skeleton rows.
   - Low Stock Queue: 4 skeleton KPI cards and 5 table skeleton rows.
   - Stock Movement Dialogs: Submit button displays `<Spinner className="mr-2 h-4 w-4" />` with disabled inputs while `isPending` is true.
2. **Background Refetching**:
   - Detail and list views utilize TanStack Query `isFetching` without tearing down mounted UI, preventing layout jumps during background cache reconciliation.

---

## 6. Error Handling & Recovery Review

1. **Query Errors**:
   - Every read screen (`InventoryOverviewPage`, `InventoryListPage`, `InventoryDetailPage`, `InventoryMovementsPage`, `LowStockPage`) traps query errors with an accessible `<Alert variant="destructive">`.
   - All error states include a direct `<Button onClick={() => refetch()}>Retry Query</Button>` to recover immediately from transient network or gateway glitches.
2. **Business / Mutation Errors**:
   - Backend validation rejections (e.g., negative balance prohibition, insufficient stock, invalid SKU) return structured HTTP 400/409 errors.
   - The mutation hook displays a toast via `notification.error(error.message)`.
   - Forms (Create, Edit, Receive, Sell, Consume, Adjust, Scrap) render a top-level alert banner displaying the error explanation, while keeping user inputs intact so the user can correct values without retyping.
3. **Not Found (404)**:
   - `InventoryDetailPage` checks if product query succeeds but returns undefined.
   - Renders a centered error card: `"Product Not Found — The requested inventory item does not exist or has been removed"` with a `"Return to Catalog"` button.
4. **Backend Denial (403/401)**:
   - Handled gracefully via `notification.error("Access Denied: You lack required permissions")` and query invalidation.

---

## 7. Empty State Design & Operational Meaning

Empty states within the Inventory module strictly communicate positive operational health or provide actionable recovery paths rather than blank tables:

1. **Low Stock Queue (`LowStockAttentionQueue`)**:
   - When no products are at or below reorder threshold, renders a positive health banner:
     - Icon: `CheckCircle2` (Emerald Green).
     - Heading: _"All Inventory Stocks Healthy"_.
     - Subtitle: _"No products currently fall at or below configured reorder thresholds."_
     - Action: _"Browse Full Catalog"_ button.
2. **Movement History Ledger (`MovementHistoryTable`)**:
   - **Initial Empty State** (New product, no transactions recorded yet):
     - Icon: `Package` (Muted).
     - Heading: _"No Movements Recorded Yet"_.
     - Subtitle: _"This product has no historical transactions. Opening balance receipts, retail sales, clinical consumption, and manual stock counts will appear here chronologically."_
   - **Filtered Empty State** (User selected a specific filter chip like "Scrap & Loss"):
     - Icon: `FilterX`.
     - Heading: _"No matching movements found"_.
     - Subtitle: _"No transactions match the selected movement type filter."_
     - Action: _"Clear Movement Filters"_ button.
3. **Product Catalog (`InventoryListTable`)**:
   - Initial empty state offers a "Register First Product" CTA (for write-authorized users).
   - Filtered empty state informs the user that no products match search criteria and renders a "Reset Filters" button.

---

## 8. Notification & Mutation Ownership Review

In accordance with Phase 6.11 mutation architecture:

1. **Single Point of Notification**:
   - `useNotification().success()` and `useNotification().error()` are **exclusively** invoked inside the mutation hooks (`use-inventory-mutations.ts`).
   - Page and component callers (`InventoryCreatePage`, `InventoryEditPage`, `ReceiveStockDialog`, etc.) **never** call `notification.success()` redundantly.
2. **Automated Cache Invalidation**:
   - Every mutation invalidates target keys in a single transaction:
     ```typescript
     queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
     queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
     queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
     queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
     ```
   - This ensures overview cards, catalog tables, low stock queues, and detail pages immediately reconcile with backend domain state upon mutation completion.
3. **Inline Form Validation**:
   - Handled client-side via React Hook Form + Zod resolvers. Errors appear directly under invalid inputs, with `aria-invalid="true"` set on the inputs.

---

## 9. Accessibility (a11y) Review & Findings

1. **Semantic Structure**:
   - All pages employ a single `<h1>` page heading with structured `<h2>` section headers.
   - Tables (`InventoryListTable`, `MovementHistoryTable`, `LowStockAttentionQueue`) utilize native `<table>`, `<thead>`, `<tbody>`, `<th>`, and `<td>` elements with explicit column scope.
2. **Keyboard Navigation & Focus Management**:
   - All dialogs (`ReceiveStockDialog`, `SellStockDialog`, `ConsumeStockDialog`, `AdjustStockDialog`, `ScrapStockDialog`, `ArchiveProductDialog`) use Radix UI primitives.
   - Focus is automatically trapped inside the dialog upon opening.
   - Pressing <kbd>Esc</kbd> dismisses the modal.
   - On close, focus returns cleanly to the triggering button or link.
3. **Color-Blind Friendly Indicators**:
   - Stock movement deltas do not rely solely on color (green vs red); they feature explicit signed mathematical characters (`+` and `-`) and directional icons (`ArrowUpRight` vs `ArrowDownRight`).
   - Stock health badges use distinctive text labels (`OUT OF STOCK`, `LOW STOCK`, `ADEQUATE`) rather than color-only dots.
4. **Form Labels & Error Associations**:
   - All form controls utilize `<FormLabel>` linked to inputs via unique IDs.
   - Validation error messages are linked to inputs via `aria-describedby` for assistive technologies.
5. **Replaced Inaccessible Primitives**:
   - Removed native `window.confirm` from `InventoryListPage.handleArchive`, replacing it with the accessible Radix UI `<ArchiveProductDialog>`.

---

## 10. Responsive Design Review

The module adheres strictly to Kinergy Platform responsive standards:

1. **Fluid Grid Systems**:
   - Overview KPI Cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
   - Movement History & Low Stock Metric Cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
   - Detail Cockpit: Stacks vertically on mobile; transforms to 2/3 column layout on desktop (`grid grid-cols-1 md:grid-cols-3` and `grid grid-cols-1 md:grid-cols-2`).
2. **Table Responsiveness**:
   - All tables (`InventoryListTable`, `MovementHistoryTable`, `LowStockAttentionQueue`) are wrapped in `overflow-x-auto` containers with `whitespace-nowrap` on critical numeric and date cells, enabling smooth horizontal scrolling on mobile viewports without breaking layout boundaries.
3. **Filter Bar Responsiveness**:
   - `InventoryFilterBar` and `MovementHistoryFilterBar` utilize `flex flex-wrap items-center gap-3`. Search inputs expand to full-width on mobile viewports (`w-full sm:w-auto`) and collapse gracefully on desktop.
4. **Dialog Viewports**:
   - Modals use `max-w-md` or `max-w-lg` with `w-[95vw] sm:w-full`, preventing off-screen clipping on small devices.

---

## 11. Required Fixes Completed During Audit

| #   | Item                              | Issue Found                                                                                                                                                                                   | Fix Applied                                                                                                                                | Status       |
| :-- | :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------- |
| 1   | **Route-Level Permission Guards** | `/resources/inventory/new` and `/resources/inventory/:id/edit` were only protected at module level (`inventory.read`), allowing read-only users direct URL access to interactive write forms. | Wrapped `<InventoryCreatePage />` and `<InventoryEditPage />` with `<RequirePermission permission="inventory.write">` in `app-router.tsx`. | **Resolved** |
| 2   | **Archive Dialog Accessibility**  | `InventoryListPage` invoked native browser `window.confirm()` for archive confirmation, which is inaccessible and violates design system standards.                                           | Replaced `window.confirm()` with `<ArchiveProductDialog />`, utilizing Radix UI accessible modal primitives with focus trapping.           | **Resolved** |
| 3   | **Movement Ledger Navigation**    | `ProductMovementsPreview` only displayed the "View Full Ledger" link if `totalMovements > 5`, preventing users with 1–5 movements from jumping to the dedicated audit view.                   | Updated condition to `totalMovements > 0`, ensuring users can always navigate to the complete audit ledger when entries exist.             | **Resolved** |

---

## 12. Final UX Consistency Status

> **Verdict**: **PASSED (Production-Ready)**
>
> The Consumable Inventory frontend module exhibits complete cross-screen consistency across permissions, sensitive financial disclosure, loading feedback, error resilience, notifications, accessibility, and responsive ergonomics.
>
> A user transitioning between Overview, Product Catalog, Detail Cockpit, Movement History, and Low Stock views experiences uniform Kinergy Platform interaction patterns with zero cognitive friction.
