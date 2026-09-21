# Phase 7.5: Payment Domain Implementation & Financial Architecture Specification

- **Document**: `docs/domain/payment-domain-implementation.md`
- **Phase**: `7.5 — Payment Domain Implementation, Multi-Tender Settlement & Financial Architecture`
- **Role**: Senior Financial Domain Architect / Lead Platform Engineer
- **Status**: **Authoritative Implemented Domain Specification**
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`, `apps/api/src/sales/`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
- **Related Documentation**:
  - [`docs/architecture/sales-payments.md`](../architecture/sales-payments.md)
  - [`docs/domain/sales-payments.md`](sales-payments.md)
  - [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
  - [`docs/domain/sale-totals-implementation.md`](sale-totals-implementation.md)
  - [`docs/architecture/payment-domain-acceptance.md`](../architecture/payment-domain-acceptance.md)
- **Date**: 2026-09-21

---

## 1. Executive Summary & Foundational Distinction

Milestone 7.5 establishes the complete Payment domain subsystem within the **Sales & Payments** bounded context, enforcing strict separation between commercial debt obligations and financial tender receipts.

### 1.1 The Foundational Domain Law

```text
Sale = commercial transaction / amount owed

Payment = money paid toward a Sale
```

> **Payment does not replace or recalculate Sale totals.**
>
> In the Kinergy platform, commercial checkout calculation and financial settlement are strictly decoupled:
>
> - `Sale` aggregate root owns the commercial contract: cart line items, point-in-time checkout snapshots, item-level discounts, gross subtotal, total discount, and net commercial debt ($subtotal - discountTotal = total$).
> - `Payment` aggregate root models the actual monetary tender collected from a customer toward settling that debt.
> - Under no circumstance does recording, transitioning, or cancelling a `Payment` recalculate or alter `Sale.subtotal`, `Sale.discountTotal`, or `Sale.total`.

---

## 2. Payment Domain Model

The `Payment` aggregate root (`packages/core/src/sales/domain/payment.aggregate.ts`) encapsulates the complete financial tender lifecycle:

```text
Payment
├── id
├── saleId
├── method
├── amount
├── status
├── reference?
├── paidAt?
└── createdAt
```

### 2.1 Detailed Property Specifications

| Property        | Domain Type      | Nullable | Description & Invariants                                                                                           |
| :-------------- | :--------------- | :------: | :----------------------------------------------------------------------------------------------------------------- |
| **`id`**        | `PaymentId`      |    No    | Canonical UUID value object uniquely identifying the payment transaction.                                          |
| **`tenantId`**  | `string`         |    No    | Organization boundary ensuring multi-tenant isolation. Enforced across commands, queries, and repositories.        |
| **`saleId`**    | `SaleId`         |    No    | Scalar identifier referencing the parent `Sale`. The aggregate holds no object or instance reference to `Sale`.    |
| **`method`**    | `PaymentMethod`  |    No    | Tender mechanism (`CASH`, `QR`). Validated against supported domain enumeration.                                   |
| **`amount`**    | `Money`          |    No    | Tender monetary amount ($> 0$). Strictly positive, non-negative, and denominated in parent Sale currency.          |
| **`status`**    | `PaymentStatus`  |    No    | Lifecycle state (`PENDING`, `SETTLED`, `FAILED`, `CANCELLED`).                                                     |
| **`reference`** | `string \| null` |   Yes    | Optional audit tag, drawer identifier, or gateway trace token (max 100 characters; no credit card PANs permitted). |
| **`paidAt`**    | `Date \| null`   |   Yes    | Settlement timestamp (UTC). Set strictly upon entering `SETTLED`. Must remain `null` for unsettled states.         |
| **`createdAt`** | `Date`           |    No    | UTC timestamp when the payment transaction was first initialized. Permanently immutable.                           |
| **`updatedAt`** | `Date`           |    No    | UTC timestamp of the most recent lifecycle mutation.                                                               |
| **`version`**   | `number`         |    No    | Optimistic Concurrency Control (OCC) integer counter ($\ge 1$), incremented on every state transition.             |

---

## 3. Tender Methods

### 3.1 Currently Supported Tender Methods

Phase 7.5 supports two active payment tender methods:

```text
CASH
QR
```

1. **`CASH`**: Physical in-person cash currency tendered at the reception or POS counter. Instantiated directly in `SETTLED` status (`Payment.createSettled()`) with an immediate `paidAt` timestamp.
2. **`QR`**: Dynamic or static QR code presented on a customer-facing display or printed invoice for scanning via mobile banking or digital wallet apps. Instantiated in `PENDING` status (`Payment.createPending()`) with `paidAt = null`.

### 3.2 Architectural Extensibility for Future Methods

The architecture explicitly recognizes and reserves the following future tender methods:

```text
CARD
TRANSFER
ONLINE
```

- **Recognition Without Implementation**: These variants are recognized by domain utility `isFuturePaymentMethod()`. They are intentionally **not** implemented in Phase 7.5 to prevent speculative classes, stubbed database tables, or dead gateway integrations.
- **Runtime Guard**: Attempting to instantiate a payment with a future or unsupported tender method throws typed `InvalidPaymentMethodException` with code `'INVALID_PAYMENT_METHOD'`.
- **Zero-Disruption Evolution**: When future gateway integrations (e.g., Stripe Terminal, bank reconcilers) are delivered, they will implement dedicated gateway ports without modifying `Payment` core aggregate invariants or altering the relational database structure.

---

## 4. Payment Status & State Transition Matrix

The Payment domain implements a deterministic, minimal 4-state lifecycle:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT STATE MACHINE                           │
│                                                                        │
│                          ┌─────────────┐                               │
│                          │  [Initial]  │                               │
│                          └──────┬──────┘                               │
│                                 │ createPending()                      │
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

### 4.1 Implemented State Transition Table

| From Status | To Status   | Trigger Method               | Invariants & Preconditions                                                | Resulting State & Side Effects                                                  |
| :---------- | :---------- | :--------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------ |
| _Initial_   | `SETTLED`   | `Payment.createSettled(...)` | Direct cash or instant counter tender. Amount $> 0$.                      | `status = SETTLED`, `paidAt = clock.now()`. Permanent immutability commences.   |
| _Initial_   | `PENDING`   | `Payment.createPending(...)` | Asynchronous tender (QR code awaiting scan). Amount $> 0$.                | `status = PENDING`, `paidAt = null`.                                            |
| `PENDING`   | `SETTLED`   | `payment.settle(clock?)`     | External rail confirmation. Amount verified.                              | `status = SETTLED`, `paidAt = clock.now()`, `version++`. Permanently immutable. |
| `PENDING`   | `FAILED`    | `payment.fail(reason?)`      | Payment provider timeout, declined payment, or session expiration.        | `status = FAILED`, `version++`. Terminal state.                                 |
| `PENDING`   | `CANCELLED` | `payment.cancel(reason?)`    | Cashier voids or customer abandons pending transaction before settlement. | `status = CANCELLED`, `version++`. Terminal state.                              |
| `SETTLED`   | _Any_       | **PROHIBITED**               | **Illegal State Transition**. Throws `InvalidPaymentTransitionException`. | Record is permanently frozen. No mutations allowed.                             |
| `FAILED`    | _Any_       | **PROHIBITED**               | Terminal state. Throws `InvalidPaymentTransitionException`.               | No transitions permitted.                                                       |
| `CANCELLED` | _Any_       | **PROHIBITED**               | Terminal state. Throws `InvalidPaymentTransitionException`.               | No transitions permitted.                                                       |

> **Note on Non-Existent States**:  
> No `AUTHORIZED`, `INITIATED`, or `REFUNDED` states exist in the Phase 7.5 implementation. Settled payments are never edited into refunds; customer returns are represented as autonomous compensating records in subsequent milestones.

---

## 5. Monetary Policy Reference & Arithmetic Rules

`Payment` strictly adheres to the canonical platform monetary policy established in Phase 7.4 ([ADR-0108](../adr/0108-money-representation.md), [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md)):

1. **Deterministic Minor Units**: All monetary amounts are encapsulated in the canonical `Money` Value Object (`packages/core/src/sales/domain/value-objects/money.vo.ts`). Arithmetic is conducted strictly in 64-bit safe integer minor units (cents):
   $$\text{cents} = \text{round}((\text{amount} + \text{Number.EPSILON}) \times 100)$$
2. **Prohibition of Floating-Point Calculations**: The use of raw IEEE-754 arithmetic (`+`, `-`, `*`), `parseFloat()`, `Number(money)`, and `toFixed()` as calculation engines is banned.
3. **Strictly Positive Payment Amounts**: Every payment amount must satisfy:
   $$\text{Payment.amount} > \$0.00$$
   Zero-dollar payments and negative amounts are deterministically rejected with `InvalidPaymentAmountException`.
4. **Currency Homogeneity**: The currency of `Payment.amount` must match the ISO-4217 currency of the associated `Sale`. Currency mismatches throw `InvalidPaymentCurrencyException`.

---

## 6. Domain-to-Persistence Boundary

To prevent domain model pollution and ensure absolute database isolation, the domain layer maintains a clean boundary to the persistence infrastructure:

```text
Payment.amount
      ↓
Money (in-memory value object, integer cents)
      ↓
PrismaPaymentMapper (infrastructure boundary mapper)
      ↓
Prisma.Decimal (new Prisma.Decimal(payment.amount.amount))
      ↓
PostgreSQL NUMERIC/DECIMAL (@db.Decimal(12, 2))
```

### 6.1 Database Schema (`prisma/schema.prisma`)

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

### 6.2 Relational Invariants

- **Exact Scale & Precision**: Stored as `Decimal(12, 2)` matching the financial standard established in ADR-0114.
- **Referential Protection**: `onDelete: Restrict` prevents deletion of any `Sale` record that has associated `Payment` rows, preserving financial audit ledgers.
- **Optimistic Concurrency Control**: The `version` column is checked on every update (`where: { id, version }`), preventing concurrent write hazards.

---

## 7. Application Layer & CQRS Handlers

The application layer coordinates payment operations through dedicated CQRS command and query handlers:

### 7.1 Command & Query Catalog

| Handler                          | Type    | Purpose & Business Logic                                                                                                                 |
| :------------------------------- | :------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **`RecordPaymentHandler`**       | Command | Verifies Sale exists, asserts payable status, checks overpayment on QR, saves Payment, and updates `Sale` to `PARTIALLY_PAID` or `PAID`. |
| **`GetPaymentByIdHandler`**      | Query   | Resolves single Payment record by ID within tenant boundary.                                                                             |
| **`GetPaymentsBySaleIdHandler`** | Query   | Returns chronological payment history for a given Sale ID within tenant boundary.                                                        |
| **`SettlePaymentHandler`**       | Command | Transitions `PENDING` $\rightarrow$ `SETTLED`, records `paidAt`, and updates parent `Sale` settlement balance.                           |
| **`CancelPaymentHandler`**       | Command | Transitions `PENDING` $\rightarrow$ `CANCELLED` with audit reason. Fails if payment is already settled.                                  |

### 7.2 Multi-Tender Settlement & Balance Calculation

The application layer coordinates multiple payments settling a single sale ($1 \text{ Sale} \to N \text{ Payments}$):

$$\text{SettledTotal} = \sum_{p \in \text{SettledPayments}} p.\text{amount}$$
$$\text{BalanceRemaining} = \max(0, \text{Sale}.\text{total} - \text{SettledTotal})$$

- When $\text{SettledTotal} = 0$: `Sale.status` is `PENDING_PAYMENT`.
- When $0 < \text{SettledTotal} < \text{Sale}.\text{total}$: `Sale.status` is `PARTIALLY_PAID`.
- When $\text{SettledTotal} \ge \text{Sale}.\text{total}$: `Sale.status` is `PAID`.

---

## 8. HTTP REST API Specification

Payments are exposed via `PaymentsController` (`apps/api/src/sales/controllers/payments.controller.ts`) under base route `/api/v1`.

### 8.1 Endpoints

| HTTP Method | Route                            | Permission Required                  | Allowed Roles                                       | Summary                                       | Status Codes                      |
| :---------- | :------------------------------- | :----------------------------------- | :-------------------------------------------------- | :-------------------------------------------- | :-------------------------------- |
| `POST`      | `/api/v1/sales/:saleId/payments` | `payments.create`                    | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Record tender against a finalized sale order  | `201`, `400`, `403`, `404`, `422` |
| `GET`       | `/api/v1/sales/:saleId/payments` | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | List all payments for a commercial sale order | `200`, `401`, `403`, `404`        |
| `GET`       | `/api/v1/payments/:paymentId`    | `payments.read`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Retrieve individual payment record by ID      | `200`, `401`, `403`, `404`        |
| `POST`      | `/api/v1/payments/:id/settle`    | `payments.create`, `payments.manage` | `Owner`, `Manager`, `Receptionist`                  | Confirm settlement of a pending payment       | `200`, `400`, `403`, `404`, `422` |
| `POST`      | `/api/v1/payments/:id/cancel`    | `payments.manage`                    | `Owner`, `Manager`, `Receptionist`                  | Cancel or void an unsettled pending payment   | `200`, `400`, `403`, `404`, `422` |

### 8.2 Request & Response Payloads

#### `RecordPaymentRequestDto`

```json
{
  "method": "CASH",
  "amount": 49.99,
  "currency": "USD",
  "reference": "DRAWER-01-RECEIPT-99"
}
```

- `method`: `CASH` or `QR`.
- `amount`: Strictly positive number with at most 2 decimal places.
- `currency`: Optional ISO-4217 code (default `"USD"`). Must match Sale currency.
- `reference`: Optional string up to 100 characters.

#### `PaymentResponseDto`

```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "saleId": "f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c",
  "method": "CASH",
  "amount": {
    "amount": 49.99,
    "currency": "USD",
    "formatted": "49.99",
    "cents": 4999
  },
  "amountValue": 49.99,
  "status": "SETTLED",
  "reference": "DRAWER-01-RECEIPT-99",
  "paidAt": "2026-09-21T10:00:00.000Z",
  "createdAt": "2026-09-21T10:00:00.000Z",
  "version": 1
}
```

### 8.3 Error Code Mapping

The API filter (`SalesExceptionFilter`) deterministically maps domain exceptions to HTTP status codes:

| Domain Exception                    | HTTP Status Code           | Cause & Business Context                                            |
| :---------------------------------- | :------------------------- | :------------------------------------------------------------------ |
| `PaymentNotFoundException`          | `404 Not Found`            | Requested payment ID does not exist in target tenant.               |
| `SaleNotFoundException`             | `404 Not Found`            | Parent sale ID does not exist in target tenant.                     |
| `InvalidPaymentMethodException`     | `400 Bad Request`          | Unsupported or future tender method requested.                      |
| `InvalidPaymentAmountException`     | `400 Bad Request`          | Payment amount $\le 0$ or non-finite.                               |
| `InvalidPaymentReferenceException`  | `400 Bad Request`          | Reference exceeds 100 characters or contains credit card PAN.       |
| `PaymentUnauthorizedException`      | `403 Forbidden`            | User lacks required permission or attempts cross-tenant mutation.   |
| `PaymentOverpaymentException`       | `422 Unprocessable Entity` | Electronic payment exceeds outstanding Sale balance.                |
| `SaleNotPayableException`           | `422 Unprocessable Entity` | Target Sale is in `DRAFT`, `PAID`, `CANCELLED`, or `REFUNDED`.      |
| `InvalidPaymentTransitionException` | `422 Unprocessable Entity` | Attempted transition from terminal state (e.g. mutating `SETTLED`). |

---

## 9. Security, Authorization & Multi-Tenancy

### 9.1 Tenant & Business Scoping

- Every query and command strictly filters by `tenantId`.
- Cross-tenant payment creation, queries, or lifecycle transitions are blocked by `enforceTenantIsolation()` and repository where-clauses (`where: { id, tenantId }`).

### 9.2 Financial Record Protection (PCI-DSS & Immutability)

- **PCI-DSS Compliance**: The `PaymentReference` value object strictly rejects Primary Account Numbers (PANs; continuous sequences of 13 to 19 digits) to prevent accidental card data storage.
- **Settlement Immutability**: `SETTLED` records can never be updated or deleted. Correcting an erroneous payment requires an autonomous compensating refund.
- **Audit Trails**: Security audit events (`PaymentSettled`, `PaymentFailed`, `PaymentCancelled`) are durably emitted for regulatory compliance.

---

## 10. Traceability Matrix

```text
Requirement
    ↓
ADR
    ↓
Domain Rule
    ↓
Use Case
    ↓
Persistence
    ↓
API
    ↓
Test
```

| Requirement                         | Governing ADR      | Domain Rule        | Application Use Case        | Persistence Mapper    | API Route                   | Governing Test Suite                      |
| :---------------------------------- | :----------------- | :----------------- | :-------------------------- | :-------------------- | :-------------------------- | :---------------------------------------- |
| **Decouple Sale vs Payment**        | ADR-0115           | `PAY-01`           | `RecordPaymentHandler`      | `PrismaPaymentMapper` | `POST /sales/:id/payments`  | `payment.aggregate.spec.ts`               |
| **Strict Positive Amounts**         | ADR-0108, ADR-0114 | `PAY-02`, `MNY-05` | `RecordPaymentCommand`      | Decimal(12, 2)        | `POST /sales/:id/payments`  | `phase-7-5-payment-qa-safety-net.spec.ts` |
| **Supported Methods (CASH, QR)**    | ADR-0115           | `PAY-03`           | `RecordPaymentHandler`      | `PaymentMethod` Enum  | `POST /sales/:id/payments`  | `phase-7-5-payment-qa-safety-net.spec.ts` |
| **Deterministic Lifecycle**         | ADR-0109, ADR-0115 | `PAY-04` – `06`    | `SettlePaymentHandler`      | `PaymentStatus` Enum  | `POST /payments/:id/settle` | `phase-7-5-payment-qa-safety-net.spec.ts` |
| **Settlement Immutability**         | ADR-0109, ADR-0115 | `PAY-07`           | `CancelPaymentHandler`      | `onDelete: Restrict`  | `POST /payments/:id/cancel` | `payment-application.spec.ts`             |
| **Overpayment Guard**               | ADR-0115           | `PAY-08`           | `RecordPaymentHandler`      | —                     | `POST /sales/:id/payments`  | `payment-application.spec.ts`             |
| **Multi-Tenant Scoping**            | ADR-0111           | `ORG-02`           | `checkPaymentAuthorization` | `where: { tenantId }` | All payment routes          | `payments-qa-safety-net.spec.ts`          |
| **Reference Sanitization (No PAN)** | ADR-0111           | `SEC-01`           | `PaymentReference`          | `VarChar(100)`        | DTO validation pipe         | `phase-7-5-payment-qa-safety-net.spec.ts` |
| **Zero Float Drift**                | ADR-0108, ADR-0114 | `MNY-01`           | `Money` VO                  | Decimal(12, 2)        | `MoneyResponseDto`          | `phase-7-5-payment-qa-safety-net.spec.ts` |
