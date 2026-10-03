# Milestone 7.10: Phase 7 Financial Persistence Architecture & Relational Engineering Specification

- **Status**: Approved & Authoritative
- **Version**: 1.0.0
- **Date**: 2026-10-03
- **Domain**: Sales & Payments Bounded Context
- **Milestone**: 7.10 — Persistence & Database Hardening
- **Role**: Senior Technical Documentation Architect / Principal Database Architect
- **Governing & Consulted ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0113: Item-Level Discount Domain Model, Deterministic Calculation, and Invariant Enforcement](../adr/0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](../adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](../adr/0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Relational Integrity Model](../adr/0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0123: Phase 7 Financial Model Database Index Strategy and Query Optimization](../adr/0123-phase-7-financial-database-index-strategy.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit and Constraint Architecture](../adr/0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation and Clean Persistence Boundaries](../adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0127: Phase 7 Database Migration Review, Data Compatibility, and Verification](../adr/0127-phase-7-database-migration-review-and-validation.md)
  - [ADR-0128: Phase 7 Test Infrastructure, Fixtures, Builders, and Seeds Reconciliation](../adr/0128-phase-7-test-infrastructure-and-seed-reconciliation.md)
  - [ADR-0129: Phase 7 Prisma Schema Architectural Review and Final Integrity Verification](../adr/0129-phase-7-prisma-schema-architectural-review.md)
  - [ADR-0130: Phase 7 Persistence-Boundary Audit and Domain Purity Hardening](../adr/0130-phase-7-persistence-boundary-audit-and-domain-purity.md)
  - [ADR-0131: Phase 7 Query Patterns, Index Optimization, and Relation-Loading Strategy](../adr/0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)

---

## 1. Executive Summary

Milestone 7.10 represents the final persistence engineering and database hardening phase of **Phase 7: Sales & Payments**. It synthesizes domain modeling, relational constraint engineering, PostgreSQL performance optimization, transactional integrity, and hexagonal Clean Architecture boundaries into a production-grade financial engine.

This specification documents the physical persistence models, database constraints, index strategy, transaction boundaries, bounded-context isolation guarantees, and comprehensive traceability from business rules to automated integration tests.

---

## 2. Persistence Model Architecture

The persistence model reflects the bounded domain core while optimizing relational storage and query mechanics.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE 7 PERSISTENCE TOPOLOGY                    │
│                                                                        │
│   ┌───────────────────────────┐         1:N (Cascading Aggregate)      │
│   │           sales           │◄─────────────────────────────────────┐ │
│   │───────────────────────────│                                      │ │
│   │ id (UUID, PK)             │                                      │ │
│   │ tenant_id                 │                                      │ │
│   │ client_id (Scalar Ref)    │         ┌──────────────────────────┐ │ │
│   │ status (SaleStatus)       │         │        sale_items        │ │ │
│   │ source_type, source_id    │         │──────────────────────────│ │ │
│   │ subtotal, discount, total │         │ id (UUID, PK)            │ │ │
│   │ [embedded order discount] │         │ sale_id (FK -> sales.id) ├─┘ │
│   └─────────────┬─────────────┘         │ subtotal, discount, total│   │
│                 │                       │ [embedded line discount] │   │
│                 │                       └──────────────────────────┘   │
│                 │                                                      │
│                 ├──────────────────────────────┐                       │
│                 │ 1:N (Restricted Tender)      │ 1:1 (Fiscal Voucher)  │
│                 ▼                              ▼                       │
│   ┌───────────────────────────┐  ┌───────────────────────────────────┐ │
│   │         payments          │  │              receipts             │ │
│   │───────────────────────────│  │───────────────────────────────────│ │
│   │ id (UUID, PK)             │  │ id (UUID, PK)                     │ │
│   │ sale_id (FK -> sales.id)  │  │ sale_id (FK -> sales.id)          │ │
│   │ method (CASH, QR)         │  │ receipt_number (Tenant Unique)    │ │
│   │ amount (DECIMAL 12,2)     │  │ items_snapshot (Frozen JSON)      │ │
│   │ status (PaymentStatus)    │  │ payments_snapshot (Frozen JSON)   │ │
│   │ paid_at                   │  │ client_snapshot (Frozen JSON)     │ │
│   └───────────────────────────┘  └───────────────────────────────────┘ │
│                                                ▲                       │
│                                                │ Monotonic Sequence    │
│                                  ┌─────────────┴─────────────────────┐ │
│                                  │         receipt_sequences         │ │
│                                  │───────────────────────────────────│ │
│                                  │ tenant_id, year (Composite PK)    │ │
│                                  │ current_value (Atomic Int Counter)│ │
│                                  └───────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Sale Model (`sales`)

- **Table**: `sales`
- **Domain Mapping**: Direct relational mapping of the `Sale` Aggregate Root.
- **Key Columns**:
  - `id`: Global UUID primary key.
  - `tenant_id`: Multi-tenant boundary partitioning column.
  - `client_id`: Scalar identifier of the customer (pure reference; zero cross-context FK).
  - `status`: Transaction lifecycle enum (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`).
  - `currency`: Functional ISO-4217 3-letter currency code (`VARCHAR(3) NOT NULL DEFAULT 'USD'`).
  - `subtotal_amount`, `discount_total_amount`, `total_amount`: Exact monetary totals (`DECIMAL(12, 2)`).
  - `version`: Optimistic Concurrency Control (OCC) integer counter.
  - `cancelled_at`, `cancellation_reason`, `completed_at`, `refunded_at`: Terminal lifecycle audit timestamps.

### 2.2 SaleItem Model (`sale_items`)

- **Table**: `sale_items`
- **Domain Mapping**: Subordinate entities owned entirely by the `Sale` Aggregate Root.
- **Key Columns**:
  - `id`: Global UUID primary key.
  - `sale_id`: Relational foreign key referencing `sales(id) ON DELETE CASCADE`.
  - `description`: Commercial line-item description.
  - `sku_or_code`: Operational item or SKU identifier.
  - `quantity`: Exact quantity (`DECIMAL(10, 3)`), supporting fractional units (e.g. bulk consumables or clinical hours).
  - `unit_price_amount`, `unit_price_currency`: Base unit price (`DECIMAL(12, 2)`).
  - `subtotal_amount`, `discount_total_amount`, `total_amount`: Line-level monetary calculations (`DECIMAL(12, 2)`).

### 2.3 Discount Model (Embedded Value Object)

- **Architectural Decision**: [ADR-0113](../adr/0113-item-level-discounts.md) and [ADR-0122 §4.3](../adr/0122-phase-7-financial-persistence-architecture.md).
- **Physical Representation**: **Embedded columns** directly on `sales` and `sale_items`. **No separate `discounts` table exists**.
  - On `sales`: `order_discount_type` (`VARCHAR`), `order_discount_value` (`DECIMAL(10, 2)`), `order_discount_reason` (`TEXT`).
  - On `sale_items`: `discount_type` (`VARCHAR`), `discount_value` (`DECIMAL(10, 2)`), `discount_reason` (`TEXT`).
- **Rationale**: Discounts possess zero independent lifecycle, entity identity, or audit status. Embedding them guarantees that discount parameters and calculated net totals update or roll back atomically within the single row, preventing split-state anomalies.

### 2.4 Payment Model (`payments`)

- **Table**: `payments`
- **Domain Mapping**: Autonomous Aggregate Root representing individual tenders.
- **Key Columns**:
  - `id`: Global UUID primary key.
  - `sale_id`: Relational foreign key referencing `sales(id) ON DELETE RESTRICT`.
  - `method`: Tender type enum (`CASH`, `QR`).
  - `amount`: Exact tender amount (`DECIMAL(12, 2)`).
  - `currency`: Functional currency code (`VARCHAR(3)`).
  - `status`: Payment state machine enum (`PENDING`, `SETTLED`, `FAILED`, `CANCELLED`).
  - `reference`: External payment gateway transaction reference, bank authorization code, or receipt note.
  - `paid_at`: Settled settlement timestamp.

### 2.5 Receipt Model (`receipts`) & ReceiptSequence (`receipt_sequences`)

- **Table**: `receipts`
- **Domain Mapping**: Autonomous Fiscal Voucher Aggregate Root.
- **Design Pattern**: Self-contained point-in-time document snapshot model ([ADR-0117](../adr/0117-receipt-domain-boundary-and-document-model.md)).
- **Key Columns**:
  - `id`: Global UUID primary key.
  - `tenant_id`: Multi-tenant partitioning scope.
  - `sale_id`: Relational foreign key referencing `sales(id) ON DELETE RESTRICT`.
  - `receipt_number`: Formatted fiscal sequence identifier (e.g. `"REC-2026-000001"`).
  - `sale_reference`: Commercial reference of the parent sale.
  - `client_snapshot`: Frozen JSON representation of client details at issuance.
  - `items_snapshot`: Frozen JSON array of all items, unit prices, discounts, and line totals.
  - `payments_snapshot`: Frozen JSON array of all settled payment tenders.
  - `status`: Receipt lifecycle enum (`ISSUED`, `REPRINTED`).
  - `reprint_count`, `last_reprinted_at`: Fiscal reprint audit trail.
- **Table**: `receipt_sequences`
  - Composite primary key `(tenant_id, year)`.
  - `current_value`: Atomic integer incremented via PostgreSQL row-level upsert with `RETURNING current_value`.

### 2.6 SaleSource (Embedded Commercial Origin)

- **Architectural Decision**: [ADR-0121](../adr/0121-sale-source-references-and-commercial-origin-model.md) and [Milestone 7.9 Specification](./sale-source-specification.md).
- **Physical Representation**: Embedded scalar columns on `sales` and `sale_items`:
  - `source_type`: Origin discriminator (`FOOD`, `DRINK`, `GYM_MEMBERSHIP`, `KINESIOLOGY_SESSION`, `ROOM_RENTAL`, `CUSTOM`).
  - `source_id`: Opaque identifier of the operational origin entity (UUID / String).
  - `source_code`: Optional human-readable commercial code (e.g., SKU, course code).
- **Relational Independence**: Zero foreign keys exist to upstream tables (`inventory_items`, `memberships`, `appointments`, `rooms`).

### 2.7 PaymentHistory (Evaluated & Rejected)

- **Architectural Decision**: [ADR-0122 §5](../adr/0122-phase-7-financial-persistence-architecture.md) and [ADR-0125 §3.4](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md).
- **Determination**: A dedicated `payment_history` table was **rejected as a speculative abstraction**.
- **Audit Implementation**:
  - Current state is authoritatively maintained on `payments.status`, `payments.paid_at`, and `payments.updated_at`.
  - State machine transitions trigger domain events (`PaymentSettledEvent`, `PaymentFailedEvent`, `PaymentCancelledEvent`) that are dispatched post-commit to the central enterprise `audit_logs` service.

---

## 3. Database Constraints Architecture

The relational schema acts as the secondary line of defense behind pure domain invariant enforcement. Every constraint was formally audited in [ADR-0124](../adr/0124-phase-7-financial-models-uniqueness-audit.md).

### 3.1 Relational Foreign Keys

- **`sale_items.sale_id -> sales.id ON DELETE CASCADE`**:
  Enforces aggregate boundary integrity. If an uncommitted draft sale is discarded, all subordinate line items cascade delete. Deleting a settled sale is prevented at the application layer.
- **`payments.sale_id -> sales.id ON DELETE RESTRICT`**:
  Guarantees financial auditability. A `Sale` record with recorded payments can **never** be physically deleted from the database.
- **`receipts.sale_id -> sales.id ON DELETE RESTRICT`**:
  Guarantees legal fiscal compliance. A `Sale` associated with an issued legal receipt voucher can **never** be deleted.
- **Strict Absence of Cross-Context Foreign Keys**:
  `sales.client_id`, `sales.source_id`, and `sale_items.source_id` **deliberately lack foreign key constraints**. This prevents tight relational coupling across autonomous bounded contexts and allows upstream entities to be archived or deleted without breaking immutable financial ledgers.

### 3.2 Non-Null Fields

Mandatory non-nullable attributes protect relational consistency:

- `sales`: `id`, `status`, `currency`, `sourceType`, `sourceId`, `subtotalAmount`, `discountTotalAmount`, `totalAmount`, `version`, `createdAt`, `updatedAt`.
- `sale_items`: `id`, `saleId`, `sourceType`, `sourceId`, `description`, `quantity`, `unitPriceAmount`, `unitPriceCurrency`, `subtotalAmount`, `discountTotalAmount`, `totalAmount`.
- `payments`: `id`, `saleId`, `method`, `amount`, `currency`, `status`, `version`, `createdAt`, `updatedAt`.
- `receipts`: `id`, `tenantId`, `saleId`, `receiptNumber`, `saleReference`, `issuedAt`, `itemsSnapshot`, `paymentsSnapshot`, `subtotalAmount`, `discountTotalAmount`, `totalAmount`, `currency`, `status`, `reprintCount`.

### 3.3 Relational Uniqueness Constraints

- **`sales.id`**, **`sale_items.id`**, **`payments.id`**, **`receipts.id`**: Primary key UUID uniqueness.
- **`receipts(tenantId, saleId)`** (`unique_tenant_sale_receipt`):
  Enforces Invariant `REC-001` (Exactly-One-Receipt-Per-Sale per tenant). Concurrent race attempts to issue a second receipt for the same sale fail deterministically at the database engine level.
- **`receipts(tenantId, receiptNumber)`** (`unique_tenant_receipt_number`):
  Guarantees sequential uniqueness of fiscal voucher numbers within a tenant organization.
- **`receipt_sequences(tenantId, year)`**: Primary key uniqueness for annual sequence counters.

### 3.4 Source Uniqueness & PostgreSQL NULL Semantics

- **Analysis ([ADR-0124 §4](../adr/0124-phase-7-financial-models-uniqueness-audit.md))**:
  Relational unique constraints on `(tenantId, sourceType, sourceId)` were evaluated and **rejected for general sales**. In retail concessions (`FOOD`, `DRINK`) and membership plans (`GYM_MEMBERSHIP`), clients repeatedly purchase the same product or plan over time. A blanket unique constraint would prevent recurring business.
- **PostgreSQL NULL Semantics**: Both `sourceType` and `sourceId` are declared `NOT NULL`, eliminating SQL-92 `NULLS DISTINCT` ambiguity.
- **Clinical Single-Billing (`SALE-010`)**:
  Single-billing of completed clinical sessions (`KINESIOLOGY_SESSION`) is protected via atomic transaction pre-checks in `PrismaSaleRepository.save()` mapped to `DuplicateSaleException`, accelerated by `sales_tenant_id_source_type_source_id_idx`.

### 3.5 Decimal Precision & Capacity

- Reference: [ADR-0108](../adr/0108-money-representation.md) and [Monetary Persistence Hardening Specification](./monetary-persistence-hardening.md).
- All monetary columns (`subtotal_amount`, `discount_total_amount`, `total_amount`, `unit_price_amount`, `amount`) are defined as **`DECIMAL(12, 2)`**.
  - **Storage**: PostgreSQL `NUMERIC` binary format (zero floating-point drift).
  - **Capacity**: Values up to $\pm\$9,999,999,999.99$ (10 billion minus 1 cent).
  - **Scale**: Exactly 2 fractional decimal places.
  - **Quantities**: `sale_items.quantity` is defined as `DECIMAL(10, 3)` to support up to 3 fractional decimal places (e.g. 1.250 hours or 0.750 kg).

### 3.6 Structural Financial & Monetary Check Constraints

Implemented via PostgreSQL native `CHECK` constraints in migrations `20261001000000` and `20261001010000`:

- **Sales Table**:
  - `chk_sales_non_negative_subtotal`: `subtotal_amount >= 0.00`
  - `chk_sales_non_negative_discount_total`: `discount_total_amount >= 0.00`
  - `chk_sales_non_negative_total`: `total_amount >= 0.00`
  - `chk_sales_non_negative_order_discount_val`: `order_discount_value IS NULL OR order_discount_value >= 0.00`
  - `chk_sales_discount_type_supported`: `order_discount_type IS NULL OR order_discount_type IN ('PERCENTAGE', 'FIXED', 'FIXED_AMOUNT')`
  - `chk_sales_discount_percentage_max`: `order_discount_type IS NULL OR order_discount_type != 'PERCENTAGE' OR order_discount_value <= 100.00`
  - `chk_sales_discount_co_presence`: Type and value must be either both `NULL` or both `NOT NULL`.
- **Sale Items Table**:
  - `chk_sale_items_non_negative_unit_price`: `unit_price_amount >= 0.00`
  - `chk_sale_items_non_negative_subtotal`: `subtotal_amount >= 0.00`
  - `chk_sale_items_non_negative_discount_total`: `discount_total_amount >= 0.00`
  - `chk_sale_items_non_negative_total`: `total_amount >= 0.00`
  - `chk_sale_items_non_negative_discount_val`: `discount_value IS NULL OR discount_value >= 0.00`
  - `chk_sale_items_positive_quantity`: `quantity > 0.000`
  - `chk_sale_items_discount_type_supported`: Type must be `PERCENTAGE` or `FIXED`/`FIXED_AMOUNT`.
  - `chk_sale_items_discount_percentage_max`: Percentage discounts must be $\le 100.00$.
  - `chk_sale_items_discount_co_presence`: Type and value must be co-present.
- **Payments Table**:
  - `chk_payments_positive_amount`: `amount > 0.00` (zero-dollar tender rows are strictly forbidden).
- **Receipts Table**:
  - `chk_receipts_non_negative_subtotal`: `subtotal_amount >= 0.00`
  - `chk_receipts_non_negative_discount_total`: `discount_total_amount >= 0.00`
  - `chk_receipts_non_negative_total`: `total_amount >= 0.00`

---

## 4. Index Architecture & Query Performance

The index topology is engineered based on verified production query patterns ([ADR-0123](../adr/0123-phase-7-financial-database-index-strategy.md), [ADR-0131](../adr/0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INDEX STRATEGY MATRIX                           │
│                                                                        │
│  TABLE       INDEX SIGNATURE                         SUPPORTED QUERY   │
│  ────────────────────────────────────────────────────────────────────  │
│  sales       (createdAt DESC)                        Recent Sales      │
│  sales       (clientId, createdAt DESC)              Client History    │
│  sales       (status, createdAt DESC)                Cashier Queue     │
│  sales       (tenantId, sourceType, sourceId)        Origin Filtering  │
│  sales       (sourceType, sourceId)                  Cross-Tenant Sync │
│  sale_items  (saleId)                                Aggregate Load    │
│  sale_items  (sourceType, sourceId)                  Origin Audits     │
│  payments    (saleId, createdAt ASC)                 Payment History   │
│  payments    (tenantId, status)                      Status Lookups    │
│  payments    (status, createdAt DESC)                Exception Queues  │
│  receipts    (tenantId, saleId) [UNIQUE]             1:1 Lookup & Enforce│
│  receipts    (tenantId, receiptNumber) [UNIQUE]      Voucher Sequence  │
│  receipts    (saleId)                                Receipt Retrieval │
│  receipts    (issuedAt DESC)                         Chronological Log │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Index Justifications

1. **`sales(created_at DESC)`**:
   Serves global chronological sales feeds with backward index traversal, achieving 0 ms CPU sort latency.
2. **`sales(client_id, created_at DESC)`**:
   Subsumes single-column `clientId` filtering while pre-sorting customer billing history in reverse chronological order.
3. **`sales(status, created_at DESC)`**:
   Optimizes active cashier queues (`DRAFT`, `PENDING_PAYMENT`). Because pending sales represent <15% of records, the index seeks directly to active orders without sorting.
4. **`sales(tenant_id, source_type, source_id)` & `sales(source_type, source_id)`**:
   Compound origin indexes that provide fast correlation lookups for operational single-billing checks without single-column index bloat.
5. **`payments(sale_id, created_at)`**:
   Enforces foreign key validation (`RESTRICT`) and accelerates `findBySaleId(saleId)` ordered chronologically. Subsumes standalone `saleId`.
6. **`payments(status, created_at DESC)`**:
   Accelerates exception monitoring for failed or cancelled tenders (`status = 'FAILED'`).
7. **`receipts(sale_id)`**:
   Accelerates `findBySaleId(saleId)` lookups when `tenant_id` is omitted and satisfies relational foreign key cascades.

### 4.2 Prohibited & Removed Indexes

- **`Payment @@index([method])` (REJECTED)**:
  Payment method has binary cardinality (`CASH` vs `QR`). An index scan on 50% selectivity is mathematically slower than a sequential table scan due to random page I/O costs.
- **`Receipt @@index([status])` (REMOVED)**:
  `ReceiptStatus` has only two enum values (`ISSUED`, `REPRINTED`). With >99% in `ISSUED` status and zero queries filtering on status alone, this index represented dead write amplification and was eliminated in Milestone 7.10 ([ADR-0131](../adr/0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)).

---

## 5. Transaction Architecture & Atomic Persistence Boundaries

Multi-record transactional consistency is enforced at the persistence infrastructure and application orchestration layers ([ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)).

### 5.1 Aggregate Boundary Transaction (`Sale + SaleItems`)

- **Location**: [`PrismaSaleRepository.save()`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-sale.repository.ts)
- **Mechanism**: Local database transaction (`this.prisma.$transaction(async (tx) => { ... })`).
- **Guarantee**:
  The parent `sales` row and all subordinate `sale_items` rows are written, differentials synced (deleting removed items), and OCC versions incremented within a single atomic transaction. An orphan item, empty basket, or desynchronized header total can **never** be committed.

### 5.2 Embedded Value Object Transaction (`Sale + Discounts`)

- **Location**: Inherits `Sale.save()` transaction.
- **Guarantee**:
  Because order-level and line-level discounts reside as columns in the `sales` and `sale_items` tables, discount parameters and calculated totals commit in the exact same SQL `UPSERT` statement.

### 5.3 Multi-Aggregate Coordination (`Sale + Payment`)

- **Boundary**: `Sale` and `Payment` are **autonomous Aggregate Roots**.
- **Location**: Application Layer (`RecordPaymentHandler`, `CompletePaymentHandler`, `SalePaymentCoordinationService`).
- **Mechanism**:
  1. **Infrastructure Unit of Work**: Uses `IUnitOfWork` (`PrismaUnitOfWork`) via Node.js `AsyncLocalStorage`. Both `paymentRepository.save(payment)` and `saleRepository.save(sale)` join the ambient database transaction without leaking ORM handles into the domain.
  2. **Idempotent Reconciliation**: In case of process interruption outside a Unit of Work, `SalePaymentCoordinationService.coordinateSalePaymentSettlement()` idempotently verifies settlement and updates `Sale.status` to `PAID`.

### 5.4 Voucher Creation (`Sale + Receipt`)

- **Boundary**: Autonomous Aggregate Roots; `Sale` is read-only during receipt issuance.
- **Mechanism**:
  1. Sequence generation executes an atomic PostgreSQL row-level upsert on `receipt_sequences` (`INSERT ... ON CONFLICT (tenant_id, year) DO UPDATE SET current_value = current_value + 1 RETURNING current_value`).
  2. `PrismaReceiptRepository.save()` persists the receipt inside a transaction, guarded by `unique_tenant_sale_receipt`. Concurrent racers fail deterministically and recover idempotently via `IssueReceiptHandler`.

### 5.5 Document Model Atomicity (`Receipt + ReceiptItems`)

- **Mechanism**: Single-row atomic write.
- **Guarantee**:
  Line items and payments are frozen inside `itemsSnapshot: Json` and `paymentsSnapshot: Json` within the `receipts` row. Partial writes or orphan receipt items are physically impossible.

---

## 6. Financial Representation & Deterministic Money Math

Financial modeling is governed by [ADR-0108](../adr/0108-money-representation.md) and [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md).

1. **Domain Layer**:
   - The pure [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts) Value Object operates strictly in **minor integer cents** (`_cents: number`).
   - Rounding utilizes commercial **Half-Up** rounding at the 1-cent boundary (`Math.round(amount * 100)`).
   - Binary floating-point arithmetic is strictly prohibited in monetary logic.
2. **Persistence Boundary**:
   - PostgreSQL stores values as `DECIMAL(12, 2)`.
   - The mapper layer converts between minor integer cents and `Prisma.Decimal` using deterministic string formatting:
     $$\text{cents} \longleftrightarrow \text{"whole.frac"} \longleftrightarrow \text{Prisma.Decimal}$$
   - Usage of `Number()`, `parseFloat()`, or `.toNumber()` is strictly banned at the mapper boundary to eliminate precision drift.

---

## 7. Domain Purity vs. Persistence Infrastructure

The architecture strictly maintains Clean Architecture and DDD domain purity ([ADR-0126](../adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md), [ADR-0130](../adr/0130-phase-7-persistence-boundary-audit-and-domain-purity.md)):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN PURITY GUARANTEES                        │
│                                                                        │
│   DOMAIN CORE (packages/core/src/sales/domain)                         │
│   ├── Pure TypeScript classes: Sale, SaleItem, Payment, Receipt        │
│   ├── Zero imports of @prisma/client, PrismaService, or TypeORM        │
│   ├── Zero database decorators (@Column, @Entity)                      │
│   └── Invariants & State Transitions enforced exclusively in memory   │
│                               ▲                                        │
│                               │ Implements Port Interfaces             │
│   INFRASTRUCTURE ADAPTER (packages/core/src/sales/infrastructure)      │
│   ├── PrismaSaleRepository implements SaleRepositoryPort               │
│   ├── PrismaPaymentRepository implements PaymentRepositoryPort         │
│   ├── PrismaReceiptRepository implements ReceiptRepositoryPort         │
│   ├── Bidirectional Mappers: Domain <-> Prisma Data Models             │
│   └── Database Transactions ($transaction) contained in adapters       │
└────────────────────────────────────────────────────────────────────────┘
```

Prisma models and relational database constraints **reflect** the `Sale` Aggregate Root but **do not replace** domain invariant enforcement. All business rules (e.g. valid status transitions, discount limits, terminal state immutability) are executed by domain methods (`sale.addItem()`, `sale.applyDiscount()`, `sale.transitionToPendingPayment()`). Persistence adapters merely map the verified domain state to relational tables.

---

## 8. Bounded Context Isolation & Source Non-Ownership

In accordance with [ADR-0110](../adr/0110-sale-ownership.md) and [ADR-0121](../adr/0121-sale-source-references-and-commercial-origin-model.md):

> **"References Over Ownership."**  
> The Sales bounded context records commercial checkout agreements and tenders. It never owns the entities being sold or the upstream domain states.

1. **Decoupled Pointers**:
   `Sale` holds scalar correlation fields (`sourceType`, `sourceId`, `sourceCode`).
2. **Zero Domain Couplings**:
   The Sales bounded context imports zero classes, interfaces, or tables from `Gym`, `Kinesiology`, `Resources`, or `Scheduling`.
3. **No Cross-Context Relational Constraints**:
   No foreign keys exist from `sales` or `sale_items` to external domain tables.
4. **Asynchronous Fulfillment**:
   Upon checkout completion, Sales publishes integration events (`SalePaidEvent`). Upstream domains subscribe to these events to fulfill operational duties (decrement inventory stock, activate gym membership, complete therapy booking).

---

## 9. Historical Integrity & Receipt Document Model

Receipt persistence adheres strictly to Milestone 7.7 architecture ([ADR-0117](../adr/0117-receipt-domain-boundary-and-document-model.md), [ADR-0118](../adr/0118-sale-reference-and-receipt-identification-strategy.md)):

1. **Frozen Point-in-Time Snapshots**:
   Receipt vouchers capture immutable JSON snapshots at the moment of issuance:
   - `clientSnapshot`: Name, tax identifier, email, address at purchase.
   - `itemsSnapshot`: Array of item descriptions, unit prices, applied discounts, and line totals.
   - `paymentsSnapshot`: Settled tenders and gateway authorization references.
2. **Immunity to Operational Mutations**:
   If a client updates their name, an inventory item changes price, or an operational session is archived months later, the issued legal receipt remains 100% historically intact.
3. **Zero-Join Read Latency**:
   Because all presentation data is pre-materialized in the `receipts` row, rendering a receipt voucher executes an $O(1)$ single-row read with **zero joins** to `sales`, `sale_items`, `payments`, or `clients`.

---

## 10. Payment Lifecycle & Tender Decoupling

Payment persistence follows [ADR-0115](../adr/0115-payment-domain-canonical-architecture.md) and [ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md):

1. **Autonomous Aggregate Root**:
   `Payment` is not an entity subordinate to `Sale`; it is an independent aggregate root with its own lifecycle state machine.
2. **Multi-Tender Support**:
   A single commercial `Sale` can be settled by multiple distinct `Payment` records (e.g. split tender: partial Cash + partial QR).
3. **State Machine Determinism**:
   - `PENDING` $\longrightarrow$ `SETTLED` (Settlement succeeds).
   - `PENDING` $\longrightarrow$ `FAILED` (Tender rejected).
   - `PENDING` $\longrightarrow$ `CANCELLED` (Cashier cancels tender).
   - Terminal states (`SETTLED`, `FAILED`, `CANCELLED`) are completely immutable.

---

## 11. End-to-End Traceability Matrix

The following matrix establishes strict end-to-end traceability across all 7 architectural dimensions:

$$\text{Business Rule} \longrightarrow \text{ADR} \longrightarrow \text{Domain Model} \longrightarrow \text{Repository Port} \longrightarrow \text{Prisma Model} \longrightarrow \text{DB Constraint} \longrightarrow \text{Integration Test}$$

|   #   | Business Rule                                                                                            | ADR                                                                                                                                                                      | Domain Model                                        | Repository Port                                  | Prisma Model                                                  | Database Constraint / Index                                                                   | Integration Test                                                                                                                                                                                                                                                                                                                         |
| :---: | :------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Deterministic Money Math** (`MNY-001`–`MNY-005`): Half-up cent rounding, zero floating point.          | [ADR-0108](../adr/0108-money-representation.md)<br>[ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)                                                  | `Money` VO<br>`SaleTotals` VO                       | `SaleRepositoryPort`<br>`PaymentRepositoryPort`  | `Sale.subtotalAmount`<br>`Payment.amount`<br>`DECIMAL(12, 2)` | `chk_sales_non_negative_subtotal`<br>`chk_payments_positive_amount`                           | [`monetary-persistence-integrity.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/monetary-persistence-integrity.spec.ts)                                                                                                                                              |
| **2** | **Item & Order Discounts** (`DISC-001`–`DISC-006`): Non-negative, percentage $\le 100\%$, co-presence.   | [ADR-0113](../adr/0113-item-level-discounts.md)<br>[ADR-0122](../adr/0122-phase-7-financial-persistence-architecture.md)                                                 | `Discount` VO<br>`DiscountType`                     | `SaleRepositoryPort.save()`                      | `orderDiscountType`<br>`discountValue`<br>(embedded columns)  | `chk_sales_discount_percentage_max`<br>`chk_sale_items_discount_co_presence`                  | [`discount-structural-constraints.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/discount-structural-constraints.spec.ts)                                                                                                                                            |
| **3** | **Terminal Immutability** (`SALE-008`–`SALE-009`): Cancelled or refunded sales cannot be mutated.        | [ADR-0110](../adr/0110-sale-ownership.md)<br>[ADR-0119](../adr/0119-sale-aggregate-boundary-and-invariants.md)                                                           | `Sale.cancel()`<br>`TerminalSaleImmutableException` | `SaleRepositoryPort.save()`                      | `Sale.status`<br>`Sale.cancelledAt`                           | Repository pre-check in atomic transaction                                                    | [`sale-cancelled-immutability.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/__tests__/sale-cancelled-immutability.spec.ts)                                                                                                                                                                               |
| **4** | **Clinical Single-Billing** (`SALE-010`): Therapy session billed at most once across active sales.       | [ADR-0120](../adr/0120-commercial-transaction-uniqueness-and-sale-idempotency.md)<br>[ADR-0124](../adr/0124-phase-7-financial-models-uniqueness-audit.md)                | `SaleSource` VO<br>`DuplicateSaleException`         | `SaleRepositoryPort.findBySource()`              | `Sale.sourceType`<br>`Sale.sourceId`                          | `sales_tenant_id_source_type_source_id_idx`<br>`sales_source_type_source_id_idx`              | [`sale-repository-single-billing.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/sale-repository-single-billing.spec.ts)                                                                                                                                              |
| **5** | **Autonomous Payments** (`PAY-001`–`PAY-008`): Independent lifecycle, multi-tender split settlement.     | [ADR-0115](../adr/0115-payment-domain-canonical-architecture.md)<br>[ADR-0116](../adr/0116-payment-state-machine-and-lifecycle-specification.md)                         | `Payment` Aggregate<br>`PaymentMethod`              | `PaymentRepositoryPort`                          | `Payment` model<br>`payments` table                           | `payments.sale_id -> sales.id ON DELETE RESTRICT`<br>`payments_sale_id_created_at_idx`        | [`payment-repository.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/payment-repository.spec.ts)                                                                                                                                                                      |
| **6** | **Receipt Exactly-One & Snapshots** (`REC-001`–`REC-010`): Exactly 1 receipt per sale, frozen document.  | [ADR-0117](../adr/0117-receipt-domain-boundary-and-document-model.md)<br>[ADR-0118](../adr/0118-sale-reference-and-receipt-identification-strategy.md)                   | `Receipt` Aggregate<br>`ReceiptNumber` VO           | `ReceiptRepositoryPort`<br>`ReceiptSequencePort` | `Receipt`<br>`ReceiptSequence`<br>`itemsSnapshot: Json`       | `unique_tenant_sale_receipt`<br>`unique_tenant_receipt_number`<br>`receipts.sale_id RESTRICT` | [`receipt-concurrency.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/receipt-concurrency.spec.ts)<br>[`receipt-sequence.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/receipt-sequence.spec.ts) |
| **7** | **Atomic Transactions & Rollbacks** (`TX-001`–`TX-005`): No orphan items, coordinated payment rollbacks. | [ADR-0125](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)<br>[ADR-0126](../adr/0126-phase-7-hexagonal-architecture-repository-reconciliation.md) | Pure Domain Aggregates (Zero Prisma handles)        | `IUnitOfWork`<br>`PrismaUnitOfWork`              | `$transaction`<br>AsyncLocalStorage propagation               | Foreign key cascades<br>PostgreSQL atomic rollback                                            | [`transaction-architecture-rollback.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/__tests__/transaction-architecture-rollback.spec.ts)                                                                                                                                        |

---

## 12. Conclusion & Operational Certification

Milestone 7.10 establishes an enterprise-grade financial persistence infrastructure that:

- Preserves Domain-Driven Design and Clean Architecture boundaries with zero ORM leakage.
- Guarantees absolute mathematical determinism with `DECIMAL(12, 2)` and minor integer cents.
- Enforces strict relational integrity and non-negativity via native PostgreSQL `CHECK` and `FOREIGN KEY` constraints.
- Delivers optimal query throughput through focused composite B-tree indexes while eliminating unselective and dead indexes.
- Provides complete automated test verification across unit, mapping roundtrip, and transaction rollback suites.
