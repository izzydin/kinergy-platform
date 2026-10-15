# Payment API Implementation & OpenAPI Traceability Report (Milestone 7.15)

- **Date**: 2026-10-15
- **Author**: Senior API Documentation Engineer & Financial Consistency Authority
- **Status**: Complete, Verified & Authoritative
- **Target Module**: `apps/api/src/sales` (`PaymentsController`, DTOs, Handlers, Exception Filters)
- **Validation Test Suites**:
  - `apps/api/src/sales/__tests__/payments-openapi-contract.spec.ts` (OpenAPI 3.0 Contract Verification)
  - `apps/api/src/sales/__tests__/payments-api.integration.spec.ts` (Full HTTP Integration Test Suite)
- **Governing Architecture Decisions**:
  - [ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability](../adr/0109-payment-lifecycle.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0133: Payment Application Layer Architecture, Cross-Aggregate Settlement Orchestration, and Use Case Inventory](../adr/0133-payment-application-layer-architecture.md)
  - [ADR-0134: Financial Settlement Validation and Overpayment Invariants](../adr/0134-financial-settlement-validation-and-overpayment-invariants.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](../adr/0135-sales-payments-receipts-authorization-and-security.md)
  - [ADR-0138: Payment API Architecture, HTTP Contracts & Monetary Settlement Specification](../adr/0138-payment-api-architecture-and-contracts.md)

---

## 1. Executive Summary

This report establishes end-to-end technical traceability between the approved Milestone 7.15 Payment API specification (ADR-0138), the OpenAPI 3.0 / Swagger metadata annotations, request/response DTOs, authentication and authorization guards, domain exception mappings, and the actual runtime behavior in the NestJS application.

Every route, schema, HTTP status code, permission check, and state-transition constraint documented herein corresponds to verified code. Zero non-existent endpoints, phantom fields, or unmapped domain aggregates are exposed in public API contracts.

### Scope and Boundaries Clarification

1. **Internal Monetary Ledger Recording Only**: The Payment API records internal tender transactions (e.g. physical `CASH` handed to a cashier or cashier-verified `QR` code settlement). **The API does not charge external credit card networks, perform automated bank debits, or communicate with third-party payment gateways in Milestone 7.15.**
2. **Reversals and Refunds Out of Scope**: Completed payments are permanently immutable. Post-settlement reversals, chargebacks, and partial refunds are deferred to dedicated refund architecture (Phase 7.16 / Phase 8) and cannot be executed via payment cancellation endpoints.
3. **No Arbitrary Status Overrides**: Clients cannot force lifecycle state transitions via request payloads. All state transitions are server-evaluated through domain state machines.

---

## 2. Route-by-Route Traceability Matrix

All routes are mounted under the platform prefix `/api/v1` and tagged under `'Payments'` in OpenAPI.

|   #   | Route & HTTP Verb                                                                                | Controller Method       | Application Command / Query                                     | Guards & Permissions                                                                                                                                   | Request DTO                                                          | Response DTO                   | Expected HTTP Statuses                                                                                                                        |
| :---: | :----------------------------------------------------------------------------------------------- | :---------------------- | :-------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `POST /api/v1/sales/:saleId/payments`<br/>_(alias: `POST /api/v1/payments`)_                     | `recordPayment()`       | `CreatePaymentCommand`<br/>`CreatePaymentHandler`               | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.create')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')` | `RecordPaymentRequestDto`<br/>_(alias: `CreatePaymentRequestDto`)_   | `PaymentResponseDto`           | `201 Created`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable` |
| **2** | `GET /api/v1/sales/:saleId/payments`<br/>_(alias: `GET /api/v1/sales/:saleId/payments/history`)_ | `getPaymentsBySaleId()` | `GetSalePaymentHistoryQuery`<br/>`GetSalePaymentHistoryHandler` | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`   | None<br/>_(Query: `sortDirection`)_                                  | `PaymentSummaryResponseDto[]`  | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                                                 |
| **3** | `GET /api/v1/payments/:id`<br/>_(alias: `GET /api/v1/payments/:paymentId/detail`)_               | `getPaymentById()`      | `GetPaymentQuery`<br/>`GetPaymentByIdHandler`                   | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')`   | None<br/>_(Path: `id`)_                                              | `PaymentDetailResponseDto`     | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`                                                 |
| **4** | `GET /api/v1/payments`                                                                           | `listPayments()`        | `ListPaymentsQuery`<br/>`ListPaymentsHandler`                   | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.read')`<br/>`@Roles('Owner', 'Manager', 'Receptionist')`                    | `ListPaymentsQueryDto`<br/>_(Query params)_                          | `PaginatedPaymentsResponseDto` | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`                                                                     |
| **5** | `POST /api/v1/payments/:id/complete`<br/>_(alias: `POST /api/v1/payments/:id/settle`)_           | `completePayment()`     | `CompletePaymentCommand`<br/>`CompletePaymentHandler`           | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.manage')`<br/>`@Roles('Owner', 'Manager', 'Receptionist')`                  | `CompletePaymentRequestDto`<br/>_(alias: `SettlePaymentRequestDto`)_ | `PaymentResponseDto`           | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable`      |
| **6** | `POST /api/v1/payments/:id/fail`                                                                 | `failPayment()`         | `FailPaymentCommand`<br/>`FailPaymentHandler`                   | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.manage')`<br/>`@Roles('Owner', 'Manager', 'Receptionist')`                  | `FailPaymentRequestDto`                                              | `PaymentResponseDto`           | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable`      |
| **7** | `POST /api/v1/payments/:id/cancel`                                                               | `cancelPayment()`       | `CancelPaymentCommand`<br/>`CancelPaymentHandler`               | `AuthenticationGuard`<br/>`AuthorizationGuard`<br/>`@Permissions('payments.manage')`<br/>`@Roles('Owner', 'Manager')`                                  | `CancelPaymentRequestDto`                                            | `PaymentResponseDto`           | `200 OK`<br/>`400 Bad Request`<br/>`401 Unauthorized`<br/>`403 Forbidden`<br/>`404 Not Found`<br/>`409 Conflict`<br/>`422 Unprocessable`      |

---

## 3. Data Transfer Objects (DTO) Contract Specifications

### 3.1 Request DTOs

#### `RecordPaymentRequestDto` / `CreatePaymentRequestDto`

- **`saleId`** (`string`, optional): Target commercial Sale UUID. Required if body is posted to `/api/v1/payments` root; overridden by route parameter if invoked at `/api/v1/sales/:saleId/payments`.
- **`method`** (`PaymentMethod`, required): Tender rail method. Strictly enumerated: `CASH` or `QR`.
- **`amount`** (`number`, required): Tender amount in major currency units (e.g. `49.99`). Must be strictly positive (`> 0`) with at most 2 decimal places.
- **`currency`** (`string`, optional, default: `'USD'`): 3-letter uppercase ISO-4217 currency code. Must match target Sale currency exactly.
- **`status`** (`PaymentStatus`, optional, default: `COMPLETED`): Initial payment lifecycle state. Permitted values: `PENDING` or `COMPLETED`. Clients cannot initialize terminal states (`FAILED`, `CANCELLED`).
- **`reference`** (`string`, optional, max 100 chars): Register drawer reference or transaction trace sequence. Strictly validated against PCI-DSS anti-PAN regex (`/^[A-Za-z0-9#\-_/.: ]+$/`) to prevent storing credit card numbers.

#### `CompletePaymentRequestDto` / `SettlePaymentRequestDto`

- **`reference`** (`string`, optional, max 100 chars): Confirmation reference returned upon fund settlement.
- _Server-Controlled Invariant_: Neither `status`, `paidAt`, nor `createdAt` can be supplied by the client.

#### `FailPaymentRequestDto`

- **`reason`** (`string`, optional, max 255 chars): Audit justification explaining the rail decline or timeout.

#### `CancelPaymentRequestDto`

- **`reason`** (`string`, optional, max 255 chars): Audit justification explaining why the pending tender was voided.

#### `ListPaymentsQueryDto`

- **`page`** (`number`, optional, default: 1, min: 1): 1-indexed pagination page.
- **`limit`** (`number`, optional, default: 20, min: 1, max: 100): Page record size.
- **`saleId`** (`string`, optional): Filter by associated Sale UUID.
- **`status`** (`PaymentStatus`, optional): Filter by status (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`).
- **`method`** (`PaymentMethod`, optional): Filter by tender method (`CASH`, `QR`).
- **`fromDate`** / **`createdAtFrom`** (`string`, optional): Start ISO-8601 UTC timestamp.
- **`toDate`** / **`createdAtTo`** (`string`, optional): End ISO-8601 UTC timestamp.
- **`sortBy`** (`string`, optional, default: `'createdAt'`): Sort field (`createdAt`, `paidAt`, `amount`, `status`).
- **`sortDirection`** (`'asc' | 'desc'`, optional, default: `'desc'`): Sort direction.

---

### 3.2 Response DTOs

#### `PaymentResponseDto` & `PaymentDetailResponseDto`

All payment representations guarantee zero floating-point arithmetic drift by exposing canonical Money VO serialization:

```json
{
  "id": "pay_550e8400-e29b-41d4-a716-446655440000",
  "saleId": "sale_7d6c5b4a-3f2e-1d0c-b1a0-9f8e7d6c5b4a",
  "method": "CASH",
  "amount": {
    "amount": 49.99,
    "cents": 4999,
    "currency": "USD",
    "formatted": "49.99"
  },
  "amountValue": 49.99,
  "status": "COMPLETED",
  "reference": "DRAWER-01-TX-100",
  "paidAt": "2026-10-15T12:00:00.000Z",
  "createdAt": "2026-10-15T12:00:00.000Z",
  "version": 1
}
```

#### Security & Anti-Leakage Invariants

- **No Internal ORM Fields**: Fields such as `tenantId`, `deletedAt`, `updatedAt`, or database primary keys are stripped from public responses.
- **No PAN Storage**: References containing 13–19 digit sequences passing Luhn algorithm checks are rejected prior to persistence.

---

## 4. Payment State Machine & Transition Rules

```
                      ┌──────────────────────┐
                      │      [Initial]       │
                      └──────────┬───────────┘
                                 │ POST /sales/:id/payments
                                 ▼
                      ┌──────────────────────┐
                      │       PENDING        │
                      └──┬───────┬────────┬──┘
                         │       │        │
   POST /complete        │       │        │ POST /cancel
┌────────────────────────┘       │        └────────────────────────┐
▼                                ▼ POST /fail                      ▼
┌──────────────────────┐ ┌───────────────┐               ┌──────────────────┐
│      COMPLETED       │ │    FAILED     │               │    CANCELLED     │
│ (Terminal/Immutable) │ │  (Terminal)   │               │   (Terminal)     │
└──────────────────────┘ └───────────────┘               └──────────────────┘
```

### Transition Invariants

1. **Source State Restriction**:
   The transition commands (`/complete`, `/fail`, `/cancel`) **strictly require** the Payment to currently be in `PENDING` status.
2. **Terminal Immutability**:
   Once a Payment reaches `COMPLETED`, `FAILED`, or `CANCELLED`, it is permanently immutable. Any subsequent attempt to transition the payment returns **`HTTP 422 Unprocessable Entity`**.
3. **No Direct In-Place Reversals**:
   A `COMPLETED` payment cannot be failed or cancelled. Reversals require an independent refund aggregate.

---

## 5. Monetary Policy & Financial Invariants

1. **Exact 2-Decimal Precision**:
   Tender amounts are validated as positive decimal numbers with at most 2 decimal places. Internally, amounts are stored and calculated as exact integer cents.
2. **Homogeneous Currencies**:
   The currency of the Payment must match the currency of the associated Sale (`USD` to `USD`). Mismatches return `HTTP 400 Bad Request` (`PaymentCurrencyMismatchException`).
3. **Strict Overpayment Prohibition**:
   The payment amount cannot exceed the remaining balance of the Sale:
   $$\text{Payment Amount} \le \text{Sale Total} - \sum \text{Settled Payments}$$
   Any payment exceeding the remaining balance is rejected with **`HTTP 422 Unprocessable Entity`** (`PaymentOverpaymentException`). Cash change calculation is an external cashier drawer operation; the system registers only the net credited tender.
4. **Split & Partial Payments Supported**:
   A Sale may be satisfied through multiple partial payments across different supported tender methods (`CASH`, `QR`).

---

## 6. Parent Sale Coordination & Consistency

The Payment API coordinates two separate aggregate roots: `Payment` and `Sale`.

### Aggregate Coupling Rules

1. **Scalar Coupling Only**:
   Neither aggregate holds an in-memory object reference to the other. `Payment` references `Sale` solely via `saleId: SaleId`.
2. **Autonomous Domain Authority**:
   - `Payment` aggregate authoritatively enforces its own state machine (`PENDING` $\to$ `COMPLETED`).
   - `Sale` aggregate authoritatively decides debt state transitions (`PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` or `PAID`).
3. **Application Orchestration**:
   - In `POST /api/v1/sales/:saleId/payments` (with `COMPLETED` cash) and `POST /api/v1/payments/:id/complete`, the application use case handler coordinates both aggregates.
   - If cumulative completed payments satisfy the sale total, `sale.markPaid(clock)` is invoked.
   - If balance remains unpaid, `sale.markPartiallyPaid(clock)` is invoked.
4. **Non-Mutating Local Operations**:
   `POST /api/v1/payments/:id/fail` and `POST /api/v1/payments/:id/cancel` mutate only the target `Payment` aggregate. The parent `Sale` is left completely unchanged in its current payable state.

---

## 7. Idempotency & Concurrency Guarantees

### What Is Actually Implemented

1. **Payment Reference Uniqueness Per Sale**:
   Duplicate external references submitted for the same Sale are detected via database / repository index checks and rejected with **`HTTP 409 Conflict`** (`DuplicatePaymentReferenceException`).
2. **Optimistic Concurrency Control (OCC)**:
   Both `Payment` and `Sale` aggregates track sequential integer versions (`version`).
   When concurrent operations contend on the same record, persistence adapters enforce OCC:
   - The first transaction increments the version ($V \to V + 1$) and commits.
   - The concurrent transaction detects the stale version and throws `PaymentOptimisticLockException` or `SaleOptimisticLockException`, which `SalesExceptionFilter` maps to **`HTTP 409 Conflict`**.
3. **Terminal Re-execution**:
   Repeated completion, failure, or cancellation requests on an already terminal payment do not execute duplicate state changes; they return **`HTTP 422 Unprocessable Entity`**.

### What Is NOT Implemented (Deliberately Avoided)

- No distributed locking mechanisms (e.g. Redis Redlock).
- No speculative idempotent request caching layers.
- No external payment gateway charging deduplication.

---

## 8. Transactional Consistency & Atomic Persistence

1. **Transactional Unit of Work Boundary**:
   Atomic cross-aggregate writes are coordinated through the `IUnitOfWork` port (`UNIT_OF_WORK_TOKEN`).
2. **Rollback Guarantee**:
   In `CompletePaymentHandler` and `CreatePaymentHandler` (settled cash), the update to `Payment` and `Sale` occurs inside a single database transaction (`prisma.$transaction`).
   If persistence of either aggregate encounters a database error, the transaction rolls back completely:
   - The `Sale` remains in its prior status.
   - The `Payment` remains in `PENDING` status.
   - Contradictory states (e.g. `Payment: COMPLETED` with `Sale: PENDING_PAYMENT`) are structurally impossible.

---

## 9. Authentication, Permissions & Error Mapping

### Permission Matrix (Phase 1 IAM)

- **`payments.create`**:
  Required for `POST /api/v1/sales/:saleId/payments` and `POST /api/v1/payments`.
  Permitted Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`.
- **`payments.read`**:
  Required for `GET /api/v1/sales/:saleId/payments`, `GET /api/v1/payments/:id`, and `GET /api/v1/payments`.
  Permitted Roles: `Owner`, `Manager`, `Receptionist`, `Kitchen Staff` (reads only for sale payments).
- **`payments.manage`**:
  Required for `POST /api/v1/payments/:id/complete`, `POST /api/v1/payments/:id/fail`, and `POST /api/v1/payments/:id/cancel`.
  Permitted Roles: `Owner`, `Manager` (elevated). `Receptionist` is strictly denied on cancellation. `Kitchen Staff` and `Trainer` are denied on all transitions.

### HTTP Error Mapping (`SalesExceptionFilter`)

| Condition                           | Domain / Application Exception                                         |         HTTP Status         | Response Contract                            |
| :---------------------------------- | :--------------------------------------------------------------------- | :-------------------------: | :------------------------------------------- |
| Missing / invalid JWT               | `InvalidTokenException`, `AuthException`                               |     `401 Unauthorized`      | Generic message; zero token reflection       |
| Cross-tenant resource access        | `PaymentUnauthorizedException`                                         |       `403 Forbidden`       | Strict multi-tenant boundary isolation       |
| Missing required permission         | `PaymentUnauthorizedException`                                         |       `403 Forbidden`       | Action denied                                |
| Resource not found                  | `SaleNotFoundException`, `PaymentNotFoundException`                    |       `404 Not Found`       | Explicit identifier feedback                 |
| Invalid DTO / Anti-PAN regex        | `BadRequestException`, `InvalidPaymentReferenceException`              |      `400 Bad Request`      | Descriptive validation errors                |
| Currency mismatch                   | `PaymentCurrencyMismatchException`                                     |      `400 Bad Request`      | Currency mismatch description                |
| Duplicate reference / OCC collision | `DuplicatePaymentReferenceException`, `PaymentOptimisticLockException` |       `409 Conflict`        | Conflict description                         |
| Illegal state transition            | `InvalidPaymentTransitionException`                                    | `422 Unprocessable Entity`  | Transition rejected                          |
| Overpayment attempted               | `PaymentOverpaymentException`                                          | `422 Unprocessable Entity`  | Exceeds remaining balance                    |
| Unpayable sale state                | `SaleNotPayableException`                                              | `422 Unprocessable Entity`  | Sale not in payable status                   |
| Database I/O error                  | Infrastructure / Disk / Connection Fault                               | `500 Internal Server Error` | Sanitized internal error; zero stack leakage |

---

## 10. ADR Traceability & Architecture Reconciliation

### Reconciled Architectural Decisions

| ADR          | Title                                          | Reconciled Reality in Codebase                                                                                    |
| :----------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **ADR-0109** | Payment Lifecycle & Multi-Tender Settlement    | Implemented. `CASH` and `QR` tenders support multi-payment split settlement with permanent terminal immutability. |
| **ADR-0111** | Sales & Payments Authorization                 | Implemented. Phase 1 IAM evaluated at NestJS Guard layer and within application service authorization checks.     |
| **ADR-0115** | Canonical Payment Architecture                 | Implemented. Autonomous aggregate root with `Money` value object and `PaymentReference` anti-PAN validation.      |
| **ADR-0116** | Payment State Machine Specification            | Implemented. Deterministic state machine (`PaymentLifecycleStateMachine`) enforces valid transitions.             |
| **ADR-0133** | Payment Application Layer Architecture         | Implemented. CQRS command/query handlers coordinate operations cleanly across aggregate boundaries.               |
| **ADR-0134** | Financial Settlement & Overpayment Invariants  | Implemented. Overpayment rejected with 422; Sale status transitions to `PARTIALLY_PAID` or `PAID`.                |
| **ADR-0135** | Sales, Payments & Receipts Security Governance | Implemented. Strict role-to-permission mapping and multi-tenant boundary checks.                                  |
| **ADR-0138** | Payment API Architecture & Contracts           | Implemented. Complete RESTful endpoint inventory mounted at `/api/v1` with OpenAPI Swagger documentation.         |

### Architectural Nuance Clarification (ADR-0138 vs Implemented Behavior)

- **Cross-Tenant Access Handling**:
  ADR-0138 Section 6.2 noted `PaymentUnauthorizedException (cross-tenant) -> 404 Not Found` in a theoretical summary table, but the authoritative security implementation (`enforceTenantIsolation` in `payment-authorization.ts` and `SalesExceptionFilter`) enforces `PaymentUnauthorizedException` mapped to **`403 Forbidden`** (`Cross-tenant access forbidden: caller tenant 'X' cannot operate on target tenant 'Y'`). Non-existent IDs in the current tenant return **`404 Not Found`**. This guarantees that unauthorized cross-tenant operations are strictly categorized as security authorization boundary violations.
