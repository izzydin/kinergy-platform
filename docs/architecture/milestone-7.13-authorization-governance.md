# Milestone 7.13: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Governance

- **Document**: `docs/architecture/milestone-7.13-authorization-governance.md`
- **Status**: **AUTHORITATIVE ARCHITECTURAL SPECIFICATION & GOVERNANCE REPORT**
- **Date**: 2026-10-12
- **Milestone**: **Phase 7 — Milestone 7.13: Authorization & Security**
- **Scope**: Presentation Boundary (`apps/api/src/sales/controllers/`), Application Core (`packages/core/src/sales/application/`), Identity Authority (`apps/api/src/platform/identity/authorization/`), Frontend Security (`apps/web/src/modules/auth/`)
- **Authoritative ADR**: [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](../adr/0135-sales-payments-receipts-authorization-and-security.md)
- **Consulted Specifications**:
  - [ADR-0024: Authentication Guard Architecture](../adr/0024-authentication-guard-architecture.md)
  - [ADR-0025: Role and Permission Authorization Framework](../adr/0025-role-and-permission-authorization-framework.md)
  - [ADR-0027: Authenticated Request Context Architecture](../adr/0027-authenticated-request-context-architecture.md)
  - [ADR-0028: Extracted Authorization Decision Engine](../adr/0028-extracted-authorization-decision-engine.md)
  - [ADR-0038: Authentication Hardening, Information Disclosure Prevention & Secret Validation](../adr/0038-authentication-hardening-and-generic-error-handling.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Integrity](../adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Persistence Boundaries](../adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [Platform Role & Permission Matrix Specification](../security/role-permission-matrix.md)
  - [Sales, Payments & Receipts External Operations Authorization Matrix](../security/sales-payments-receipts-authorization-matrix.md)

---

## 1. Executive Summary & Governance Charter

Milestones 7.1 through 7.12 established pure financial aggregates (`Sale`, `Payment`, `Receipt`), relational PostgreSQL persistence schemas, deterministic integer-cent financial arithmetic (`Money`), and comprehensive application use cases.

**Milestone 7.13 delivers the definitive Authorization, IAM Integration, and Security Governance framework** for all commercial sales, monetary settlement, and fiscal voucher operations.

### Governance Charter Principles

1. **Single Authority Reuse**: Phase 1 IAM (`apps/api/src/platform/identity/`) is the sole and exclusive authority for identity, credentials, roles, and permissions. Phase 7 introduces **zero parallel permission tables**, zero custom authorization engines, and zero divergent auth protocols.
2. **Layered Decoupling & Absolute Domain Purity**: The Domain layer (`packages/core/src/sales/domain/`) remains 100% pure TypeScript. Domain aggregates and value objects have **zero awareness** of JWT tokens, HTTP concepts, NestJS guards, user roles, or permissions.
3. **Defense-in-Depth Enforcement**: Transport guards protect external ingress points; application handlers enforce tenant boundaries and current-user propagation; domain aggregates enforce business invariants and state machines.
4. **Information Disclosure Prevention**: Compliant with OWASP ASVS Level 2 and [ADR-0038](../adr/0038-authentication-hardening-and-generic-error-handling.md). Unauthenticated requests yield generic `401 Unauthorized`; unauthorized requests yield generic `403 Forbidden`; cross-tenant probes yield `404 Not Found` to prevent entity enumeration.
5. **Executable Verification & Proof of Non-Mutation**: Every documented role, permission, and operation is backed by executable automated tests. Denied mutation requests are mathematically proven to result in zero database persistence calls (`saveCount === 0`).

---

## 2. Final Permission Catalog

In strict compliance with [ADR-0025](../adr/0025-role-and-permission-authorization-framework.md), [ADR-0111](../adr/0111-sales-payments-authorization-and-audit.md), and [ADR-0135](../adr/0135-sales-payments-receipts-authorization-and-security.md), permissions are standardized using **hierarchical dot-notation** (`<bounded_context>.<action>`).

All 9 Phase 7 permissions are authoritatively seeded into the PostgreSQL database (`permissions` table) via `prisma/seeds/identity.seed.ts`:

| Permission Code       | Bounded Context | Operational Scope & Capabilities                                                                                                              | Risk Tier                 |
| :-------------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------ |
| **`sales.read`**      | Sales           | Query sales orders, line-item snapshots, order totals, order status, and sale payment history.                                                | **Read-Only**             |
| **`sales.create`**    | Sales           | Initiate draft checkout sessions, add/remove items to draft carts, calculate totals, apply standard promotional discounts, finalize orders.   | **Transactional**         |
| **`sales.manage`**    | Sales           | Apply discretionary discounts ($> 15\%$), execute price overrides, update commercial metadata, coordinate cross-aggregate payment settlement. | **Financially Sensitive** |
| **`sales.cancel`**    | Sales           | Cancel or void a draft or finalized sale prior to fulfillment (requires non-empty business reason).                                           | **Destructive**           |
| **`payments.read`**   | Payments        | View payment transaction ledgers, tender methods (Cash, Card, QR), settlement timestamps, external transaction references, and statuses.      | **Read-Only**             |
| **`payments.create`** | Payments        | Record cash collection, trigger card terminal pre-authorization, capture electronic tender, initiate payment records.                         | **Transactional**         |
| **`payments.manage`** | Payments        | Settle manual payment exceptions, process chargeback adjustments, void/cancel pending tenders, fail stalled transactions.                     | **Financially Sensitive** |
| **`receipts.read`**   | Receipts        | Query, view, and render customer proof-of-purchase vouchers for settled commercial transactions.                                              | **Read-Only**             |
| **`receipts.manage`** | Receipts        | Authorize official receipt reprints, issue duplicate vouchers, generate fiscal tax credit notes.                                              | **Financially Sensitive** |

### Backward Compatibility & Notation Normalization

1. **Legacy Phase 1 Billing Aliases**:
   - `billing.read` automatically grants `sales.read`, `payments.read`, and `receipts.read`.
   - `billing.write` automatically grants `sales.create` and `payments.create`.
   - High-risk operations (`sales.manage`, `sales.cancel`, `payments.manage`, `receipts.manage`) **strictly require** their dedicated fine-grained permission.
2. **Colon-Notation Normalization**:
   - External systems or legacy tokens using colon notation (`sales:read`, `receipts:manage`) are dynamically normalized to dot-notation (`sales.read`, `receipts.manage`) within `DefaultPermissionResolver` and `checkReceiptAuthorization()`.

---

## 3. Approved Role-to-Permission Mapping

Role assignments are authoritatively defined in `prisma/seeds/identity.seed.ts` (`SYSTEM_ROLE_DEFINITIONS`) and governed by [ADR-0135 Section 12](../adr/0135-sales-payments-receipts-authorization-and-security.md):

| System Role         | `sales.read` | `sales.create` | `sales.manage` | `sales.cancel` | `payments.read` | `payments.create` | `payments.manage` | `receipts.read` | `receipts.manage` | Operational Role Charter                                                                                      |
| :------------------ | :----------: | :------------: | :------------: | :------------: | :-------------: | :---------------: | :---------------: | :-------------: | :---------------: | :------------------------------------------------------------------------------------------------------------ |
| **Owner**           |      ✅      |       ✅       |       ✅       |       ✅       |       ✅        |        ✅         |        ✅         |       ✅        |        ✅         | Platform Super Admin; full discretionary authority across all commercial, tender, and fiscal operations.      |
| **Manager**         |      ✅      |       ✅       |       ✅       |       ✅       |       ✅        |        ✅         |        ✅         |       ✅        |        ✅         | Operational supervisor; full access to sales, payments, refunds, voids, and receipt management.               |
| **Receptionist**    |      ✅      |       ✅       |       ❌       |       ✅       |       ✅        |        ✅         |        ❌         |       ✅        |        ✅         | Front desk staff; commercial intake, checkout, draft cancellation, standard payments, and receipt reprinting. |
| **Kitchen Staff**   |      ✅      |       ✅       |       ❌       |       ❌       |       ❌        |        ✅         |        ❌         |       ✅        |        ❌         | Counter POS food/beverage checkout; cannot cancel sales, settle exceptions, or view full payment ledgers.     |
| **Trainer**         |      ✅      |       ❌       |       ❌       |       ❌       |       ❌        |        ❌         |        ❌         |       ✅        |        ❌         | Client training verification; read-only access to sales and receipts; zero mutation or payment authority.     |
| **Client / Member** |      ❌      |       ❌       |       ❌       |       ❌       |       ❌        |        ❌         |        ❌         |       ✅        |        ❌         | Self-service voucher access; read access strictly scoped to own `clientId`; zero staff endpoint access.       |

---

## 4. Complete Operation-Level Authorization Matrix (24 Protected Operations)

The table below catalogs every externally reachable route across `SalesController`, `PaymentsController`, and `ReceiptsController` in `apps/api/src/sales/controllers/`:

|   #    | Subsystem | Controller Method       | Route & HTTP Verb                                                 | Required Permission                    | Authorized Roles                                             | Op Tier     | Invariants & Security Constraints                                                |
| :----: | :-------- | :---------------------- | :---------------------------------------------------------------- | :------------------------------------- | :----------------------------------------------------------- | :---------- | :------------------------------------------------------------------------------- |
| **1**  | Sales     | `createSale`            | `POST /api/v1/sales`                                              | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Initializes `DRAFT`; zero initial totals; idempotent key scoped to tenant.       |
| **2**  | Sales     | `getSale`               | `GET /api/v1/sales/:id`                                           | `sales.read`                           | Owner, Manager, Receptionist, Kitchen Staff, Trainer         | Read-Only   | Tenant-scoped; Trainer scoped to client; returns 404 for cross-tenant.           |
| **3**  | Sales     | `addItem`               | `POST /api/v1/sales/:id/items`                                    | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Sale must be `DRAFT`; item source in tenant; recalculates totals.                |
| **4**  | Sales     | `removeItem`            | `DELETE /api/v1/sales/:id/items/:itemId`                          | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Sale must be `DRAFT`; item must belong to sale; recalculates totals.             |
| **5**  | Sales     | `applyDiscount`         | `POST /api/v1/sales/:id/discount`                                 | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Sale must be `DRAFT`; discount $\le$ subtotal; non-empty audit reason.           |
| **6**  | Sales     | `removeDiscount`        | `DELETE /api/v1/sales/:id/discount`                               | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Sale must be `DRAFT`; resets discount to zero minor units.                       |
| **7**  | Sales     | `finalizeSale`          | `POST /api/v1/sales/:id/finalize`                                 | `sales.create`                         | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Transitions `DRAFT` $\to$ `PENDING_PAYMENT`; requires $\ge 1$ item; locks terms. |
| **8**  | Sales     | `cancelSale`            | `POST /api/v1/sales/:id/cancel`                                   | `sales.cancel`                         | Owner, Manager, Receptionist                                 | Destructive | Allowed in `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`; reason required.        |
| **9**  | Sales     | `assignSource`          | `POST /api/v1/sales/:id/source`                                   | `sales.create`                         | Owner, Manager, Receptionist                                 | Mutating    | Permitted only in `DRAFT`; immutable once set or finalized.                      |
| **10** | Sales     | `calculateSale`         | `GET /api/v1/sales/:id/calculate`                                 | `sales.read`                           | Owner, Manager, Receptionist, Kitchen Staff, Trainer         | Read-Only   | In-memory recalculation of minor-unit totals; zero persistence side effects.     |
| **11** | Sales     | `listSales`             | `GET /api/v1/sales`                                               | `sales.read`                           | Owner, Manager, Receptionist, Kitchen Staff, Trainer         | Read-Only   | Paginated; bounded limits; tenant-scoped; sort `createdAt DESC`.                 |
| **12** | Sales     | `coordinatePayment`     | `POST /api/v1/sales/:id/coordinate-payment`                       | `sales.create`<br>`payments.manage`    | Owner, Manager, Receptionist                                 | Mutating    | Coordinates external payment tender; advances sale to `PAID`.                    |
| **13** | Payments  | `recordPayment`         | `POST /api/v1/sales/:saleId/payments`<br>`POST /api/v1/payments`  | `payments.create`                      | Owner, Manager, Receptionist, Kitchen Staff                  | Mutating    | Sale must be `PENDING_PAYMENT` or `PARTIALLY_PAID`; positive amount.             |
| **14** | Payments  | `getPaymentById`        | `GET /api/v1/payments/:id`                                        | `payments.read`                        | Owner, Manager, Receptionist                                 | Read-Only   | Tenant-scoped; masked cardholder data (PAN/CVV).                                 |
| **15** | Payments  | `getPaymentsBySaleId`   | `GET /api/v1/sales/:saleId/payments`                              | `payments.read`                        | Owner, Manager, Receptionist                                 | Read-Only   | Tenant-scoped; resolves all tender records for parent sale.                      |
| **16** | Payments  | `getSalePaymentHistory` | `GET /api/v1/sales/:saleId/payments/history`                      | `payments.read`                        | Owner, Manager, Receptionist                                 | Read-Only   | Chronological tender audit history; strictly scoped to requested sale.           |
| **17** | Payments  | `completePayment`       | `POST /api/v1/payments/:id/complete`                              | `payments.create`<br>`payments.manage` | Owner, Manager, Receptionist                                 | Mutating    | Target payment must be `PENDING`; transitions to `COMPLETED`; syncs Sale.        |
| **18** | Payments  | `settlePayment`         | `POST /api/v1/payments/:id/settle`                                | `payments.create`<br>`payments.manage` | Owner, Manager, Receptionist                                 | Mutating    | Alias for completion; atomic settlement + balance reconciliation.                |
| **19** | Payments  | `failPayment`           | `POST /api/v1/payments/:id/fail`                                  | `payments.create`<br>`payments.manage` | Owner, Manager, Receptionist                                 | Mutating    | Target payment must be `PENDING`; transitions to `FAILED`.                       |
| **20** | Payments  | `cancelPayment`         | `POST /api/v1/payments/:id/cancel`                                | `payments.manage`                      | Owner, Manager                                               | Destructive | Target payment must be `PENDING`; transitions to `CANCELLED`.                    |
| **21** | Payments  | `listPayments`          | `GET /api/v1/payments`                                            | `payments.read`                        | Owner, Manager, Receptionist                                 | Read-Only   | Paginated; bounded limits; filtered by `tenantId`.                               |
| **22** | Receipts  | `issueReceipt`          | `POST /api/v1/sales/:saleId/receipt`                              | `receipts.manage`                      | Owner, Manager, Receptionist                                 | Fiscal Doc  | Sale must be `PAID` or `COMPLETED`; full tender coverage; idempotent.            |
| **23** | Receipts  | `issueReceiptDirect`    | `POST /api/v1/receipts`                                           | `receipts.manage`                      | Owner, Manager, Receptionist                                 | Fiscal Doc  | Direct body endpoint; saleId in payload; identical issuance rules.               |
| **24** | Receipts  | `getReceiptById`        | `GET /api/v1/receipts/:id`<br>`GET /api/v1/sales/:saleId/receipt` | `receipts.read`                        | Owner, Manager, Receptionist, Kitchen Staff, Trainer, Client | Read-Only   | Resolves by UUID or `REC-YYYY-XXXXXX`; Client scoped to own `clientId`.          |

---

## 5. Architectural Enforcement Boundaries

The platform strictly segregates responsibilities across four architectural tiers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PRESENTATION BOUNDARY (HTTP Transport / NestJS Controllers)                         │
│                                                                                        │
│   • AuthenticationGuard: Cryptographic JWT verification, expiry, active status check.  │
│   • RequestContext: Binds AuthenticatedUserContext into AsyncLocalStorage.             │
│   • AuthorizationGuard: Reads @Roles() and @Permissions() via Reflector.               │
│   • DefaultAuthorizationEvaluator: Computes capability decision (ALLOW / DENY).        │
│   • SalesExceptionFilter: Formats rejections (401, 403, 404, 409, 422).                │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Sanitized DTO + Verified UserContext
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. APPLICATION ORCHESTRATION BOUNDARY (Use Cases & Handlers)                           │
│                                                                                        │
│   • Coordinates Unit of Work (IUnitOfWork) across transaction boundaries.              │
│   • Enforces multi-tenant isolation: asserts command.tenantId === context.tenantId.    │
│   • Enforces Object-Level Access (BOLA): verifies client/trainer ownership filters.    │
│   • Coordinates cross-aggregate workflows (e.g. CompletePayment -> Sale.markPaid).     │
│   • Dispatches security and financial audit events (ISecurityEventPublisher).          │
│   • ZERO framework, HTTP, JWT, or NestJS guard dependencies.                           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Calls pure aggregate methods
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. PURE DOMAIN BOUNDARY (Aggregates, Entities, Value Objects)                          │
│                                                                                        │
│   • Aggregates: Sale, Payment, Receipt.                                                │
│   • Value Objects: Money, LineItemDiscount, OrderNumber, ReceiptNumber, SaleSource.    │
│   • Enforces state machine transitions (e.g., DRAFT -> PENDING_PAYMENT -> PAID).       │
│   • Enforces mathematical invariants (non-negative money, rounding, overpayment reject)│
│   • COMPLETELY AGNOSTIC to caller identity, roles, permissions, and security context.  │
│   • ZERO framework, ORM, HTTP, or database dependencies.                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Distinction: Authentication vs. Authorization vs. Domain Invariants

A critical principle of Kinergy's Clean Architecture is the rigorous separation of concerns between identity, permissions, and business rules:

| Dimension             | Authentication                                      | Authorization                                         | Domain Invariants                                                |
| :-------------------- | :-------------------------------------------------- | :---------------------------------------------------- | :--------------------------------------------------------------- |
| **Question Answered** | _"Who are you?"_                                    | _"What are you allowed to attempt?"_                  | _"Is this operation legally and mathematically valid?"_          |
| **Enforcement Tier**  | Presentation Boundary (`AuthenticationGuard`)       | Presentation Boundary (`AuthorizationGuard`)          | Pure Domain Layer (`Sale`, `Payment`, `Receipt`)                 |
| **Context Aware**     | Cryptographic token, issuer, expiry, account status | User roles, granted permission strings, tenant ID     | State machine status, minor-unit money totals, item counts       |
| **Failure Response**  | `401 Unauthorized`                                  | `403 Forbidden` (or `404 Not Found` for cross-tenant) | `409 Conflict` (State error) or `422 Unprocessable` (Math error) |
| **Example Scenario**  | Expired access token                                | Receptionist attempting to cancel a settled Payment   | Owner attempting to record a \$100 payment against a \$50 sale   |

### The Invariant Independence Rule

> **Core Security Invariant**: An authorized role or high-privilege permission **never** permits bypassing domain invariants.
>
> Even an `Owner` possessing full `sales.manage` and `payments.manage` permissions will be authoritatively rejected with `PaymentOverpaymentException` if the tendered amount exceeds the remaining sale balance, or rejected with `SaleClosedException` if attempting to add items to a finalized sale. Authorization grants the right to _attempt_ an action; domain logic dictates whether the action is _valid_.

---

## 7. Protected Sales, Payment, and Receipt Resources

### 7.1 Cross-Tenant Isolation & Resource Probing Defense (ADR-0135 §9)

1. **Physical Tenant Scoping**: Every database query includes `where: { tenantId }`.
2. **Uniform 404 Behavior**: If a caller in Tenant A requests a resource ID belonging to Tenant B, the API returns `404 Not Found` (never `403 Forbidden`). This prevents malicious actors from determining whether an ID exists in another tenant.
3. **Audit Dispatch**: A `SecurityEventType.CROSS_TENANT_ACCESS_ATTEMPT` telemetry event is dispatched asynchronously to the security audit pipeline.

### 7.2 Object-Level Authorization (BOLA Defense)

- **Trainers**: Scoped to view sales and receipts associated with clients assigned to them for training or clinical kinesiology sessions.
- **Clients**: Scoped exclusively to records where `sale.clientId === context.clientId` or `receipt.clientSnapshot.clientId === context.clientId`. Probing another client's receipt results in `403 Forbidden`.

### 7.3 Cardholder Data Protection (PCI-DSS Scoping)

- Payments do not store raw card numbers (PAN) or verification values (CVV).
- Repositories persist masked tokens and external gateway references.
- DTO responses serialize only safe tender metadata (e.g. `lastFour: '4242'`, `brand: 'VISA'`).

### 7.4 Fiscal Receipt Immutability (ADR-0117, ADR-0118)

- **Append-Only Document**: Once issued, `Receipt` entities cannot be updated or deleted. There is no `receipts.update` or `receipts.delete` permission.
- **Historical Snapshot**: Line items, taxes, and customer legal names are frozen in PostgreSQL `JSONB` snapshot columns (`items_snapshot`, `client_snapshot`). Subsequent catalog price changes or client profile updates do not retroactively alter issued vouchers.

---

## 8. Trusted Internal Workflows

Internal system routines (event handlers, background jobs, automated reconciliation, and synchronous settlement listeners) execute outside the HTTP transport layer:

```typescript
// Canonical Internal Execution Pattern:
export const SYSTEM_USER_CONTEXT: AuthenticatedUserContext = new AuthenticatedUserContext({
  userId: 'system-internal-worker',
  email: 'system@kinergy.local',
  status: 'ACTIVE',
  roles: ['SystemAdmin'],
  permissions: ['*'],
  tenantId: tenantId, // Scoped to target tenant
});

await RequestContext.run(SYSTEM_USER_CONTEXT, async () => {
  await handler.execute(internalCommand);
});
```

1. **Non-Exposure via Public Routes**: Automatic receipt issuance during `CompletePayment` executes as an internal orchestration step, not via an unauthenticated HTTP endpoint.
2. **Execution Context**: Internal handlers execute inside a synthesized `SystemUserContext` scoped to the target tenant and run within `RequestContext.run()`.
3. **Audit Provenance**: Internal state changes record `createdBy: 'system-settlement-worker'`, preventing external callers from forging automated settlement records.

---

## 9. Test Strategy & Verification Pyramid

The authorization architecture is backed by an automated 6-level test pyramid:

```
                   ▲
                  / \     Level 6: Cross-Module Coordination Tests (10 tests)
                 /   \    Level 5: Persistence Non-Mutation Tests (8 tests)
                /     \   Level 4: Application Use Case & Tenant Tests (12 tests)
               /       \  Level 3: Controller Route Integration Tests (24 routes)
              /         \ Level 2: Evaluator & Guard Fail-Closed Tests (6 tests)
             /           \Level 1: Permission Catalog & Normalization (5 tests)
            ───────────────
```

### Complete Test Suite Inventory

| Test Suite File                                                                                                                                                         | Test Scope & Level             | Key Assertions & Scenarios Verified                                                                                                                                               |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts)                          | Levels 1–6 (Comprehensive)     | Complete 65-test suite covering metadata reflection, normalization, guard wiring, all 24 routes, tenant isolation, spy repository non-mutation, and cross-aggregate coordination. |
| [`sales.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/sales.authorization.spec.ts)                                          | Sales Presentation & RBAC      | Evaluates all 8 core Sales routes; validates least privilege for Owner, Manager, Receptionist, Kitchen Staff, Trainer, Client; verifies pre-mutation rejection.                   |
| [`payments.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/payments.authorization.spec.ts)                                    | Payment Presentation & RBAC    | Evaluates all Payment routes; validates settlement authority; asserts Receptionist cannot cancel payments; asserts Trainer has zero payment authority.                            |
| [`receipts-api.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/receipts-api.spec.ts)                                                        | Receipts API & Object Security | Asserts 403 on missing `receipts.manage`; asserts 404 on cross-tenant probes; verifies idempotent repeated issuance; asserts client BOLA ownership isolation.                     |
| [`phase7-frontend-permission-security.spec.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/auth/__tests__/phase7-frontend-permission-security.spec.tsx) | Frontend IAM Integration       | Verifies UI permission guards, action button disabling, and client route navigation adhering to the Phase 7 IAM hierarchy.                                                        |

### Proof of Non-Mutation on Authorization Failure

Persistence integration tests (Level 5) utilize Spy Repositories (`SpySaleRepository`, `SpyPaymentRepository`, `SpyReceiptRepository`) that track `saveCount`.

- When an unauthorized caller attempts a mutation (e.g. Kitchen Staff attempting `POST /sales/:id/cancel`), the request terminates at `AuthorizationGuard` before handler execution.
- The test asserts:
  ```typescript
  expect(spySaleRepository.saveCount).toBe(0);
  ```
- Result: **Mathematical proof that unauthorized requests leave the database completely untouched.**

---

## 10. Deferred Decisions & Limitations Genuinely Unresolved

In accordance with Kinergy's IAM least-privilege policy and [ADR-0135 Section 13](../adr/0135-sales-payments-receipts-authorization-and-security.md), four business decisions remain open and are not silently granted via broad access:

### Decision 1: Discretionary Discount Threshold & Front Desk Escalation

- **Context**: Standard checkout uses `sales.create`. Discretionary discounts $> 15\%$ represent financial leak vectors requiring manager oversight (`sales.manage`).
- **Current Baseline Enforcement**: `Receptionist` is granted `sales.create` and denied `sales.manage`.
- **Open Product Decision**:
  - _Option A_: Fixed percentage threshold ($\le 15\%$ allowed with `sales.create`; $> 15\%$ strictly requires `sales.manage`).
  - _Option B_: Flat dollar cap per order (e.g., up to \$20 allowed without manager sign-off).
  - _Option C_: Zero staff discretionary discounts; staff may only apply pre-configured promo codes.
- **Interim Security Posture**: `sales.create` permits standard promotional discounts; arbitrary price overrides and discretionary manager discounts strictly require `sales.manage` (Owner/Manager).

### Decision 2: Kitchen Staff POS Receipt Reprint Authority

- **Context**: Kitchen staff ring up counter food/beverage orders and need to give customers proof of purchase upon payment.
- **Current Baseline Enforcement**: `Kitchen Staff` is granted `receipts.read` (permitting immediate generation of customer vouchers upon sale settlement), but denied `receipts.manage`.
- **Open Product Decision**: Should kitchen personnel be authorized to perform formal re-prints with monotonic reprint counters if a customer damages their voucher, or must reprint requests be directed to the front-desk Receptionist?
- **Interim Security Posture**: `receipts.manage` is withheld from `Kitchen Staff`. Only `Receptionist` and `Owner` retain voucher reprinting authority.

### Decision 3: Trainer Sales Query Scoping Policy

- **Context**: Trainers need to confirm whether clients possess active paid training or kinesiology packages prior to conducting sessions ([ADR-0074](../adr/0074-trainer-operational-authorization-boundary-and-object-level-scoping-policy.md)).
- **Current Baseline Enforcement**: `Trainer` is granted `sales.read` and `receipts.read`, but strictly denied all mutation permissions (`sales.create`, `sales.manage`, `sales.cancel`) and all payment permissions (`payments.*`).
- **Open Product Decision**: Should `sales.read` for Trainers be physically scoped at the database/query layer exclusively to sales containing session/package line items assigned to that trainer, or are trainers permitted to view general gym retail orders within the tenant?
- **Interim Security Posture**: At the HTTP transport layer, `sales.read` is required. Object-level filtering in application queries scopes access to assigned client records, preventing unauthorized browsing of tenant-wide retail revenue.

### Decision 4: Client Self-Service Portal Permission Strategy

- **Context**: Future mobile and web self-service will allow gym members (clients) to inspect their own receipts and past purchases.
- **Current Baseline Enforcement**: The `Client` role has zero system permissions in `SYSTEM_ROLE_DEFINITIONS`.
- **Open Product Decision**: Should gym members receive granular role permissions (e.g., `sales.self.read`, `receipts.self.read`), or should they receive canonical `receipts.read` paired with strict ABAC ownership filters (`where: { clientId: currentUser.clientId }`)?
- **Interim Security Posture**: Clients cannot access staff endpoints. In client portal routes, strict ownership checks ensure clients can never query other members' financial records.

---

## 11. Traceability & Source-of-Truth Directory

The table below maps each security concern to its authoritative source code implementation and documentation:

| Concern                            | Authoritative Specification File                                                                                                                                                                                                                                      | Authoritative Source Code File                                                                                                                      | Verification Test File                                                                                                                                                  |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Permission Catalog**             | [`docs/security/role-permission-matrix.md`](file:///c:/Projects/kinergy-platform/docs/security/role-permission-matrix.md)                                                                                                                                             | [`prisma/seeds/identity.seed.ts`](file:///c:/Projects/kinergy-platform/prisma/seeds/identity.seed.ts#L48-L95)                                       | [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts) (Level 1)                |
| **Role-Permission Mappings**       | [`docs/adr/0135-...`](file:///c:/Projects/kinergy-platform/docs/adr/0135-sales-payments-receipts-authorization-and-security.md#L461-L516)                                                                                                                             | [`prisma/seeds/identity.seed.ts`](file:///c:/Projects/kinergy-platform/prisma/seeds/identity.seed.ts#L114-L180)                                     | [`sales.authorization.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/sales.authorization.spec.ts)                                          |
| **Operation Matrix (24 routes)**   | [`docs/security/sales-payments-receipts-...`](file:///c:/Projects/kinergy-platform/docs/security/sales-payments-receipts-authorization-matrix.md#L25-L54)                                                                                                             | `apps/api/src/sales/controllers/`                                                                                                                   | [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts) (Level 3)                |
| **Transport Guard Enforcement**    | [`docs/adr/0024-...`](file:///c:/Projects/kinergy-platform/docs/adr/0024-authentication-guard-architecture.md), [`ADR-0028`](file:///c:/Projects/kinergy-platform/docs/adr/0028-extracted-authorization-decision-engine.md)                                           | [`apps/api/src/platform/identity/authorization/`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/authorization/)               | [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts) (Level 2)                |
| **Context Propagation**            | [`docs/adr/0027-...`](file:///c:/Projects/kinergy-platform/docs/adr/0027-authenticated-request-context-architecture.md)                                                                                                                                               | [`apps/api/src/platform/identity/request-context.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/platform/identity/request-context.ts)       | `apps/api/src/sales/__tests__/` (All suites)                                                                                                                            |
| **Tenant Isolation & Generic 404** | [`docs/adr/0038-...`](file:///c:/Projects/kinergy-platform/docs/adr/0038-authentication-hardening-and-generic-error-handling.md), [`ADR-0135 §9`](file:///c:/Projects/kinergy-platform/docs/adr/0135-sales-payments-receipts-authorization-and-security.md#L386-L406) | [`apps/api/src/sales/filters/sales-exception.filter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/filters/sales-exception.filter.ts) | [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts) (Level 4)                |
| **Persistence Non-Mutation**       | [`docs/adr/0125-...`](file:///c:/Projects/kinergy-platform/docs/adr/0125-phase-7-transaction-architecture-and-atomic-boundaries.md)                                                                                                                                   | `packages/core/src/sales/infrastructure/`                                                                                                           | [`phase7-authorization-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/phase7-authorization-matrix.spec.ts) (Level 5)                |
| **Receipt Immutability**           | [`docs/adr/0117-...`](file:///c:/Projects/kinergy-platform/docs/adr/0117-receipt-domain-boundary-and-document-model.md), [`ADR-0118`](file:///c:/Projects/kinergy-platform/docs/adr/0118-sale-reference-and-receipt-identification-strategy.md)                       | [`packages/core/src/sales/domain/receipt.aggregate.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/receipt.aggregate.ts)   | [`receipts-api.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/receipts-api.spec.ts)                                                        |
| **Frontend Security Matching**     | [`docs/frontend/architecture.md`](file:///c:/Projects/kinergy-platform/docs/frontend/architecture.md)                                                                                                                                                                 | [`apps/web/src/modules/auth/`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/auth/)                                                     | [`phase7-frontend-permission-security.spec.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/auth/__tests__/phase7-frontend-permission-security.spec.tsx) |
