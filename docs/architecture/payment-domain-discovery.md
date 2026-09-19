# Phase 7: Sales & Payments — Milestone 7.5: Payment Domain Architectural Discovery & Specification Proposal

- **Document**: `docs/architecture/payment-domain-discovery.md`
- **Milestone**: 7.5 (Payment Domain Discovery)
- **Status**: **Architectural Discovery Complete — Approved for Implementation Planning**
- **Role**: Senior Domain Architect & Payments Systems Engineer
- **Date**: 2026-09-19
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
- **Related Documentation**:
  - [`docs/architecture/sale-totals-and-money-rules.md`](sale-totals-and-money-rules.md)
  - [`docs/domain/sale-totals-implementation.md`](../domain/sale-totals-implementation.md)
  - [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
  - [`docs/domain/sales-payments.md`](../domain/sales-payments.md)

---

## 1. Executive Summary & Context

Milestone 7.4 established the platform's deterministic monetary engine, non-negative invariants, and canonical `Money` Value Object. A `Sale` models the commercial purchase agreement between a customer and Kinergy, calculating and locking:

$$\text{subtotal} = \sum (\text{item}.\text{quantity} \times \text{item}.\text{unitPrice})$$
$$\text{discountTotal} = \sum (\text{valid line discounts})$$
$$\text{total} = \text{subtotal} - \text{discountTotal}$$

**Milestone 7.5 introduces the Payment Domain**: modeling the financial tenders actually collected toward settling a `Sale`.

In accordance with the senior architect mandate, **this milestone step does NOT implement production code yet**. It performs an exhaustive discovery of existing patterns, maps dependency directions, specifies the autonomous `Payment` aggregate boundary, resolves the 10 key architectural questions, defines integration with Phase 1 IAM and Milestone 7.4 `Money`, and delivers the architectural foundation for subsequent implementation.

### Core Domain Distinction: Order vs. Tender

```text
┌────────────────────────────────────────┐       ┌────────────────────────────────────────┐
│             SALE AGGREGATE             │       │           PAYMENT AGGREGATE            │
│          (Commercial Contract)         │       │            (Financial Tender)          │
├────────────────────────────────────────┤       ├────────────────────────────────────────┤
│ - What was purchased (SaleItems)       │       │ - How much was collected (Money)       │
│ - Price snapshots & discounts          │       │ - Payment method (CASH, QR)            │
│ - Commercial status (DRAFT, PENDING,   │  1:N  │ - Settlement status (PENDING, SETTLED, │
│   PARTIALLY_PAID, PAID, COMPLETED)     │◄──────│   FAILED, CANCELLED)                   │
│ - Subtotal, discountTotal, total       │ saleId│ - Cashier attribution & references     │
│ - Reconstitution integrity validation  │       │ - Write-once financial immutability    │
└────────────────────────────────────────┘       └────────────────────────────────────────┘
```

---

## 2. Relevant Existing Files Catalog

### 2.1 Sales Domain Model (`packages/core/src/sales/domain/`)

- `sale.aggregate.ts`: The `Sale` aggregate root. Governs cart line items, recalculates deterministic totals, and enforces lifecycle transitions (`markPartiallyPaid()`, `markPaid()`, `markCompleted()`, `markRefunded()`, `cancel()`).
- `entities/sale-item.entity.ts`: Internal child entity owned exclusively by `Sale`. Holds historical price and discount snapshots.
- `value-objects/money.vo.ts`: Canonical monetary Value Object with integer minor-unit arithmetic, `Number.EPSILON` Commercial Half-Up rounding, and immutable encapsulation.
- `value-objects/sale-id.vo.ts`: Strongly typed UUID identity for `Sale`.
- `value-objects/discount.vo.ts`: Item-level discount Value Object (`FIXED` or `PERCENTAGE`).
- `enums/sale-status.enum.ts`: `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`.

### 2.2 Application Layer (`packages/core/src/sales/application/`)

- `handlers/create-sale.handler.ts`, `add-sale-item.handler.ts`, `finalize-sale.handler.ts`: Command handlers delegating business logic strictly to domain aggregates.
- `queries/get-sale-by-id.handler.ts`: Query handler fetching sales with line items.
- `mappers/money.mapper.ts`: Pure application mapper formatting `Money` into `{ amount, currency, formatted, cents }`.
- `ports/sales-event-publisher.port.ts`: Outbox / event emission abstraction.

### 2.3 Persistence & Infrastructure (`packages/core/src/sales/infrastructure/`)

- `persistence/prisma/repositories/prisma-sale.repository.ts`: Implements `SaleRepositoryInterface`. Persists `Sale` and `SaleItem` with optimistic concurrency control (`version`).
- `persistence/prisma/mappers/prisma-sale.mapper.ts` & `prisma-sale-item.mapper.ts`: Hexagonal mappers converting between domain `Sale`/`SaleItem` and Prisma entities.
- `persistence/prisma/mappers/prisma-money.mapper.ts`: Pure boundary mapper converting `Money` to `Prisma.Decimal` and PostgreSQL `@db.Decimal(12, 2)` without leaking Prisma into domain code.
- `prisma/schema.prisma`: Defines `model Sale` and `model SaleItem`. (Note: `model Payment` is not yet defined in schema).

### 2.4 Presentation & API Layer (`apps/api/src/sales/`)

- `controllers/sales.controller.ts`: REST controller under `/api/v1/sales`. Enforces `@UseGuards(AuthenticationGuard, AuthorizationGuard)` and `@Permissions('sales.create')`.
- `dto/money-response.dto.ts`: OpenAPI-decorated DTO exposing `{ amount, currency, formatted, cents }`.
- `dto/sale-response.dto.ts` & `sale-item-response.dto.ts`: DTOs exposing structured monetary values alongside flat read projections.

### 2.5 Automated Test Safety Net

- `packages/core/src/sales/domain/__tests__/monetary-precision-safety-net.spec.ts`: 19 precision mathematical proofs (IEEE-754 pitfall elimination, Half-Up rounding, 1,000-iteration determinism).
- `packages/core/src/sales/__tests__/sales-monetary-anti-patterns.spec.ts`: 4 static AST tests enforcing domain purity and absence of float conversions.
- `packages/core/src/sales/infrastructure/persistence/prisma/__tests__/prisma-money-persistence-roundtrip.spec.ts`: 14 round-trip persistence tests.
- `apps/api/src/sales/__tests__/sales-controller-monetary-serialization.spec.ts`: 10 API serialization tests.

---

## 3. Existing Architectural Patterns Discovered

1. **Hexagonal Clean Architecture & Boundary Isolation**:
   - `domain/` contains zero framework dependencies (`@nestjs/*`, `@prisma/client`, HTTP decorators).
   - Infrastructure depends on domain; domain never depends on infrastructure.
2. **Autonomous Aggregate Roots Linked by Scalar Identity**:
   - Aggregates do not embed foreign aggregate root objects in memory.
   - Reference by identifier: `Sale` references `ClientId` and `SourceReference` as scalar identifiers; `Payment` will reference `saleId: SaleId`.
3. **Progressive Immutability Lifecycle**:
   - Entities permit mutations only in draft states (`assertDraftState()`).
   - Finalization permanently locks commercial terms.
   - Settled financial records are permanently immutable (`Object.freeze`, update blocks).
4. **Deterministic Minor-Unit Arithmetic (ADR-0108 & ADR-0114)**:
   - All financial operations execute in integer minor units (cents).
   - Binary floating-point arithmetic is banned.
   - Epsilon-guarded Commercial Half-Up rounding applied at exact boundaries.
5. **Decoupled Triad Pattern (ADR-0109)**:
   - Business method classification (`PaymentMethod`) $\neq$ Lifecycle state (`PaymentStatus`) $\neq$ External gateway state (`reference`).

---

## 4. Recommended Payment Module Boundary & Dependency Direction

Within the monorepo architecture, `Payment` belongs directly to the **Sales & Payments Bounded Context** (`packages/core/src/sales/` and `apps/api/src/sales/`):

```
packages/core/src/sales/
├── domain/
│   ├── payment.aggregate.ts          ◄── Autonomous Payment Aggregate Root
│   ├── value-objects/
│   │   ├── payment-id.vo.ts          ◄── Strongly typed PaymentId Value Object
│   │   └── money.vo.ts               ◄── REUSED from Milestone 7.4 (Zero duplication)
│   ├── enums/
│   │   ├── payment-method.enum.ts    ◄── CASH, QR
│   │   └── payment-status.enum.ts    ◄── PENDING, SETTLED, FAILED, CANCELLED
│   ├── events/
│   │   ├── payment-created.event.ts
│   │   └── payment-settled.event.ts
│   └── exceptions/
│       ├── invalid-payment.exception.ts
│       └── payment-already-settled.exception.ts
├── application/
│   ├── commands/
│   │   ├── record-payment.command.ts
│   │   └── cancel-payment.command.ts
│   ├── handlers/
│   │   ├── record-payment.handler.ts
│   │   └── get-payments-by-sale-id.handler.ts
│   └── ports/
│       └── payment-repository.port.ts ◄── Independent port interface
└── infrastructure/
    └── persistence/prisma/
        ├── mappers/
        │   └── prisma-payment.mapper.ts
        └── repositories/
            └── prisma-payment.repository.ts
```

### Dependency Direction Law

```text
Presentation Layer (apps/api/src/sales/controllers/payments.controller.ts)
    │
    ▼
Application Layer (packages/core/src/sales/application/handlers/record-payment.handler.ts)
    │
    ▼
Domain Layer (packages/core/src/sales/domain/payment.aggregate.ts)
    ▲
    │
Infrastructure Layer (packages/core/src/sales/infrastructure/persistence/prisma/)
```

- The pure domain layer has **zero dependencies** on Prisma, NestJS, or HTTP packages.
- `PaymentRepositoryInterface` is declared in application/domain ports; implemented in infrastructure.

---

## 5. Answers to the 10 Key Architectural Questions

### 1. Is Payment its own bounded domain/module?

**Yes.** Within the `Sales & Payments` bounded context, `Payment` is an autonomous **Aggregate Root**. It is not an entity inside `Sale`. In NestJS, it is integrated within `SalesModule` with dedicated controller routing (`/api/v1/sales/:saleId/payments` and `/api/v1/payments/:id`).

### 2. Does Payment reference Sale by domain identifier only?

**Yes.** `Payment` encapsulates `saleId: SaleId`. It maintains an explicit, unconstrained scalar identity relationship without holding the `Sale` aggregate in memory.

### 3. Should Payment contain a Sale domain object?

**No.** Storing a `Sale` aggregate instance inside `Payment` violates DDD aggregate boundary rules, introduces circular memory references, bloats repository queries, and creates synchronization hazards.

### 4. Should Sale contain Payment objects?

**No.** `Sale` models the commercial purchase contract and item catalog snapshots. Storing `Payment` collections inside `Sale` would:

- Force loading all historical payment transactions during cart edits.
- Violate the write-once immutability of settled payments.
- Break multi-tender separation.  
  `Sale` tracks only its commercial state (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`) orchestrated by application use cases when payments settle.

### 5. Should Payment repository depend on Sale repository?

**No.** `PaymentRepositoryInterface` and `SaleRepositoryInterface` are completely independent port abstractions. Neither repository interface nor their Prisma implementations depend on or call each other.

### 6. Where should Sale existence validation occur?

**In the Application Layer (`RecordPaymentHandler`)**.  
The command handler receives `saleId`, queries `saleRepository.findById(saleId)`, asserts existence (throwing `NotFoundException` if missing), verifies that the sale is in a payable state (`PENDING_PAYMENT` or `PARTIALLY_PAID`), and asserts currency homogeneity.

### 7. Where should Payment amount validation occur?

**At two distinct architectural tiers**:

1. **Domain Level (`Payment` Aggregate & `Money` VO)**: Amount must be $> \$0.00$, non-negative, finite, scale 2, with valid ISO-4217 currency.
2. **Application Level (`RecordPaymentHandler`)**: Validates that payment currency matches `sale.currency` and that electronic payment amounts (`QR`) do not exceed `sale.balanceRemaining`. For `CASH` tenders with change, the handler caps the recorded payment amount at `balanceRemaining` while cashier drawer accounting records tendered vs. change.

### 8. Where should Payment status transitions occur?

**Exclusively inside the `Payment` Aggregate Root**.  
Domain methods (`payment.settle()`, `payment.fail()`, `payment.cancel()`) enforce the state machine. Transitions from `SETTLED` are strictly blocked, guaranteeing permanent financial immutability.

### 9. Where should payment method validation occur?

1. **Domain Level**: `PaymentMethod` enum (`CASH`, `QR`). `Payment.create()` asserts that the method is supported, throwing `InvalidPaymentMethodException` on unknown values.
2. **API Boundary Level**: In `RecordPaymentRequestDto` via `@IsEnum(PaymentMethod)` to reject invalid methods at the HTTP transport layer with `400 Bad Request`.

### 10. Where should Payment API serialization occur?

**In the API Presentation Layer (`PaymentResponseDto`)**.  
Reuses the canonical `MoneyResponseDto` created in Milestone 7.4 (`{ amount, currency, formatted, cents }`), guaranteeing lossless serialization without float precision artifacts.

---

## 6. Sale ↔ Payment Relationship & Balance Model

### Cardinality: 1-to-Many

A `Sale` can be settled by zero, one, or multiple `Payment` transactions:

- **Single Tender**: 1 payment covering 100% of the sale total.
- **Split Tender**: e.g., $40.00 Cash (`Payment #1`) + $60.00 QR (`Payment #2`) settling a $100.00 order.
- **Partial Deposit**: e.g., $30.00 deposit placed on a $150.00 therapy package.

### Deterministic Balance Settlement Formula

$$\text{totalPaid} = \sum_{p \in \text{SettledPayments}} p.\text{amount}$$
$$\text{balanceRemaining} = \text{Sale.total} - \text{totalPaid}$$

```text
Sale Status Transition Rules:
- If totalPaid == 0:              Sale remains PENDING_PAYMENT
- If 0 < totalPaid < Sale.total:  Sale transitions to PARTIALLY_PAID
- If totalPaid == Sale.total:     Sale transitions to PAID
```

---

## 7. Payment Lifecycle & State Machine Candidates

In accordance with ADR-0109, the payment lifecycle governs individual monetary tender transactions:

```
┌────────────────────────────────────────────────────────┐
│               PHASE 7.5 PAYMENT STATE MACHINE          │
│                                                        │
│                    ┌─────────────┐                     │
│                    │  [Initial]  │                     │
│                    └──────┬──────┘                     │
│                           │ Payment.create()           │
│                           ▼                            │
│                    ┌─────────────┐                     │
│                    │   PENDING   │                     │
│                    └──┬───┬───┬──┘                     │
│        payment.settle()│   │   │ payment.cancel()       │
│      ┌────────────────┘   │   └────────────────┐       │
│      ▼                    ▼ payment.fail()     ▼       │
│┌───────────┐        ┌───────────┐        ┌───────────┐ │
││  SETTLED  │        │  FAILED   │        │ CANCELLED │ │
│└───────────┘        └───────────┘        └───────────┘ │
│ (Immutable          (Terminal)           (Terminal)    │
│  Financial)                                            │
└────────────────────────────────────────────────────────┘
```

### State Machine Analysis for Initial Methods

- **`CASH` Tender**:
  - Cash is counted and accepted directly by the front-desk cashier.
  - Can be instantiated in `PENDING` and immediately settled via `payment.settle()`, or created directly in `SETTLED` status via factory `Payment.createImmediateCash()`.
- **`QR` Tender**:
  - Dynamic QR code generated for customer scan.
  - Instantiated in `PENDING` status.
  - Transitions to `SETTLED` upon webhook confirmation, or `FAILED` on timeout, or `CANCELLED` if the cashier aborts the scan.
- **Deferred States (`AUTHORIZED`)**:
  - `AUTHORIZED` represents 2-step credit card holds (pre-authorization).
  - Because `CARD` is deferred to future milestones, `AUTHORIZED` is not active in Milestone 7.5. The state machine remains minimal, deterministic, and free of dead logic.

---

## 8. Payment Method Representation

The initial domain enumeration is strictly constrained to the required tender types:

```ts
export enum PaymentMethod {
  CASH = 'CASH',
  QR = 'QR',
}
```

- **`CASH`**: Physical currency collected in register drawer.
- **`QR`**: Static or dynamic QR code transfer (e.g. PIX, instant wallet scan).
- **Future Methods (`CARD`, `TRANSFER`, `ONLINE`)**: Documented in ADR-0109 for future compatibility, but **NOT** included in the active TypeScript enum for Milestone 7.5.

---

## 9. Monetary Representation (Milestone 7.4 Reuse)

`Payment.amount` will strictly reuse the canonical `Money` Value Object from Milestone 7.4:

- **Zero Duplication**: Import directly from `packages/core/src/sales/domain/value-objects/money.vo.ts`.
- **Integer Cents**: Calculations execute in minor units (`cents`).
- **Commercial Half-Up**: Rounding applies `Number.EPSILON` guard.
- **Strict Prohibition**: Native float operators (`+`, `-`, `*`), `parseFloat()`, `Number()`, and `.toNumber()` are strictly prohibited.

---

## 10. Persistence Strategy & Relational Schema Proposal

To persist `Payment` records in PostgreSQL with exact precision, `prisma/schema.prisma` will be extended in Milestone 7.5:

```prisma
enum PaymentStatus {
  PENDING
  SETTLED
  FAILED
  CANCELLED
}

enum PaymentMethod {
  CASH
  QR
}

model Payment {
  id          String        @id @default(uuid())
  tenantId    String?       @map("tenant_id")
  saleId      String        @map("sale_id")
  amount      Decimal       @db.Decimal(12, 2)
  currency    String        @default("USD") @db.VarChar(3)
  method      PaymentMethod
  status      PaymentStatus @default(PENDING)
  reference   String?       @db.VarChar(255)
  cashierId   String?       @map("cashier_id")
  paidAt      DateTime?     @map("paid_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  sale        Sale          @relation(fields: [saleId], references: [id], onDelete: Restrict)

  @@index([saleId])
  @@index([tenantId])
  @@index([status])
  @@index([createdAt(sort: Desc)])
  @@map("payments")
}
```

### Relational Invariants

- `onDelete: Restrict`: A `Sale` with associated payments can **never** be hard-deleted.
- `@db.Decimal(12, 2)`: Guarantees fixed-point decimal storage matching `Sale.totalAmount`.
- `paidAt`: Recorded upon transition to `SETTLED`.

---

## 11. Authorization & IAM Integration

Reusing Phase 1 IAM and ADR-0111 without creating secondary authorization frameworks:

| Operation                  | HTTP Endpoint                         | Required Permission | Allowed Roles                                       |
| :------------------------- | :------------------------------------ | :------------------ | :-------------------------------------------------- |
| **Record Payment**         | `POST /api/v1/sales/:saleId/payments` | `payments.create`   | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` |
| **List Payments for Sale** | `GET /api/v1/sales/:saleId/payments`  | `payments.read`     | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` |
| **Get Payment by ID**      | `GET /api/v1/payments/:id`            | `payments.read`     | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` |
| **Cancel Payment**         | `POST /api/v1/payments/:id/cancel`    | `payments.create`   | `Owner`, `Manager`, `Receptionist`                  |

- Multi-tenant scoping: The authenticated user's `tenantId` is injected into command handlers and verified against `payment.tenantId` and `sale.tenantId`.
- Backward compatibility: `billing.write` automatically grants `payments.create`; `billing.read` automatically grants `payments.read`.

---

## 12. API Integration Points

### 12.1 Record Payment (`POST /api/v1/sales/:saleId/payments`)

**Request Payload:**

```json
{
  "amount": {
    "amount": 49.99,
    "currency": "USD"
  },
  "method": "CASH",
  "reference": "Drawer #1 - Receipt 1042"
}
```

**Response Payload (`201 Created`):**

```json
{
  "id": "pay_01j9876543210abcdef",
  "saleId": "sale_01j9876543210abcdef",
  "method": "CASH",
  "status": "SETTLED",
  "amount": {
    "amount": 49.99,
    "currency": "USD",
    "formatted": "49.99",
    "cents": 4999
  },
  "reference": "Drawer #1 - Receipt 1042",
  "paidAt": "2026-09-19T12:00:00.000Z",
  "createdAt": "2026-09-19T12:00:00.000Z"
}
```

---

## 13. Required Test Suites Plan

1. **`payment.aggregate.spec.ts` (Domain Unit Tests)**:
   - Creation of Cash and QR payments.
   - Validation of positive non-zero amounts.
   - Deterministic transitions (`PENDING -> SETTLED`, `PENDING -> FAILED`, `PENDING -> CANCELLED`).
   - Immutability of settled payments (rejects mutations after `SETTLED`).
   - Rejection of invalid status transitions.
2. **`record-payment.handler.spec.ts` (Application Tests)**:
   - Successful tender recording and `Sale` status transition (`PENDING_PAYMENT -> PARTIALLY_PAID -> PAID`).
   - Rejection when `Sale` does not exist (`404`).
   - Rejection when `Sale` is not finalized (`DRAFT`) or already closed (`PAID`/`COMPLETED`).
   - Currency mismatch rejection.
   - QR overpayment rejection exceeding `balanceRemaining`.
   - Multi-tender split payment orchestration.
3. **`prisma-payment-persistence.spec.ts` (Persistence Tests)**:
   - Exact round-trip preservation with PostgreSQL `Decimal(12, 2)`.
   - Isolation of `Prisma.Decimal` to mapper layer.
4. **`payments-controller.spec.ts` (API Integration Tests)**:
   - Structured `MoneyResponseDto` serialization.
   - `@Permissions('payments.create')` enforcement.
   - Validation failure on negative amounts or invalid methods.

---

## 14. Documentation & ADR Changes Required

1. **New ADR**: Formulate [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md) formalizing the autonomous Payment aggregate, method constraints (`CASH`, `QR`), and balance reconciliation.
2. **ADR Index**: Update `docs/adr/README.md` and `docs/README.md`.
3. **Business Rules**: Update `docs/business-rules/sales-payments.md` promoting `PAY-01` through `PAY-08` from roadmap to implemented status.
4. **API Guide**: Update `docs/api/README.md` adding the `/api/v1/sales/:saleId/payments` endpoint catalog.

---

## 15. Unresolved Decisions & Architectural Trade-offs

1. **Single Combined Controller vs. Separate `PaymentsController`**:
   - _Option A_: Add payment endpoints directly to `SalesController` (`POST /api/v1/sales/:id/payments`).
   - _Option B_: Create a dedicated `PaymentsController` (`apps/api/src/sales/controllers/payments.controller.ts`) mounted at `/api/v1/sales/:saleId/payments` and `/api/v1/payments`.
   - _Recommendation_: **Option B** — maintains Single Responsibility Principle and keeps `SalesController` focused on order cart management.
2. **Immediate Cash Settlement vs. Explicit Transition**:
   - _Option A_: Cash payments always start in `PENDING` and require a separate `settle()` call.
   - _Option B_: `RecordPaymentHandler` immediately settles `CASH` payments upon creation, emitting `PaymentSettledEvent` synchronously.
   - _Recommendation_: **Option B** — physical cash received by a cashier is already in hand; requiring two HTTP calls introduces unnecessary network latency and orphaned pending cash tenders.
3. **Sale Aggregate Event-Driven vs. Direct Orchestration**:
   - _Option A_: `RecordPaymentHandler` updates `Sale` state via direct repository load and `sale.markPaid()`.
   - _Option B_: `Sale` subscribes to `PaymentSettledEvent` via domain event bus.
   - _Recommendation_: **Option A** within the same transaction unit of work for Milestone 7.5, ensuring atomic balance updates and immediate HTTP feedback, with event emission for read projections and telemetry.
