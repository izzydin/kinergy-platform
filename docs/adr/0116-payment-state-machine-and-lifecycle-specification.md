# 0116. Payment State Machine, Lifecycle Specification, and Financial Transition Determinism

- **Status**: Accepted
- **Date**: 2026-09-23
- **Deciders**: Principal Financial Domain Architect, Principal Software Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.6: Payment State Machine). Following Milestone 7.5 discovery, the platform requires an authoritative, explicit, and deterministic specification of the `Payment` state machine, transition matrix, terminality guarantees, timestamp semantics, concurrency model, and transition ownership.
- **Consulted ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](0115-payment-domain-canonical-architecture.md)

---

## 1. Context and Problem Statement

In Milestone 7.5, Kinergy decoupled commercial orders (`Sale`) from monetary tenders (`Payment`), establishing `Payment` as an autonomous Aggregate Root linked solely via scalar `saleId: SaleId`.

However, financial integrity requires that a Payment's lifecycle is:

1. **Explicit**: Every state has an unambiguous business definition.
2. **Deterministic**: Every valid and invalid state transition is mathematically defined in a formal transition matrix.
3. **Domain-Owned**: Transition validity is owned exclusively by the `Payment` domain aggregate. Neither HTTP controllers, application use cases, nor persistence repositories may bypass domain rules.
4. **Protected Against Direct Mutation**: Code of the form `payment.status = ...` is strictly prohibited.
5. **Concurrently Safe**: Race conditions (e.g. concurrent webhook confirmations or double clicks) must never produce corrupted financial state.

This ADR establishes the authoritative Payment state machine, reconciles candidate terminology (`COMPLETED` vs. `SETTLED`), defines strict timestamp semantics, formalizes error and concurrency behavior, and sets the quality standard for all payment lifecycle implementations.

---

## 2. Decision Drivers

- **Domain Integrity & Ownership**: The `Payment` aggregate root must be the sole authority deciding whether a transition is permitted.
- **Progressive Immutability**: Successfully collected funds must become permanently immutable (write-once). Reversals and refunds must be modeled as separate compensating transactions.
- **Zero Ambiguity in Terminology**: State names must reflect clear financial operations without conflating commercial order fulfillment with monetary collection.
- **Strict Timestamp Coupling**: Timestamps (`paidAt`, `createdAt`, `updatedAt`) must correlate deterministically with lifecycle milestones.
- **Predictable Error Semantics**: Prohibited transitions must throw structured, strongly typed domain exceptions communicating current state, target state, and reason.
- **Concurrency Protection**: Optimistic Concurrency Control (OCC) must prevent conflicting transitions from being silently accepted.

---

## 3. Authoritative State Definitions

The Payment lifecycle comprises four discrete states:

```text
                ┌──────────────┐
                │   PENDING    │
                └──────┬───────┘
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         COMPLETED   FAILED   CANCELLED
       (or SETTLED)
```

### 3.1 PENDING

- **Definition**: A payment tender has been initiated by an operator or system, but funds have not yet been transferred, verified, or cleared.
- **Operational Reality**:
  - A dynamic QR code has been generated and displayed on a customer-facing display or mobile app, awaiting customer bank authorization.
  - An external provider session has been initiated but webhook confirmation has not arrived.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - Amount must be strictly positive ($> 0$).
  - Terminal operations are unlocked; the payment is mutable only through transition methods (`complete`/`settle`, `fail`, `cancel`).

### 3.2 COMPLETED (Synonym / Equivalent: SETTLED)

- **Definition**: Monetary value has been definitively collected and verified as received by the merchant in the cash drawer or bank account.
- **Operational Reality**:
  - In-person cash was counted, verified, and placed into the register drawer.
  - Electronic QR / banking gateway emitted an authoritative confirmation packet with trace reference.
- **Invariants & Immutability**:
  - `paidAt` must be a valid UTC timestamp ($\ge$ `createdAt`).
  - Terminal state: permanently immutable (write-once).
  - SQL `UPDATE` and `DELETE` of financial fields (`amount`, `currency`, `method`, `paidAt`) are strictly prohibited.
  - Reversals require autonomous compensating `Refund` records, never mutation of the completed payment.

> **Semantic Reconciliation between `COMPLETED` and `SETTLED`**:
>
> - In Kinergy's commercial domain, `SaleStatus.COMPLETED` represents commercial fulfillment (physical goods delivered, gym memberships activated, treatment sessions closed).
> - In financial accounting, monetary tenders "settle" (funds clear).
> - To unify the candidate state machine with existing Phase 7.5 infrastructure without disruptive database breaking changes:
>   - In the Payment domain state machine, **`COMPLETED`** and **`SETTLED`** are recognized as canonical equivalents.
>   - Domain methods provide `complete()` as a primary API and alias `settle()` / `markAsPaid()`.
>   - Domain status enum `PaymentStatus.COMPLETED = 'COMPLETED'` is provided with full bidirectional mapping to the persistence representation (`SETTLED`).

### 3.3 FAILED

- **Definition**: The payment attempt terminated unsuccessfully due to rejection, decline, hardware error, or rail timeout.
- **Operational Reality**:
  - The customer's bank declined the transaction due to insufficient funds.
  - QR session timed out without confirmation.
  - Communication with the payment gateway failed permanently.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - Terminal state: cannot be retried. A new payment attempt requires creating a new `Payment` aggregate instance with a fresh identifier.

### 3.4 CANCELLED

- **Definition**: The pending payment attempt was aborted or voided prior to charge execution or fund transfer.
- **Operational Reality**:
  - The customer changed their mind and requested to tender cash instead of scanning a QR code.
  - The cashier aborted an erroneous prompt on the POS terminal before payment was made.
- **Invariants**:
  - `paidAt` must be strictly `null`.
  - Terminal state: cannot transition to any other status.
  - Cancellation must be recorded with an audit reason and requires elevated permissions (`payments.manage`).

---

## 4. Authoritative State Transition Matrix

### 4.1 Permitted Transitions

| Source State (`from`) | Action / Trigger                        | Target State (`to`)     | Preconditions & Side Effects                                                                                                                      |
| :-------------------- | :-------------------------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[*]` (Creation)      | `createPending()`                       | `PENDING`               | Amount $> 0$; valid `tenantId`, `saleId`, and `method`. `paidAt = null`.                                                                          |
| `[*]` (Creation)      | `createSettled()` / `createCompleted()` | `COMPLETED` (`SETTLED`) | Direct instant tender (e.g. physical cash). `paidAt = clock.now()`. `version = 1`. Emits `PaymentCompletedEvent` / `PaymentSettledEvent`.         |
| `PENDING`             | `complete(opts)` / `settle(opts)`       | `COMPLETED` (`SETTLED`) | Funds verified. `paidAt = opts.paidAt ?? clock.now()`. `paidAt >= createdAt`. `version++`. Emits completion event. Becomes permanently immutable. |
| `PENDING`             | `fail(reason)`                          | `FAILED`                | Rail decline or timeout. `paidAt = null`. `version++`. Emits `PaymentFailedEvent`. Terminal audit record.                                         |
| `PENDING`             | `cancel(reason)`                        | `CANCELLED`             | Aborted prior to clearing. `paidAt = null`. `version++`. Emits `PaymentCancelledEvent`. Terminal audit record.                                    |

### 4.2 Prohibited Transitions (Exhaustive Matrix)

Every transition not explicitly listed in Section 4.1 is **strictly prohibited** and throws `InvalidPaymentTransitionException`:

```text
// Prohibited from PENDING
PENDING   ──► PENDING       INVALID (Cannot re-enter pending)

// Prohibited from COMPLETED / SETTLED (Terminal & Write-Once Immutable)
COMPLETED ──► PENDING       INVALID (Cannot revert settled funds to pending)
COMPLETED ──► COMPLETED     INVALID (Cannot re-complete; records are write-once)
COMPLETED ──► FAILED        INVALID (Completed tender cannot fail; requires refund)
COMPLETED ──► CANCELLED     INVALID (Completed tender cannot be cancelled; requires refund)

// Prohibited from FAILED (Terminal Audit Record)
FAILED    ──► PENDING       INVALID (Cannot revive failed payment; create new aggregate)
FAILED    ──► COMPLETED     INVALID (Cannot complete a failed attempt)
FAILED    ──► FAILED        INVALID (Cannot re-fail terminal record)
FAILED    ──► CANCELLED     INVALID (Cannot cancel an already failed attempt)

// Prohibited from CANCELLED (Terminal Audit Record)
CANCELLED ──► PENDING       INVALID (Cannot revive cancelled payment; create new aggregate)
CANCELLED ──► COMPLETED     INVALID (Cannot complete an aborted attempt)
CANCELLED ──► FAILED        INVALID (Cannot fail an aborted attempt)
CANCELLED ──► CANCELLED     INVALID (Cannot re-cancel terminal record)
```

---

## 5. Terminal States Policy

1. **`COMPLETED` (`SETTLED`)**, **`FAILED`**, and **`CANCELLED`** are **terminal lifecycle states**.
2. **Enforcement in Domain**:
   - `ALLOWED_PAYMENT_TRANSITIONS[COMPLETED] = []`
   - `ALLOWED_PAYMENT_TRANSITIONS[FAILED] = []`
   - `ALLOWED_PAYMENT_TRANSITIONS[CANCELLED] = []`
3. A terminal Payment **cannot silently re-enter the lifecycle** under any circumstance.
4. If a customer wishes to retry after a `FAILED` or `CANCELLED` payment, the application layer must instantiate a brand new `Payment` aggregate with a new `PaymentId`.

---

## 6. Transition Ownership & Architectural Boundaries

> **The Payment domain owns transition validity.**

- **Domain Layer**: The `Payment` aggregate root defines and enforces all lifecycle transition rules, invariant validations, and domain events.
- **Application Layer**: Use cases and command handlers (`RecordPaymentHandler`, `SettlePaymentHandler`, `FailPaymentHandler`, `CancelPaymentHandler`) orchestrate workflows, verify permissions, retrieve aggregates, invoke domain methods, and persist results.
- **Presentation / API Layer**: HTTP controllers (`PaymentsController`) parse DTOs and dispatch commands. **Controllers do not decide whether transitions are valid.**
- **Persistence Layer**: Repositories (`PrismaPaymentRepository`) persist aggregate state via mappers and enforce optimistic locking. **Repositories do not decide whether transitions are valid.**

---

## 7. Status Mutation Prohibition

Arbitrary status mutation is strictly prohibited:

```typescript
// PROHIBITED: Compilation Error (TS2540: Cannot assign to read-only property)
payment.status = PaymentStatus.COMPLETED;
```

- In `Payment`, `_status` is private.
- The property getter is read-only: `public get status(): PaymentStatus { return this._status; }`.
- Status transitions occur exclusively through domain methods:
  - `payment.complete(options)` / `payment.settle(options)`
  - `payment.fail(reason)`
  - `payment.cancel(reason)`
- Reconstitution from persistence (`Payment.reconstitute()`) verifies valid invariants (`assertValidPaymentStatus`, `paidAt` alignment) and is restricted to infrastructure mappers.

---

## 8. Timestamp Semantics

| Property        | Type           | Nullable? | Mutability | Lifecycle Behavior                                                                                                               |
| :-------------- | :------------- | :-------: | :--------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **`createdAt`** | `Date`         |    No     | Immutable  | Set strictly at aggregate creation in UTC. Never altered.                                                                        |
| **`updatedAt`** | `Date`         |    No     | Mutable    | Updated to `clock.now()` on every valid state transition.                                                                        |
| **`paidAt`**    | `Date \| null` |    Yes    | Write-Once | Set to transition timestamp when status enters `COMPLETED` (`SETTLED`). Must be `null` for `PENDING`, `FAILED`, and `CANCELLED`. |

### Specific Timestamp Rules:

1. **Transition to `COMPLETED`**:
   `paidAt = options.paidAt ?? clock.now()`
   Invariant: `paidAt.getTime() >= createdAt.getTime()`. An explicit `paidAt` earlier than `createdAt` is rejected with `PaymentDomainException`.
2. **Transition to `FAILED`**:
   `paidAt` must remain `null`. No speculative `failedAt` column is created; failure audit time is captured in `updatedAt` and `PaymentFailedEvent.occurredOn`.
3. **Transition to `CANCELLED`**:
   `paidAt` must remain `null`. Cancellation audit time is captured in `updatedAt` and `PaymentCancelledEvent.occurredOn`.
4. **Repeated `COMPLETED` Commands**:
   Rejected as an invalid transition. `paidAt` is never modified or overwritten.
5. **Invalid Transitions**:
   An exception is thrown before any field changes. `paidAt` and `updatedAt` remain unchanged.

---

## 9. Idempotency Policy

### Decision: Domain Rejection / Application-Level Idempotency

- **Domain Layer**: Repeated lifecycle commands are **strictly rejected as invalid transitions**.
  - Calling `payment.complete()` on an already `COMPLETED` payment throws `InvalidPaymentTransitionException`.
  - A financial domain aggregate must never silently accept duplicate state change commands, ensuring write-once progressive immutability and preventing duplicate domain event generation.
- **Application Layer**: Use cases can handle idempotent retry deduplication (e.g. webhook retries) by checking aggregate status before attempting domain mutation, returning the existing DTO representation safely without re-invoking the domain transition.

---

## 10. Error Semantics

Invalid transitions throw `InvalidPaymentTransitionException`:

```typescript
export class InvalidPaymentTransitionException extends PaymentDomainException {
  constructor(
    public readonly currentStatus: PaymentStatus,
    public readonly targetStatus: PaymentStatus,
    reason?: string,
  ) {
    const detail = reason ? `: ${reason}` : '.';
    super(
      `Cannot transition payment from status '${currentStatus}' to '${targetStatus}'${detail}`,
      'INVALID_PAYMENT_TRANSITION',
    );
  }
}
```

- **Properties Communicated**:
  1. `currentStatus`: Current lifecycle state of the payment.
  2. `targetStatus`: Attempted target state.
  3. `reason`: Explicit explanation (e.g. `"Settled payments are permanently immutable"`).
  4. `errorCode`: `'INVALID_PAYMENT_TRANSITION'`.
- **HTTP Mapping**: Mapped by `SalesExceptionFilter` to `HttpStatus.UNPROCESSABLE_ENTITY` (`422`).

---

## 11. Concurrency & Consistency Model

### Problem: Concurrent Conflicting Transitions

Two requests (e.g., cashier manual cancellation and provider webhook confirmation) might attempt to transition the same `PENDING` payment simultaneously.

### Decision: Optimistic Concurrency Control (OCC)

1. The `Payment` aggregate maintains an integer `version: number`.
2. Every lifecycle transition increments `version` by exactly 1 (`this._version += 1`).
3. The repository port enforces OCC on persistence:
   ```sql
   UPDATE payments
   SET status = :status, paid_at = :paidAt, version = :newVersion, updated_at = :updatedAt
   WHERE id = :id AND version = :priorVersion;
   ```
4. If another process updated the payment first, the `WHERE` condition matches 0 rows, and the repository throws `SaleOptimisticLockException` / `PaymentOptimisticLockException`.
5. **Result**: Conflicting transitions cannot overwrite each other or produce an invalid final state. The second request fails deterministically.

---

## 12. Considered Alternatives & Rejected Options

### Alternative 1: Allow In-Place Status Mutation for Refunds (`COMPLETED -> REFUNDED`)

- **Rejected**: Mutating a completed payment destroys cash drawer reconciliation and historical bank deposit balances. Refunds must be modeled as separate compensating transactions referencing the original tender.

### Alternative 2: Idempotent Silent No-Op on Duplicate Domain Transitions

- **Rejected**: In financial domains, silent no-ops conceal duplicate charge attempts or unexpected race conditions. The domain must explicitly reject illegal transitions, leaving safe deduplication to the application layer.

### Alternative 3: Distributed Locks via Redis / Redlock

- **Rejected**: Over-engineering for current POS throughput. Relational OCC via integer `version` guarantees ACID consistency at PostgreSQL scale with zero external operational dependencies.

---

## 13. Audit & Security Implications

- **Authorization Roles**:
  - `complete()` / `settle()`: requires `payments.create` or `payments.manage`.
  - `fail()`: requires `payments.create` or `payments.manage`.
  - `cancel()`: requires `payments.manage` (Manager, Owner, Platform Admin) to prevent unauthorized operator voids.
- **Tenant Boundary**: Multi-tenant isolation is verified on every transition via `enforceTenantIsolation()`.
- **Audit Logging**: Every state transition emits a corresponding domain event containing aggregate ID, version, timestamp, tender method, and cashier/reason attribution.

---

## 14. Testing Implications

The test suite must enforce:

1. **Full Matrix Verification**: All 16 cells of the 4x4 transition matrix tested in unit tests.
2. **Terminality Verification**: Transitions out of `COMPLETED`, `FAILED`, and `CANCELLED` strictly throw `InvalidPaymentTransitionException`.
3. **Timestamp Invariants**: `paidAt` strictly verified across all states.
4. **OCC Verification**: Concurrent version collision tests verifying lock exception throwing.

---

## 15. Future Lifecycle Extensions

Future payment rails (e.g. credit card pre-authorizations) will be introduced cleanly:

- Introduce `AUTHORIZED` state between `PENDING` and `COMPLETED`.
- Existing terminal states (`COMPLETED`, `FAILED`, `CANCELLED`) remain unchanged.
- Backward compatibility guaranteed.
