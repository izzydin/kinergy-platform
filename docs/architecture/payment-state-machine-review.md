# Phase 7: Sales & Payments — Milestone 7.6: Payment State Machine Architectural Review & Specification

- **Document**: `docs/architecture/payment-state-machine-review.md`
- **Milestone**: 7.6 (Payment State Machine)
- **Status**: **Architectural Review & Specification Proposal (Pre-Implementation)**
- **Role**: Senior Domain Architect & Payments Systems Engineer
- **Date**: 2026-09-23
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)

---

## 1. Executive Summary & Objective

In **Milestone 7.5**, the canonical Payment domain was established as an autonomous Aggregate Root (`Payment`) linked to the parent `Sale` aggregate exclusively by a scalar `saleId: SaleId`.

The business objective of **Milestone 7.6** is to inspect and formalize the **Payment State Machine**, ensuring that:

1. The Payment lifecycle is strictly **explicit and deterministic**.
2. A Payment status **never silently changes**; transitions must occur exclusively through domain methods.
3. No code is allowed to perform direct assignment (`payment.status = ...`) outside the domain entity.
4. Any semantic divergence between candidate models (e.g., `COMPLETED` vs. `SETTLED`) is explicitly analyzed and reconciled through the ADR process rather than changed silently.

This document presents the comprehensive architectural inspection of the Milestone 7.5 codebase, directly answers the 10 domain audit questions, evaluates candidate states, and delivers the blueprint for Milestone 7.6 implementation.

---

## 2. Answers to the 10 Architectural Audit Questions

### 1. What states currently exist?

Currently, the codebase across Domain, Application, and Persistence defines **4 states**:

- **`PENDING`**: Payment tender initiated; customer funds not yet confirmed (e.g., dynamic QR code presented awaiting scan).
- **`SETTLED`**: Payment tender physically collected or cleared; terminal and write-once immutable.
- **`FAILED`**: Payment attempt declined, rejected by provider rail, or timed out; terminal.
- **`CANCELLED`**: Payment attempt voided by cashier/customer prior to clearing; terminal.

_Note on Candidate Model_: The Milestone 7.6 prompt introduces `COMPLETED` as candidate success state. In Milestone 7.5, this exact state was implemented as `SETTLED` (in accordance with ADR-0109 and ADR-0115). Reconciliation between `COMPLETED` and `SETTLED` is addressed in Section 4.

### 2. Can status currently be mutated directly?

**No, not through typed TypeScript code.**

- In `Payment` aggregate (`packages/core/src/sales/domain/payment.aggregate.ts`), `_status` is marked `private`.
- The aggregate exposes a read-only getter: `public get status(): PaymentStatus { return this._status; }` without a corresponding public setter.
- Any attempt to execute `payment.status = ...` generates a TypeScript compilation error (`TS2540: Cannot assign to 'status' because it is a read-only property`).
- The internal constructor is `private`; instantiation occurs exclusively through factories (`Payment.createSettled`, `Payment.createPending`) and `Payment.reconstitute`.

### 3. Can a client provide status?

- **Via External HTTP/REST API (`PaymentsController`)**: **NO.**
  - `POST /api/v1/sales/:saleId/payments`: The request DTO (`RecordPaymentRequestDto`) authoritatively accepts only `method`, `amount`, `currency`, and `reference`. It explicitly omits `status`.
  - `POST /api/v1/payments/:id/settle`: Only accepts optional `reference`.
  - `POST /api/v1/payments/:id/cancel`: Only accepts optional `reason`.
- **Via Internal Application Command (`RecordPaymentCommand`)**: **YES.**
  - `RecordPaymentInput` exposes `status?: PaymentStatus | string;`.
  - `RecordPaymentHandler` validates `input.status`: only `SETTLED` or `PENDING` is accepted for instantiation. If omitted, it defaults to `SETTLED`.

### 4. Can the repository update status without domain validation?

- **Via `PrismaPaymentRepository.save(payment: Payment)`**: **NO.**
  - The repository accepts only a `Payment` domain aggregate instance, maps it via `PrismaPaymentMapper.toPersistence(payment)`, and persists it using optimistic concurrency control (`version: priorVersion`).
- **Via Direct Database / Prisma Client Calls**: **YES.**
  - If a script, developer, or another service bypasses the repository port and directly invokes `prisma.payment.update({ where: { id }, data: { status: '...' } })`, PostgreSQL only enforces the enum constraint (`enum PaymentStatus`), without verifying state machine transition rules or timestamp pairing invariants.
  - In `PrismaPaymentRepository.save()`, for `version === 1`, an `upsert` is executed. While intended for idempotent initial insert, an unconstrained upsert could theoretically overwrite an existing record if IDs collided.

### 5. Can application services change status?

**Yes, but strictly by invoking domain entity transition methods.**

- Application command handlers do not perform arbitrary property mutation:
  - `RecordPaymentHandler` calls `Payment.createSettled(...)` or `Payment.createPending(...)`.
  - `SettlePaymentHandler` calls `payment.settle({ reference, clock })`.
  - `FailPaymentHandler` calls `payment.fail(reason, clock)`.
  - `CancelPaymentHandler` calls `payment.cancel(reason, clock)`.
- No application service bypasses the aggregate root to alter `status`.

### 6. Are timestamps coupled to status?

**Yes, strictly enforced by domain invariants:**

- **`createdAt`**: Set at instantiation; permanently immutable across all transitions.
- **`updatedAt`**: Refreshed to current clock timestamp on every state transition (`settle`, `fail`, `cancel`).
- **`paidAt`**: Strictly coupled to the settled state.
  - When `status === SETTLED`, `paidAt` **must be a valid `Date`** and satisfy `paidAt >= createdAt`.
  - When `status !== SETTLED` (`PENDING`, `FAILED`, `CANCELLED`), `paidAt` **must be strictly `null`**.
  - `Payment.reconstitute()` asserts this invariant eagerly; contradictory database records throw `PaymentDomainException`.

### 7. Is `paidAt` coupled to completion?

**Yes.**

- In Milestone 7.5, completion of the payment tender is represented by `SETTLED`.
- `paidAt` is populated immediately upon `createSettled()` and upon `settle()`.
- Uncompleted states (`PENDING`, `FAILED`, `CANCELLED`) are prohibited from having `paidAt`.
- If the domain status is renamed or aliased to `COMPLETED`, `paidAt` will couple identically to `COMPLETED`.

### 8. Are terminal states enforced?

**Yes.**

- `SETTLED`, `FAILED`, and `CANCELLED` are terminal states.
- In `payment-status.enum.ts`:
  - `ALLOWED_PAYMENT_TRANSITIONS[SETTLED] = []`
  - `ALLOWED_PAYMENT_TRANSITIONS[FAILED] = []`
  - `ALLOWED_PAYMENT_TRANSITIONS[CANCELLED] = []`
- `payment.settle()`, `payment.fail()`, and `payment.cancel()` each call `canTransitionPaymentStatus(...)` and throw `InvalidPaymentTransitionException` if invoked on any terminal payment.
- In particular, settled records are enforced as write-once progressive immutables.

### 9. Are invalid transitions tested?

**Yes, exhaustively.**

- `packages/core/src/sales/domain/__tests__/payment-lifecycle.spec.ts` tests all 16 cells in the 4x4 matrix:
  - Prohibits `PENDING -> PENDING`.
  - Prohibits all transitions out of `SETTLED` (`SETTLED -> PENDING`, `SETTLED -> SETTLED`, `SETTLED -> FAILED`, `SETTLED -> CANCELLED`).
  - Prohibits all transitions out of `FAILED` (`FAILED -> PENDING`, `FAILED -> SETTLED`, `FAILED -> FAILED`, `FAILED -> CANCELLED`).
  - Prohibits all transitions out of `CANCELLED` (`CANCELLED -> PENDING`, `CANCELLED -> SETTLED`, `CANCELLED -> FAILED`, `CANCELLED -> CANCELLED`).
  - Tests contradictory reconstitution states (e.g. `SETTLED` with `null` `paidAt`, `PENDING` with non-null `paidAt`).
- Additional integration testing is in `packages/core/src/sales/__tests__/phase-7-5-payment-qa-safety-net.spec.ts`.

### 10. Does any code bypass domain behavior?

We identified the following potential bypasses / discrepancies in the existing system:

1. **API Default Bias**: In `PaymentsController.recordPayment()`, no `status` is passed to `RecordPaymentCommand`, which causes `RecordPaymentHandler` to default to `SETTLED`. Therefore, all payments recorded via the REST endpoint are created immediately as `SETTLED`, bypassing the `PENDING -> SETTLED` lifecycle unless specifically handled internally or via an async flag.
2. **Missing Controller Route for Failure**: `FailPaymentHandler` exists in the application layer, but has no corresponding route in `PaymentsController` (only `POST /payments/:id/settle` and `POST /payments/:id/cancel` are exposed).
3. **Database-Level Transition Constraints**: PostgreSQL does not have triggers or check constraints enforcing the transition matrix. Direct SQL mutations can bypass domain logic.
4. **Cross-Aggregate Transaction Boundary**: `SettlePaymentHandler` saves `payment` and then saves `sale` in two separate repository operations rather than a shared transactional Unit of Work.

---

## 3. Current Implementation Details (Milestone 7.5 Baseline)

### 3.1 Status Representation

- **Domain Enum**: `packages/core/src/sales/domain/enums/payment-status.enum.ts`
  ```typescript
  export enum PaymentStatus {
    PENDING = 'PENDING',
    SETTLED = 'SETTLED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
  }
  ```
- **Database Schema**: `prisma/schema.prisma`
  ```prisma
  enum PaymentStatus {
    PENDING
    SETTLED
    FAILED
    CANCELLED
  }

  model Payment {
    id        String        @id @default(uuid())
    tenantId  String?       @map("tenant_id")
    saleId    String        @map("sale_id")
    method    PaymentMethod
    amount    Decimal       @db.Decimal(12, 2)
    currency  String        @default("USD") @db.VarChar(3)
    status    PaymentStatus @default(SETTLED)
    reference String?       @db.VarChar(100)
    paidAt    DateTime?     @map("paid_at")
    createdAt DateTime      @default(now()) @map("created_at")
    updatedAt DateTime      @updatedAt @map("updated_at")
    version   Int           @default(1)
    sale      Sale          @relation("SaleToPayments", fields: [saleId], references: [id], onDelete: Restrict)
    ...
  }
  ```

### 3.2 Current Mutation Paths

```text
           ┌────────────────────────┐
           │ Payment.createPending  │ ──► PENDING (paidAt = null)
           └────────────────────────┘        │
                       │                     ├─► payment.settle() ─► SETTLED (paidAt set)
                       │                     ├─► payment.fail()   ─► FAILED  (paidAt = null)
                       │                     └─► payment.cancel() ─► CANCELLED (paidAt = null)
                       ▼
           ┌────────────────────────┐
           │ Payment.createSettled  │ ──► SETTLED (paidAt set immediately)
           └────────────────────────┘
```

---

## 4. Evaluation of State Candidates: `SETTLED` vs. `COMPLETED`

The Milestone 7.6 brief presents the candidate model:

```text
PENDING
COMPLETED
FAILED
CANCELLED
```

### 4.1 Business & Domain Semantics Analysis

1. **In Milestone 7.5 (ADR-0109 / ADR-0115)**:
   - The platform distinguished the commercial order from the monetary tender:
     - **Sale**: `DRAFT` $\to$ `PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` $\to$ `PAID` $\to$ `COMPLETED` / `CANCELLED` / `REFUNDED`.
     - In `Sale`, `COMPLETED` indicates full order fulfillment (physical goods dispensed, gym memberships activated, clinical treatments closed).
     - In financial accounting, monetary tenders "settle" (funds transfer and clear). Thus, `PaymentStatus.SETTLED` was chosen to avoid semantic collision with `SaleStatus.COMPLETED`.
2. **In Milestone 7.6 State Machine Objective**:
   - The user specification proposes `COMPLETED` as the success state for `Payment`:
     ```text
     PENDING
        ├── COMPLETED
        ├── FAILED
        └── CANCELLED
     ```
   - If `COMPLETED` is adopted for `Payment`:
     - Does `PaymentStatus.COMPLETED` have a real business meaning? **Yes.** It means the monetary collection succeeded and the funds transfer is complete.
     - However, we must reconcile this with existing code, Prisma migrations, and ADR-0115.

### 4.2 Reconciliation Options via ADR Process

| Option                                                | Approach                                                                                                                                                                   | Pros                                                                                                                             | Cons / Risks                                                                                                                              |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A (Recommended): Dual-Alias Reconciliation** | Maintain `COMPLETED` as a first-class synonym/alias for `SETTLED` in the domain state machine, or accept `COMPLETED` across the public API while preserving DB continuity. | Non-breaking; satisfies both financial accounting clarity and the Milestone 7.6 specification; avoids heavy database migrations. | Two names for the same terminal success concept if not strictly mapped.                                                                   |
| **Option B: Canonical Migration to `COMPLETED`**      | Fully replace `SETTLED` with `COMPLETED` across Prisma enum, domain enum, aggregate methods (`payment.complete()`), events, and API DTOs.                                  | Pure alignment with the candidate state machine diagram.                                                                         | Breaking change requiring Prisma DB migration, script updates, and modification of ~25 existing files and ~1,500 lines of existing tests. |
| **Option C: Reaffirm `SETTLED` via ADR Amendment**    | Update ADR documentation to confirm that `SETTLED` is the domain-driven realization of the conceptual "Completed" state to preserve distinction from `Sale.COMPLETED`.     | Zero code churn; preserves existing passing tests and database schema.                                                           | Differs from the exact string `COMPLETED` in the prompt diagram.                                                                          |

---

## 5. Proposed Payment State Machine Specification

### 5.1 Formal State Graph

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT STATE MACHINE                           │
│                                                                        │
│                          ┌─────────────┐                               │
│                          │  [Initial]  │                               │
│                          └──────┬──────┘                               │
│                     ┌───────────┴───────────┐                          │
│                     │ createPending()       │ createSettled()          │
│                     ▼                       ▼                          │
│              ┌─────────────┐         ┌─────────────┐                   │
│              │   PENDING   │         │  COMPLETED  │ (or SETTLED)      │
│              └──┬───┬───┬──┘         └─────────────┘                   │
│                 │   │   │                   ▲                          │
│      complete() │   │   │ cancel()          │ (Terminal                │
│    ┌────────────┘   │   └───────────────┐   │  & Immutable)            │
│    │                ▼ fail()            │   │                          │
│    │         ┌─────────────┐     ┌──────┴──────┐                       │
│    │         │   FAILED    │     │  CANCELLED  │                       │
│    │         └─────────────┘     └─────────────┘                       │
│    │           (Terminal)          (Terminal)                          │
│    └────────────────────────────────────┘                              │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Transition Matrix (4x4 Matrix)

| Source (`from`)         | Target (`to`)           | Allowed | Trigger Domain Method                             | Invariant Enforcement & Side Effects                                                                                               |
| :---------------------- | :---------------------- | :-----: | :------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING`               | `PENDING`               | **NO**  | —                                                 | Re-entry prohibited. Throws `InvalidPaymentTransitionException`.                                                                   |
| `PENDING`               | `COMPLETED` / `SETTLED` | **YES** | `payment.complete(opts)` / `payment.settle(opts)` | `paidAt` populated ($\ge$ `createdAt`). `version++`. Emits `PaymentCompletedEvent` / `PaymentSettledEvent`. Permanently immutable. |
| `PENDING`               | `FAILED`                | **YES** | `payment.fail(reason)`                            | `paidAt` remains `null`. `version++`. Emits `PaymentFailedEvent`. Terminal.                                                        |
| `PENDING`               | `CANCELLED`             | **YES** | `payment.cancel(reason)`                          | `paidAt` remains `null`. `version++`. Emits `PaymentCancelledEvent`. Terminal.                                                     |
| `COMPLETED` / `SETTLED` | _Any_                   | **NO**  | —                                                 | **Permanently Immutable**. Throws `InvalidPaymentTransitionException` with message `"Settled payments are permanently immutable"`. |
| `FAILED`                | _Any_                   | **NO**  | —                                                 | **Terminal Audit Record**. Throws `InvalidPaymentTransitionException`. Retries require a new `Payment` aggregate.                  |
| `CANCELLED`             | _Any_                   | **NO**  | —                                                 | **Terminal Audit Record**. Throws `InvalidPaymentTransitionException`.                                                             |

---

## 6. Architectural Implications

### 6.1 Timestamp Implications

- `createdAt`: Captured strictly at construction (UTC). Immutable.
- `updatedAt`: Updated to `clock.now()` on every legal transition.
- `paidAt`:
  - Strictly `null` during `PENDING`, `FAILED`, and `CANCELLED`.
  - Strictly non-null upon transition to `COMPLETED` / `SETTLED`.
  - Must satisfy: `paidAt.getTime() >= createdAt.getTime()`.
  - Once set, `paidAt` can never be cleared or altered.

### 6.2 Persistence Implications

- Relational schema: `payments` table in PostgreSQL mapped via Prisma.
- `onDelete: Restrict` on `saleId` ensures sales with payments cannot be deleted.
- If `COMPLETED` is adopted in Prisma:
  - Requires a Prisma migration to rename or add the enum value in PostgreSQL (`ALTER TYPE "PaymentStatus" ADD VALUE 'COMPLETED';`).
  - Prisma mapper (`PrismaPaymentMapper`) must handle bidirectional mapping.
- Concurrency: OCC checks via `version = priorVersion` on `updateMany` protect against concurrent transition races.
- The `upsert` in initial creation (`version === 1`) should be tightened to an explicit `insert` or guarded against unexpected overwrites.

### 6.3 API Implications

- `PaymentsController`:
  - Expose `POST /api/v1/payments/:id/fail` for provider decline webhooks / cashier fail triggers.
  - Allow `POST /api/v1/sales/:saleId/payments` to accept optional `isAsync?: boolean` or specify initial `PENDING` intent for QR tenders.
  - Standardize error responses: `InvalidPaymentTransitionException` maps cleanly to HTTP `422 Unprocessable Entity` via `SalesExceptionFilter`.

### 6.4 Authorization Implications

- `checkPaymentAuthorization` enforces Phase 1 RBAC:
  - Transition to `COMPLETED` / `SETTLED`: requires `payments.create` or `payments.manage`.
  - Transition to `FAILED`: requires `payments.create` or `payments.manage`.
  - Transition to `CANCELLED`: requires `payments.manage` (voiding financial attempts requires managerial or cashier escalation).
- Tenant isolation: `enforceTenantIsolation` must continue to guard every transition command.

---

## 7. Required Files to Change for Milestone 7.6 Implementation

### Domain Layer

1. `packages/core/src/sales/domain/enums/payment-status.enum.ts`: Update status enum, matrix descriptors, and transition helper functions.
2. `packages/core/src/sales/domain/payment.aggregate.ts`: Align domain lifecycle methods (`settle`, `complete`, `fail`, `cancel`), invariant assertions, and event records.
3. `packages/core/src/sales/domain/exceptions/invalid-payment-transition.exception.ts`: Verify error messaging and code.
4. `packages/core/src/sales/domain/events/`: Event definitions (`payment-settled.event.ts`, `payment-completed.event.ts`, etc.).

### Application Layer

5. `packages/core/src/sales/application/commands/record-payment.command.ts`: Validate input status contract.
6. `packages/core/src/sales/application/handlers/record-payment.handler.ts`: Reconcile creation paths.
7. `packages/core/src/sales/application/handlers/settle-payment.handler.ts`: Alias/support complete.
8. `packages/core/src/sales/application/handlers/fail-payment.handler.ts`: Verify failure transition.
9. `packages/core/src/sales/application/handlers/cancel-payment.handler.ts`: Verify cancellation transition.
10. `packages/core/src/sales/application/dtos/payment.dto.ts`: Output DTO status typing.
11. `packages/core/src/sales/application/mappers/payment.mapper.ts`: Mapper status conversion.

### Infrastructure & Persistence Layer

12. `prisma/schema.prisma`: Reconcile `PaymentStatus` enum if DB schema migration is selected.
13. `packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-payment.mapper.ts`: Align persistence mapper.
14. `packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-payment.repository.ts`: Fix version-1 upsert hardening.

### API Layer

15. `apps/api/src/sales/controllers/payments.controller.ts`: Add `fail` endpoint; ensure Swagger docs reflect state transitions.
16. `apps/api/src/sales/dto/payment-response.dto.ts`: Swagger enum annotations.
17. `apps/api/src/sales/dto/payment-lifecycle-request.dto.ts`: Add fail request DTO if needed.

### Documentation Layer

18. `docs/adr/0116-payment-state-machine.md` (or update to ADR-0115): Formalize reconciliation and final decision.

---

## 8. Unresolved Architectural Questions for User / Deciders

1. **State Naming Reconciliation (`SETTLED` vs. `COMPLETED`)**:
   - Shall we rename `PaymentStatus.SETTLED` to `PaymentStatus.COMPLETED` across the database and domain, or support `COMPLETED` as an alias while preserving `SETTLED` in PostgreSQL to avoid database migrations?
2. **Asynchronous Initial Tender Creation via REST API**:
   - Should `POST /api/v1/sales/:saleId/payments` default to `PENDING` when method is `QR` and `SETTLED`/`COMPLETED` when method is `CASH`, or should the client explicitly pass an `isAsync` / `immediateSettlement` flag?
3. **Cross-Aggregate Transactional Consistency**:
   - When a payment completes and advances the parent `Sale` status to `PARTIALLY_PAID` or `PAID`, should this be executed within a shared Prisma interactive transaction (`UnitOfWork`), or remain coordinated via application service domain events?
