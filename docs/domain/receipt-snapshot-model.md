# Phase 7.7: Receipt Snapshot Model — Historical Financial Representations & Immutability Architecture

- **Document**: `docs/domain/receipt-snapshot-model.md`
- **Status**: Authoritative Domain Design Specification (APPROVED FOR MILESTONE 7.7)
- **Role**: Senior Domain Engineer (Specializing in Historical Financial Representations)
- **Bounded Context**: Sales & Payments (`packages/core/src/sales/`)
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals Invariant Enforcement](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture, Aggregate Boundaries, and Tender Decoupling](../adr/0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine, Lifecycle Specification, and Financial Transition Determinism](../adr/0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
- **Governing Business Rules**: [`docs/business-rules/sales-payments.md`](../business-rules/sales-payments.md)
- **Date**: 2026-09-24

---

## 1. Executive Summary & Design Mission

A customer receipt is a **legally binding proof-of-purchase document**. Its core mission is to guarantee that the transaction remains **historically understandable, auditable, and immutable** for years following issuance—regardless of subsequent mutations to customer profiles, inventory catalogs, membership pricing, or downstream accounting systems.

In accordance with **ADR-0117**, a `Receipt` is **NOT** a live query projection or dynamic SQL join. Dynamically joining tables (`clients`, `inventory_items`, `payments`) on read violates legal retention standards: if a customer changes their surname, if an inventory SKU description is revised, or if a product price changes next quarter, a dynamically generated receipt retroactively mutates, corrupting legal audit trails.

Therefore, the Receipt domain implements a dedicated **point-in-time snapshot model**:

- Every customer, commercial, item, and tender attribute necessary for historical understanding is frozen upon issuance.
- No generic snapshot serialization framework is introduced; all snapshots are strongly typed, DDD-compliant Value Objects (`ReceiptClientSnapshot`, `ReceiptItemSnapshot`, `ReceiptPaymentSnapshot`).
- Identifiers are never copied merely for convenience; every single field is classified and justified.

---

## 2. Evaluation of Domain Entities for Snapshotting

### 2.1 Client Model Evaluation (`modules/client` / `ClientSummaryDto`)

The platform's client entity resides in the Client Bounded Context (`modules/client`). Under ADR-0110 and ADR-0117, cross-context retrieval occurs strictly via `IClientFacade` producing `ClientSummaryDto`.

| Client Attribute                          | Copied to Receipt? | Target Field      | Reason & Architectural Justification                                                                                                                                                                   |
| :---------------------------------------- | :----------------- | :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                                  | **YES**            | `clientId`        | **Reference**. Scalar link to originating client account for customer-specific queries ("My Receipts").                                                                                                |
| **`fullName`** (`firstName` + `lastName`) | **YES**            | `fullName`        | **Snapshot**. Mandatory proof-of-purchase attribution. If the customer legally changes their name or marries, the receipt must retain the name at the time of purchase for insurance/tax verification. |
| **`referenceNumber`**                     | **YES**            | `referenceNumber` | **Snapshot**. Human-readable member/patient identifier (e.g. `CLI-2026-00123`). Required for membership desk checks and clinical insurance claim submission.                                           |
| **`email`**                               | **YES**            | `email`           | **Snapshot**. Point-in-time contact record demonstrating where digital proof-of-purchase was dispatched.                                                                                               |
| **`phone`**                               | **YES**            | `phone`           | **Snapshot**. Contact verification at POS and SMS receipt confirmation.                                                                                                                                |
| **Anonymous / Walk-in**                   | **N/A**            | `null`            | When a sale has no registered client (`clientId === null`), `clientSnapshot` is `null`. Valid legal voucher for anonymous retail cash sales.                                                           |
| _`identityId`_                            | **NO**             | _Excluded_        | Authentication identity link. Internal security token; exposing it on public receipts violates the principle of least privilege.                                                                       |
| _`status`_ (`ACTIVE`/`ARCHIVED`)          | **NO**             | _Excluded_        | Operational account status is ephemeral and irrelevant to a finalized, historic purchase.                                                                                                              |
| _`normalizedSearchName`_                  | **NO**             | _Excluded_        | Internal search-indexing implementation detail.                                                                                                                                                        |
| _`normalizedEmail`_ / _`phone`_           | **NO**             | _Excluded_        | Infrastructure normalization tokens; presentation uses the formatted email and phone.                                                                                                                  |
| _`timelineEntries`_                       | **NO**             | _Excluded_        | Client activity audit logs; completely out of scope for a receipt document.                                                                                                                            |

### 2.2 Sale Model Evaluation (`Sale` Aggregate)

The `Sale` aggregate is the commercial source of truth.

| Sale Attribute             | Copied to Receipt? | Target Field                | Reason & Architectural Justification                                                                                                                                    |
| :------------------------- | :----------------- | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                   | **YES**            | `saleId`                    | **Reference**. Scalar identifier linking the receipt to the commercial transaction.                                                                                     |
| **`id.value` / Reference** | **YES**            | `saleReference`             | **Snapshot**. Human-readable commercial reference. Even if the sale aggregate is archived, cold-stored, or partitioned, the voucher displays the order number directly. |
| **`status`**               | **NO**             | _Evaluated as Precondition_ | Receipt creation is permitted **only** when `sale.status === PAID                                                                                                       |     | COMPLETED`. Once issued, the receipt does not mirror future sale state transitions. |
| **`subtotal`**             | **YES**            | `subtotal`                  | **Snapshot**. Frozen sum of line items before order-level discounts.                                                                                                    |
| **`discountTotal`**        | **YES**            | `discountTotal`             | **Snapshot**. Frozen total reduction applied to the sale.                                                                                                               |
| **`total`**                | **YES**            | `total`                     | **Snapshot**. Frozen final payable and settled amount.                                                                                                                  |
| **`currency`**             | **YES**            | `currency`                  | **Derived / Verified**. Enforces single-currency homogeneity across items, totals, and tenders.                                                                         |
| _`version`_                | **NO**             | _Excluded_                  | Internal concurrency version of `Sale`. `Receipt` maintains its own aggregate version.                                                                                  |
| _`uncommittedEvents`_      | **NO**             | _Excluded_                  | In-memory domain event queue; non-persistent runtime state.                                                                                                             |
| _`cancellationReason`_     | **NO**             | _Excluded_                  | Invariant: Cancelled sales cannot issue receipts (ADR-0117 Invariant 9).                                                                                                |

### 2.3 SaleItem Model Evaluation (`SaleItem` Entity)

Every line item represents an agreed commercial exchange.

| SaleItem Attribute      | Copied to Receipt? | Target Field    | Reason & Architectural Justification                                                                                                                                                           |
| :---------------------- | :----------------- | :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                | **YES**            | `itemId`        | **Reference**. Scalar link to originating `SaleItemId`.                                                                                                                                        |
| **`source.sourceType`** | **YES**            | `sourceType`    | **Snapshot**. Categorization of the purchase (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`). Essential for tax categorization and visual grouping.                                 |
| **`source.sourceId`**   | **YES**            | `sourceId`      | **Reference / Snapshot**. Scalar reference to the originating catalog/session item for audit lineage.                                                                                          |
| **`description`**       | **YES**            | `description`   | **Snapshot**. Exact item description at checkout (e.g. "Hydrolyzed Whey 2kg", "Physiotherapy Initial Assessment"). If catalog items are renamed or deleted, the receipt retains original text. |
| **`skuOrCode`**         | **YES**            | `skuOrCode`     | **Snapshot**. Barcode, SKU, or billing code printed for warranty claims or inventory cross-checks.                                                                                             |
| **`quantity`**          | **YES**            | `quantity`      | **Snapshot**. Exact quantity purchased.                                                                                                                                                        |
| **`unitPrice`**         | **YES**            | `unitPrice`     | **Snapshot**. Unit price at time of purchase. Future catalog price rises must never alter historical vouchers.                                                                                 |
| **`discountTotal`**     | **YES**            | `discountTotal` | **Snapshot**. Exact line discount deducted.                                                                                                                                                    |
| **`subtotal`**          | **YES**            | `subtotal`      | **Snapshot**. `round(quantity * unitPrice)` in integer minor units (cents).                                                                                                                    |
| **`total`**             | **YES**            | `total`         | **Snapshot**. Line net payable: `subtotal - discountTotal`.                                                                                                                                    |

### 2.4 Payment Model Evaluation (`Payment` Aggregate)

The `Payment` aggregate is the tender source of truth.

| Payment Attribute                   | Copied to Receipt? | Target Field | Reason & Architectural Justification                                                                                         |
| :---------------------------------- | :----------------- | :----------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                            | **YES**            | `paymentId`  | **Reference**. Scalar link to the specific tender aggregate that collected funds.                                            |
| **`method`**                        | **YES**            | `method`     | **Snapshot**. Tender payment method (`CASH`, `CARD`, `TRANSFER`, `QR`). Evidence of tender mechanism.                        |
| **`status`**                        | **YES**            | `status`     | **Snapshot**. Precondition & snapshot: must be `COMPLETED` at issuance. Permanently documents that tender was collected.     |
| **`amount`**                        | **YES**            | `amount`     | **Snapshot**. Exact tender amount collected. Essential for multi-tender split settlement verification ($40 Card + $60 Cash). |
| **`reference`**                     | **YES**            | `reference`  | **Snapshot**. External reference (card authorization approval code, bank transfer receipt hash, POS slip number).            |
| **`paidAt`**                        | **YES**            | `paidAt`     | **Snapshot**. Exact timestamp when the tender was captured and settled.                                                      |
| _`version`_ / _`uncommittedEvents`_ | **NO**             | _Excluded_   | Internal aggregate lifecycle plumbing.                                                                                       |

---

## 3. Comprehensive Field Classification Matrix

Every field within the `Receipt` aggregate and its constituent snapshots is strictly classified as one of:

1. **Reference**: Scalar foreign identifier providing navigational lineage without runtime joins.
2. **Snapshot**: Permanently frozen point-in-time value representing historical truth at issuance.
3. **Derived Presentation Value**: Computed deterministically from frozen snapshots or aggregate operational state.

| Scope                | Field Name                | Type                            | Classification                 | Why Classified / Invariant Guard                                                 |
| :------------------- | :------------------------ | :------------------------------ | :----------------------------- | :------------------------------------------------------------------------------- |
| **Receipt Root**     | `id`                      | `ReceiptId`                     | **Reference**                  | Unique aggregate identifier. Immutable entity identity.                          |
| **Receipt Root**     | `tenantId`                | `string`                        | **Reference**                  | Multi-tenant isolation partition key. Enforces data isolation.                   |
| **Receipt Root**     | `saleId`                  | `SaleId`                        | **Reference**                  | Scalar link to commercial transaction. Never loaded via eager join.              |
| **Receipt Root**     | `receiptNumber`           | `ReceiptNumber`                 | **Snapshot**                   | Monotonically assigned gap-free alphanumeric voucher number (`REC-YYYY-XXXXXX`). |
| **Receipt Root**     | `saleReference`           | `string`                        | **Snapshot**                   | Point-in-time human-readable order reference.                                    |
| **Receipt Root**     | `issuedAt`                | `Date`                          | **Snapshot**                   | Legal issuance timestamp. Defensively cloned on get/set.                         |
| **Receipt Root**     | `subtotal`                | `Money`                         | **Snapshot**                   | Frozen pre-discount commercial subtotal.                                         |
| **Receipt Root**     | `discountTotal`           | `Money`                         | **Snapshot**                   | Frozen commercial discount total.                                                |
| **Receipt Root**     | `total`                   | `Money`                         | **Snapshot**                   | Frozen net settled amount payable. Reconciled against item subtotals.            |
| **Receipt Root**     | `clientSnapshot`          | `ReceiptClientSnapshot \| null` | **Snapshot**                   | Frozen customer presentation data. Null for anonymous sales.                     |
| **Receipt Root**     | `items`                   | `ReceiptItemSnapshot[]`         | **Snapshot**                   | Immutable array of frozen item rows. Read-only projection.                       |
| **Receipt Root**     | `payments`                | `ReceiptPaymentSnapshot[]`      | **Snapshot**                   | Immutable array of frozen settled tenders. Read-only projection.                 |
| **Receipt Root**     | `currency`                | `string`                        | **Derived Presentation Value** | Directly derived from `total.currency`. Homogeneous across all lines.            |
| **Receipt Root**     | `itemCount`               | `number`                        | **Derived Presentation Value** | Computed as `items.length`.                                                      |
| **Receipt Root**     | `paymentMethod`           | `PaymentMethod`                 | **Derived Presentation Value** | Accessor for `payments[0].method` (convenience for single tender).               |
| **Receipt Root**     | `paymentStatus`           | `PaymentStatus`                 | **Derived Presentation Value** | Accessor for `payments[0].status` (convenience for single tender).               |
| **Receipt Root**     | `status`                  | `ReceiptStatus`                 | **Derived Operational State**  | State machine: `ISSUED` $\rightarrow$ `REPRINTED`. Transitions only on reprint.  |
| **Receipt Root**     | `reprintCount`            | `number`                        | **Derived Operational State**  | Monotonic counter incremented on duplicate print operations.                     |
| **Receipt Root**     | `lastReprintedAt`         | `Date \| null`                  | **Derived Operational State**  | Timestamp of the most recent duplicate copy issuance.                            |
| **Receipt Root**     | `version`                 | `number`                        | **Derived Operational State**  | Optimistic concurrency control counter.                                          |
| **Receipt Root**     | `createdAt` / `updatedAt` | `Date`                          | **Derived Operational State**  | Persistence audit timestamps.                                                    |
| **Client Snapshot**  | `clientId`                | `string`                        | **Reference**                  | Scalar reference to client record.                                               |
| **Client Snapshot**  | `fullName`                | `string`                        | **Snapshot**                   | Customer legal name at purchase date. Immune to name changes.                    |
| **Client Snapshot**  | `referenceNumber`         | `string \| null`                | **Snapshot**                   | Customer membership/patient code at purchase date.                               |
| **Client Snapshot**  | `email`                   | `string \| null`                | **Snapshot**                   | Contact email at purchase date.                                                  |
| **Client Snapshot**  | `phone`                   | `string \| null`                | **Snapshot**                   | Contact phone at purchase date.                                                  |
| **Item Snapshot**    | `itemId`                  | `string`                        | **Reference**                  | Originating line item identifier.                                                |
| **Item Snapshot**    | `sourceType`              | `string`                        | **Snapshot**                   | Commercial category for tax/reporting classification.                            |
| **Item Snapshot**    | `sourceId`                | `string`                        | **Reference / Snapshot**       | Originating catalog entity identifier.                                           |
| **Item Snapshot**    | `description`             | `string`                        | **Snapshot**                   | Exact item description at checkout. Immune to catalog edits.                     |
| **Item Snapshot**    | `skuOrCode`               | `string \| null`                | **Snapshot**                   | Product SKU or service billing code.                                             |
| **Item Snapshot**    | `quantity`                | `number`                        | **Snapshot**                   | Quantity purchased.                                                              |
| **Item Snapshot**    | `unitPrice`               | `Money`                         | **Snapshot**                   | Agreed unit price. Immune to catalog price rises.                                |
| **Item Snapshot**    | `discountTotal`           | `Money`                         | **Snapshot**                   | Line item discount reduction.                                                    |
| **Item Snapshot**    | `subtotal`                | `Money`                         | **Snapshot**                   | `round(quantity * unitPrice)`.                                                   |
| **Item Snapshot**    | `total`                   | `Money`                         | **Snapshot**                   | `subtotal - discountTotal`.                                                      |
| **Payment Snapshot** | `paymentId`               | `string`                        | **Reference**                  | Tender payment aggregate identifier.                                             |
| **Payment Snapshot** | `method`                  | `PaymentMethod`                 | **Snapshot**                   | Tender payment method (`CASH`, `CARD`, `TRANSFER`, `QR`).                        |
| **Payment Snapshot** | `status`                  | `PaymentStatus`                 | **Snapshot**                   | Tender payment status (frozen at `COMPLETED`).                                   |
| **Payment Snapshot** | `amount`                  | `Money`                         | **Snapshot**                   | Tender amount collected.                                                         |
| **Payment Snapshot** | `reference`               | `string \| null`                | **Snapshot**                   | Card auth code, bank slip reference, or QR transaction ID.                       |
| **Payment Snapshot** | `paidAt`                  | `Date \| null`                  | **Snapshot**                   | Timestamp of payment settlement.                                                 |

---

## 4. Mutation Safety & Architectural Invariants

### 4.1 Client Post-Issuance Mutation Safety

When a client updates their name (e.g. from "Jane Doe" to "Jane Smith") or updates their email/phone via `modules/client`, the issued `Receipt` **must NOT change**:

1. The receipt retains the frozen `ReceiptClientSnapshot`.
2. The snapshot Value Object is frozen (`Object.freeze(this)`).
3. Direct database table joins from receipts to `clients` are strictly prohibited in application queries.

### 4.2 Sale & SaleItem Post-Issuance Mutation Safety

When an inventory item description is changed in the catalog (e.g. "Whey Protein" $\rightarrow$ "Whey Protein Isolate") or unit prices are increased next month:

1. The receipt retains the frozen `ReceiptItemSnapshot` array.
2. Each item snapshot is frozen and independent of the live catalog.
3. Callers cannot mutate the array of items through `receipt.items` because getters return frozen shallow copies (`Object.freeze([...this._items])`).

### 4.3 Payment Status Post-Issuance Mutation Safety

In accordance with **ADR-0116** and **ADR-0117**:

1. Settled payments are terminal (`COMPLETED`).
2. Even if a future compensating refund occurs, the original proof-of-purchase receipt remains frozen.
3. Compensating refunds issue an independent `CreditNote` or `RefundReceipt` rather than retroactively mutating the historical receipt.
4. Callers cannot mutate the array of payments through `receipt.payments` because getters return frozen shallow copies (`Object.freeze([...this._payments])`).

### 4.4 Date and Memory Defense

All date properties (`issuedAt`, `paidAt`, `createdAt`, `updatedAt`, `lastReprintedAt`) are defensively cloned both upon receipt construction and upon getter access (`new Date(date.getTime())`). Mutating a retrieved Date instance externally has zero effect on the internal aggregate state.
