# 0121. Sale Source References and Commercial Origin Model

- **Status**: Accepted
- **Date**: 2026-09-29
- **Deciders**: Principal DDD Architect, Principal Domain Architect, Staff Backend Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.9: Sale Source References). Commercial checkout agreements in Kinergy originate across diverse facility operations: clinical kinesiology sessions, gym memberships, food orders, drink orders, and room rentals. We must define the authoritative architecture for how commercial sales capture and preserve their upstream origin without allowing Sales to usurp ownership of source entities, without subclassing the generic Sale aggregate root, and without creating circular domain dependencies.
- **Consulted ADRs**:
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0045: Kinesiology Bounded Context and Cross-Context Identifiers](0045-kinesiology-bounded-context-and-cross-context-identifiers.md)
  - [ADR-0054: Gym Management Bounded Context Ownership and Context Map](0054-gym-management-bounded-context-ownership-and-context-map.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0120: Commercial Transaction Uniqueness, Idempotency, and Exactly-One-Sale Invariant](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)

---

## 1. Context and Problem Statement

In a multi-service health, wellness, and sports facility platform, sales agreements do not originate in a vacuum. A customer paying at the front desk may be paying for:

1. A clinical rehabilitation session delivered by a therapist (`KINESIOLOGY_SESSION`);
2. An annual or monthly gym membership plan (`GYM_MEMBERSHIP`);
3. A post-workout meal or snack purchased at the reception bar (`FOOD`);
4. A functional wellness beverage or electrolyte smoothie (`DRINK`);
5. An hourly facility rental for a private studio or treatment bay (`ROOM_RENTAL`).

Historically, systems attempting to unify diverse commercial operations suffer from two catastrophic domain architectural anti-patterns:

1. **Polymorphic Aggregate Explosion (Subclassing Anti-Pattern)**:
   Creating specialized aggregate roots such as `KinesiologySale`, `GymSale`, `FoodSale`, `DrinkSale`, and `RoomSale`. This destroys commercial homogeneity. Financial invariants (subtotal calculation, discount distribution, currency consistency, payment coordination, tax accounting, and fiscal receipting) become duplicated across five diverging classes, leading to inevitable divergence and maintenance nightmares.
2. **Domain Monolith Usurpation (Leaky Context Anti-Pattern)**:
   The Sales domain imports source entities directly, taking ownership of medical SOAP notes, turnstile access policies, kitchen preparation statuses, inventory stock replenishments, or calendar room schedules. This introduces high coupling, circular package dependencies, and relational joins that break domain boundaries.

We must formally establish the canonical architecture for **Sale Source References**, defining how `Sale` remains 100% generic while cleanly referencing its upstream operational origin under Domain-Driven Design principles.

---

## 2. Decision Drivers

- **Canonical Generality of Sales**: Every commercial agreement in Kinergy is governed by the same pure financial rules: lines, quantities, unit prices, discounts, taxes, tenders, and receipts. A `Sale` is always a `Sale`.
- **References Over Ownership (ADR-0110)**: Sales records scalar pointers to upstream operational entities. It never assumes lifecycle authority over clinical charts, membership validity, warehouse stock, or room schedules.
- **Zero Cyclic Dependencies**: Strict unidirectional architecture. Sales must never import concrete entities from Kinesiology, Gym, Resources, or Scheduling.
- **Historical Immutability**: Modifying or archiving an upstream catalog item or treatment session must never corrupt past sales, balance sheets, or tax receipts.
- **Pragmatism Over Over-Engineering**:
  - NO polymorphic inheritance hierarchies.
  - NO generic "plugin frameworks".
  - NO speculative event-driven infrastructure or distributed messaging buses solely for recording an origin.
  - Rely on established Hexagonal Architecture, pure TypeScript Value Objects, and Application Orchestration.

---

## 3. Explicit Architectural Prohibitions (Negative Decisions)

To prevent architectural drift, the following patterns are **strictly prohibited**:

1. **PROHIBITED: Subclassing the Sale Aggregate Root**:
   We will **NOT** create:
   - `FoodSale`
   - `DrinkSale`
   - `GymSale`
   - `RoomSale`
   - `KinesiologySale`
     A `Sale` is uniform and generic regardless of what is sold.
2. **PROHIBITED: Source-Specific Tables in Sales Bounded Context**:
   The Sales persistence schema will **NOT** introduce tables like `sale_food_details`, `sale_gym_memberships`, or `sale_room_rentals`.
3. **PROHIBITED: Direct Entity Imports Across Bounded Contexts**:
   The Sales domain will **NOT** import `TreatmentSession`, `Membership`, `InventoryItem`, or `Room` into domain logic.
4. **PROHIBITED: Source-Specific Business Rules in Sales**:
   Sales will **NOT** calculate membership expiration dates, clinical treatment protocols, recipe ingredients, or room capacity constraints.
5. **PROHIBITED: Over-Engineered Plugin Frameworks**:
   Sales will **NOT** introduce reflective source-plugin registries, dynamic class loaders, or speculative domain hooks.

---

## 4. The 20 Authoritative Architectural Specifications

### 4.1 Specification 1: Why Sale Has a Source Reference

A `Sale` captures a commercial origin reference to establish:

1. **Auditability & Traceability**: Connecting the financial ledger entry and legal receipt voucher back to the business event that incurred the transaction (e.g. which clinical session was billed, which membership was sold).
2. **Fulfillment Correlation**: Providing downstream application handlers the identity required to mark the upstream entity as billed, activate privileges, or deplete inventory.
3. **Operational De-duplication**: Supporting single-billing invariants (e.g. preventing the same clinical treatment session from being billed multiple times under ADR-0120).

### 4.2 Specification 2: What a SaleSource Represents

A `SaleSource` is a lightweight, immutable **Value Object** acting as an **unconstrained external scalar reference** (a loose pointer) identifying the business origin of the sale. It answers two questions:

- _What category of business activity initiated this checkout?_ (`type`)
- _What is the identifier of the upstream business record?_ (`referenceId`)

### 4.3 Specification 3: Supported Source Types

The platform explicitly standardizes on five canonical commercial source types:

| Source Type               | Category Description                                 | Upstream Bounded Context       | Typical Upstream Entity            |
| :------------------------ | :--------------------------------------------------- | :----------------------------- | :--------------------------------- |
| **`KINESIOLOGY_SESSION`** | Clinical therapy or rehabilitation session           | `Kinesiology`                  | `TreatmentSession`                 |
| **`GYM_MEMBERSHIP`**      | Gym membership plan subscription or renewal          | `Gym Management`               | `Membership` / `MembershipPlan`    |
| **`FOOD`**                | Kitchen meal, snack, or nutritional product          | `Resources` (Retail Inventory) | `InventoryItem`                    |
| **`DRINK`**               | Beverage, smoothie, or functional shake              | `Resources` (Retail Inventory) | `InventoryItem` (`HEALTHY_DRINKS`) |
| **`ROOM_RENTAL`**         | Private bay, studio, or facility hourly space rental | `Scheduling`                   | `Room`                             |

_(Note: For backward compatibility with existing persistence data, legacy strings `INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, and `TREATMENT_SESSION` are accepted by mappers as aliases)._

### 4.4 Specification 4: SaleSource Structure

Conceptually and structurally, `SaleSource` is represented as an immutable Value Object:

```typescript
export interface SaleSourceProps {
  readonly type: SaleSourceType;
  readonly referenceId: string;
  readonly referenceCode?: string | null;
}

export class SaleSource implements ValueObject<SaleSourceProps> {
  private readonly _type: SaleSourceType;
  private readonly _referenceId: string;
  private readonly _referenceCode: string | null;

  // Enforces non-empty sanitized strings and valid enum types upon construction
  // Frozen with Object.freeze(this)
}
```

- `type`: Must be one of the five supported `SaleSourceType` enum values.
- `referenceId`: Non-empty sanitized string (length: 1–255) representing the upstream identifier.
- `referenceCode`: Optional human-meaningful business/order reference (e.g. `ORD-2026-001` or SKU) preserved for receipt formatting per ADR-0118.

### 4.5 Specification 5: Ownership of the Source Entity

**Sales does NOT own the source entity.**

- Kinesiology owns `TreatmentSession`.
- Gym Management owns `Membership` and `MembershipPlan`.
- Resources owns `InventoryItem`.
- Scheduling owns `Room`.
  Sales only records a generic, scalar pointer to that entity.

### 4.6 Specification 6: Ownership of Source-Specific Business Rules

All business rules governing the lifecycle, validation, prerequisites, and clinical or access constraints of the source entity reside exclusively within the respective source bounded context:

- Kinesiology decides if a treatment session can be billed (e.g. status must be `COMPLETED`).
- Gym decides if a membership plan is eligible for purchase or renewal.
- Resources decides if stock is available for sale.
- Scheduling decides if a room is available for booking.
  Sales never duplicates or executes source-specific logic.

### 4.7 Specification 7: Whether sourceReference is Required or Optional

- **Domain Layer (`Sale.create()`)**: **Required**. Every commercial sale agreement must have an explicit `SaleSource` establishing its origin.
  - For scheduled services or memberships, the reference points to the specific entity (`SessionId`, `MembershipId`).
  - For walk-in retail purchases (e.g. a customer buying a bottle of water at reception), a standardized retail POS terminal source is provided (e.g. `{ type: 'DRINK', referenceId: 'pos_checkout_terminal' }`).
- **Transport Layer (`CreateSaleRequestDto`)**: In client HTTP payloads, `source` is optional; if omitted by an ad-hoc cashier POS client, the controller defaults to the standard retail terminal origin.
- **Child Line Items (`SaleItem.create()`)**: **Required**. Each line item records the source of the specific good or service sold.

### 4.8 Specification 8: When a Sale May Receive a Source Reference

A `Sale` receives its `SaleSource` **exclusively at creation time** during `Sale.create(props)` or when reconstituted by persistence mappers `Sale.reconstitute(props)`.

### 4.9 Specification 9: Whether a Source Reference Can Change

**No.** A `SaleSource` is **strictly immutable**. Once a commercial agreement is created for a given origin (e.g. a kinesiology session checkout), its source reference cannot be reassigned or pointed to a different entity. To bill a different entity, the existing sale must be cancelled and a new sale created.

### 4.10 Specification 10: Whether a Source Reference Can Be Removed

**No.** A `SaleSource` cannot be deleted, cleared, or set to `null` after creation. The commercial origin is permanently bound to the lifecycle of the `Sale`.

### 4.11 Specification 11: Whether Source Reference Must Identify an Existing Source Record

- **At the Sales Domain Level**: **No foreign key constraint**. The Sales domain treats `referenceId` as an unconstrained scalar value. Sales does not perform database `FOREIGN KEY` joins to upstream tables.
- **At the Application Level**: The application use case initiating checkout guarantees that the entity exists before dispatching `CreateSaleCommand`. If an upstream entity does not exist, the initiating use case fails before Sales is invoked.

### 4.12 Specification 12: Whether Sales May Validate Source Existence

**No.** The `Sale` aggregate root and the `Sales` domain do **not** query external repositories or databases to verify whether `referenceId` exists. Performing cross-context database reads inside an aggregate root violates aggregate purity and bounded context autonomy.

### 4.13 Specification 13: Source Validation Belongs to Application Orchestration

Source existence validation and eligibility verification belong strictly to **Application Use Case Orchestration** prior to or during the invocation of Sales:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER 5-STEP FLOW                         │
│                                                                             │
│  1. Validate Request Structure:                                             │
│     - Check command payload structure. Fail-fast on empty reference ID or   │
│       missing source when walk-in default is not permitted.                 │
│     - If source is omitted and allowWalkInWithoutSource is true, default to │
│       standardized POS terminal origin (e.g. DRINK + pos_checkout_terminal).│
│                                                                             │
│  2. Reject Unsupported Source Types Before Persistence:                     │
│     - Verify type against SaleSourceType / SourceType before persistence.   │
│     - Rejects unknown types immediately with UNSUPPORTED_SALE_SOURCE_TYPE.  │
│                                                                             │
│  3. Validate Source Ownership / Existence (if required by architecture):    │
│     - Application invokes SaleSourceValidatorPort.                          │
│     - Checks if entity exists in upstream domain (SOURCE_NOT_FOUND).        │
│     - Checks if entity matches expected bounded context                     │
│       (SOURCE_CONTEXT_MISMATCH).                                            │
│                                                                             │
│  4. Construct Sale Aggregate & Verify Invariants:                           │
│     - Evaluate idempotency and single-billing invariants (SALE-010).         │
│     - Construct immutable SaleSource Value Object.                          │
│     - Construct Sale aggregate root in DRAFT status with exact zero totals. │
│                                                                             │
│  5. Persist the Aggregate Atomically:                                       │
│     - Persist Sale aggregate via SaleRepositoryPort.save().                 │
│     - Publish domain events atomically; clear uncommitted events.           │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Decision on Synchronous vs. Asynchronous Existence Validation

The architecture intentionally decouples synchronous source existence validation from the core sales transaction:

1. **Why Source Existence is NOT Validated Synchronously by Default**:
   - **Availability & Fault Isolation**: Walk-in retail checkout (front desk POS) must remain 100% operational even if upstream medical scheduling or gym turnstile backends experience temporary downtime or network latency.
   - **Temporal Decoupling**: In high-throughput hospitality and concession workflows (bar, cafe, merchandise), cashiers cannot be blocked by synchronous cross-context network calls on every draft sale item addition.
   - **References Over Ownership Principle**: Sales treats external references as opaque correlation tokens. Upstream fulfillment pipelines or background reconcilers handle eventual consistency.
2. **When Synchronous Validation IS Used**:
   - For clinical session billing (`KINESIOLOGY_SESSION`) or high-value recurring membership enrollments (`GYM_MEMBERSHIP`), application orchestration injects [`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts) into [`CreateSaleHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/create-sale.handler.ts) to verify existence, tenant ownership, and clinical completion before issuing the commercial contract.
   - This provides absolute configurability: zero cross-aggregate coupling in the domain, with strict validation available at the application boundary.

### 4.14 Specification 14: Dependency Direction & Port Isolation

The dependency direction is strictly **outward from Sales**:

```text
Source Domain (Kinesiology / Gym / Resources / Scheduling)
      │
      ▼
Application Orchestration (Controllers / Orchestration Use Cases)
      ├── SaleSourceValidatorPort (Cross-context validation adapter)
      ▼
Sales Bounded Context (Sale Aggregate / Ports / SaleRepositoryPort)
```

Sales **NEVER** depends on source-domain modules:

- **NO** `Sale → FoodRepository`
- **NO** `Sale → GymMembershipRepository`
- **NO** `Sale → TreatmentSessionRepository`
  All cross-context coordination is mediated via application ports ([`SaleSourceValidatorPort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/sale-source-validator.port.ts), [`ClientFacadePort`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/ports/client-facade.port.ts)).

### 4.15 Specification 15: Uniqueness Semantics of SaleSource (0, 1, or Multiple Sales)

A critical architectural question is whether the same source reference (`type` + `referenceId`, e.g. `FOOD` + `order-123`) can produce 0, 1, or multiple `Sale` aggregates:

1. **Can a source reference represent 0 Sales?**
   - **YES**. An entity or catalog item exists upstream in its source domain without ever being checked out or billed. Examples: an unbilled kinesiology session, an unsold inventory item in stock, an unassigned gym membership plan, or an unbooked room bay.
2. **Can a source reference represent 1 Sale?**
   - **YES**. Operational discrete service deliveries (e.g. a single completed `KINESIOLOGY_SESSION` or referenced external order ticket `sourceCode`) represent a single commercial debt obligation and must be billed in **at most one active (non-cancelled) Sale** (ADR-0120 / `SALE-010`).
3. **Can a source reference represent Multiple Sales?**
   - **YES**. Multiple Sales legitimately and frequently share the exact same `SaleSource`:
     - **Retail Consumables (`FOOD`, `DRINK`)**: Multiple customers purchasing the same inventory item reference (e.g. `inv_protein_bar`), split-order tickets, or repeat meal orders referencing the same register/ticket (`FOOD + order-123`).
     - **Gym Memberships (`GYM_MEMBERSHIP`)**: Hundreds of gym members purchasing the same membership plan reference (`plan_gold_annual`), or recurring monthly subscription renewals for a member agreement.
     - **Facility Rentals (`ROOM_RENTAL`)**: A single physical room or studio (`room_bay_1`) booked and billed across separate calendar slots throughout the year.
     - **Re-Billing Following Cancellation**: If a prior `Sale` for a clinical session reached terminal status `CANCELLED`, a new replacement `Sale` may be created for the same source reference.

#### Rejection of Blanket Database `UNIQUE(sourceType, sourceId)` Constraint

The platform **strictly rejects** placing a database-level composite unique constraint `@@unique([sourceType, sourceId])` or `@@unique([tenantId, sourceType, sourceId])` on the `sales` table:

- **Catastrophic Failure for Retail**: Would restrict the business to selling exactly one bottle of water or protein bar in its entire operating lifetime.
- **Catastrophic Failure for Memberships & Rooms**: Would allow only one customer to ever purchase the Gold Plan, and only one hour to ever be billed for Studio A.
- **Deadlock on Cancelled Sales**: If an initial checkout is cancelled due to cashier error, a physical database unique constraint would permanently block that session from ever being re-billed, locking revenue.

#### Architectural Classification of Evaluated Models

| Evaluated Architectural Model                                      |             Platform Decision             | Architectural Rationale                                                                                                              |
| :----------------------------------------------------------------- | :---------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Model 1: One source $\to$ One Sale**                             |       **REJECTED** (as global rule)       | Destroys retail sales, multi-customer membership plans, recurring subscriptions, and post-cancellation re-billing.                   |
| **Model 2: One source $\to$ Multiple Sales**                       | **ACCEPTED** (for retail, plans, rentals) | Accurately models retail consumables, catalog plans, room turnover, and replacement checkouts.                                       |
| **Model 3: Source uniqueness enforced by source domain**           |               **ACCEPTED**                | The upstream source domain (e.g. Kinesiology) owns the state of whether an operational session is `BILLED` or eligible for checkout. |
| **Model 4: Source references for traceability without uniqueness** |     **ACCEPTED** (Canonical baseline)     | `SaleSource` is a loose correlation and audit reference ("References Over Ownership"), not a relational foreign key.                 |

### 4.16 Specification 16: Operational Single-Billing & Duplicate-Source Behavior

While global relational uniqueness is rejected, the platform enforces **Operational Single-Billing (`SALE-010`)** specifically for operational clinical deliveries (`KINESIOLOGY_SESSION` / `TREATMENT_SESSION`):

1. **Active Collision Enforcement**:
   - `CreateSaleHandler` queries `findBySourceReference(sourceType, sourceId, tenantId)`.
   - If an active (status $\ne$ `CANCELLED`) Sale already exists for that session:
     - **Idempotent Retry**: If the incoming request has matching parameters, the existing `SaleDTO` is returned idempotently (`isSuccess = true`).
     - **Conflicting Duplicate**: If parameters conflict or a separate transaction attempts duplicate checkout, the request is rejected with [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts) (HTTP 409 Conflict).
2. **Re-Billing Permitted Post-Cancellation**:
   - Cancelled sales (`status === CANCELLED`) do not block subsequent checkout for the same session.

### 4.17 Specification 17: Concurrency & Determinism (No Distributed Locking)

The platform evaluates concurrent simultaneous requests using the same source reference deterministically **without distributed locks (Redis / Redlock)**:

1. **Concurrent Retail / Plan Requests (`FOOD`, `DRINK`, `GYM_MEMBERSHIP`, `ROOM_RENTAL`)**:
   - Two simultaneous checkout requests for the same source reference succeed deterministically.
   - Each request receives a distinct, canonical `SaleId` and commits an independent commercial transaction.
   - If client passes an explicit idempotency key, application idempotency prevents accidental double-billing.
2. **Concurrent Single-Billing Requests (`KINESIOLOGY_SESSION` / `TREATMENT_SESSION`)**:
   - Two simultaneous checkout requests racing to bill the same session are serialized within PostgreSQL ACID transactions (`prisma.$transaction`).
   - Inside `PrismaSaleRepository.save()`, the atomic `findFirst` query detects the concurrent winner; the racing runner-up is deterministically rejected with [`DuplicateSaleException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/exceptions/duplicate-sale.exception.ts).
   - This provides absolute financial determinism under high concurrency with zero distributed infrastructure overhead.

### 4.18 Specification 18: Persistence Representation

In PostgreSQL (via Prisma), `SaleSource` is persisted as scalar columns on the `sales` and `sale_items` tables:

```prisma
model Sale {
  id          String   @id @default(uuid())
  ...
  sourceType  String   @map("source_type")  // Stores SaleSourceType enum value
  sourceId    String   @map("source_id")    // Stores referenceId
  sourceCode  String?  @map("source_code")  // Stores optional referenceCode
  ...

  @@index([tenantId, sourceType, sourceId])
  @@map("sales")
}
```

- **Zero Polymorphic Tables**: All sales share the same relational schema.
- **No Foreign Keys to Source Tables**: `source_id` is an indexed `TEXT` column without a SQL `FOREIGN KEY` constraint to `treatment_sessions` or `memberships`. This preserves bounded context autonomy and prevents cascading deletion failures.
- **Database Migration Decision**: See [SaleSource Database Migration Architecture & Decision Record](file:///c:/Projects/kinergy-platform/docs/architecture/sale-source-database-migration-decision.md) and migration script [`20260930000000_add_sale_source_correlation_indexes`](file:///c:/Projects/kinergy-platform/prisma/migrations/20260930000000_add_sale_source_correlation_indexes/migration.sql).

### 4.19 Specification 19: API Representation

In the API transport layer:

- **Input DTO (`SaleSourceInputDto`)**:
  ```typescript
  export class SaleSourceInputDto {
    @ApiProperty({ enum: SaleSourceType, example: 'FOOD' })
    @IsEnum(SaleSourceType)
    type!: SaleSourceType;

    @ApiProperty({ example: 'inv_item_987' })
    @IsString()
    @IsNotEmpty()
    referenceId!: string;

    @ApiPropertyOptional({ example: 'ORD-2026-0042' })
    @IsString()
    @IsOptional()
    referenceCode?: string;
  }
  ```
- **Output DTO (`SaleResponseDto` & `SaleDTO`)**:
  Both root `SaleDTO` and `SaleItemDTO` expose the structured `source: SaleSourceDTO` projection so client applications can trace origin information directly.

### 4.20 Specification 20: Future Extensibility Strategy

When a new facility offering is introduced in the future (e.g. `PHYSIOTHERAPY_EVALUATION` or `PARKING_PASS`):

1. Add the new literal to `SaleSourceType` enum.
2. Sales domain code requires **zero schema mutations, zero class additions, and zero table additions**.
3. The upstream bounded context builds its own operational aggregate; application orchestration maps the new type to `SaleSource`.

---

## 5. Consequences

### Positive

- **Guaranteed Domain Purity**: The `Sale` aggregate remains 100% focused on commercial agreements and financial invariants.
- **Zero Polymorphic Bloat**: Completely prevents class explosions (`FoodSale`, `GymSale`, etc.).
- **Bounded Context Autonomy**: Deleting, archiving, or refactoring upstream entities never breaks sales history or financial audits.
- **Unified Checkout Experience**: Front desk staff can checkout a kinesiology session, a gym membership, a smoothie, and a salad in a single, atomic Sale transaction.

### Negative / Trade-Offs

- **Absence of Relational Foreign Keys**: Because `source_id` is not a database foreign key, relational database tools cannot automatically navigate joins from `sales` to `treatment_sessions`. Cross-context queries must be resolved at the application/API layer. This is a deliberate, necessary DDD trade-off.

---

## 6. Verification and Acceptance Criteria

1. `SaleSource` Value Object created and unit tested with immutability, equality, and validation tests.
2. Supported types verified: `KINESIOLOGY_SESSION`, `GYM_MEMBERSHIP`, `FOOD`, `DRINK`, `ROOM_RENTAL`.
3. `Sale` aggregate root stores `SaleSource` and enforces non-null origin.
4. `CreateSaleHandler` idempotently recognizes retry transactions and prevents duplicate billing on single-billing entities.
5. All workspace quality gates (`format`, `lint`, `typecheck`, `test`, `build`) pass cleanly without circular dependency errors.
