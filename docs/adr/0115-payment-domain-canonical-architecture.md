# 0115. Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling

- **Status**: Accepted
- **Date**: 2026-09-19
- **Deciders**: Principal Financial Domain Architect, Principal Software Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.5: Payment Domain). Following Phase 7.4 (Deterministic Sale Totals and Monetary Rules, ADR-0114), the platform requires the establishment of the canonical Payment domain architecture. This ADR establishes the structural boundary, lifecycle, aggregate decoupling, monetary reuse, and security invariants for Payment before broad implementation begins.

---

## 1. Context and Problem Statement

In POS, billing, and wellness practice management systems, a critical architecture defect is the conflation of the **commercial transaction** (the order/agreement) and the **financial settlement** (the monetary tender).

In Kinergy:

- A **Sale** (Phases 7.1–7.4) represents the commercial contract: what line items were purchased, what discounts were applied, and what total debt was established ($subtotal - discountTotal = total$).
- A **Payment** (Phase 7.5) represents money actually received from a customer toward satisfying a Sale's commercial debt.

If `Payment` is modeled as an embedded field or child collection inside the `Sale` aggregate, or if `Payment` duplicates commercial calculation logic:

1. **Commercial Bloat & Concurrency Contention**: Updating or recording a payment locks the entire Sale aggregate, causing high write-contention and optimistic concurrency failures during multi-tender or async payment processing.
2. **Logic Duplication**: If `Payment` recalculates subtotals or discounts, business logic fragments, risking divergent financial totals.
3. **Loss of Multi-Tender & Split Settlement**: Customers cannot split transactions across multiple payment instruments (e.g., partial cash + QR balance), nor can receptionists accept deposits for multi-session kinesiology treatments while deferring remaining balances.
4. **Audit Trail Compromise**: Modifying a payment directly on a sale record risks destructive updates, obscuring cash register reconciliations and bank settlement batches.

We must formally document the canonical architecture for `Payment` within the Kinergy platform, establishing its ownership, aggregate boundaries, reference coupling, lifecycle, monetary reuse, immutability guarantees, and extensibility.

---

## 2. Decision Drivers

- **Zero Calculation Duplication**: `Payment` must never calculate subtotals, item discounts, or commercial taxes. `Sale` is the sole source of truth for commercial totals.
- **Strict Aggregate Decoupling**: Independent lifecycles for `Sale` and `Payment`. Cross-aggregate coupling must be restricted to scalar domain identifiers (`Payment.saleId`).
- **Reuse of Canonical Monetary Policy**: `Payment.amount` must strictly reuse the `Money` value object established in Milestone 7.4 (ADR-0114). No second monetary type or raw floating-point arithmetic is permitted.
- **Multi-Tender & Incremental Settlement**: 1-to-many relationship ($1 \text{ Sale} \to N \text{ Payments}$) allowing split payments, partial deposits, and exact-balance settlement.
- **Append-Only Progressive Immutability**: Settled financial transactions are write-once records. Once settled, payments cannot be casually mutated or deleted. Corrections require autonomous compensating transactions (refunds).
- **Pragmatic Extensibility**: Support initial payment methods (`CASH`, `QR`) with clean architectural mechanisms to introduce future methods (`CARD`, `TRANSFER`, `ONLINE`) without altering core domain structures, while strictly avoiding speculative placeholder classes.
- **Enterprise Security & Multi-Tenancy**: All operations must enforce tenant isolation and integrate seamlessly with Phase 1 RBAC (`payments.create`, `payments.read`, `payments.manage`).

---

## 3. Considered Alternatives

### Alternative 1: Payment Embedded Directly in Sale (1:1 Fields)

- `Sale` contains embedded columns (`paymentMethod`, `paymentAmount`, `paymentStatus`, `paidAt`).
- **Why Rejected**:
  - Eliminates split payments (e.g., $50 cash + $50 QR).
  - Eliminates partial deposits and deferred settlements.
  - Conflates commercial order state with monetary settlement state.
  - Destroys financial auditability when adjustments occur.

### Alternative 2: Payment as an Internal Child Entity of the Sale Aggregate (`Sale.payments: Payment[]`)

- `Payment` is an entity inside the `Sale` boundary; the `Sale` aggregate root controls all payment additions and persists them atomically through `SaleRepository`.
- **Why Rejected**:
  - **Memory & Aggregate Bloat**: Loading a `Sale` unnecessarily inflates the in-memory object graph with payment history, transaction references, and gateway logs.
  - **Unnecessary Transactional Lock Contention**: Recording an asynchronous webhook payment or POS tender forces OCC version increments on the entire `Sale` aggregate, blocking concurrent reads or order reviews.
  - **Repository Coupling**: Forces `SaleRepository` to manage complex relational joins and cascading persistence for payment tenders, violating the Single Responsibility Principle.

### Alternative 3: Generic Class Hierarchy with Subclassed Payment Methods

- Creating abstract `Payment` base classes with subclasses `CashPayment`, `QrPayment`, `CardPayment`, etc.
- **Why Rejected**:
  - Over-engineered for current business requirements.
  - Introduces ORM single-table/joined inheritance mapping complexities in Prisma.
  - The differences between payment methods at the domain level are primarily validation rules and reference metadata, not distinct domain lifecycles.

### Alternative 4: Database-Driven Dynamic Payment Methods

- Storing payment methods in a database table (`payment_methods`) configured dynamically at runtime.
- **Why Rejected**:
  - Payment settlement involves hardcoded protocol invariants, validation logic, and regulatory workflows. Dynamic methods undermine compile-time type safety and domain determinism.

### Alternative 5 (Selected): Autonomous `Payment` Aggregate Root Linked by Scalar Identifier (`SaleId`)

- `Payment` is an autonomous Aggregate Root within the Sales bounded context (`packages/core/src/sales/domain/payment.aggregate.ts`).
- `Payment` references `Sale` strictly by its scalar value object `Payment.saleId: SaleId`.
- Reuses canonical `Money` value object for `amount`.
- Employs an enum-based method model (`PaymentMethod.CASH`, `PaymentMethod.QR`).
- `Sale` does not contain `Payment` entity instances; payment history is retrieved via `PaymentRepositoryInterface.findBySaleId()`.
- The application layer (`RecordPaymentHandler`) orchestrates cross-aggregate operations, checking Sale balances and updating Sale settlement status.

---

## 4. Decision Outcome

Chosen Option: **Alternative 5: Autonomous `Payment` Aggregate Root Linked by Scalar Identifier (`SaleId`)**.

---

## 5. Architectural Specification

### 5.1 Payment Domain Ownership

`Payment` belongs to the **Sales & Payments Bounded Context** (`packages/core/src/sales/`).

- **Domain Layer**: `packages/core/src/sales/domain/payment.aggregate.ts`
- **Application Layer**: `packages/core/src/sales/application/handlers/record-payment.handler.ts`
- **Infrastructure Layer**: `packages/core/src/sales/infrastructure/persistence/prisma/repositories/prisma-payment.repository.ts`
- **Presentation Layer**: `apps/api/src/sales/controllers/payments.controller.ts` (routed under `/api/v1/sales/:saleId/payments` and `/api/v1/payments/:id`)

Within this bounded context, `Sale` and `Payment` are co-equal aggregate roots collaborating via application services and domain identifiers.

### 5.2 Sale $\leftrightarrow$ Payment Relationship

The relationship between `Sale` and `Payment` is unidirectional and scalar-based:

```text
Sale (Aggregate Root)
  ▲
  │ (References by SaleId only)
  │
Payment (Aggregate Root)
├── id: PaymentId
├── tenantId: string
├── saleId: SaleId
├── method: PaymentMethod
├── amount: Money
├── status: PaymentStatus
├── reference: string | null
├── paidAt: Date | null
└── createdAt: Date
```

#### Rules of Association:

1. **Identifier Coupling Only**: `Payment` contains `saleId: SaleId`. It must **never** contain a `Sale` aggregate object or instance reference.
2. **No Embedded Payment Collections in Sale**: The `Sale` aggregate root must **never** hold an array or collection of `Payment` entity instances. `Sale` tracks only its commercial settlement status (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`).
3. **Repository Independence**: `PaymentRepositoryInterface` and `SaleRepositoryInterface` are isolated domain ports. Neither repository interface depends on or imports the other.
4. **Foreign Key Integrity**: Relational persistence in PostgreSQL enforces foreign key constraints from `payments.sale_id` to `sales.id` with `onDelete: Restrict`, ensuring sales with financial payment records cannot be deleted.

### 5.3 Monetary Representation & Arithmetic Reuse

In accordance with [ADR-0108](0108-money-representation.md) and [ADR-0114](0114-canonical-monetary-policy-and-sale-totals.md):

1. **Exact Reuse of `Money` Value Object**: `Payment.amount` is typed strictly as the canonical `Money` value object (`packages/core/src/sales/domain/value-objects/money.vo.ts`).
2. **Prohibition of Primitives**: Raw JavaScript `number` is strictly prohibited for monetary representation or calculations.
3. **Calculation Scope**:
   - `Payment` is responsible **only** for the tender amount paid toward the sale.
   - `Payment` must **never** calculate or store `subtotal`, `discountTotal`, or tax.
4. **Amount Invariants**:
   - $\text{Payment.amount} > \$0.00$ (must be strictly positive). Zero or negative payment records are invalid.
   - Currency must be explicit (ISO 4217, default `'USD'`).
   - Currency of the payment must strictly match the currency of the associated `Sale`.
5. **Balance Formulation**:
   $$\text{SettledTotal} = \sum_{p \in \text{SettledPayments}} p.\text{amount}$$
   $$\text{BalanceRemaining} = \text{Sale}.\text{total} - \text{SettledTotal}$$
   - When $\text{SettledTotal} = 0$: `Sale.status` is `PENDING_PAYMENT`.
   - When $0 < \text{SettledTotal} < \text{Sale}.\text{total}$: `Sale.status` is `PARTIALLY_PAID`.
   - When $\text{SettledTotal} \ge \text{Sale}.\text{total}$: `Sale.status` is `PAID`.

### 5.4 Payment Method Representation

Initial supported methods are strictly:

```typescript
export enum PaymentMethod {
  CASH = 'CASH',
  QR = 'QR',
}
```

#### Guidelines:

- `CASH`: In-person physical currency transaction tendered at the reception or POS counter.
- `QR`: Dynamic or static QR code payment generated for immediate customer scanning via mobile banking or digital wallet.
- Future payment methods (`CARD`, `TRANSFER`, `ONLINE`) are architecturally recognized but **NOT** defined or implemented in Phase 7.5. No placeholder classes, stubbed methods, or speculative database columns may be added.

### 5.5 Payment Status & Lifecycle Model

The payment domain implements a deterministic, minimal 4-state lifecycle:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT STATE MACHINE                           │
│                                                                        │
│                          ┌─────────────┐                               │
│                          │  [Initial]  │                               │
│                          └──────┬──────┘                               │
│                                 │ initiate()                           │
│                                 ▼                                      │
│                          ┌─────────────┐                               │
│                          │   PENDING   │                               │
│                          └──┬───┬───┬──┘                               │
│                             │   │   │                                  │
│                 settle()    │   │   │  cancel()                        │
│         ┌───────────────────┘   │   └────────────────────┐             │
│         ▼                       ▼ fail()                 ▼             │
│  ┌─────────────┐         ┌─────────────┐          ┌─────────────┐      │
│  │   SETTLED   │         │   FAILED    │          │  CANCELLED  │      │
│  └─────────────┘         └─────────────┘          └─────────────┘      │
│    (Terminal &              (Terminal)               (Terminal)        │
│     Immutable)                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

#### Supported Statuses:

1. `PENDING`: The payment has been initiated but funds have not yet been confirmed (e.g., dynamic QR code presented on screen, waiting for payer confirmation).
2. `SETTLED`: Funds have been definitively collected and verified. Terminal state.
3. `FAILED`: The payment attempt was rejected, timed out, or declined by the provider rail. Terminal state.
4. `CANCELLED`: The payment attempt was aborted or cancelled by the cashier before settlement. Terminal state.

_Note on `AUTHORIZED`_: Pre-authorization holds are deferred until credit card terminal integrations are introduced in future phases.

#### State Transition Matrix:

| From Status | To Status   | Trigger Method               | Invariants & Preconditions                                               |
| ----------- | ----------- | ---------------------------- | ------------------------------------------------------------------------ |
| _Initial_   | `SETTLED`   | `Payment.createSettled(...)` | Direct cash or instant counter payment. `paidAt` set immediately.        |
| _Initial_   | `PENDING`   | `Payment.createPending(...)` | Async tender (e.g. QR awaiting scan). `paidAt = null`.                   |
| `PENDING`   | `SETTLED`   | `payment.settle(paidAt)`     | Funds received. `paidAt` populated. Permanent immutability begins.       |
| `PENDING`   | `FAILED`    | `payment.fail(reason)`       | Rail timeout or decline.                                                 |
| `PENDING`   | `CANCELLED` | `payment.cancel(reason)`     | Operator voids pending prompt.                                           |
| `SETTLED`   | _Any_       | **PROHIBITED**               | **Illegal State Transition**. Settled records are permanently immutable. |
| `FAILED`    | _Any_       | **PROHIBITED**               | Terminal.                                                                |
| `CANCELLED` | _Any_       | **PROHIBITED**               | Terminal.                                                                |

### 5.6 Reference Semantics

The `reference` property is an optional, sanitized string (`string | null`, maximum 100 characters):

- **For QR Payments**: Represents the digital transaction trace identifier, provider correlation key, or QR invoice token returned by the banking gateway.
- **For CASH Payments**: Represents an optional cash drawer audit tag, register receipt sequence, or cashier register identifier (e.g., `REG-01-DRAWER-A`).
- **Semantics**: Reference is an external correlation identifier for audit and reconciliation. It does **not** contain domain business logic.

### 5.7 `paidAt` Semantics

- **Type**: `Date | null`
- **Semantics**: The exact timestamp when monetary value was collected and settled.
- **Rule**:
  - Populated with current UTC timestamp when status is `SETTLED`.
  - Must be `null` for `PENDING`, `FAILED`, and `CANCELLED` states.
  - Once set on a `SETTLED` record, `paidAt` is immutable.

### 5.8 `createdAt` Semantics

- **Type**: `Date`
- **Semantics**: The exact timestamp when the payment record was first created in the system.
- **Rule**: Generated automatically at instantiation and permanently immutable.

### 5.9 Immutability & Financial Audit Integrity

Payments are legal financial audit records. In accordance with [ADR-0109](0109-payment-lifecycle.md) and [ADR-0111](0111-sales-payments-authorization-and-audit.md):

1. **Write-Once Settlement**: Once a `Payment` transitions to `SETTLED`, its fields (`id`, `tenantId`, `saleId`, `amount`, `method`, `reference`, `paidAt`, `createdAt`) are frozen. In-place updates to settled amounts or methods are strictly prohibited.
2. **Compensating Transactions for Adjustments**: Erroneous payments or customer returns must **never** mutate or delete historical `Payment` records. They must be resolved via autonomous `Refund` compensating transactions referencing the original payment.
3. **No Hard Deletion**: `Payment` records must never be deleted from the database.

### 5.10 Extensibility Architecture for Future Payment Methods

To introduce future methods (`CARD`, `TRANSFER`, `ONLINE`) without architectural disruption:

1. **Enum Expansion**: Add the new variant to the domain `PaymentMethod` enum (e.g., `PaymentMethod.CARD = 'CARD'`).
2. **Method Strategy Pattern in Application Layer**: Introduce gateway-specific strategy implementations (e.g., `StripeCardProcessor`, `BankTransferVerifier`) implementing a common `PaymentGatewayProcessor` port.
3. **Zero Impact on Sale or Core Payment**: The core `Payment` aggregate root, its scalar reference to `Sale`, its relational schema, and the `Sale` aggregate remain untouched.

---

## 6. Security, Authorization & Data Integrity

### 6.1 Multi-Tenant Isolation

Every `Payment` entity and relational record carries a non-nullable `tenantId`. All repository operations (`findById`, `findBySaleId`, `save`) must enforce tenant boundary scoping:

```sql
WHERE tenant_id = :tenantId AND sale_id = :saleId
```

Cross-tenant payment queries or tender associations are rejected at the application and database query levels.

### 6.2 Role-Based Access Control (RBAC)

Payment endpoints integrate directly with Phase 1 Identity permissions:

- **`payments.create`** (or `payments.manage`, `billing.write`): Required to record a payment (`POST /api/v1/sales/:saleId/payments`).
- **`payments.read`** (or `payments.manage`, `billing.read`): Required to view payment receipts and history (`GET /api/v1/sales/:saleId/payments`).
- **`payments.refund`** (or `payments.manage`): Reserved for future compensating transactions.

### 6.3 Amount & Balance Integrity

- **Overpayment Guard**: For electronic tender (`QR`), the application handler enforces that `Payment.amount <= BalanceRemaining`.
- **Cash Tender Exception**: If cash overpayment occurs (customer hands a $50 bill for a $45 balance), the system records the exact applied tender amount ($45.00) and presents change due ($5.00) in the presentation layer, preventing balance corruption.

---

## 7. Persistence Strategy (Prisma & PostgreSQL)

The relational schema strictly mirrors domain invariants:

```prisma
enum PaymentMethod {
  CASH
  QR
}

enum PaymentStatus {
  PENDING
  SETTLED
  FAILED
  CANCELLED
}

model Payment {
  id          String        @id @default(uuid())
  tenantId    String        @map("tenant_id")
  saleId      String        @map("sale_id")
  method      PaymentMethod
  amount      Decimal       @db.Decimal(12, 2)
  currency    String        @default("USD") @db.VarChar(3)
  status      PaymentStatus @default(SETTLED)
  reference   String?       @db.VarChar(100)
  paidAt      DateTime?     @map("paid_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")
  version     Int           @default(1)

  sale        Sale          @relation(fields: [saleId], references: [id], onDelete: Restrict)

  @@index([tenantId, saleId])
  @@index([tenantId, status])
  @@index([tenantId, createdAt])
  @@map("payments")
}
```

- **Exact Scale & Precision**: Stored as `Decimal(12, 2)` matching the canonical persistence representation defined in ADR-0114.
- **Referential Protection**: `onDelete: Restrict` prevents accidental deletion of any Sale that has associated payment records.

---

## 8. Testing Implications

The architecture mandates four distinct automated test safety layers:

1. **Domain Aggregate Tests (`payment.aggregate.spec.ts`)**:
   - Validation of positive non-zero `Money` amounts.
   - Initial state construction (`SETTLED` vs `PENDING`).
   - State transition validation (`PENDING` $\to$ `SETTLED`, `FAILED`, `CANCELLED`).
   - Immutable rejection of mutations once `SETTLED`.
2. **Application Handler Tests (`record-payment.handler.spec.ts`)**:
   - Verification of Sale existence and tenant match.
   - Rejection of payments on `PAID` or `CANCELLED` sales.
   - Currency match verification between Payment and Sale.
   - Accurate calculation of `BalanceRemaining` and Sale status transitions (`PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` $\to$ `PAID`).
   - Electronic tender overpayment rejection.
3. **Persistence Round-Trip Tests (`prisma-payment-persistence.spec.ts`)**:
   - Precision preservation between domain `Money` (integer cents) and PostgreSQL `DECIMAL(12, 2)`.
   - Optimistic Concurrency Control (`version`) validation.
4. **API E2E Tests (`payments.e2e.spec.ts`)**:
   - Authorization guard enforcement (`payments.create`, `payments.read`).
   - Tenant isolation verification.
   - Proper serialization of `MoneyResponseDto` without floating-point precision loss.

---

## 9. Migration & Future Extension Considerations

- **Prisma Migration**: A dedicated migration (`add_payments_domain_table`) will create the `PaymentMethod` and `PaymentStatus` enums and the `payments` table. Existing sales remain unaffected with `payments` initialized as empty relations.
- **Future Methods (`CARD`, `TRANSFER`, `ONLINE`)**: Will be incorporated by expanding the `PaymentMethod` enum and adding specific gateway integration ports, without requiring structural schema alterations to existing records.

---

## 10. References

- [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
- [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](0109-payment-lifecycle.md)
- [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](0110-sale-ownership.md)
- [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
- [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
- [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](0114-canonical-monetary-policy-and-sale-totals.md)
- [Payment Domain Architectural Discovery Specification](../architecture/payment-domain-discovery.md)
