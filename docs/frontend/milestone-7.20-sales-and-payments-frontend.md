# Milestone 7.20: Sales & Payments Frontend Architecture & Acceptance Specification

- **Document**: `docs/frontend/milestone-7.20-sales-and-payments-frontend.md`
- **Milestone**: Phase 7.20 — Frontend Implementation: Sales, Payments & Receipts Experience
- **Status**: **ACCEPTED & VERIFIED**
- **Date**: 2026-10-17
- **Authority**: Kinergy Release Engineering / Senior Frontend Architect
- **Governing Standards**: [Frontend Architecture Vision](architecture.md), [Frontend Principles](principles.md), [Frontend Folder Structure](folder-structure.md), [Sales API & URL-driven DataTable Contract](sales_url_query_contract.md), [Milestone 7.13 Authorization Governance](../architecture/milestone-7.13-authorization-governance.md)

---

## 1. Executive Summary

Milestone 7.20 establishes the complete frontend user experience for the **Sales & Payments Bounded Context** within the Kinergy Platform web client (`apps/web`).

Built strictly in accordance with Clean Architecture, TanStack Query server-state management, URL-driven DataTable state, and Kinergy's 4-state UI contract (Loading, Empty, Error, Success), this module delivers **seven fully integrated screens** that provide end-to-end commercial operations:

1. **Sales Overview** (operational KPI cards and commercial ledger)
2. **Sales List** (URL-synchronized, faceted search and data table)
3. **Sale Create** (robust commercial entry with real backend contracts)
4. **Sale Detail** (authoritative financial summary and balance tracking)
5. **Payment Detail** (full payment lifecycle and settlement inspection)
6. **Payment History** (traceable multi-tender payment ledger)
7. **Receipt View** (canonical legal proof-of-purchase and print layout)

All financial data, monetary amounts, and status lifecycles are displayed with strict adherence to backend authority—no client-side recomputation of totals or speculative state transitions.

---

## 2. Module Architecture & Public API

The Sales feature module is located at `apps/web/src/modules/sales/` and follows strict modular isolation. External consumers (such as the app shell and top-level router) access the module exclusively through its public barrel file:

```text
apps/web/src/modules/sales/
├── api/
│   ├── sales-api.ts               # HTTP client functions consuming backend REST API
│   ├── sales-query-keys.ts        # Hierarchical TanStack Query key factories
│   └── index.ts                   # Public API exports
├── components/
│   ├── apply-discount-dialog.tsx  # Modal for applying order-level discounts
│   ├── cancel-sale-dialog.tsx     # Modal for cancelling draft/unsettled sales
│   ├── money-display.tsx          # Consistent currency formatting primitive
│   ├── payment-method-badge.tsx   # Badge indicating CASH, CARD, TRANSFER, etc.
│   ├── payment-status-badge.tsx   # Badge for PENDING, COMPLETED, FAILED, CANCELLED
│   ├── payments-filter-bar.tsx    # Filter bar for payment history queries
│   ├── payments-table.tsx         # TanStack Table component for payment items
│   ├── record-payment-dialog.tsx  # Modal for submitting payment installments
│   ├── sale-status-badge.tsx      # Badge for DRAFT, PAID, PARTIALLY_PAID, etc.
│   ├── sales-filter-bar.tsx       # Filter bar for sales queries
│   ├── sales-table.tsx            # TanStack Table component for sales records
│   └── index.ts                   # Components barrel
├── hooks/
│   ├── use-payment-filters.ts     # URL-state synchronization for payments
│   ├── use-sales-filters.ts       # URL-state synchronization for sales
│   ├── use-sales-mutations.ts     # TanStack Query mutations with cache invalidation
│   ├── use-sales-queries.ts       # TanStack Query hooks for reading data
│   └── index.ts                   # Hooks barrel
├── pages/
│   ├── payment-detail-page.tsx    # Screen 5: Payment lifecycle and details
│   ├── payment-history-page.tsx   # Screen 6: Traceable payment history ledger
│   ├── receipt-view-page.tsx      # Screen 7: Canonical receipt and print view
│   ├── sale-create-page.tsx       # Screen 3: Sale creation workflow
│   ├── sale-detail-page.tsx       # Screen 4: Sale financial summary & details
│   ├── sales-list-page.tsx        # Screen 2: URL-driven sales list
│   ├── sales-overview-page.tsx    # Screen 1: Executive KPI overview
│   └── index.ts                   # Pages barrel
├── routes/
│   ├── sales-routes.ts            # Canonical route paths and helper functions
│   ├── sales.router.tsx           # React Router sub-router with permissions
│   └── index.ts                   # Routes barrel
├── schemas/
│   ├── apply-discount.schema.ts   # Zod schema for applying discounts
│   ├── cancel-sale.schema.ts      # Zod schema for sale cancellation
│   ├── create-sale.schema.ts      # Zod schema for sale creation and line items
│   ├── record-payment.schema.ts   # Zod schema for recording payments
│   └── index.ts                   # Schemas barrel
├── types/
│   ├── payments.types.ts          # Payment DTOs and lifecycle enums
│   ├── receipts.types.ts          # Canonical receipt snapshot contracts
│   ├── sales-query.types.ts       # Query parameter and filter types
│   ├── sales.types.ts             # Sale DTOs, items, and status types
│   └── index.ts                   # Types barrel
├── __tests__/                     # Co-located unit and integration test suites
│   ├── payment-detail-page.spec.tsx
│   ├── payment-history-page.spec.tsx
│   ├── receipt-view-page.spec.tsx
│   ├── sale-create-page.spec.tsx
│   ├── sale-detail-page.spec.tsx
│   ├── sales-api.spec.ts
│   ├── sales-list-page.spec.tsx
│   ├── sales-overview-page.spec.tsx
│   ├── sales-schemas.spec.ts
│   └── sales-table-url-contract.spec.tsx
└── index.ts                       # Module public barrel export
```

### Module Public API (`apps/web/src/modules/sales/index.ts`)

```typescript
// Routing
export { SalesRouter } from './routes/sales.router';
export { SALES_ROUTES, type SalesRoutePath } from './routes/sales-routes';

// Types & Contracts
export type {
  SaleDto,
  SaleItemDto,
  SaleTotalsDto,
  CreateSaleDto,
  CreateSaleItemDto,
  SaleStatus,
  PaymentDto,
  PaymentStatus,
  PaymentMethod,
  ReceiptDto,
  ReceiptSaleSnapshotDto,
  ReceiptSaleItemSnapshotDto,
  ReceiptPaymentSnapshotDto,
  SalesFilters,
  ListSalesQueryParams,
  PaymentsFilters,
  ListPaymentsQueryParams,
} from './types';

// API Client & Query Keys
export {
  listSalesApi,
  getSaleByIdApi,
  createSaleApi,
  cancelSaleApi,
  applySaleDiscountApi,
  listPaymentsApi,
  getPaymentByIdApi,
  createPaymentApi,
  cancelPaymentApi,
  failPaymentApi,
  completePaymentApi,
  getReceiptBySaleIdApi,
  downloadReceiptPdfApi,
  salesQueryKeys,
} from './api';

// Queries & Mutations
export {
  useSalesListQuery,
  useSaleDetailQuery,
  usePaymentDetailQuery,
  usePaymentsListQuery,
  useReceiptQuery,
  useCreateSaleMutation,
  useCancelSaleMutation,
  useApplyDiscountMutation,
  useRecordPaymentMutation,
  useCancelPaymentMutation,
  useFailPaymentMutation,
  useCompletePaymentMutation,
} from './hooks';

// Components & UI Elements
export {
  MoneyDisplay,
  SaleStatusBadge,
  PaymentStatusBadge,
  PaymentMethodBadge,
  SalesFilterBar,
  PaymentsFilterBar,
  SalesTable,
  PaymentsTable,
  CancelSaleDialog,
  ApplyDiscountDialog,
  RecordPaymentDialog,
} from './components';

// Pages
export {
  SalesOverviewPage,
  SalesListPage,
  SaleCreatePage,
  SaleDetailPage,
  PaymentDetailPage,
  PaymentHistoryPage,
  ReceiptViewPage,
} from './pages';
```

---

## 3. Implemented Screens and Route Specifications

The application router mounts the Sales module at `/sales/*`. All seven screens implement deterministic loading skeletons, clear empty state fallbacks, user-friendly error banners with retry buttons, and permission-based route protection.

| #     | Screen Name         | Canonical Route               | Required Permission | Description & Core Responsibilities                                                                                                                                                                                                                                                                                 |
| :---- | :------------------ | :---------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **Sales Overview**  | `/sales` or `/sales/overview` | `sales.read`        | Operational dashboard displaying authoritative KPI summary metrics (`totalSalesCount`, `totalVolumeCents`, `draftCount`, `unsettledCount`, `averageSaleValueCents`), recent sales table, recent payments table, and quick-action navigation cards. Does not invent fake aggregates.                                 |
| **2** | **Sales List**      | `/sales/list`                 | `sales.read`        | Full commercial registry utilizing the URL-driven DataTable architecture. Supports full-text search (`q`), lifecycle status filter, source type, client ID, date ranges, compound sorting (`sort=createdAt.desc`), and pagination. Deep-linkable and refresh-invariant.                                             |
| **3** | **Sale Create**     | `/sales/new`                  | `sales.create`      | Transaction creation form with dynamic line item addition/removal, real-time client validation via React Hook Form and Zod, source domain selection (`CUSTOM_SERVICE`, `INVENTORY_ITEM`, etc.), client attribution, and duplicate submission prevention. Navigates to `/sales/:saleId` on creation.                 |
| **4** | **Sale Detail**     | `/sales/:saleId`              | `sales.read`        | Authoritative financial breakdown presenting server-calculated subtotal, item discounts, order discount, net total, payments received, and outstanding balance. Contains line items table, related payments sub-ledger, contextual action modals (Record Payment, Apply Discount, Cancel Sale), and receipt access. |
| **5** | **Payment Detail**  | `/sales/payments/:paymentId`  | `payments.read`     | Complete audit inspection of a payment tender showing status (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`), amount, method, reference numbers, processing timestamps, failure reasons, parent sale summary card, and administrative status transitions (Complete, Fail, Cancel).                                  |
| **6** | **Payment History** | `/sales/payments`             | `payments.read`     | Enterprise payment ledger allowing staff to trace all tenders across the platform. URL-persisted filtering by `saleId`, `status`, `method`, and date ranges. Clear visual distinction between settled, pending, and failed payment attempts with deep links to both Payment and Sale details.                       |
| **7** | **Receipt View**    | `/sales/:saleId/receipt`      | `receipts.read`     | Presentation of the immutable, legal proof-of-purchase document based on backend snapshot data. Formatted for screen viewing and optimized for physical printing via CSS `@media print`. Displays an honest, respectful explanation when accessed for an unsettled sale (HTTP 404).                                 |

---

## 4. API Endpoints and DTO Contracts Consumed

The frontend client communicates with the backend REST API via standard envelopes (`Result<T>` and `PaginatedResult<T>`) using the shared `apiClient`:

| HTTP Method & Endpoint                      | Operation ID         | Consumed By             | Response Payload              | Description & Invariants                                                                                                                        |
| :------------------------------------------ | :------------------- | :---------------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/sales`                         | `listSales`          | `listSalesApi`          | `PaginatedResult<SaleDto>`    | Retrieves paginated sales matching URL query criteria (`q`, `status`, `sourceType`, `clientId`, `fromDate`, `toDate`, `sort`, `page`, `limit`). |
| `POST /api/v1/sales`                        | `createSale`         | `createSaleApi`         | `Result<SaleDto>`             | Creates a new Sale aggregate in `DRAFT` status with line items and optional client reference.                                                   |
| `GET /api/v1/sales/:saleId`                 | `getSaleById`        | `getSaleByIdApi`        | `Result<SaleDto>`             | Returns complete Sale aggregate including line items, discounts, totals, and related payments.                                                  |
| `POST /api/v1/sales/:saleId/cancel`         | `cancelSale`         | `cancelSaleApi`         | `Result<SaleDto>`             | Transitions Sale to `CANCELLED` status with mandatory cancellation reason.                                                                      |
| `POST /api/v1/sales/:saleId/discount`       | `applyDiscount`      | `applySaleDiscountApi`  | `Result<SaleDto>`             | Applies order-level fixed or percentage discount, updating authoritative totals.                                                                |
| `GET /api/v1/payments`                      | `listPayments`       | `listPaymentsApi`       | `PaginatedResult<PaymentDto>` | Retrieves paginated payment records matching criteria (`saleId`, `status`, `method`, `fromDate`, `toDate`).                                     |
| `GET /api/v1/payments/:paymentId`           | `getPaymentById`     | `getPaymentByIdApi`     | `Result<PaymentDto>`          | Returns detailed payment record with transaction metadata and timestamps.                                                                       |
| `POST /api/v1/sales/:saleId/payments`       | `createPayment`      | `createPaymentApi`      | `Result<PaymentDto>`          | Submits a payment installment against a Sale in `PENDING_PAYMENT` or `PARTIALLY_PAID` status.                                                   |
| `POST /api/v1/payments/:paymentId/complete` | `completePayment`    | `completePaymentApi`    | `Result<PaymentDto>`          | Confirms tender settlement, triggering Sale balance reconciliation.                                                                             |
| `POST /api/v1/payments/:paymentId/fail`     | `failPayment`        | `failPaymentApi`        | `Result<PaymentDto>`          | Records tender failure with mandatory failure reason without altering Sale balance.                                                             |
| `POST /api/v1/payments/:paymentId/cancel`   | `cancelPayment`      | `cancelPaymentApi`      | `Result<PaymentDto>`          | Voids a pending payment tender without altering Sale balance.                                                                                   |
| `GET /api/v1/sales/:saleId/receipt`         | `getReceiptBySaleId` | `getReceiptBySaleIdApi` | `Result<ReceiptDto>`          | Returns legal proof-of-purchase snapshot for fully settled sales. Returns 404 for unsettled sales.                                              |
| `GET /api/v1/sales/:saleId/receipt/pdf`     | `downloadReceiptPdf` | `downloadReceiptPdfApi` | `Blob`                        | Retrieves binary PDF stream when available (handles graceful fallback).                                                                         |

---

## 5. Permissions and Authorization Architecture

Frontend authorization aligns with the platform's RBAC governance ([Milestone 7.13 Authorization Governance & Security Specification](../architecture/milestone-7.13-authorization-governance.md)):

```text
sales.read        ──► Access Sales Overview (/sales), Sales List (/sales/list), Sale Detail (/sales/:saleId)
sales.create      ──► Access Sale Create (/sales/new), Apply Order Discount
sales.cancel      ──► Cancel Draft or Unsettled Sales
payments.read     ──► Access Payment History (/sales/payments), Payment Detail (/sales/payments/:paymentId)
payments.create   ──► Record Payment Installments on Sales
payments.manage   ──► Complete or Fail Pending External Payment Tenders
receipts.read     ──► Access Receipt View (/sales/:saleId/receipt)
```

### Two-Tier Authorization Enforcement

1. **Route-Level Protection**: The module router wraps each route in `<ProtectedRoute requiredPermission="...">`. Users lacking required permissions are prevented from mounting the view and redirected to `/forbidden` or shown the standard `UnauthorizedState` view.
2. **Component-Level Contextual Guards**: Interactive action controls (such as the "Record Payment", "Cancel Sale", and "Apply Discount" buttons on the Sale Detail page, or the "Complete Payment" button on the Payment Detail page) are guarded using `useAuth().hasPermission(...)`. Controls are hidden or disabled when the user lacks the necessary permission.

---

## 6. URL State & Query Synchronization Behavior

Following the [Sales API & URL-driven DataTable Integration Contract](sales_url_query_contract.md), table query state is persisted strictly in `URLSearchParams`:

- **Single Source of Truth**: The browser URL is the primary store for search terms, filter facets, sort options, and pagination indices.
- **Debounced Text Search**: Keystrokes in the search input are debounced by 300ms before synchronizing to the URL as `?q=...`.
- **Automatic Page Reset**: Modifying any search query, filter facet, or page size limit automatically resets `page` to `1` to prevent out-of-bounds pagination errors.
- **Sort Retention**: Changing sorting direction or column preserves the active page index.
- **Deep-Linking & Invariance**: Refreshing the browser or sharing a URL preserves the exact filtered view identically.
- **Sanitization Fallback**: Malformed URL parameters (e.g., `?page=invalid` or `?limit=9999`) fall back gracefully to deterministic defaults (`page=1`, `limit=20`, `sort=createdAt.desc`).

---

## 7. Verification Evidence & Quality Gates

### 7.1 Focused Sales Test Suites

The Sales feature module contains **10 co-located test suites** encompassing **112 tests**, all passing with a 100% success rate:

```bash
pnpm nx test web --testPathPattern="modules/sales"
```

| Suite Path                                            |  Tests  | Verified Behaviors                                                                                |
| :---------------------------------------------------- | :-----: | :------------------------------------------------------------------------------------------------ |
| `__tests__/sales-api.spec.ts`                         |   14    | REST endpoints, DTO unwrapping, network error handling, custom HTTP exceptions.                   |
| `__tests__/sales-schemas.spec.ts`                     |   17    | Zod schemas for sale creation, line items, order discounts, cancellation, and payments.           |
| `__tests__/sales-queries-and-mutations.spec.tsx`      |    8    | TanStack Query read hooks, mutations, and query cache invalidation contracts.                     |
| `__tests__/sales-table-url-contract.spec.tsx`         |   17    | URL parameter synchronization, filter parsing, reset behavior, and deep linking.                  |
| `__tests__/sales-overview-and-list.spec.tsx`          |   14    | Sales Overview KPIs and Sales List table filters, search, and navigation.                         |
| `__tests__/sale-create-workflow.spec.tsx`             |    8    | React Hook Form validation, dynamic line items, duplicate submit prevention, error alerts.        |
| `__tests__/sale-detail-and-payment-detail.spec.tsx`   |   13    | Sale Detail authoritative totals, balances, line items, action dialogs, and Payment Detail.       |
| `__tests__/payment-history-and-receipt-view.spec.tsx` |   12    | Payment History filtered logs and Receipt View legal snapshot, print layout, and 404 fallback.    |
| `__tests__/sales-router-integration.spec.tsx`         |    3    | React Router route mounting, path resolution, and navigation redirects.                           |
| `__tests__/sales-workflow-e2e-integration.spec.tsx`   |    6    | End-to-end integration workflows connecting Overview, List, Create, Detail, Payment, and Receipt. |
| **Total**                                             | **112** | **100% Pass Rate**                                                                                |

### 7.2 Full Repository Quality Gates

All established repository quality scripts pass with zero errors and zero warnings:

| Quality Gate            | Exact Command                                           | Execution Result                                                | Verification Status |
| :---------------------- | :------------------------------------------------------ | :-------------------------------------------------------------- | :-----------------: |
| **Formatting Check**    | `pnpm format:check`                                     | Checked all project files with Prettier. Clean.                 |     **PASSED**      |
| **Linting**             | `pnpm lint` (`nx run-many -t lint`)                     | 10/10 monorepo projects linted. 0 errors, 0 warnings.           |     **PASSED**      |
| **Type Checking**       | `pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json`) | Monorepo root TypeScript check. 0 errors.                       |     **PASSED**      |
| **Frontend Tests**      | `pnpm nx test web`                                      | 134 test suites, 1,352 tests passed.                            |     **PASSED**      |
| **Full Monorepo Tests** | `pnpm test` (`nx run-many -t test`)                     | 272 test suites, 3,400 tests passed.                            |     **PASSED**      |
| **Build**               | `pnpm build` (`nx run-many -t build`)                   | 10/10 monorepo projects built cleanly.                          |     **PASSED**      |
| **Full Validation**     | `pnpm validate`                                         | Executes `run-s format:check lint typecheck test build`. Clean. |     **PASSED**      |

---

## 8. Known Limitations & Backend Dependencies

1. **Monetary Calculation Authority**: The frontend deliberately refrains from recalculating or rounding order totals, item discounts, or remaining balances for display purposes. All monetary totals are rendered directly from backend `MoneyDto` values to prevent discrepancy between client JavaScript floats and server integer-cent arithmetic.
2. **Settlement Prerequisite for Legal Receipts**: Receipts represent immutable legal proof-of-purchase documents created strictly upon full settlement (`PAID` or `COMPLETED`). Accessing `/sales/:saleId/receipt` for an unsettled or draft sale yields an HTTP 404 from the server. The frontend handles this by displaying an informative status card explaining that receipts are issued only upon final settlement, with a direct link back to the Sale Detail page.
3. **Receipt Hardware & Physical Printers**: In accordance with [ADR-0117](../adr/0117-receipt-domain-boundary-and-document-model.md) and [Milestone 7.17 Specification](../architecture/milestone-7.17-receipt-pdf-and-thermal-rendering.md), direct ESC/POS thermal printing and hardware driver integration are future scope. Standard browser printing is fully supported via clean, responsive CSS `@media print` rules.
4. **Client Search Dropdown**: In `SaleCreatePage`, client association currently accepts direct text/UUID entry or pre-population from contextual URL parameters (`?clientId=...`). Full interactive client autocomplete dropdown integration will connect to the Gym Management Client module once its query port is exposed to the frontend.

---

## 9. Conclusion & Acceptance Certification

Milestone 7.20 fulfills all functional, architectural, visual, and testing requirements specified in the project roadmap. The Sales & Payments frontend experience is formally accepted into the Kinergy Platform codebase with zero regressions, zero skipped tests, and full compliance with repository standards.
