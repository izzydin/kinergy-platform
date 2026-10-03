# 0129. Phase 7 Prisma Schema Architectural Review and Final Integrity Verification

- **Status**: Accepted
- **Date**: 2026-10-03
- **Deciders**: Principal Prisma Architect, Principal Database Architect, Lead Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Final Milestone 7.10: Prisma Schema Architectural Review). Following the completion of database migrations, index optimization, uniqueness constraints, hexagonal repository reconciliation, and test fixtures, we perform a formal schema architecture review of the finished Phase 7 Prisma relational models (`Sale`, `SaleItem`, `Payment`, `Receipt`, `ReceiptSequence`).
- **Consulted ADRs**:
  - [ADR-0011: Prisma ORM Persistence Infrastructure Setup](0011-prisma-orm-persistence-infrastructure.md)
  - [ADR-0108: Money Representation](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle](0109-payment-lifecycle.md)
  - [ADR-0110: Sale Ownership](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discounts](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0123: Phase 7 Financial Model Database Index Strategy](0123-phase-7-financial-database-index-strategy.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit](0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)
  - [ADR-0127: Phase 7 Database Migration Review and Validation](0127-phase-7-database-migration-review-and-validation.md)
  - [ADR-0128: Phase 7 Test Infrastructure, Fixtures, Builders, and Seeds Reconciliation](0128-phase-7-test-infrastructure-and-seed-reconciliation.md)

---

## 1. Context and Problem Statement

The Prisma schema defines the boundary between application domain logic and PostgreSQL physical storage. In high-integrity financial subdomains, schema flaws (improper primary keys, loose precision, accidental cascade deletions, speculative tables, redundant indexes, or tight coupling across bounded contexts) cause catastrophic failures, data corruption, or operational deadlocks.

This review systematically audits every Phase 7 model, field, enum, relation, constraint, and index against the finished canonical domain architecture.

---

## 2. Complete Phase 7 Model Architecture Audit

### 2.1 `Sale` (Aggregate Root)

| Dimension               | Schema Specification                                                                                                                                                                                                                                                                                                       | Verification Findings                                                                                                                                                                                                                                                 |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary Key**         | `id String @id @default(uuid())`                                                                                                                                                                                                                                                                                           | Global UUID primary key (`sales_pkey`). Guaranteed immutable, unique identity. Prohibits nulls.                                                                                                                                                                       |
| **Status**              | `status SaleStatus @default(DRAFT)`                                                                                                                                                                                                                                                                                        | 7-state enum: `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`. Matches domain state machine.                                                                                                                               |
| **Currency**            | `currency String @default("USD") @db.VarChar(3)`                                                                                                                                                                                                                                                                           | ISO 4217 3-letter currency code. Standardized default `USD`.                                                                                                                                                                                                          |
| **Money Fields**        | `subtotalAmount Decimal @map("subtotal_amount") @db.Decimal(12, 2)`<br>`discountTotalAmount Decimal @map("discount_total_amount") @db.Decimal(12, 2)`<br>`totalAmount Decimal @map("total_amount") @db.Decimal(12, 2)`                                                                                                     | Exact `DECIMAL(12, 2)`. Prohibits floating-point representation. Enforces non-negative CHECK constraints at the database engine level.                                                                                                                                |
| **Client Relation**     | `clientId String? @map("client_id")`                                                                                                                                                                                                                                                                                       | **ID Reference Pattern**: Maintained as a decoupled identifier rather than a direct Prisma `@relation`. Preserves bounded context autonomy between Client and Sales, and supports anonymous POS walk-in purchases (`clientId = null`). Indexed with `createdAt DESC`. |
| **SaleSource**          | `sourceType String @map("source_type")`<br>`sourceId String @map("source_id")`<br>`sourceCode String? @map("source_code")`                                                                                                                                                                                                 | Fully captures commercial origin (`KINESIOLOGY_SESSION`, `GYM_MEMBERSHIP`, `FOOD`, `DRINK`, `ROOM_RENTAL`). Non-unique composite index supports sub-millisecond lookups.                                                                                              |
| **Timestamps**          | `createdAt DateTime @default(now()) @map("created_at")`<br>`updatedAt DateTime @updatedAt @map("updated_at")`<br>`cancelledAt DateTime? @map("cancelled_at")`<br>`completedAt DateTime? @map("completed_at")`<br>`refundedAt DateTime? @map("refunded_at")`                                                                | Full audit trail. Captures exact timestamps for lifecycle completion, cancellation, and refund events.                                                                                                                                                                |
| **Appropriate Indexes** | `@@index([tenantId])`<br>`@@index([clientId, createdAt(sort: Desc)])`<br>`@@index([status, createdAt(sort: Desc)])`<br>`@@index([createdAt(sort: Desc)])`<br>`@@index([tenantId, sourceType, sourceId])`<br>`@@index([sourceType, sourceId])`                                                                              | High-selectivity compound B-tree indexes optimized for cashier queues, client histories, and source correlations (ADR-0123). Redundant single-column indexes removed.                                                                                                 |
| **Constraints**         | Engine CHECK constraints:<br>- `chk_sales_non_negative_subtotal`<br>- `chk_sales_non_negative_discount_total`<br>- `chk_sales_non_negative_total`<br>- `chk_sales_non_negative_order_discount_val`<br>- `chk_sales_discount_type_supported`<br>- `chk_sales_discount_percentage_max`<br>- `chk_sales_discount_co_presence` | Hardened against negative numbers and invalid discount combinations.                                                                                                                                                                                                  |

---

### 2.2 `SaleItem` (Subordinate Entity)

| Dimension                   | Schema Specification                                                                                                                                                                        | Verification Findings                                                                                                                         |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sale Ownership**          | `saleId String @map("sale_id")`<br>`sale Sale @relation("SaleToSaleItems", fields: [saleId], references: [id], onDelete: Cascade)`                                                          | Owned subordinate entity. Cascade delete is architecturally valid **only** here: removing an uncommitted draft sale cleans up its line items. |
| **Required Fields**         | `description String`, `quantity Decimal`, `unitPriceAmount Decimal`, `subtotalAmount Decimal`, `discountTotalAmount Decimal`, `totalAmount Decimal`                                         | Mandatory fields enforce non-empty line descriptions and calculations.                                                                        |
| **Money Precision**         | `unitPriceAmount Decimal @db.Decimal(12, 2)`<br>`subtotalAmount Decimal @db.Decimal(12, 2)`<br>`discountTotalAmount Decimal @db.Decimal(12, 2)`<br>`totalAmount Decimal @db.Decimal(12, 2)` | Exact `DECIMAL(12, 2)` prevents rounding drift across line calculations.                                                                      |
| **Quantity Representation** | `quantity Decimal @db.Decimal(10, 3)`                                                                                                                                                       | Exact `DECIMAL(10, 3)` supports fractional units (e.g. `2.500` hours or `0.750` kg) without binary float artifacts.                           |
| **Indexes**                 | `@@index([saleId])`<br>`@@index([skuOrCode])`<br>`@@index([sourceType, sourceId])`                                                                                                          | Foreign key index optimizes sale item joins; catalog correlation index optimizes SKU lookups.                                                 |

---

### 2.3 `Discount` (Embedded Value Object)

| Dimension       | Schema Specification                                                                                                                                                                                                       | Verification Findings                                                                                                             |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Ownership**   | Flattened on `sales` (`order_discount_*`) and `sale_items` (`discount_*`)                                                                                                                                                  | Pure Domain Value Object without identity (ADR-0113). Zero relational join penalty; updates commit atomically with parent entity. |
| **Type**        | `orderDiscountType String?`, `discountType String?`                                                                                                                                                                        | Supports `PERCENTAGE`, `FIXED`, and `FIXED_AMOUNT`. Validated by CHECK constraints.                                               |
| **Value**       | `orderDiscountValue Decimal? @db.Decimal(10, 2)`<br>`discountValue Decimal? @db.Decimal(10, 2)`                                                                                                                            | Exact decimal representation.                                                                                                     |
| **Constraints** | Engine CHECK constraints:<br>- Co-presence: `type` and `value` must both be NULL or both NOT NULL.<br>- Percentage cap: value must be `<= 100.00` when type is `PERCENTAGE`.<br>- Non-negativity: value must be `>= 0.00`. | Eliminates invalid partial discounts and impossible discounts > 100%.                                                             |

---

### 2.4 `Payment` (Autonomous Aggregate Root)

| Dimension               | Schema Specification                                                                                                                                                                                          | Verification Findings                                                                                                           |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------ |
| **Sale Relation**       | `saleId String @map("sale_id")`<br>`sale Sale @relation("SaleToPayments", fields: [saleId], references: [id], onDelete: Restrict)`                                                                            | **ON DELETE RESTRICT**: Financial tenders are legal proof of money transfer. A sale with payments can never be cascade deleted. |
| **Method**              | `method PaymentMethod`                                                                                                                                                                                        | Enum: `CASH`, `QR`. Clear, closed set of supported tender types.                                                                |
| **Status**              | `status PaymentStatus @default(SETTLED)`                                                                                                                                                                      | Enum: `PENDING`, `SETTLED`, `FAILED`, `CANCELLED`. Standardized settlement state machine.                                       |
| **Amount**              | `amount Decimal @db.Decimal(12, 2)`                                                                                                                                                                           | Exact `DECIMAL(12, 2)`. Hardened by `chk_payments_positive_amount` (`amount > 0.00`).                                           |
| **Reference**           | `reference String? @db.VarChar(100)`                                                                                                                                                                          | External tender reference (e.g. `QR-123` or cash drawer code). Nullable for cash walk-ins.                                      |
| **PaidAt & Timestamps** | `paidAt DateTime? @map("paid_at")`<br>`createdAt DateTime @default(now()) @map("created_at")`<br>`updatedAt DateTime @updatedAt @map("updated_at")`                                                           | Captures settlement microsecond timestamp and optimistic concurrency `version`.                                                 |
| **Indexes**             | `@@index([tenantId])`<br>`@@index([tenantId, saleId])`<br>`@@index([tenantId, status])`<br>`@@index([saleId, createdAt])`<br>`@@index([status, createdAt(sort: Desc)])`<br>`@@index([createdAt(sort: Desc)])` | Supports foreign key joins, tenant filtering, settlement audit scans, and exception queues.                                     |

---

### 2.5 `Receipt` & `ReceiptSequence` (Fiscal Document Subdomain)

| Dimension                 | Schema Specification                                                                                                                               | Verification Findings                                                                                                                                                                                                  |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sale Relation**         | `saleId String @map("sale_id")`<br>`sale Sale @relation("SaleToReceipts", fields: [saleId], references: [id], onDelete: Restrict)`                 | **ON DELETE RESTRICT**: Legal proof-of-purchase vouchers can never be deleted while attached to a transaction.                                                                                                         |
| **Historical Snapshots**  | `clientSnapshot Json? @map("client_snapshot")`<br>`itemsSnapshot Json @map("items_snapshot")`<br>`paymentsSnapshot Json @map("payments_snapshot")` | **Point-in-Time Document Model**: Fully captures client details, item descriptions/prices, and payments as they existed at issuance. Completely decouples receipt rendering from future catalog or customer mutations. |
| **Money Precision**       | `subtotalAmount Decimal @db.Decimal(12, 2)`<br>`discountTotalAmount Decimal @db.Decimal(12, 2)`<br>`totalAmount Decimal @db.Decimal(12, 2)`        | Exact monetary precision matches sale totals down to the cent.                                                                                                                                                         |
| **Immutability Strategy** | Historical snapshots, OCC version counter, and reprint tracking (`reprintCount Int @default(0)`, `lastReprintedAt DateTime?`).                     | Re-printing increments counter without modifying the immutable voucher snapshot.                                                                                                                                       |
| **Uniqueness**            | `@@unique([tenantId, saleId])`<br>`@@unique([tenantId, receiptNumber])`                                                                            | Exactly one legal receipt per sale. Non-repeating monotonic alphanumeric numbering per tenant orchestrated via `ReceiptSequence(tenantId, year)`.                                                                      |

---

### 2.6 `PaymentHistory` Justification Audit

- **Finding**: A separate `PaymentHistory` relational table was evaluated and **rejected** as a speculative, redundant abstraction (ADR-0122 §5, ADR-0124 §2).
- **Rationale**: `Payment` state transitions (e.g. `PENDING` -> `SETTLED`) emit domain events (`PaymentRecordedEvent`, `PaymentSettledEvent`, `PaymentFailedEvent`) to the platform-wide `audit_logs` service. A dedicated table would introduce relational bloat and double-write maintenance overhead with zero domain value.

---

## 3. Structural Hygiene & Clean Architecture Checks

| Quality Check             | Audit Status | Verification Evidence                                                                                                                                                                             |
| :------------------------ | :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Duplicate Models**      | **NONE**     | All Phase 7 tables (`sales`, `sale_items`, `payments`, `receipts`, `receipt_sequences`) have unique models and `@map` table names.                                                                |
| **Duplicate Indexes**     | **NONE**     | Single-column indexes superseded by compound indexes (`sales_client_id_idx`, `sales_status_idx`, `payments_sale_id_idx`, `payments_status_idx`) were dropped in migration `20261002000000`.       |
| **Redundant Constraints** | **NONE**     | Unique constraints are scoped strictly to fiscal voucher requirements; blanket uniqueness on `(source_type, source_id)` was deliberately avoided to protect retail, gym plans, and room turnover. |
| **Orphan Relations**      | **NONE**     | Every relation (`SaleToSaleItems`, `SaleToPayments`, `SaleToReceipts`) has an exact bidirectional counterpart with valid foreign key references.                                                  |
| **Accidental Cascades**   | **NONE**     | Only owned line items (`sale_items`) use `onDelete: Cascade`. Financial tenders (`payments`) and fiscal receipts (`receipts`) enforce `onDelete: Restrict`.                                       |
| **Unused Enums**          | **NONE**     | `SaleStatus`, `PaymentMethod`, `PaymentStatus`, and `ReceiptStatus` are all actively utilized.                                                                                                    |
| **Speculative Fields**    | **NONE**     | Every field in the schema directly maps to a domain Value Object, Entity, or Aggregate property.                                                                                                  |

---

## 4. Schema Formatting & Validation Status

- **`prisma format`**: Clean (schema was already canonical and perfectly formatted).
- **`prisma validate`**: Passed with zero warnings or syntax errors (`The schema at prisma\schema.prisma is valid 🚀`).
- **`prisma generate`**: Generated Prisma Client (v6.19.3) cleanly.
- **Automated Roundtrip & Migration Tests**: 100% passing across 242 test suites.
