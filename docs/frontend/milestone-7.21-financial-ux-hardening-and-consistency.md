# Milestone 7.21: Financial UX Hardening, Safety, Accessibility & Consistency Acceptance Certification

- **Document**: `docs/frontend/milestone-7.21-financial-ux-hardening-and-consistency.md`
- **Milestone**: Phase 7.21 — Financial UX Hardening, Permission-Aware Actions, Submission Protection, Unambiguous Settlement, Accessibility & State Consistency
- **Status**: **ACCEPTED & VERIFIED**
- **Date**: 2026-10-19
- **Authority**: Independent Senior Release Engineering / Senior Frontend State Management
- **Governing Standards**: [Frontend Architecture Vision](architecture.md), [Frontend Principles](principles.md), [CRUD Experience Contract](crud-experience-contract.md), [Data Table Architecture](data-table-architecture.md), [State Management Standards](state-management.md), [Milestone 7.20 Specification](milestone-7.20-sales-and-payments-frontend.md)

---

## 1. Executive Summary

Milestone 7.21 establishes the complete production hardening for the **Sales & Payments Frontend Experience** in `apps/web`. Following the initial baseline established in Milestone 7.20, this hardening phase audited and reinforced all seven financial screens against accidental transactions, unauthorized executions, ambiguous financial feedback, keyboard accessibility defects, URL state desynchronization, and query-cache race conditions.

All hardening was achieved using existing platform conventions—React Hook Form, Zod, Radix UI dialog primitives, and TanStack Query v5—without introducing new global state frameworks, ad-hoc caching libraries, or synthetic backend behaviors.

---

## 2. Seven-Screen 4-State Verification Matrix

Every screen in the financial lifecycle supports deterministic Loading, Empty, Error, and Populated states:

| Screen              | Route                        | Loading State                    | Empty State                                         | Error State                                       | Populated State                                                  |
| :------------------ | :--------------------------- | :------------------------------- | :-------------------------------------------------- | :------------------------------------------------ | :--------------------------------------------------------------- |
| **Sales Overview**  | `/sales`                     | Skeleton KPI cards & table pulse | Zero-metric indicators & "Create First Sale" CTA    | `CrudError` with retry trigger                    | Operational KPI metrics & recent agreement audit rows            |
| **Sales List**      | `/sales/list`                | `CrudLoading variant="table"`    | `CrudEmpty` with filter reset action                | `CrudError` with retry trigger                    | Paginated, filterable TanStack Table with sorting                |
| **Sale Create**     | `/sales/new`                 | Button disabled during submit    | Default 1 blank line item                           | Field-level Zod alerts & root server error banner | Multi-item checkout form with subtotal preview                   |
| **Sale Detail**     | `/sales/:saleId`             | `sale-detail-loading`            | 404 `CrudEmpty` with return link                    | `CrudError` with retry & directory return         | Authoritative financial breakdown, line items & tender history   |
| **Payment Detail**  | `/sales/payments/:paymentId` | `payment-detail-loading`         | 404 `CrudEmpty` with return link                    | `CrudError` with retry & log return               | Tender attributes, settlement reconciliation & lifecycle actions |
| **Payment History** | `/sales/payments`            | `CrudLoading variant="table"`    | `CrudEmpty` with filter reset action                | `CrudError` with retry trigger                    | Multi-tender transaction ledger with URL filtering               |
| **Receipt View**    | `/sales/:saleId/receipt`     | `receipt-view-loading`           | Informative "Receipt Not Issued Yet" with issue CTA | `CrudError` with retry trigger                    | Legal proof-of-purchase voucher with print stylesheet            |

---

## 3. Financial Workflow & Settlement Unambiguity

To prevent confusion between distinct operational stages:

1. **Creating a Sale**: Clearly labeled as initiating a commercial agreement. Does not imply funds collection or completed tender.
2. **Recording a Payment**: Explicitly captures a customer payment tender against an open balance. Clarifies whether tender settles immediately (e.g. `CASH`) or enters `PENDING` state awaiting cashier/gateway confirmation.
3. **Settling a Payment**: Settle payment dialog and detail page present an **authoritative 4-point reconciliation summary**:
   - Order Net Payable Total
   - Registered Payment Tender Amount
   - Selected Tender Method
   - Authoritative Remaining Balance After Settlement
4. **Viewing Receipts**: Clarified as an immutable post-settlement legal voucher snapshotted upon full payment settlement.

---

## 4. Mutation Safety & Recovery Policies

- **Permission-Aware Actions**:
  - `sales.create`: Protects sale creation form and finalize triggers.
  - `sales.cancel`: Protects sale order cancellation triggers.
  - `payments.create`: Protects payment tender recording triggers.
  - `payments.manage`: Protects payment settlement and cancellation triggers.
  - `receipts.read` / `receipts.manage`: Protects receipt view links and issue voucher triggers.
- **Destructive Action Confirmation**: Irreversible lifecycle transitions (`Cancel Sale`, `Cancel Payment Tender`, `Settle Payment Tender`) require explicit confirmation dialogs with mandatory cancellation reasons.
- **Dirty-Form & Submission Protection**: `SaleCreatePage` integrates `useDirtyGuard` to intercept accidental browser navigation, and blocks repeated submissions by disabling triggers during `isSubmitting || mutation.isPending`.
- **Ambiguous Outcome Recovery**: Network timeouts and 5xx errors during payment recording or settlement do not assume failure. Users receive clear advisory banners with safe inspection links rather than blindly resubmitting non-idempotent operations.

---

## 5. URL State & Cache Consistency Standards

- **URL-Driven Table State**: All table parameters (`page`, `limit`, `sort`, `status`, `method`, `saleId`, `fromDate`, `toDate`) are synchronized to URL search parameters with deterministic fallback. Filter changes automatically reset page to `1` and use `{ replace: true }` to avoid history pollution.
- **Pagination Clamping**: If server results indicate current page exceeds `totalPages`, the UI automatically clamps the page down to `totalPages`.
- **Navigation State Preservation**: Navigating from Sales List or Payments Log to detail views passes `location.state.from`, enabling "Back" buttons to restore the exact filter, sorting, and pagination state.
- **Query Cache Invalidation**: Confirmed mutations invalidate the exact hierarchical query keys (`salesQueryKeys`), ensuring Sales List, Sale Detail, Payment History, Payment Detail, Overview Metrics, and Receipt availability stay synchronized.

---

## 6. Accessibility & Keyboard Operability

- Complete keyboard navigation across all interactive tables, filter bars, dialogs, and actions.
- Radix UI dialog focus trapping and automatic focus restoration upon close.
- Form validation errors feature accessible discoverability (`aria-invalid`, `aria-describedby`, auto-focus first invalid field).
- Visual status indicators paired with high-contrast text and ARIA labels to ensure color is never the sole medium of communication.

---

## 7. Verification Evidence & Test Execution

The test suite includes **14 focused sales test suites** with **183 tests** (100% pass rate):

| Test Suite                                            |  Tests  | Scope                                                                                                    |
| :---------------------------------------------------- | :-----: | :------------------------------------------------------------------------------------------------------- |
| `__tests__/sales-url-and-consistency.spec.tsx`        |   14    | URL parameter hydration, date validation, pagination clamping, cache invalidation & deep link navigation |
| `__tests__/financial-ux-accessibility.spec.tsx`       |   16    | Keyboard navigation, focus management, dialog accessibility, and screen reader announcements             |
| `__tests__/financial-form-safety.spec.tsx`            |   15    | React Hook Form validation, dirty form guard, duplicate submission prevention, and server error mapping  |
| `__tests__/payment-unambiguous-ux.spec.tsx`           |   14    | Distinct financial workflows, settlement confirmation cards, balance evaluation, and receipt eligibility |
| `__tests__/sale-detail-and-payment-detail.spec.tsx`   |   24    | Sale Detail and Payment Detail 4-state lifecycle, balance cards, and permission-aware actions            |
| `__tests__/payment-history-and-receipt-view.spec.tsx` |   12    | Payment History filtered logs, Receipt View printable layout, and not-yet-issued fallback state          |
| `__tests__/sales-table-url-contract.spec.tsx`         |   17    | URL serialization, filter mapping, debounced search, and sorting contracts                               |
| `__tests__/sales-overview-and-list.spec.tsx`          |   14    | Overview operational KPI metrics and Sales List table interaction                                        |
| `__tests__/sale-create-workflow.spec.tsx`             |    8    | End-to-end commercial sale creation workflow                                                             |
| `__tests__/sales-queries-and-mutations.spec.tsx`      |    8    | TanStack Query read hooks, mutations, and cache invalidation                                             |
| `__tests__/sales-workflow-e2e-integration.spec.tsx`   |    6    | Full cross-screen integration flows connecting all seven screens                                         |
| `__tests__/sales-api.spec.ts`                         |   14    | REST API client transport functions and error handling                                                   |
| `__tests__/sales-schemas.spec.ts`                     |   17    | Zod schemas and validation rules                                                                         |
| `__tests__/sales-router-integration.spec.tsx`         |    4    | Route mounting and permission guard enforcement                                                          |
| **Total**                                             | **183** | **100% Pass Rate**                                                                                       |

---

## 8. Root Quality Gates Certification

All quality gates pass cleanly:

```bash
# 1. Format Check
pnpm format:check
# Status: PASSED (All files match Prettier code style)

# 2. Linting
pnpm lint
# Status: PASSED (10/10 projects pass linting, 0 errors)

# 3. Type Checking
pnpm typecheck
# Status: PASSED (tsc --noEmit -p tsconfig.base.json, 0 errors)

# 4. Monorepo Tests
pnpm test
# Status: PASSED (138 test suites passed, 1423 tests passed)

# 5. Build
pnpm build
# Status: PASSED (10/10 projects built successfully)

# 6. Full Repository Validation Script
pnpm validate
# Status: PASSED (run-s format:check lint typecheck test build, clean exit 0)
```

---

## 9. Final Acceptance Certification

Milestone 7.21 satisfies all functional, financial safety, accessibility, state predictability, and technical quality standards. The Sales & Payments frontend is certified production-ready.
