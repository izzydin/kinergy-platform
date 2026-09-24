# 0118. Sale Reference and Receipt Identification Strategy

- **Status**: Accepted
- **Date**: 2026-09-24
- **Deciders**: Principal Backend Architect, Principal Domain Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.7: Receipt Domain). Commercial transactions originate across clinical treatment sessions, gym memberships, and consumable wellness inventory. Following Milestone 7.7.1–7.7.3, the platform requires an authoritative backend identification and numbering strategy for Sales and Receipts, establishing how commercial references are derived, how human-readable receipt voucher numbers are generated, how persistence counters are structured in PostgreSQL, and how concurrency collisions are prevented.
- **Consulted ADRs**:
  - [ADR-0002: Client Domain Foundation, Identity Decoupling & Optimistic Concurrency](0002-client-domain-foundation.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](0115-payment-domain-canonical-architecture.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)

---

## 1. Context and Problem Statement

A core challenge in enterprise financial systems is the management of business identifiers across orders, payments, and fiscal vouchers. In Kinergy, every commercial transaction begins in the `Sale` aggregate root, transitions through financial settlement via `Payment`, and concludes with the issuance of a customer-facing `Receipt`.

Before Milestone 7.7, the platform lacked an explicit, unified strategy for:

1. **Commercial Transaction References**: Whether `Sale` should generate an internal sequential order number or rely on existing identifiers.
2. **Receipt Identification**: How customer-facing receipt numbers are formatted, sequenced, and isolated across tenants.
3. **Conceptual Separation of Concerns**: Ensuring that document identity (`ReceiptId`), customer voucher reference (`ReceiptNumber`), and commercial transaction identity (`saleReference`) are not conflated.
4. **Concurrency and Collision Safety**: Ensuring that under high-volume parallel checkout operations, receipt numbers remain strictly monotonic, gap-free, and collision-free without unsafe in-memory counters or timestamps-as-identity.

---

## 2. Platform Inspection and Discovery Findings

A comprehensive architectural discovery across the Kinergy codebase yielded the following findings:

1. **Sale Identity & Numbering**:
   - `Sale` uses **UUID-only identity** (`id: SaleId` in the domain; `id TEXT PRIMARY KEY DEFAULT uuid()` in PostgreSQL/Prisma).
   - `Sale` holds an optional `sourceCode` (via `SourceReference.sourceCode`) representing an upstream business reference (e.g. appointment code, cart order reference).
   - `Sale` **does not have** an internal sequential counter, auto-incrementing integer, or fiscal numbering sequence.
2. **Business Reference Generation**:
   - `Client`: Uses `ClientReferenceNumber` format `CLI-YYYY-XXXXX`.
   - `Payment`: Uses `reference` VO (`PaymentReference`), an external audit tag or register voucher string (e.g. cash drawer tag, terminal auth code, QR payload hash). It does not generate sequential numbers.
   - `Sale`: Has no dedicated sequential numbering generator.
3. **Database Sequence & Counter Infrastructure**:
   - **No PostgreSQL sequences (`CREATE SEQUENCE`) or transactional counter tables** existed in the database schema or prior Prisma migrations.
4. **Architectural Mandate**:
   - "Do not create a second numbering system if one already exists."
   - "If Sale already has a stable business reference, Receipt must reference/snapshot that value."
   - "If no receipt-specific reference is required by the business requirements, do not invent one."
   - "Receipt identity and Sale reference must remain conceptually separate."

---

## 3. Decision Drivers

- **Zero Redundant Numbering Systems**: Avoid inventing an artificial, competing numbering sequence for `Sale` when `SaleId` and `sourceCode` already serve as canonical commercial identifiers.
- **Strict Conceptual Separation**:
  - **`ReceiptId`**: Identifies the technical `Receipt` aggregate entity (UUID primary key).
  - **`ReceiptNumber`**: Identifies the customer-facing, fiscal/legal voucher (`REC-YYYY-XXXXXX`).
  - **`SaleReference`**: Identifies the underlying commercial transaction that gave rise to the receipt.
- **Legal and Accounting Monotonicity**: Human-readable receipt numbers must be strictly increasing, gap-free, and partitioned per tenant and calendar year.
- **Concurrency & Collision Safety**: Sequence generation must remain 100% collision-safe under heavy parallel checkout loads.
- **Negative Constraints**:
  - NO timestamps as uniqueness.
  - NO `Math.random()`.
  - NO client-generated financial sequence numbers.
  - NO unsafe un-synchronized in-memory counters.
  - NO floating-point arithmetic.

---

## 4. Architectural Decisions

### 1. Sale Business Reference Strategy

`Sale` retains its **UUID-only primary identity** (`SaleId`). We explicitly reject creating a secondary sequential sale counter (`SALE-000001`).

The commercial transaction reference is defined as:

```text
Sale Reference = sale.source.sourceCode ?? sale.id.value
```

- If an external upstream source provided a human-meaningful order or session reference (e.g. `ORD-2026-0924-001`), that reference is preserved.
- Otherwise, the canonical UUID `sale.id.value` serves as the unambiguous commercial reference.
- Upon receipt issuance, `Receipt` captures this reference into its immutable `saleReference` snapshot attribute.

### 2. Receipt Identification Architecture

`Receipt` possesses two distinct, complementary identifiers:

| Identifier          | Type                       | Representation        | Purpose                                                                   |
| :------------------ | :------------------------- | :-------------------- | :------------------------------------------------------------------------ |
| **`ReceiptId`**     | Domain Value Object / UUID | `rcpt_<uuid>` or UUID | Internal entity identity, database primary key, foreign reference target. |
| **`ReceiptNumber`** | Domain Value Object        | `REC-YYYY-XXXXXX`     | External, customer-facing, legal proof-of-purchase voucher number.        |

### 3. Receipt Voucher Number Specification

The canonical voucher format is strictly codified as:

```text
REC-YYYY-XXXXXX
```

- **Prefix**: Fixed literal `REC-` identifying a Receipt voucher.
- **YYYY**: 4-digit calendar year of issuance (e.g. `2026`).
- **XXXXXX**: 6-digit zero-padded, strictly monotonic integer sequence starting from `000001` per tenant and resetting at the beginning of each calendar year.
- Value Object: [`ReceiptNumber`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/receipt-number.vo.ts) provides `ReceiptNumber.fromParts(year: number, sequence: number)` enforcing strict integer-only arithmetic, zero padding, and validation.

### 4. Sequence Infrastructure: PostgreSQL Engine

To guarantee gap-free, atomic, concurrency-safe integer allocation without distributed lock bottlenecks, PostgreSQL persistence utilizes a dedicated transactional sequence table:

```sql
CREATE TABLE "receipt_sequences" (
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("tenant_id", "year")
);
```

#### Atomic PostgreSQL Upsert Query

Allocation occurs via an atomic native PostgreSQL `INSERT ... ON CONFLICT DO UPDATE RETURNING`:

```sql
INSERT INTO "receipt_sequences" ("tenant_id", "year", "current_value", "updated_at")
VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("tenant_id", "year")
DO UPDATE SET
  "current_value" = "receipt_sequences"."current_value" + 1,
  "updated_at" = CURRENT_TIMESTAMP
RETURNING "current_value";
```

#### Why This Design Was Chosen:

1. **Row-Level Serialization**: PostgreSQL automatically acquires an exclusive row lock on the specific `(tenant_id, year)` row during the statement execution.
2. **Zero Table Contention Across Tenants**: Requests for Tenant A and Tenant B lock completely different physical rows, executing in full parallel concurrency.
3. **Year Partitioning**: Sequence numbers automatically restart at `1` (`000001`) when a new year begins without requiring manual administrative cron jobs.
4. **Deadlock Immunity**: Single-row atomic updates cannot participate in cycle deadlocks.
5. **No Gaps From Rollbacks**: Sequence numbers are allocated in the same database transaction that persists the receipt.

### 5. Application and Domain Decoupling (Hexagonal Ports)

The domain and application layers remain completely decoupled from PostgreSQL/Prisma through explicit ports:

```typescript
// packages/core/src/sales/application/ports/receipt-sequence-generator.port.ts
export interface ReceiptSequenceGeneratorPort {
  getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber>;
}

// packages/core/src/sales/application/ports/receipt-repository.port.ts
export interface ReceiptRepositoryPort extends ReceiptSequenceGeneratorPort {
  findById(id: ReceiptId | string): Promise<Receipt | null>;
  findBySaleId(saleId: SaleId | string): Promise<Receipt | null>;
  findByReceiptNumber(receiptNumber: ReceiptNumber | string): Promise<Receipt | null>;
  save(receipt: Receipt): Promise<void>;
  getNextReceiptNumber(tenantId: string, year: number): Promise<ReceiptNumber>;
}
```

### 6. In-Memory Transactional Simulator for Testing

For unit testing, CI validation, and headless test harnesses, [`InMemoryReceiptSequenceGenerator`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/services/in-memory-receipt-sequence.generator.ts) implements an asynchronous queue-based mutex per `(tenantId, year)` partition key.

Under high-volume parallel asynchronous requests (`Promise.all` with 50+ callers), the simulator:

- Serializes increments per partition key using promise queues.
- Never suffers race conditions or counter overwrites.
- Requires no external database or Docker container to run comprehensive concurrency tests.

---

## 5. Verification and Quality Gates

The strategy was verified against stringent quality gates and test suites:

1. **Unit Invariants (`receipt-number.vo.spec.ts`)**:
   - Verifies `ReceiptNumber.create()` and `ReceiptNumber.fromParts()`.
   - Validates 6-digit zero padding, whitespace trimming, and immutability.
   - Proves rejection of invalid calendar years, negative sequence numbers, and floating-point floats.
2. **Concurrency Verification (`receipt-sequence-concurrency.spec.ts`)**:
   - **Single-Tenant High Concurrency**: 50 parallel asynchronous requests (`Promise.all`) yielded 50 distinct receipt numbers (`REC-2026-000001` through `REC-2026-000050`) with zero duplicate collisions and zero gaps.
   - **Multi-Tenant Isolation**: 100 interleaved concurrent requests across 4 tenants (`tenant_alpha`, `tenant_beta`, `tenant_gamma`, `tenant_delta`) proved that each tenant advanced independently from `000001` to `000025` with zero cross-tenant contamination.
   - **Year Rollover**: Proved that changing year from 2025 to 2026 independently restarts counter from 1.
3. **Application Handler Integration (`issue-receipt.handler.spec.ts`)**:
   - Proved that 20 parallel `IssueReceiptCommand` executions across distinct sales produce collision-free, gap-free sequence numbers.

---

## 6. Consequences

### Positive

- **No Duplicate Numbering Systems**: `Sale` avoids redundant sequential numbering; `Receipt` preserves the commercial reference cleanly.
- **Auditable Fiscal Monotonicity**: Receipts satisfy tax and accounting requirements for strictly sequential, tenant-partitioned numbering.
- **Enterprise Concurrency Safety**: Native PostgreSQL row locking and in-memory queue mutexes eliminate collision risks without timestamp hacks or random numbers.
- **Clean Architecture Purity**: Business logic in `Receipt` depends only on pure value objects; database drivers are completely hidden behind `ReceiptSequenceGeneratorPort`.

### Negative / Trade-Offs

- **Sequential Bottleneck per Tenant**: In extreme high-throughput environments (e.g. >10,000 receipts/sec within a single tenant), row-level locks on `(tenant_id, year)` serialize writes. For Kinergy's wellness center domain, this throughput exceeds operational requirements by multiple orders of magnitude while guaranteeing legal gap-free integrity.
