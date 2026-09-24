# Milestone 7.6: Payment Domain Implementation, State Machine & Financial Architecture

- **Document**: `docs/domain/payment-domain-implementation.md`
- **Milestone**: `7.6 — Canonical Payment Lifecycle, State Machine & Financial Transition Determinism` (reconciling Phase 7.5)
- **Role**: Senior Financial Domain Architect / Lead Platform Engineer
- **Status**: **Authoritative Implemented Domain Specification**
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`, `apps/api/src/sales/`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
- **Related Documentation**:
  - [`docs/architecture/sales-payments.md`](../architecture/sales-payments.md)
  - [`docs/domain/sales-payments.md`](sales-payments.md)
  - [`docs/architecture/payment-state-machine-review.md`](../architecture/payment-state-machine-review.md)
  - [`docs/architecture/payment-domain-acceptance.md`](../architecture/payment-domain-acceptance.md)
- **Date**: 2026-09-24

---

## 1. Executive Summary & Foundational Distinction

Milestone 7.6 establishes the canonical, deterministic **Payment State Machine** within the **Sales & Payments** bounded context, enforcing strict separation between commercial debt obligations and financial tender collections.

### 1.1 The Foundational Domain Law

```text
Sale = commercial transaction / amount owed

Payment = money paid toward a Sale
```

> **Payment does not replace or recalculate Sale totals.**
>
> In the Kinergy platform, commercial checkout calculation and financial settlement are strictly decoupled:
>
> - `Sale` aggregate root owns the commercial contract: cart line items, point-in-time checkout snapshots, item-level discounts, gross subtotal, total discount, and net commercial debt ($subtotal - discountTotal = total$).
> - `Payment` aggregate root models the actual monetary tender collected from a customer toward settling that debt.
> - Under no circumstance does recording, transitioning, or cancelling a `Payment` recalculate or alter `Sale.subtotal`, `Sale.discountTotal`, or `Sale.total`.

---

## 2. Payment Domain Model

The `Payment` aggregate root (`packages/core/src/sales/domain/payment.aggregate.ts`) encapsulates the complete financial tender lifecycle:

```text
Payment
├── id: PaymentId
├── tenantId: string
├── saleId: SaleId
├── method: PaymentMethod (CASH, QR)
├── amount: Money
├── status: PaymentStatus (PENDING, COMPLETED, FAILED, CANCELLED)
├── reference?: string | null
├── paidAt?: Date | null
├── createdAt: Date
├── updatedAt: Date
└── version: number
```

### 2.1 Critical Encapsulation Rule

> **Payment status cannot be changed directly. Every state transition must pass through domain/application lifecycle logic.**

- `_status` is marked `private` within `Payment`.
- The aggregate exposes only a read-only getter: `public get status(): PaymentStatus { return this._status; }`.
- Any external caller attempting direct assignment (`payment.status = ...`) fails at compile-time (`TS2540: Cannot assign to 'status' because it is a read-only property`).
- State transitions can only occur by invoking explicit domain methods: `complete()`, `fail()`, `cancel()`, or `applyTransition()`.
- Reconstitution from persistence (`Payment.reconstitute()`) validates state invariants and is restricted to infrastructure mappers.

### 2.2 Detailed Property Specifications

| Property        | Domain Type      | Nullable | Description & Invariants                                                                                           |
| :-------------- | :--------------- | :------: | :----------------------------------------------------------------------------------------------------------------- |
| **`id`**        | `PaymentId`      |    No    | Canonical UUID value object uniquely identifying the payment transaction.                                          |
| **`tenantId`**  | `string`         |    No    | Organization boundary ensuring multi-tenant isolation. Enforced across commands, queries, and repositories.        |
| **`saleId`**    | `SaleId`         |    No    | Scalar identifier referencing the parent `Sale`. The aggregate holds no object or instance reference to `Sale`.    |
| **`method`**    | `PaymentMethod`  |    No    | Tender mechanism (`CASH`, `QR`). Validated against supported domain enumeration.                                   |
| **`amount`**    | `Money`          |    No    | Tender monetary amount ($> 0$). Strictly positive, non-negative, and denominated in parent Sale currency.          |
| **`status`**    | `PaymentStatus`  |    No    | Canonical lifecycle state (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`). `SETTLED` accepted as synonym/DB alias. |
| **`reference`** | `string \| null` |   Yes    | Optional audit tag, drawer identifier, or gateway trace token (max 100 characters; no credit card PANs permitted). |
| **`paidAt`**    | `Date \| null`   |   Yes    | Settlement timestamp (UTC). Set strictly upon entering `COMPLETED`. Must remain `null` for non-completed states.   |
| **`createdAt`** | `Date`           |    No    | UTC timestamp when the payment transaction was first initialized. Permanently immutable.                           |
| **`updatedAt`** | `Date`           |    No    | UTC timestamp of the most recent lifecycle mutation.                                                               |
| **`version`**   | `number`         |    No    | Optimistic Concurrency Control (OCC) integer counter ($\ge 1$), incremented on every state transition.             |

---

## 3. Approved State Definitions

The platform supports exactly four canonical Payment states established by ADR-0116:

```text
PENDING
COMPLETED
FAILED
CANCELLED
```

Do not implement speculative states (`REFUNDED`, `EXPIRED`, `PARTIALLY_COMPLETED`, `REVERSED`) on `Payment`. Reversals and returns are modeled as autonomous compensating records.

### 3.1 PENDING

- **Definition**: A payment tender has been initiated by an operator or system, but funds have not yet been transferred, verified, or cleared.
- **Operational Reality**: Dynamic QR code displayed awaiting customer scan, or asynchronous provider session initiated.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - Amount must be strictly positive ($> 0$).
  - Non-terminal: can transition to `COMPLETED`, `FAILED`, or `CANCELLED`.

### 3.2 COMPLETED (Synonym / Equivalent: SETTLED)

- **Definition**: Monetary value has been definitively collected, verified, and settled into the cash drawer or merchant bank account.
- **Operational Reality**: Cash counted and drawer closed, or electronic gateway confirmed funds clearance.
- **Invariants & Immutability**:
  - `paidAt` must be a valid UTC timestamp ($\ge$ `createdAt`).
  - **Terminal and write-once immutable**: cannot transition to any other status.
  - Reversals require autonomous compensating `Refund` records, never mutation of the completed payment.

> **Semantic Reconciliation**: In domain code, `PaymentStatus.COMPLETED = 'COMPLETED'` is canonical. `PaymentStatus.SETTLED = 'SETTLED'` is supported as a first-class equivalent and matches the PostgreSQL database column enum (`SETTLED`) to maintain zero-disruption persistence compatibility.

### 3.3 FAILED

- **Definition**: The payment attempt terminated unsuccessfully due to rejection, decline, hardware error, or rail timeout.
- **Operational Reality**: Customer bank declined transaction, network timeout, or QR session expired.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - **Terminal**: cannot be retried or transitioned. Retrying payment requires instantiating a fresh `Payment` aggregate.

### 3.4 CANCELLED

- **Definition**: The pending payment attempt was aborted or voided prior to charge execution or fund transfer.
- **Operational Reality**: Customer opted to change tender method (e.g. switch from QR to cash), or cashier aborted pending POS transaction.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - **Terminal**: cannot transition to any other status.

---

## 4. State Transition Matrix & Prohibited Transitions

### 4.1 Permitted Transitions Matrix

```text
Current       Action          Result
-----------------------------------------
PENDING       complete        COMPLETED
PENDING       fail            FAILED
PENDING       cancel          CANCELLED
```

In addition, creation lifecycle paths establish the initial state:

- `Payment.createPending(...)` $\to$ `PENDING` (`paidAt = null`)
- `Payment.createCompleted(...)` / `Payment.createSettled(...)` $\to$ `COMPLETED` (`paidAt = clock.now()`)

### 4.2 Prohibited Transitions (Exhaustive 16-Cell Matrix)

Out of all $4 \times 4 = 16$ possible source/target combinations, exactly **3 transitions are permitted** from an existing payment, and **13 transitions are strictly prohibited**:

| Current State | Target State | Status    | Action / Method | Reason & Enforcement Behavior                                      |
| :------------ | :----------- | :-------- | :-------------- | :----------------------------------------------------------------- |
| `PENDING`     | `COMPLETED`  | **VALID** | `complete()`    | Normal settlement: funds cleared. `paidAt` assigned.               |
| `PENDING`     | `FAILED`     | **VALID** | `fail()`        | Rail decline or timeout. `paidAt = null`.                          |
| `PENDING`     | `CANCELLED`  | **VALID** | `cancel()`      | Operator void before clearing. `paidAt = null`.                    |
| `PENDING`     | `PENDING`    | _INVALID_ | `complete/fail` | Prohibited re-entry. Throws `InvalidPaymentTransitionException`.   |
| `COMPLETED`   | `PENDING`    | _INVALID_ | Domain method   | Prohibited. Cannot revert cleared funds to pending.                |
| `COMPLETED`   | `COMPLETED`  | _INVALID_ | `complete()`    | Prohibited. Write-once immutable. Cannot re-complete.              |
| `COMPLETED`   | `FAILED`     | _INVALID_ | `fail()`        | Prohibited. Settled money cannot fail; requires refund.            |
| `COMPLETED`   | `CANCELLED`  | _INVALID_ | `cancel()`      | Prohibited. Completed tender cannot be cancelled; requires refund. |
| `FAILED`      | `PENDING`    | _INVALID_ | Domain method   | Prohibited. Cannot revive failed tender; create new aggregate.     |
| `FAILED`      | `COMPLETED`  | _INVALID_ | `complete()`    | Prohibited. Cannot complete a failed attempt.                      |
| `FAILED`      | `FAILED`     | _INVALID_ | `fail()`        | Prohibited. Terminal audit record.                                 |
| `FAILED`      | `CANCELLED`  | _INVALID_ | `cancel()`      | Prohibited. Cannot cancel an already failed attempt.               |
| `CANCELLED`   | `PENDING`    | _INVALID_ | Domain method   | Prohibited. Cannot revive aborted tender; create new aggregate.    |
| `CANCELLED`   | `COMPLETED`  | _INVALID_ | `complete()`    | Prohibited. Cannot complete an aborted attempt.                    |
| `CANCELLED`   | `FAILED`     | _INVALID_ | `fail()`        | Prohibited. Cannot fail an aborted attempt.                        |
| `CANCELLED`   | `CANCELLED`  | _INVALID_ | `cancel()`      | Prohibited. Terminal audit record.                                 |

Every prohibited transition throws `InvalidPaymentTransitionException` (`422 Unprocessable Entity`).

---

## 5. Timestamp Rules & Mutation Safety

### 5.1 Timestamp Lifecycle Rules

| Timestamp       | Type           | Nullable? | Rules & Lifecycle Behavior                                                                                                          |
| :-------------- | :------------- | :-------: | :---------------------------------------------------------------------------------------------------------------------------------- |
| **`createdAt`** | `Date`         |    No     | Assigned strictly upon payment creation (`clock.now()`). Permanently immutable across all subsequent transitions.                   |
| **`paidAt`**    | `Date \| null` |    Yes    | Must be `null` in `PENDING`, `FAILED`, and `CANCELLED`. Assigned strictly upon entering `COMPLETED` (`opts.paidAt ?? clock.now()`). |
| **`updatedAt`** | `Date`         |    No     | Refreshed to `clock.now()` on every valid transition (`complete()`, `fail()`, `cancel()`).                                          |

### 5.2 Behavior During Invalid Transitions (Mutation Safety)

When an invalid transition is attempted (e.g. calling `payment.complete()` on a `CANCELLED` payment):

1. The domain eagerly validates transition legality against `ALLOWED_PAYMENT_TRANSITIONS`.
2. It throws `InvalidPaymentTransitionException` immediately.
3. **No fields are mutated**:
   - `status` remains unchanged.
   - `paidAt` remains unchanged (`null` stays `null`; completed timestamp is never altered).
   - `version` is not incremented.
   - No uncommitted domain events are recorded.

---

## 6. Idempotency & Concurrency Guarantees

### 6.1 Idempotency of Lifecycle Commands

- Lifecycle commands (`complete`, `fail`, `cancel`) are **state-transition triggers**, not idempotent upserts.
- Repeating a lifecycle command on an already transitioned payment throws `InvalidPaymentTransitionException`.
  - Example: Calling `POST /payments/:id/complete` twice will return `200 OK` on the first call and `422 Unprocessable Entity` on the second call.
- This deterministic rejection prevents caller confusion, ensures external payment gateways receive unambiguous responses, and protects audit ledgers from duplicate event emissions.

### 6.2 Implemented Concurrency Consistency Guarantee

> **Consistency Guarantee**: Optimistic Concurrency Control (OCC) using the integer `version` field.

- The `Payment` domain aggregate maintains a `version: number` counter, starting at 1 and incremented on every valid transition.
- The PostgreSQL `payments` table maintains a matching `version Int @default(1)` column.
- When `PrismaPaymentRepository.save(payment)` persists an updated aggregate:
  ```typescript
  const updated = await prisma.payment.updateMany({
    where: {
      id: payment.id.value,
      version: payment.version - 1, // OCC predicate
    },
    data: persistenceData,
  });
  if (updated.count === 0) {
    throw new PaymentOptimisticLockException(payment.id.value, payment.version - 1);
  }
  ```
- **Concurrency Collision Behavior**: If two concurrent requests load `PENDING` (version 1) simultaneously:
  - Request A executes `complete()` $\to$ version becomes 2 $\to$ successfully commits (`updated.count === 1`).
  - Request B executes `cancel()` $\to$ version becomes 2 $\to$ tries to update `where version = 1` $\to$ matches 0 rows $\to$ throws `PaymentOptimisticLockException`.
  - The API exception filter translates `PaymentOptimisticLockException` into HTTP **`409 Conflict`**.
- **Important Architectural Notice**: The platform does **not** implement distributed transactions, two-phase locking, or pessimistic database row locks (`SELECT FOR UPDATE`). Callers receiving a 409 must re-fetch the latest resource and re-evaluate their intent.

---

## 7. System Architecture Boundaries

```text
API Layer (PaymentsController)
    ↓
Application Layer (Use Case Handlers: CompletePaymentHandler, FailPaymentHandler, CancelPaymentHandler)
    ↓
Payment Domain Layer (Payment Aggregate Root, PaymentStatus, State Machine)
    ↓
Repository Layer (PaymentRepositoryPort / PrismaPaymentRepository)
    ↓
Database (PostgreSQL via Prisma ORM)
```

- **The state machine belongs strictly to the Domain Layer**.
- Controllers do not evaluate transitions.
- Application handlers orchestrate transactions and load aggregates, but never mutate `status` directly.
- Repositories only persist and rehydrate domain aggregates; they never enforce or bypass lifecycle rules.

---

## 8. HTTP REST API Specification

### 8.1 Endpoints Catalog

| HTTP Method | Route                            | Permission Required                  | Allowed Roles                                       | Summary                                       | Expected Codes                           |
| :---------- | :------------------------------- | :----------------------------------- | :-------------------------------------------------- | :-------------------------------------------- | :--------------------------------------- |
| `POST`      | `/api/v1/sales/:saleId/payments` | `payments.create`                    | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Record tender against a finalized sale order  | `201`, `400`, `403`, `404`, `422`        |
| `GET`       | `/api/v1/sales/:saleId/payments` | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | List all payments for a commercial sale order | `200`, `401`, `403`, `404`               |
| `GET`       | `/api/v1/payments/:paymentId`    | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Retrieve individual payment record by ID      | `200`, `401`, `403`, `404`               |
| `POST`      | `/api/v1/payments/:id/complete`  | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | Complete a pending payment tender             | `200`, `400`, `403`, `404`, `409`, `422` |
| `POST`      | `/api/v1/payments/:id/fail`      | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | Record provider failure/decline on pending    | `200`, `400`, `403`, `404`, `409`, `422` |
| `POST`      | `/api/v1/payments/:id/cancel`    | `payments.manage`                    | `Owner`, `Manager`, `Receptionist`                  | Cancel or void an unsettled pending payment   | `200`, `400`, `403`, `404`, `409`, `422` |
| `POST`      | `/api/v1/payments/:id/settle`    | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | Settle pending payment (alias for complete)   | `200`, `400`, `403`, `404`, `409`, `422` |

### 8.2 Command Request Semantics

Client request DTOs strictly accept only operational parameters. **Clients cannot pass `status`, `paidAt`, or `createdAt`**:

- `POST /api/v1/payments/:id/complete`: Accepts optional `{ "reference"?: string, "paidAt"?: string }`.
- `POST /api/v1/payments/:id/fail`: Accepts optional `{ "reason"?: string }`.
- `POST /api/v1/payments/:id/cancel`: Accepts optional `{ "reason"?: string }`.

Any client-supplied `status` field is stripped by validation pipes and ignored by application use cases.

---

## 9. Traceability Matrix

Every lifecycle requirement traces from business requirements through ADRs, states, transition rules, domain methods, use cases, API routes, and automated test suites:

```text
Requirement
    ↓
ADR
    ↓
State
    ↓
Transition Rule
    ↓
Domain Method
    ↓
Use Case
    ↓
API
    ↓
Test
```

| Requirement                | ADR      | State / Transition       | Domain Rule & Method     | Application Use Case     | API Endpoint                | Governing Test Suite                                    |
| :------------------------- | :------- | :----------------------- | :----------------------- | :----------------------- | :-------------------------- | :------------------------------------------------------ |
| **Deterministic States**   | ADR-0116 | Exact 4 states           | `PaymentStatus` Enum     | CQRS DTOs                | Response DTO                | `payment-lifecycle-qa-matrix.spec.ts` (Tests 1–4)       |
| **Permitted Transitions**  | ADR-0116 | `PENDING` $\to$ `COMPL.` | `Payment.complete()`     | `CompletePaymentHandler` | `POST /payments/:id/compl.` | `payment-lifecycle-qa-matrix.spec.ts` (Tests 5–7)       |
| **Failure Transition**     | ADR-0116 | `PENDING` $\to$ `FAILED` | `Payment.fail()`         | `FailPaymentHandler`     | `POST /payments/:id/fail`   | `payment-lifecycle-qa-matrix.spec.ts` (Tests 8–10)      |
| **Cancel Transition**      | ADR-0116 | `PENDING` $\to$ `CANC.`  | `Payment.cancel()`       | `CancelPaymentHandler`   | `POST /payments/:id/cancel` | `payment-lifecycle-qa-matrix.spec.ts` (Tests 11–13)     |
| **Prohibited Matrix (13)** | ADR-0116 | Terminal Immutability    | `ALLOWED_PAYMENT_TRANS.` | Domain Exception Filter  | `422 Unprocessable Entity`  | `payment-lifecycle-qa-matrix.spec.ts` (Tests 14–26)     |
| **Mutation Safety**        | ADR-0116 | All Fields Preserved     | `Payment._status` Guard  | Rejection Safety         | Integrity Protection        | `payment-lifecycle-qa-matrix.spec.ts` (Tests 27–28)     |
| **Timestamp Invariants**   | ADR-0116 | `paidAt` Coupling        | `Payment.validatePaidAt` | Entity Invariants        | Serialized ISO-8601         | `payment-lifecycle-qa-matrix.spec.ts` (Tests 29–30)     |
| **OCC Concurrency**        | ADR-0116 | Monotonic `version`      | `Payment.version++`      | `PrismaPaymentRepo`      | `409 Conflict`              | `payment-lifecycle-qa-matrix.spec.ts` (Tests 31–32)     |
| **API Lifecycle Routes**   | ADR-0116 | External HTTP Interface  | `PaymentsController`     | Handlers Pipeline        | Complete / Fail / Cancel    | `payments-lifecycle-api-qa.spec.ts` (17 endpoint tests) |
