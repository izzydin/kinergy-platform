# 0125. Phase 7 Transaction Architecture and Atomic Persistence Boundaries

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: Senior Transaction Architecture Engineer, Principal Persistence Architect, Senior Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.10: Transactional Architecture & Multi-Record Persistence). Following the uniqueness audit (ADR-0124) and index optimization (ADR-0123), we must audit and formally define the transactional boundaries for all multi-record operations across `sales`, `sale_items`, `payments`, `receipts`, `receipt_sequences`, and candidate entities (`Discount`, `PaymentHistory`).
- **Consulted ADRs**:
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discount Domain Model](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Deterministic Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening](0122-phase-7-financial-persistence-architecture.md)

---

## 1. Context and Problem Statement

Financial operations rarely involve a single isolated column update. A single commercial agreement encapsulates header totals and line items. A discount recalculates subtotals across multiple rows. A completed payment settles customer debt and transitions sale status. A receipt captures an immutable fiscal voucher and increments an annual sequence counter.

If a database connection drops, a disk write fails, a foreign key constraint triggers, or a concurrent worker collides midway through these operations, the relational state risks partial updates:

- **Orphan items**: A `sale_item` committed without a valid parent `Sale`.
- **Inconsistent totals**: A `Sale` whose `totalAmount` does not match the sum of its persisted `sale_items`.
- **Desynchronized settlements**: A `Payment` committed as `SETTLED` while the associated `Sale` remains in `PENDING_PAYMENT`.
- **Partial receipts**: A receipt voucher issued without its line items or with a broken sequence number.

Under **Clean Architecture** and **Domain-Driven Design (DDD)**:

1. The domain core must remain **100% pure**: zero imports of Prisma, `$transaction`, SQL handles, or database sessions.
2. Transactions belong strictly in **persistence/application infrastructure**.
3. We must preserve existing transaction abstractions (`IUnitOfWork` / `PrismaUnitOfWork` / `prisma.$transaction`), strictly rejecting the invention of competing transaction frameworks.

---

## 2. Multi-Record Operations Audit Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 7 MULTI-RECORD TRANSACTION MATRIX                         │
├────────────────────┬─────────────────────────────┬───────────────────┬─────────────────┤
│ OPERATION          │ RECORDS INVOLVED            │ BOUNDARY TYPE     │ TRANSACTION     │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Sale + SaleItems   │ sales (1) + sale_items (N)  │ Aggregate Root +  │ Local DB Tx     │
│                    │                             │ Owned Entities    │ ($transaction)  │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Sale + Discounts   │ sales (1) + sale_items (N)  │ Flattened Value   │ Inherits Sale   │
│                    │                             │ Objects           │ Aggregate Tx    │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Sale + Payment     │ sales (1) + payments (1..N) │ Cross-Aggregate   │ Unit of Work /  │
│                    │                             │ Coordination      │ AsyncLocalStorage│
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Payment + History  │ payments (1) + audit_logs   │ Root + Domain     │ Event-Driven    │
│                    │                             │ Event Stream      │ (Post-Commit)   │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Sale + Receipt     │ sales (read) + receipts (1) │ Autonomous Roots  │ Local DB Tx +   │
│                    │ + receipt_sequences (1)     │ (Read-Only Sale)  │ Atomic Sequence │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ Receipt + Items    │ receipts (1)                │ Single Row        │ Atomic Single   │
│                    │ (embedded JSON snapshots)   │ Embedded Document │ Row Write       │
└────────────────────┴─────────────────────────────┴───────────────────┴─────────────────┘
```

---

## 3. Transactional Design for Each Multi-Record Operation

### 3.1 Operation 1: `Sale + SaleItems`

- **Involved Records**: `sales` table (1 row) and `sale_items` table ($N$ rows).
- **Aggregate Boundary**: `Sale` is the aggregate root. `SaleItem` entities have no lifecycle independent of their parent `Sale`.
- **Transactional Boundary**: **Mandatory Database Transaction (`$transaction`)** inside [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts).
- **Execution Workflow**:
  ```
  BEGIN TRANSACTION ($transaction)
    ├── Check terminal status (CANCELLED / REFUNDED -> Throw TERMINAL_SALE_IMMUTABLE)
    ├── Check single-billing duplicate (tx.sale.findFirst -> Throw DuplicateSaleException)
    ├── Check OCC version collision (tx.sale.updateMany where version = prior -> Throw SaleOptimisticLockException)
    ├── Upsert Sale header row (tx.sale.upsert)
    ├── Differential item sync: delete removed items (tx.saleItem.deleteMany where id NOT IN activeItemIds)
    ├── Upsert active line items (tx.saleItem.upsert for each item)
  COMMIT TRANSACTION
  ```
- **Atomicity & Rollback Guarantee**:
  If any line item fails (e.g. disk fault, database constraint violation, network timeout), PostgreSQL rolls back the entire transaction. An empty sale header, partial basket, or orphan line item can **never** be committed.

### 3.2 Operation 2: `Sale + Discounts`

- **Involved Records**: Flattened columns on `sales` (`order_discount_type`, `order_discount_value`, `order_discount_reason`) and `sale_items` (`discount_type`, `discount_value`, `discount_reason`). Zero separate tables (ADR-0113, ADR-0122 §4.3).
- **Aggregate Boundary**: Embedded Value Objects within `Sale` and `SaleItem`.
- **Transactional Boundary**: **Inherits `Sale.save()` Database Transaction**.
- **Execution Workflow**:
  Applying an order-level or item-level discount recalculates `subtotalAmount`, `discountTotalAmount`, and `totalAmount` in the pure domain core. When `saleRepository.save(sale)` is invoked, the discount fields and the recomputed totals are committed within the exact same `tx.sale.upsert` and `tx.saleItem.upsert` statements.
- **Atomicity & Rollback Guarantee**:
  Because discounts reside in the same relational rows as the commercial totals, discount state can never desynchronize from monetary totals. Failure at any point rolls back both the discount parameters and the sale totals.

### 3.3 Operation 3: `Sale + Payment`

- **Involved Records**: `payments` table (1 row) + `sales` table (1 row).
- **Aggregate Boundary**: **Two Autonomous Aggregate Roots** (`Payment` and `Sale`).
- **Transactional Boundary & Coordination**:
  Under DDD, aggregate roots must not directly mutate each other's persistence stores. Coordination is orchestrated at the application layer (`RecordPaymentHandler`, `CompletePaymentHandler`, `SalePaymentCoordinationService`).
- **Dual-Layer Safety Model**:
  1. **Infrastructure Unit of Work (`IUnitOfWork` / `PrismaUnitOfWork`)**:
     - Where atomic coordination of payment completion and sale status transition is executed, handlers leverage `IUnitOfWork.executeInTransaction()`.
     - `PrismaService` propagates the transaction client via Node.js `AsyncLocalStorage`.
     - Both `paymentRepository.save(payment)` and `saleRepository.save(sale)` join the ambient transaction without leaking ORM handles across layer boundaries.
     - If `sale.save()` fails (e.g. OCC version collision on `Sale`), the payment settlement also rolls back.
  2. **Application Idempotent Reconciliation (`CoordinateSalePaymentHandler`)**:
     - If an unexpected process crash occurs outside a Unit of Work after payment settlement, the payment is committed as `SETTLED`.
     - The application coordination service ([`SalePaymentCoordinationService`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/services/sale-payment-coordination.service.ts)) provides a safe, idempotent reconciliation endpoint:
       `coordinateSalePaymentSettlement({ saleId, paymentId })` verifies the completed payment, confirms debt coverage, and transitions the Sale to `PAID` without re-charging or duplicating tenders.

### 3.4 Operation 4: `Payment + PaymentHistory`

- **Involved Records**: `payments` table + platform `audit_logs`.
- **Architectural Fact**: A dedicated `PaymentHistory` table was formally evaluated and **rejected** (ADR-0122 §5).
- **Transactional Boundary**:
  - `Payment` aggregate mutations and OCC version increments (`version = priorVersion + 1`) execute inside a local `$transaction` in [`PrismaPaymentRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-payment.repository.ts).
  - Domain Events (`PaymentSettledEvent`, `PaymentFailedEvent`, `PaymentCancelledEvent`) are cleared and dispatched to the platform event publisher **strictly after the database transaction commits**.
  - If `paymentRepository.save()` fails or rolls back, events are never published, guaranteeing that audit logs never record phantom or rolled-back payment transitions.

### 3.5 Operation 5: `Sale + Receipt`

- **Involved Records**: `sales` (read-only query) + `receipt_sequences` (1 row counter) + `receipts` (1 row snapshot).
- **Aggregate Boundary**: `Sale` and `Receipt` are autonomous aggregate roots.
- **Transactional Boundary**:
  - **Sale Immutability**: `Sale` is strictly read-only during receipt issuance. Receipts document an already-settled sale (`PAID` or `COMPLETED`); issuing a receipt **never** mutates the `Sale`.
  - **Sequence Allocation**: [`PrismaReceiptSequenceGenerator`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/services/prisma-receipt-sequence.generator.ts) executes a PostgreSQL atomic row-level upsert with `RETURNING current_value` on `receipt_sequences`. Row-level locks serialize sequence generation per tenant and calendar year.
  - **Receipt Persistence**: [`PrismaReceiptRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-receipt.repository.ts) executes within a database `$transaction`:
    ```
    BEGIN TRANSACTION ($transaction)
      ├── Check tenant sale uniqueness (tx.receipt.findUnique where unique_tenant_sale_receipt)
      ├── If existing -> Throw DuplicateReceiptException
      └── Insert receipt row (tx.receipt.create)
    COMMIT TRANSACTION
    ```
- **Atomicity & Concurrency Guarantee**:
  If two parallel checkout workers attempt to issue a receipt for the same sale simultaneously:
  1. The winning transaction commits the receipt.
  2. The losing transaction collides on `unique_tenant_sale_receipt` and rolls back.
  3. [`IssueReceiptHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/issue-receipt.handler.ts) intercepts `DuplicateReceiptException` and re-fetches the committed winning receipt, returning the canonical receipt DTO idempotently with zero error to the client.

### 3.6 Operation 6: `Receipt + ReceiptItems`

- **Involved Records**: 1 row in `receipts` table.
- **Aggregate Boundary**: Single immutable document model (ADR-0117).
- **Transactional Boundary**: **Single-Row Atomic Write**.
- **Atomicity Guarantee**:
  - Rather than creating a normalized child table (`receipt_items`), `Receipt` embeds line items as an immutable point-in-time JSON snapshot (`itemsSnapshot: Json`).
  - The receipt voucher, monetary totals, customer snapshot, payment tender references, and item snapshots are persisted in a **single SQL `INSERT` statement**.
  - Partial receipts or orphaned receipt items are physically impossible at the database engine level.

---

## 4. Preservation of Existing Architectural Patterns

1. **No New Transaction Abstractions**:
   - The platform strictly utilizes the established `IUnitOfWork` application port and `PrismaUnitOfWork` infrastructure adapter codified in ADR-0021.
   - Ambient transactions propagate seamlessly via `PrismaService.asyncLocalStorage` (`runInTransaction`).
2. **Domain Purity**:
   - Domain aggregate roots (`Sale`, `Payment`, `Receipt`) contain zero persistence logic.
   - Domain invariants are evaluated in pure in-memory state machines before persistence is attempted.
3. **Repository Encapsulation**:
   - Aggregate-level transactions are encapsulated within repository adapters (`PrismaSaleRepository`, `PrismaPaymentRepository`, `PrismaReceiptRepository`).
   - Cross-aggregate use cases leverage `IUnitOfWork` where multi-aggregate ACID atomicity is required.

---

## 5. Consequences

### Positive

- **Guaranteed Relational Integrity**: All multi-record operations (`Sale + SaleItems`, `Sale + Discounts`, `Receipt + Sequences`) are 100% ACID atomic.
- **Zero Orphan Records**: Failed item inserts roll back the sale header; duplicate receipt attempts roll back cleanly without partial rows.
- **Deterministic Concurrency**: Sequence counters, OCC version collisions, and single-billing checks are serialized by PostgreSQL row locks and unique indexes.
- **Strict Clean Architecture**: Zero ORM or transaction leaks in the domain core.
