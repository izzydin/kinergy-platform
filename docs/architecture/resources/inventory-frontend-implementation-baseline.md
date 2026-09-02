# Phase 6: Inventory Frontend Implementation Baseline & Verification

**Status**: `READY FOR IMPLEMENTATION`  
**Milestone**: Milestone 6.12 — Inventory Frontend  
**Domain**: Consumable Inventory UI, State Integration & REST Contract Verification  
**Author**: Principal Frontend Architect, Inventory Domain Engineer & Kinergy ARB  
**Governing Documents**:

- [**ADR-0083: Inventory Movement Ledger and Materialized Stock Mutation Strategy**](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
- [**ADR-0084: Inventory Concurrency Control and Race Condition Prevention**](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)
- [**ADR-0095: Three-Layer Concurrency Defense Strategy for Stock Mutations**](./adr/0095-three-layer-concurrency-defense-for-inventory-mutations.md)
- [**ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH**](./adr/0099-explicit-subresource-state-mutation-endpoints-vs-generic-patch.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Milestone 6.11 Quality Gate & Architecture Baseline**](./milestone-6.11-quality-gate.md)

---

## 1. Implementation Prerequisites Verification

All upstream Phase 6 milestones have completed, been verified, and committed to `main`:

| Prerequisite Milestone                      | Scope & Deliverable                                                           | Status      |
| :------------------------------------------ | :---------------------------------------------------------------------------- | :---------- |
| **Phase 6.0 — Discovery Baseline**          | System taxonomy & bounded context definition                                  | `COMPLETED` |
| **Phase 6.1 — Inventory Domain Model**      | `InventoryItem` aggregate & immutable `StockMovement` ledger                  | `COMPLETED` |
| **Phase 6.3 — State Machines & Invariants** | Non-negative stock invariants & concurrency defense                           | `COMPLETED` |
| **Phase 6.4 — Persistence Layer**           | PostgreSQL schemas, OCC versioning, atomic transactions                       | `COMPLETED` |
| **Phase 6.5 — Inventory Application Layer** | CQRS command & query handlers for all stock operations                        | `COMPLETED` |
| **Phase 6.7 — Authorization & Security**    | RBAC permission model (`inventory.read`, `inventory.write`, `valuation.read`) | `COMPLETED` |
| **Phase 6.8 — Resource Valuation**          | Working capital inventory valuation calculation                               | `COMPLETED` |
| **Phase 6.9 — Backend REST API**            | NestJS `InventoryController` (17 endpoints)                                   | `COMPLETED` |
| **Phase 6.10 — Backend Testing Suite**      | Concurrency race tests, persistence, & auth test suites                       | `COMPLETED` |
| **Phase 6.11 — Frontend Preparation**       | Feature boundaries, routing, query keys, types, URL state, & 4-state UX       | `COMPLETED` |

---

## 2. Authoritative Backend Contract Inventory

The inventory frontend consumes the following verified NestJS REST endpoints (`/api/v1/resources/inventory`):

| Operation               | Method  | Route Path         | Request Payload                                                               | Response Body                                                                | Required Permission               |
| :---------------------- | :------ | :----------------- | :---------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :-------------------------------- |
| **List Categories**     | `GET`   | `/categories`      | None                                                                          | `CategoryMetadataDto[]`                                                      | `inventory.read`                  |
| **List Catalog**        | `GET`   | `/`                | `?search=&category=&status=&stockStatus=&page=&limit=&sortBy=&sortOrder=`     | `PaginatedInventoryResponseDto`                                              | `inventory.read`                  |
| **Low-Stock Alerts**    | `GET`   | `/low-stock`       | None                                                                          | `InventoryItemResponseDto[]`                                                 | `inventory.read`                  |
| **Inventory Valuation** | `GET`   | `/valuation`       | None                                                                          | `InventoryValuationResponseDto`                                              | `inventory.read` + `billing.read` |
| **Get Product Detail**  | `GET`   | `/:id`             | None                                                                          | `InventoryItemResponseDto`                                                   | `inventory.read`                  |
| **Get Stock Level**     | `GET`   | `/:id/stock-level` | None                                                                          | `{ itemId, currentStock, unit, reorderThreshold, isLowStock, isOutOfStock }` | `inventory.read`                  |
| **Movement Ledger**     | `GET`   | `/:id/movements`   | `?page=&limit=`                                                               | `PaginatedStockMovementsResponseDto`                                         | `inventory.read`                  |
| **Create Product**      | `POST`  | `/`                | `CreateInventoryItemRequestDto`                                               | `InventoryItemResponseDto`                                                   | `inventory.write`                 |
| **Update Metadata**     | `PATCH` | `/:id`             | `UpdateInventoryItemRequestDto`                                               | `InventoryItemResponseDto`                                                   | `inventory.write`                 |
| **Archive Product**     | `POST`  | `/:id/archive`     | None                                                                          | `InventoryItemResponseDto`                                                   | `inventory.write`                 |
| **Activate Product**    | `POST`  | `/:id/activate`    | None                                                                          | `InventoryItemResponseDto`                                                   | `inventory.write`                 |
| **Deactivate Product**  | `POST`  | `/:id/deactivate`  | None                                                                          | `InventoryItemResponseDto`                                                   | `inventory.write`                 |
| **Receive Stock**       | `POST`  | `/:id/receive`     | `ReceiveStockRequestDto` (`{ quantity, unitCost?, referenceNumber, notes? }`) | `{ success, movementId, balanceAfter }`                                      | `inventory.write`                 |
| **Sell Stock**          | `POST`  | `/:id/sell`        | `SellStockRequestDto` (`{ quantity, unitPrice?, referenceId?, notes? }`)      | `{ success, movementId, balanceAfter }`                                      | `inventory.write`                 |
| **Consume Stock**       | `POST`  | `/:id/consume`     | `ConsumeStockRequestDto` (`{ quantity, treatmentSessionId?, notes? }`)        | `{ success, movementId, balanceAfter }`                                      | `inventory.write`                 |
| **Scrap Stock**         | `POST`  | `/:id/scrap`       | `ScrapStockRequestDto` (`{ quantity, reason }`)                               | `{ success, movementId, balanceAfter }`                                      | `inventory.write`                 |
| **Adjust Stock**        | `POST`  | `/:id/adjust`      | `AdjustStockRequestDto` (`{ deltaQuantity, reason }`)                         | `{ success, movementId, balanceAfter }`                                      | `inventory.write`                 |

---

## 3. Inventory Business-Rule Summary

1. **Non-Negative Stock Invariant**: Physical stock on hand can **never** become negative ($currentStock \ge 0$). Any sale, consumption, or scrap attempting to deduct more stock than available will be rejected by the server with `400 Bad Request` (`INSUFFICIENT_STOCK`).
2. **Double-Entry Movement Ledger**: Every mutation that modifies stock level writes an immutable audit record to the `StockMovement` table with exact timestamp, delta, actor ID, and reference reason.
3. **Pessimistic Client-Side State**: The frontend **never** guesses or computes stock balance locally. Mutations invalidate the `inventoryQueryKeys.detail(id)`, `stock(id)`, and `movements(id)` queries to refetch authoritative database values.
4. **Low-Stock Alert Invariant**: An item is classified as low-stock when $currentStock \le reorderThreshold$, including when stock is zero.
5. **Metadata vs. Stock Segregation (ADR-0099)**: `PATCH /:id` allows updating name, description, category, unit, pricing, and reorder thresholds. Stock quantity on hand is strictly immutable in `PATCH` and requires dedicated action endpoints.

---

## 4. Approved Frontend Architecture Constraints

```
apps/web/src/modules/resources/inventory/
├── api/
│   ├── inventory-api.ts             # Axios HTTP transport client
│   └── inventory-query-keys.ts      # Canonical hierarchical query key factory
├── components/
│   ├── inventory-status-badge.tsx   # Active / Inactive / Archived status pills
│   ├── stock-level-gauge.tsx        # Visual stock progress & low-stock indicator
│   ├── movement-type-badge.tsx      # Color-coded movement ledger type pills
│   ├── record-purchase-modal.tsx    # Purchase receipt modal dialog
│   ├── record-sale-modal.tsx        # Retail point-of-sale modal dialog
│   ├── record-consumption-modal.tsx # Treatment session consumption modal dialog
│   ├── adjust-stock-modal.tsx       # Physical count adjustment modal dialog
│   └── scrap-stock-modal.tsx        # Damaged / expired inventory scrap modal dialog
├── hooks/
│   ├── use-inventory-filters.ts     # URL state controller for catalog table
│   ├── use-movement-filters.ts      # URL state controller for movement ledger
│   ├── use-inventory-queries.ts     # TanStack query hooks (list, detail, movements)
│   └── use-inventory-mutations.ts   # TanStack mutation hooks with toast feedback
├── routes/
│   ├── inventory-list-page.tsx      # Main catalog DataTable view with faceted filters
│   ├── inventory-detail-page.tsx    # Single product workspace, stock gauge & movement ledger
│   └── inventory.router.tsx         # Sub-router mapping /resources/inventory/*
├── schemas/
│   └── inventory.schema.ts          # Zod validation schemas for forms and modals
├── types/
│   └── inventory.types.ts           # Pure REST ViewModels and filter parameter interfaces
└── index.ts                         # Public sub-feature barrel export
```

---

## 5. Required Reusable Infrastructure

- **UI Primitives (`@kinergy-platform/ui`)**: `Button`, `Badge`, `Card`, `Dialog`, `Skeleton`, `Toast`, `Alert`, `StateView`.
- **DataTable Framework (`src/shared/table`)**: `DataTable`, `useTableUrlState`, `DataTablePagination`, `DataTableToolbar`, `DataTableSearch`, `DataTableFacetedFilter`, `DataTableSkeleton`, `DataTableEmpty`, `DataTableError`.
- **Form Infrastructure (`src/shared/forms`)**: `FormLayout`, `FormSection`, `FormFieldGroup`, `FormSubmitButton`, `useDirtyDialogGuard`.
- **Authorization (`src/shared/auth` / `app/routes`)**: `<HasPermission />`, `<RequirePermission />`, `useAuth()`.
- **Feedback (`src/app/providers`)**: `useNotification().success()`, `useNotification().error()`.

---

## 6. Known Risks & Mitigations

- **Risk: High-Contention Concurrent Stock Mutations**: Multiple employees selling or consuming stock simultaneously.
  - **Mitigation**: Backend uses PostgreSQL OCC and database row locking; frontend rolls back snapshots on `409 Conflict`, displays normalized error toast, and invalidates cache to reflect true state.
- **Risk: Sensitive Cost Leakage**: Unauthorized staff viewing unit acquisition cost.
  - **Mitigation**: Dual layer — backend strips purchase cost if caller lacks `billing.read`/`valuation.read`, and frontend tables conditionally render price columns via `hasPermission('valuation.read')`.

---

## 7. Contract Gaps & Blocking Issues

- **Contract Gaps**: None. All 17 inventory endpoints are implemented, tested, and documented.
- **Blocking Issues**: None.

---

## 8. Implementation Readiness Decision

**Decision**: `APPROVED — PROCEED TO MILESTONE 6.12 IMPLEMENTATION`

The inventory domain, REST contracts, query state rules, URL parameter models, and UX state behaviors are 100% aligned with Kinergy architecture.
