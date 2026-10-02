# 0128. Phase 7 Test Infrastructure, Fixtures, Builders, and Seeds Reconciliation

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: Senior Test Infrastructure Engineer, Principal Database Architect, Lead Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.10: Test Fixtures, Seeds, and Builders Reconciliation). Following the database migration review and uniqueness audit, all test infrastructure, factories, fixtures, builders, and development seeds must be reconciled with the authoritative Phase 7 persistence model and domain invariants.
- **Consulted ADRs**:
  - [ADR-0108: Money Representation](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle](0109-payment-lifecycle.md)
  - [ADR-0110: Sale Ownership](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discounts](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0123: Phase 7 Financial Model Database Index Strategy](0123-phase-7-financial-database-index-strategy.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit](0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0127: Phase 7 Database Migration Review and Validation](0127-phase-7-database-migration-review-and-validation.md)

---

## 1. Context and Problem Statement

A common anti-pattern in complex financial test suites is test fixtures that construct impossible domain or database states to bypass validations:

- Constructing a `Sale` in `PAID` status without a corresponding `Payment` record.
- Constructing a `Sale` with positive totals but zero line items (`Sale.total = 10, Sale.items = []`).
- Using arbitrary binary floating-point numbers (e.g. `19.999999`) for monetary values instead of strict minor-unit `Money` value objects.
- Truncating tables during test teardown without respecting foreign key dependencies, triggering relational constraint errors.
- Outdated or missing development seeds leaving manual QA and local environments unable to exercise checkout, multi-tender payments, and receipt vouchers.

We must reconcile the test infrastructure across all layers: development seeds, unit/integration fixtures, fluent builders, and test database cleaners.

---

## 2. Decision Outcome

### 2.1 Authoritative Development Seed (`prisma/seeds/sales.seed.ts`)

A dedicated development seed script was implemented and wired into the main seeding pipeline (`prisma/seed.ts`), producing 5 realistic commercial scenarios:

1. **Clinical Assessment (`KINESIOLOGY_SESSION`)**:
   - Status: `PAID` ($120.00).
   - Settled QR payment of exact $120.00.
   - Authoritative Receipt (`REC-2026-000001`) with client, items, and payment snapshots.
2. **Gym Annual Pass (`GYM_MEMBERSHIP`)**:
   - Status: `PAID` ($540.00).
   - $600.00 unit price with 10% promotional discount ($60.00).
   - Settled Cash payment of exact $540.00.
   - Authoritative Receipt (`REC-2026-000002`).
3. **Retail Consumables (`FOOD` + `DRINK`)**:
   - Status: `PAID` ($14.00 across multiple items).
   - Settled Cash payment of exact $14.00.
   - Authoritative Receipt (`REC-2026-000003`) with anonymous client snapshot (`clientSnapshot = null`).
4. **Active Checkout (`ROOM_RENTAL`)**:
   - Status: `PENDING_PAYMENT` ($90.00).
   - Non-empty line items, zero payments, zero receipts (awaiting customer tender).
5. **Cancelled Agreement (`KINESIOLOGY_SESSION`)**:
   - Status: `CANCELLED` ($65.00).
   - Explicit `cancellationReason` and `cancelledAt` timestamp.
   - Zero payments, zero receipts.
6. **Receipt Sequence Counter (`receipt_sequences`)**:
   - Synchronized at `currentValue = 3` for year 2026 to guarantee monotonic continuity.

### 2.2 Coordinated Cluster Fixtures (`packages/testing/src/fixtures/sales.fixtures.ts`)

- `createPaidSaleWithPaymentAndReceiptFixture()`: Enforces aggregate co-creation. It is physically impossible to produce a `PAID` sale without a matching `Payment` and `Receipt`.
- `createPendingSaleFixture()`: Always populates at least one line item and derives totals strictly from items.
- `createCancelledSaleFixture()`: Mandates non-empty cancellation reasons and valid timestamps.
- Raw Prisma fixtures (`createPrismaSaleRecordFixture`, `createPrismaPaymentRecordFixture`, `createPrismaReceiptRecordFixture`): Enforce exact `Prisma.Decimal` instances and satisfy all PostgreSQL CHECK constraints.

### 2.3 Fluent Test Builders (`packages/testing/src/builders/`)

- **`SaleTestBuilder`**: Fluent API that derives `subtotal`, `discountTotal`, and `total` strictly through aggregate methods. Provides `.buildPaid()` which automatically generates coordinated payment and receipt aggregates.
- **`PaymentTestBuilder`**: Enforces strictly positive amounts (`amount > 0`) and valid status transitions.
- **`ReceiptTestBuilder`**: Enforces at least one item snapshot, at least one settled payment snapshot, and monotonic receipt numbering.

### 2.4 Reverse Foreign Key Database Teardown (`packages/testing/src/database/`)

To prevent PostgreSQL foreign key violations (`ON DELETE RESTRICT` on `payments` and `receipts`), the test cleaner defines the authoritative table truncation order:

```
1. receipts          (References sales ON DELETE RESTRICT)
2. payments          (References sales ON DELETE RESTRICT)
3. sale_items        (References sales ON DELETE CASCADE)
4. sales             (Parent Aggregate Root)
5. receipt_sequences (Independent counter)
```

---

## 3. Consequences

### Positive

- Zero impossible states can be created by test suites.
- Financial test data strictly satisfies all relational constraints (`CHECK`, `NOT NULL`, and `FOREIGN KEY`).
- Local development databases seed realistic, end-to-end commercial transactions without manual data entry.
- Clean separation of concerns: `@kinergy-platform/testing` provides reusable infrastructure for all workspace projects.
