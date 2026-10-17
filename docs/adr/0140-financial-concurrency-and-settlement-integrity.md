# 0140. Financial Concurrency, Idempotency, and Multi-Tender Settlement Integrity

- **Status**: Accepted (Approved by Project Owner)
- **Date**: 2026-10-16
- **Deciders**: Principal Financial Domain Architect, Principal Systems Engineer, Technical Product Owner
- **Context**: Kinergy Platform Phase 7 (Commercial Sales & Payments) — Milestone 7.18 Architectural Baseline. Following the completion of Milestone 7.16 (Receipt HTTP API) and Milestone 7.19 (Cross-Domain Commercial Integration), this ADR defines the authoritative, minimal, and complete concurrency and settlement integrity architecture for commercial transactions, split-tender settlement, and operational lifecycle state transitions.
- **Consulted ADRs**:
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals Invariant Enforcement](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture and Tender Decoupling](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Financial Transition Determinism](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Legal Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit](0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0137: Sales API Performance, Index Hygiene, and Financial Concurrency Review](0137-sales-performance-and-consistency-review.md)
  - [ADR-0139: Cross-Domain Commercial Integration Contract](0139-cross-domain-commercial-integration-contract.md)

---

## 1. Context and Problem Statement

Point-of-Sale (POS) and financial settlement engines operate in highly concurrent, distributed multi-terminal retail environments where cashier actions, network retries, and customer card/QR scans execute in parallel.

In Kinergy, commercial checkout sessions unify:

1. **Clinical Healthcare Consultations** (Phase 4): Medico-legal therapy encounters that must be billed at most once across their lifecycle.
2. **Gym Memberships** (Phase 5): Multi-tiered plans and recurring access passes.
3. **Retail Consumables** (Phase 6): High-volume smoothies, supplements, and merchandise purchased repeatedly.
4. **Multi-Tender Payments**: Counter cash, split payments, and asynchronous QR scans against a single sale.

### Current Implementation Baseline & Confirmed Gaps

1. **Vulnerability A: Application-Level Race on Single-Billing Entities**  
   `CreateSaleHandler` and `PrismaSaleRepository.save` check for existing clinical session sales using `findFirst` queries. Under standard PostgreSQL Read Committed isolation, two concurrent checkouts for the exact same clinical session can both pass the read check before either commits, creating duplicate active sales in persistence.
2. **Vulnerability B: Over-Commitment of Unsettled Pending Payments**  
   In `CreatePaymentHandler`, creating a `PENDING` payment (e.g. initiating a QR code) persists only to the `payments` table and does not update or lock the parent `Sale`. Multiple pending payment intents can be created simultaneously whose cumulative total exceeds `sale.total`, because the balance check runs outside the transaction and `Sale.version` is not bumped.
3. **Vulnerability C: Stranded Pending Payments on Sale Cancellation**  
   When `CancelSaleHandler` marks a sale as `CANCELLED`, it mutates only the `Sale` aggregate. Initiated `PENDING` payments remain active in the database indefinitely without being transitioned to `CANCELLED`.
4. **Vulnerability D: Duplicate Payment Reference Collision**  
   While `CreatePaymentHandler` checks `existingPayments.some(...)` in memory for duplicate reference strings, concurrent requests with the identical reference string can race into the database because `payments.reference` has no relational constraint.

---

## 2. Decision Drivers

1. **Zero-Drift Financial Accounting**: Sum of settled payments must never exceed `Sale.total` under any concurrent load.
2. **Preserve Repeatable Retail Purchases**: Never apply blanket uniqueness to `(sourceType, sourceId)` or `sourceCode`. Customers must remain free to buy multiple drinks or renew memberships without artificial unique constraint blocks.
3. **Strict Single-Billing for Clinical Records**: Clinical encounters must be durably guaranteed against dual billing at the PostgreSQL relational engine layer.
4. **Multi-Tender Decoupling**: Preserve aggregate independence between `Sale` and `Payment`. Aggregates link solely via scalar identifiers (`SaleId`).
5. **Minimal Architecture (No Over-Engineering)**: Zero distributed locks (no Redis/Redlock), no distributed 2PC transactions, and no external event brokers. All guarantees must be enforced by PostgreSQL transactions, partial unique indexes, and aggregate Optimistic Concurrency Control (OCC).

---

## 3. Concurrency Design & Architectural Guarantees

### A. Duplicate Sale Creation Guarantee

1. **Transaction Identity via Client Idempotency**:
   - The primary transaction identity is the client-supplied `id` / `idempotencyKey` UUID.
   - In `CreateSaleHandler`, if an incoming request provides an `id` that matches an existing record with identical parameters, it immediately returns the existing `SaleDTO` (idempotent 200 OK replay).
   - If identical parameters arrive concurrently, the secondary insert hits the PostgreSQL primary key constraint `sales_pkey` (`id`), cleanly throwing a catchable unique constraint error mapped to `DuplicateSaleException` or handled as an idempotent replay.
2. **Relational Guarantee for Single-Billing Source Domains**:
   - To eliminate the Read-Committed race condition on clinical encounters without blocking retail purchases, we introduce a **PostgreSQL Partial Unique Index**:
     ```sql
     CREATE UNIQUE INDEX "uq_sales_clinical_session_active"
       ON "sales"("tenant_id", "source_id")
       WHERE "source_type" IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION')
         AND "status" != 'CANCELLED';
     ```
   - **Properties**:
     - Guarantees at the storage engine level that exactly one active (non-cancelled) sale can exist for a given clinical session.
     - Automatically releases the lock if a sale is `CANCELLED`, preserving legitimate re-billing.
     - Completely ignores `FOOD`, `DRINK`, `SUPPLEMENTS`, and `GYM_MEMBERSHIP`, preserving repeat retail sales.
3. **External Commercial Order Code Uniqueness**:
   - A dedicated partial unique index guards distinct upstream order codes (e.g. from third-party booking or e-commerce systems):
     ```sql
     CREATE UNIQUE INDEX "uq_sales_source_code_active"
       ON "sales"("tenant_id", "source_code")
       WHERE "source_code" IS NOT NULL
         AND "source_code" NOT IN ('POS_REGISTER', 'pos_checkout_terminal')
         AND "status" != 'CANCELLED';
     ```

### B. Duplicate Payment Creation Guarantee

1. **Logical Payment Operation Identity**:
   - A logical payment operation is defined by:
     $$\text{Logical Payment} = (\text{saleId}, \text{method}, \text{amount}, \text{reference})$$
   - Cash transactions (`method = CASH`) have `reference = null` and are repeatable to support cash splits (e.g., $20 cash now, $10 cash later).
   - Electronic or card tenders (`method = QR`, `CARD`) carry an explicit payment authorization or terminal reference string.
2. **Relational Guarantee on Tender References**:
   - To eliminate duplicate card authorizations or duplicate QR webhook retries across concurrent requests:
     ```sql
     CREATE UNIQUE INDEX "uq_payments_sale_reference"
       ON "payments"("sale_id", "reference")
       WHERE "reference" IS NOT NULL;
     ```
   - Duplicate concurrent requests with the identical reference collide on this index. The handler catches `P2002` and throws `DuplicatePaymentReferenceException`.

### C. Concurrent Payment Completion Guarantee

1. **State Machine Guard**:
   - Transitions to `COMPLETED` are permitted **strictly** from `PENDING`.
   - `Payment.complete()` validates the transition through `PaymentLifecycleStateMachine`. Repeated calls on an already completed payment throw `PaymentAlreadyCompletedException`.
2. **Atomic Persistence with OCC Version Verification**:
   - In `PrismaPaymentRepository.save()`, updates execute as conditional updates:
     ```sql
     UPDATE "payments"
     SET "status" = 'SETTLED', "paid_at" = :now, "version" = :targetVersion, "updated_at" = :now
     WHERE "id" = :id AND "version" = :priorVersion AND "status" = 'PENDING';
     ```
   - If another thread or worker completed or cancelled the payment, `count` returns `0`, throwing `PaymentOptimisticLockException` and rolling back the transaction.

### D. Sale Total vs. Payment Completion Coordination

1. **Immutability of Finalized Orders**:
   - Once a sale transitions from `DRAFT` to `PENDING_PAYMENT`, all line items, unit prices, discounts, and totals are permanently frozen by `assertDraftState()`.
   - Stale cart edits are physically rejected by the aggregate.
2. **Cross-Aggregate Synchronization within Single Atomic Transaction**:
   - When a payment completes, `CompletePaymentHandler` persists both `paymentRepository.save(payment)` and `saleRepository.save(sale)` inside `unitOfWork.executeInTransaction`.
   - `saleRepository.save(sale)` verifies `WHERE id = :id AND version = :priorVersion`.
   - If a concurrent mutation advanced `Sale.version`, the transaction rolls back completely. The payment tender is not settled against an out-of-sync sale.

### E. Atomic Balance, Overpayment, and Multi-Installment Settlement Protection

1. **Aggregate Outstanding Balance Invariant**:
   - Outstanding balance is defined strictly as:
     $$\text{RemainingBalance} = \text{Sale.total} - \sum_{\text{status} = \text{COMPLETED}} \text{Payment.amount}$$
2. **Transactional Atomic Calculation**:
   - In `CreatePaymentHandler` and `CompletePaymentHandler`, the calculation of `settledTotal` is executed **inside** the transactional unit of work.
   - For `PENDING` payment creation: To prevent unconstrained phantom QR codes that over-commit the order, `CreatePaymentHandler` validates cumulative tenders inside the transaction.
   - If a racing thread completes a payment during calculation, the losing thread encounters an OCC conflict on `Sale.version`, aborts, and retries against the freshly committed balance.
3. **Multi-Installment Partial Payment Lifecycle**:
   - **First Partial Tender**: Transitions `Sale.status` from `PENDING_PAYMENT` to `PARTIALLY_PAID` and increments `Sale.version` via `sale.markPartiallyPaid()`. Both the Payment and Sale aggregates are updated and persisted atomically.
   - **Intermediate Partial Tenders**: When subsequent partial tenders arrive on a sale already in `PARTIALLY_PAID` (cumulative settled < total), the Sale remains in `PARTIALLY_PAID` without triggering illegal state transitions. The payment settles atomically while the parent Sale record remains untouched, avoiding false-positive OCC conflicts.
   - **Final Settlement Tender**: When cumulative settled payments reach or exceed `Sale.total`, the Sale transitions from `PARTIALLY_PAID` to `PAID` via `sale.markPaid()`, bumping `Sale.version` and locking the sale against further tender attachments.
4. **Idempotent Client Replay & Tenant Isolation**:
   - When a client supplies an explicit idempotency identifier (`clientPaymentId`), duplicate primary key collisions in PostgreSQL (`payments_pkey`) are caught and evaluated for safe replay.
   - **Strict Multi-Tenant Boundary**: The existing record's `tenantId` is rigorously verified against the caller's `tenantId`. Cross-tenant replay attempts are rejected with `PaymentUnauthorizedException` (403 Forbidden), preventing information leakage across organizations.
   - **Attribute Parity Verification**: Replays must match `saleId`, `amount`, `currency`, and `method`. Identical requests return `200 OK` with the existing payment DTO; mismatched replays return `409 Conflict` (`DuplicatePaymentReferenceException`).

### F. Concurrent Cancellation and Settlement Coordination

1. **Deterministic Conflict Matrix**:
   - Both `cancel()` and `markPaid()` increment `Sale.version` and transition status to incompatible terminal or settlement states:
     - `cancel()` $\to$ `CANCELLED`
     - `markPaid()` $\to$ `PAID`
2. **Outcome Determination**:
   - **Case 1 (Payment commits first)**: `Sale.status` is `PAID` (v2). Racing cancellation fails OCC on expected version (v1), re-reads `status = PAID`, and domain rejects cancellation with `InvalidSaleTransitionException` ("Sale in status PAID cannot be cancelled").
   - **Case 2 (Cancellation commits first)**: `Sale.status` is `CANCELLED` (v2). Racing payment completion fails OCC or triggers the persistence guard `existing.status === 'CANCELLED'`, rolling back the payment transaction.
3. **Automatic Cancellation of Pending Payments**:
   - When `CancelSaleHandler` executes on a `PENDING_PAYMENT` sale, the handler queries all existing `PENDING` payments for that sale inside the same database transaction and marks them `CANCELLED`, ensuring zero orphaned pending tenders.

---

## 4. Required Schema Migration

The following migration script defines the required partial indexes in PostgreSQL:

```sql
-- Migration: add_phase_7_concurrency_and_single_billing_indexes

-- 1. Enforce partial uniqueness for clinical treatment session sales (single-billing invariant)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_clinical_session_active"
  ON "sales"("tenant_id", "source_id")
  WHERE "source_type" IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION')
    AND "status" != 'CANCELLED';

-- 2. Enforce partial uniqueness for external order references
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_source_code_active"
  ON "sales"("tenant_id", "source_code")
  WHERE "source_code" IS NOT NULL
    AND "source_code" NOT IN ('POS_REGISTER', 'pos_checkout_terminal')
    AND "status" != 'CANCELLED';

-- 3. Enforce tender reference uniqueness per sale for non-cash tenders
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_sale_reference"
  ON "payments"("sale_id", "reference")
  WHERE "reference" IS NOT NULL;
```

---

## 5. Decision Outcomes & Approved Invariants

1. **PostgreSQL Partial Unique Indexes**: Approved to enforce single-billing for clinical sessions and unique payment references without breaking repeat consumable retail sales.
2. **Transactional Balance Scoping**: Approved to enclose payment balance reads and aggregate transitions in `unitOfWork.executeInTransaction`.
3. **Pending Payment Auto-Cancellation**: Approved to automatically cancel active `PENDING` payments when a parent sale is cancelled.
4. **Optimistic Concurrency Control (OCC)**: Confirmed as the standard collision resolution mechanism across `Sale`, `Payment`, and `Receipt` aggregates.
