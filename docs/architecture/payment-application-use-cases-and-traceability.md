# Milestone 7.12: Payment Application Layer Specification & Traceability Matrix

- **Document**: `docs/architecture/payment-application-use-cases-and-traceability.md`
- **Status**: Authoritative Technical Specification (APPROVED FOR MILESTONE 7.12)
- **Role**: Senior Technical Documentation Architect
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/application/`)
- **Date**: 2026-10-09
- **Associated ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](../adr/0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](../adr/0021-transactional-consistency-unit-of-work.md)
  - [ADR-0025: Role and Permission Authorization Framework](../adr/0025-role-and-permission-authorization-framework.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling (Milestone 7.4)](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability (Milestone 7.6)](../adr/0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture (Milestone 7.6)](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification (Milestone 7.6)](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Integrity (Milestone 7.8)](../adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening (Milestone 7.10)](../adr/0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries (Milestone 7.10)](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](../adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0132: Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts (Milestone 7.11)](../adr/0132-sale-application-layer-architecture.md)
  - [ADR-0133: Payment Application Layer Architecture, Cross-Aggregate Settlement Orchestration, and Use Case Inventory (Milestone 7.12)](../adr/0133-payment-application-layer-architecture.md)
  - [ADR-0134: Financial Settlement Validation and Overpayment Invariants (Milestone 7.12)](../adr/0134-financial-settlement-validation-and-overpayment-invariants.md)

---

## 1. Architectural Axioms & Separation of Concerns

Under Kinergy's Clean and Hexagonal Architecture, responsibility for monetary settlement and payment lifecycle management is strictly divided across four authoritative architectural boundaries:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ARCHITECTURAL SEPARATION                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. APPLICATION ORCHESTRATES                                                            │
│    Orchestrates use cases, resolves aggregate roots via repository ports, evaluates    │
│    authorization permissions, enforces multi-tenant scoping, enforces cross-aggregate │
│    settlement preconditions (currency parity, remaining balance caps), manages atomic  │
│    database transaction boundaries, dispatches domain events post-commit, and maps     │
│    aggregates to immutable DTOs. Owns ZERO domain arithmetic or state-machine rules.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. DOMAIN DECIDES                                                                      │
│    • Payment Aggregate: Authoritatively governs internal payment lifecycle states      │
│      (PENDING → COMPLETED | FAILED | CANCELLED), enforces tender positivity, validates │
│      anti-PAN PCI-DSS references, and records uncommitted domain events.               │
│    • Sale Aggregate: Authoritatively governs commercial basket invariants, enforces    │
│      deterministic monetary totals, and transitions debt state (markPartiallyPaid,     │
│      markPaid). Pure TypeScript; unaware of HTTP, NestJS, Prisma, or SQL.              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. REPOSITORY PERSISTS                                                                 │
│    The PaymentRepositoryPort and SaleRepositoryPort adapters bridge pure domain models │
│    with relational storage. Executes optimistic concurrency control (OCC) checks on    │
│    version increments, enforces isolation levels, and maps ORM records to domain models.│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. DATABASE ENFORCES STRUCTURAL INTEGRITY                                              │
│    PostgreSQL database engine enforces hard relational constraints: foreign keys       │
│    (payments.sale_id -> sales.id ON DELETE RESTRICT), exact DECIMAL(12,2) scale,       │
│    composite audit indexes, non-negative monetary checks, and ACID atomicity.          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Axiom:

> **The Application Layer coordinates. The Domains decide. Repositories persist. Persistence enforces relational integrity.**

---

## 2. Milestone 7.12 Critical Invariant

### 2.1 The Atomic Cross-Aggregate Settlement Invariant

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CRITICAL SETTLEMENT INVARIANT                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CompletePayment coordinates Payment completion and Sale payment-state transition       │
│ atomically within a single database transaction.                                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

When a pending monetary payment completes, two distinct aggregate roots must transition in lockstep:

1. The **`Payment`** aggregate transitions from `PENDING` $\to$ `COMPLETED` (`payment.complete(...)`).
2. The parent **`Sale`** aggregate transitions from `PENDING_PAYMENT` | `PARTIALLY_PAID` $\to$ `PAID` (or `PARTIALLY_PAID`) (`sale.markPaid(...)` or `sale.markPartiallyPaid(...)`).

#### Strict Consistency Guarantees:

- **No Orphaned Settlements**: A payment cannot be persisted as `COMPLETED` while its associated `Sale` remains in an unsynchronized or obsolete debt state.
- **No Unfunded Debt Discharges**: A `Sale` cannot be persisted as `PAID` without the verified, simultaneous persistence of the settling `Payment`.
- **Atomic Rollback**: If persistence of either the `Payment` or the `Sale` fails (e.g. database connection interruption, constraint violation, or OCC version collision), the transaction (`IUnitOfWork` / `prisma.$transaction`) rolls back completely. Both aggregates remain in their prior state.
- **Post-Commit Event Dispatching**: Domain events from both aggregates (`PaymentSettledEvent`, `SalePaidEvent` / `SalePartiallyPaidEvent`) are staged in-memory and dispatched to `SalesEventPublisherPort` strictly **after** successful transaction commit, preventing phantom event side-effects.

---

## 3. Milestone 7.12 Application Use-Case Catalog

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         USE-CASE CLASSIFICATION & PROTOCOL                                       │
├────────────────────────┬──────────┬─────────────────────────────┬───────────────────────────────┬────────────────┤
│ USE CASE               │ CQRS     │ AGGREGATES INVOLVED         │ TRANSACTION BOUNDARY          │ PERSISTENCE OCC│
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ CreatePayment          │ Command  │ Payment, Sale               │ Atomic Tx (if completed)      │ version = 1    │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ CompletePayment        │ Command  │ Payment, Sale               │ Atomic Multi-Aggregate Tx     │ version check  │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ FailPayment            │ Command  │ Payment (Sale untouched)    │ Local Payment Tx              │ version check  │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ CancelPayment          │ Command  │ Payment (Sale untouched)    │ Local Payment Tx              │ version check  │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ GetPayment             │ Query    │ Payment (Read Model)        │ Side-Effect Free (Zero Writes)│ Immutable Read │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ ListPayments           │ Query    │ Payment (Read Projections)  │ Side-Effect Free (Zero Writes)│ Immutable Read │
├────────────────────────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────┤
│ GetSalePaymentHistory  │ Query    │ Payment, Sale (Audit Trail) │ Side-Effect Free (Zero Writes)│ Immutable Read │
└────────────────────────┴──────────┴─────────────────────────────┴───────────────────────────────┴────────────────┘
```

---

### 3.1 CreatePayment (Command)

- **Purpose**: Creates an autonomous `Payment` aggregate associated with an active commercial `Sale`. Supports recording an immediate payment (`status: COMPLETED`, e.g. physical cash handed at counter) or initializing an unsettled asynchronous payment (`status: PENDING`, e.g. awaiting dynamic QR code scanning or card terminal webhook confirmation).
- **Input**: [`CreatePaymentInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/create-payment.command.ts)
  - `saleId: string` (Mandatory target sale unique identifier).
  - `amount: number` (Mandatory payment tender amount, strictly $> 0.00$).
  - `currency?: string` (Optional ISO-4217 currency code; must match target `Sale.currency`, default: `USD`).
  - `method: PaymentMethod` (Mandatory payment tender method: `CASH` or `QR`).
  - `reference?: string | null` (Optional external transaction identifier or physical drawer audit tag).
  - `status?: PaymentStatus` (Optional initial status: `PENDING` or `COMPLETED`; default: `COMPLETED`).
  - `id?: string` (Optional client-generated UUID / idempotency identifier).
  - `idempotencyKey?: string` (Optional network deduplication key).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Domain Operation**:
  - Validates `Money` positivity and ISO-4217 currency code ([ADR-0108](../adr/0108-money-representation.md)).
  - Instantiates [`PaymentReference`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/payment-reference.vo.ts), enforcing max 100 characters and active PCI-DSS anti-PAN regex rejection.
  - Calls `Payment.createCompleted(...)` or `Payment.createPending(...)` ([ADR-0115](../adr/0115-payment-domain-canonical-architecture.md), [ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).
  - If created as `COMPLETED`: evaluates cumulative settled debt against `Sale.total`. Calls `sale.markPaid(clock)` if cumulative settled $\ge$ `sale.total`, or `sale.markPartiallyPaid(clock)` if cumulative settled $<$ `sale.total` ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).
- **Repositories**:
  - [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts)
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Transaction Boundary**:
  - For `COMPLETED` payments: Enclosed in an atomic relational transaction (`IUnitOfWork` / `prisma.$transaction`). Both `payment` and `sale` persist atomically.
  - For `PENDING` payments: Single-aggregate transaction persisting `payment` alone (`paymentRepository.save(payment)`). Parent `sale` is not mutated.
- **Authorization**:
  - Requires `payments.create` permission ([ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md)).
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Multi-tenant isolation verified across caller, payment, and sale (`enforceTenantIsolation`).
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks permission or attempts cross-tenant mutation.
  - `SaleNotFoundException`: Associated `saleId` does not exist.
  - `SaleNotPayableException`: Target sale is in non-payable status (`DRAFT`, `PAID`, `COMPLETED`, `CANCELLED`).
  - `PaymentCurrencyMismatchException`: Payment currency differs from target Sale currency.
  - `PaymentOverpaymentException`: Payment amount exceeds remaining unpaid balance on the sale ([ADR-0134](../adr/0134-financial-settlement-validation-and-overpayment-invariants.md)).
  - `InvalidPaymentReferenceException`: Reference exceeds length or violates PCI-DSS anti-PAN rules.
  - `DuplicatePaymentReferenceException`: External reference already recorded for another payment.
- **Idempotency**: Supported via client-provided `id`, `idempotencyKey`, or unique external reference. Re-executing returns the existing payment record without creating duplicate financial tenders.
- **Concurrency Considerations**: Prevents concurrent overpayments via optimistic concurrency control (OCC) versioning on `Sale` (`version = version + 1`). If two cashiers submit simultaneous payments totaling more than `Sale.total`, the second transaction collides and fails with `SaleOptimisticLockException` or `PaymentOverpaymentException`.

---

### 3.2 CompletePayment (Command)

- **Purpose**: Confirms the successful settlement of an unsettled `PENDING` payment (e.g. gateway webhook received, QR confirmed, or physical cash collected). Synchronizes the payment to `COMPLETED`, stamps `paidAt`, and atomically updates the parent `Sale` to `PAID` or `PARTIALLY_PAID`.
- **Input**: [`CompletePaymentInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/complete-payment.command.ts)
  - `paymentId: string` (Mandatory target payment unique identifier).
  - `saleId?: string` (Optional cross-check ensuring payment belongs to the expected sale).
  - `reference?: string | null` (Optional updated external transaction/clearing reference).
  - `paidAt?: Date | string` (Optional verified settlement timestamp).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Domain Operation**:
  - Invokes `payment.complete({ reference, paidAt, clock })`. Payment aggregate transitions from `PENDING` $\to$ `COMPLETED` ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).
  - Staging uncommitted `PaymentSettledEvent`.
  - Computes cumulative settled payments including the newly completed tender:
    $$\text{CumulativeSettled} = \sum_{p \in \text{CompletedPayments}} p.\text{amount} + \text{currentPayment}.\text{amount}$$
  - If $\text{CumulativeSettled} \ge \text{Sale.total}$: invokes `sale.markPaid(clock)`.
  - If $\text{CumulativeSettled} < \text{Sale.total}$: invokes `sale.markPartiallyPaid(clock)`.
  - Staging uncommitted `SalePaidEvent` or `SalePartiallyPaidEvent`.
- **Repositories**:
  - [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts)
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
  - [`IUnitOfWork`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/unit-of-work.port.ts) / [`SalesTransactionCoordinatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-transaction-coordinator.port.ts)
- **Transaction Boundary**: **Atomic Multi-Aggregate Unit of Work (`prisma.$transaction`)**. Persists both `paymentRepository.save(payment)` and `saleRepository.save(sale)` in a single database transaction. Failure of either aggregate rolls back both.
- **Authorization**:
  - Requires `payments.create` or `payments.manage` permission.
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Scoping verified across tenant boundary and payment-to-sale affiliation (`payment.saleId === input.saleId`).
- **Errors**:
  - `PaymentUnauthorizedException`: Caller unauthorized, tenant mismatch, or payment belongs to a different sale.
  - `PaymentNotFoundException`: Target payment does not exist.
  - `SaleNotFoundException`: Associated parent sale does not exist.
  - `InvalidPaymentTransitionException` / `PaymentAlreadyCompletedException`: Payment is already `COMPLETED`, `FAILED`, or `CANCELLED` ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).
  - `SaleCannotBeMarkedPaidException` / `InvalidSaleTransitionException`: Parent sale is in `DRAFT` or `CANCELLED` status ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).
  - `PaymentCurrencyMismatchException`: Payment currency differs from Sale currency.
  - `PaymentOverpaymentException`: Completing the payment would cause settled total to exceed sale total.
  - `PaymentOptimisticLockException` / `SaleOptimisticLockException`: Concurrent update collision.
- **Idempotency**: Strict financial immutability; attempting to complete an already `COMPLETED` payment is rejected by the domain state machine with `PaymentAlreadyCompletedException` or `InvalidPaymentTransitionException` without corrupting persistence.
- **Concurrency Considerations**:
  - Two concurrent completion attempts against the same payment compete via OCC on `payments.version`. The first succeeds; the second fails with `PaymentOptimisticLockException` or transition error.
  - Concurrent completion of separate pending payments for the same sale compete via OCC on `sales.version`. The winner updates sale debt; the loser rolls back and can re-evaluate remaining balance.

---

### 3.3 FailPayment (Command)

- **Purpose**: Records the terminal failure, banking rail decline, gateway rejection, or timeout of an unsettled `PENDING` payment. Retains an immutable audit trace of the attempt and failure reason while keeping the parent `Sale` payable.
- **Input**: [`FailPaymentInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/fail-payment.command.ts)
  - `paymentId: string` (Mandatory target payment unique identifier).
  - `saleId?: string` (Optional cross-check validation).
  - `reason?: string` (Optional audit failure justification / gateway decline code).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Domain Operation**:
  - Invokes `payment.fail(reason, clock)`. Payment aggregate transitions from `PENDING` $\to$ `FAILED` ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).
  - Emits `PaymentFailedEvent`.
  - **Does NOT mutate `Sale`**: The parent `Sale` remains in `PENDING_PAYMENT` or `PARTIALLY_PAID`, permitting immediate retry with an alternative tender.
- **Repositories**:
  - [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts)
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (Optional, for tenant/scoping cross-validation)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Transaction Boundary**: Single-aggregate database transaction persisting `paymentRepository.save(payment)`.
- **Authorization**:
  - Requires `payments.create` or `payments.manage` permission.
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Enforces tenant isolation.
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks authorization or cross-tenant violation.
  - `PaymentNotFoundException`: Target payment does not exist.
  - `InvalidPaymentTransitionException`: Payment is already in terminal status (`COMPLETED`, `FAILED`, `CANCELLED`).
  - `PaymentOptimisticLockException`: Concurrent update collision.
- **Idempotency**: Repeated failure calls on a finalized payment throw `InvalidPaymentTransitionException`.
- **Concurrency Considerations**: Protected by OCC version check on `payments`. If a payment cleared concurrently before the timeout webhook arrived, the transition rejects and the payment remains `COMPLETED`.

---

### 3.4 CancelPayment (Command)

- **Purpose**: Voids or aborts an unsettled `PENDING` payment prior to fund transfer (e.g. cashier cancels customer QR display, or customer switches tender from QR to Cash). Permanently moves payment to `CANCELLED` without altering parent `Sale`.
- **Input**: [`CancelPaymentInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/commands/cancel-payment.command.ts)
  - `paymentId: string` (Mandatory target payment unique identifier).
  - `saleId?: string` (Optional cross-check validation).
  - `reason?: string` (Optional cancellation audit reason).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Domain Operation**:
  - Invokes `payment.cancel(reason, clock)`. Payment aggregate transitions from `PENDING` $\to$ `CANCELLED` ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).
  - Emits `PaymentCancelledEvent`.
  - **Does NOT mutate `Sale`**: Parent `Sale` remains in its current payable status (`PENDING_PAYMENT` or `PARTIALLY_PAID`).
- **Repositories**:
  - [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts)
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (Optional, for tenant/scoping cross-validation)
  - [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts)
- **Transaction Boundary**: Single-aggregate database transaction persisting `paymentRepository.save(payment)`.
- **Authorization**:
  - Requires elevated **`payments.manage`** permission ([ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md)).
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`.
  - **Forbidden Roles**: Non-management operational roles (`Trainer`, `Kitchen Staff`) are strictly prohibited from voiding or cancelling payment records.
  - Multi-tenant boundary isolation enforced.
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks `payments.manage` permission or cross-tenant violation.
  - `PaymentNotFoundException`: Target payment does not exist.
  - `InvalidPaymentTransitionException`: Payment is already in terminal status (`COMPLETED`, `FAILED`, `CANCELLED`).
  - `PaymentOptimisticLockException`: Concurrent update collision.
- **Idempotency**: Repeated cancellation calls on a finalized payment throw `InvalidPaymentTransitionException`.
- **Concurrency Considerations**: Protected by OCC version check. If an external settlement arrived concurrently, the payment cannot be cancelled.

---

### 3.5 GetPayment (Query)

- **Purpose**: Retrieves an individual payment record by unique domain identifier, projecting the aggregate into an immutable `PaymentDTO` without exposing domain internals, ORM entities, or raw credentials.
- **Input**: [`GetPaymentInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/get-payment.query.ts)
  - `paymentId: string` (Mandatory target payment identifier).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Domain Operation**: None (Read-only projection via [`PaymentMapper.toDTO`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/mappers/payment.mapper.ts)).
- **Repositories**: [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts) (`findById`).
- **Transaction Boundary**: Zero database transaction. Read-only query.
- **Authorization**:
  - Requires `payments.read` permission.
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Multi-tenant boundary strictly verified (`enforceTenantIsolation`).
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks `payments.read` or attempts cross-tenant inspection.
  - `PaymentNotFoundException`: Target payment does not exist.
  - Validation Error: Payment identifier is empty or whitespace-only.
- **Idempotency**: Pure inquiry; 100% idempotent.
- **Concurrency Considerations**: Non-blocking read under PostgreSQL Read Committed isolation level. Zero locks acquired.

---

### 3.6 ListPayments (Query)

- **Purpose**: Retrieves a filtered, paginated, and deterministically sorted collection of payment records within an authenticated tenant boundary.
- **Input**: [`ListPaymentsInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/list-payments.query.ts)
  - `tenantId?: string` (Tenant partition boundary identifier).
  - Filters: `saleId?: string`, `status?: PaymentStatus | string`, `method?: PaymentMethod | string`, `fromDate?: Date | string`, `toDate?: Date | string`.
  - Pagination: `page?: number` (default 1, $\ge 1$), `limit?: number` (default 20, max cap 100).
  - Sorting: `sortBy?: 'createdAt' | 'paidAt' | 'amount' | 'status'` (whitelisted), `sortDirection?: 'asc' | 'desc'`.
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaginatedResultDTO<PaymentDTO>>`
- **Domain Operation**: None (Read-only projection).
- **Repositories**: [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts) (`findMany`, `count`).
- **Transaction Boundary**: Zero database transaction. Read-only query.
- **Authorization**:
  - Requires `payments.read` permission.
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Multi-tenant boundary enforced in repository search criteria.
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks `payments.read` permission.
  - `InvalidPaymentQueryException`: Invalid pagination bounds (`page < 1`, `limit < 1`, `limit > 100`), un-whitelisted sort fields, invalid status/method enum values, or inverted date ranges (`fromDate > toDate`).
- **Idempotency**: Pure inquiry; 100% idempotent.
- **Concurrency Considerations**: Uses composite database indexes `(tenant_id, created_at DESC)` and `(tenant_id, status)`. Enforces deterministic secondary sorting (`id ASC`) to eliminate pagination jitter across concurrent writes.

---

### 3.7 GetSalePaymentHistory (Query)

- **Purpose**: Retrieves the complete chronological audit trail of all payment attempts (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`) for a specific Sale aggregate.
- **Input**: [`GetSalePaymentHistoryInput`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/queries/get-payments-by-sale-id.query.ts)
  - `saleId: string` (Mandatory target sale identifier).
  - `tenantId?: string` (Tenant partition boundary identifier).
  - `currentUser?: AuthenticatedUser` (Caller security context).
- **Output**: `SalesApplicationResult<PaymentDTO[]>`
- **Domain Operation**: None (Read-only audit projection).
- **Repositories**:
  - [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts) (`findBySaleId`).
  - [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts) (Optional, for tenant/existence validation).
- **Transaction Boundary**: Zero database transaction. Read-only query.
- **Authorization**:
  - Requires `payments.read` permission.
  - Authorized Roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Trainer`, `Kitchen Staff`.
  - Scoped to caller tenant.
- **Errors**:
  - `PaymentUnauthorizedException`: Caller lacks `payments.read` or cross-tenant inspection.
  - `SaleNotFoundException`: Target sale does not exist (when Sale validation enabled).
  - Validation Error: Empty or whitespace `saleId`.
- **Idempotency**: Pure inquiry; 100% idempotent.
- **Concurrency Considerations**: Reads via index `(tenant_id, sale_id, created_at ASC)`. Lock-free.

---

## 4. End-to-End Architectural Traceability Matrix

The following matrix traces every payment and settlement requirement through domain rules, application use cases, repository ports, relational persistence guarantees, and verified test suites:

| #             | Business Requirement                                                                                         | Domain Rule (ADR)                                                                                                                                                                                                                                    | Application Use Case                                                       | Repository Port                                                                | Persistence Guarantee (PostgreSQL)                                | Test Coverage Proof                                                                                                      |
| :------------ | :----------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :----------------------------------------------------------------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **BR-PAY-01** | **Strict Tender Positivity**: Every payment amount must be strictly greater than $0.00.                      | `amount > 0` ([ADR-0108](../adr/0108-money-representation.md), [ADR-0115](../adr/0115-payment-domain-canonical-architecture.md)).                                                                                                                    | `CreatePaymentHandler`                                                     | `PaymentRepositoryPort.save()`                                                 | `payments.amount > 0` (`CHECK` constraint).                       | `create-payment.handler.spec.ts`<br>`sales-milestone-7-10-7-11-7-12-integration.spec.ts`                                 |
| **BR-PAY-02** | **Currency Homogeneity**: Payment tender currency must match the target Sale currency.                       | Currency Parity ([ADR-0108](../adr/0108-money-representation.md), [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)).                                                                                                             | `CreatePaymentHandler`<br>`CompletePaymentHandler`                         | `PaymentRepositoryPort.save()`                                                 | `payments.currency = sales.currency` (ISO-4217).                  | `create-payment.handler.spec.ts`<br>`complete-payment-workflow.spec.ts`<br>`complete-payment-integration-matrix.spec.ts` |
| **BR-PAY-03** | **Overpayment Prevention**: Payments exceeding remaining unpaid balance are rejected.                        | Settlement Invariant ([ADR-0134](../adr/0134-financial-settlement-validation-and-overpayment-invariants.md)).                                                                                                                                        | `CreatePaymentHandler`<br>`CompletePaymentHandler`                         | `PaymentRepositoryPort.findBySaleId()`<br>`SaleRepositoryPort.findById()`      | Remaining balance verification before state mutation.             | `financial-settlement-boundaries.spec.ts`<br>`complete-payment-integration-matrix.spec.ts`                               |
| **BR-PAY-04** | **Multi-Tender & Split Payments**: A sale supports multiple separate payment tenders.                        | Multi-Tender Decoupling ([ADR-0109](../adr/0109-payment-lifecycle.md), [ADR-0115](../adr/0115-payment-domain-canonical-architecture.md)).                                                                                                            | `CreatePaymentHandler`                                                     | `PaymentRepositoryPort.save()`                                                 | Foreign key `payments.sale_id -> sales.id` ($1 \to N$).           | `payment-application-use-cases.spec.ts`<br>`complete-payment-integration-matrix.spec.ts`                                 |
| **BR-PAY-05** | **Partial Payment Synchronization**: Receiving partial tender advances Sale to `PARTIALLY_PAID`.             | Sale Debt Machine ([ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).                                                                                                                                                               | `CreatePaymentHandler`<br>`CompletePaymentHandler`                         | `SaleRepositoryPort.save()`                                                    | `sales.status = 'PARTIALLY_PAID'`.                                | `complete-payment-workflow.spec.ts`<br>`sales-milestone-7-10-7-11-7-12-integration.spec.ts`                              |
| **BR-PAY-06** | **Atomic Settlement Coordination**: Payment completion and Sale debt transition persist atomically.          | Atomic Multi-Aggregate Tx ([ADR-0021](../adr/0021-transactional-consistency-unit-of-work.md), [ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md), [ADR-0133](../adr/0133-payment-application-layer-architecture.md)). | `CompletePaymentHandler`                                                   | `PaymentRepositoryPort.save()`<br>`SaleRepositoryPort.save()`<br>`IUnitOfWork` | Atomic Unit of Work (`prisma.$transaction`). Rollback on failure. | `complete-payment-atomic-persistence.integration.spec.ts`<br>`complete-payment-integration-matrix.spec.ts`               |
| **BR-PAY-07** | **Terminal Payment Immutability**: `COMPLETED`, `FAILED`, and `CANCELLED` states are permanently write-once. | Terminal State Machine ([ADR-0109](../adr/0109-payment-lifecycle.md), [ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)).                                                                                                 | `CompletePaymentHandler`<br>`FailPaymentHandler`<br>`CancelPaymentHandler` | `PaymentRepositoryPort.save()`                                                 | Terminal guards in aggregate and repository mapper.               | `payment-lifecycle-qa-matrix.spec.ts`<br>`complete-payment-integration-matrix.spec.ts`                                   |
| **BR-PAY-08** | **Non-Corruptive Payment Failure**: Failing a payment does NOT cancel or corrupt the parent Sale.            | Cross-Context Independence ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md), [ADR-0133](../adr/0133-payment-application-layer-architecture.md)).                                                                        | `FailPaymentHandler`                                                       | `PaymentRepositoryPort.save()`                                                 | `payments.status = 'FAILED'`, `sales.status` unchanged.           | `fail-payment.handler.spec.ts`<br>`sales-milestone-7-10-7-11-7-12-integration.spec.ts`                                   |
| **BR-PAY-09** | **Unsettled Payment Cancellation**: Cashiers void pending tenders without modifying Sale state.              | Voluntary Voiding ([ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md), [ADR-0133](../adr/0133-payment-application-layer-architecture.md)).                                                                                 | `CancelPaymentHandler`                                                     | `PaymentRepositoryPort.save()`                                                 | `payments.status = 'CANCELLED'`, `sales.status` unchanged.        | `cancel-payment.handler.spec.ts`<br>`sales-milestone-7-10-7-11-7-12-integration.spec.ts`                                 |
| **BR-PAY-10** | **Non-Corruptive Sale Cancellation**: Cancelling a sale does NOT delete or alter historical payments.        | Payment Immutability ([ADR-0109](../adr/0109-payment-lifecycle.md), [ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)).                                                                                                              | `CancelSaleHandler`                                                        | `SaleRepositoryPort.save()`                                                    | `payments` records preserved; `ON DELETE RESTRICT`.               | `sales-milestone-7-10-7-11-7-12-integration.spec.ts`                                                                     |
| **BR-PAY-11** | **PCI-DSS Reference Sanitation**: External references must NOT contain credit card PAN digits.               | Data Sanitation ([ADR-0115](../adr/0115-payment-domain-canonical-architecture.md)).                                                                                                                                                                  | `CreatePaymentHandler`<br>`CompletePaymentHandler`                         | `PaymentRepositoryPort.save()`                                                 | `PaymentReference` VO regex validation.                           | `create-payment.handler.spec.ts`<br>`prisma-payment-persistence-roundtrip.spec.ts`                                       |
| **BR-PAY-12** | **Multi-Tenant Data Isolation**: Cross-tenant payment access or mutation is strictly forbidden.              | Tenant Boundary ([ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md)).                                                                                         | All Use Cases                                                              | `PaymentRepositoryPort`<br>`SaleRepositoryPort`                                | SQL queries scoped to `tenant_id`.                                | `payment-application-use-cases.spec.ts`<br>`payment-error-classification-and-propagation.spec.ts`                        |
| **BR-PAY-13** | **Role-Based Authorization Boundary**: Payment operations enforce specific role permissions.                 | Authorization Matrix ([ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md)).                                                                                    | All Use Cases                                                              | Presentation/Application boundary                                              | `checkPaymentAuthorization` guard.                                | `payment-application.spec.ts`<br>`cancel-payment.handler.spec.ts`                                                        |
| **BR-PAY-14** | **Lost Update Prevention (OCC)**: Concurrent edits on payment or sale cannot overwrite state.                | Optimistic Concurrency Control ([ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)).                                                                                                                                  | Mutating Commands                                                          | `PaymentRepositoryPort.save()`<br>`SaleRepositoryPort.save()`                  | `UPDATE ... WHERE version = expectedVersion`.                     | `concurrent-payment-completion.integration.spec.ts`<br>`complete-payment-integration-matrix.spec.ts`                     |
| **BR-PAY-15** | **Post-Commit Event Dispatching**: Domain events publish strictly after transaction commit.                  | Clean Eventing ([ADR-0021](../adr/0021-transactional-consistency-unit-of-work.md), [ADR-0133](../adr/0133-payment-application-layer-architecture.md)).                                                                                               | Mutating Commands                                                          | `SalesEventPublisherPort`                                                      | Zero phantom events on transaction rollback.                      | `complete-payment-atomic-persistence.integration.spec.ts`<br>`payment-application-use-cases.spec.ts`                     |

---

## 5. Role-Based Access Control (RBAC) Specification

In accordance with [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md) and [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), the authorization boundary for payment operations is evaluated strictly at the presentation/application boundary:

```
┌────────────────────────┬──────────────────────┬────────────────────────────────────────────────────────┐
│ USE CASE               │ REQUIRED PERMISSION  │ AUTHORIZED BUSINESS ROLES                              │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ CreatePayment          │ payments.create      │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ CompletePayment        │ payments.create      │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ FailPayment            │ payments.create      │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ CancelPayment          │ payments.manage      │ Owner, Manager, Receptionist (Management Only)         │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ GetPayment             │ payments.read        │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ ListPayments           │ payments.read        │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
├────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ GetSalePaymentHistory  │ payments.read        │ Owner, Manager, Receptionist, Trainer, Kitchen Staff   │
└────────────────────────┴──────────────────────┴────────────────────────────────────────────────────────┘
```

> **Security Guardrail**: Domain entities (`Payment`, `Sale`) contain zero user-role or session logic. Authorization checks are executed exclusively via `checkPaymentAuthorization` prior to financial mutation.

---

## 6. Verification and Governance

All architectural rules defined in this specification are continuously verified across three testing tiers:

1. **Unit & Domain State Machine Safety**:
   - [`payment-lifecycle-qa-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/payment-lifecycle-qa-matrix.spec.ts)
   - [`payment-error-classification-and-propagation.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/payment-error-classification-and-propagation.spec.ts)
   - [`payment-idempotency-and-repeated-requests.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/payment-idempotency-and-repeated-requests.spec.ts)
2. **Application Layer Orchestration**:
   - [`payment-application-use-cases.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/payment-application-use-cases.spec.ts)
   - [`complete-payment-workflow.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/complete-payment-workflow.spec.ts)
   - [`sale-payment-coordination.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/__tests__/sale-payment-coordination.spec.ts)
3. **Real PostgreSQL & Prisma Integration**:
   - [`complete-payment-integration-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/complete-payment-integration-matrix.spec.ts)
   - [`complete-payment-atomic-persistence.integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/complete-payment-atomic-persistence.integration.spec.ts)
   - [`concurrent-payment-completion.integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/concurrent-payment-completion.integration.spec.ts)
   - [`sales-milestone-7-10-7-11-7-12-integration.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/sales-milestone-7-10-7-11-7-12-integration.spec.ts)
