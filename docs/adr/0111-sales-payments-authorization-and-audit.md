# 0111. Sales & Payments Authorization, Organization Isolation, and Audit Boundaries

- **Status**: Accepted
- **Date**: 2026-09-17
- **Deciders**: Security Architect, Principal Domain Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments). The system processes customer payments, manages cash drawers, enforces multi-tenant business isolation, tracks financial audits, and interfaces with credit card payment providers. We must establish authorization permissions, strict tenant boundaries, audit event classification, and sensitive cardholder data protection policies.

---

## 1. Context and Problem Statement

Commercial transactions and payment processing introduce acute security, compliance, and multi-tenant isolation risks:

1. **Privilege Creep & Unauthorized Financial Actions**: Discretionary discounts, order cancellations, and refunds directly affect corporate revenue. Without fine-grained permissions, unauthorized staff could issue fraudulent discounts or wipe out settled transactions.
2. **Cross-Tenant Data Exposure**: In a multi-tenant platform, an organization must never be able to view, query, settle, or reference sales, payments, receipts, or catalog items belonging to another tenant.
3. **Audit Log Flooding vs. Financial Accountability**: Logging every transient keystroke (e.g. typing an item quantity in a draft cart) creates log bloat, while failing to durably record finalized orders, discounts, and payment settlements creates unresolvable accounting disputes.
4. **Cardholder Data & Secret Exposure (PCI-DSS)**: Inadvertently logging credit card numbers (PANs), CVVs, terminal PINs, or gateway API keys violates PCI-DSS and exposes the platform to catastrophic security breaches.

We must define declarative permissions, multi-tenant isolation rules, a three-tier logging and audit taxonomy, and strict payment data sanitization standards.

---

## 2. Decision Drivers

- **Least Privilege & Role Alignment**: Align permissions with existing Phase 1 IAM role definitions (`Owner`, `Receptionist`, `Trainer`, `Kitchen Staff`) while supporting dedicated commercial workflows.
- **Hierarchical Dot-Notation Standard**: Adhere to the established repository convention (`<module>.<action>`).
- **Absolute Multi-Tenant Isolation**: Guarantee zero cross-tenant leakage across queries, commands, and foreign source item references.
- **Three-Tier Logging Taxonomy**: Strictly distinguish between **Business Audit** (durable accounting events), **Application Logging** (operational traces), and **Security Logging** (threat monitoring).
- **PCI-DSS Compliance**: Strict zero-logging and zero-storage policy for sensitive authentication data (SAD) and primary account numbers (PAN).

---

## 3. Considered Options

### Option 1: Coarse-Grained Permissions (Reusing Generic `billing.read`/`billing.write` Only)

- Rely solely on Phase 1 `billing.read` and `billing.write` for all Sales and Payments endpoints.
- **Verdict**: **Rejected for Production Enforcement**. While `billing.read` and `billing.write` are preserved for backward compatibility, they are too coarse for granular point-of-sale operations. A front-desk cashier needs to create sales and collect payments (`sales.create`, `payments.create`), but must not have unconstrained authority to void finalized orders or issue refunds (`sales.cancel`, `payments.manage`).

### Option 2: Fine-Grained Permissions Using Colon Notation (`sales:create`, `payments:manage`)

- Introduce colon-delimited permission strings.
- **Verdict**: **Rejected**. Inconsistent with the repository's established dot-notation standard (`users.read`, `inventory.write`, `assets.transfer`).

### Option 3: Standard Hierarchical Dot-Notation Permissions with Action Classification, Strict Tenant Invariants, and 3-Tier Audit

- Introduce canonical dot-notation permissions: `sales.read`, `sales.create`, `sales.manage`, `sales.cancel`, `payments.read`, `payments.create`, `payments.manage`, `receipts.read`, `receipts.manage`.
- Categorize operations into Read-Only, Transactional, Destructive, and Financially Sensitive tiers.
- Enforce tenant isolation at transport guards, application handlers, and domain invariants.
- Formalize three-tier logging (Business, Application, Security) and PCI-DSS data redaction.
- **Verdict**: **Selected**.

---

## 4. Decision Outcome

Chosen Option: **Option 3: Standard Hierarchical Dot-Notation Permissions with Action Classification, Strict Tenant Invariants, and 3-Tier Audit**.

---

## 5. Architectural Specification

### 5.1 Permission Catalog & Action Classification

In accordance with Phase 1 IAM standards, permissions are defined using canonical dot notation:

| Permission Code       | Classification            | Operational Scope & Capabilities                                                                                   | Minimum Required Role                                  |
| :-------------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **`sales.read`**      | **Read-Only**             | Query and view sales orders, cart items, order status, and customer purchase histories.                            | `Receptionist`, `Trainer`, `Kitchen Staff`, `Owner`    |
| **`sales.create`**    | **Transactional**         | Initiate checkout sessions, add/remove items to draft orders, apply standard promotional discounts within limits.  | `Receptionist`, `Kitchen Staff`, `Owner`               |
| **`sales.manage`**    | **Financially Sensitive** | Apply discretionary discounts exceeding cashier thresholds (e.g. $> 15\%$), override prices, modify sale metadata. | `Manager`, `Owner`                                     |
| **`sales.cancel`**    | **Destructive**           | Cancel or void a draft or finalized sale prior to fulfillment; record mandatory cancellation reason.               | `Receptionist` (drafts), `Manager`/`Owner` (finalized) |
| **`payments.read`**   | **Read-Only**             | View payment transaction histories, tender methods, settlement timestamps, and payment statuses.                   | `Receptionist`, `Owner`                                |
| **`payments.create`** | **Transactional**         | Record cash collection, trigger card terminal pre-authorization, capture electronic tender.                        | `Receptionist`, `Kitchen Staff` (POS), `Owner`         |
| **`payments.manage`** | **Financially Sensitive** | Authorize compensating refunds, settle manual payment exceptions, process chargeback adjustments.                  | `Manager`, `Owner`                                     |
| **`receipts.read`**   | **Read-Only**             | View and download customer receipt vouchers for settled transactions.                                              | `Receptionist`, `Trainer`, `Client` (own), `Owner`     |
| **`receipts.manage`** | **Financially Sensitive** | Authorize receipt reprints, issue duplicate vouchers, generate fiscal credit notes.                                | `Receptionist` (standard reprint), `Owner`             |

#### Backward Compatibility Mapping

For backward compatibility with existing Phase 1 tokens and test fixtures:

- `billing.read` implies `sales.read`, `payments.read`, and `receipts.read`.
- `billing.write` implies `sales.create` and `payments.create`.

---

### 5.2 Multi-Tenant Organization Isolation

Every query, command, and domain operation in Sales & Payments must remain strictly scoped to the caller's verified `tenantId`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TENANT ISOLATION ARCHITECTURE                     │
│                                                                        │
│   JWT Bearer Token                                                     │
│   └─► AuthenticatedUserContext (trusted tenantId)                      │
│            │                                                           │
│            ├─► 1. Transport Guard: Injects user.tenantId into Command  │
│            │                                                           │
│            ├─► 2. Application Handler: Filters queries by tenantId     │
│            │      prisma.sale.findFirst({ where: { id, tenantId } })   │
│            │                                                           │
│            ├─► 3. Domain Aggregate: Asserts cross-tenant immutability  │
│            │      assertTenant(this.tenantId, command.tenantId)        │
│            │                                                           │
│            └─► 4. Source Reference Guard: Verifies catalog items       │
│                   sourceQueryPort.verifyItemBelongsToTenant(sourceId)  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Four Isolation Guards

1. **Cross-Tenant Sale Access Guard**:
   - Repository queries must include `where: { tenantId }`. Handlers loading by ID assert `sale.tenantId === context.tenantId`.
   - Access attempts across tenant boundaries return `ApplicationResult.fail('Not found or unauthorized across tenant boundary')` (HTTP 404/403).
2. **Cross-Tenant Payment Access Guard**:
   - `Payment` records carry `tenantId`. Settle and capture commands verify `payment.tenantId === context.tenantId` AND `sale.tenantId === payment.tenantId`.
3. **Cross-Tenant Receipt Access Guard**:
   - `Receipt` records carry `tenantId`. Sequential receipt numbering (`REC-2026-XXXX`) is scoped monotonically **per tenant**, preventing tenant counter leakage.
4. **Cross-Tenant SourceReference Guard**:
   - When a cashier adds an item (`sourceType: INVENTORY_ITEM`, `sourceId: item_123`) to a `Sale`, the outbound query port asserts that `item_123.tenantId === context.tenantId`.
   - Attempting to checkout an inventory item, treatment session, or membership plan belonging to another organization is rejected with `TenantMismatchException`.

---

### 5.3 Three-Tier Logging & Audit Event Taxonomy

The architecture strictly distinguishes between three logging levels to avoid audit log bloat while maintaining immutable financial accountability:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THREE-TIER LOGGING TAXONOMY                     │
│                                                                        │
│  1. BUSINESS AUDIT (Append-Only Event Store / Compliance)              │
│     "What financially meaningful action occurred?"                     │
│     • Sale Finalized       • Payment Settled     • Receipt Issued      │
│     • Sale Cancelled       • Refund Executed     • Discount Override   │
│                                                                        │
│  2. APPLICATION LOGGING (Pino / CloudWatch / Datadog)                  │
│     "What did the software do?"                                        │
│     • Draft item added     • Cache hit/miss      • HTTP 200 response   │
│     • Draft quantity edit  • DB query duration   • Gateway timeout     │
│                                                                        │
│  3. SECURITY LOGGING (SIEM / Security Event Publisher)                 │
│     "Who attempted a protected or suspicious action?"                  │
│     • Access Denied (403)  • Cross-tenant probe  • Unauthenticated     │
│     • Token Replay         • Excess failed PIN   • Webhook signature   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Evaluated Business Events Matrix

| Event Name                           | Tier               |   Audited?    | Justification                                                                                                            |
| :----------------------------------- | :----------------- | :-----------: | :----------------------------------------------------------------------------------------------------------------------- |
| **`SaleItemAddedToDraft`**           | Application Log    |    **NO**     | Draft cart modifications are ephemeral user session churn. Logging every keystroke pollutes the compliance audit ledger. |
| **`SaleItemQuantityChangedInDraft`** | Application Log    |    **NO**     | Pre-finalization cart updates carry zero financial commitment.                                                           |
| **`SaleCreated`**                    | Application Log    |    **NO**     | Initiating an empty cart is an operational action.                                                                       |
| **`SaleFinalized`**                  | **Business Audit** |    **YES**    | **Financially meaningful**. Commercial contract, prices, discounts, and order totals are permanently locked.             |
| **`SaleCancelled`**                  | **Business Audit** |    **YES**    | Order voided; records mandatory business justification and actor ID.                                                     |
| **`DiscountOverrideApplied`**        | **Business Audit** |    **YES**    | **Financially sensitive**. Records discount amount, percentage, reason, and authorizing supervisor ID.                   |
| **`PaymentInitiated`**               | Application Log    |    **NO**     | In-flight tender attempt.                                                                                                |
| **`PaymentSettled`**                 | **Business Audit** |    **YES**    | **Financially meaningful**. Monetary funds transferred; drawer/card balance committed.                                   |
| **`PaymentFailed`**                  | Security + App Log | **YES (Sec)** | Documents gateway decline reason code. Preserved for fraud detection and customer support.                               |
| **`PaymentCancelled`**               | **Business Audit** |    **YES**    | Tender attempt aborted prior to capture; records actor attribution.                                                      |
| **`PaymentRefunded`**                | **Business Audit** |    **YES**    | **Financially sensitive**. Compensating reversal; records refund amount, reason, and manager ID.                         |
| **`ReceiptIssued`**                  | **Business Audit** |    **YES**    | Official legal voucher generated; records monotonic receipt number.                                                      |
| **`ReceiptReprinted`**               | Security Audit     | **YES (Sec)** | Reprinting legal tax vouchers is auditable to detect fraud or double-reimbursement.                                      |

---

### 5.4 Sensitive Payment Information Protection (PCI-DSS)

To comply with PCI-DSS standards and prevent credential leakage:

1. **Strictly Prohibited Data (Never Logged, Never Stored)**:
   - **Primary Account Numbers (PAN)**: Full 16-digit credit card numbers must **never** be logged, cached, or persisted.
   - **Sensitive Authentication Data (SAD)**: Card CVV/CVC, expiration dates, PINs, and encrypted PIN blocks are **strictly forbidden** from entering the Kinergy backend.
   - **Payment Provider Secrets**: Stripe secret keys, terminal HMAC secrets, and webhook signing secrets must never appear in log payloads.
2. **Permitted Cardholder Data**:
   - Last 4 digits of the card (`**** **** **** 4242`).
   - Card brand / scheme (`VISA`, `MASTERCARD`, `AMEX`).
   - Gateway transaction identifier (`ch_3N4xYz...`).
3. **Transport Masking**:
   - All logging interceptors (`LoggingInterceptor`, `AuditHook`) must run an automated regex sanitizer redacting fields matching `password`, `token`, `secret`, `cvv`, `pan`, `cardNumber`.

---

## 6. Consequences

### Positive

- **Auditable Financial Integrity**: Every revenue-impacting action (settlement, discount override, cancellation, refund) is indelibly attributed to a verified actor and timestamp.
- **Zero Log Pollution**: Technical cart churning is cleanly isolated to transient application logs.
- **Flawless Multi-Tenancy**: Organization boundaries are enforced defense-in-depth at transport, application, and domain tiers.
- **PCI-DSS Compliance**: Strict data sanitization prevents toxic payment card data from entering application databases or logs.

### Negative / Trade-offs

- **Granular Role Configuration**: Cashiers and receptionists require properly mapped permissions in `prisma/seeds/identity.seed.ts` for commercial operations.
- **Audit Interceptor Overhead**: Business audit events must be systematically dispatched via the `IAuditEventPublisher` port.

---

## 7. Implementation Guidelines

- Register new permission definitions under `PERMISSION_CATALOG.Sales` and `PERMISSION_CATALOG.Payments` in `prisma/seeds/identity.seed.ts`.
- Ensure controllers decorate handlers with `@Permissions('sales.create')`, `@Permissions('sales.manage')`, etc.
- In `SalesService` and `PaymentService`, emit domain audit events via `AuditEventPublisher` upon `SaleFinalized`, `PaymentSettled`, `SaleCancelled`, and `PaymentRefunded`.
