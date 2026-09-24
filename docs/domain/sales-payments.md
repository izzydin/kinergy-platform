# Phase 7: Sales & Payments — Conceptual Domain Model Specification

- **Document**: `docs/domain/sales-payments.md`
- **Status**: Authoritative Domain Source of Truth
- **Milestone**: Phase 7.1 — Sale Domain Implementation & Invariant Synchronization
- **Role**: Principal Domain Designer / Staff Platform Architect
- **Date**: 2026-09-17

---

## 1. Executive Summary & Context

This document establishes the authoritative conceptual domain model for **Phase 7: Sales & Payments** of the Kinergy platform.

Following the core architectural law established in [`docs/architecture/sales-payments.md`](file:///c:/Projects/kinergy-platform/docs/architecture/sales-payments.md):

> **"References Over Ownership."**  
> The Sales & Payments domain models commercial agreements, customer checkout sessions, monetary tender collections, and receipt vouchers. It never takes ownership of the products, subscriptions, medical records, or clients that participate in those transactions.

This specification defines the ubiquitous domain language, aggregate boundaries, entity lifecycles, value objects, state machines, non-negotiable invariants, and business traceability before any production code is written.

---

## 2. Ubiquitous Language & Core Concepts

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SALES & PAYMENTS UBIQUITOUS VOCABULARY                    │
│                                                                              │
│  Sale             The commercial transaction aggregate root representing a    │
│                   purchase agreement between Kinergy and a customer.         │
│                                                                              │
│  SaleItem         An internal line-item entity within a Sale capturing an     │
│                   immutable snapshot of what was purchased and at what price.│
│                                                                              │
│  Payment          An autonomous aggregate root representing a financial       │
│                   monetary tender transaction settling part or all of a Sale.│
│                                                                              │
│  Receipt          An immutable proof-of-purchase document voucher issued to   │
│                   the customer upon financial settlement.                    │
│                                                                              │
│  SourceReference  An immutable Value Object identifying the origin entity    │
│                   (e.g., inventory item, membership plan, treatment session).│
│                                                                              │
│  Money            A canonical Value Object representing a non-negative       │
│                   monetary amount with an explicit ISO-4217 currency.        │
│                                                                              │
│  Discount         An immutable Value Object representing a fixed-amount or   │
│                   percentage price reduction justified by a business reason. │
│                                                                              │
│  TaxRate          A Value Object representing an applicable sales/VAT levy.  │
│                                                                              │
│  PaymentMethod    An enumeration of accepted tender mechanisms (CASH, QR;    │
│                   architecture leaves room for CARD, TRANSFER, ONLINE).      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Domain Entity & Aggregate Specifications

### 3.1 `Sale` (Aggregate Root)

#### Purpose

`Sale` is the aggregate root governing the commercial agreement between the wellness facility and a customer. It orchestrates the addition, modification, and removal of line items, applies discounts, computes taxable amounts, tracks the remaining balance, and enforces commercial lifecycle state transitions.

#### Identity & Multi-Tenancy

- **`id: SaleId`**: Canonical Value Object uniquely identifying the sale within the platform (`SaleId.create()` or `SaleId.fromString()`).
- **`tenantId?: string`**: Organization boundary. An unconstrained scalar string identifying the tenant; cross-tenant operations are strictly forbidden. Optional during domain instantiation, strictly enforced at application/repository boundaries.
- **`clientId?: string`**: Optional reference to a registered Client (Phase 2). Omitting `clientId` models an anonymous front-desk walk-in retail purchase without CRM pollution.
- **`currency: string`**: Normalized 3-letter uppercase ISO-4217 standard currency code (e.g. `"USD"`, `"CAD"`).
- **`source: SourceReference`**: Value Object establishing the loose commercial origin (`sourceType`, `sourceId`, `sourceCode?`).
- **`status: SaleStatus`**: 7 canonical lifecycle states (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`).
- **`version: number`**: Integer counter ($\ge 1$) for Optimistic Concurrency Control (OCC), incremented on every lifecycle transition.
- **Actor Attribution**: Note that authenticated staff attribution (`cashierId`) is supplied to application command handlers and captured in domain events (`SaleCreatedEvent`, etc.) rather than stored as an internal state field of the aggregate root itself.

#### Aggregate Root Responsibility & Encapsulation

`Sale` is the **sole gateway** for mutating order state. External consumers cannot manipulate `SaleItem` entities directly; all line item additions, quantity adjustments, and discount evaluations must execute through methods on `Sale`:

- **Line Item Mutations**: `addItem(props, clock?)`, `updateItemQuantity(itemId, qty, clock?)`, `removeItem(itemId, clock?)`
- **Discounts**: `applyItemDiscount(itemId, discount, clock?)`, `removeItemDiscount(itemId, clock?)`, `applyOrderDiscount(discount, clock?)`, `removeOrderDiscount(clock?)`
- **Lifecycle Transitions**: `finalize(clock?)`, `markPartiallyPaid(clock?)`, `markPaid(clock?)`, `markCompleted(clock?)`, `markRefunded(reason?, clock?)`, `cancel(reason, clock?)`
- **Event Sourcing / Outbox**: `getUncommittedEvents()`, `clearEvents()`
- **Collection Safety & Defensive Copies**: The `items` getter returns `ReadonlyArray<SaleItem>` backed by `Object.freeze([...this._items])`. Mutating the returned array fails at runtime without affecting the aggregate's internal state. Date getters return defensive clones (`new Date(time)`).

#### Invariants Enforced by `Sale`

1. **Empty Order Prohibition**: A sale cannot transition out of `DRAFT` to `PENDING_PAYMENT` with zero items (`Sale.finalize()` throws `EmptySaleException` with code `'EMPTY_SALE'`).
2. **Monetary Non-Negativity**: The net total payable amount (`total`) must always be $\ge 0.00$. Line and order discounts are capped at the corresponding subtotal.
3. **Currency Homogeneity**: Every `SaleItem`, order discount, subtotal, and total within a `Sale` must share the identical ISO-4217 currency. Attempting to add an item with a mismatched currency throws `InvalidSaleStateException`.
4. **Commercial Locking**: Once a `Sale` departs `DRAFT` (into `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, or `REFUNDED`), cart mutations (`addItem`, `removeItem`, `updateItemQuantity`, discounts) throw `SaleAlreadyFinalizedException` with code `'SALE_ALREADY_FINALIZED'`.
5. **Deterministic Reconciliation Invariant (Phase 7.4 Scope - ADR-0114)**:
   $$\text{Subtotal} = \sum (\text{SaleItem.subtotal})$$
   $$\text{DiscountTotal} = \sum (\text{SaleItem.discountTotal})$$
   $$\text{Total} = \text{Subtotal} - \text{DiscountTotal}$$
   $$\text{Total} \ge \$0.00$$
   (Phase 7.4 enforces deterministic integer-cent arithmetic with Commercial Half-Up rounding; see [`docs/domain/sale-totals-implementation.md`](sale-totals-implementation.md)).
6. **Cancellation Reason Invariant**: A sale can only be cancelled from `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID` and requires a non-empty `cancellationReason` string (`InvalidSaleStateException` with code `'INVALID_CANCELLATION_REASON'`).

#### Field Mutability Classification

- **Permanently Immutable (set at creation)**: `id`, `tenantId`, `currency`, `source`, `createdAt`.
- **Conditionally Mutable (only while `status == DRAFT`)**: `clientId`, `items`, `orderDiscount`.
- **Lifecycle Mutable (via explicit domain methods)**: `status`, `completedAt`, `cancelledAt`, `cancellationReason`, `refundedAt`, `version`, `updatedAt`.

---

### 3.2 `SaleItem` (Internal Entity)

#### Ownership & Aggregate Control

`SaleItem` is an **internal child entity** exclusively owned by the `Sale` aggregate root. It has no independent global identity, no standalone repository, and cannot be created, queried, or modified directly by external callers. The parent `Sale` aggregate root controls the entire lifecycle:

- Adding: `sale.addItem(props, clock?)`
- Modifying Quantity: `sale.updateItemQuantity(itemId, newQty, clock?)`
- Applying Discount: `sale.applyItemDiscount(itemId, discount, clock?)`
- Removing Discount: `sale.removeItemDiscount(itemId, clock?)`
- Removing Item: `sale.removeItem(itemId, clock?)`
- Querying: `sale.getItem(itemId)`, `sale.hasItem(itemId)`, `sale.itemCount`, and `sale.items` (frozen defensive array)

#### Historical Commercial Snapshot Principle

> [!IMPORTANT]
> **Historical Commercial Snapshot Law**:  
> A `SaleItem` represents what was commercially agreed upon and sold at the exact point in time of checkout.  
> The source catalog entity (e.g. `InventoryItem`, `MembershipPlan`, `TreatmentSession`) represents current operational catalog state.  
> Under no circumstance may a `SaleItem` dynamically query or re-read current catalog prices, descriptions, or availability from upstream source tables at runtime.

If a catalog product is repriced, renamed, discontinued, or archived, historical `SaleItem` records remain permanently frozen and valid.

#### Detailed Attributes & Semantics

- **`id: SaleItemId`**: Canonical Value Object uniquely identifying the line item locally within the sale.
- **`source: SourceReference`**: Value Object capturing origin entity (`sourceType`, `sourceId`, `sourceCode?`). Identifies the commercial origin without creating foreign keys or taking domain ownership.
- **`description: string`**: Non-empty, trimmed text snapshot of the purchased good or service at checkout. Subsequent catalog renaming does not alter this historical text.
- **`skuOrCode: string | null`**: Snapshot of the catalog SKU, plan code, or billing code at checkout.
- **`quantity: number`**: Finite, strictly positive number ($> 0$).
  - **Minimum Quantity**: `0.001` (values strictly $< 0.0005$ round down to `0` and throw `InvalidSaleItemException`).
  - **Maximum Quantity**: `999,999` (`SaleItem.MAX_QUANTITY`). Values exceeding this limit are deterministically rejected.
  - **Normalization**: Normalized to 3 decimal places (`Math.round((quantity + Number.EPSILON) * 1000) / 1000`), supporting both discrete integers and bulk/weighted goods.
  - **Rejections**: Zero, negative values, `NaN`, non-finite numbers, and values rounding to zero throw `InvalidSaleItemException`.
- **`unitPrice: Money`**: Canonical `Money` Value Object representing the agreed gross commercial price at checkout:
  - **Non-Negativity**: Must be $\ge 0.00$.
  - **Promotional / Complimentary Items**: Supported at `$0.00`.
  - **Negative Values**: Strictly rejected by `Money` and `SaleItem` invariants.
  - **No Dynamic Recalculation**: Once established, unit price is never refreshed from the source catalog.
- **`discount: Discount | null`**: Canonical `Discount` Value Object representing line-item reductions:
  - **Allowed Types**: `FIXED` (with `FIXED_AMOUNT` alias) or `PERCENTAGE`.
  - **Audit Reason**: Optional trimmed string (`reason?: string | null`) capturing commercial justification.
  - **Cent Rounding**: Commercial Half-Up rounding in integer minor units. Zero floating-point arithmetic.
  - **Eligible Amount**: Gross line subtotal ($\text{eligibleAmount} = \text{lineSubtotal}$).
  - **Strict Non-Exceeding Guard**: A fixed discount cannot exceed the line subtotal ($\text{fixed} \le \text{subtotal}$). Attempting to apply $\text{fixed} > \text{subtotal}$ is strictly rejected with `InvalidDiscountException` (no silent clamping).
  - **Zero Behavior**: $0\%$ or $\$0.00$ produces $\$0.00$ reduction and leaves net total identical to subtotal.
  - **Rejections**: Negative discounts, percentages $> 100\%$, and fixed discounts exceeding subtotal are rejected.
- **`subtotal: Money`** (alias: `lineSubtotal`): $\text{unitPrice.multiply(normalizedQuantity)}$, calculated via canonical `Money` with Half-Up cent rounding.
- **`discountTotal: Money`** (alias: `lineDiscountTotal` / `discountAmount`): $\text{discount ? discount.calculate(subtotal) : Money.zero(currency)}$.
- **`total: Money`** (alias: `lineTotal`): $\text{subtotal.subtract(discountTotal)}$, guaranteed $\ge \$0.00$.

#### Immutability Milestones

1. **Creation & Cart Phase (`status == DRAFT`)**:
   - `description`, `skuOrCode`, `unitPrice`, and `source` are immutable snapshots established at insertion.
   - `quantity` and `discount` are conditionally mutable, but **only** via `Sale` aggregate root methods (`updateItemQuantity`, `applyItemDiscount`, `removeItemDiscount`).
   - `SaleItem` instances are frozen with `Object.freeze(this)`. Updates return replacement instances preserving entity identity.
2. **Finalization Milestone (`status != DRAFT`)**:
   - Once the parent `Sale` is finalized (`PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`), **all commercial terms are locked**.
   - Any attempt to add, remove, or modify items throws `SaleAlreadyFinalizedException`.
   - Historical item values and aggregate totals remain permanently immutable.

#### Historical Snapshot Traceability Matrix

The following end-to-end traceability chain connects high-level requirements to executable regression tests:

```text
Requirement: REQ-HIST-01 (Historical Commercial Truth)
    ↓
Business Rules: SALE-08 (Commercial Lock), ITEM-04 (Permanent Snapshot), ITEM-09 (Post-Finalization Freeze)
    ↓
SaleItem Invariants: ITEM-01 (Ownership), ITEM-02 (Quantity), ITEM-03 (Price), ITEM-07 (Discount Cap)
    ↓
Domain Implementation:
  - packages/core/src/sales/domain/sale.aggregate.ts
  - packages/core/src/sales/domain/entities/sale-item.entity.ts
  - packages/core/src/sales/domain/value-objects/source-reference.vo.ts
    ↓
Executable Test Suites:
  - packages/core/src/sales/domain/__tests__/sale-item-historical-snapshot.spec.ts (Scenarios 1–8)
  - packages/core/src/sales/domain/__tests__/sale-item-integration.spec.ts
  - packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts
```

| Step in Traceability  | Artifact / Identifier                   | Verified Behavior                                                                                                                                                       |
| :-------------------- | :-------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirement**       | `REQ-HIST-01`                           | Commercial transactions must preserve point-in-time checkout values regardless of source changes.                                                                       |
| **Business Rule**     | `SALE-08`, `ITEM-04`, `ITEM-09`         | Commercial terms freeze at checkout; dynamic joins to source catalog tables are forbidden.                                                                              |
| **Domain Rule**       | `ITEM-01` through `ITEM-09`             | Subtotal, discount capping, quantity bounds ($0.001$ to $999,999$), non-negative price, and unowned source reference.                                                   |
| **Implementation**    | `Sale`, `SaleItem`, `SourceReference`   | Immutable frozen value objects and entities; arithmetic via integer minor units; aggregate root gatekeeping.                                                            |
| **Verification Test** | `sale-item-historical-snapshot.spec.ts` | 8 dedicated regression scenarios: Price Change, Description Change, Status Change, Deletion/Archival, Finalized Sale, Encapsulation, Reconciliation, Failure Atomicity. |

---

### 3.3 `Payment` (Autonomous Aggregate Root)

#### Foundational Domain Distinction

A critical architectural tenet of the Kinergy platform is the absolute separation between the commercial contract and the financial tender:

```text
Sale = commercial transaction / amount owed

Payment = money paid toward a Sale
```

> **Payment does not replace or recalculate Sale totals.**
>
> `Sale` is the sole source of truth for commercial order state: line items, item discounts, subtotals, and final totals owed.
> `Payment` is an autonomous transaction representing monetary value tendered toward satisfying that commercial debt. Recording, settling, or cancelling a `Payment` never mutates or recalculates `Sale.subtotal`, `Sale.discountTotal`, or `Sale.total`.

#### Payment Domain Model

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

Detailed aggregate properties:

- **`id: PaymentId`**: Canonical UUID uniquely identifying the financial transaction (`PaymentId.create()` or `PaymentId.fromString()`).
- **`tenantId: string`**: Organization boundary guaranteeing multi-tenant isolation.
- **`saleId: SaleId`**: Unconstrained scalar reference to the `Sale` being settled. `Payment` holds no object reference to `Sale`.
- **`method: PaymentMethod`**: The tender mechanism (`CASH`, `QR`).
- **`amount: Money`**: Canonical `Money` value object representing the non-negative tender amount ($> 0$).
- **`status: PaymentStatus`**: Exact 4-state canonical lifecycle (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`). `SETTLED` is recognized as an accepted synonym and database mapping.
- **`reference: string | null`**: Optional, sanitized external correlation identifier (max 100 characters; register tag or gateway trace; no PAN).
- **`paidAt: Date | null`**: UTC timestamp populated exclusively upon entering `COMPLETED`, `null` otherwise.
- **`createdAt: Date`**: Immutable creation timestamp.
- **`updatedAt: Date`**: Timestamp of last lifecycle transition.
- **`version: number`**: Integer counter ($\ge 1$) for Optimistic Concurrency Control (OCC).

#### Critical Encapsulation Rule

> **Payment status cannot be changed directly. Every state transition must pass through domain/application lifecycle logic.**

- `_status` is private within `Payment`. The property getter `status` is read-only.
- Direct status assignment (`payment.status = ...`) is prohibited and blocked by the compiler (`TS2540`).
- Transitions occur strictly via domain methods: `complete()`, `fail()`, `cancel()`, or `applyTransition()`.

#### Payment Methods

Currently supported payment methods:

```text
CASH
QR
```

- **`CASH`**: Physical in-person currency tendered at the reception or POS counter. Instantiated directly as `COMPLETED`.
- **`QR`**: Dynamic or static QR code payment generated for customer scanning via mobile banking or digital wallet. Instantiated as `PENDING`.

**Extensibility Design**: The architecture intentionally leaves room for:

```text
CARD
TRANSFER
ONLINE
```

without implementing them yet. Future methods are architecturally recognized in `isFuturePaymentMethod()` and will be introduced alongside gateway adapter ports without altering core aggregate boundaries or database schemas. Speculative runtime usage of these future methods throws `InvalidPaymentMethodException`.

#### Payment Status & State Transition Matrix

The Payment domain implements an exact, deterministic 4-state machine:

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
│                complete()   │   │   │  cancel()                        │
│         ┌───────────────────┘   │   └────────────────────┐             │
│         ▼                       ▼ fail()                 ▼             │
│  ┌─────────────┐         ┌─────────────┐          ┌─────────────┐      │
│  │  COMPLETED  │         │   FAILED    │          │  CANCELLED  │      │
│  └─────────────┘         └─────────────┘          └─────────────┘      │
│    (Terminal &              (Terminal)               (Terminal)        │
│     Immutable)                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

Transition Matrix:

```text
Current       Action          Result
-----------------------------------------
PENDING       complete        COMPLETED
PENDING       fail            FAILED
PENDING       cancel          CANCELLED
```

Exact transition table:

| From Status | To Status   | Trigger Method               | Invariants & Preconditions                                                           |
| :---------- | :---------- | :--------------------------- | :----------------------------------------------------------------------------------- |
| _Initial_   | `COMPLETED` | `Payment.createCompleted()`  | Direct cash or instant counter payment. `paidAt` set immediately.                    |
| _Initial_   | `PENDING`   | `Payment.createPending(...)` | Asynchronous tender (e.g., QR awaiting scan). `paidAt = null`.                       |
| `PENDING`   | `COMPLETED` | `payment.complete(opts?)`    | Funds received and verified. `paidAt` populated. Permanent immutability commences.   |
| `PENDING`   | `FAILED`    | `payment.fail(reason?)`      | Rail timeout, expired session, or customer decline. `paidAt = null`. Terminal state. |
| `PENDING`   | `CANCELLED` | `payment.cancel(reason?)`    | Operator voids pending transaction before completion. `paidAt = null`. Terminal.     |
| `COMPLETED` | _Any_       | **PROHIBITED**               | **Illegal State Transition**. Completed records are permanently immutable.           |
| `FAILED`    | _Any_       | **PROHIBITED**               | Terminal. No further transitions permitted.                                          |
| `CANCELLED` | _Any_       | **PROHIBITED**               | Terminal. No further transitions permitted.                                          |

All 13 prohibited transitions throw typed `InvalidPaymentTransitionException`. Terminal states cannot re-enter the lifecycle. Repeating a command on a terminal payment is rejected deterministically.

_Note: No `AUTHORIZED` or intermediate hold state exists in the implementation._

#### Money Policy Reference

In accordance with [ADR-0108](../adr/0108-money-representation.md) and [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md):

- `Payment.amount` strictly reuses the canonical `Money` value object (`packages/core/src/sales/domain/value-objects/money.vo.ts`).
- `Payment.amount` uses the identical deterministic integer-cent arithmetic rules.
- Floating-point arithmetic is strictly prohibited.
- Payment amounts must be strictly positive ($\text{Payment.amount} > \$0.00$). Zero or negative values throw `InvalidPaymentAmountException`.
- The payment currency must strictly match the parent `Sale` currency.

#### Domain-to-Persistence Boundary

The system enforces strict boundary mapping between pure domain value objects and physical database storage:

```text
Payment.amount
      ↓
Money (integer cents in memory)
      ↓
Persistence mapper (PrismaPaymentMapper)
      ↓
Prisma Decimal (new Prisma.Decimal(amount.amount))
      ↓
PostgreSQL NUMERIC/DECIMAL (@db.Decimal(12, 2))
```

- Domain code never references `Prisma.Decimal` or database types.
- Relational mapping preserves exact scale 2 and precision 12, preventing round-trip drift.

#### Multi-Tender & Balance Reconciliation

1. **Multi-Tender Settlement**: Multiple payments can be linked to a single `Sale` ($1 \text{ Sale} \to N \text{ Payments}$), enabling split cash and QR tenders.
2. **Balance Calculation**:
   $$\text{SettledTotal} = \sum_{p \in \text{SettledPayments}} p.\text{amount}$$
   $$\text{BalanceRemaining} = \max(0, \text{Sale}.\text{total} - \text{SettledTotal})$$
3. **Overpayment Protection**:
   - For electronic tenders (`QR`), attempting to charge $\text{amount} > \text{BalanceRemaining}$ throws `PaymentOverpaymentException`.
   - For cash tenders, `Payment.amount` records the exact debt-satisfying amount, while the UI/POS layer captures `tenderedAmount` and `changeGiven` for physical drawer reconciliation.

#### Immutability & Financial Audit Protection

- **Write-Once Settlement**: Once a payment enters `SETTLED`, all fields are frozen. Updates and deletions are blocked by domain guards and persistence restrictions (`onDelete: Restrict`).
- **Compensating Refunds**: Erroneous payments or returns are resolved through compensating transactions, never in-place mutations.

---

### 3.4 `Receipt` (Autonomous Document Entity)

#### Nature of a Receipt: Proof vs. Financial Truth

> [!NOTE]
> **Is a Receipt a Financial Source of Truth?**  
> **No.** A `Receipt` is **NOT** the financial source of truth.  
> The financial truth is authoritatively governed by the `Sale` and `Payment` aggregates.  
> A `Receipt` is an **immutable, customer-facing legal proof-of-purchase voucher** that represents and evidences an already-settled financial transaction.
> Formally codified in [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md).

#### Generation, Immutability & Lifecycle Rules

1. **Existence Preconditions**: A `Receipt` can exist **exclusively** after the underlying `Sale` has achieved full financial settlement (status `PAID` or `COMPLETED`).
   - `DRAFT` Sales: **PROHIBITED** (unfinalized cart).
   - `PENDING_PAYMENT` Sales: **PROHIBITED** (unsettled balance).
   - `PAID` Sales: **PERMITTED & MANDATORY** (official issuance trigger).
   - `CANCELLED` Sales: **PROHIBITED** (voided orders cannot issue receipts).
2. **Idempotency & Cardinality**: One `Sale` maps to at most **one primary `Receipt`**. Issuance is strictly idempotent; subsequent requests return the existing receipt.
3. **Permanent Data Immutability**: Once issued, all financial data, line items, customer details, and issuance timestamps are permanently write-once/frozen.
4. **Historical Data Preservation via Snapshots**:
   - `clientSnapshot`: Frozen copy of customer legal name, reference number, email, and phone at issuance time. Never performs a runtime SQL `JOIN` to `clients`.
   - `items`: Frozen snapshot of item descriptions, SKUs, quantities, unit prices, discounts, and line totals.
   - `payments`: Frozen snapshot of settled tenders (method, settled amount, reference, `paidAt`).
5. **Sequential Monotonic Numbering**: Every receipt receives a gap-free, monotonically increasing alphanumeric receipt number per tenant (e.g. `REC-2026-000421`), partitioned by `tenantId`.
6. **No Regeneration / Duplicate Watermark**: Customer reprint requests do **not** regenerate or create a new receipt. The system re-renders the frozen receipt snapshot stamped with a mandatory `DUPLICATE / REPRINT` watermark and increments `reprintCount`.
7. **Refund Separation**: When a sale is refunded, the original receipt remains frozen. A separate `CreditNote` or `RefundReceipt` is issued.
8. **Explicitly Out of Scope**: General ledger accounting, double-entry bookkeeping, tax accounting/VAT declarations, fiscal printer hardware drivers, and government e-invoicing are strictly out of scope.

---

### 3.5 `SourceReference` (Value Object) & Source Analysis

#### Structure & Semantics

`SourceReference` is an immutable Value Object identifying what generated the charge:

```
SourceReference
├── sourceType: SourceType (INVENTORY_ITEM | MEMBERSHIP_PLAN | TREATMENT_SESSION | CUSTOM_SERVICE)
├── sourceId: string (Scalar UUID or "CUSTOM")
└── sourceCode?: string (Optional human-readable SKU or business identifier)
```

#### Detailed Source-by-Source Domain Matrix

| Source Type                                                 | 1. Source Owner                     | 2. Sales Responsibility                                                                   | 3. Source Reference                                                               |                                  4. Validates Existence?                                  |                                                  5. May Mutate Source?                                                   |                                        6. Can Source Be Deleted After Sale?                                        | 7. What If Source Changes Later?                                                                                                          |
| :---------------------------------------------------------- | :---------------------------------- | :---------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **1. `TreatmentSession`**                                   | **Kinesiology (Phase 4)**           | Records billing of the clinical session; collects patient/client payment; issues receipt. | `sourceType: TREATMENT_SESSION`<br>`sourceId: treatmentSessionId`                 | **Yes**, queries treatment query port; verifies session exists and is completed/billable. |   **No**, Sales invokes `TreatmentBillingPort.markSessionBilled()` upon settlement. Sales never touches medical notes.   | **No**, clinical sessions are immutable legal medical records. Medico-legal retention protects them from deletion. | `SaleItem` retains its frozen price/service snapshot. If the clinical note is amended, the commercial billing amount does **not** change. |
| **2. `Gym Membership / Plan`**                              | **Gym Management (Phase 5)**        | Collects membership subscription or renewal fee; issues receipt.                          | `sourceType: MEMBERSHIP_PLAN`<br>`sourceId: membershipPlanId`                     |               **Yes**, queries plan query port; verifies plan is `ACTIVE`.                |   **No**, Sales invokes `GymMembershipActivationPort` to activate/renew. Sales never mutates validity dates directly.    |       **No**, plans with historical memberships/sales are `ARCHIVED`, never hard-deleted from the database.        | `SaleItem` retains the frozen plan price at checkout. If the gym administrator raises the plan price next week, past sales remain frozen. |
| **3. `Healthy Meal`**                                       | **Resources (Phase 6 Consumables)** | Sells meal at POS/kitchen; collects payment; requests inventory depletion.                | `sourceType: INVENTORY_ITEM`<br>`sourceId: inventoryItemId`<br>`sourceCode: SKU`  |  **Yes**, queries inventory query port; checks active item and available stock on hand.   | **No**, Sales invokes `InventoryStockDecrementPort.sellStock()`. Sales never writes to `inventory_items.quantityOnHand`. |    **No**, inventory items with transaction history are `ARCHIVED` (soft-delete), never hard-deleted from SQL.     | `SaleItem` retains frozen meal description and price. If kitchen updates recipe cost or retail price, past sales remain frozen.           |
| **4. `Healthy Drink`**                                      | **Resources (Phase 6 Consumables)** | Sells beverage at reception/bar; collects payment; requests stock deduction.              | `sourceType: INVENTORY_ITEM`<br>`sourceId: inventoryItemId`<br>`sourceCode: SKU`  |      **Yes**, checks item status and verifies `quantityOnHand >= requestedQuantity`.      |    **No**, Sales requests deduction via capability port. Resources verifies OCC and logs append-only `SALE` movement.    |      **No**, protected by relational integrity in Resources. Deletion blocked if historical movements exist.       | `SaleItem` retains frozen drink description and price. Historical inventory valuation and accounting remain intact.                       |
| **5. Future Sellable Service** (e.g. Room Rental, Workshop) | **Scheduling / Facility Context**   | Assembles service fee; collects payment; confirms booking reservation.                    | `sourceType: CUSTOM_SERVICE`<br>`sourceId: serviceOrRoomId`                       |                 **Yes**, verifies room/amenity reservation availability.                  |                                **No**, invokes scheduling port to confirm booked window.                                 |                               **No**, reservation records remain archived for audit.                               | Commercial terms remain frozen in `SaleItem`. Future price tier changes do not affect historical rentals.                                 |
| **6. Future Sellable Product** (e.g. Branded Apparel, Gear) | **Resources / Retail Catalog**      | Point-of-sale checkout; collects tender; coordinates stock deduction.                     | `sourceType: INVENTORY_ITEM`<br>`sourceId: retailItemId`<br>`sourceCode: Barcode` |                        **Yes**, verifies stock and active status.                         |                               **No**, delegates stock mutation strictly to inventory port.                               |                            **No**, retail items with sales movements are soft-archived.                            | Price and tax rate frozen in `SaleItem` remain immutable forever.                                                                         |

---

### 3.6 `Money` (Canonical Value Object & Monetary Policy)

> **There is exactly one canonical monetary policy for Sales.**
>
> In accordance with [ADR-0108](../adr/0108-money-representation.md) and [ADR-0114](../adr/0114-canonical-monetary-policy-and-sale-totals.md), all financial calculations across commercial checkout, line items, discounts, persistence mappings, and API serializations must execute exclusively through this policy.

- **Mathematical Determinism**: Binary floating-point arithmetic (IEEE 754 `number`), `parseFloat()`, `Number()`, and `toFixed()` are strictly prohibited as calculation mechanisms.
- **`amount: number`**: Represents major currency units (e.g. `$49.99`). Must be a finite, non-negative number ($0 \le \text{amount} < \infty$).
- **Precision Hierarchy**:
  - **Calculation Precision**: 64-bit safe integer minor units (cents) with `Number.EPSILON` Half-Up rounding guard. Intermediate math operates in integer cents before dividing by 100.
  - **Persistence Precision**: PostgreSQL `@db.Decimal(12, 2)` (scale 2, precision 12), capacity up to $\$9,999,999,999.99$.
  - **Display Precision**: Fixed 2 decimal places with currency (e.g. `"$49.99 USD"`).
- **`currency: string`**: Normalized 3-letter uppercase ISO-4217 standard currency code (e.g. `"USD"`, `"CAD"`, `"EUR"`). Default: `"USD"`.
- **Arithmetic Rules (Guaranteed Cent-Integer Math)**:
  - `add(other: Money)`: Requires identical currencies; computes $\frac{\text{round}((a + \epsilon) \times 100) + \text{round}((b + \epsilon) \times 100)}{100}$. Returns new `Money`.
  - `subtract(other: Money)`: Requires identical currencies; computes $\frac{\text{round}((a + \epsilon) \times 100) - \text{round}((b + \epsilon) \times 100)}{100}$. Throws `InvalidMoneyException` if result $< 0$.
  - `multiply(factor: number)`: Factor must be finite and $\ge 0$; computes $\frac{\text{round}(\text{round}((a + \epsilon) \times 100) \times \text{factor} + \epsilon)}{100}$. Returns new `Money`.
  - `isZero()`: Returns `true` if $\text{amount} === 0$.
- **Comparison Methods**:
  - `equals(other: Money)`: `this.currency === other.currency && this.amount === other.amount`.
  - `greaterThan(other: Money)`: Guarded currency check; `this.amount > other.amount`.
  - `greaterThanOrEqual(other: Money)`: Guarded currency check; `this.amount >= other.amount`.
  - `lessThan(other: Money)`: Guarded currency check; `this.amount < other.amount`.
  - `lessThanOrEqual(other: Money)`: Guarded currency check; `this.amount <= other.amount`.
- **Zero & Negative Values**:
  - Zero is instantiated via `Money.zero(currency)`.
  - Negative values are **strictly forbidden** in domain aggregates and throw `InvalidMoneyException`. Refunds and reversals are modeled as discrete compensating transactions, never as negative price quantities.
- **Persistence Representation (PostgreSQL / Prisma)**:
  - Stored as `Decimal @db.Decimal(12, 2)` alongside `currency String @db.VarChar(3)`.
  - Supports balances up to `$9,999,999,999.99` with zero decimal drift.
  - Repositories map bidirectional: `Money.create(raw.amount.toNumber(), raw.currency)` and `new Prisma.Decimal(money.amount)`.
- **API Representation**:
  - Serialized as structured JSON object: `{ "amount": 49.99, "currency": "USD" }`.
- **Payment Gateway Conversion**:
  - External adapters convert deterministically:
    $$\text{amountInCents} = \text{round}((\text{money.amount} + \text{Number.EPSILON}) \times 100)$$
    $$\text{money} = \text{Money.create}\left(\frac{\text{cents}}{100}, \text{currency}\right)$$

---

### 3.7 `Discount` (Value Object)

#### Bounded-Context Ownership & Structure

`Discount` is a pure Value Object belonging exclusively to the **Sales & Payments** bounded context (`packages/core/src/sales/domain/value-objects/discount.vo.ts`). It has zero external dependencies on NestJS, Prisma, HTTP layers, or external pricing services.

```text
Discount
├── type: DiscountType (FIXED | PERCENTAGE)
├── value: number (Non-negative, normalized to 2 decimal places)
└── reason?: string | null (Optional audit justification)
```

#### Deterministic Invariants & Business Rules

1. **Type Taxonomy**: Supported types are `PERCENTAGE` and `FIXED` (with `FIXED_AMOUNT` maintained as a canonical alias for backward compatibility).
2. **Percentage Range**: If `type == PERCENTAGE`, $0 \le \text{value} \le 100$ (supporting up to 2 decimal places, e.g. `12.5%`). A 100% discount reduces the item net balance to `$0.00` (representing a fully promotional/complimentary item). Values $< 0$ or $> 100$ throw `InvalidDiscountException`.
3. **Fixed Amount Range**: If `type == FIXED` (or `FIXED_AMOUNT`), `value` must be $\ge 0.00$ in the operating sale currency. Negative values throw `InvalidDiscountException`.
4. **Scope (Phase 7.3 Item-Level Only)**:
   - **Supported**: Applied at the `SaleItem` level (`SaleItem.discount`).
   - **Deferred**: `Sale`-level order discounts are deferred until cross-line multi-item promotion algorithms are architected.
5. **Eligible Amount**:
   The discount calculation strictly evaluates against the **SaleItem gross subtotal**:
   $$\text{eligibleAmount} = \text{SaleItem.subtotal} = \text{unitPrice} \times \text{normalizedQuantity}$$
6. **Financial Constraint & Strict Rejection (Non-Exceeding Guard)**:
   $$\text{discountAmount} \le \text{eligibleAmount}$$
   For fixed discounts, if $\text{value} > \text{eligibleAmount.amount}$, the calculation **strictly fails** and throws `InvalidDiscountException`. The system does **not** silently reduce or clamp the discount to the eligible amount.
7. **Deterministic Minor-Unit Rounding (Commercial Half-Up)**:
   Calculations execute via `discount.calculate(eligibleAmount: Money): Money` strictly in integer cents (referencing ADR-0108). JavaScript floating-point arithmetic is never leaked into financial results:
   $$\text{subtotalCents} = \text{round}(\text{eligibleAmount.amount} \times 100)$$
   $$\text{discountCents} = \text{round}\left(\frac{\text{subtotalCents} \times \text{percentage}}{100}\right)$$
   $$\text{discountAmount} = \text{Money.create}(\text{discountCents} / 100, \text{eligibleAmount.currency})$$
8. **Historical Commercial Stability**:
   `SaleItem` captures the discount calculation at checkout. It is **never** dynamically recalculated from current catalog, membership, or promotional entities when querying historical records.
9. **Audit Justification**:
   An optional `reason?: string | null` captures cashier rationale (e.g. `"VIP Member Discount"`, `"Packaging Blemish"`). If supplied, it is stored trimmed.

---

### 3.8 Deterministic Sale Totals & Reconciliation Formulas

To guarantee that corporate balance sheets, customer receipts, and payment settlements reconcile to the exact cent without penny discrepancies, the domain enforces the following deterministic formulas:

```text
1.  Line Subtotal:
    lineSubtotal = round(quantity * unitPrice.amount * 100) / 100

2.  Line Discount (Phase 7.3 Item-Level Discount):
    eligibleAmount = lineSubtotal
    lineDiscount = discount ? discount.calculate(eligibleAmount) : Money.zero(currency)
    (Asserting discountAmount <= eligibleAmount; fixed discount exceeding subtotal throws InvalidDiscountException)

3.  Line Net Amount (Pre-Tax):
    lineNet = lineSubtotal - lineDiscount

4.  Line Tax:
    lineTax = round(lineNet * taxRate * 100) / 100

5.  Line Total:
    lineTotal = lineNet + lineTax

6.  Sale Gross Subtotal:
    saleSubtotal = Sum(lineSubtotal[i])

7.  Sale Total Line Discounts:
    saleDiscountTotal = Sum(lineDiscount[i])

8.  Sale Net (Pre-Tax, Pre-Order Discount):
    saleNet = saleSubtotal - saleDiscountTotal

9.  Order-Level Discount:
    (Deferred / Out-of-Scope for Phase 7.3; orderDiscount = null)

10. Total Discounts:
    totalDiscounts = saleDiscountTotal

11. Total Sale Tax:
    saleTaxTotal = Sum(lineTax[i])

12. Sale Total (Final Net Payable):
    saleTotal = saleSubtotal - saleDiscountTotal + saleTaxTotal
    (Guaranteed >= 0.00 since each lineDiscount <= lineSubtotal)

13. Balance Remaining:
    balanceRemaining = max(0, saleTotal - Sum(SettledPayments.amount))
```

---

### 3.9 Financial Immutability Milestones & Matrix

To guarantee mathematical and audit integrity, financial records undergo progressive immutability across four distinct lifecycle milestones:

| Milestone                 | Trigger Event            | Permanently Immutable Fields                                                                                                                                                                | Permitted Mutations                                                                                    |
| :------------------------ | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------- |
| **1. Sale Creation**      | Enters `DRAFT`           | `id`, `tenantId`, `createdAt`, `initialCashierId`.                                                                                                                                          | `items`, `quantities`, `itemDiscounts`, `orderDiscount`, `notes`, `clientId`.                          |
| **2. Sale Finalization**  | Enters `PENDING_PAYMENT` | **All commercial terms locked**: `items` array, `description`, `skuOrCode`, `unitPrice`, `taxRate`, `itemDiscount`, `orderDiscount`, `subtotal`, `taxTotal`, `total`. Cart editing blocked. | `status`, `payments` relation, `completedAt`, `cancelledAt`, `cancellationReason`.                     |
| **3. Payment Completion** | Enters `SETTLED`         | **Entire payment record frozen**: `id`, `saleId`, `tenantId`, `amount`, `currency`, `method`, `settledAt`, `externalTransactionId`. SQL `UPDATE` and `DELETE` prohibited.                   | **None**. Settled records are write-once. Reversals require separate compensating refund records.      |
| **4. Receipt Issuance**   | Emitted upon `PAID`      | `id`, `receiptNumber`, `saleId`, `issuedAt`, `totalAmount`, `tenderBreakdownSnapshot`, `customerSnapshot`.                                                                                  | **None**. Permanent historical legal document. Reprints render existing document with duplicate stamp. |

---

### 3.10 Currency Strategy

1. **Initial Scope (Mono-Currency per Tenant)**:
   - Each tenant organization configures a single functional operating currency (default: `"USD"`).
   - Every `Sale` within that tenant must use the tenant's configured currency.
   - Mixed currencies within a single checkout session are strictly prohibited.
2. **Extension Path (Multi-Branch / Multi-Country Expansion)**:
   - Currency is modeled explicitly as a first-class property (`currency: string`) on every entity and Value Object.
   - When international facilities are introduced, currency per branch (`branchId`) will be activated without schema modifications or domain model breakage.

---

## 4. Aggregate Analysis & Boundaries

```mermaid
classDiagram
    class SaleAggregate {
        <<Aggregate Boundary>>
        +Sale (Root)
        +SaleItem[] (Entities)
        +Discount (VO)
        +Money (VO)
    }

    class PaymentAggregate {
        <<Aggregate Boundary>>
        +Payment (Root)
        +Money (VO)
        +PaymentMethod (Enum)
    }

    class ReceiptEntity {
        <<Document Entity>>
        +Receipt (Root)
        +Money (VO)
    }

    SaleAggregate "1" ..> "0..*" PaymentAggregate : settled by scalar saleId
    SaleAggregate "1" ..> "0..1" ReceiptEntity : evidenced by scalar saleId
```

| Question                                 | `Sale` Aggregate                                                                                   | `Payment` Aggregate                                                                              | `Receipt` Document Entity                                             |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **1. Aggregate Root?**                   | `Sale`                                                                                             | `Payment`                                                                                        | `Receipt`                                                             |
| **2. Invariants Protected?**             | Total reconciliation, item consistency, non-negative amounts, commercial lock after draft.         | Payment amount non-negativity, valid tender method, terminal status protection.                  | Monotonic receipt sequence, immutability, customer voucher integrity. |
| **3. What changes atomically?**          | `Sale` and all its `SaleItem`s commit together in a single database transaction.                   | Individual payment state transitions (`INITIATED` $\rightarrow$ `SETTLED`) commit independently. | Write-once creation. Zero post-creation mutations.                    |
| **4. What changes independently?**       | Adding/removing items does not touch payments.                                                     | Gateway authorization retries occur without holding locks on the `Sale`.                         | Issued independently upon payment milestone.                          |
| **5. Never mutated after finalization?** | Line items, unit prices, discounts, tax rates, net total cannot be modified after leaving `DRAFT`. | Settled payment amounts and tender methods can never be updated.                                 | 100% frozen forever.                                                  |
| **6. Owning Bounded Context?**           | Sales & Payments                                                                                   | Sales & Payments                                                                                 | Sales & Payments                                                      |

---

## 5. Domain State Machines

### 5.1 `Sale` State Machine & Lifecycle Definitions

The `Sale` lifecycle governs the **commercial contract and fulfillment status** of an order. It is completely decoupled from individual tender attempts.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : create()

    DRAFT --> DRAFT : addItem() / removeItem() / updateItemQuantity() / applyDiscount()
    DRAFT --> CANCELLED : cancel(reason)
    DRAFT --> PENDING_PAYMENT : finalize() [items.length >= 1]

    PENDING_PAYMENT --> PARTIALLY_PAID : markPartiallyPaid()
    PENDING_PAYMENT --> PAID : markPaid()
    PENDING_PAYMENT --> CANCELLED : cancel(reason)

    PARTIALLY_PAID --> PAID : markPaid()
    PARTIALLY_PAID --> CANCELLED : cancel(reason)

    PAID --> COMPLETED : markCompleted()
    PAID --> REFUNDED : markRefunded(reason?)

    COMPLETED --> REFUNDED : markRefunded(reason?)

    CANCELLED --> [*]
    REFUNDED --> [*]
```

#### Sale Lifecycle States Defined (7 Canonical States)

Phase 7.1 strictly implements 7 canonical lifecycle states via `SaleStatus`:

- **`DRAFT`**: Active checkout session. Cashiers may add, remove, or modify items, adjust quantities, and apply discretionary line/order discounts. No customer payment obligation exists.
- **`PENDING_PAYMENT` (Finalized / Unpaid)**: The cashier has finalized the order via `finalize()`. All commercial line items, quantities, prices, discounts, and order totals are **permanently frozen**. The customer is presented with the final net payable total.
- **`PARTIALLY_PAID`**: At least one payment tender has settled ($> 0$), but outstanding balance remains. Fulfillment of physical items or gym memberships is withheld pending full settlement.
- **`PAID`**: All outstanding commercial balance is fully settled. Legal customer receipt voucher issuance is unlocked.
- **`COMPLETED`**: Commercial agreement is settled AND all physical goods have been decremented and service memberships activated via `markCompleted()`. Sets `completedAt`.
- **`CANCELLED`**: Commercial transaction voided or abandoned via `cancel(reason)`. Allowed only from `DRAFT`, `PENDING_PAYMENT`, or `PARTIALLY_PAID`. Sets `cancelledAt` and `cancellationReason`. Strictly terminal.
- **`REFUNDED`**: Full compensating reversal executed via `markRefunded(reason?)`. Allowed from `PAID` or `COMPLETED`. Sets `refundedAt`. Strictly terminal.

#### Formal Sale State Transition Matrix

The table below exhaustively defines every permitted and forbidden state transition for `Sale`:

| Source State      | Target State      | Trigger Method              | Allowed? | Invariants & Preconditions                                                          | Rejection Error Code          |
| :---------------- | :---------------- | :-------------------------- | :------: | :---------------------------------------------------------------------------------- | :---------------------------- |
| `[*]`             | `DRAFT`           | `Sale.create()`             | **YES**  | Valid `SourceReference`, valid ISO currency, optional `clientId` and `tenantId`.    | `INVALID_SALE_STATE`          |
| `DRAFT`           | `PENDING_PAYMENT` | `sale.finalize()`           | **YES**  | Requires $\ge 1$ line item (`items.length > 0`). Commercial terms permanently lock. | `EMPTY_SALE`                  |
| `DRAFT`           | `CANCELLED`       | `sale.cancel(reason)`       | **YES**  | Requires non-empty string `reason`.                                                 | `INVALID_CANCELLATION_REASON` |
| `DRAFT`           | `PAID`            | `sale.markPaid()`           |  **NO**  | Order must be finalized prior to payment settlement.                                | `INVALID_SALE_TRANSITION`     |
| `DRAFT`           | `COMPLETED`       | `sale.markCompleted()`      |  **NO**  | Must be finalized and paid first.                                                   | `INVALID_SALE_TRANSITION`     |
| `PENDING_PAYMENT` | `PARTIALLY_PAID`  | `sale.markPartiallyPaid()`  | **YES**  | Triggered upon partial payment tender settlement.                                   | `INVALID_SALE_TRANSITION`     |
| `PENDING_PAYMENT` | `PAID`            | `sale.markPaid()`           | **YES**  | Triggered upon full payment tender settlement.                                      | `INVALID_SALE_TRANSITION`     |
| `PENDING_PAYMENT` | `CANCELLED`       | `sale.cancel(reason)`       | **YES**  | Requires non-empty `reason`. Voids order before payment capture.                    | `INVALID_CANCELLATION_REASON` |
| `PENDING_PAYMENT` | `DRAFT`           | —                           |  **NO**  | Commercial terms cannot be un-finalized.                                            | `INVALID_SALE_TRANSITION`     |
| `PARTIALLY_PAID`  | `PAID`            | `sale.markPaid()`           | **YES**  | Triggered when remaining balance is settled.                                        | `INVALID_SALE_TRANSITION`     |
| `PARTIALLY_PAID`  | `CANCELLED`       | `sale.cancel(reason)`       | **YES**  | Requires non-empty `reason`. Application layer coordinates tender refund.           | `INVALID_CANCELLATION_REASON` |
| `PARTIALLY_PAID`  | `DRAFT`           | —                           |  **NO**  | Cannot revert partially paid commercial order.                                      | `INVALID_SALE_TRANSITION`     |
| `PAID`            | `COMPLETED`       | `sale.markCompleted()`      | **YES**  | Outbound fulfillment ports confirm stock deduction and membership activation.       | `INVALID_SALE_TRANSITION`     |
| `PAID`            | `REFUNDED`        | `sale.markRefunded(reason)` | **YES**  | Full compensating refund processed. Sets `refundedAt`.                              | `INVALID_REFUND_REASON`       |
| `PAID`            | `CANCELLED`       | `sale.cancel(reason)`       |  **NO**  | Paid sales must be refunded, not cancelled.                                         | `INVALID_SALE_TRANSITION`     |
| `COMPLETED`       | `REFUNDED`        | `sale.markRefunded(reason)` | **YES**  | Compensating reversal after order completion. Sets `refundedAt`.                    | `INVALID_REFUND_REASON`       |
| `COMPLETED`       | `*` (Other)       | Any                         |  **NO**  | Terminal state except for compensating refund.                                      | `INVALID_SALE_TRANSITION`     |
| `CANCELLED`       | `*` (Any)         | Any                         |  **NO**  | Strictly terminal. Zero transitions permitted.                                      | `INVALID_SALE_TRANSITION`     |
| `REFUNDED`        | `*` (Any)         | Any                         |  **NO**  | Strictly terminal. Zero transitions permitted.                                      | `INVALID_SALE_TRANSITION`     |

---

#### Separation of Concerns: Sale Lifecycle vs. Payment Lifecycle

> [!IMPORTANT]
> **Never Conflate Sale Lifecycle with Payment Lifecycle**:
>
> - **The `Sale` Lifecycle** governs commercial agreements, cart totals, and item fulfillment. There is **1 Sale** per checkout session.
> - **The `Payment` Lifecycle** governs individual tender attempts (cash, card, QR). There can be **0, 1, or many Payments** per Sale.
> - A `Payment` failure does **not** cancel a `Sale`. The customer can simply retry with another card or cash.
> - A `Sale` is only `PAID` when the algebraic sum of all settled payments satisfies the order total ($\sum \text{SettledPayments} \ge \text{Sale.total}$).

---

### 5.2 `Payment` State Machine & Transition Rules

The `Payment` state machine governs an autonomous monetary tender transaction through an exact 4-state lifecycle (`PENDING`, `SETTLED`, `FAILED`, `CANCELLED`):

```mermaid
stateDiagram-v2
    [*] --> PENDING : createPending()
    [*] --> SETTLED : createSettled() (instant cash)

    PENDING --> SETTLED : settle()
    PENDING --> FAILED : fail()
    PENDING --> CANCELLED : cancel()

    FAILED --> [*]
    CANCELLED --> [*]
    SETTLED --> [*]
```

#### Formal State Transition Matrix

The table below exhaustively defines every permitted and forbidden state transition for `Payment`:

| From        | To          | Allowed? | Reason                                                                          | Preconditions                                                                                    |
| :---------- | :---------- | :------: | :------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------- |
| `[*]`       | `SETTLED`   | **YES**  | Direct cash payment or instant counter tender.                                  | Amount $> 0$, valid `tenantId`, `saleId`, and `PaymentMethod.CASH`. `paidAt` set immediately.    |
| `[*]`       | `PENDING`   | **YES**  | Asynchronous tender initiated at checkout (e.g. QR code awaiting scan).         | Amount $> 0$, valid `tenantId`, `saleId`, and `PaymentMethod.QR`. `paidAt = null`.               |
| `PENDING`   | `SETTLED`   | **YES**  | Funds received and verified via provider rail or confirmation.                  | Full tender amount verified; immutable `paidAt` timestamp set. Permanent immutability commences. |
| `PENDING`   | `FAILED`    | **YES**  | Provider timeout, session expiration, insufficient funds, or customer decline.  | Provider error code and descriptive failure reason recorded. Terminal state.                     |
| `PENDING`   | `CANCELLED` | **YES**  | Cashier voids pending tender before settlement or customer switches method.     | No funds collected; executed strictly prior to settlement. Terminal state.                       |
| `SETTLED`   | `*` (Any)   |  **NO**  | **Settled payments are permanently immutable**. Zero state mutations permitted. | Financial records cannot be altered. Reversals require autonomous compensating refund records.   |
| `FAILED`    | `*` (Any)   |  **NO**  | Terminal state. Retry requires creating a new `Payment` aggregate.              | Failed attempts remain preserved for audit logging.                                              |
| `CANCELLED` | `*` (Any)   |  **NO**  | Terminal state. Tender was aborted without financial transfer.                  | Preserved for cashier audit history.                                                             |

---

### 5.3 `Receipt` State Machine

```mermaid
stateDiagram-v2
    [*] --> ISSUED : issueReceipt()
    ISSUED --> REPRINTED : recordReprint()
    REPRINTED --> REPRINTED : recordReprint()
```

#### Detailed Transition Table

| Source State           | Target State | Allowed Actor | Business Trigger / Reason                   | Invariant / Guard Rule                                           |
| :--------------------- | :----------- | :------------ | :------------------------------------------ | :--------------------------------------------------------------- |
| `[*] `                 | `ISSUED`     | System        | Sale reaches `PAID` (or qualifying deposit) | Monotonic receipt sequence assigned. Data permanently frozen.    |
| `ISSUED` / `REPRINTED` | `REPRINTED`  | Cashier       | Customer requests duplicate printout        | Receipt data unchanged. Increments reprint counter in audit log. |

---

### 5.4 Domain Exception Hierarchy & Error Behavior

To ensure deterministic, machine-readable error handling without leaking framework exceptions into the core domain, Phase 7.1 establishes a strongly typed exception hierarchy rooted in `SaleDomainException`:

```mermaid
classDiagram
    class Error {
        <<JavaScript Built-in>>
    }
    class SaleDomainException {
        +string code
        +string message
    }
    class EmptySaleException {
        +code: "EMPTY_SALE"
    }
    class SaleAlreadyFinalizedException {
        +code: "SALE_ALREADY_FINALIZED"
    }
    class InvalidSaleStateException {
        +code: "INVALID_SALE_STATE" | "INVALID_CANCELLATION_REASON" | "INVALID_REFUND_REASON"
    }
    class InvalidSaleTransitionException {
        +code: "INVALID_SALE_TRANSITION"
        +string currentState
        +string targetState
        +string? reason
    }
    class InvalidSaleItemException {
        +code: "INVALID_SALE_ITEM"
    }
    class InvalidDiscountException {
        +code: "INVALID_DISCOUNT"
    }

    Error <|-- SaleDomainException
    SaleDomainException <|-- EmptySaleException
    SaleDomainException <|-- SaleAlreadyFinalizedException
    SaleDomainException <|-- InvalidSaleStateException
    InvalidSaleStateException <|-- InvalidSaleTransitionException
    SaleDomainException <|-- InvalidSaleItemException
    SaleDomainException <|-- InvalidDiscountException
```

#### Exception Taxonomy & Error Codes

| Exception Class                      | Machine-Readable `code`         | Trigger Scenario / Invariant Violated                                                                 |
| :----------------------------------- | :------------------------------ | :---------------------------------------------------------------------------------------------------- |
| **`SaleDomainException`**            | `'SALE_DOMAIN_ERROR'`           | Base class for all domain errors within Sales & Payments. Never thrown raw in production.             |
| **`EmptySaleException`**             | `'EMPTY_SALE'`                  | Attempting to finalize a `Sale` with zero items (`items.length === 0`).                               |
| **`SaleAlreadyFinalizedException`**  | `'SALE_ALREADY_FINALIZED'`      | Attempting to add/remove/edit items or apply discounts on a Sale departing `DRAFT` status.            |
| **`InvalidSaleTransitionException`** | `'INVALID_SALE_TRANSITION'`     | Attempting an illegal lifecycle transition (e.g. `DRAFT` $\rightarrow$ `PAID`, `CANCELLED` mutation). |
| **`InvalidSaleStateException`**      | `'INVALID_SALE_STATE'`          | Structural state violations, invalid currencies, negative amounts, or corrupt reconstitution totals.  |
| **`InvalidSaleStateException`**      | `'INVALID_CANCELLATION_REASON'` | Attempting to cancel a Sale with an empty or whitespace cancellation reason string.                   |
| **`InvalidSaleStateException`**      | `'INVALID_REFUND_REASON'`       | Providing an invalid/whitespace refund reason during refund transition.                               |
| **`InvalidSaleItemException`**       | `'INVALID_SALE_ITEM'`           | Non-positive quantity, empty description, or invalid unit price in `SaleItem`.                        |
| **`InvalidDiscountException`**       | `'INVALID_DISCOUNT'`            | Percentage $> 100\%$, negative value, empty justification reason, or invalid override credentials.    |

#### Failure Atomicity Guarantee

The `Sale` aggregate guarantees **strict failure atomicity** across all operations:

- When an invariant assertion or transition rule fails, the domain exception is thrown **immediately** before any aggregate state changes occur.
- No partial mutations are committed to `_items`, `_status`, or calculated totals.
- No uncommitted domain events are staged to `_uncommittedEvents`.
- The aggregate root remains in its clean, valid pre-call state.

---

## 6. Authorization & Access Control Architecture

In accordance with Phase 1 IAM standards and ADR-0111, Sales & Payments enforces fine-grained role-based permissions using canonical dot-notation:

### 6.1 Permission Catalog & Action Classification

| Permission Code       | Classification            | Operational Capabilities                                                                                           | Minimum Role                                           |
| :-------------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **`sales.read`**      | **Read-Only**             | Query and view sales orders, cart items, order status, customer purchase histories.                                | `Receptionist`, `Trainer`, `Kitchen Staff`, `Owner`    |
| **`sales.create`**    | **Transactional**         | Initiate checkout sessions, add/remove items to draft orders, apply standard promotional discounts within limits.  | `Receptionist`, `Kitchen Staff`, `Owner`               |
| **`sales.manage`**    | **Financially Sensitive** | Apply discretionary discounts exceeding cashier thresholds (e.g. $> 15\%$), override prices, modify sale metadata. | `Manager`, `Owner`                                     |
| **`sales.cancel`**    | **Destructive**           | Cancel or void a draft or finalized sale prior to fulfillment; record mandatory cancellation reason.               | `Receptionist` (drafts), `Manager`/`Owner` (finalized) |
| **`payments.read`**   | **Read-Only**             | View payment transaction histories, tender methods, settlement timestamps, and payment statuses.                   | `Receptionist`, `Owner`                                |
| **`payments.create`** | **Transactional**         | Record cash collection, trigger card terminal pre-authorization, capture electronic tender.                        | `Receptionist`, `Kitchen Staff` (POS), `Owner`         |
| **`payments.manage`** | **Financially Sensitive** | Authorize compensating refunds, settle manual payment exceptions, process chargeback adjustments.                  | `Manager`, `Owner`                                     |
| **`receipts.read`**   | **Read-Only**             | View and download customer receipt vouchers for settled transactions.                                              | `Receptionist`, `Trainer`, `Client` (own), `Owner`     |
| **`receipts.manage`** | **Financially Sensitive** | Authorize receipt reprints, issue duplicate vouchers, generate fiscal credit notes.                                | `Receptionist` (standard reprint), `Owner`             |

#### Backward Compatibility

- `billing.read` implies `sales.read`, `payments.read`, and `receipts.read`.
- `billing.write` implies `sales.create` and `payments.create`.

### 6.2 Multi-Tenant Organization Isolation Guards

To guarantee absolute isolation between organizations:

1. **Cross-Tenant Sale Access Guard**: Repository queries enforce `where: { id, tenantId }`. Domain handlers assert `sale.tenantId === context.tenantId`.
2. **Cross-Tenant Payment Access Guard**: Settle and capture commands verify `payment.tenantId === context.tenantId` AND `sale.tenantId === payment.tenantId`.
3. **Cross-Tenant Receipt Access Guard**: Receipts are partitioned by `tenantId`. Sequential receipt numbers (`REC-2026-XXXX`) advance monotonically within each tenant's namespace.
4. **Cross-Tenant SourceReference Guard**: Capability query ports resolving catalog items (`INVENTORY_ITEM`, `MEMBERSHIP_PLAN`, `TREATMENT_SESSION`) assert `sourceItem.tenantId === context.tenantId`. Cross-tenant checkout attempts are rejected with `TenantMismatchException`.

### 6.3 Zero Client Trust & Actor Propagation

- Transport controllers **never accept** `actorId`, `userId`, or `tenantId` in request bodies.
- Actor identities are extracted from verified JWT tokens (`@CurrentUser()`) and injected directly into CQRS commands.

---

## 7. Audit Boundaries & Sensitive Information Protection

Sales & Payments strictly segregates events across three logging tiers to prevent audit bloat while maintaining immutable financial accountability:

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

### 7.1 Evaluated Events & Audit Classification

- **Draft Cart Churn (`SaleItemAddedToDraft`, `SaleItemQuantityChangedInDraft`)**: Application log only. Pre-finalization cart updates carry zero financial commitment. Logging draft churn pollutes the permanent audit ledger.
- **Order Finalization (`SaleFinalized`)**: **Business Audit**. Permanently locks commercial items, prices, discounts, and order totals.
- **Settlement (`PaymentSettled`)**: **Business Audit**. Records funds captured, tender type, and cashier/terminal attribution.
- **Exceptions (`SaleCancelled`, `PaymentRefunded`)**: **Business Audit**. Records mandatory justification and authorizing manager ID.
- **Failures (`PaymentFailed`)**: **Security & Operational Log**. Preserves gateway decline reason code for fraud monitoring.

### 7.2 Sensitive Payment Information Protection (PCI-DSS)

1. **Never Logged, Never Stored**:
   - Primary Account Numbers (PAN / full 16 digits).
   - Sensitive Authentication Data (SAD): CVV/CVC, expiration dates, terminal PINs.
   - Provider secrets: Gateway API keys, webhook signing secrets.
2. **Permitted Cardholder Data**: Last 4 digits (`**** 4242`), card brand (`VISA`), and gateway transaction reference ID.
3. **Transport Masking**: All logging interceptors sanitize request and audit payloads with regex pattern matching.

---

## 8. Non-Negotiable Domain Invariants & Cross-Domain Contract

The following invariants are fundamental business laws of Kinergy. Any proposed code change that violates these rules must be rejected by architecture and automated domain tests:

### Invariant 1: References Over Ownership

> **Domain Law**: The Sales & Payments bounded context must **never** own, mutate, or duplicate domain models from Client, Resources, Gym, Kinesiology, or Scheduling.  
> It communicates strictly through unconstrained typed scalar references (`SourceReference`, `clientId`, `therapistId`, `cashierId`) and application capability ports.

### Invariant 2: Permanent Price Snapshotting

> **Domain Law**: A `SaleItem` must **permanently snapshot** commercial attributes (`description`, `skuOrCode`, `unitPrice`, `taxRate`) at the instant of creation.  
> Runtime database joins to source catalog tables for historical receipts or past sales are strictly prohibited.

### Invariant 3: Single-Currency Sales

> **Domain Law**: A single `Sale` must never contain mixed currencies.  
> Every line item, discount, tax, subtotal, and payment associated with a `Sale` must share the identical ISO-4217 currency code.

### Invariant 4: Non-Negative Financial Totals

> **Domain Law**: The net total payable of a `Sale` and the amount of a `Payment` cannot be negative.  
> Discounts exceeding the subtotal are capped such that $\text{total} \ge 0$. Reversals and refunds are modeled as distinct negative refund payments or explicit credit notes, never as negative line items on original sales.

### Invariant 5: Commercial Lock After Draft

> **Domain Law**: Once a `Sale` transitions out of `DRAFT` (into `PENDING_PAYMENT`, `PAID`, or `COMPLETED`), its items, quantities, discounts, and prices are **immutable**.  
> Adding, removing, or adjusting line items on a confirmed or paid sale is physically prevented by the domain aggregate.

### Invariant 6: Append-Only Financial Sub-Ledger

> **Domain Law**: Under no circumstances may a `Payment` record or `Receipt` record be deleted (`DELETE`) or retroactively edited (`UPDATE`) in the database.  
> All financial adjustments must be achieved through append-only compensating records (`VOID`, `REFUND`, `CREDIT_NOTE`).

### Invariant 7: Strict Organization Isolation

> **Domain Law**: Every commercial entity (`Sale`, `SaleItem`, `Payment`, `Receipt`) is strictly scoped by `tenantId`.  
> Cross-tenant queries, references, or mutations are impossible at both the domain model and persistence repository layers.

### Invariant 8: Receipt Legal Immutability

> **Domain Law**: A `Receipt` is a legal voucher representing an already-recorded financial transaction.  
> Modifying receipt contents after generation is prohibited. Duplicate prints must be explicitly stamped as reprints without altering stored transaction records.

### Invariant 9: Physical Stock Authority in Resources

> **Domain Law**: Sales must never write directly to `inventory_items` or decrement `quantityOnHand`.  
> All physical stock deductions must route through `InventoryStockDecrementPort`, ensuring Resources enforces its own non-negative stock and optimistic concurrency rules.

### Invariant 10: Medico-Legal Privacy Isolation

> **Domain Law**: Sales records billing of clinical therapy encounters via scalar reference only; it must **never** receive, store, or display SOAP clinical notes or medical diagnoses from Kinesiology.

### Invariant 11: Gym Membership Validity Independence

> **Domain Law**: Gym Management is the sole authority for membership dates, grace periods, and access eligibility.  
> Sales captures subscription fees and calls `GymMembershipActivationPort`; it never computes membership validity dates or turnstile permissions.

### Invariant 12: Anonymous Retail Purchase Support

> **Domain Law**: `clientId` must remain optional (`clientId?: string`) on `Sale` to support walk-in front-desk retail purchases without polluting the master CRM database.

---

## 9. Business Traceability Matrix

This matrix establishes the complete traceable chain from Business Requirements down to Domain Tests for Phase 7.1:

```text
Business Requirement
        ↓
Business Rule
        ↓
Sale Domain Rule
        ↓
Sale Aggregate Behavior
        ↓
Domain Test
```

| Business Requirement             | Business Rule (Ref)    | Sale Domain Rule                                                                                                 | Sale Aggregate Behavior                                                                            | Domain Test Suite (`packages/core/src/sales/domain/__tests__/`)                                                           |
| :------------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **Unified Point of Sale**        | `SALE-01`, `SALE-05`   | Accepts heterogeneous items via unconstrained `SourceReference` without upstream coupling.                       | `Sale.create()`, `Sale.addItem()`, `Sale.finalize()`                                               | [`sale.aggregate.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)                       |
| **Price & Catalog Decoupling**   | `ITEM-04`, `ITEM-09`   | `SaleItem` permanently freezes description, SKU, unit price, and discount at checkout.                           | `SaleItem.create()`, `SaleItem.reconstitute()`                                                     | [`sale-item.entity.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-item.entity.spec.ts)                   |
| **Exact Cent Reconciliation**    | `MNY-01`, `SALE-07`    | All financial math operates on integer cents with half-up rounding and $\ge 0.00$ guard.                         | `recalculateTotals()`, `Money.add()`, `Money.subtract()`                                           | [`sale.aggregate.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)                       |
| **Commercial Immutability**      | `SALE-08`, `ITEM-09`   | Once departing `DRAFT`, commercial line items and discounts cannot be added, edited, or cut.                     | `assertDraftState()` throws `SaleAlreadyFinalizedException` (`SALE_ALREADY_FINALIZED`)             | [`sale-hardening.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)                       |
| **7-State Commercial Lifecycle** | `SALE-04`, `SALE-09`   | 7 canonical states (`DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED`). | `finalize()`, `markPartiallyPaid()`, `markPaid()`, `markCompleted()`, `markRefunded()`, `cancel()` | [`sale-lifecycle.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-lifecycle.spec.ts)                       |
| **Deterministic Domain Errors**  | `SALE-05`, `SALE-08`   | All invariant violations throw typed exceptions with machine-readable `code` properties.                         | `EmptySaleException`, `InvalidSaleTransitionException`, `InvalidSaleStateException`                | [`sale-deterministic-errors.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-deterministic-errors.spec.ts) |
| **Failure Atomicity**            | `SALE-01` to `SALE-09` | Invalid operations abort prior to state mutation; zero uncommitted events staged on error.                       | Clean pre-call state preserved on rejected operations                                              | [`sale-deterministic-errors.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-deterministic-errors.spec.ts) |
| **Defensive Encapsulation**      | `ITEM-01`, `SALE-08`   | Collections exposed as frozen views; items immutable via `withQuantity()` and `withDiscount()`.                  | `Object.freeze([...items])`, `Object.freeze(item)`                                                 | [`sale-hardening.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale-hardening.spec.ts)                       |
| **Walk-in Customer Support**     | `SALE-03`              | `clientId` remains optional (`clientId?: string`) to support guest retail transactions.                          | Optional scalar string handling in `Sale.create()`                                                 | [`sale.aggregate.spec.ts`](file:///packages/core/src/sales/domain/__tests__/sale.aggregate.spec.ts)                       |

---

## 10. Scope & Delivery Guarantees for Phase 7.1

### 10.1 What Phase 7.1 Guarantees (Delivered in Code)

1. **Pure TypeScript Domain Core**: `packages/core/src/sales/domain/` with zero framework dependencies (`@nestjs/*`, `@prisma/*`).
2. **Sale Aggregate Root (`Sale`)**: Full transactional ownership of order state, line items, versioning, progressive immutability, and domain events.
3. **Internal Child Entity (`SaleItem`)**: Child entity lifetime bound to `Sale`, snapshotting description, SKU, unit price, quantity, discount, subtotal, and total.
4. **Value Objects**: `SaleId`, `SaleItemId`, `SourceReference`, `Discount`, `Money` (cent-guarded arithmetic).
5. **State Machine**: 7 canonical states with strict transition validation and timestamp attribution (`completedAt`, `cancelledAt`, `refundedAt`).
6. **Deterministic Financial Math**: 13 exact reconciliation formulas operating in integer minor units.
7. **Strongly Typed Exception Hierarchy**: Base `SaleDomainException` and 6 specialized exception classes exposing machine-readable `code` properties.
8. **Comprehensive Behavioral Test Suite**: 8 co-located test suites validating all domain rules and invariants with 100% pass rate.

### 10.2 Explicit Non-Goals for Phase 7.1 (Deferred to Future Milestones)

1. **Payment Aggregate Implementation**: Concrete `Payment` entity, payment methods, transaction settlement, and gateway drivers remain conceptual until Phase 7.2.
2. **Receipt Generation & Fiscal Printing**: Legal receipt vouchers, sequential counters, and hardware thermal printing drivers remain conceptual until Phase 7.3.
3. **Application & Infrastructure Layers**: NestJS modules, controllers, CQRS command handlers, Prisma repositories, and database migrations are deferred to Phase 7.x application milestones.
4. **Double-Entry General Ledger**: General ledger accounting, chart of accounts, and corporate fiscal tax filings belong to a future accounting context.
