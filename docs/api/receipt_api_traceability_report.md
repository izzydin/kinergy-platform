# Receipt Retrieval API OpenAPI & Implementation Traceability Report (Milestone 7.16)

- **Date**: 2026-10-15
- **Author**: Senior API Documentation Engineer
- **Status**: Complete, Verified & Authoritative
- **Target Module**: `apps/api/src/sales` (`ReceiptsController`, DTOs, Application Handlers, Domain Invariants)
- **Validation Test Suites**:
  - `apps/api/src/sales/__tests__/receipts-openapi-contract.spec.ts` (OpenAPI 3.0 Contract Verification)
  - `apps/api/src/sales/__tests__/receipts-http-api.integration.spec.ts` (Full Pipeline HTTP Integration Test Suite)
- **Governing Architecture Decisions**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](../adr/0135-sales-payments-receipts-authorization-and-security.md)

---

## 1. Executive Summary

This report establishes end-to-end technical traceability between the approved Milestone 7.16 Receipt API specification (`GET /sales/:saleId/receipt`), the OpenAPI 3.0 / Swagger metadata annotations, DTO contracts, authentication and authorization guards, domain exception mappings, and the actual runtime behavior in the NestJS application pipeline.

Every documented route parameter, response schema, HTTP status code, permission rule, and snapshot invariant corresponds to verified runtime behavior. Zero non-existent endpoints, phantom fields, or unmapped Prisma/database records are exposed in public API contracts.

### Scope & Architectural Boundaries

1. **Proof-of-Purchase Voucher Only**: The Receipt entity serves as an **immutable, commercial proof-of-purchase voucher** evidencing an already settled commercial transaction (`PAID` or `COMPLETED` Sale). It is strictly decoupled from fiscal tax invoices, government electronic billing instruments (CFDI/SII), accounting journal entries, or revenue recognition ledgers.
2. **Strictly Read-Only Query**: `GET /api/v1/sales/:saleId/receipt` is a read-only query. It does **not** create, issue, reissue, regenerate, update, or delete Receipt, Sale, or Payment records. If a Sale exists without an issued receipt, the endpoint returns `404 Not Found` and does **not** auto-issue a receipt.
3. **Decoupled Point-in-Time Snapshot**: The retrieved receipt represents frozen historical agreement data at the moment of issuance. Subsequent mutations to customer profiles, catalog item names, product SKUs, or pricing models do not alter the historical receipt voucher.

---

## 2. Route Specification: `GET /sales/:saleId/receipt`

Mounted under the platform API base prefix `/api/v1`, the endpoint is grouped under the OpenAPI `'Receipts'` tag.

| Property              | Value                                   |
| :-------------------- | :-------------------------------------- |
| **HTTP Verb**         | `GET`                                   |
| **URL Path**          | `/api/v1/sales/:saleId/receipt`         |
| **Route Alias**       | `/api/v1/receipts/sale/:saleId`         |
| **Controller**        | `ReceiptsController.getReceiptBySale()` |
| **Application Query** | `GetReceiptBySaleQuery`                 |
| **Query Handler**     | `GetReceiptBySaleHandler`               |
| **Security Scheme**   | `Bearer <JWT>` (`@ApiBearerAuth()`)     |
| **OpenAPI Tag**       | `Receipts`                              |

---

## 3. Path Parameter Specification

| Parameter Name |   In   | Required |   Type   | Validation & Constraints                                                                                                                                                              |
| :------------- | :----: | :------: | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `saleId`       | `path` | **Yes**  | `string` | Target commercial Sale UUID or prefixed identifier (`sale_...`). Must not be empty, null, or whitespace-only. Validated at controller boundary (`BadRequestException` on whitespace). |

---

## 4. Authentication, Authorization & Security Boundaries

Access is orchestrated via NestJS guards following the platform's Phase 1 IAM and Milestone 7.13 authorization matrix:

1. **Authentication Guard (`AuthenticationGuard`)**:
   - Inspects `Authorization: Bearer <JWT>` header.
   - Validates cryptographic signature, token expiration, tenant claim, and session invalidation (`tokenVersion`).
   - Missing or invalid credentials produce `401 Unauthorized`.
2. **Authorization Guard (`AuthorizationGuard`)**:
   - Requires permission: **`receipts.read`** (or canonical colon-notation alias `receipts:read`).
   - Covered by administrative hierarchy: `receipts.manage`, `billing.manage`, `sales.manage`, `*`.
   - Allowed roles: `Owner`, `Gym Owner`, `Manager`, `Gym Manager`, `Platform Admin`, `Receptionist`, `Kitchen Staff`, `Trainer`, `Client`, `Member`.
3. **Object-Level Customer Ownership Boundary (ADR-0117 / ADR-0135)**:
   - **Administrative & Cashiering Staff** (`Owner`, `Manager`, `Receptionist`, `Kitchen Staff`): Possess operational visibility across all receipts within their tenant.
   - **Customer Roles** (`Client`, `Member`): Strictly confined to receipts where `receipt.clientSnapshot.clientId === callerId`. Access to receipts belonging to other clients or facility-wide financial receipts is denied (`403 Forbidden`).
   - **Unassigned Non-Staff** (`Trainer` without client assignment, `Visitor`): Denied access to receipts (`403 Forbidden`).
4. **Multi-Tenant Isolation**:
   - Strictly scopes queries to `tenantId`. Cross-tenant retrieval attempts are rejected with `403 Forbidden`.

---

## 5. Success Response Representation (`200 OK`)

Returns the canonical, explicit **`ReceiptResponseDto`** JSON object:

```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "tenantId": "tenant_kinergy_prime",
  "saleId": "f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c",
  "receiptNumber": "REC-2026-000421",
  "saleReference": "ORD-2026-00042",
  "issuedAt": "2026-09-25T14:30:00.000Z",
  "clientSnapshot": {
    "clientId": "cli_01j9876543210abcdef",
    "referenceNumber": "CLI-2026-00042",
    "fullName": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "+1-555-0199"
  },
  "items": [
    {
      "itemId": "item_01j9876543210abcdef",
      "sourceType": "MEMBERSHIP_PLAN",
      "sourceId": "mem_plan_gold_annual",
      "description": "Gold Annual Gym Membership",
      "skuOrCode": "GYM-ANN-01",
      "quantity": 1,
      "unitPrice": {
        "amount": 100.0,
        "currency": "USD",
        "formatted": "100.00",
        "cents": 10000
      },
      "discountTotal": {
        "amount": 10.0,
        "currency": "USD",
        "formatted": "10.00",
        "cents": 1000
      },
      "subtotal": {
        "amount": 100.0,
        "currency": "USD",
        "formatted": "100.00",
        "cents": 10000
      },
      "total": {
        "amount": 90.0,
        "currency": "USD",
        "formatted": "90.00",
        "cents": 9000
      }
    }
  ],
  "itemCount": 1,
  "subtotal": {
    "amount": 100.0,
    "currency": "USD",
    "formatted": "100.00",
    "cents": 10000
  },
  "discountTotal": {
    "amount": 10.0,
    "currency": "USD",
    "formatted": "10.00",
    "cents": 1000
  },
  "total": {
    "amount": 90.0,
    "currency": "USD",
    "formatted": "90.00",
    "cents": 9000
  },
  "currency": "USD",
  "payments": [
    {
      "paymentId": "pay_01j9876543210abcdef",
      "method": "CASH",
      "amount": {
        "amount": 90.0,
        "currency": "USD",
        "formatted": "90.00",
        "cents": 9000
      },
      "status": "COMPLETED",
      "reference": "DRAWER-01-REGISTER",
      "paidAt": "2026-09-25T14:29:45.000Z"
    }
  ],
  "paymentMethod": "CASH",
  "paymentStatus": "COMPLETED",
  "status": "ISSUED",
  "reprintCount": 0,
  "lastReprintedAt": null
}
```

### Schema Field Dictionary

| Property          | Type                       | Nullable | Description & Behavioral Guarantees                                                                                                       |
| :---------------- | :------------------------- | :------: | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `string` (UUID)            |    No    | Canonical aggregate identifier of the Receipt document.                                                                                   |
| `tenantId`        | `string`                   |    No    | Tenant organizational boundary identifier.                                                                                                |
| `saleId`          | `string` (UUID)            |    No    | Target commercial Sale aggregate root identifier.                                                                                         |
| `receiptNumber`   | `string`                   |    No    | Human-readable sequential voucher reference (`REC-YYYY-XXXXXX`). Strictly monotonic and gap-free.                                         |
| `saleReference`   | `string`                   |    No    | Business reference captured from Sale at issuance (`sourceCode ?? sale.id.value`).                                                        |
| `issuedAt`        | `string` (ISO 8601)        |    No    | UTC timestamp of official settlement and receipt issuance.                                                                                |
| `clientSnapshot`  | `ReceiptClientSnapshot`    | **Yes**  | Captured customer presentation attributes (`clientId`, `fullName`, `referenceNumber`, `email`, `phone`). `null` for walk-in retail sales. |
| `items`           | `ReceiptItemSnapshot[]`    |    No    | Deep immutable array of line items with captured unit price, discount, subtotal, and total. Retains original checkout index ordering.     |
| `itemCount`       | `number` (Int)             |    No    | Total count of line item snapshots.                                                                                                       |
| `subtotal`        | `MoneyResponseDto`         |    No    | Frozen gross transaction amount before order-level discounts.                                                                             |
| `discountTotal`   | `MoneyResponseDto`         |    No    | Frozen total discounts applied.                                                                                                           |
| `total`           | `MoneyResponseDto`         |    No    | Frozen net payable total amount evidenced by this receipt.                                                                                |
| `currency`        | `string` (ISO 4217)        |    No    | 3-letter uppercase ISO currency code (`USD`).                                                                                             |
| `payments`        | `ReceiptPaymentSnapshot[]` |    No    | Breakdown of all settled tender payments (`paymentId`, `method`, `amount`, `status: COMPLETED`, `reference`, `paidAt`).                   |
| `paymentMethod`   | `PaymentMethod`            |    No    | Primary tender method utilized (`CASH`, `QR`).                                                                                            |
| `paymentStatus`   | `PaymentStatus`            |    No    | Primary tender status at settlement (`COMPLETED`).                                                                                        |
| `status`          | `ReceiptStatus`            |    No    | Voucher lifecycle status (`ISSUED` or `REPRINTED`).                                                                                       |
| `reprintCount`    | `number` (Int)             |    No    | Operational counter recording duplicate reprints. `0` for original.                                                                       |
| `lastReprintedAt` | `string` (ISO 8601)        | **Yes**  | Timestamp of last duplicate reprint, or `null` if original.                                                                               |

---

## 6. Financial Representation & Timezone Semantics

### 6.1 Money Representation & Zero Float Drift (ADR-0108 / ADR-0114)

All monetary properties are serialized using `MoneyResponseDto`:

```typescript
export class MoneyResponseDto {
  amount: number; // e.g. 148.04 (Display convenience only)
  currency: string; // e.g. "USD" (ISO-4217 uppercase)
  formatted: string; // e.g. "148.04" (Lossless 2-decimal string)
  cents: number; // e.g. 14804 (Authoritative integer minor units)
}
```

- **`cents` (Integer)** is the **Authoritative Source of Truth** for downstream balance reconciliation and validation. It prevents binary floating-point rounding errors (`0.1 + 0.2 !== 0.3`).
- **`formatted` (String)** is the **Lossless Presentation String** for invoice renderers and printer telemetry.
- **`amount` (Number)** is provided **strictly for display bindings**; arithmetic must never be performed on `amount`.

### 6.2 Date/Time Format & Timezone Semantics

All timestamps (`issuedAt`, `paidAt`, `lastReprintedAt`) are strictly serialized in **ISO 8601 UTC** with millisecond precision:

```
YYYY-MM-DDTHH:mm:ss.sssZ  (e.g., "2026-09-25T14:30:00.000Z")
```

No local timezone offsets or arbitrary unix epochs are exposed. Clients are responsible for formatting into local facility timezones for display.

---

## 7. Contractually Supported Error Response Matrix

All error responses adhere to standard RFC-compliant HTTP status codes and platform error envelopes:

|            HTTP Status Code            | Condition / Trigger                                                                                                         | Error Envelope Example                                                                                                             | Client Remediation                                                                    |
| :------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
|         **`400 Bad Request`**          | Path parameter `saleId` is empty, null, or whitespace-only.                                                                 | `{"statusCode": 400, "error": "Bad Request", "message": "Sale ID cannot be empty or whitespace."}`                                 | Supply a valid, non-empty Sale identifier.                                            |
|         **`401 Unauthorized`**         | Missing `Authorization` header, invalid JWT signature, expired token, or revoked session.                                   | `{"statusCode": 401, "error": "Unauthorized", "message": "Authentication token required."}`                                        | Authenticate via `/api/v1/auth/login` and provide a valid Bearer token.               |
|          **`403 Forbidden`**           | Caller lacks `receipts.read` permission, cross-tenant access attempted, or customer user requests another client's receipt. | `{"statusCode": 403, "error": "Forbidden", "message": "Access denied: clients are only authorized to access their own receipts."}` | Ensure caller possesses required role/permission or requests own voucher.             |
|   **`404 Not Found` (Missing Sale)**   | The requested Sale identifier does not exist in the tenant database.                                                        | `{"statusCode": 404, "error": "Not Found", "message": "Sale 'sale_nonexistent' was not found."}`                                   | Verify Sale identifier.                                                               |
| **`404 Not Found` (Unissued Receipt)** | The Sale exists, but settlement has not completed or no receipt has been issued yet.                                        | `{"statusCode": 404, "error": "Not Found", "message": "Receipt for sale 'sale_123' was not found."}`                               | Settle payment and issue receipt via `POST /api/v1/sales/:saleId/receipt`.            |
|    **`500 Internal Server Error`**     | Unexpected database connection failure, infrastructure crash, or query timeout.                                             | `{"statusCode": 500, "error": "Internal Server Error", "message": "An internal server error occurred."}`                           | Retry with exponential backoff; quote `x-correlation-id` response header for support. |

### Contractual Distinction: Missing Sale vs. Sale Without Receipt

While both conditions return `404 Not Found` to prevent resource enumeration leaks across multi-tenant boundaries, the error `message` clearly and contractually distinguishes the state:

- When the Sale itself does not exist: `"Sale '<id>' was not found."`
- When the Sale exists but has no receipt voucher: `"Receipt for sale '<id>' was not found."`

Neither case creates a receipt. Retrieval is 100% read-only.

---

## 8. Verification & Traceability Matrix

| Requirement / Scenario                        | Test Suite                              | Test Case                                                                                                            |  Status  |
| :-------------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------- | :------: |
| **OpenAPI 3.0 Metadata & BearerAuth**         | `receipts-openapi-contract.spec.ts`     | `documents BearerAuth security requirement and scheme`                                                               | **PASS** |
| **Route Definition & Tags**                   | `receipts-openapi-contract.spec.ts`     | `documents Receipts tag grouping for receipt voucher operations`                                                     | **PASS** |
| **Path Parameter & Description**              | `receipts-openapi-contract.spec.ts`     | `exposes GET operation with descriptive summary, description, and path parameter`                                    | **PASS** |
| **Complete Status Code Matrix**               | `receipts-openapi-contract.spec.ts`     | `documents complete HTTP status code matrix (200, 400, 401, 403, 404, 500)`                                          | **PASS** |
| **Canonical Response Schema**                 | `receipts-openapi-contract.spec.ts`     | `registers ReceiptResponseDto and its nested snapshot schemas in components`                                         | **PASS** |
| **Prisma Leakage Exclusion**                  | `receipts-openapi-contract.spec.ts`     | `ReceiptResponseDto schema defines all canonical commercial voucher fields (zero version/timestamps)`                | **PASS** |
| **Money Determinism Schema**                  | `receipts-openapi-contract.spec.ts`     | `MoneyResponseDto preserves integer cents, 2-decimal formatted string, and ISO currency`                             | **PASS** |
| **Full Request Pipeline 200 OK**              | `receipts-http-api.integration.spec.ts` | `Scenario 1: Authorized request for a Sale with an issued Receipt returns 200 OK and canonical DTO`                  | **PASS** |
| **Nonexistent Sale (404)**                    | `receipts-http-api.integration.spec.ts` | `Scenario 2: Request for a nonexistent Sale returns standard 404 Not Found contract`                                 | **PASS** |
| **Sale Without Receipt (404, No Auto-Issue)** | `receipts-http-api.integration.spec.ts` | `Scenario 3: Request for an existing Sale without a Receipt returns 404 Not Found and does NOT auto-create`          | **PASS** |
| **Invalid Identifier (400)**                  | `receipts-http-api.integration.spec.ts` | `Scenario 4: Invalid Sale identifier (whitespace) produces standard 400 Bad Request validation response`             | **PASS** |
| **Missing Authentication (401)**              | `receipts-http-api.integration.spec.ts` | `Scenario 5: Request with missing authentication header produces standard 401 Unauthorized response`                 | **PASS** |
| **Lacking Permission (403)**                  | `receipts-http-api.integration.spec.ts` | `Scenario 6: Authenticated user lacking receipts.read produces standard 403 Forbidden response`                      | **PASS** |
| **Nontrivial Monetary Precision**             | `receipts-http-api.integration.spec.ts` | `Scenario 7: Receipt with multiple items and nontrivial monetary values preserves integer precision and cents sum`   | **PASS** |
| **Historical Snapshot Fidelity**              | `receipts-http-api.integration.spec.ts` | `Scenario 8: Historical snapshot fidelity preserves captured client and item data even when current records differ`  | **PASS** |
| **Repository Failure Sanitization (500)**     | `receipts-http-api.integration.spec.ts` | `Scenario 9: Unexpected database failure returns generic 500 without disclosing Prisma errors, SQL, or stack traces` | **PASS** |
| **Zero Side-Effects (Read-Only)**             | `receipts-http-api.integration.spec.ts` | `Scenario 10: GET retrieval performs zero write/update/delete operations across all success and error paths`         | **PASS** |
