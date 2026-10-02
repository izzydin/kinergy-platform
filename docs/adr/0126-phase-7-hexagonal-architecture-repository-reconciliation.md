# 0126. Phase 7 Hexagonal Architecture Repository Reconciliation and Clean Persistence Boundaries

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: Senior Hexagonal Architecture Engineer, Principal Domain Architect, Lead Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.10: Hexagonal Architecture Reconciliation). Following the transactional boundaries audit (ADR-0125), index optimization (ADR-0123), and uniqueness audit (ADR-0124), we must formally reconcile the Prisma repository implementations (`PrismaSaleRepository`, `PrismaPaymentRepository`, `PrismaReceiptRepository`) with the finalized domain model to guarantee strict adherence to Hexagonal Architecture (Ports and Adapters).
- **Consulted ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering & Dependency Inversion](0010-backend-clean-architecture-layering.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discount Domain Model](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Deterministic Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)

---

## 1. Context and Problem Statement

In Hexagonal Architecture (Ports and Adapters):

1. **The Domain Core is sovereign and framework-agnostic**: Domain entities, aggregates, and value objects must never import or depend on Prisma Client, SQL libraries, or database drivers.
2. **Ports define interface contracts in domain/application terms**: Primary (driving) and Secondary (driven) ports communicate solely using pure domain aggregates, value objects, and primitive types.
3. **Adapters isolate infrastructure details**: The Prisma repositories (`PrismaSaleRepository`, `PrismaPaymentRepository`, `PrismaReceiptRepository`) and their mappers (`PrismaSaleMapper`, `PrismaPaymentMapper`, `PrismaReceiptMapper`, `PrismaMoneyMapper`) must encapsulate all ORM constructs, database exceptions, and SQL details.
4. **Aggregate invariants must never be bypassed**: Persistence adapters must not expose generic update methods (such as `updateStatus`, `patchTotals`, or arbitrary field-level mutators) that allow application code or external callers to circumvent aggregate state machines and commercial business rules.

This ADR records the formal reconciliation audit of all Phase 7 persistence components against these architectural mandates.

---

## 2. Hexagonal Boundary Reconciliation Audit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               PHASE 7 HEXAGONAL REPOSITORY & MAPPING ARCHITECTURE                      │
├────────────────────┬─────────────────────────────┬───────────────────┬─────────────────┤
│ PORT (Application) │ ADAPTER (Infrastructure)    │ MAPPER            │ DOMAIN TARGET   │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ SaleRepositoryPort │ PrismaSaleRepository        │ PrismaSaleMapper  │ Sale Aggregate  │
│                    │                             │ PrismaSaleItem    │ + SaleItems     │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ PaymentRepository  │ PrismaPaymentRepository     │ PrismaPayment     │ Payment Root    │
│ Port               │                             │ Mapper            │ (Autonomous)    │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ ReceiptRepository  │ PrismaReceiptRepository     │ PrismaReceipt     │ Receipt Root    │
│ Port               │                             │ Mapper            │ (Point-in-time) │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ (No Port)          │ (Embedded in Sale Adapter)  │ Handled in Sale   │ Discount VO     │
│ Discount           │ Flat columns: order/item    │ & Item Mappers    │ (Embedded VO)   │
├────────────────────┼─────────────────────────────┼───────────────────┼─────────────────┤
│ (No Port)          │ (Event-driven out-of-band)  │ Domain Events     │ Audit Log       │
│ PaymentHistory     │ Dispatched post-commit      │ (Post-Commit)     │ (Platform Event)│
└────────────────────┴─────────────────────────────┴───────────────────┴─────────────────┘
```

---

## 3. Detailed Audit Findings and Decisions

### 3.1 Domain Model Purity (Prisma Independence)

- **Audit Result**: Passed (100% pure).
- **Verification**: Zero imports of `@prisma/client`, `Prisma.Decimal`, or Prisma runtime types exist across `packages/core/src/sales/domain` (excluding isolated unit test specifications).
- **Rule**: Domain aggregates (`Sale`, `Payment`, `Receipt`) and Value Objects (`Money`, `Discount`, `SourceReference`, `SaleSource`) contain zero persistence annotations, decorators, or ORM dependencies.

### 3.2 Framework Independence of Repository Ports

- **Audit Result**: Passed.
- **Verification**:
  - `SaleRepositoryPort`: imports only `Sale`, `SaleId`, and `SourceType`. Methods: `findById`, `findBySourceReference`, `findBySourceCode`, `save(sale: Sale)`.
  - `PaymentRepositoryPort`: imports only `Payment`, `PaymentId`, and `SaleId`. Methods: `findById`, `findBySaleId`, `save(payment: Payment)`.
  - `ReceiptRepositoryPort`: imports only `Receipt`, `ReceiptId`, `SaleId`, `ReceiptNumber`, and extends `ReceiptSequenceGeneratorPort`. Methods: `findById`, `findBySaleId`, `findByReceiptNumber`, `save(receipt: Receipt)`, `getNextReceiptNumber`.
- **Rule**: Repository ports strictly return and accept domain entities or primitive identifiers. No Prisma query types or persistence DTOs are permitted in method signatures.

### 3.3 Elimination of Speculative Repositories (Discount & PaymentHistory)

- **Discount Repository**: Evaluated and confirmed **rejected**. Item-level and order-level discounts are pure Value Objects embedded within `SaleItem` and `Sale` aggregates (ADR-0113, ADR-0122 §4.3). They are persisted as flattened columns on `sales` and `sale_items`. A separate `DiscountRepository` would violate DDD aggregate boundaries by treating an owned value object as an independent root.
- **PaymentHistory Repository**: Evaluated and confirmed **rejected**. A dedicated `PaymentHistory` relational table violates ADR-0116 and ADR-0122 §5. Payment state transitions are recorded through domain events (`PaymentSettledEvent`, `PaymentFailedEvent`, `PaymentCancelledEvent`) published to the platform audit subsystem (`audit_logs`) post-commit.

### 3.4 Decimal Mapping Determinism

- **Audit Result**: Passed.
- **Implementation**: [`PrismaMoneyMapper`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-money.mapper.ts) converts `Money` Value Objects (storing integer `cents` and ISO `currency`) to and from `Prisma.Decimal` without binary floating-point math:
  - `toDecimal`: Converts integer cents to fixed two-decimal string `${whole}.${frac}` before constructing `new Prisma.Decimal(decimalString)`.
  - `toMoney`: Accepts `Prisma.Decimal | string`, calls `.toFixed(2)` on Decimal instances, and delegates to `Money.create(exactString, currency)`.
- **Rule**: Binary floating-point operators (`/ 100`, `* 100`, `Number(decimal)`, `parseFloat`) are prohibited in financial persistence paths.

### 3.5 Enum Mapping and Value Object Conversion

- **Status Enum Conversion**:
  - `SaleStatus`: Direct mapping between domain `SaleStatus` and Prisma `SaleStatus` (DRAFT, PENDING_PAYMENT, PARTIALLY_PAID, PAID, COMPLETED, CANCELLED, REFUNDED).
  - `PaymentStatus`: Explicit bidirectional mapping via `PrismaPaymentMapper.toDomainStatus()` and `PrismaPaymentMapper.toPersistenceStatus()`. Maps domain `PaymentStatus.COMPLETED` to Prisma `PaymentStatus.SETTLED` as codified in ADR-0116.
  - `PaymentMethod`: Domain methods (`CASH`, `QR`) map to Prisma `PaymentMethod`. Future methods (`CARD`, `TRANSFER`, `ONLINE`) are architecturally anticipated but rejected at runtime until activated.
  - `ReceiptStatus`: Maps `ReceiptStatus.ISSUED` to Prisma `ReceiptStatus.ISSUED`.

### 3.6 Timestamp and ID Mapping

- All timestamps (`createdAt`, `updatedAt`, `cancelledAt`, `completedAt`, `refundedAt`, `paidAt`, `issuedAt`, `lastReprintedAt`) are mapped using JavaScript `Date` instances. Mappers ensure defensive copying to prevent shared temporal mutation.
- All domain IDs (`SaleId`, `SaleItemId`, `PaymentId`, `ReceiptId`, `ReceiptNumber`) encapsulate UUID or formatted string invariants. Mappers convert them via `.value` on extraction and `.create()` on reconstitution.

### 3.7 Prohibition of Generic Update Methods

- **Audit Result**: Passed.
- **Finding**: None of the Prisma repositories expose generic update methods (e.g. `update(id, partialData)`).
- **Protection**:
  - `PrismaSaleRepository.save(sale)` rejects mutations if the persisted sale is in a terminal status (`CANCELLED` or `REFUNDED`).
  - Optimistic Concurrency Control (OCC) enforces `version = priorVersion`, rejecting stale or concurrent modifications with `SaleOptimisticLockException`.
  - Cross-sale item mutation is physically prohibited by `PrismaSaleItemMapper.toPersistence()`.
  - Staged draft additions are synchronized differentials (deleting unreferenced line items and upserting active items).

---

## 4. Consequences

### Positive

- **Complete Hexagonal Cleanliness**: The core domain is entirely decoupled from Prisma, PostgreSQL, and framework libraries.
- **Zero Financial Drift**: Exact Decimal serialization guarantees cents-level precision across database storage and domain calculations.
- **Invariant Tamper-Resistance**: Application callers cannot bypass aggregate business rules because repositories only accept fully-validated aggregate roots via `save()`.
- **Verified Port Compliance**: Integration test suite verifies all mapper roundtrips and aggregate boundary protections.

### Negative / Trade-offs

- Mapping boilerplate is required for every entity and value object. This is a deliberate, necessary investment to maintain architectural decoupling and domain purity.
