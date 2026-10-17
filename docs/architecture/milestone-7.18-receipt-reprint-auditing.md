# Receipt Reprint Auditing & Operational Workflow Specification (Future Scope)

- **Status**: Proposed / Future Milestone Specification (Deferred — Milestone 7.18 chartered for Financial Concurrency, Idempotency & Multi-Tender Settlement Integrity via ADR-0140)
- **Milestone Designation**: Future Scope (Phase 7: Commercial Sales, Payments & Receipts)
- **Bounded Context**: Sales & Payments (`apps/api`, `packages/core`, and platform security audit engine)
- **Author**: Technical Product Architect & Principal Security Engineer
- **Date**: 2026-10-16
- **Governing ADRs**:
  - [ADR-0025: Role and Permission Authorization Framework](../adr/0025-role-and-permission-authorization-framework.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](../adr/0135-sales-payments-receipts-authorization-and-security.md)
- **Predecessor Dependencies**:
  - Milestone 7.7 (`Receipt.recordReprint()` aggregate behavior, OCC version increment)
  - Milestone 7.16 (`GET /sales/:saleId/receipt` and `ReceiptResponseDto`)
  - Platform Security Audit Infrastructure ([docs/security/audit-logging-architecture.md](../security/audit-logging-architecture.md))

---

## 1. Executive Summary & Objective

The objective of **Milestone 7.18** is to implement the authoritative, audited operational workflow for **reprinting commercial proof-of-purchase receipts**. In retail, wellness, and medical clinical operations, customer receipt duplication carries high fraud and tax evasion risks (e.g. duplicate tax deductions, fake return vouchers, cashier theft).

Milestone 7.18 will expose an explicit reprint command:

```http
POST /api/v1/receipts/:id/reprint
```

And mandate that every reprint event is permanently recorded in the platform's immutable security audit infrastructure.

### Critical Pre-Condition: Initial Issuance vs. Subsequent Reprint

| Dimension             | Initial Issuance (`POST /sales/:saleId/receipt`)                     | Operational Reprint (`POST /receipts/:id/reprint`)                                | Read Retrieval (`GET /sales/:saleId/receipt`)         |
| :-------------------- | :------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :---------------------------------------------------- |
| **Trigger Point**     | Checkout settlement completion (`PAID` or `COMPLETED` sale).         | Cashier/Manager requests a duplicate physical or digital copy.                    | Viewing receipt on screen or querying existing state. |
| **Permission**        | `receipts.manage`                                                    | `receipts.manage` (with mandatory supervisory role).                              | `receipts.read`                                       |
| **Receipt State**     | Initializes `Receipt` record; `reprintCount = 0`, `status = ISSUED`. | Updates `reprintCount += 1`, `lastReprintedAt = now()`, `status = REPRINTED`.     | **Zero state change** (`reprintCount` untouched).     |
| **Audit Requirement** | Standard transaction creation event.                                 | **Mandatory Security Audit Event** with mandatory operational reason code.        | Read-level access logs (if enabled).                  |
| **Financial State**   | Frozen point-in-time snapshot created.                               | **100% Frozen**: Financial values, line items, and totals **cannot** be modified. | 100% Frozen snapshot returned.                        |

---

## 2. Intended Scope & Acceptance Criteria

### 2.1 Endpoint Specification: `POST /api/v1/receipts/:id/reprint`

- [ ] **Route Definition**: Exposes `POST /api/v1/receipts/:id/reprint` requiring JWT Bearer authentication.
- [ ] **Supervisory Authorization**: Enforces `receipts.manage` permission and restricts execution to authorized managerial roles (`Owner`, `Manager`, `Receptionist`). General staff or clients cannot trigger reprint operations.
- [ ] **Request Payload**: Requires explicit DTO (`ReprintReceiptRequestDto`):
  ```json
  {
    "reason": "CUSTOMER_REQUEST_LOST_ORIGINAL",
    "notes": "Customer requested duplicate copy for insurance claim."
  }
  ```
- [ ] **Reason Validation**: `reason` is **mandatory** and constrained to an approved enumeration:
  - `CUSTOMER_REQUEST_LOST_ORIGINAL`: Customer misplaced original paper voucher.
  - `PRINTER_PAPER_JAM`: Physical hardware malfunction during initial checkout print.
  - `ACCOUNTING_AUDIT_VERIFICATION`: Management or tax compliance inspection.
  - `FACILITY_RECONCILIATION`: End-of-day register reconciliation.
- [ ] **Response Contract**: Returns updated canonical `ReceiptResponseDto` with updated `status: "REPRINTED"`, `reprintCount`, and `lastReprintedAt` ISO 8601 UTC timestamp.

### 2.2 Domain & Persistence Invariants

- [ ] **Snapshot Immutability Preservation**: Re-asserts [ADR-0117 §3.24](file:///c:/Projects/kinergy-platform/docs/adr/0117-receipt-domain-boundary-and-document-model.md): reprinting updates **strictly** `reprintCount`, `lastReprintedAt`, and `status`. It is physically impossible for the reprint handler to edit line items, change unit prices, or alter payment tenders.
- [ ] **Optimistic Concurrency Control (OCC)**: Handled via `version` column checks (`WHERE id = :id AND version = :version`). Concurrent reprint requests on the same receipt resolve deterministically without lost counter updates.
- [ ] **Multi-Tenant Isolation**: Scoped strictly to caller's `tenantId`. Cross-tenant reprint requests return `404 Not Found` (zero information leakage).

### 2.3 Comprehensive Audit Logging Integration

- [ ] **Platform Audit Hook Binding**: The application handler injects the platform `IAuditEventPublisher` port ([docs/security/audit-logging-architecture.md](../security/audit-logging-architecture.md)).
- [ ] **Structured Audit Event Schema**: Every successful reprint emits a normalized audit record:
  ```json
  {
    "eventId": "evt_...",
    "eventType": "RECEIPT_REPRINTED",
    "category": "AUTHORIZATION_ACCESS",
    "timestamp": "2026-10-16T12:00:00.000Z",
    "actor": {
      "userId": "usr_cashier123",
      "email": "cashier@kinergy.com",
      "roles": ["Receptionist"],
      "tenantId": "tenant_alpha"
    },
    "target": {
      "type": "Receipt",
      "id": "rec_uuid_123"
    },
    "outcome": "SUCCESS",
    "severity": "MEDIUM",
    "tenantId": "tenant_alpha",
    "metadata": {
      "receiptNumber": "REC-2026-000421",
      "saleId": "sale_789",
      "reprintCount": 1,
      "reason": "CUSTOMER_REQUEST_LOST_ORIGINAL",
      "notes": "Customer requested duplicate copy..."
    }
  }
  ```
- [ ] **Failed Attempt Auditing**: If an unauthorized user or unprivileged role attempts to invoke reprint, an audit event with `outcome: "DENIED"` and `severity: "HIGH"` is published to alert security personnel.
- [ ] **Privacy & Least-Privilege Telemetry**: The audit record captures document references and reasons; it does **not** store sensitive payment tokens, card numbers, or full item catalog arrays in audit logs.

---

## 3. Decisions to Settle Before Implementation

Before implementation commences in Milestone 7.18, the following architectural decisions must be formally recorded:

1. **Transactional Consistency vs. Audit Durability**:
   - _Question_: Should the audit event be emitted via in-memory event bus or persisted within the database transaction using an Outbox pattern?
   - _Recommendation_: Use platform's `IAuditEventPublisher` with Transactional Outbox to prevent phantom reprint counters if audit publishing fails.
2. **Audit Persistence Strategy**:
   - _Question_: Is the existing `LoggerAuditEventPublisher` sufficient, or is a dedicated queryable `audit_events` relational table required for compliance reporting?
   - _Recommendation_: Author **ADR-0140: Receipt Reprint Security Audit Persistence and Retention Model** to formalize audit storage requirements.
3. **Idempotency Strategy**:
   - _Question_: If a cashier double-clicks the "Reprint" button, should it count as two reprints or one?
   - _Recommendation_: Require an `Idempotency-Key` header. Requests sharing the identical key within a 5-minute window increment the counter exactly once.
