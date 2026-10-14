# ADR-0138: Payment API Architecture, HTTP Contracts & Monetary Settlement Specification

- **Status**: **ACCEPTED**
- **Date**: 2026-10-14
- **Deciders**: Principal API Architect, Financial Systems Design Authority, Application Security Reviewer
- **Context**: Kinergy Platform Phase 7 (Commercial Sales, Payments & Receipts — Milestone 7.15: Payment API). Following the acceptance of Milestone 7.12 (Payment Application Layer, ADR-0133), Milestone 7.13 (Authorization & Security Governance, ADR-0135), and Milestone 7.14 (Sales API, ADR-0136, ADR-0137), this ADR establishes the authoritative RESTful HTTP contract for the Payment API (`/api/v1/payments` and `/api/v1/sales/:saleId/payments`), defining endpoint specifications, request/response DTOs, validation pipelines, monetary serialization, lifecycle transition determinism, multi-aggregate atomic persistence, and multi-tenant security boundaries.
- **Consulted ADRs**:
  - [ADR-0010: Backend Clean Architecture Layering](0010-backend-clean-architecture-layering.md)
  - [ADR-0021: Transactional Consistency & Unit of Work Pattern](0021-transactional-consistency-unit-of-work.md)
  - [ADR-0024: Authentication Guard Architecture](0024-authentication-guard-architecture.md)
  - [ADR-0025: Role and Permission Authorization Framework](0025-role-and-permission-authorization-framework.md)
  - [ADR-0026: Reusable Security Decorators Architecture](0026-reusable-security-decorators-architecture.md)
  - [ADR-0027: Authenticated Request Context Architecture](0027-authenticated-request-context-architecture.md)
  - [ADR-0035: Global Validation and Input Sanitization Pipeline](0035-global-validation-and-input-sanitization-pipeline.md)
  - [ADR-0038: Authentication Hardening and Generic Error Handling](0038-authentication-hardening-and-generic-error-handling.md)
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture and Hardening](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0131: Phase 7 Query Patterns, Index Optimization, and Relation-Loading Strategy](0131-phase-7-query-patterns-index-optimization-and-relation-loading.md)
  - [ADR-0133: Payment Application Layer Architecture, Cross-Aggregate Settlement Orchestration, and Use Case Inventory](0133-payment-application-layer-architecture.md)
  - [ADR-0134: Financial Settlement Validation and Overpayment Invariants](0134-financial-settlement-validation-and-overpayment-invariants.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](0135-sales-payments-receipts-authorization-and-security.md)
  - [ADR-0136: Sales API Architecture, HTTP Contracts & Unified Commercial Ledger Specification](0136-sales-api-architecture-and-contracts.md)
  - [ADR-0137: Sales Performance and Consistency Review](0137-sales-performance-and-consistency-review.md)

---

## 1. Context and Problem Statement

The Sales & Payments Bounded Context separates commercial purchasing agreements ([`Sale`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/sale.aggregate.ts)) from physical/electronic monetary tender transactions ([`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts)).

While Milestone 7.12 delivered the Payment Application Layer use cases and Milestone 7.14 established the Sales HTTP API, Milestone 7.15 must establish the **authoritative, production-grade HTTP REST contract** for Payment operations.

### Key Architectural Mandates & Challenges:

1. **Autonomous Aggregate Decoupling**: A `Payment` couples to a `Sale` exclusively through a scalar `saleId: string`. Neither aggregate holds the other in memory.
2. **Deterministic Settlement Synchronization**: When a payment completes, both `Payment` (transitions to `COMPLETED`) and `Sale` (transitions to `PARTIALLY_PAID` or `PAID`) must be persisted atomically within a single database transaction (`IUnitOfWork`).
3. **Strict Financial Invariants**: Zero floating-point arithmetic. Overpayment is strictly forbidden. Monetary amounts are validated in integer minor cents.
4. **Security & Anti-PAN Sanitization**: Role-based access control enforces Phase 7.13 permissions (`payments.create`, `payments.read`, `payments.manage`). Payment references must actively reject credit card PAN sequences (PCI-DSS compliance).
5. **Route Cleanliness**: Existing routes must be unified and hardened. Ambiguous route aliases and untyped query handlers must be resolved without breaking backward compatibility.

---

## 2. Route Architecture & Canonical URI Taxonomy

All payment operations are mounted under the global platform prefix `/api/v1`.

### 2.1 Canonical Routes

| HTTP Verb | Path                             | Controller Method       | Application Handler            | Primary Purpose                                                 |
| --------- | -------------------------------- | ----------------------- | ------------------------------ | --------------------------------------------------------------- |
| `POST`    | `/api/v1/sales/:saleId/payments` | `recordPayment()`       | `CreatePaymentHandler`         | Record payment tender against a finalized commercial Sale       |
| `GET`     | `/api/v1/sales/:saleId/payments` | `getPaymentsBySaleId()` | `GetSalePaymentHistoryHandler` | List chronological payment history for a specific Sale          |
| `GET`     | `/api/v1/payments/:id`           | `getPaymentById()`      | `GetPaymentHandler`            | Retrieve individual payment record by unique identifier         |
| `GET`     | `/api/v1/payments`               | `listPayments()`        | `ListPaymentsHandler`          | Paginated search, filtering, and sorting of payments            |
| `POST`    | `/api/v1/payments/:id/complete`  | `completePayment()`     | `CompletePaymentHandler`       | Settle an unsettled `PENDING` payment and advance Sale debt     |
| `POST`    | `/api/v1/payments/:id/fail`      | `failPayment()`         | `FailPaymentHandler`           | Mark an unsettled `PENDING` payment as failed upon rail decline |
| `POST`    | `/api/v1/payments/:id/cancel`    | `cancelPayment()`       | `CancelPaymentHandler`         | Void/cancel an unsettled `PENDING` payment (Management only)    |

### 2.2 Reused & Backward-Compatible Route Aliases

To preserve existing integrations and frontend client convenience:

- `POST /api/v1/payments`: Direct entry point supported by accepting `saleId` in the request body. If `saleId` is present in path (`/sales/:saleId/payments`), path takes precedence.
- `POST /api/v1/payments/:id/settle`: Retained as a valid HTTP alias for `POST /api/v1/payments/:id/complete`.
- `GET /api/v1/sales/:saleId/payments/history`: Retained as an explicit alias for `GET /api/v1/sales/:saleId/payments`.

---

## 3. Comprehensive Endpoint Specifications

---

### 3.1 Record Payment Tender (`POST /api/v1/sales/:saleId/payments`)

- **Application Handler**: `CreatePaymentHandler` (implements `CreatePaymentCommand`).
- **Purpose**: Records a monetary tender against an active commercial Sale. Supports immediate settlement (e.g. `CASH` handed to cashier at checkout) or initiating an unsettled tender (e.g. dynamic `QR` code presented to client).
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.create` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`). Legacy `billing.write` automatically resolves to `payments.create`.
- **Path Parameters**:
  - `saleId` (`string`, required): UUID of the target commercial Sale.
- **Request DTO** (`CreatePaymentRequestDto` / `RecordPaymentRequestDto`):
  ```typescript
  export class CreatePaymentRequestDto {
    @ApiPropertyOptional({ description: 'Target Sale UUID (optional if provided in route path)' })
    @IsOptional()
    @IsString()
    saleId?: string;

    @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
    @IsEnum(PaymentMethod, { message: 'Payment method must be CASH or QR.' })
    @IsNotEmpty()
    method!: PaymentMethod;

    @ApiProperty({ example: 49.99, description: 'Payment tender amount in major currency units' })
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive({ message: 'Payment amount must be strictly greater than 0.' })
    amount!: number;

    @ApiPropertyOptional({ example: 'USD', default: 'USD' })
    @IsOptional()
    @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter uppercase ISO-4217 code.' })
    currency?: string;

    @ApiPropertyOptional({
      enum: [PaymentStatus.PENDING, PaymentStatus.COMPLETED],
      default: PaymentStatus.COMPLETED,
    })
    @IsOptional()
    @IsEnum([PaymentStatus.PENDING, PaymentStatus.COMPLETED], {
      message: 'Initial status must be PENDING or COMPLETED.',
    })
    status?: PaymentStatus;

    @ApiPropertyOptional({ maxLength: 100, example: 'DRAWER-01-TX-99' })
    @IsOptional()
    @MaxLength(100)
    @Matches(/^[A-Za-z0-9#\-_/.: ]+$/, { message: 'Reference contains prohibited characters.' })
    reference?: string;
  }
  ```
- **Response DTO**: `PaymentResponseDto` (HTTP `201 Created`).
- **Validation Rules**:
  - `amount > 0.00`, max 2 decimal places.
  - `method` must be strictly `CASH` or `QR`.
  - `currency` must match `Sale.currency` (exact 3-letter uppercase ISO-4217).
  - `reference` capped at 100 characters; strictly rejects credit card PAN sequences matching Luhn patterns (`PaymentReference` VO).
- **Server-Controlled Fields**: `id` (generated UUID), `paidAt` (stamped server-side by `Clock` if `COMPLETED`), `createdAt`, `updatedAt`, `version` (starts at 1). Client cannot force `status: FAILED` or `status: CANCELLED` on creation.
- **Sale Access & State Invariants**:
  - `Sale` must exist in persistence within caller tenant (`SaleNotFoundException` $\to$ `404 Not Found`).
  - `Sale` must be in a payable status: `PENDING_PAYMENT` or `PARTIALLY_PAID` (`SaleNotPayableException` $\to$ `422 Unprocessable Entity`).
  - Sales in `DRAFT`, `PAID`, `COMPLETED`, or `CANCELLED` status cannot receive payments.
- **Overpayment Policy**:
  - The payment amount must be $\le \text{remaining balance}$ (`Sale.total - settledTotal`).
  - If `payment.amount > remainingBalance`: rejected with `PaymentOverpaymentException` ($\to$ `422 Unprocessable Entity`).
  - Overpayment is **never** permitted. Counter cash change is an operational drawer calculation; the recorded tender amount must equal the exact credited balance.
- **Persisted State & Transactions**:
  - Mutating command.
  - If `status === COMPLETED`: Persists `Payment` and parent `Sale` (`PARTIALLY_PAID` or `PAID`) atomically within a single database transaction (`IUnitOfWork`).
  - If `status === PENDING`: Persists `Payment` alone; parent `Sale` remains in current state.
- **Idempotency & Concurrency**:
  - Re-submitting identical external reference for the same sale throws `DuplicatePaymentReferenceException` ($\to$ `409 Conflict`).
  - Concurrent payments competing for remaining balance are protected by optimistic concurrency control (`sales.version`). The second transaction collides and fails with `409 Conflict` or `422 Unprocessable Entity`.

---

### 3.2 List Payments for Sale (`GET /api/v1/sales/:saleId/payments`)

- **Application Handler**: `GetSalePaymentHistoryHandler`.
- **Purpose**: Retrieves the chronological audit trail of all payment attempts (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`) associated with a specific commercial Sale.
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.read` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`). Legacy `billing.read` automatically resolves to `payments.read`.
- **Path Parameters**:
  - `saleId` (`string`, required): UUID of the target Sale.
- **Query Parameters**:
  - `sortDirection` (`'asc' | 'desc'`, optional, default: `'asc'`).
- **Response DTO**: `[PaymentResponseDto]` (HTTP `200 OK`).
- **Validation Rules**:
  - `saleId` must be non-empty.
- **Sale Access Restrictions**:
  - Scoped strictly to caller `tenantId`.
  - If `saleId` does not exist within caller tenant: returns `404 Not Found` (zero information disclosure).
- **Persisted State**: Side-effect free read query. Zero locks acquired.
- **Ordering Guarantee**: Primary sort by `createdAt ASC` (or requested direction); secondary deterministic tiebreaker `id ASC` to eliminate clock-skew ambiguity.

---

### 3.3 Get Payment by ID (`GET /api/v1/payments/:id`)

- **Application Handler**: `GetPaymentHandler`.
- **Purpose**: Resolves a single payment record by its domain identifier with structured monetary representation and audit metadata.
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.read` (Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`).
- **Path Parameters**:
  - `id` (`string`, required): UUID of the payment.
- **Request Body**: None.
- **Response DTO**: `PaymentResponseDto` (HTTP `200 OK`):
  ```typescript
  export class PaymentResponseDto {
    id: string;
    saleId: string;
    method: PaymentMethod;
    amount: MoneyResponseDto; // { amount, currency, formatted, cents }
    amountValue: number; // flat major-unit decimal (e.g. 49.99)
    status: PaymentStatus; // PENDING, COMPLETED, FAILED, CANCELLED
    reference: string | null;
    paidAt: string | null; // ISO-8601 UTC timestamp or null
    createdAt: string; // ISO-8601 UTC timestamp
    version: number; // OCC sequence number
  }
  ```
- **Security & Multi-Tenant Boundaries**:
  - Scoped strictly to `req.user.tenantId`.
  - If payment belongs to another tenant: returns `404 Not Found` (never `403 Forbidden`).
- **Persisted State**: Read-only query.

---

### 3.4 List Payments with Pagination & Filters (`GET /api/v1/payments`)

- **Application Handler**: `ListPaymentsHandler`.
- **Purpose**: Searches and paginates payments across the entire tenant ledger with filtering on status, method, sale, and date ranges.
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.read` (Roles: `Owner`, `Manager`, `Receptionist`).
- **Request Query DTO** (`ListPaymentsQueryDto`):
  - `saleId` (`string`, optional): Filter by associated Sale UUID.
  - `status` (`PaymentStatus`, optional): `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`.
  - `method` (`PaymentMethod`, optional): `CASH`, `QR`.
  - `fromDate` / `createdAtFrom` (`ISO-8601 string`, optional): Start timestamp.
  - `toDate` / `createdAtTo` (`ISO-8601 string`, optional): End timestamp.
  - `page` (`integer`, optional, default: 1, minimum: 1).
  - `limit` (`integer`, optional, default: 20, minimum: 1, maximum: 100).
  - `sortBy` (`string`, optional, allowlist: `createdAt`, `paidAt`, `amount`, `status`, default: `createdAt`).
  - `sortDirection` (`'asc' | 'desc'`, optional, default: `'desc'`).
- **Response DTO**: `PaginatedPaymentsResponseDto` (HTTP `200 OK`):
  ```typescript
  export class PaginatedPaymentsResponseDto {
    data: PaymentResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }
  ```
- **Validation Rules**:
  - `page >= 1`, `1 <= limit <= 100`.
  - Inverted date ranges (`fromDate > toDate`) throw `InvalidPaymentQueryException` ($\to$ `400 Bad Request`).
  - Un-allowlisted sort fields throw `InvalidPaymentQueryException` ($\to$ `400 Bad Request`).
- **Persisted State**: Read-only query.
- **Ordering Guarantee**: Explicit primary sort + mandatory secondary tiebreaker `id ASC` to prevent pagination drift.

---

### 3.5 Complete Pending Payment (`POST /api/v1/payments/:id/complete`)

- **Application Handler**: `CompletePaymentHandler`.
- **Purpose**: Confirms the settlement of an unsettled `PENDING` payment (e.g. dynamic QR code transfer verified via webhook or cashier confirmation).
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.create` or `payments.manage` (Roles: `Owner`, `Manager`, `Receptionist`).
- **Path Parameters**:
  - `id` (`string`, required): UUID of the pending Payment.
- **Request DTO** (`CompletePaymentRequestDto`):
  ```typescript
  export class CompletePaymentRequestDto {
    @ApiPropertyOptional({ maxLength: 100, example: 'QR-CONFIRMED-TRACE-12345' })
    @IsOptional()
    @MaxLength(100)
    @Matches(/^[A-Za-z0-9#\-_/.: ]+$/)
    reference?: string;
  }
  ```
- **Response DTO**: `PaymentResponseDto` (HTTP `200 OK`).
- **Allowed Source States**: Strictly `PENDING`.
- **Target State**: `COMPLETED`.
- **Repeated Requests (Idempotency)**:
  - Attempting to complete an already `COMPLETED` payment throws `PaymentAlreadyCompletedException` / `InvalidPaymentTransitionException` ($\to$ `422 Unprocessable Entity`).
  - Settled financial records are permanently immutable.
- **Concurrency & Loss Prevention**:
  - Two concurrent completion requests compete via OCC on `payments.version`. The first increments version ($1 \to 2$) and commits; the second collides and fails with `PaymentOptimisticLockException` ($\to$ `409 Conflict`).
- **Cross-Aggregate Consistency & Atomicity**:
  - **Critical Invariant**: Coordinates `Payment` settlement and `Sale` debt state transition **atomically within a single database transaction (`IUnitOfWork` / `prisma.$transaction`)**.
  - `sale.markPaid(clock)` if cumulative settled $\ge \text{sale.total}$; `sale.markPartiallyPaid(clock)` if cumulative settled $< \text{sale.total}$.
  - If persistence of either entity fails, the transaction rolls back completely. Neither entity is partially updated.
  - Domain events (`PaymentSettledEvent`, `SalePaidEvent` / `SalePartiallyPaidEvent`) dispatch strictly post-commit.

---

### 3.6 Mark Pending Payment as Failed (`POST /api/v1/payments/:id/fail`)

- **Application Handler**: `FailPaymentHandler`.
- **Purpose**: Records the terminal failure, gateway decline, or timeout of an unsettled `PENDING` payment. Retains an immutable audit record while keeping the parent `Sale` payable for alternative tender attempts.
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: `payments.create` or `payments.manage` (Roles: `Owner`, `Manager`, `Receptionist`).
- **Path Parameters**:
  - `id` (`string`, required): UUID of the pending Payment.
- **Request DTO** (`FailPaymentRequestDto`):
  ```typescript
  export class FailPaymentRequestDto {
    @ApiPropertyOptional({ maxLength: 255, example: 'Bank decline: insufficient funds' })
    @IsOptional()
    @MaxLength(255)
    reason?: string;
  }
  ```
- **Response DTO**: `PaymentResponseDto` (HTTP `200 OK`).
- **Allowed Source States**: Strictly `PENDING`.
- **Target State**: `FAILED`.
- **Repeated Requests**: Repeated failure calls throw `InvalidPaymentTransitionException` ($\to$ `422 Unprocessable Entity`). Terminal states cannot be re-transitioned.
- **Concurrency**: Guarded by OCC on `payments.version`. If payment completed concurrently before timeout webhook arrived, transition to `FAILED` is rejected (`409 Conflict`).
- **Sale Consistency**: Local `Payment` transaction. Parent `Sale` is **not** mutated and remains in its current payable state (`PENDING_PAYMENT` or `PARTIALLY_PAID`).

---

### 3.7 Void / Cancel Pending Payment (`POST /api/v1/payments/:id/cancel`)

- **Application Handler**: `CancelPaymentHandler`.
- **Purpose**: Voids or cancels an unsettled `PENDING` payment before funds transfer (e.g. cashier cancels QR display when customer decides to tender cash instead).
- **Authentication**: Mandatory Bearer JWT via `AuthenticationGuard`.
- **Required Permission**: Elevated `payments.manage` strictly required (Roles: `Owner`, `Manager`, `Receptionist`). Operational roles without management rights (`Trainer`, `Kitchen Staff`) are forbidden from voiding financial tenders.
- **Path Parameters**:
  - `id` (`string`, required): UUID of the pending Payment.
- **Request DTO** (`CancelPaymentRequestDto`):
  ```typescript
  export class CancelPaymentRequestDto {
    @ApiPropertyOptional({ maxLength: 255, example: 'Customer opted to tender cash instead' })
    @IsOptional()
    @MaxLength(255)
    reason?: string;
  }
  ```
- **Response DTO**: `PaymentResponseDto` (HTTP `200 OK`).
- **Allowed Source States**: Strictly `PENDING`.
- **Target State**: `CANCELLED`.
- **Settled Payment Cancellation Prohibition**:
  - Attempting to cancel a `COMPLETED` payment is strictly rejected with `InvalidPaymentTransitionException` ($\to$ `422 Unprocessable Entity`).
  - Completed financial payments cannot be voided in-place; reversals require a formal refund workflow (Phase 7.16 / Phase 8).
- **Concurrency**: Guarded by OCC on `payments.version`.
- **Sale Consistency**: Local `Payment` transaction. Parent `Sale` is **not** mutated.

---

## 4. Payment Creation Contract Invariant Resolutions

Based on governing ADRs (ADR-0108, ADR-0109, ADR-0114, ADR-0115, ADR-0116, ADR-0119, ADR-0133, ADR-0134):

| Question                                             | Authoritative Architectural Resolution                                                                                                                                                                                                                  | Governing ADR      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Must amount equal Sale total?**                    | **No.** Payments can be less than the total. A single payment may settle the entire balance, or split/partial payments may be accumulated.                                                                                                              | ADR-0109, ADR-0115 |
| **Are partial payments allowed?**                    | **Yes.** Payments less than the remaining balance are accepted and transition the `Sale` to `PARTIALLY_PAID`.                                                                                                                                           | ADR-0109, ADR-0119 |
| **Can multiple Payments be created for one Sale?**   | **Yes.** Cardinality between `Sale` and `Payment` is $1:N$. Multiple tenders (e.g. Split Cash + QR) settle a single commercial sale.                                                                                                                    | ADR-0109, ADR-0115 |
| **Is overpayment allowed?**                          | **No. Strictly prohibited.** Cumulative payments exceeding `Sale.total` throw `PaymentOverpaymentException` ($\to$ `422`). Cash register change is an operational drawer calculation; the recorded tender amount must equal the exact credited balance. | ADR-0114, ADR-0134 |
| **Can request specify a payment reference?**         | **Yes.** Optional string (max 100 chars). Must adhere to safe characters and is validated by `PaymentReference` VO against PCI-DSS anti-PAN regex. Duplicate references for the same sale throw `409 Conflict`.                                         | ADR-0115           |
| **Which method values are supported?**               | **Strictly `CASH` and `QR`.** The active TypeScript enum is restricted to these two values. Submitting un-enumerated values throws `InvalidPaymentMethodException` ($\to$ `400`).                                                                       | ADR-0109, ADR-0115 |
| **Which lifecycle fields remain server-controlled?** | **`id`**, **`status`** (must be `PENDING` or `COMPLETED`; client cannot supply `FAILED`/`CANCELLED`), **`paidAt`** (stamped by `Clock` on settlement), **`createdAt`**, **`updatedAt`**, **`version`**, and **`sale.status`**.                          | ADR-0116, ADR-0133 |

---

## 5. Transition Contract & Concurrency Matrix

```
                          ┌─────────────┐
                          │  [Initial]  │
                          └──────┬──────┘
                                 │ POST /sales/:id/payments
                                 ▼
                          ┌─────────────┐
                          │   PENDING   │
                          └──┬───┬───┬──┘
     POST /complete          │   │   │ POST /cancel
  ┌──────────────────────────┘   │   └──────────────────────────┐
  ▼                              ▼ POST /fail                   ▼
┌─────────────┐           ┌─────────────┐                ┌─────────────┐
│  COMPLETED  │           │   FAILED    │                │  CANCELLED  │
│ (Immutable) │           │ (Terminal)  │                │ (Terminal)  │
└─────────────┘           └─────────────┘                └─────────────┘
```

| Action            | Allowed Source State | Target State | Repeated Request Behavior                                 | Concurrent Contention                              | Consistency Scope                                  |
| ----------------- | -------------------- | ------------ | --------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Create (Cash)** | None                 | `COMPLETED`  | Generates duplicate tender or rejects duplicate reference | Protected by `sales.version` OCC                   | **Atomic Multi-Aggregate Tx** (`Payment` + `Sale`) |
| **Create (QR)**   | None                 | `PENDING`    | Creates pending tender                                    | Standard append; uncommitted debt                  | Single-Aggregate Tx (`Payment` alone)              |
| **Complete**      | `PENDING`            | `COMPLETED`  | Throws `422 Unprocessable Entity` (Immutable)             | First wins; second fails with `409 Conflict` (OCC) | **Atomic Multi-Aggregate Tx** (`Payment` + `Sale`) |
| **Fail**          | `PENDING`            | `FAILED`     | Throws `422 Unprocessable Entity` (Terminal)              | First wins; second fails with `409 Conflict` (OCC) | Single-Aggregate Tx (`Payment` alone)              |
| **Cancel**        | `PENDING`            | `CANCELLED`  | Throws `422 Unprocessable Entity` (Terminal)              | First wins; second fails with `409 Conflict` (OCC) | Single-Aggregate Tx (`Payment` alone)              |

---

## 6. Security, Authorization & Error Mapping

### 6.1 Permission & Role Matrix (ADR-0135)

| Endpoint                       | Required Permission | Allowed Business Roles                              | Risk Tier             |
| ------------------------------ | ------------------- | --------------------------------------------------- | --------------------- |
| `POST /sales/:saleId/payments` | `payments.create`   | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Transactional         |
| `POST /payments`               | `payments.create`   | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Transactional         |
| `GET /sales/:saleId/payments`  | `payments.read`     | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Read-Only             |
| `GET /payments/:id`            | `payments.read`     | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` | Read-Only             |
| `GET /payments`                | `payments.read`     | `Owner`, `Manager`, `Receptionist`                  | Read-Only             |
| `POST /payments/:id/complete`  | `payments.create`   | `Owner`, `Manager`, `Receptionist`                  | Transactional         |
| `POST /payments/:id/fail`      | `payments.create`   | `Owner`, `Manager`, `Receptionist`                  | Transactional         |
| `POST /payments/:id/cancel`    | `payments.manage`   | `Owner`, `Manager`, `Receptionist`                  | Financially Sensitive |

### 6.2 HTTP Exception Mapping Matrix (`SalesExceptionFilter`)

| Domain / Application Exception                                      | HTTP Status | RFC Error Name         | Description / Sanitization                          |
| ------------------------------------------------------------------- | ----------- | ---------------------- | --------------------------------------------------- |
| `InvalidCredentialsException`, `InvalidTokenException`              | `401`       | `Unauthorized`         | Missing or expired Bearer token.                    |
| `PaymentUnauthorizedException` (cross-tenant)                       | `404`       | `Not Found`            | Entity not found in tenant; zero existence leakage. |
| `PaymentUnauthorizedException` (insufficient role)                  | `403`       | `Forbidden`            | User lacks required permission.                     |
| `SaleNotFoundException`, `PaymentNotFoundException`                 | `404`       | `Not Found`            | Referenced aggregate ID does not exist.             |
| `InvalidPaymentMethodException`, `InvalidPaymentReferenceException` | `400`       | `Bad Request`          | Unsupported method or anti-PAN regex violation.     |
| `PaymentCurrencyMismatchException`                                  | `400`       | `Bad Request`          | Payment currency differs from target Sale currency. |
| `PaymentOptimisticLockException`, `SaleOptimisticLockException`     | `409`       | `Conflict`             | Concurrent mutation collision (version mismatch).   |
| `DuplicatePaymentReferenceException`                                | `409`       | `Conflict`             | Reference already recorded for this sale.           |
| `PaymentOverpaymentException`                                       | `422`       | `Unprocessable Entity` | Tender exceeds remaining unpaid balance.            |
| `SaleNotPayableException`                                           | `422`       | `Unprocessable Entity` | Sale is in `DRAFT`, `PAID`, or `CANCELLED` status.  |
| `InvalidPaymentTransitionException`                                 | `422`       | `Unprocessable Entity` | Target payment is not in `PENDING` state.           |

---

## 7. Unresolved Policies & Deferred Decisions

1. **Card Pre-Authorization Workflows (`AUTHORIZED` state)**:
   - _Status_: **Deferred to Phase 8**. Credit card terminals with 2-step capture (`AUTHORIZED -> CAPTURED`) are not part of Milestone 7.15. The state machine remains minimal and deterministic (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`).
2. **Post-Settlement Refunds & Chargebacks**:
   - _Status_: **Deferred to Phase 7.16 / Phase 8**. Settled payments cannot be modified or cancelled in-place. Compensating ledger reversals require a dedicated `Refund` entity.
3. **Automated Gateway Webhooks Ingress**:
   - _Status_: **Deferred to Phase 8 Integration**. Webhooks will call `POST /api/v1/payments/:id/complete` or `fail` using machine-to-machine service tokens.
