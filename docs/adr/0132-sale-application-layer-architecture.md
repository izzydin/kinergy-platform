# 0132. Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts

- **Status**: Accepted
- **Date**: 2026-10-05
- **Deciders**: Principal Software Architect, Senior Financial Systems Architect, Lead Core Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.11: Sale Application Layer). Following domain foundation (ADR-0108 through ADR-0121) and relational persistence architecture (ADR-0122 through ADR-0131), this ADR formally establishes the application-layer orchestration boundary for the Sale aggregate root.
- **Consulted ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0079: Gym Management Application Layer Use-Case Inventory & Architecture](0079-gym-management-application-use-case-inventory-and-architecture.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discount Domain Model](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)

---

## 1. Context and Problem Statement

Milestones 7.1 through 7.10 established a rich, pure TypeScript domain layer centered around the [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) aggregate root, [`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts) aggregate root, [`Receipt`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/receipt.aggregate.ts) aggregate root, [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts) value objects, and hardened Prisma relational persistence.

Without a well-defined application layer:

1. Controllers risk manipulating aggregates directly, bypassing domain invariants or leaking framework concerns into the core.
2. Business rules (such as financial total calculations, state machine transitions, and discount caps) risk being re-implemented in procedural service classes.
3. Multi-aggregate workflows (such as coordinating payment settlements against sales) risk becoming entangled, violating DDD aggregate boundary autonomy.

To orchestrate the commercial checkout capabilities safely, we must formalize the boundaries, contracts, responsibilities, and use-case catalog of the **Sale Application Layer**.

---

## 2. Application Layer Architectural Boundaries

### 2.1 What the Application Layer IS Responsible For

Under Clean and Hexagonal Architecture, the application layer acts as the orchestrator of business scenarios. Its responsibilities are strictly bounded to:

1. **Accepting use-case input**: Receiving strongly-typed, framework-agnostic Command or Query input structures (`*Input`).
2. **Loading required aggregates and entities**: Utilizing explicit repository ports ([`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts), [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts)) to retrieve domain models by domain identifiers.
3. **Coordinating repositories**: Selecting, loading, and persisting aggregates without coupling to underlying SQL drivers or ORM handles.
4. **Invoking domain behavior**: Calling explicit business methods on aggregate roots (e.g. `sale.addItem()`, `sale.finalize()`, `sale.cancel()`).
5. **Managing transaction boundaries**: Coordinating atomic unit-of-work boundaries across multiple operations or ambient database transactions (`$transaction` / `IUnitOfWork`).
6. **Mapping application input to domain values**: Converting primitive input types (e.g., raw currency strings, numeric amounts, discount descriptors) into rich domain Value Objects ([`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts), [`Discount`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts), [`SaleSource`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/sale-source.vo.ts)).
7. **Mapping domain results to application output**: Transforming internal domain entities into immutable, serialized Data Transfer Objects ([`SaleDTO`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/dtos/sale.dto.ts)) via dedicated mappers ([`SaleMapper`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/mappers/sale.mapper.ts)).
8. **Handling authorization and context boundaries**: Enforcing caller tenant boundaries, permission scopes, and cross-context Anti-Corruption Layer (ACL) validations ([`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts), [`ClientFacadePort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/client-facade.port.ts)).
9. **Dispatching domain events**: Collecting uncommitted domain events from aggregates post-commit, publishing them to [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts), and clearing aggregate event queues.
10. **Returning application-level results**: Encapsulating execution outcomes in explicit, type-safe functional containers ([`SalesApplicationResult`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/shared/sales-application-result.ts)).

### 2.2 What the Application Layer is NOT Responsible For

The application layer contains zero commercial policy logic. It is strictly forbidden from:

1. **Calculating Sale totals directly**: Subtotal, line discounts, net order discounts, and grand totals are calculated **exclusively** inside the [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) aggregate root using integer minor-unit arithmetic.
2. **Validating domain invariants directly**: Rules such as non-empty baskets upon finalization (`EMPTY_SALE`), non-negative totals, single-currency homogeneity, and progressive immutability belong strictly inside domain entities and value objects.
3. **Deciding whether a discount is valid**: Maximum discount caps, fixed vs. percentage calculations, and subtotal thresholds are enforced by the [`Discount`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/discount.vo.ts) value object and `Sale` aggregate.
4. **Changing aggregate state through unrestricted setters**: Domain aggregates expose zero public property setters. State changes occur exclusively via explicit business methods.
5. **Implementing Payment state transitions**: Payment lifecycle progression (`PENDING -> COMPLETED -> REFUNDED`) is governed exclusively by [`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts) and [`PaymentLifecycleStateMachine`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/services/payment-lifecycle.state-machine.ts).
6. **Duplicating Money arithmetic**: Rounding policies, banker's rounding, cent conversions, and currency mismatches are handled strictly by the [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts) value object.
7. **Duplicating Sale lifecycle rules**: Determining if a sale can transition from `PENDING_PAYMENT` to `CANCELLED` or whether commercial terms are frozen is an internal aggregate invariant (`sale.canTransitionTo()`).

---

## 3. CQRS Pattern: Commands vs. Queries

To preserve architectural clarity, high operational throughput, and strict segregation of side-effects, the Sales application layer adheres to **Command Query Responsibility Segregation (CQRS)**:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                SALES APPLICATION LAYER                 │
                  ├────────────────────────────┬───────────────────────────┤
                  │     COMMAND PIPELINE       │      QUERY PIPELINE       │
                  ├────────────────────────────┼───────────────────────────┤
                  │ Mutates aggregate state    │ Read-only; zero mutation  │
                  │ Enforces business rules    │ Fast projection & DTOs    │
                  │ Atomic DB Transactions     │ No transaction / Read-only│
                  │ Emits Domain Events        │ Zero event emission       │
                  │ Increments OCC Version     │ Version invariant         │
                  │ Returns SalesAppResult<DTO>│ Returns SalesAppResult<DTO│
                  └────────────────────────────┴───────────────────────────┘
```

### 3.1 Commands (Write Operations)

- **Interface Contract**: Implements [`SalesCommandHandler<TCommand, SalesApplicationResult<TResult>>`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/shared/sales-command-handler.interface.ts).
- **Semantics**: Represents an intention to mutate business state.
- **Side Effects**: Modifies domain aggregates, increments optimistic concurrency control (OCC) versions, writes to PostgreSQL persistence, and emits domain events upon transaction commit.

### 3.2 Queries (Read Operations)

- **Interface Contract**: Implements [`SalesQueryHandler<TQuery, SalesApplicationResult<TResult>>`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/shared/sales-query-handler.interface.ts).
- **Semantics**: Represents an inquiry for data without side-effects.
- **Guarantees**: Strictly read-only; executes zero database writes, zero aggregate mutations, and zero domain event publications.

### 3.3 Elimination of Generic "UseCaseBase" Abstractions

In alignment with Kinergy's existing architecture:

- **No inheritance-based `UseCaseBase` class is introduced.**
- Inheritance hierarchies for use cases introduce artificial coupling, obscure lifecycle hooks, and complicate unit testing.
- Handlers rely on lightweight, composable interfaces (`SalesCommandHandler`, `SalesQueryHandler`) and functional result wrapping via [`SalesApplicationResult`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/shared/sales-application-result.ts).

---

## 4. Comprehensive Sale Use-Case Inventory

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SALE APPLICATION USE-CASE CATALOG                                         │
├────────────────────┬──────────┬─────────────────────────────┬────────────────────────────────┬──────────────────┤
│ USE CASE           │ TYPE     │ AGGREGATES INVOLVED         │ TRANSACTION SCOPE              │ EMITTED EVENT    │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ CreateSale         │ Command  │ Sale                        │ Local DB Transaction           │ SaleCreatedEvent │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ AddSaleItem        │ Command  │ Sale, SaleItem              │ Local DB Transaction           │ SaleItemAddedEvent│
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ RemoveSaleItem     │ Command  │ Sale, SaleItem              │ Local DB Transaction           │ SaleItemRemovedEv│
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ ApplyDiscount      │ Command  │ Sale, SaleItem (opt)        │ Local DB Transaction           │ None             │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ CalculateSale      │ Query    │ Sale (Read-Only Calculation)│ Zero DB Transaction (In-Memory)│ None             │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ GetSale            │ Query    │ Sale                        │ Read-Only Database Read        │ None             │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ ListSales          │ Query    │ Sale (Projections)          │ Read-Only Database Read        │ None             │
├────────────────────┼──────────┼─────────────────────────────┼────────────────────────────────┼──────────────────┤
│ CancelSale         │ Command  │ Sale                        │ Local DB Transaction           │ SaleCancelledEvent│
└────────────────────┴──────────┴─────────────────────────────┴────────────────────────────────┴──────────────────┘
```

---

### 4.1 CreateSale (Command)

- **Purpose**: Initializes a new commercial checkout session in `DRAFT` status with exact zero monetary totals, assigns origin source context, validates multi-tenant isolation, and sets up initial line items or discounts if provided.
- **Classification**: **COMMAND** ([`CreateSaleCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/create-sale.command.ts), [`CreateSaleHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/create-sale.handler.ts)).
- **Input Contract (`CreateSaleInput`)**:
  - `id?: string` (Optional client-generated UUID / domain ID).
  - `idempotencyKey?: string` (Optional client deduplication key).
  - `tenantId?: string` (Mandatory tenant isolation scope).
  - `clientId?: string` (Optional client reference; supports anonymous walk-in purchases).
  - `currency?: string` (Optional ISO-4217 currency code; defaults to `USD`).
  - `source?: { sourceType: string; sourceId: string; sourceCode?: string | null }` (Origin source context).
  - `allowWalkInWithoutSource?: boolean` (Flags retail walk-in origin without upstream domain session).
  - `expectedContext?: string` (Expected upstream bounded context).
  - `items?: CreateSaleItemInput[]` (Optional initial basket items).
  - `orderDiscount?: { type: string; value: number; reason?: string | null }` (Optional order-level discount).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts) (Optional cross-context validator)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts) (Optional event publisher)
- **Domain Operations Invoked**:
  - `SaleSource.create(sourceType, sourceId, sourceCode)`
  - `Sale.create({ id, tenantId, clientId, currency, source, items, orderDiscount })`
- **Transaction Requirements**: Local database transaction within [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts).
- **Expected Errors**:
  - `InvalidSaleSourceException` (Missing source, malformed reference, or unsupported origin type).
  - `SourceNotFoundException` (Source entity not found in upstream bounded context).
  - `DuplicateSaleException` (Active sale already exists for clinical session or order reference).
  - `InvalidMoneyException` (Malformed currency code or invalid numeric format).
- **Authorization Considerations**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`. Tenant isolation is strictly enforced.
- **Idempotency Considerations**: When `idempotencyKey` or source reference is supplied, the handler verifies whether an active Sale already exists for the clinical session or business code (ADR-0120), rejecting duplicate checkout creation.

---

### 4.2 AddSaleItem (Command)

- **Purpose**: Appends a line item to an active `DRAFT` sale. Validates item parameters, verifies single-currency homogeneity against the sale agreement, recalculates parent sale totals deterministically, and updates the aggregate.
- **Classification**: **COMMAND** ([`AddSaleItemCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/add-sale-item.command.ts), [`AddSaleItemHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/add-sale-item.handler.ts)).
- **Input Contract (`AddSaleItemInput`)**:
  - `saleId: string` (Target sale identifier).
  - `source: { sourceType: SourceType; sourceId: string; sourceCode?: string | null }` (Item origin reference).
  - `description: string` (Line item description).
  - `skuOrCode?: string | null` (Optional inventory SKU or billing code).
  - `quantity: number` (Strictly positive quantity, $\le 3$ decimal precision).
  - `unitPriceAmount: number` (Non-negative unit price).
  - `discount?: { type: string; value: number; reason?: string | null } | null` (Optional item discount).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - `sale.addItem({ source, description, skuOrCode, quantity, unitPrice, discount })`
  - Internal aggregate `recalculateTotals()`
- **Transaction Requirements**: Database transaction within `PrismaSaleRepository.save()`. Child line items are synchronized differentially.
- **Expected Errors**:
  - `SaleNotFoundException` (Sale does not exist).
  - `SaleAlreadyFinalizedException` (Attempting to add items to a non-`DRAFT` sale).
  - `InvalidSaleItemException` (Negative price, non-positive quantity, fractional underflow).
  - `InvalidSaleStateException` (Currency mismatch between item and sale).
  - `SaleOptimisticLockException` (Concurrent update collision).
- **Authorization Considerations**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`.
- **Idempotency Considerations**: Non-idempotent by default (repeated calls add distinct line items unless deterministic `itemId` is supplied in the input).

---

### 4.3 RemoveSaleItem (Command)

- **Purpose**: Removes a line item from a `DRAFT` sale and recalculates composite order totals deterministically.
- **Classification**: **COMMAND** ([`RemoveSaleItemCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/remove-sale-item.command.ts), [`RemoveSaleItemHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/remove-sale-item.handler.ts)).
- **Input Contract (`RemoveSaleItemInput`)**:
  - `saleId: string` (Target sale identifier).
  - `itemId: string` (SaleItem identifier to remove).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - `sale.removeItem(itemId)`
  - Internal aggregate `recalculateTotals()`
- **Transaction Requirements**: Database transaction within `PrismaSaleRepository.save()`. The removed row is deleted via relational differential synchronization (`tx.saleItem.deleteMany where id NOT IN activeItemIds`).
- **Expected Errors**:
  - `SaleNotFoundException` (Sale does not exist).
  - `SaleAlreadyFinalizedException` (Attempting to modify a finalized or cancelled sale).
  - `InvalidSaleStateException` (Item ID does not exist in the targeted sale).
  - `SaleOptimisticLockException` (Version collision).
- **Authorization Considerations**: Requires `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`.
- **Idempotency Considerations**: Idempotent with respect to final state, but subsequent calls with the same `itemId` will return `InvalidSaleStateException` (Item not found).

---

### 4.4 ApplyDiscount (Command)

- **Purpose**: Applies an order-level or item-level discount to a `DRAFT` sale. Validates percentage/fixed discount parameters and recomputes all financial totals.
- **Classification**: **COMMAND** ([`ApplyOrderDiscountCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/apply-order-discount.command.ts), [`ApplyItemDiscountCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/apply-item-discount.command.ts)).
- **Input Contract (`ApplyDiscountInput`)**:
  - `saleId: string` (Target sale identifier).
  - `itemId?: string` (Optional item ID; if omitted, applies order-level discount).
  - `discount: { type: string; value: number; reason?: string | null }` (Discount specification).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
- **Domain Operations Invoked**:
  - `Discount.create(type, value, reason)`
  - `sale.applyOrderDiscount(discount)` OR `sale.applyItemDiscount(itemId, discount)`
  - Internal aggregate `recalculateTotals()`
- **Transaction Requirements**: Persisted atomically inside the parent sale row (flattened columns) within `PrismaSaleRepository.save()`.
- **Expected Errors**:
  - `SaleNotFoundException` (Sale does not exist).
  - `SaleAlreadyFinalizedException` (Sale has departed `DRAFT` status).
  - `InvalidDiscountException` (Negative discount value, percentage $> 100\%$, fixed discount exceeding item subtotal).
  - `SaleOptimisticLockException` (OCC version collision).
- **Authorization Considerations**: Requires `sales.create` or `sales.discount` privileges; roles: `Owner`, `Manager`, `Receptionist`.
- **Idempotency Considerations**: Idempotent; reapplying the identical discount yields the identical financial state.

---

### 4.5 CalculateSale (Query / Pricing Preview)

- **Purpose**: Provides in-memory recalculation and preview of financial totals (subtotal, line discounts, order discount, net total) for a hypothetical or modified basket without persisting changes to the database.
- **Classification**: **QUERY** ([`CalculateSaleQuery`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/index.ts)).
- **Input Contract (`CalculateSaleInput`)**:
  - `currency: string` (Target currency).
  - `items: Array<{ quantity: number; unitPriceAmount: number; discount?: { type: string; value: number } | null }>`
  - `orderDiscount?: { type: string; value: number } | null`
- **Output Contract**: `SalesApplicationResult<SaleTotalsSummaryDTO>`.
- **Repositories Required**: None (Executed purely in-memory using domain Value Objects and Aggregate calculation formulas).
- **Domain Operations Invoked**:
  - `Money.create()`
  - `Discount.create()`
  - Pure domain formula: Gross Subtotal $\to$ Line Discounts $\to$ Net Pre-Order $\to$ Order Discount $\to$ Total.
- **Transaction Requirements**: Zero database connection or transaction.
- **Expected Errors**:
  - `InvalidMoneyException` (Invalid currency or amount).
  - `InvalidDiscountException` (Excessive discount value).
- **Authorization Considerations**: Public / Authenticated; accessible to UI pricing preview widgets.
- **Idempotency Considerations**: Pure mathematical function; 100% idempotent and deterministic.

---

### 4.6 GetSale (Query)

- **Purpose**: Retrieves the complete commercial state of a specific sale order by its domain identifier, including all line items and deterministic monetary breakdowns.
- **Classification**: **QUERY** ([`GetSaleByIdQuery`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/get-sale-by-id.query.ts), [`GetSaleByIdHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/get-sale-by-id.handler.ts)).
- **Input Contract (`GetSaleByIdInput`)**:
  - `saleId: string` (Sale unique identifier).
  - `tenantId?: string` (Optional tenant isolation check).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
- **Domain Operations Invoked**: None (Read-only query).
- **Transaction Requirements**: Zero database transaction (Read-only query execution).
- **Expected Errors**:
  - `SaleNotFoundException` (Sale does not exist).
  - `PaymentUnauthorizedException` (Cross-tenant boundary violation).
- **Authorization Considerations**: Requires `sales.read` permission; roles: `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`.
- **Idempotency Considerations**: Pure read query; 100% idempotent.

---

### 4.7 ListSales (Query)

- **Purpose**: Retrieves a paginated, filtered, and deterministically sorted collection of sales orders within a tenant boundary for cashier dashboards and administrative audit.
- **Classification**: **QUERY** (`ListSalesQuery`, `ListSalesHandler`).
- **Input Contract (`ListSalesInput`)**:
  - `tenantId: string` (Mandatory tenant isolation).
  - `filter?: { status?: SaleStatus; clientId?: string; sourceType?: string; fromDate?: Date; toDate?: Date }`
  - `pagination?: { page?: number; limit?: number }` (1-indexed page, default limit 20, max cap 100).
  - `sort?: { field: 'createdAt' | 'totalAmount' | 'status'; direction: 'asc' | 'desc' }`
- **Output Contract**: `SalesApplicationResult<PaginatedResultDTO<SaleSummaryDTO>>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (requires `findMany(filter)` and `count(filter)`)
- **Domain Operations Invoked**: None (Read-only projection).
- **Transaction Requirements**: Zero database transaction (Read-only query).
- **Expected Errors**: None (returns empty paginated array if no records match criteria).
- **Authorization Considerations**: Requires `sales.read` permission; scoped to authenticated tenant.
- **Idempotency Considerations**: Pure read query; 100% idempotent.

---

### 4.8 CancelSale (Command)

- **Purpose**: Cancels an active commercial agreement in `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID` status, records an audit justification reason, transitions the aggregate to terminal `CANCELLED` status, permanently locks the sale against all further mutations, and publishes [`SaleCancelledEvent`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/events/sale-cancelled.event.ts).
- **Classification**: **COMMAND** ([`CancelSaleCommand`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/cancel-sale.command.ts), [`CancelSaleHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/cancel-sale.handler.ts)).
- **Input Contract (`CancelSaleInput`)**:
  - `saleId: string` (Target sale identifier).
  - `reason: string` (Mandatory non-empty cancellation audit justification).
  - `tenantId?: string` (Optional tenant verification).
- **Output Contract**: `SalesApplicationResult<SaleDTO>`.
- **Repositories Required**:
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Domain Operations Invoked**:
  - `sale.cancel(reason, clock)`
- **Transaction Requirements**: Database transaction within `PrismaSaleRepository.save()`. Persistence guard verifies existing record is not already in terminal `CANCELLED` or `REFUNDED` status.
- **Expected Errors**:
  - `SaleNotFoundException` (Sale does not exist).
  - `InvalidSaleStateException` (Empty or whitespace-only cancellation reason).
  - `InvalidSaleTransitionException` (Sale is already `PAID`, `COMPLETED`, or `CANCELLED`).
  - `SaleOptimisticLockException` (Concurrent update collision).
- **Authorization Considerations**: Requires `sales.cancel` or `sales.create` permission; roles: `Owner`, `Manager`, `Receptionist`.
- **Idempotency Considerations**: Non-idempotent; subsequent cancellation attempts on an already cancelled sale fail with `InvalidSaleTransitionException`.

---

## 5. Cross-Aggregate Coordination & Anti-Corruption Layers

### 5.1 Sale & Payment Coordination (`SalePaymentCoordinationService`)

Under DDD, aggregate roots must not mutate each other's database records. Coordination is orchestrated in the application layer via [`SalePaymentCoordinationService`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/services/sale-payment-coordination.service.ts) adhering to the 7-step protocol:

1. Verify Sale exists and matches tenant isolation.
2. Verify Payment exists and matches tenant isolation.
3. Verify Payment belongs to the Sale (`payment.saleId === sale.id`).
4. Verify Payment is in settled `COMPLETED` status.
5. Verify Payment amount currency matches Sale currency and payment is positive.
6. Verify total settled payments fully cover the Sale total amount.
7. Invoke domain method `sale.markPaid()` and persist `Sale` state.

### 5.2 Client Domain Anti-Corruption (`ClientFacadePort`)

In strict adherence to [ADR-0110](file:///c:/Projects/kinergy-platform/docs/adr/0110-sale-ownership.md) and [ADR-0121](file:///c:/Projects/kinergy-platform/docs/adr/0121-sale-source-references-and-commercial-origin-model.md):

- The Sales application layer **never** imports `ClientRepository` or the `Client` aggregate root.
- Client context is accessed exclusively via [`ClientFacadePort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/client-facade.port.ts), retrieving an immutable presentation summary (`ClientSummaryPayload`).

### 5.3 Source Context Validation (`SaleSourceValidatorPort`)

- The Sales application layer validates external references (e.g., `TreatmentSession`, `GymMembership`, `RoomRental`) via [`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts).
- If upstream entity validation fails, the application layer rejects checkout creation with `SourceNotFoundException` without aggregate coupling.

---

## 6. Transactional Boundaries and Concurrency Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       TRANSACTION & CONCURRENCY MATRIX                                          │
├────────────────────┬─────────────────────────────┬───────────────────┬──────────────────────────────────────────┤
│ OPERATION          │ DATABASE TABLES             │ OCC STRATEGY      │ TRANSACTION MECHANISM                    │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ CreateSale         │ sales, sale_items           │ version = 1       │ tx.sale.upsert + tx.saleItem.createMany  │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ AddSaleItem        │ sales, sale_items           │ version check     │ tx.sale.updateMany + tx.saleItem.upsert  │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ RemoveSaleItem     │ sales, sale_items           │ version check     │ tx.sale.updateMany + tx.saleItem.delete  │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ ApplyDiscount      │ sales, sale_items           │ version check     │ tx.sale.updateMany (flattened columns)   │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ CancelSale         │ sales                       │ version check     │ tx.sale.updateMany (status CANCELLED)    │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ CoordinatePayment  │ sales, payments             │ version check     │ Unit of Work / Ambient Transaction       │
├────────────────────┼─────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ Read Queries       │ sales, sale_items           │ None              │ Read-Only (prisma.sale.findUnique/Many)  │
└────────────────────┴─────────────────────────────┴───────────────────┴──────────────────────────────────────────┘
```

---

## 7. Consequences & Architectural Compliance

### 7.1 Positive Consequences

- **Total Invariant Preservation**: Zero possibility of total calculation drift or discount tampering; domain aggregates retain 100% authority over financial arithmetic.
- **Strict Hexagonal Purity**: Application handlers depend solely on ports, remaining completely testable in memory using plain mocks and mock clocks.
- **Progressive Immutability Guarantee**: Commercial agreements are frozen permanently upon exiting `DRAFT`, preventing phantom adjustments after receipt issuance or payment settlement.
- **Explicit Concurrency Resilience**: Optimistic concurrency control prevents lost updates during simultaneous cashier operations.

### 7.2 Negative & Neutral Consequences

- **More Use-Case Classes**: Each business operation requires an explicit Command, Input, and Handler instead of a single generic service method. This is an intentional DDD design tradeoff to guarantee fine-grained security, auditability, and testability.
- **Cross-Aggregate Orchestration Overhead**: Coordinating multi-aggregate transactions (Sale + Payment) requires the Unit of Work or coordination service rather than simple foreign key cascades.

---

## 8. Verification & Architectural Safety Rules

1. Pure Sales Application files must have **zero imports of ORM/framework libraries** (`@prisma/client`, `@nestjs/common`, `express`).
2. Pure Sales Application files must have **zero imports of foreign bounded contexts** (`modules/client`, `gym`, `kinesiology`, `scheduling`, `resources`).
3. Application handlers must return [`SalesApplicationResult`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/shared/sales-application-result.ts), never leaking unhandled domain or database exceptions to transport layers.
4. All state modifications must route through explicit Commands; queries must remain 100% read-only.
5. All domain events must be dispatched strictly **after** database transaction commit.
