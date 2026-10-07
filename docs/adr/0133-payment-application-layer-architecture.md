# 0133. Payment Application Layer Architecture, Cross-Aggregate Settlement Orchestration, and Use Case Inventory

- **Status**: Accepted
- **Date**: 2026-10-07
- **Deciders**: Principal Software Architect, Principal Financial Domain Architect, Lead Core Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.12: Payment Application Layer). Following the establishment of the Payment Domain (ADR-0115), Payment State Machine (ADR-0116), Relational Persistence Architecture (ADR-0122, ADR-0125), and the Sale Application Layer (ADR-0132), this ADR formalizes the orchestration contracts, boundary responsibilities, and use-case catalog for the Payment Application Layer.
- **Consulted ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0025: Role and Permission Authorization Framework](0025-role-and-permission-authorization-framework.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0132: Sale Application Layer Architecture, Use Case Inventory, and Orchestration Contracts](0132-sale-application-layer-architecture.md)

---

## 1. Context and Problem Statement

In POS and healthcare management systems, monetary settlement is the most audit-sensitive boundary in the architecture. Milestones 7.5 and 7.6 established [`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts) as an autonomous Aggregate Root decoupled from [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) by scalar domain identifier (`Payment.saleId`).

Without a formal Application Layer specification:

1. **State Machine Leakage**: Controllers and use-case handlers risk implementing procedural `if (status === ...)` mutations, bypassing domain state-machine determinism.
2. **Cross-Aggregate Entanglement**: Handlers risk modifying payment and sale entities across memory graphs without proper atomic persistence boundaries, leading to desynchronized states (e.g. settled payments recorded against non-payable or cancelled sales).
3. **Financial Logic Fragmentation**: Overpayment verification, split settlement mathematics, and partial payment progression risk being calculated haphazardly across controllers.
4. **Contract Inconsistency**: Disparate naming conventions (`RecordPayment` vs. `CreatePayment`, `SettlePayment` vs. `CompletePayment`) confuse API clients and testing harnesses.

To ensure architectural consistency across the Sales & Payments Bounded Context, this ADR establishes the canonical architecture, separation of responsibilities, cross-aggregate completion orchestration, transactional boundaries, and complete use-case inventory for the **Payment Application Layer**.

---

## 2. Architectural Separation of Responsibilities

Under Kinergy's Clean and Hexagonal Architecture, responsibility is distributed with strict separation of concerns:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               ARCHITECTURAL SEPARATION                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. PAYMENT DOMAIN                                                                      │
│    Enforces internal payment lifecycle transitions, immutable settlement rules,       │
│    monetary positivity, reference string sanitation, and records domain events.       │
│    Unaware of HTTP, NestJS, Prisma, SQL, or Sale internals.                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. SALE DOMAIN                                                                         │
│    Enforces commercial basket invariants, deterministic 13-formula total calculations, │
│    frozen commercial terms, and lifecycle transitions (markPartiallyPaid, markPaid).   │
│    Unaware of Payment tenders, gateway rails, or external transaction references.      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. PAYMENT APPLICATION LAYER                                                           │
│    Orchestrates use cases, coordinates cross-aggregate workflows, resolves models via  │
│    repository ports, enforces multi-tenant boundaries, manages transaction scopes,     │
│    dispatches post-commit events, and maps DTOs. Owns ZERO domain arithmetic.          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. REPOSITORY PORTS (PaymentRepositoryPort, SaleRepositoryPort)                       │
│    Define clean, domain-centric asynchronous query and persistence boundaries.        │
│    Abstract all relational ORM drivers, connection pools, and database tables.        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. PERSISTENCE LAYER (Prisma & PostgreSQL)                                             │
│    Enforces structural foreign keys (payments.sale_id -> sales.id ON DELETE RESTRICT), │
│    PostgreSQL DECIMAL(12,2) exact precision, OCC version checks, and ACID atomicity.   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Axiom:

> **The Application Layer coordinates. The Domains decide. Repositories persist. Persistence enforces relational integrity.**

---

## 3. Explicit Division of Responsibilities

### 3.1 Payment Domain Responsibilities

The [`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts) aggregate root authoritatively owns:

- **Tender Invariants**: Guarantees `amount > $0.00`, valid ISO 4217 currency, valid `PaymentMethod` (`CASH`, `QR`), and valid scalar `SaleId`.
- **Reference Sanitation**: [`PaymentReference`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/payment-reference.vo.ts) enforces max 100 characters, rejects malformed punctuation, and actively rejects credit card PAN sequences (PCI-DSS).
- **State Machine Transitions**: Transitions (`complete`, `fail`, `cancel`) are governed strictly by [`PaymentLifecycleStateMachine`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/services/payment-lifecycle.state-machine.ts) (ADR-0116).
- **Terminal Immutability**: Once `COMPLETED`, `FAILED`, or `CANCELLED`, the payment is permanently immutable. Direct assignment of properties or repeated transitions throw [`InvalidPaymentTransitionException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/invalid-payment-transition.exception.ts).
- **Domain Event Emission**: Emits `PaymentSettledEvent`, `PaymentFailedEvent`, and `PaymentCancelledEvent` internally for collection post-commit.

### 3.2 Sale Domain Responsibilities

The [`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts) aggregate root authoritatively owns:

- **Commercial Invariants**: Validates line items, item discounts, order discounts, and client associations.
- **Deterministic Monetary Totals**: Owns exact `subtotal`, `discountTotal`, and `total` via canonical [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts) value objects (ADR-0108, ADR-0114).
- **Debt Discharge State Machine**:
  - `markPendingPayment()`: Transitions from `DRAFT` $\to$ `PENDING_PAYMENT` upon finalization (freezing line items).
  - `markPartiallyPaid()`: Transitions from `PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` upon receiving partial tender.
  - `markPaid()`: Transitions from `PENDING_PAYMENT` | `PARTIALLY_PAID` $\to$ `PAID` upon full settlement confirmation.
  - `cancel()`: Permitted only while in `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID`.

### 3.3 Payment Application Layer Responsibilities

The Application Layer handlers own orchestration exclusively:

- **Input Verification**: Validates shape, non-empty IDs, and parses transport payloads into typed commands/queries.
- **Context & Authorization**: Verifies caller identity, evaluates role permissions (`payments.create`, `payments.read`, `payments.manage`), and enforces multi-tenant boundary checks (`enforceTenantIsolation`).
- **Aggregate Resolution**: Loads `Payment` via [`PaymentRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/payment-repository.port.ts) and associated `Sale` via [`SaleRepositoryPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-repository.port.ts).
- **Orchestration Precondition Verification**: Verifies currency compatibility and checks that target sales are payable (not cancelled, terminal, or draft).
- **Domain Delegation**: Calls `payment.complete(...)`, `payment.fail(...)`, `payment.cancel(...)`, `sale.markPaid(...)`, or `sale.markPartiallyPaid(...)`.
- **Atomic Persistence**: Coordinates database transaction wrappers ensuring both `payment` and `sale` persist together.
- **Domain Event Dispatching**: Dispatches uncommitted events to [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts) strictly _after_ successful persistence commit.
- **DTO Transformation**: Maps internal domain entities to immutable application representations ([`PaymentDTO`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/dtos/payment.dto.ts)).

### 3.4 What the Application Layer is NOT Responsible For

- **NO State Machine Duplication**: Does NOT decide whether a payment in status `X` can move to `Y`.
- **NO Totals Calculation**: Does NOT recalculate subtotals, item discounts, or commercial taxes.
- **NO Direct Entity Mutation**: Does NOT execute `payment.status = ...` or `sale.status = ...`.
- **NO SQL/ORM Interaction**: Does NOT import `@prisma/client`, `PrismaClient`, or execute raw SQL.

---

## 4. Cross-Aggregate Completion Workflow

The canonical orchestration flow for completing an asynchronous or pending payment is defined as follows:

```
                  ┌─────────────────────────────────────┐
                  │       CompletePayment Command       │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │       Load Payment Aggregate        │
                  │   paymentRepository.findById(id)    │
                  └──────────────────┬──────────────────┘
                                     │ [Found & Tenant OK]
                                     ▼
                  ┌─────────────────────────────────────┐
                  │         Load Sale Aggregate         │
                  │    saleRepository.findById(saleId)  │
                  └──────────────────┬──────────────────┘
                                     │ [Found & Tenant OK]
                                     ▼
                  ┌─────────────────────────────────────┐
                  │   Validate Orchestration Conditions │
                  │  • Sale is not CANCELLED or terminal│
                  │  • Currencies match exactly         │
                  │  • Payment belongs to target Sale   │
                  └──────────────────┬──────────────────┘
                                     │ [Preconditions Valid]
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Invoke Payment Completion      │
                  │  payment.complete({ reference, ...})│
                  │    (Payment transitions to SETTLED) │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │    Evaluate Sale Settlement Debt    │
                  │  Calculate cumulative settled total │
                  │  • If settled >= total: markPaid()  │
                  │  • If settled < total: partialPaid()│
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Persist Atomically in Tx       │
                  │    await paymentRepository.save()   │
                  │    await saleRepository.save()      │
                  └──────────────────┬──────────────────┘
                                     │ [Tx Committed]
                                     ▼
                  ┌─────────────────────────────────────┐
                  │    Publish Staged Domain Events     │
                  │  eventPublisher.publish([...events])│
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │         Return PaymentDTO           │
                  └─────────────────────────────────────┘
```

### Safety Invariants in Cross-Aggregate Completion:

1. **Domain Integrity**: If `payment.complete()` rejects the transition (e.g. payment was already `CANCELLED`), the handler halts before mutating `Sale`.
2. **Transaction Rollback**: If saving the updated `Sale` aggregate fails (e.g. OCC version collision on `Sale`), the transaction aborts and `Payment` rolls back to its prior state.
3. **No Phantom Events**: Domain events are cleared from aggregates and published only _after_ the database transaction commits successfully.

---

## 5. Milestone 7.12 Application Use-Case Catalog

The Payment Application Layer comprises seven primary use cases adhering to CQRS principles:

```
                               ┌────────────────────────────────┐
                               │   PAYMENT APPLICATION LAYER    │
                               └───────────────┬────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
             COMMAND USE CASES                                 QUERY USE CASES
       ┌───────────────────────────────┐               ┌───────────────────────────────┐
       │ • CreatePayment (Record)      │               │ • GetPayment                  │
       │ • CompletePayment (Settle)    │               │ • ListPayments                │
       │ • FailPayment                 │               │ • GetSalePaymentHistory       │
       │ • CancelPayment               │               └───────────────────────────────┘
       └───────────────────────────────┘
```

---

### 5.1 Use Case 1: `CreatePayment` (Alias: `RecordPayment`)

- **Intent**: Initiates or immediately records a monetary tender against a finalized commercial order (`Sale`).
- **Command**: `CreatePaymentCommand` (canonical) / `RecordPaymentCommand` (existing baseline).
- **Input Contract**:
  - `saleId: string` (required)
  - `amount: number` (required, $> 0.00$)
  - `currency?: string` (optional, must match Sale currency)
  - `method: PaymentMethod` (required, `CASH` or `QR`)
  - `reference?: string | null` (optional external reference)
  - `status?: PaymentStatus` (optional initial status: `PENDING` or `COMPLETED`, default: `COMPLETED`)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Workflow**:
  1. Authenticates caller (`payments.create`).
  2. Resolves `Sale` via `SaleRepositoryPort`; verifies sale exists and caller belongs to same `tenantId`.
  3. Verifies `Sale.status` is payable (`PENDING_PAYMENT` or `PARTIALLY_PAID`). Rejects `DRAFT`, `PAID`, `COMPLETED`, or `CANCELLED`.
  4. Converts amount into canonical `Money`; verifies currency homogeneity.
  5. Computes existing settled tenders via `paymentRepository.findBySaleId(saleId)`:
     $$\text{RemainingBalance} = \text{Sale.total} - \sum \text{SettledPayments}$$
     Asserts that proposed payment amount does not exceed remaining balance ($\text{amount} \le \text{RemainingBalance}$), preventing overpayment.
  6. Instantiates domain aggregate via `Payment.createCompleted(...)` or `Payment.createPending(...)`.
  7. Persists `Payment` via `PaymentRepositoryPort.save()`.
  8. If completed, advances `Sale` status:
     - If $\sum \text{Settled} \ge \text{Sale.total}$: `sale.markPaid(clock)`.
     - If $\sum \text{Settled} < \text{Sale.total}$ and status is `PENDING_PAYMENT`: `sale.markPartiallyPaid(clock)`.
     - Persists `Sale` via `SaleRepositoryPort.save()`.
  9. Publishes uncommitted domain events post-commit. Returns `PaymentDTO`.

---

### 5.2 Use Case 2: `CompletePayment` (Alias: `SettlePayment`)

- **Intent**: Confirms the successful collection of funds for an unsettled pending payment.
- **Command**: `CompletePaymentCommand` / `SettlePaymentCommand`.
- **Input Contract**:
  - `paymentId: string` (required)
  - `saleId?: string` (optional cross-check)
  - `reference?: string | null` (optional trace reference update)
  - `paidAt?: Date` (optional explicit settlement time)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Workflow**:
  1. Authenticates caller (`payments.create` or `payments.manage`).
  2. Resolves `Payment` via `PaymentRepositoryPort.findById(paymentId)`.
  3. Enforces multi-tenant isolation.
  4. Resolves parent `Sale` via `SaleRepositoryPort.findById(payment.saleId)`.
  5. Validates orchestration preconditions: sale is not cancelled or terminal.
  6. Executes `payment.complete({ reference, paidAt, clock })`.
  7. Persists `Payment` with OCC verification.
  8. Synchronizes parent `Sale`: evaluates total settled tenders and executes `sale.markPaid()` or `sale.markPartiallyPaid()`. Persists `Sale`.
  9. Publishes events post-commit and returns `PaymentDTO`.

---

### 5.3 Use Case 3: `FailPayment`

- **Intent**: Records the terminal failure, timeout, or decline of an unsettled pending payment.
- **Command**: `FailPaymentCommand`.
- **Input Contract**:
  - `paymentId: string` (required)
  - `saleId?: string` (optional cross-check)
  - `reason?: string` (optional audit failure reason)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Workflow**:
  1. Authenticates caller (`payments.create` or `payments.manage`).
  2. Resolves `Payment` via `PaymentRepositoryPort.findById(paymentId)`.
  3. Enforces multi-tenant boundary.
  4. Executes domain mutation: `payment.fail(reason, clock)`.
  5. Persists updated payment via `paymentRepository.save(payment)`.
  6. Does NOT mutate `Sale`. Parent `Sale` remains in `PENDING_PAYMENT` or `PARTIALLY_PAID`.
  7. Publishes `PaymentFailedEvent` post-commit and returns `PaymentDTO`.

---

### 5.4 Use Case 4: `CancelPayment`

- **Intent**: Voids or aborts an unsettled pending payment prior to fund transfer (e.g. cashier cancels QR prompt).
- **Command**: `CancelPaymentCommand`.
- **Input Contract**:
  - `paymentId: string` (required)
  - `saleId?: string` (optional cross-check)
  - `reason?: string` (optional cancellation reason)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Workflow**:
  1. Authenticates caller with elevated permission (`payments.manage`).
  2. Resolves `Payment` via `PaymentRepositoryPort.findById(paymentId)`.
  3. Enforces multi-tenant boundary.
  4. Executes domain mutation: `payment.cancel(reason, clock)`.
  5. Persists updated payment via `paymentRepository.save(payment)`.
  6. Does NOT mutate `Sale`. Parent `Sale` remains in its current payable status.
  7. Publishes `PaymentCancelledEvent` post-commit and returns `PaymentDTO`.

---

### 5.5 Use Case 5: `GetPayment` (Alias: `GetPaymentById`)

- **Intent**: Retrieves an individual payment record by its unique domain identifier.
- **Query**: `GetPaymentQuery` (canonical) / `GetPaymentByIdQuery` (existing baseline).
- **Input Contract**:
  - `paymentId: string` (required)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO>`
- **Workflow**:
  1. Authenticates caller (`payments.read`).
  2. Resolves `Payment` via `PaymentRepositoryPort.findById(paymentId)`.
  3. Returns `SaleNotFoundException` / `PaymentNotFoundException` if missing.
  4. Enforces multi-tenant isolation.
  5. Maps aggregate to `PaymentDTO` and returns success result.

---

### 5.6 Use Case 6: `ListPayments`

- **Intent**: Retrieves a filtered, paginated, and deterministically sorted collection of payment records.
- **Query**: `ListPaymentsQuery`.
- **Input Contract**:
  - `tenantId?: string`
  - Filters: `saleId?: string`, `status?: PaymentStatus | string`, `method?: PaymentMethod | string`, `fromDate?: Date | string`, `toDate?: Date | string`.
  - Pagination: `page?: number` (default 1, $\ge 1$), `limit?: number` (default 20, max 100).
  - Sorting: `field?: 'createdAt' | 'amount' | 'status'` (whitelisted), `direction?: 'asc' | 'desc'`.
- **Output**: `SalesApplicationResult<PaginatedResultDTO<PaymentDTO>>`
- **Workflow**:
  1. Authenticates caller (`payments.read`).
  2. Normalizes and validates pagination bounds and sort whitelists.
  3. Passes criteria to `PaymentRepositoryPort.findMany(criteria, pagination, sort)`.
  4. Resolves data set and total count without loading unneeded relational graphs.
  5. Maps items to `PaymentDTO[]` and constructs `PaginatedResultDTO<PaymentDTO>`.

---

### 5.7 Use Case 7: `GetSalePaymentHistory` (Alias: `GetPaymentsBySaleId`)

- **Intent**: Retrieves the complete chronological audit trail of payment attempts and settlements for a specific commercial sale.
- **Query**: `GetSalePaymentHistoryQuery` / `GetPaymentsBySaleIdQuery`.
- **Input Contract**:
  - `saleId: string` (required)
  - `tenantId?: string`
  - `currentUser?: AuthenticatedUser`
- **Output**: `SalesApplicationResult<PaymentDTO[]>`
- **Workflow**:
  1. Authenticates caller (`payments.read`).
  2. Resolves parent `Sale` (if saleRepository provided) and verifies tenant isolation.
  3. Resolves payment list via `paymentRepository.findBySaleId(saleId)` ordered chronologically (`createdAt asc`).
  4. Filters by tenant boundary if applicable.
  5. Maps records to `PaymentDTO[]` and returns ordered history.

---

## 6. Financial Domain Rules & Operational Axioms

To prevent misinterpretations and ensure compliance with earlier ADRs, the following rules are formally established:

### 6.1 Payment Amount vs. Sale Total

- **Rule**: An individual payment amount **does NOT need to equal the Sale total**.
- **Rationale**: Kinergy supports multi-tender split payments and incremental customer deposits (ADR-0109, ADR-0115).
- **Constraint**: An individual payment amount must be strictly positive ($amount > \$0.00$) and cannot exceed the remaining unpaid balance ($amount \le remainingBalance$). Overpayment attempts are rejected with `PaymentOverpaymentException`.

### 6.2 Partial Payment Semantics

- **Rule**: Partial payments are **fully supported**.
- **Domain State**: When one or more completed payments satisfy part of the debt ($0 < \sum p.amount < Sale.total$), the `Sale` aggregate advances to `SaleStatus.PARTIALLY_PAID` via `sale.markPartiallyPaid()`.
- **Commercial Invariant**: While in `PARTIALLY_PAID`, commercial terms (items, quantities, discounts) remain frozen; only further payment collections or explicit cancellations are permitted.

### 6.3 Multiple Payments Allowed

- **Rule**: A single `Sale` can be associated with **multiple `Payment` records** ($1 \text{ Sale} \to N \text{ Payments}$).
- **Use Cases**:
  - Split tenders: Cash + QR.
  - Phased tenders: 50% deposit upon appointment booking + 50% balance upon clinical session completion.

### 6.4 Multiple Completed Payments Allowed

- **Rule**: A `Sale` can receive **multiple `COMPLETED` payments** until its commercial debt is fully cleared ($\sum p.amount \ge Sale.total$).
- **Termination**: Once the total debt is cleared, `sale.markPaid()` transitions the sale to `PAID`. Subsequent payment attempts will find $remainingBalance = \$0.00$ and be rejected as overpayments.

### 6.5 Multiple Failed / Cancelled Payments

- **Rule**: A `Sale` may accumulate multiple failed or cancelled payment attempts.
- **Rationale**: If a customer experiences a banking rail timeout or cancels a dynamic QR code prompt, the failed record remains in persistence as an immutable audit trace, while the `Sale` remains in `PENDING_PAYMENT`, permitting immediate retry with an alternative tender.

### 6.6 Completion Idempotency

- **Domain Level**: In the pure `Payment` aggregate, calling `payment.complete()` on an already `COMPLETED` payment throws `InvalidPaymentTransitionException` ("Completed payments are permanently immutable", ADR-0116 §4.2).
- **Application Level**: Handlers must return structured application failure results or handle idempotent retry semantics gracefully without corrupting database state.

### 6.7 Failure & Cancellation Idempotency

- **Domain Level**: `fail()` and `cancel()` on terminal states (`COMPLETED`, `FAILED`, `CANCELLED`) throw `InvalidPaymentTransitionException`.
- **Application Level**: Re-attempting to fail or cancel a finalized payment returns a domain rejection without altering persisted state.

### 6.8 Payment Reference Uniqueness

- **Rule**: The `reference` field is **NOT globally unique** in the database.
- **Rationale**: As established in ADR-0115 §5.6, `reference` serves as external audit metadata (e.g. physical cash register tag `DRAWER-1`, or provider sequence number). Relational integrity relies on primary key `id: UUID`, not external references.

### 6.9 Effect of Sale Cancellation on Payments

- **Rule**: Cancelling a `Sale` does **NOT mutate or delete existing `COMPLETED` payments**.
- **Immutability Guarantee**: Completed financial tenders are permanently write-once (ADR-0109, ADR-0115 §5.9). If a partially paid sale is cancelled, historical payments remain intact for accounting reconciliation. Reversals must be executed via autonomous `Refund` compensating transactions.
- **Payability Guard**: No new payments can be recorded against a cancelled sale (`SaleNotPayableException`).

### 6.10 Effect of Payment Cancellation on Sales

- **Rule**: Cancelling an unsettled pending payment does **NOT alter the state of the parent `Sale`**.
- **Rationale**: The pending payment attempt was simply aborted before clearing funds. The `Sale` remains in `PENDING_PAYMENT` or `PARTIALLY_PAID`, ready for another tender.

---

## 7. Transaction & Persistence Architecture

In alignment with ADR-0021 and ADR-0125:

1. **Repository Transaction Wrappers**:
   - `SaleRepositoryPort.withTransaction` and `PaymentRepositoryPort.withTransaction` provide transactional execution contexts.
2. **Atomic Multi-Aggregate Boundary**:
   - During payment creation or completion where parent `Sale` status must advance synchronously with `Payment` persistence, operations are enclosed in a database transaction (`prisma.$transaction`).
   - If either aggregate save fails (e.g. OCC version collision), both aggregate state changes roll back completely.
3. **Optimistic Concurrency Control (OCC)**:
   - `PrismaPaymentRepository.save()` enforces OCC:
     ```sql
     UPDATE payments SET ..., version = version + 1 WHERE id = $1 AND version = $2;
     ```
   - Concurrent modification attempts collision throw `PaymentOptimisticLockException`.
4. **Post-Commit Event Emission**:
   - Uncommitted domain events are harvested and dispatched to [`SalesEventPublisherPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sales-event-publisher.port.ts) strictly _after_ successful database commit, preventing ghost audit entries.

---

## 8. Authorization & Security Architecture

In alignment with ADR-0025 and ADR-0111:

1. **Declarative Permissions**:
   - `payments.read`: Read-only queries (`GetPayment`, `ListPayments`, `GetSalePaymentHistory`).
   - `payments.create`: Transactional operations (`CreatePayment`, `CompletePayment`, `FailPayment`).
   - `payments.manage`: Financially sensitive and voiding operations (`CancelPayment`).
2. **Multi-Tenant Scoping**:
   - Every command and query verifies that `payment.tenantId` matches the caller's trusted context (`enforceTenantIsolation`). Cross-tenant access is rejected with `PaymentUnauthorizedException`.
3. **PCI-DSS Compliance**:
   - Sensitive cardholder PAN data is strictly prohibited from entering `reference` or metadata strings. Validated at the domain boundary by [`PaymentReference`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/payment-reference.vo.ts).

---

## 9. Consequences

### Positive

- **Complete Decoupling**: Application use cases orchestrate workflows without duplicating domain rules or framework concepts.
- **Deterministic State Transitions**: State machine rules remain 100% inside the domain core.
- **Financial Audit Purity**: Immutability, OCC, and post-commit event publishing eliminate ghost events and race conditions.
- **Standardized API Contracts**: Unifies commands, queries, DTOs, and error mappings across the entire bounded context.

### Negative / Trade-Offs

- **Dual Aggregate Persistence Overhead**: Coordinating two aggregate roots (`Payment` and `Sale`) requires managing transactions across repositories, which is slightly more complex than single-aggregate mutations. This complexity is justified by the avoidance of write-contention and aggregate bloat.
