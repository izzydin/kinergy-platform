# Canonical Receipt API Response Contract

- **Document**: `docs/api/receipt-canonical-response-contract.md`
- **Status**: Authoritative API Specification (Phase 7.7)
- **Role**: Senior API and Domain Contract Architect
- **Governing Architecture & Standards**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [OpenAPI Reference Specification](README.md)
- **Date**: 2026-09-25

---

## 1. Executive Summary & Design Mission

A customer `Receipt` is an **immutable, legal proof-of-purchase voucher** evidencing an already settled commercial transaction (`PAID` or `COMPLETED` Sale).

The canonical Receipt API response representation serves client applications (web dashboard, mobile app, POS terminals, and customer export instruments) with strict behavioral guarantees:

1. **Exposes Exclusively Required Commercial Data**: Contains only information justified by receipt requirements (identification, sale reference, issue date, client snapshot, itemized breakdown, financial totals, and settled tender details).
2. **Strict Conceptual Separation**: Explicitly distinguishes **Technical Reference & Identity Fields** from **Historical Point-in-Time Snapshot Fields**.
3. **Zero Persistence Leaks**: Strictly suppresses database implementation details (e.g. Prisma `Decimal` objects, internal database OCC counters `version`, technical table timestamps `createdAt`/`updatedAt`, and internal database schemas).
4. **Deterministic Monetary Serialization**: All financial figures are serialized using the platform's standardized `MoneyResponseDto` (`cents`, `formatted`, `amount`, `currency`).
5. **Prevention of Float Drift**: Prevents API consumers from interpreting binary floating-point numbers as authoritative financial values by elevating integer `cents` and fixed-precision `formatted` as canonical values.

---

## 2. API Endpoints Exposing Receipt Representation

The canonical response schema is returned by the following authenticated and tenant-scoped REST endpoints:

| Method | Endpoint Route                  | Description                                         | HTTP Status   | Permissions Required |
| :----- | :------------------------------ | :-------------------------------------------------- | :------------ | :------------------- |
| `POST` | `/api/v1/sales/:saleId/receipt` | Idempotent receipt issuance for settled sale        | `201 Created` | `receipts.manage`    |
| `POST` | `/api/v1/receipts`              | Direct receipt issuance specifying `saleId` in body | `201 Created` | `receipts.manage`    |
| `GET`  | `/api/v1/sales/:saleId/receipt` | Query receipt voucher by commercial sale ID         | `200 OK`      | `receipts.read`      |
| `GET`  | `/api/v1/receipts/:id`          | Query receipt voucher by UUID or receipt number     | `200 OK`      | `receipts.read`      |

---

## 3. Canonical JSON Response Representation

```json
{
  "id": "rcpt_9b1deb4d-3b7d-416b-9548-52ee8c8230e5",
  "tenantId": "tenant_wellness_center",
  "saleId": "sale_7f3e2a1b-4c5d-6e7f-8a9b-0c1d2e3f4a5b",
  "receiptNumber": "REC-2026-000421",
  "saleReference": "ORD-2026-0925-001",
  "issuedAt": "2026-09-25T14:30:00.000Z",
  "status": "ISSUED",
  "reprintCount": 0,
  "lastReprintedAt": null,
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
  "paymentStatus": "COMPLETED"
}
```

---

## 4. Architectural Taxonomy: Reference vs. Historical Snapshot Fields

The response representation explicitly separates **Reference Fields** (mutable operational and relational metadata) from **Historical Snapshot Fields** (immutable commercial agreement records frozen at issuance).

### 4.1 Reference & Document Identification Fields

These attributes identify the document entity within the software ecosystem and manage operational voucher lifecycle events:

| Property          | Type                | Nullable | Purpose & Governance                                                                                                                           |
| :---------------- | :------------------ | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `string` (UUID)     | No       | Canonical aggregate identity of the `Receipt` entity. Used for backend routing, database indexing, and API references (`GET /receipts/:id`).   |
| `tenantId`        | `string`            | No       | Multi-tenant organization boundary identifier. Enforces cross-tenant isolation; clients cannot view receipts belonging to other organizations. |
| `saleId`          | `string` (UUID)     | No       | Direct scalar reference to the originating commercial `Sale` aggregate root.                                                                   |
| `receiptNumber`   | `string`            | No       | Customer-facing, legal/fiscal voucher reference conforming to `REC-YYYY-XXXXXX` (ADR-0118). Strictly monotonic and gap-free per tenant.        |
| `status`          | `ReceiptStatus`     | No       | Document voucher lifecycle state (`ISSUED` or `REPRINTED`).                                                                                    |
| `reprintCount`    | `number` (Int)      | No       | Operational counter recording how many duplicate reprint vouchers have been produced. `0` for original voucher.                                |
| `lastReprintedAt` | `string` (ISO 8601) | Yes      | Timestamp when the last duplicate voucher was printed, or `null` if never reprinted.                                                           |

### 4.2 Historical Point-in-Time Snapshot Fields

These attributes represent the commercial, customer, and tender state **permanently frozen at the moment of checkout**. Once issued, these fields NEVER change, even if the customer profile is updated, catalog prices change, or products are archived.

| Property         | Type                       | Nullable | Historical Preservation Invariant                                                                                                                       |
| :--------------- | :------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `saleReference`  | `string`                   | No       | Upstream business reference captured from `Sale` (`sourceCode ?? sale.id.value`). Preserved even if upstream cart or order is archived.                 |
| `issuedAt`       | `string` (ISO 8601)        | No       | Authoritative point-in-time timestamp when settlement was finalized and legal proof-of-purchase was created.                                            |
| `clientSnapshot` | `ReceiptClientSnapshot`    | Yes      | Point-in-time customer legal name, reference number, email, and phone at issuance. `null` for anonymous walk-in sales. Decoupled from live user tables. |
| `items`          | `ReceiptItemSnapshot[]`    | No       | Deep immutable snapshot of purchased lines (descriptions, historical unit prices, quantities, and line totals). Immune to catalog price updates.        |
| `itemCount`      | `number` (Int)             | No       | Total count of line items evidenced on this voucher.                                                                                                    |
| `subtotal`       | `MoneyResponseDto`         | No       | Frozen gross transaction amount before discounts.                                                                                                       |
| `discountTotal`  | `MoneyResponseDto`         | No       | Frozen total discounts applied to the commercial transaction.                                                                                           |
| `total`          | `MoneyResponseDto`         | No       | Frozen net settled amount payable. Invariant: `subtotal - discountTotal === total`.                                                                     |
| `currency`       | `string` (ISO-4217)        | No       | ISO currency of the transaction (`USD`).                                                                                                                |
| `payments`       | `ReceiptPaymentSnapshot[]` | No       | Frozen snapshot of all settled tenders evidencing payment (tender method, settled amount, terminal status, reference tag, paid timestamp).              |
| `paymentMethod`  | `PaymentMethod`            | No       | Primary tender method (`CASH`, `QR`).                                                                                                                   |
| `paymentStatus`  | `PaymentStatus`            | No       | Primary tender status (`COMPLETED`).                                                                                                                    |

---

## 5. Monetary Representation & Precision Invariants

In strict adherence to [ADR-0108](../adr/0108-money-representation.md) and [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md), monetary values are NEVER exposed as raw numbers or loose floating-point values.

Every monetary property (`subtotal`, `discountTotal`, `total`, item `unitPrice`, item `subtotal`, item `discountTotal`, item `total`, payment `amount`) uses the standardized `MoneyResponseDto`:

```typescript
export class MoneyResponseDto {
  amount: number; // e.g. 49.99 (Major currency units, 2 decimal places)
  currency: string; // e.g. "USD" (ISO-4217 uppercase code)
  formatted: string; // e.g. "49.99" (Lossless 2-decimal string representation)
  cents: number; // e.g. 4999 (Exact integer minor units, scale: 0)
}
```

### Authoritative Interpretation Guidelines for Clients

> [!IMPORTANT]
> **Authoritative Fields for Computation vs. Display:**
>
> 1. **`cents` (Integer)** is the **Primary Authoritative Value** for any downstream computational logic, balance reconciliation, tax calculations, or financial assertions. It is guaranteed 100% immune to IEEE-754 binary floating-point drift.
> 2. **`formatted` (String)** is the **Authoritative Lossless Representation** for text rendering, PDF receipt generators, thermal printer telemetry, and arbitrary-precision accounting clients.
> 3. **`amount` (Number)** is provided **strictly as a display convenience** for lightweight UI bindings. Client consumers MUST NOT execute financial additions, subtractions, or multiplications using `amount`.

---

## 6. Strict Exclusion of Internal Persistence Details

To preserve strict Clean Architecture boundaries and avoid leaking infrastructure implementation choices into the domain contract, the following internal details are **strictly omitted** from the canonical receipt response:

1. **`version`**: The internal Optimistic Concurrency Control (OCC) counter used by PostgreSQL/Prisma (`version INT DEFAULT 1`) is purely an internal persistence mechanism. It is excluded from the external voucher API.
2. **`createdAt` and `updatedAt`**: Database row telemetry timestamps (`created_at`, `updated_at`) are database infrastructure fields. The authoritative legal domain timestamp is `issuedAt`.
3. **Prisma `Decimal` Objects**: Raw Prisma `Decimal` instances (`Decimal.js`) must never be leaked across the HTTP network boundary. They are converted deterministically into `MoneyResponseDto`.
4. **Relational Table Identifiers**: Internal foreign key cascades, database junction keys, and relational joining markers are never exposed.

---

## 7. Client Snapshot Representation & Walk-In Handling

A receipt voucher must support both registered gym/clinic members and anonymous walk-in retail customers:

- **Registered Clients**:
  ```json
  "clientSnapshot": {
    "clientId": "cli_01j9876543210abcdef",
    "referenceNumber": "CLI-2026-00042",
    "fullName": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "+1-555-0199"
  }
  ```
- **Anonymous Walk-In Customers**:
  ```json
  "clientSnapshot": null
  ```

When `clientSnapshot` is `null`, client applications MUST render standard retail walk-in customer messaging (e.g. _"Walk-in Customer"_ / _"Consumidor Final"_).

---

## 8. Item Breakdown & Snapshot Preservations

Each line item in `items` captures the exact transaction state at sale finalization:

- `sourceType`: Catalog context origin (`MEMBERSHIP_PLAN`, `INVENTORY_ITEM`, `TREATMENT_SESSION`, `CUSTOM_SERVICE`).
- `sourceId`: Catalog identifier in the source domain.
- `description`: Name or description of the product/service frozen at checkout.
- `skuOrCode`: Catalog SKU, barcode, or code snapshotted at sale time.
- `quantity`: Units purchased (positive integer).
- `unitPrice`, `discountTotal`, `subtotal`, `total`: Structured money objects representing historical line finances.

---

## 9. Payment Breakdown & Multi-Tender Support

For single-tender transactions:

- `paymentMethod` and `paymentStatus` provide rapid top-level accessors (`CASH`, `COMPLETED`).
- `payments` contains a single item.

For split-tender transactions (e.g. $40 CASH + $60 QR = $100):

- `payments` contains the complete itemized breakdown of all settled tenders.
- `paymentMethod` indicates the primary tender method.
- `paymentStatus` is `COMPLETED`.

---

## 10. Contract Verification & Quality Gates

The canonical response representation is enforced by automated test suites:

- **API Serialization Spec**: [`apps/api/src/sales/__tests__/receipt-serialization-contract.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/receipt-serialization-contract.spec.ts)
- **Controller Integration**: [`apps/api/src/sales/__tests__/receipts-api.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/sales/__tests__/receipts-api.spec.ts)
- **Domain QA Matrix**: [`packages/core/src/sales/__tests__/receipt-financial-domain-qa-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/__tests__/receipt-financial-domain-qa-matrix.spec.ts)
