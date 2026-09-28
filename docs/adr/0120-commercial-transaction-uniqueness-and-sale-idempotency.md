# 0120. Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant

- **Status**: Accepted
- **Date**: 2026-09-28
- **Deciders**: Principal Domain Architect, Senior Financial Integrity Engineer, Principal Persistence Architect
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Commercial Transaction Identity & Invariant SALE-010). Commercial checkout transactions originate across clinical kinesiology sessions, gym memberships, and point-of-sale retail supplies. Under network retries, cashier double-clicks, and concurrent client requests, the platform must guarantee that **exactly one Sale represents each commercial transaction** without relying on timestamps or random UUID generation as a substitute for business identity.
- **Consulted ADRs**:
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)

---

## 1. Context and Problem Statement

In enterprise financial and billing architectures, a core invariant is that **exactly one commercial agreement (`Sale`) must represent each discrete commercial transaction**.

Previous milestones established:

1. `SaleId`: Canonical UUID technical primary key.
2. `SourceReference`: Originating source categorisation (`sourceType`, `sourceId`, `sourceCode`).
3. `saleReference`: Codified in ADR-0118 as `sale.source.sourceCode ?? sale.id.value`.

However, an architectural inspection revealed a critical gap in duplicate prevention:

- In `CreateSaleHandler`, if a client or upstream service submits a `CreateSaleCommand` without an explicit transaction identity, the aggregate factory `Sale.create()` historically generated a brand-new random UUID (`crypto.randomUUID()`) on every invocation.
- If a cashier double-clicked, an automated client network retry occurred, or two parallel checkout requests were dispatched for the same clinical treatment session, the system generated **two distinct Sales with two distinct UUIDs**.
- Database primary key uniqueness on `id` alone does not prevent duplicate sale creation when each duplicate receives a new random UUID.
- The platform lacked:
  1. An explicit definition of how a commercial transaction's business identity is established.
  2. Application-level idempotency to safely replay identical creation requests.
  3. Persistence-level collision detection for concurrent checkout races.
  4. Operational entity single-billing protection (preventing duplicate sales for the same clinical session).

We must formally establish how Kinergy identifies a commercial transaction, how uniqueness is enforced at application and persistence layers, how network retries behave, and how duplicate creation is prevented without inventing redundant numbering sequences or introducing unnecessary distributed infrastructure.

---

## 2. Platform Inspection: Existing Transaction Identifiers

Before defining uniqueness mechanisms, we audited the existing identifiers across Kinergy:

1. **`SaleId`**: The technical primary identity of the `Sale` aggregate root (`id: SaleId` in domain, `id TEXT PRIMARY KEY` in PostgreSQL).
2. **`saleReference` (ADR-0118 §4.1)**:
   $$\text{Sale Reference} = \text{sale.source.sourceCode} \mathrel{?} \text{sale.source.sourceCode} : \text{sale.id.value}$$
3. **`SourceReference`**:
   - `sourceType`: `INVENTORY_ITEM | MEMBERSHIP_PLAN | TREATMENT_SESSION | CUSTOM_SERVICE`.
   - `sourceId`: Operational identifier of the upstream entity (e.g. `treatment_session_id`, `plan_id`, or `pos_checkout_terminal`).
   - `sourceCode`: External business order reference (e.g. `ORD-2026-0928-001`, `SHAKE-01`, or `POS_REGISTER`).
4. **Decision: Do Not Invent a Second Numbering System**:
   Per ADR-0118, Kinergy explicitly rejects inventing an artificial sequential sale counter (e.g. `SALE-000001`). `SaleId` and `sourceCode` already serve as canonical commercial identifiers.

---

## 3. What "One Sale Per Commercial Transaction" Means in Kinergy

A commercial transaction in Kinergy occurs in two operational modes:

### Mode A: Upstream Operational Entity Fulfillment (Single-Billing Entities)

- When a clinical kinesiology treatment session (`SourceType.TREATMENT_SESSION`) or external booking is ready for billing, a commercial checkout session is created.
- **Invariant**: A single operational treatment session represents a single professional service delivery. It must be billed in **at most one active (non-cancelled) Sale**.
- Attempting to initiate a second Sale while an active Sale exists for that session constitutes a duplicate billing violation.

### Mode B: External Order Reference / Idempotent Checkout Sessions

- When an external system or client dispatches a sale with an explicit business transaction reference (`sourceCode`) or client-supplied transaction ID (`id` / `idempotencyKey`):
- **Invariant**: Exactly one Sale represents that specific commercial transaction agreement.
- Retries with the same transaction identity must be recognized by the application layer and resolved idempotently.

### Mode C: Ad-Hoc Point-of-Sale (POS) Retail Walk-Ins

- Walk-in retail purchases (e.g. purchasing a bottle of water at the reception desk) share a generic terminal origin (`sourceId = 'pos_checkout_terminal'`).
- The commercial transaction boundary is defined by the checkout session itself.
- Cashier double-clicks and network retries are deduplicated via client-supplied request tokens (`id` / `idempotencyKey`). If the client provides an identifier, retrying it returns the existing Sale. If omitted, a fresh transaction is initiated.

---

## 4. Architectural Decisions

### 1. Dual-Anchor Uniqueness Model

Uniqueness is anchored on existing platform identifiers:

1. **Technical Anchor**: `SaleId` (caller-supplied or aggregate-generated UUID).
2. **Business Anchor**:
   - For operational single-billing entities: `(tenantId, sourceType, sourceId)`.
   - For external referenced orders: `(tenantId, sourceCode)` (where `sourceCode` is non-generic).

### 2. Application-Level Idempotency (`CreateSaleHandler`)

`CreateSaleInput` is extended with optional `id?: string` and `idempotencyKey?: string`.
When `CreateSaleHandler.execute(command)` executes:

1. **Existing ID Check**: If `command.input.id` is supplied:
   - Query `saleRepository.findById(input.id)`.
   - If an existing Sale is found:
     - **Matching Parameters**: If `tenantId`, `clientId`, `currency`, and `source` match, it is recognized as a network retry or idempotent replay. The handler returns `SalesApplicationResult.ok(SaleMapper.toDTO(existingSale))` without attempting a duplicate database write.
     - **Conflicting Parameters**: If the caller attempts to create a different transaction with an existing ID, the handler rejects with [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts) (HTTP 409 Conflict).
2. **Operational Source Entity Check**: If `sourceType === SourceType.TREATMENT_SESSION`:
   - Query `saleRepository.findBySourceReference(sourceType, sourceId, tenantId)`.
   - If an active (non-cancelled) Sale already exists:
     - If the existing Sale matches the incoming transaction ID, return idempotently.
     - Otherwise, reject with [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts) (`An active Sale already exists for TreatmentSession '...'`).
3. **External Business Reference Check**: If `sourceCode` is provided and is not a generic terminal identifier (such as `POS_REGISTER`):
   - Query `saleRepository.findBySourceCode(sourceCode, tenantId)`.
   - If an active Sale already exists with this order reference:
     - If parameters match, return idempotently.
     - If parameters conflict, reject with [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts).

### 3. Persistence-Level Uniqueness & Concurrency Safety (`PrismaSaleRepository`)

To guarantee safety against concurrent parallel requests that bypass application pre-checks:

1. **Pre-Check in Transaction**: During initial insertion (`version === 1`), `tx.sale.findUnique` verifies that the `id` does not already exist.
2. **Operational Source Pre-Check**: For single-billing sources, `tx.sale.findFirst` verifies that no active record exists for `(tenantId, sourceType, sourceId)`.
3. **Prisma P2002 / SQLSTATE 23505 Translation**: If concurrent racers pass the pre-check simultaneously, PostgreSQL enforces primary key and unique constraint serialization. `PrismaSaleRepository.save()` intercepts Prisma `P2002` errors and translates them directly into domain [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts).

### 4. API Layer Semantics

The HTTP API (`POST /sales`) accepts:

- `id` in the JSON request body (client-generated UUID for the checkout session).
- `X-Idempotency-Key` HTTP header (mapped to `input.idempotencyKey`).
- When a duplicate conflict occurs, the API returns HTTP 409 Conflict with the structured `DUPLICATE_SALE_DETECTED` domain payload.

---

## 5. Consequences

### Positive

- **Guaranteed 1-to-1 Commercial Transaction Integrity**: Accidental double-clicks, network retries, and concurrent API requests cannot create duplicate sales.
- **Zero Data Drift**: Billing cannot double-charge clinical treatment sessions or duplicate external orders.
- **No Distributed Overhead**: Achieved using PostgreSQL ACID transactions and local application idempotency; no Redis or external distributed lock managers required.
- **Adherence to Existing Identifiers**: Strictly utilizes `SaleId`, `SourceReference`, and `sourceCode`; zero competing numbering systems introduced.

### Negative / Trade-offs

- Callers requiring idempotency for POS retail walk-in sales must pass an `id` or `X-Idempotency-Key` header.
- Slight performance overhead of pre-checking existing records during initial sale insertion.
