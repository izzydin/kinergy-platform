# Milestone 7.11: Sale Application Layer Specification & Traceability Matrix

- **Document**: `docs/architecture/sale-application-use-cases-and-traceability.md`
- **Status**: Authoritative Technical Specification (APPROVED FOR MILESTONE 7.11)
- **Role**: Senior Technical Documentation Architect
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/application/`)
- **Date**: 2026-10-06
- **Associated ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](../adr/0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](../adr/0021-transactional-consistency-unit-of-work.md)
  - [ADR-0025: Role and Permission Authorization Framework](../adr/0025-role-and-permission-authorization-framework.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discount Domain Model](../adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Integrity](../adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](../adr/0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](../adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0132: Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts](../adr/0132-sale-application-layer-architecture.md)

---

## 1. Architectural Axioms & Separation of Concerns

Under Kinergy's Clean and Hexagonal Architecture, responsibility is distributed with strict separation of concerns across four authoritative tiers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ARCHITECTURAL SEPARATION                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. APPLICATION ORCHESTRATES                                                            │
│    Coordinates multi-aggregate workflows, loads domain models by identifier, manages  │
│    transaction boundaries, validates caller context, maps DTOs, and publishes events.  │
│    Owns ZERO financial arithmetic, state-transition rules, or pricing algorithms.     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. DOMAIN DECIDES                                                                      │
│    The Sale Aggregate Root authoritatively enforces commercial invariants, recalculates│
│    exact 13-formula totals in integer cents, caps discounts, and governs transitions. │
│    Remains 100% pure TypeScript; unaware of HTTP, NestJS, Prisma, or SQL.             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. REPOSITORY PERSISTS                                                                 │
│    The SaleRepositoryPort adapter bridges domain models and relational persistence.    │
│    Coordinates snapshot-isolation transactions, translates ORM entities, executes OCC │
│    optimistic lock version checks, and handles differential child synchronizations.    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. DATABASE ENFORCES STRUCTURAL INTEGRITY                                              │
│    PostgreSQL database engine enforces hard constraints: primary keys, foreign keys,   │
│    composite uniqueness (single active billing), non-negative check constraints, and  │
│    atomic ACID guarantees (SQLSTATE 23505, 23514).                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Milestone 7.11 Application Use-Case Catalog

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         USE-CASE CLASSIFICATION & PROTOCOL                                       │
├────────────────────┬──────────┬─────────────────────────────┬───────────────────────────────┬────────────────────┤
│ USE CASE           │ CQRS     │ AGGREGATES INVOLVED         │ TRANSACTION SCOPE             │ PERSISTENCE OCC    │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ CreateSale         │ Command  │ Sale (Root)                 │ Local DB Transaction          │ version = 1 (init) │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ AddSaleItem        │ Command  │ Sale, SaleItem (Child)      │ Local DB Transaction          │ version check (+1) │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ RemoveSaleItem     │ Command  │ Sale, SaleItem (Child)      │ Local DB Transaction          │ version check (+1) │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ ApplyDiscount      │ Command  │ Sale, SaleItem (Optional)   │ Local DB Transaction          │ version check (+1) │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ CalculateSale      │ Query    │ Sale (In-Memory Aggregate)  │ Side-Effect Free (Zero Writes)│ Version Invariant  │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ GetSale            │ Query    │ Sale (Read Projection)      │ Side-Effect Free (Zero Writes)│ Version Invariant  │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ ListSales          │ Query    │ Sale (Projections)          │ Side-Effect Free (Zero Writes)│ Version Invariant  │
├────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ CancelSale         │ Command  │ Sale (Terminal Transition)  │ Local DB Transaction          │ version check (+1) │
└────────────────────┴──────────┴─────────────────────────────┴───────────────────────────────┴────────────────────┘
```

---

### 2.1 CreateSale (Command)

- **Intent**: Initializes a new commercial checkout session in `DRAFT` status, sets initial zero monetary totals, binds origin source context, validates multi-tenant isolation, and sets up initial line items or order discounts if provided.
- **Input**: [`CreateSaleInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/create-sale.command.ts)
  - `id?: string` (Optional client-supplied UUID / idempotency identifier).
  - `idempotencyKey?: string` (Optional client deduplication key).
  - `tenantId?: string` (Mandatory tenant isolation partition).
  - `clientId?: string` (Optional customer reference; supports anonymous retail walk-ins).
  - `currency?: string` (Optional ISO-4217 currency code; defaults to `USD`).
  - `source?: { sourceType: string; sourceId: string; sourceCode?: string | null }` (Commercial origin context).
  - `allowWalkInWithoutSource?: boolean` (Permits retail walk-ins without upstream appointment/membership).
  - `expectedContext?: string` (Expected upstream context for anti-corruption validation).
  - `items?: CreateSaleItemInput[]` (Optional initial basket line items).
  - `orderDiscount?: { type: string; value: number; reason?: string | null }` (Optional order-level discount).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts) (ACL Port)
  - [`ClientFacadePort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/client-facade.port.ts) (ACL Port)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - [`SaleSource.create(sourceType, sourceId, sourceCode)`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/sale-source.vo.ts)
  - [`Sale.create({ id, tenantId, clientId, currency, source, items, orderDiscount })`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts)
- **Errors Emitted**:
  - `InvalidSaleSourceException` (Malformed origin or unsupported origin type; [ADR-0121](../adr/0121-sale-source-references-and-commercial-origin-model.md)).
  - `SourceNotFoundException` (Source entity not found in upstream bounded context).
  - `ClientNotFoundException` (Supplied `clientId` not found in client context).
  - `DuplicateSaleException` (Active sale already exists for clinical session or order reference; [ADR-0120](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)).
  - `InvalidMoneyException` (Unsupported or malformed ISO-4217 currency code; [ADR-0108](../adr/0108-money-representation.md)).
- **Transaction Boundary**: Atomic relational transaction executed via `saleRepository.withTransaction`. Parent `sales` row and initial `sale_items` rows persist atomically.
- **Authorization**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`. Tenant scoping strictly enforced.
- **Idempotency**: Supported via `idempotencyKey`, `input.id`, or clinical session single-active-billing verification. Re-submitting identical creation returns existing sale representation.

---

### 2.2 AddSaleItem (Command)

- **Intent**: Appends a line item to an active `DRAFT` checkout session. Enforces single-currency homogeneity against the sale agreement, delegates item pricing and derived totals recalculation to the aggregate root, advances optimistic concurrency version, and persists updated state.
- **Input**: [`AddSaleItemInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/add-sale-item.command.ts)
  - `saleId: string` (Target sale unique identifier).
  - `source?: { sourceType: string; sourceId: string; sourceCode?: string | null }` (Optional line item origin; defaults to parent sale source).
  - `description: string` (Human-readable item title).
  - `skuOrCode?: string | null` (Optional catalog SKU).
  - `quantity: number` (Strictly positive integer or decimal quantity $\le 3$ decimal places).
  - `unitPriceAmount: number` (Non-negative unit price).
  - `discount?: { type: string; value: number; reason?: string | null } | null` (Optional item-level discount).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - [`sale.addItem({ source, description, skuOrCode, quantity, unitPrice, discount })`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts)
  - Internal aggregate `assertDraftState()` and `recalculateTotals()` ([ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)).
- **Errors Emitted**:
  - `SaleNotFoundException` (Target sale does not exist).
  - `SaleAlreadyFinalizedException` (Attempting to add items to a non-`DRAFT` sale; [ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).
  - `InvalidSaleItemException` (Negative price, non-positive quantity, or fractional underflow; [ADR-0113](../adr/0113-item-level-discounts.md)).
  - `InvalidSaleStateException` (Currency mismatch between item and parent sale).
  - `SaleOptimisticLockException` (Concurrent checkout write collision; [ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)).
- **Transaction Boundary**: Local transaction in `SaleRepositoryPort.save()`. Parent `sales` totals are updated and child `sale_items` row is inserted.
- **Authorization**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`.
- **Idempotency**: Non-idempotent by default (successive executions add additional line items unless client coordinates item identity).

---

### 2.3 RemoveSaleItem (Command)

- **Intent**: Removes an existing line item from an active `DRAFT` checkout session, triggers authoritative domain financial recalculation, differential relational deletion, and advances concurrency version.
- **Input**: [`RemoveSaleItemInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/remove-sale-item.command.ts)
  - `saleId: string` (Target sale unique identifier).
  - `itemId: string` (Unique identifier of line item to remove).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - [`sale.removeItem(itemId)`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts)
  - Internal aggregate `assertDraftState()` and `recalculateTotals()`.
- **Errors Emitted**:
  - `SaleNotFoundException` (Target sale does not exist).
  - `SaleAlreadyFinalizedException` (Attempting to remove items from a finalized or cancelled sale).
  - `InvalidSaleStateException` (Line item identifier does not exist within targeted sale).
  - `SaleOptimisticLockException` (Concurrent update collision).
- **Transaction Boundary**: Local transaction in `SaleRepositoryPort.save()`. Removed item is deleted via differential SQL synchronization (`DELETE FROM sale_items WHERE sale_id = :saleId AND id NOT IN (:activeIds)`).
- **Authorization**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`.
- **Idempotency**: State-idempotent (item is removed); re-executing with the same `itemId` yields `InvalidSaleStateException` (item not found in aggregate).

---

### 2.4 ApplyDiscount (Command)

- **Intent**: Applies an order-level or item-level discount (percentage or fixed nominal value) to a `DRAFT` checkout session, validates discount parameters, recomputes financial totals through domain integer arithmetic, and persists the agreement.
- **Input**: [`ApplyDiscountInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/apply-discount.command.ts)
  - `saleId: string` (Target sale unique identifier).
  - `itemId?: string` (Optional line item ID; if omitted, applies order-level discount).
  - `discount: { type: string; value: number; reason?: string | null }` (Discount specification).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - [`Discount.create(type, value, reason)`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts)
  - `sale.applyOrderDiscount(discount)` OR `sale.applyItemDiscount(itemId, discount)`
  - Internal aggregate `recalculateTotals()` ([ADR-0113](../adr/0113-item-level-discounts.md), [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)).
- **Errors Emitted**:
  - `SaleNotFoundException` (Target sale does not exist).
  - `SaleAlreadyFinalizedException` (Sale has departed `DRAFT` status; commercial terms frozen).
  - `InvalidDiscountException` (Negative discount value, percentage $> 100\%$, or fixed reduction exceeding subtotal).
  - `SaleOptimisticLockException` (Version collision).
- **Transaction Boundary**: Atomic persistence in `SaleRepositoryPort.save()`. Order discount is saved into parent flattened columns (`order_discount_type`, `order_discount_value`, `order_discount_reason`).
- **Authorization**: Requires `sales.create` or `sales.discount` privileges; roles: `Owner`, `Manager`, `Receptionist`.
- **Idempotency**: Idempotent; reapplying the identical discount yields the identical financial state.

---

### 2.5 CalculateSale (Query / Authoritative Financial Calculation)

- **Intent**: Exposes the Sale Aggregate's authoritative financial calculations (subtotal, line discounts, order discount, net grand total) through the application boundary by executing domain calculation logic without database writes.
- **Input**: [`CalculateSaleInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/calculate-sale.query.ts)
  - `saleId: string` (Target sale unique identifier).
- **Output**: `SalesApplicationResult<SaleTotalsDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (Read-only `findById`).
- **Domain Operations Invoked**:
  - [`sale.calculateTotals()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts): executes canonical 13 reconciliation formulas ([ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)).
- **Errors Emitted**:
  - `SaleNotFoundException` (Target sale does not exist).
  - `SaleAlreadyFinalizedException` (Attempting calculation on finalized/cancelled sale where terms are permanently locked).
  - `InvalidSaleStateException` (Empty or malformed sale ID).
- **Transaction Boundary**: **Zero database write transaction**. Pure in-memory calculation on reconstituted aggregate; executes zero database writes, zero row locks, and increments zero OCC versions.
- **Authorization**: Requires `sales.read` or `sales.create` permission; accessible to cashier carts and checkout summary widgets.
- **Idempotency**: Pure inquiry; 100% idempotent and deterministic.

---

### 2.6 GetSale (Query / Authoritative Commercial Read Representation)

- **Intent**: Retrieves the complete commercial state of a sale order by domain identifier, including all line items, applied discounts, origin source reference, and canonical monetary breakdowns without leaking internal domain entities or mutable pointers.
- **Input**: [`GetSaleInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/get-sale.query.ts)
  - `saleId: string` (Target sale unique identifier).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (Read-only `findById`).
- **Domain Operations Invoked**:
  - Reads domain properties and value objects via encapsulated getters.
- **Errors Emitted**:
  - `SaleNotFoundException` (Sale does not exist).
  - `InvalidSaleStateException` (Empty or whitespace sale identifier).
- **Transaction Boundary**: Zero database transaction. Read-only SQL query (`prisma.sale.findUnique({ include: { items: true } })`).
- **Authorization**: Requires `sales.read` permission; roles: `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`.
- **Idempotency**: Pure inquiry; 100% idempotent.

---

### 2.7 ListSales (Query)

- **Intent**: Retrieves a paginated, filtered, and deterministically sorted collection of sales orders within a tenant boundary for cashier dashboards, administrative audit, and operational reporting.
- **Input**: [`ListSalesInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/list-sales.query.ts)
  - `tenantId?: string` (Mandatory tenant isolation scope).
  - `filter?: { status?: string; clientId?: string; sourceType?: string; fromDate?: Date; toDate?: Date }`
  - `pagination?: { page?: number; limit?: number }` (1-indexed page, default limit 20, max cap 100).
  - `sort?: { field?: string; direction?: 'asc' | 'desc' }` (Default `createdAt: desc`).
  - Flat parameters supported: `clientId`, `status`, `sourceType`, `page`, `limit`, `sortBy`, `sortDirection`.
- **Output**: `SalesApplicationResult<PaginatedResultDTO<SaleSummaryDTO>>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (`findMany`, `count`).
- **Domain Operations Invoked**: None (Read-only projection).
- **Errors Emitted**:
  - `InvalidSaleQueryException` (Malformed date bounds or negative pagination parameters).
- **Transaction Boundary**: Zero database transaction. Read-only SQL query.
- **Authorization**: Requires `sales.read` permission; scoped strictly to authenticated tenant.
- **Idempotency**: Pure inquiry; 100% idempotent.

---

### 2.8 CancelSale (Command)

- **Intent**: Cancels an active commercial agreement in `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID` status, records an audit justification reason, transitions the aggregate to terminal `CANCELLED` status, permanently freezes the agreement, and releases single-active-billing locks.
- **Input**: [`CancelSaleInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/cancel-sale.command.ts)
  - `saleId: string` (Target sale unique identifier).
  - `reason: string` (Mandatory non-empty cancellation audit justification).
  - `tenantId?: string` (Optional tenant verification).
- **Output**: `SalesApplicationResult<SaleDTO>`
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - [`sale.cancel(reason, clock)`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts)
  - Records [`SaleCancelledEvent`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/events/sale-cancelled.event.ts).
- **Errors Emitted**:
  - `SaleNotFoundException` (Target sale does not exist).
  - `InvalidSaleStateException` (Empty or whitespace-only cancellation reason).
  - `InvalidSaleTransitionException` (Sale is already in `PAID`, `COMPLETED`, or terminal status; [ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).
  - `SaleOptimisticLockException` (Concurrent update collision).
- **Transaction Boundary**: Atomic persistence in `SaleRepositoryPort.save()`. Persistence guard verifies existing record is not already `CANCELLED` or `REFUNDED` before updating.
- **Authorization**: Requires `sales.cancel` or `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`.
- **Idempotency**: Non-idempotent; subsequent cancellation calls on an already cancelled sale fail with `InvalidSaleTransitionException`.

---

## 3. End-to-End Architectural Traceability Matrix

The following matrix traces every commercial business requirement through domain rules, application use cases, repository ports, relational persistence guarantees, and verified test suites:

| #         | Business Requirement                                                                                             | Domain Rule (ADR)                                                                                                                                                                              | Application Use Case    | Repository Port                              | Persistence Guarantee (PostgreSQL)                                                                                        | Test Coverage Proof                                                                         |
| :-------- | :--------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ |
| **BR-01** | **Deterministic Checkout Session**: Cashier initializes checkout agreement with exact $0.00 totals.              | Invariant SALE-01 ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)); Currency homogeneity ([ADR-0108](../adr/0108-money-representation.md)).                                 | `CreateSaleHandler`     | `SaleRepositoryPort.save()`                  | `sales.subtotal_amount = 0.00`, `sales.total_amount = 0.00`, `status = 'DRAFT'`.                                          | `create-sale.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`               |
| **BR-02** | **Single-Active-Billing Invariant**: Clinical sessions must be billed at most once across active checkouts.      | Invariant SALE-010 ([ADR-0120](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md), [ADR-0121](../adr/0121-sale-source-references-and-commercial-origin-model.md)).         | `CreateSaleHandler`     | `SaleRepositoryPort.findBySourceReference()` | Partial unique index `unique_active_source_billing` on `(tenant_id, source_type, source_id) WHERE status != 'CANCELLED'`. | `sale-source-uniqueness-semantics.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`  |
| **BR-03** | **Line Item Addition & Integrity**: Cashier appends catalog items; totals recalculate deterministically.         | Invariant SALE-02, SALE-04 ([ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)). Quantity $> 0$, Price $\ge 0$.                                                              | `AddSaleItemHandler`    | `SaleRepositoryPort.save()`                  | Foreign key `sale_items.sale_id -> sales.id ON DELETE CASCADE`. `CHECK (quantity > 0)`.                                   | `add-sale-item.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`             |
| **BR-04** | **Line Item Deletion & Recalculation**: Removing line items adjusts totals and physically deletes child records. | Invariant SALE-04 ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)); Totals recalculation formulas.                                                                          | `RemoveSaleItemHandler` | `SaleRepositoryPort.save()`                  | Differential child synchronization: `DELETE FROM sale_items WHERE sale_id = :id AND id NOT IN (:activeIds)`.              | `remove-sale-item.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`          |
| **BR-05** | **Commercial Discount Flexibility**: Supports percentage and fixed order and line-item discounts.                | Invariant SALE-03 ([ADR-0113](../adr/0113-item-level-discounts.md), [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)); Discount $\le 100\%$, Net Total $\ge 0$.            | `ApplyDiscountHandler`  | `SaleRepositoryPort.save()`                  | Flattened columns: `order_discount_type`, `order_discount_value`, `discount_total_amount`.                                | `apply-discount.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`            |
| **BR-06** | **Authoritative Totals Calculation**: Cashier carts view certified totals without database writes.               | 13 Canonical Reconciliation Formulas ([ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)). Integer cent arithmetic.                                                          | `CalculateSaleHandler`  | `SaleRepositoryPort.findById()`              | Read-only inquiry; zero SQL writes, zero OCC increments, zero row lock contention.                                        | `calculate-sale.handler.spec.ts`<br>`sale-application-totals.spec.ts`                       |
| **BR-07** | **Commercial State Inspection**: Frontend fetches complete immutable checkout DTO.                               | Clean Architecture DTO Projection ([ADR-0132](../adr/0132-sale-application-layer-architecture.md)). Zero entity or ORM leakage.                                                                | `GetSaleHandler`        | `SaleRepositoryPort.findById()`              | `prisma.sale.findUnique({ include: { items: true } })` mapped through `SaleMapper.toDTO()`.                               | `get-sale.handler.spec.ts`<br>`sale-contracts-and-mappings.spec.ts`                         |
| **BR-08** | **Audited Dashboard Listing**: Administrators query paginated, sorted, and filtered sales.                       | Tenant Boundary Isolation ([ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0131](../adr/0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)). | `ListSalesHandler`      | `SaleRepositoryPort.list()`                  | Composite indexes `(tenant_id, created_at DESC)`, `(tenant_id, status)`.                                                  | `list-sales.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`                |
| **BR-09** | **Audit Justified Cancellation**: Cashiers cancel active drafts; terminal state permanently frozen.              | Invariant SALE-06, SALE-07 ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)); Mandatory non-empty reason.                                                                    | `CancelSaleHandler`     | `SaleRepositoryPort.save()`                  | `status = 'CANCELLED'`, `cancellation_reason = :reason`, `cancelled_at = :timestamp`. Terminal guard in repo.             | `cancel-sale.handler.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts`               |
| **BR-10** | **Lost Update Prevention**: Concurrent cashier edits cannot silently overwrite totals or items.                  | Optimistic Concurrency Control (OCC) ([ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)). Integer `_version`.                                                  | All mutating commands   | `SaleRepositoryPort.save()`                  | `UPDATE sales SET version = :newVersion WHERE id = :id AND version = :expectedVersion`. Throws if count = 0.              | `sale-command-transaction-rollback.spec.ts`<br>`sale-concurrency-lost-updates.spec.ts`      |
| **BR-11** | **Atomic Multi-Entity Rollback**: Database errors during child line-item sync discard all changes.               | ACID Unit of Work ([ADR-0021](../adr/0021-transactional-consistency-unit-of-work.md), [ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)).                      | All mutating commands   | `SaleRepositoryPort.save()`                  | Prisma Interactive Transaction `$transaction`. Rollback on SQLSTATE constraint violations (23505, 23514).                 | `sale-command-transaction-rollback.spec.ts`<br>`sales-use-cases-prisma-integration.spec.ts` |
| **BR-12** | **Multi-Transport Controller Readiness**: Handlers callable from HTTP, Background Jobs, CLI, and Messaging.      | Hexagonal Port-Adapter Architecture ([ADR-0010](../adr/0010-backend-clean-architecture-layering.md), [ADR-0132](../adr/0132-sale-application-layer-architecture.md)).                          | All use cases           | Port Interfaces                              | Zero `@nestjs`, zero `express`, zero `PrismaClient` in application source.                                                | `sale-application-controller-readiness.spec.ts`                                             |

---

## 4. Verification and Governance

All architectural rules defined in this specification are enforced by continuous quality gates:

1. **Static Boundary Guard**: Verified by [`sale-application-controller-readiness.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/sale-application-controller-readiness.spec.ts), guaranteeing zero framework leakage in `packages/core/src/sales/application`.
2. **Integration Persistence Path**: Verified by [`sales-use-cases-prisma-integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sales-use-cases-prisma-integration.spec.ts), ensuring real aggregate mutations correctly persist into PostgreSQL tables.
3. **Rollback & OCC Concurrency**: Verified by [`sale-command-transaction-rollback.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/sale-command-transaction-rollback.spec.ts) and [`sale-concurrency-lost-updates.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-concurrency-lost-updates.spec.ts).
