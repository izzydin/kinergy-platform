# Sales, Payments & Receipts External Operations Authorization Matrix

- **Status**: Authoritative Application Security Specification
- **Security Scope**: Presentation Boundary (`apps/api/src/sales/controllers/`), Application Core (`packages/core/src/sales/application/`), IAM Enforcement (`apps/api/src/platform/identity/authorization/`)
- **Compliance Baseline**: OWASP ASVS 4.0 (Level 2), OWASP API Security Top 10 (Broken Object Level Authorization, Broken Function Level Authorization)
- **ADR References**: [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0028](../adr/0028-extracted-authorization-decision-engine.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), [ADR-0135](../adr/0135-sales-payments-receipts-authorization-and-security.md)

---

## 1. Executive Summary & Security Principles

This specification documents the complete, fine-grained authorization contract for **every externally reachable HTTP operation** across the Sales, Payments, and Receipts subsystems, as well as the isolation boundaries governing **internal service-to-service workflows**.

### Core Security Invariants

1. **Principle of Least Privilege (PoLP)**: A read permission (`sales.read`, `payments.read`, `receipts.read`) grants zero authority to execute state mutations.
2. **Domain Invariant Supremacy**: An administrative or management permission (`sales.manage`, `payments.manage`, `receipts.manage`) **never** permits bypassing domain invariants, lifecycle state machines, or aggregate integrity checks.
3. **No Cross-Resource Authority Leaks**: Holding access to a specific `Payment` record does not grant access to the parent `Sale` or unrelated financial documents. Holding access to a `Sale` does not expose payment ledger history without explicit `payments.read` capability.
4. **Zero Public Access**: Receipts, payments, and sales are confidential commercial assets. No endpoint is marked `@Public()`. Unauthenticated requests are rejected immediately with `401 Unauthorized`.
5. **Strict Multi-Tenant Isolation**: Every command and query enforces caller tenant scoping (`command.tenantId === context.tenantId`). Cross-tenant probes are rejected with `404 Not Found` to prevent resource enumeration.
6. **Object-Level Authorization (BOLA Defense)**: Access to client-specific records by Trainers or Clients is constrained by attribute-based ownership rules enforced within the application query tier.

---

## 2. Comprehensive External Operations Authorization Matrix

The table below catalogs every discovered externally reachable route across `SalesController`, `PaymentsController`, and `ReceiptsController`:

|   #    | Domain Module | Operation / Use Case                   | HTTP Method & Route                                                              | Required Permission                    | Authorized Roles                                                         |              Type               | Primary Invariants & Ownership Constraints                                                       |
| :----: | :------------ | :------------------------------------- | :------------------------------------------------------------------------------- | :------------------------------------- | :----------------------------------------------------------------------- | :-----------------------------: | :----------------------------------------------------------------------------------------------- |
| **1**  | **Sales**     | `CreateSale`                           | `POST /api/v1/sales`                                                             | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Initializes in `DRAFT`; zero initial totals; idempotent key scoped to tenant.                    |
| **2**  | **Sales**     | `ListSales`                            | `GET /api/v1/sales`                                                              | `sales.read`                           | `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`           |            Read-Only            | Paginated; bounded limits; tenant-scoped; deterministic sort (`createdAt DESC`).                 |
| **3**  | **Sales**     | `GetSale`                              | `GET /api/v1/sales/:id`                                                          | `sales.read`                           | `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`           |            Read-Only            | Tenant-scoped; Trainer scoped to assigned client sessions; Client scoped to own ID.              |
| **4**  | **Sales**     | `CalculateSale`                        | `GET /api/v1/sales/:id/calculate`                                                | `sales.read`                           | `Owner`, `Manager`, `Receptionist`, `Trainer`, `Kitchen Staff`           |            Read-Only            | In-memory recalculation of minor-unit totals; zero persistence side effects.                     |
| **5**  | **Sales**     | `AssignSaleSource`                     | `POST /api/v1/sales/:id/source`                                                  | `sales.create`                         | `Owner`, `Manager`, `Receptionist`                                       |            Mutating             | Permitted only in `DRAFT`; immutable once set or after finalization.                             |
| **6**  | **Sales**     | `AddSaleItem`                          | `POST /api/v1/sales/:id/items`                                                   | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Sale must be `DRAFT`; item source in tenant; positive quantity; recalculates totals.             |
| **7**  | **Sales**     | `RemoveSaleItem`                       | `DELETE /api/v1/sales/:id/items/:itemId`                                         | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Sale must be `DRAFT`; item must belong to sale; recalculates totals.                             |
| **8**  | **Sales**     | `ApplyDiscount`                        | `POST /api/v1/sales/:id/discount`                                                | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Sale must be `DRAFT`; discount $\le$ subtotal; non-empty audit reason.                           |
| **9**  | **Sales**     | `RemoveDiscount`                       | `DELETE /api/v1/sales/:id/discount`                                              | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Sale must be `DRAFT`; resets `discountTotal` to zero minor units.                                |
| **10** | **Sales**     | `FinalizeSale`                         | `POST /api/v1/sales/:id/finalize`<br>`POST /api/v1/sales/:id/submit-for-payment` | `sales.create`                         | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Transitions `DRAFT` $\to$ `PENDING_PAYMENT`; requires $\ge 1$ line item; locks terms.            |
| **11** | **Sales**     | `CancelSale`                           | `POST /api/v1/sales/:id/cancel`                                                  | `sales.cancel`                         | `Owner`, `Manager`, `Receptionist`                                       |     Mutating (Destructive)      | Permitted in `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`; terminal if `PAID`. Reason required.  |
| **12** | **Sales**     | `CoordinatePayment`                    | `POST /api/v1/sales/:id/coordinate-payment`                                      | `sales.create`<br>`payments.manage`    | `Owner`, `Manager`, `Receptionist`                                       |            Mutating             | Payment must be `COMPLETED`; amounts match; advances Sale to `PARTIALLY_PAID` or `PAID`.         |
| **13** | **Payments**  | `RecordPayment`<br>`CreatePayment`     | `POST /api/v1/sales/:saleId/payments`<br>`POST /api/v1/payments`                 | `payments.create`                      | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`                      |            Mutating             | Sale must be `PENDING_PAYMENT` or `PARTIALLY_PAID`; positive amount $\le$ remaining balance.     |
| **14** | **Payments**  | `GetPaymentsBySaleId`                  | `GET /api/v1/sales/:saleId/payments`                                             | `payments.read`                        | `Owner`, `Manager`, `Receptionist`                                       |            Read-Only            | Tenant-scoped; Kitchen Staff denied by lack of `payments.read`; masked tender data.              |
| **15** | **Payments**  | `GetPaymentById`<br>`GetPayment`       | `GET /api/v1/payments/:paymentId`<br>`GET /api/v1/payments/:paymentId/detail`    | `payments.read`                        | `Owner`, `Manager`, `Receptionist`                                       |            Read-Only            | Tenant-scoped; resolves single transaction; masked cardholder data (PAN/CVV).                    |
| **16** | **Payments**  | `ListPayments`                         | `GET /api/v1/payments`                                                           | `payments.read`                        | `Owner`, `Manager`, `Receptionist`                                       |            Read-Only            | Paginated; bounded limits; tenant-scoped; deterministic sort.                                    |
| **17** | **Payments**  | `GetSalePaymentHistory`                | `GET /api/v1/sales/:saleId/payments/history`                                     | `payments.read`                        | `Owner`, `Manager`, `Receptionist`                                       |            Read-Only            | Chronological tender audit history; strictly scoped to requested `saleId` in tenant.             |
| **18** | **Payments**  | `CompletePayment`<br>`SettlePayment`   | `POST /api/v1/payments/:id/complete`<br>`POST /api/v1/payments/:id/settle`       | `payments.create`<br>`payments.manage` | `Owner`, `Manager`, `Receptionist`                                       | Mutating (Financial Settlement) | Target payment must be `PENDING`; transitions to `COMPLETED`; sets `paidAt`; atomic Sale sync.   |
| **19** | **Payments**  | `FailPayment`                          | `POST /api/v1/payments/:id/fail`                                                 | `payments.create`<br>`payments.manage` | `Owner`, `Manager`, `Receptionist`                                       |            Mutating             | Target payment must be `PENDING`; transitions to `FAILED`; terminal states rejected (422).       |
| **20** | **Payments**  | `CancelPayment`                        | `POST /api/v1/payments/:id/cancel`                                               | `payments.manage`                      | `Owner`, `Manager`                                                       |    Mutating (High-Risk Void)    | Target payment must be `PENDING`; transitions to `CANCELLED`; settled cannot be voided in-place. |
| **21** | **Receipts**  | `IssueReceipt`<br>`IssueReceiptDirect` | `POST /api/v1/sales/:saleId/receipt`<br>`POST /api/v1/receipts`                  | `receipts.manage`                      | `Owner`, `Manager`, `Receptionist`                                       |   Mutating (Fiscal Document)    | Sale must be `PAID` or `COMPLETED`; payments must cover total; strictly idempotent.              |
| **22** | **Receipts**  | `GetReceiptBySale`                     | `GET /api/v1/sales/:saleId/receipt`                                              | `receipts.read`                        | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`, `Trainer`, `Client` |            Read-Only            | Tenant-scoped; Trainer scoped to assigned client; Client strictly scoped to own `clientId`.      |
| **23** | **Receipts**  | `GetReceiptById`                       | `GET /api/v1/receipts/:receiptId`                                                | `receipts.read`                        | `Owner`, `Manager`, `Receptionist`, `Kitchen Staff`, `Trainer`, `Client` |            Read-Only            | Resolves by UUID or sequential `REC-YYYY-XXXXXX`; Client strictly scoped to own `clientId`.      |

---

## 3. Deep-Dive Operational Specifications

### 3.1 Sales Subsystem

#### 1. `CreateSale` (`POST /api/v1/sales`)

- **Required Permission**: `sales.create`
- **Authentication Requirement**: Active Bearer JWT (`AuthenticationGuard`).
- **Resource / Ownership Constraints**: Must bind to caller's `tenantId`. Optional `clientId` must belong to the active tenant.
- **Mutability**: Mutating (Transactional).
- **Domain Invariants**: Initializes in `DRAFT` status with exact zero minor units for subtotal, discount, and total. Idempotency key uniqueness enforced per tenant.
- **Denial Behavior**: Missing token $\to$ `401 Unauthorized`; Missing `sales.create` (e.g. `Trainer`, `Client`) $\to$ `403 Forbidden`; Duplicate idempotency key with differing payload $\to$ `409 Conflict`.
- **Required Tests**:
  - `Owner`, `Receptionist`, and `Kitchen Staff` successfully create draft sale (`201 Created`).
  - `Trainer` and `Client` are rejected (`403 Forbidden`).
  - Unauthenticated request is rejected (`401 Unauthorized`).

#### 2. `AddSaleItem` (`POST /api/v1/sales/:id/items`)

- **Required Permission**: `sales.create`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Target Sale and line item source must belong to caller's `tenantId`.
- **Mutability**: Mutating.
- **Domain Invariants**: Target Sale must be in `DRAFT` status. Mutating a `PENDING_PAYMENT`, `PAID`, or `CANCELLED` sale is rejected with `409 Conflict` (commercial lock invariant). Quantity $\ge 1$. Unit price $\ge 0$.
- **Denial Behavior**: Cross-tenant sale ID $\to$ `404 Not Found`; Sale not in `DRAFT` $\to$ `409 Conflict`; Missing `sales.create` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Adding item to a `PENDING_PAYMENT` or `CANCELLED` sale returns `409 Conflict`.
  - Non-existent sale returns `404 Not Found`.
  - Unauthorized roles return `403 Forbidden`.

#### 3. `RemoveSaleItem` (`DELETE /api/v1/sales/:id/items/:itemId`)

- **Required Permission**: `sales.create`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Target Sale and item must belong to caller's `tenantId`.
- **Mutability**: Mutating.
- **Domain Invariants**: Sale must be in `DRAFT` status. Recalculates parent sale totals deterministically.
- **Denial Behavior**: Sale not in `DRAFT` $\to$ `409 Conflict`; Item not found $\to$ `404 Not Found`; Missing `sales.create` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Removing item from finalized sale returns `409 Conflict`.
  - Item not found returns `404 Not Found`.

#### 4. `ApplyDiscount` (`POST /api/v1/sales/:id/discount`)

- **Required Permission**: `sales.create` (standard promotional discounts) / `sales.manage` (discretionary manager discounts $>15\%$).
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Sale belongs to caller's `tenantId`.
- **Mutability**: Mutating.
- **Domain Invariants**: Sale must be in `DRAFT` status. Discount cannot exceed subtotal. Audit reason required.
- **Denial Behavior**: Discount $> 100\%$ or negative $\to$ `400 Bad Request`; Sale finalized $\to$ `409 Conflict`; Missing permission $\to$ `403 Forbidden`.
- **Required Tests**:
  - Excessive discount returns `400 Bad Request`.
  - Finalized sale returns `409 Conflict`.

#### 5. `CalculateSale` (`GET /api/v1/sales/:id/calculate`)

- **Required Permission**: `sales.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Sale belongs to caller's `tenantId`.
- **Mutability**: Read-Only (Domain calculation without persistence).
- **Domain Invariants**: In-memory derivation of line items, line discounts, and order discount totals with zero minor-unit rounding drift.
- **Denial Behavior**: Missing `sales.read` $\to$ `403 Forbidden`; Sale not found $\to$ `404 Not Found`.
- **Required Tests**:
  - `Trainer` is permitted (`200 OK`).
  - `Client` is rejected (`403 Forbidden`).
  - Database state is verified to be 100% unchanged.

#### 6. `GetSale` (`GET /api/v1/sales/:id`)

- **Required Permission**: `sales.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Sale belongs to caller's `tenantId`. Object-level scoping: Trainers scoped to assigned client sessions; Clients scoped to own `clientId`.
- **Mutability**: Read-Only.
- **Domain Invariants**: Exposes structured Money breakdown without precision loss.
- **Denial Behavior**: Cross-tenant probe $\to$ `404 Not Found`; Missing `sales.read` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Cross-tenant ID query returns `404 Not Found`.
  - Authorized staff roles receive `200 OK`.

#### 7. `ListSales` (`GET /api/v1/sales`)

- **Required Permission**: `sales.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Bound to caller's `tenantId`. Max page limit enforced.
- **Mutability**: Read-Only.
- **Domain Invariants**: Deterministic sort by `createdAt DESC`.
- **Denial Behavior**: Missing `sales.read` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Results contain only records matching caller's `tenantId`.
  - Unauthorized roles return `403 Forbidden`.

#### 8. `FinalizeSale` (`POST /api/v1/sales/:id/finalize`)

- **Required Permission**: `sales.create`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Sale belongs to caller's `tenantId`.
- **Mutability**: Mutating.
- **Domain Invariants**: Sale must be in `DRAFT` status. Must contain $\ge 1$ line item. Empty sale rejected with `422 Unprocessable Entity`. Once finalized, items, discounts, and prices become permanently immutable. Transitions to `PENDING_PAYMENT`.
- **Denial Behavior**: Empty sale $\to$ `422 Unprocessable Entity`; Already finalized $\to$ `409 Conflict`; Missing `sales.create` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Finalizing empty sale returns `422 Unprocessable Entity`.
  - Finalizing already finalized sale returns `409 Conflict`.

#### 9. `CancelSale` (`POST /api/v1/sales/:id/cancel`)

- **Required Permission**: `sales.cancel`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Sale belongs to caller's `tenantId`. Segregation of duties: `Kitchen Staff` and `Trainer` strictly excluded.
- **Mutability**: Mutating (Destructive).
- **Domain Invariants**: Permitted only in `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID`. Sales in `PAID`, `COMPLETED`, or `CANCELLED` cannot be cancelled $\to$ `409 Conflict`. Mandatory cancellation reason.
- **Denial Behavior**: Missing `sales.cancel` (e.g. `Kitchen Staff`) $\to$ `403 Forbidden`; Target sale `PAID` $\to$ `409 Conflict`; Missing reason $\to$ `400 Bad Request`.
- **Required Tests**:
  - `Kitchen Staff` calling cancel receives `403 Forbidden`.
  - Cancelling a `PAID` sale returns `409 Conflict`.
  - Empty cancellation reason returns `400 Bad Request`.

---

### 3.2 Payments Subsystem

#### 10. `CreatePayment` / `RecordPayment` (`POST /api/v1/sales/:saleId/payments`)

- **Required Permission**: `payments.create`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Target Sale must exist within caller's `tenantId`.
- **Mutability**: Mutating (Transactional).
- **Domain Invariants**:
  - Target Sale must be in `PENDING_PAYMENT` or `PARTIALLY_PAID` status. Recording payment on `DRAFT`, `PAID`, or `CANCELLED` sale rejected with `422 Unprocessable Entity`.
  - Currency must match Sale currency.
  - Amount must be strictly positive minor units ($> 0$).
  - Amount cannot exceed remaining unpaid balance (Overpayment invariant).
  - Initializes in `PENDING` status (or `COMPLETED` for cash tender).
- **Denial Behavior**: Unauthenticated $\to$ `401 Unauthorized`; Missing `payments.create` (e.g. `Trainer`, `Client`) $\to$ `403 Forbidden`; Overpayment or unpayable sale $\to$ `422 Unprocessable Entity`.
- **Required Tests**:
  - `Trainer` is rejected with `403 Forbidden`.
  - Overpayment returns `422 Unprocessable Entity`.
  - Payment against `DRAFT` sale returns `422 Unprocessable Entity`.

#### 11. `CompletePayment` / `SettlePayment` (`POST /api/v1/payments/:id/complete`)

- **Required Permission**: `payments.create`, `payments.manage`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Payment and associated Sale must belong to caller's `tenantId`. `Kitchen Staff` excluded from settlement.
- **Mutability**: Mutating (Atomic Financial Settlement).
- **Domain Invariants**:
  - Target Payment must currently be in `PENDING` status.
  - Transitions `PENDING` $\to$ `COMPLETED`. Sets definitive `paidAt` timestamp.
  - Calling on terminal states (`COMPLETED`, `FAILED`, `CANCELLED`) rejected with `422 Unprocessable Entity`.
  - Atomic synchronization: Parent Sale transitions to `PARTIALLY_PAID` or `PAID` in the same transaction.
- **Denial Behavior**: Missing `payments.manage` (e.g. `Kitchen Staff`) $\to$ `403 Forbidden`; Payment already completed/failed $\to$ `422 Unprocessable Entity`; Concurrency conflict $\to$ `409 Conflict`.
- **Required Tests**:
  - `Kitchen Staff` calling complete receives `403 Forbidden`.
  - Calling complete on an already completed payment returns `422 Unprocessable Entity`.
  - Transaction failure rolls back both Payment and Sale.

#### 12. `FailPayment` (`POST /api/v1/payments/:id/fail`)

- **Required Permission**: `payments.create`, `payments.manage`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Payment belongs to caller's `tenantId`.
- **Mutability**: Mutating.
- **Domain Invariants**: Payment must currently be in `PENDING` status. Transitions `PENDING` $\to$ `FAILED`. Terminal states cannot be failed $\to$ `422 Unprocessable Entity`. Does not advance Sale status.
- **Denial Behavior**: Missing `payments.manage` $\to$ `403 Forbidden`; Payment in terminal state $\to$ `422 Unprocessable Entity`.
- **Required Tests**:
  - `Kitchen Staff` calling fail receives `403 Forbidden`.
  - Failing a completed payment returns `422 Unprocessable Entity`.

#### 13. `CancelPayment` (`POST /api/v1/payments/:id/cancel`)

- **Required Permission**: `payments.manage`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Payment belongs to caller's `tenantId`. Strictly restricted to `Owner` and `Manager` (excludes `Receptionist`, `Kitchen Staff`, `Trainer`).
- **Mutability**: Mutating (Sensitive Destructive Void).
- **Domain Invariants**: Payment must be in `PENDING` status. Settled payments (`COMPLETED`) can **never** be cancelled in-place (must follow formal refund workflow) $\to$ `422 Unprocessable Entity`.
- **Denial Behavior**: Calling role `Receptionist` or lacking `payments.manage` $\to$ `403 Forbidden`; Settled payment $\to$ `422 Unprocessable Entity`.
- **Required Tests**:
  - `Receptionist` calling cancel payment receives `403 Forbidden`.
  - `Kitchen Staff` calling cancel payment receives `403 Forbidden`.
  - Cancelling a completed payment returns `422 Unprocessable Entity`.

#### 14. `GetPayment` (`GET /api/v1/payments/:paymentId`)

- **Required Permission**: `payments.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Must belong to caller's `tenantId`. Authorization to view Payment does NOT grant authorization to mutate Sale. Masked cardholder data.
- **Mutability**: Read-Only.
- **Domain Invariants**: Structured monetary representation.
- **Denial Behavior**: Missing `payments.read` (e.g. `Kitchen Staff`, `Trainer`) $\to$ `403 Forbidden`; Cross-tenant ID $\to$ `404 Not Found`.
- **Required Tests**:
  - `Kitchen Staff` and `Trainer` receive `403 Forbidden`.
  - Cross-tenant ID returns `404 Not Found`.

#### 15. `ListPayments` (`GET /api/v1/payments`)

- **Required Permission**: `payments.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Scoped strictly to caller's `tenantId`.
- **Mutability**: Read-Only.
- **Domain Invariants**: Paginated, deterministic sort.
- **Denial Behavior**: Missing `payments.read` $\to$ `403 Forbidden`.
- **Required Tests**:
  - Unauthorized roles return `403 Forbidden`.
  - Returns only caller tenant records.

#### 16. `GetSalePaymentHistory` (`GET /api/v1/sales/:saleId/payments/history`)

- **Required Permission**: `payments.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Target Sale must belong to caller's `tenantId`. **Caller holding access to a different Sale receives zero authority to view this Sale's history.**
- **Mutability**: Read-Only.
- **Domain Invariants**: Chronological audit trail of tenders and settlement attempts.
- **Denial Behavior**: Missing `payments.read` $\to$ `403 Forbidden`; Sale not in caller tenant $\to$ `404 Not Found`.
- **Required Tests**:
  - `Kitchen Staff` and `Trainer` querying payment history receive `403 Forbidden`.
  - Cross-tenant `saleId` returns `404 Not Found`.

---

### 3.3 Receipts Subsystem

#### 17. `IssueReceipt` (`POST /api/v1/sales/:saleId/receipt` & `POST /api/v1/receipts`)

- **Required Permission**: `receipts.manage`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Target Sale must exist within caller's `tenantId`. Zero client-tampered financial inputs (all figures derived server-side from authoritative Sale and Payment aggregates).
- **Mutability**: Mutating (Fiscal Document Issuance).
- **Domain Invariants**:
  - Sale must currently be in `PAID` or `COMPLETED` status. Issuing receipt for `DRAFT` or `CANCELLED` sale rejected with `422 Unprocessable Entity`.
  - Cumulative completed payments must equal or exceed sale total.
  - **Idempotency Invariant**: Strictly idempotent. If a receipt was previously issued for this sale, repeated calls return the existing receipt with `201 Created` without generating duplicate vouchers or numbers.
  - Monotonic receipt numbering (`REC-YYYY-XXXXXX`).
- **Denial Behavior**: Missing `receipts.manage` (e.g. `Kitchen Staff`, `Trainer`, `Client`) $\to$ `403 Forbidden`; Sale not paid $\to$ `422 Unprocessable Entity`; Sale not found $\to$ `404 Not Found`.
- **Required Tests**:
  - User with only `receipts.read` is rejected with `403 Forbidden`.
  - Issuing receipt for `DRAFT` sale returns `422 Unprocessable Entity`.
  - Repeated issuance returns identical voucher idempotently.
  - Cross-tenant user returns `404 Not Found`.

#### 18. `GetReceiptBySale` (`GET /api/v1/sales/:saleId/receipt`)

- **Required Permission**: `receipts.read`
- **Authentication Requirement**: Active Bearer JWT. **Access is NOT public.**
- **Resource / Ownership Constraints**:
  - Must belong to caller's `tenantId`.
  - **Object-Level Ownership Boundary**:
    - `Owner`, `Receptionist`, `Kitchen Staff`: Access any receipt within tenant.
    - `Trainer`: Scoped to receipts for assigned clients.
    - `Client`: Scoped strictly to receipts where `receipt.clientId === currentUser.clientId`. Prohibited from viewing walk-in or other clients' receipts (`403 Forbidden`).
- **Mutability**: Read-Only.
- **Domain Invariants**: Returns frozen historical document state. Revoking permissions later never alters historical receipts.
- **Denial Behavior**: Unauthenticated $\to$ `401 Unauthorized`; Missing `receipts.read` $\to$ `403 Forbidden`; Client accessing another client's receipt $\to$ `403 Forbidden`; Not found $\to$ `404 Not Found`.
- **Required Tests**:
  - Unauthenticated request returns `401 Unauthorized`.
  - Client accessing own receipt returns `200 OK`.
  - Client accessing another member's receipt returns `403 Forbidden`.
  - Client accessing an anonymous walk-in receipt returns `403 Forbidden`.

#### 19. `GetReceiptById` (`GET /api/v1/receipts/:receiptId`)

- **Required Permission**: `receipts.read`
- **Authentication Requirement**: Active Bearer JWT.
- **Resource / Ownership Constraints**: Belongs to caller's `tenantId`. Supports lookup by UUID or alphanumeric receipt number (`REC-YYYY-XXXXXX`). Client role strictly scoped to own `clientId`.
- **Mutability**: Read-Only.
- **Domain Invariants**: Immutable voucher. Sensitive cardholder data masked.
- **Denial Behavior**: Missing `receipts.read` $\to$ `403 Forbidden`; Client attempting cross-client query $\to$ `403 Forbidden`; Not found $\to$ `404 Not Found`.
- **Required Tests**:
  - UUID lookup returns `200 OK`.
  - Receipt number (`REC-`) lookup returns `200 OK`.
  - Empty identifier returns `400 Bad Request`.
  - Cross-client probe returns `403 Forbidden`.

---

## 4. Internal Service-to-Service Workflows & Isolation Boundaries

To maintain zero trust and prevent unintended invocation of sensitive internal routines, internal workflows are segregated from external HTTP ingress:

### 4.1 Automatic Receipt Issuance (Event-Driven / Synchronous Settle Trigger)

- **Workflow Description**: When a payment is marked `COMPLETED` and the aggregate detects full satisfaction of the sale balance (`SaleStatus.PAID`), the system automatically coordinates receipt issuance.
- **Protection Architecture**:
  - **Not Exposed via Public Controller**: The internal coordinator does not bind to any unauthenticated HTTP controller route.
  - **Execution Context**: Internal background tasks and event listeners execute within a synthesized `SystemUserContext` (System principal) wrapped by `RequestContext.run()`.
  - **Audit Immutability**: The issuance record logs `issuedBy: 'system-settlement-worker'`, preventing external callers from forging issuance audit trails.

### 4.2 Receipt Reprinting Workflow (`ReprintReceiptHandler`)

- **Workflow Description**: Handles official fiscal voucher reprinting, incrementing monotonic reprint counters (`reprintCount`) and recording reprint audit log events.
- **Protection Architecture**:
  - **Application Boundary**: `ReprintReceiptHandler` (`reprint-receipt.handler.ts`) currently exists solely as an application use case without an active standalone HTTP route in `ReceiptsController`.
  - **Governing Security Contract**: When exposed via HTTP (e.g. `POST /api/v1/receipts/:id/reprint`), it must be guarded by:
    - `@UseGuards(AuthenticationGuard, AuthorizationGuard)`
    - `@Roles('Owner', 'Manager', 'Receptionist')`
    - `@Permissions('receipts.manage')`
  - **Prohibited Callers**: `Kitchen Staff`, `Trainer`, and `Client` are strictly denied reprinting capabilities to prevent fiscal voucher forgery.

---

## 5. Security Test Verification Matrix

Every operation in the matrix is mapped to mandatory automated security tests in `apps/api/src/sales/__tests__/`:

| Test Suite File                                                                                                                          | Tested Operations                                                                                                         | Security Assertions Enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| :--------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`sales.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/sales.authorization.spec.ts)**       | `CreateSale`, `AddSaleItem`, `RemoveSaleItem`, `ApplyDiscount`, `CalculateSale`, `GetSale`, `ListSales`, `CancelSale`     | • Route decorator reflection (`@Roles`, `@Permissions`)<br>• Permitted persona execution (`Owner`, `Receptionist`)<br>• Least-privilege denial for `Kitchen Staff` on `CancelSale` (403)<br>• Least-privilege denial for `Trainer` on all mutations (403)<br>• Zero-trust denial for `Client` on staff routes (403)<br>• Rejection of unauthenticated requests (401)<br>• Domain aggregate ignorance of auth frameworks                                                                    |
| **[`payments.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/payments.authorization.spec.ts)** | `CreatePayment`, `CompletePayment`, `FailPayment`, `CancelPayment`, `GetPayment`, `ListPayments`, `GetSalePaymentHistory` | • Route decorator reflection (`@Roles`, `@Permissions`)<br>• Permitted persona execution (`Owner`, `Receptionist`)<br>• Least-privilege denial for `Receptionist` on `CancelPayment` (403)<br>• Least-privilege denial for `Kitchen Staff` on settlement and audit (403)<br>• Segregation of duties for `Trainer` across all payment routes (403)<br>• Pre-mutation and pre-persistence rejection                                                                                          |
| **[`receipts-api.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/receipts-api.spec.ts)**                     | `IssueReceipt`, `GetReceipt`, `GetReceiptBySaleId`                                                                        | • Denial of users lacking `receipts.manage` on issuance (403)<br>• Denial of users lacking `receipts.read` on retrieval (403)<br>• Cross-tenant isolation rejection (404)<br>• Invariant enforcement: rejection on `DRAFT` and `CANCELLED` sales (422)<br>• Idempotent repeated issuance (201)<br>• Object-level ownership boundary: Client viewing another client's receipt (403)<br>• Client viewing anonymous walk-in receipt (403)<br>• Prevention of cardholder data / PAN disclosure |
