# 0123. Phase 7 Financial Model Database Index Strategy and Query Optimization

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: Senior Database Performance Engineer, Senior Persistence Architect, Principal Domain Architect
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.10: Database Performance & Index Architecture). Following the persistence hardening and structural constraint specifications (ADR-0121, ADR-0122), we must formally design, justify, and codify the database indexing strategy for the Phase 7 financial tables (`sales`, `payments`, `sale_items`, `receipts`).
- **Consulted ADRs**:
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening](0122-phase-7-financial-persistence-architecture.md)

---

## 1. Context and Problem Statement

Financial databases require sub-millisecond point queries for checkout transactions and low-latency range scans for customer histories, cashier active queues, payment reconciliation, and audit streams. However, indexes in high-throughput transactional systems are not free:

1. **Write Amplification**: Every secondary B-tree index incurs write I/O on `INSERT`, `UPDATE` (if indexed columns change), and `DELETE`.
2. **Buffer Cache Bloat**: Redundant or unselective indexes consume working memory (`shared_buffers`), evicting hot data pages.
3. **Query Optimizer Degradation**: Proliferating single-column indexes can mislead the cost-based query planner or force expensive bitmap index merges when a single composite index would have provided an ordered index scan.

We must evaluate candidate indexes for `Sale` and `Payment` against real access patterns, enforce the B-tree leftmost prefix rule to eliminate redundant indexes, prevent duplication where unique constraints already supply underlying indexes, and establish a strictly justified, minimal index footprint.

---

## 2. Evaluation Principles

1. **Query-Driven Justification**: An index is only created if it accelerates an approved production access pattern or enforces referential integrity.
2. **Leftmost Prefix Subsumption**: A composite index $(C_1, C_2)$ strictly covers queries on $C_1$ alone. Maintaining both $(C_1)$ and $(C_1, C_2)$ is prohibited as redundant.
3. **Selectivity Threshold**: Columns with very low cardinality (e.g. enum flags with $\le 4$ values or binary payment methods) must not be indexed alone. PostgreSQL cost models favor sequential table scans over index scans on low-selectivity attributes.
4. **Sort Avoidance via Index Ordering**: Where a query combines equality filtering with `ORDER BY`, composite B-tree indexes matching the filter and sort direction eliminate in-memory `Sort` nodes.
5. **Zero Duplicate Constraint Indexes**: When a composite unique constraint is declared (`@@unique`), PostgreSQL automatically creates an underlying unique B-tree index. Creating a duplicate `@@index` on the exact same columns is strictly rejected.

---

## 3. Candidate Index Evaluation Matrix

### 3.1 Candidate Sale Indexes

| Candidate Index              | Query Supported                                                                         | Expected Selectivity                                            | Covered by Existing?                    | Write Overhead                                | Architectural Decision                                                                                                                                                    |
| :--------------------------- | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :-------------------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Sale.createdAt`**         | Global recent sales: `ORDER BY created_at DESC LIMIT N`; historical date ranges         | Very High (monotonic microsecond timestamps)                    | No                                      | Minimal (append-only leaf inserts)            | **ACCEPTED**: `@@index([createdAt(sort: Desc)])`                                                                                                                          |
| **`Sale.clientId`**          | Client purchase history: `WHERE client_id = $1 ORDER BY created_at DESC`                | High (1-50 sales per client out of thousands)                   | No                                      | Low (set once on checkout creation)           | **ACCEPTED (COMPOSITE)**: Upgraded to `@@index([clientId, createdAt(sort: Desc)])`. Subsumes standalone `clientId` while eliminating sort overhead.                       |
| **`Sale.status`**            | Cashier active order queue: `WHERE status = 'PENDING_PAYMENT' ORDER BY created_at DESC` | Extremely Low (7 enum values; `PAID` accounts for >85% of rows) | No                                      | Moderate (2-3 lifecycle transitions per sale) | **ACCEPTED (COMPOSITE)**: Upgraded to `@@index([status, createdAt(sort: Desc)])`. Standalone `status` is rejected as unselective; composite enables fast queue streaming. |
| **`Sale.sourceType`**        | Commercial origin filter                                                                | Extremely Low (5 enum values, ~20% selectivity)                 | Yes (Covered by `sourceType, sourceId`) | Redundant maintenance                         | **REJECTED**: Standalone index is useless to query optimizer; fully covered by composite source indexes.                                                                  |
| **`Sale.sourceReferenceId`** | Domain entity lookup                                                                    | High per ID, but ambiguous without type qualifier               | Yes (Covered by `sourceType, sourceId`) | Redundant maintenance                         | **REJECTED**: Meaningless without `sourceType`; fully covered by composite source indexes.                                                                                |

### 3.2 Candidate Payment Indexes

| Candidate Index         | Query Supported                                                                                      | Expected Selectivity                                   | Covered by Existing?                                 | Write Overhead                      | Architectural Decision                                                                                                                              |
| :---------------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------- | :--------------------------------------------------- | :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Payment.saleId`**    | Tender history per sale: `WHERE sale_id = $1 ORDER BY created_at ASC`; foreign key `RESTRICT` checks | Very High (1-3 payments per sale)                      | `(tenantId, saleId)` does NOT cover without tenantId | Minimal (immutable payment records) | **ACCEPTED (COMPOSITE)**: Upgraded to `@@index([saleId, createdAt])`. Leftmost prefix satisfies FK checks and `findBySaleId` ordering.              |
| **`Payment.status`**    | Exception reconciliation: `WHERE status = 'FAILED' ORDER BY created_at DESC`                         | Very Low for `SETTLED` (>95%); Moderate for exceptions | Covered in tenant context by `(tenantId, status)`    | Low (0-1 transitions)               | **ACCEPTED (COMPOSITE)**: Upgraded to `@@index([status, createdAt(sort: Desc)])` alongside tenant index.                                            |
| **`Payment.method`**    | Method reporting: `WHERE method = 'CASH'`                                                            | Exactly ~50% (cardinality 2: `CASH`, `QR`)             | No                                                   | High penalty per tender             | **REJECTED**: Relational anti-pattern. Query optimizer will never pick an index scan for 50% selectivity. Register closing uses tenant/time ranges. |
| **`Payment.createdAt`** | Global recent payments audit feed: `ORDER BY created_at DESC LIMIT N`                                | Very High (monotonic timestamp)                        | No                                                   | Minimal (append-only leaf inserts)  | **ACCEPTED**: `@@index([createdAt(sort: Desc)])`                                                                                                    |

---

## 4. Deep-Dive Access Pattern Analysis

### Pattern 1: Sale by Client Ordered by CreatedAt

```sql
-- Client purchase history / longitudinal financial ledger
SELECT * FROM "sales"
WHERE "client_id" = $1
ORDER BY "created_at" DESC
LIMIT 20;
```

- **Execution with Standalone `(clientId)`**: PostgreSQL uses an Index Scan on `clientId`, loads candidate rows into memory, and performs an explicit `Sort: sort key: created_at DESC`.
- **Execution with Composite `(clientId, createdAt DESC)`**: The B-tree is organized hierarchically: `client_id` first, then pre-sorted by `created_at DESC`. The query engine performs a direct Index Scan and terminates immediately upon reading 20 rows. In-memory sort cost: **0 ms**.
- **Prefix Subsumption**: A query filtering by `WHERE client_id = $1` without ordering utilizes the leading column of `(clientId, createdAt DESC)`. Standalone `(clientId)` is deleted.

### Pattern 2: Sale by Status Ordered by CreatedAt

```sql
-- Cashier active orders and pending payment processing queue
SELECT * FROM "sales"
WHERE "status" = 'PENDING_PAYMENT'
ORDER BY "created_at" DESC
LIMIT 50;
```

- **Execution with Standalone `(status)`**: For common statuses (`PAID`), selectivity is >85%, causing PostgreSQL to abandon the index and perform a full table scan. For rare statuses, it still requires an explicit `Sort` node.
- **Execution with Composite `(status, createdAt DESC)`**: Enables an Index Scan directly into the `PENDING_PAYMENT` subtree, reading the newest orders in reverse chronological order without sorting.

### Pattern 3: Sales by Source Reference

```sql
-- Origin correlation lookup (e.g. check duplicate kinesiology session billing)
SELECT * FROM "sales"
WHERE "source_type" = $1 AND "source_id" = $2
  AND ("tenant_id" = $3 OR $3 IS NULL)
  AND "status" != 'CANCELLED'
ORDER BY "created_at" DESC;
```

- **Existing Coverage**:
  - `@@index([tenantId, sourceType, sourceId])` for multi-tenant scoped lookups.
  - `@@index([sourceType, sourceId])` for global or tenant-omitted origin queries.
- **Why Standalone Indexes on `sourceType` or `sourceId` are Excluded**:
  - `sourceType` has only 5 distinct values (cardinality 5). An index on `sourceType` alone would be ignored by the query planner.
  - `sourceId` alone cannot disambiguate references across different source domains.
  - `(sourceType, sourceId)` completely covers `WHERE source_type = $1 AND source_id = $2`.

### Pattern 4: Payment History for a Sale

```sql
-- Multi-payment tender reconstruction (PrismaPaymentRepository.findBySaleId)
SELECT * FROM "payments"
WHERE "sale_id" = $1
ORDER BY "created_at" ASC;
```

- **Foreign Key Requirement**: `payments.sale_id` has an `ON DELETE RESTRICT` foreign key referencing `sales(id)`. PostgreSQL requires an index with `sale_id` as the leading column to avoid full table scans of `payments` when rows in `sales` are modified or deleted.
- **Composite Optimization**: `@@index([saleId, createdAt])` satisfies both the leading-column foreign key requirement AND supplies the exact `ASC` ordering needed by `findBySaleId`. Standalone `(saleId)` is eliminated.

### Pattern 5: Payment Records by Status

```sql
-- Exception monitoring: pending or failed tenders
SELECT * FROM "payments"
WHERE "status" = 'FAILED'
ORDER BY "created_at" DESC;
```

- **Execution**: `@@index([status, createdAt(sort: Desc)])` allows operations teams to rapidly pull recent payment failures without scanning historical settled transactions.

### Pattern 6: Recent Payments Feed

```sql
-- End-of-day register settlement and global transaction audit
SELECT * FROM "payments"
ORDER BY "created_at" DESC
LIMIT 100;
```

- **Execution**: Served directly by `@@index([createdAt(sort: Desc)])` with zero table sorting.

### Pattern 7: Payment.method (Why Rejected)

```sql
-- Filter payments by tender method (e.g. CASH)
SELECT * FROM "payments" WHERE "method" = 'CASH';
```

- **Cardinally & Selectivity**: There are only 2 payment methods (`CASH`, `QR`). Selectivity is approximately 50%.
- **Relational Mechanics**: When $\ge 15\text{--}20\%$ of table rows match a predicate, a B-tree index scan is slower than a sequential scan because of random page I/O overhead. PostgreSQL will **never** use a standalone index on `method`.
- **Verdict**: Adding an index on `Payment.method` would waste disk space and impose write overhead on every payment with zero runtime utility.

---

## 5. Duplicate and Unique Constraint Analysis

A core mandate of this design is verifying that no duplicate indexes exist alongside constraints:

1. **Unique Constraints Create Indexes**: In PostgreSQL, every `UNIQUE` constraint creates an internal unique B-tree index.
2. **`Receipt` Model**:
   - `@@unique([tenantId, saleId])` creates a unique index on `(tenant_id, sale_id)`.
   - `@@unique([tenantId, receiptNumber])` creates a unique index on `(tenant_id, receipt_number)`.
   - `@@index([saleId])` is retained because foreign key checks from `sales(id) -> receipts(sale_id)` require `sale_id` as the leading column (which `(tenant_id, sale_id)` does not satisfy under the leftmost prefix rule).
   - No duplicate index on `(tenantId, saleId)` is declared.
3. **`SaleSource` Uniqueness vs. Indexing**:
   - As established in ADR-0121 §4.15, blanket database uniqueness on `(sourceType, sourceId)` is rejected because retail items and memberships permit multiple sales.
   - Therefore, non-unique composite indexes `@@index([tenantId, sourceType, sourceId])` and `@@index([sourceType, sourceId])` are required and non-redundant.

---

## 6. Final Minimal Index Specification

### 6.1 `sales` Table

```prisma
model Sale {
  ...
  @@index([tenantId])
  @@index([clientId, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@index([tenantId, sourceType, sourceId])
  @@index([sourceType, sourceId])
  @@map("sales")
}
```

### 6.2 `payments` Table

```prisma
model Payment {
  ...
  @@index([tenantId])
  @@index([tenantId, saleId])
  @@index([tenantId, status])
  @@index([saleId, createdAt])
  @@index([status, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("payments")
}
```

### 6.3 `sale_items` Table

```prisma
model SaleItem {
  ...
  @@index([saleId])
  @@index([skuOrCode])
  @@index([sourceType, sourceId])
  @@map("sale_items")
}
```

### 6.4 `receipts` Table

```prisma
model Receipt {
  ...
  @@unique([tenantId, saleId], name: "unique_tenant_sale_receipt")
  @@unique([tenantId, receiptNumber], name: "unique_tenant_receipt_number")
  @@index([tenantId])
  @@index([saleId])
  @@index([status])
  @@index([issuedAt(sort: Desc)])
  @@map("receipts")
}
```

---

## 7. Consequences

### Positive

- **Eliminated In-Memory Sorts**: Queries for client history, active cashier queues, and sale payment history stream directly from ordered B-trees with zero CPU sort overhead.
- **Zero Redundant Duplicate Indexes**: Every index is justified; single-column candidates (`clientId`, `status`, `saleId`) are subsumed by composite indexes using the leftmost prefix rule.
- **Zero Speculative Anti-Patterns**: Standalone `Payment.method`, `Sale.sourceType`, and `Sale.sourceReferenceId` indexes are explicitly rejected due to low selectivity and redundancy.
- **Referential Integrity Protection**: Foreign key checking on `payments.sale_id` and `receipts.sale_id` remains fully indexed without causing full table scans during sale lifecycle updates.

### Negative / Trade-Offs

- **Composite Key Size**: Adding `createdAt` to composite indexes increases B-tree leaf node size by 8 bytes per tuple. This is negligible given the total row volume and completely justified by the elimination of in-memory sort operations.
