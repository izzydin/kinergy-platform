# Phase 7: Sales & Payments — Conceptual Domain Model Specification

- **Document**: `docs/domain/sales-payments.md`
- **Status**: Authoritative Domain Source of Truth
- **Milestone**: Phase 7.0 — Domain Modeling & Invariant Specification
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
│  PaymentMethod    An enumeration of accepted tender mechanisms (CASH, CARD,  │
│                   TRANSFER, WALLET, ACCOUNT_CREDIT).                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Domain Entity & Aggregate Specifications

### 3.1 `Sale` (Aggregate Root)

#### Purpose

`Sale` is the aggregate root governing the commercial agreement between the wellness facility and a customer. It orchestrates the addition, modification, and removal of line items, applies discounts, computes taxable amounts, tracks the remaining balance, and enforces commercial lifecycle state transitions.

#### Identity & Multi-Tenancy

- **`id: SaleId`**: Canonical UUID uniquely identifying the sale within the platform.
- **`tenantId: TenantId`**: Strict organization boundary. A sale belongs to exactly one tenant; cross-tenant operations are strictly forbidden.
- **`branchId?: BranchId`**: Optional facility/branch identifier for multi-location operations.
- **`clientId?: ClientId`**: Optional reference to a registered Client (Phase 2). If omitted, the sale represents an anonymous front-desk walk-in customer.
- **`cashierId: UserId`**: Reference to the authenticated IAM user who initiated and managed the sale.

#### Aggregate Root Responsibility

`Sale` is the **sole gateway** for mutating order state. External consumers cannot manipulate `SaleItem` entities directly; all line item additions, quantity adjustments, and discount evaluations must execute through methods on `Sale` (`addItem()`, `updateItemQuantity()`, `removeItem()`, `applyOrderDiscount()`).

#### Invariants Enforced by `Sale`

1. **Empty Order Prohibition**: A sale cannot transition out of `DRAFT` to `PENDING_PAYMENT` or `PAID` with zero items.
2. **Monetary Non-Negativity**: The net total payable amount ($\text{total}$) must be $\ge 0$. Under no circumstances may discounts or promotions produce a negative sale total.
3. **Currency Homogeneity**: Every `SaleItem`, order discount, and tax calculation within a `Sale` must share the identical ISO-4217 currency.
4. **Commercial Locking**: Once a `Sale` transitions into `PAID`, `PARTIALLY_PAID`, `COMPLETED`, `CANCELLED`, or `REFUNDED`, line items cannot be added, modified, or removed.
5. **Reconciliation Invariant**:
   $$\text{Subtotal} = \sum (\text{SaleItem.lineSubtotal})$$
   $$\text{TotalDiscount} = \sum (\text{SaleItem.discountAmount}) + \text{OrderDiscount.amount}$$
   $$\text{TaxTotal} = \sum (\text{SaleItem.taxAmount})$$
   $$\text{Total} = \max(0, \text{Subtotal} - \text{TotalDiscount} + \text{TaxTotal})$$
   $$\text{BalanceRemaining} = \max(0, \text{Total} - \text{TotalSettledPayments})$$

#### Field Mutability Classification

- **Permanently Immutable (set at creation)**: `id`, `tenantId`, `createdAt`.
- **Conditionally Mutable (only while `status == DRAFT`)**: `clientId`, `items`, `orderDiscount`, `notes`.
- **Lifecycle Mutable (via explicit domain transitions)**: `status`, `completedAt`, `cancelledAt`, `cancellationReason`, `version`, `updatedAt`.

---

### 3.2 `SaleItem` (Internal Entity)

#### Ownership & Lifecycle

`SaleItem` is an **internal entity** exclusively owned by the `Sale` aggregate. It has no independent global existence, no standalone repository, and cannot be accessed, queried, or updated outside of its parent `Sale`.

#### Quantities & Pricing

- **`quantity: number`**: Finite positive decimal or integer ($> 0$). Supports fractional quantities for weighted consumables (e.g. bulk nutrition powders, grams) or integers for discrete items (bottles, memberships).
- **`unitPrice: Money`**: The gross unit price agreed upon at checkout.
- **`itemDiscount?: Discount`**: Optional line-item specific discount.
- **`taxRate?: TaxRate`**: Applicable tax rate applied to this specific item.
- **`lineSubtotal: Money`**: $\text{quantity} \times \text{unitPrice}$.
- **`lineTotal: Money`**: $\max(0, \text{lineSubtotal} - \text{discountAmount}) + \text{taxAmount}$.

#### The Permanent Snapshotting Requirement

> [!IMPORTANT]
> **Why `SaleItem` Must Snapshot Commercial Information**:  
> A `SaleItem` must **never** store a foreign key that dynamically joins to the product or membership table to display descriptions or prices at read time.
>
> Real-world prices change frequently:
>
> - A gym plan priced at $50/month in January is raised to $60/month in March.
> - A protein shake priced at $4.00 is discounted to $3.50 or increased to $4.50.
>
> If `SaleItem` queried source tables dynamically:
>
> 1. Historical sales totals would retroactively mutate whenever an administrator updated a product price.
> 2. Daily revenue reports, tax filings, and audited receipts would silently corrupt.
> 3. Discontinuing or deleting a product catalog entry would crash historical order queries.
>
> Therefore, `SaleItem` **permanently freezes**:
>
> - `description`: Exact text label (e.g., `"1-Month Standard Membership Plan"`, `"Optimum Whey Protein 2lb"`).
> - `skuOrCode`: Source SKU or business code at the moment of sale (e.g., `"PLAN-MTH-STD"`, `"PROT-WHEY-01"`).
> - `unitPrice`: Exact price snapshot.
> - `taxRate`: Exact tax percentage snapshot.

---

### 3.3 `Payment` (Autonomous Aggregate Root)

#### Identity & Multi-Tenancy

- **`id: PaymentId`**: Canonical UUID uniquely identifying the financial transaction.
- **`tenantId: TenantId`**: Enforces organization-level isolation.
- **`saleId: SaleId`**: Unconstrained scalar reference to the `Sale` being settled.
- **`amount: Money`**: Monetary amount of this specific tender transaction ($> 0$).
- **`method: PaymentMethod`**: The tender mechanism (`CASH`, `CARD`, `QR_CODE`, `BANK_TRANSFER`, `DIGITAL_WALLET`).
- **`status: PaymentStatus`**: Lifecycle state (`PENDING`, `AUTHORIZED`, `SETTLED`, `FAILED`, `CANCELLED`).
- **`externalProviderState?: ExternalProviderState`**: Isolated Value Object encapsulating raw third-party gateway identifiers and payloads.
- **`cashierId: UserId`**: Identity of staff member recording or operating the tender.
- **`initiatedAt: DateTime`**: Timestamp of payment initiation.
- **`settledAt?: DateTime`**: Timestamp when funds were verified and permanently locked.

#### Decoupled Triad: Method vs. Status vs. External State

To prevent third-party gateway leakage, the domain strictly separates:

1. **`PaymentMethod` (Domain Enum)**: The commercial classification of tender (`CASH`, `CARD`, `QR_CODE`, `BANK_TRANSFER`, `DIGITAL_WALLET`).
2. **`PaymentStatus` (Internal State Machine)**: Internal business and accounting lifecycle (`PENDING`, `AUTHORIZED`, `SETTLED`, `FAILED`, `CANCELLED`).
3. **`ExternalProviderState` (Isolated Value Object)**: Third-party processor attributes (`provider: 'STRIPE' | 'TERMINAL' | 'MANUAL'`, `externalTransactionId`, `rawGatewayStatus`, `authorizationCode`). The core domain never evaluates raw provider statuses directly; adapters translate them at boundary ports.

#### Multi-Tender & Partial Payment Settlement

The domain explicitly supports **1-to-many payments per sale** (`Sale 1 -> 0..* Payment`):

1. **Split Tenders**: A customer paying a $100 bill with $40 Cash and $60 Credit Card produces two distinct `Payment` aggregates linked to the same `saleId`.
2. **Partial Deposits & Underpayment**:
   - A customer placing a $30 deposit on a $100 treatment plan generates a $30 settled payment.
   - `Sale.balanceRemaining` decrements to $70.00, placing the sale in `PARTIALLY_PAID`.
   - **Fulfillment Guard**: Underpayment is allowed during checkout, but the `Sale` **CANNOT** transition to `PAID` or `COMPLETED` until $\text{balanceRemaining} == 0$.
3. **Overpayment & Cash Change Handling**:
   - **Electronic Tenders (Card, QR, Transfer)**: Overpayment is strictly forbidden. The system will reject any electronic payment where $\text{amount} > \text{Sale.balanceRemaining}$.
   - **Cash Tenders**: If a customer pays with a larger denomination (e.g., $100 bill on a $75.50 balance), `Payment.amount` is recorded as the exact debt-settling amount ($75.50). The front-end POS records `tenderedAmount` ($100.00) and `changeGiven` ($24.50) for cash drawer balancing. The sale balance never drops below zero.

#### Refund Conceptual Architecture: Append-Only Compensating Records

- **No In-Place Mutation**: Settled payments are **permanently immutable**. A settled payment record is never edited, deleted, or transitioned to `REFUNDED`. In-place mutations violate double-entry bookkeeping and corrupt historical cash drawer reconciliations.
- **Compensating Transactions**: A refund is an autonomous compensating financial record (`PaymentRefund` or `Payment` with direction `REFUND`) referencing `originalPaymentId` and `saleId`, containing a positive scalar refund amount ($\le \text{originalPayment.amount}$), mandatory business justification, and `authorizedByUserId`.
- **Phase 7 Scope**: Phase 7.0 establishes this append-only data contract. Full automated external gateway refund dispatch (e.g. Stripe refund API execution) is scheduled for Phase 7.x extension.

---

### 3.4 `Receipt` (Autonomous Document Entity)

#### Nature of a Receipt: Proof vs. Financial Truth

> [!NOTE]
> **Is a Receipt a Financial Source of Truth?**  
> **No.** A `Receipt` is **NOT** the financial source of truth.  
> The financial truth is authoritatively governed by the `Sale` and `Payment` aggregates.  
> A `Receipt` is an **immutable, customer-facing legal voucher** that represents and evidences an already-settled financial transaction.

#### Generation, Immutability & Reprint Rules

1. **Generation Trigger**: Automatically generated once a `Sale` reaches `PAID` status (or upon recording an official partial deposit).
2. **No Regeneration**: Once issued, a receipt cannot be regenerated with a new identifier or altered financial data.
3. **No Deletion**: Deletion is prohibited by database foreign key constraints and audit policies.
4. **Reprint Behavior**: Customer reprint requests do **not** create a new receipt entity. The system re-renders the frozen receipt snapshot stamped with a mandatory `DUPLICATE / REPRINT` watermark, logging the reprint timestamp and operator in technical audit logs.
5. **Refund Representation**: When a sale is refunded, the original receipt remains frozen. A separate `CreditNote` or `RefundVoucher` is issued to document the reversal.

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

### 3.6 `Money` (Canonical Shared Kernel Value Object)

In accordance with Phase 6 architectural standards, ADR-0098, and ADR-0108:

- **Mathematical Determinism**: Binary floating-point arithmetic (IEEE 754 `number`) is strictly prohibited for monetary calculations.
- **`amount: number`**: Represents major currency units (e.g. `$49.99`). Must be a finite, non-negative number ($0 \le \text{amount} < \infty$).
- **Precision & Scale**: Fixed scale of **2 decimal places** (integer cents / hundredths). Precision is enforced at instantiation:
  $$\text{amount} = \frac{\text{round}(\text{amount} \times 100)}{100}$$
- **`currency: string`**: Normalized 3-letter uppercase ISO-4217 standard currency code (e.g., `USD`, `CAD`, `EUR`). Default: `USD`.
- **Arithmetic Rules (Guaranteed Cent-Integer Math)**:
  - `add(other: Money)`: Requires identical currencies; computes $\frac{\text{round}(a \times 100) + \text{round}(b \times 100)}{100}$. Returns new `Money`.
  - `subtract(other: Money)`: Requires identical currencies; computes $\frac{\text{round}(a \times 100) - \text{round}(b \times 100)}{100}$. Throws `InvalidMoneyException` if result $< 0$.
  - `multiply(factor: number)`: Factor must be finite and $\ge 0$; computes $\frac{\text{round}(a \times 100 \times \text{factor})}{100}$. Returns new `Money`.
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
  - Repositories map bidirectional: `Money.create(Number(raw.amount), raw.currency)` and `new Prisma.Decimal(money.amount)`.
- **API Representation**:
  - Serialized as structured JSON object: `{ "amount": 49.99, "currency": "USD" }`.
- **Payment Gateway Conversion**:
  - External adapters convert deterministically:
    $$\text{amountInCents} = \text{round}(\text{money.amount} \times 100)$$
    $$\text{money} = \text{Money.create}\left(\frac{\text{cents}}{100}, \text{currency}\right)$$

---

### 3.7 `Discount` (Value Object)

#### Semantics & Types

```
Discount
├── type: DiscountType (FIXED_AMOUNT | PERCENTAGE)
├── value: number (Finite positive number)
├── reason: string (Mandatory business justification)
└── authorizedByUserId?: string (Required for overrides)
```

#### Deterministic Invariants & Rules

1. **Percentage Boundaries**: If `type == PERCENTAGE`, $0 < \text{value} \le 100$ with scale up to 2 decimal places (e.g. `12.5%`). A 100% discount reduces the balance to zero (complimentary item/service).
2. **Fixed Amount Boundaries**: If `type == FIXED_AMOUNT`, value must be $> 0$ in the sale's functional currency.
3. **Cap at Subtotal (Non-Negative Guard)**:
   - A discount can **never exceed the subtotal** to which it applies.
   - If a fixed discount of $50.00 is applied to a $35.00 item, the reduction is capped at $35.00. The net line total is $0.00; it never becomes negative.
4. **Rounding Policy**:
   - Percentage discounts round half-up at the cent boundary:
     $$\text{reductionAmount} = \frac{\text{round}\left(\text{subtotal} \times \frac{\text{percentage}}{100} \times 100\right)}{100}$$
5. **Hierarchy & Precedence**:
   - **Level 1 (Item-Level Discounts)**: Evaluated first against individual line item gross subtotals ($\text{quantity} \times \text{unitPrice}$).
   - **Level 2 (Order-Level Discount)**: Evaluated second against the net sum of all discounted line items.
6. **Mandatory Justification**:
   - Every discount requires a non-empty `reason` string (e.g., `"Seasonal Clinic Promo"`, `"Damaged outer seal"`, `"VIP Staff Benefit"`). Discretionary discounts without justification are rejected by domain validation.
7. **Authorization Overrides**:
   - Cashiers have discretionary discount authority up to a configured threshold (e.g., up to 15% or $20.00).
   - Discounts exceeding this threshold require `authorizedByUserId` linking to an IAM user with `Owner` or `Manager` role.

---

### 3.8 Deterministic Sale Totals & Reconciliation Formulas

To guarantee that corporate balance sheets, receipts, and payment transactions reconcile to the exact cent without penny discrepancies, the domain enforces the following 13 deterministic formulas:

```
1.  Line Subtotal:
    lineSubtotal = round(quantity * unitPrice.amount * 100) / 100

2.  Line Discount:
    lineDiscount = min(lineSubtotal, calculatedLineReduction)

3.  Line Net Amount (Pre-Tax):
    lineNet = lineSubtotal - lineDiscount

4.  Line Tax:
    lineTax = round(lineNet * taxRate * 100) / 100

5.  Line Total:
    lineTotal = lineNet + lineTax

6.  Sale Gross Subtotal:
    saleSubtotal = Sum(lineSubtotal[i])

7.  Total Line Discounts:
    totalLineDiscounts = Sum(lineDiscount[i])

8.  Sale Net (Pre-Order Discount):
    saleNetPreOrderDisc = Sum(lineNet[i])

9.  Order-Level Discount:
    orderDiscountAmount = min(saleNetPreOrderDisc, orderDiscount.calculateReduction(saleNetPreOrderDisc))

10. Total All Discounts:
    totalDiscounts = totalLineDiscounts + orderDiscountAmount

11. Total Sale Tax:
    saleTaxTotal = Sum(lineTax[i])

12. Sale Total (Final Net Payable):
    saleTotal = max(0, saleSubtotal - totalDiscounts + saleTaxTotal)

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
    [*] --> DRAFT : createSale()

    DRAFT --> DRAFT : addItem() / removeItem() / applyDiscount()
    DRAFT --> CANCELLED : cancel(reason)
    DRAFT --> PENDING_PAYMENT : finalizeOrder()

    PENDING_PAYMENT --> PAID : recordPayment() [Balance == 0]
    PENDING_PAYMENT --> PARTIALLY_PAID : recordPayment() [Balance > 0]
    PENDING_PAYMENT --> CANCELLED : cancel(reason)

    PARTIALLY_PAID --> PAID : recordPayment() [Balance == 0]
    PARTIALLY_PAID --> CANCELLED : cancelWithRefund()

    PAID --> COMPLETED : fulfillAllItems()
    PAID --> REFUNDED : refund(full)
    PAID --> PARTIALLY_REFUNDED : refund(partial)

    COMPLETED --> REFUNDED : refund(full)
    COMPLETED --> PARTIALLY_REFUNDED : refund(partial)

    CANCELLED --> [*]
    REFUNDED --> [*]
    COMPLETED --> [*]
```

#### Sale Lifecycle States Defined

- **`DRAFT`**: Active checkout session. Cashiers may add, remove, or modify items, adjust quantities, and apply discretionary discounts. No customer payment obligation exists.
- **`PENDING_PAYMENT` (Finalized / Unpaid)**: The cashier has finalized the order. All commercial line items, prices, discounts, and order totals are **permanently frozen**. The customer is presented with the final net payable balance. If payment terms apply (e.g. corporate invoicing), this represents an uncollected balance.
- **`PARTIALLY_PAID`**: At least one payment has settled ($> 0$), but $\text{balanceRemaining} > 0$. Goods or service fulfillment may be held or restricted depending on business line policy.
- **`PAID`**: All outstanding balances are settled ($\text{balanceRemaining} == 0$). Legal receipt generation is triggered.
- **`COMPLETED`**: The sale is both fully paid AND all physical inventory has been decremented and service memberships activated.
- **`CANCELLED`**: The order was voided prior to payment, or abandoned. No further operations permitted.
- **`REFUNDED` / `PARTIALLY_REFUNDED`**: Post-settlement compensating transactions have reversed part or all of the collected funds.

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

The `Payment` state machine governs an autonomous monetary tender transaction:

```mermaid
stateDiagram-v2
    [*] --> PENDING : initiatePayment()

    PENDING --> AUTHORIZED : authorizeHold()
    PENDING --> SETTLED : immediateCapture(cash/terminal)
    PENDING --> FAILED : gatewayReject()
    PENDING --> CANCELLED : abort()

    AUTHORIZED --> SETTLED : capture()
    AUTHORIZED --> FAILED : captureError()
    AUTHORIZED --> CANCELLED : voidHold()

    FAILED --> [*]
    CANCELLED --> [*]
    SETTLED --> [*]
```

#### Formal State Transition Matrix

The table below exhaustively defines every permitted and forbidden state transition for `Payment`:

| From         | To           | Allowed? | Reason                                                                          | Preconditions                                                                                  |
| :----------- | :----------- | :------: | :------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------- |
| `[*]`        | `PENDING`    | **YES**  | Tender initiated at checkout.                                                   | Amount $> 0$, valid `tenantId`, `saleId`, and `PaymentMethod`.                                 |
| `PENDING`    | `AUTHORIZED` | **YES**  | Pre-authorization credit hold confirmed by gateway.                             | Gateway authorization reference code received; hold expiration timestamp set.                  |
| `PENDING`    | `SETTLED`    | **YES**  | Cash counted in drawer or instant electronic capture confirmed.                 | Full tender amount received; cashier or terminal confirmation logged.                          |
| `PENDING`    | `FAILED`     | **YES**  | Card declined, terminal timeout, hardware error, insufficient funds.            | Provider error code and descriptive failure reason recorded.                                   |
| `PENDING`    | `CANCELLED`  | **YES**  | Cashier aborts tender or customer switches to a different tender.               | No funds received or held; executed prior to gateway charge.                                   |
| `AUTHORIZED` | `SETTLED`    | **YES**  | Pre-authorized hold successfully captured.                                      | Capture request accepted within authorization validity window.                                 |
| `AUTHORIZED` | `CANCELLED`  | **YES**  | Cashier voids pre-authorization hold before capture.                            | Gateway void confirmed; hold released; no funds transferred.                                   |
| `AUTHORIZED` | `FAILED`     | **YES**  | Capture request rejected or pre-authorization hold expired.                     | Gateway capture rejection code recorded.                                                       |
| `AUTHORIZED` | `PENDING`    |  **NO**  | Cannot revert an active hold back to pending initiation.                        | —                                                                                              |
| `SETTLED`    | `*` (Any)    |  **NO**  | **Settled payments are permanently immutable**. Zero state mutations permitted. | Financial records cannot be altered. Reversals require autonomous compensating refund records. |
| `FAILED`     | `*` (Any)    |  **NO**  | Terminal state. Retry requires creating a new `Payment` aggregate.              | Failed attempts remain preserved for audit logging.                                            |
| `CANCELLED`  | `*` (Any)    |  **NO**  | Terminal state. Tender was aborted without financial transfer.                  | Preserved for cashier audit history.                                                           |

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

This matrix maps high-level business requirements to conceptual domain rules and anticipated application use cases:

| Business Requirement               | Conceptual Domain Rule                                                                                 | Anticipated Application Use Case                        |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------- | :------------------------------------------------------ |
| **Unified Point of Sale**          | `Sale` accepts heterogeneous items via `SourceReference` without coupling to source tables.            | `CreateSaleUseCase`, `AddSaleItemUseCase`               |
| **Permanent Accounting Integrity** | `SaleItem` permanently snapshots price, name, SKU, and tax at checkout.                                | `AddSaleItemUseCase`                                    |
| **Split-Tender Payment**           | `Payment` is an autonomous aggregate linked via `saleId`; multiple payments can settle one sale.       | `RecordPaymentUseCase`                                  |
| **Walk-in Customer Checkout**      | `clientId` is optional on `Sale`, allowing anonymous retail sales.                                     | `CreateSaleUseCase`                                     |
| **Non-Negative Cashier Guard**     | `Sale.total` cannot be negative; discounts exceeding order value are capped at order total.            | `ApplyOrderDiscountUseCase`                             |
| **Cashier Discretion Controls**    | Discretionary discounts require a mandatory `reason` string and threshold validation.                  | `ApplyOrderDiscountUseCase`, `ApplyItemDiscountUseCase` |
| **Inventory Stock Protection**     | Sales delegates stock deduction to `InventoryStockDecrementPort`; respects OCC and non-negative stock. | `FulfillSaleUseCase`                                    |
| **Gym Membership Activation**      | Sales delegates subscription activation to `GymMembershipActivationPort` upon payment settlement.      | `FulfillSaleUseCase`                                    |
| **Clinical Session Billing**       | Sales flags treatment session as billed via `TreatmentBillingPort` without exposing medical notes.     | `FulfillSaleUseCase`                                    |
| **Tamper-Evident Receipts**        | `Receipt` is write-once, sequentially numbered, and permanently frozen upon issuance.                  | `IssueReceiptUseCase`, `GetReceiptByIdQuery`            |
| **Transaction Audit Trail**        | Commercial transitions and financial tenders write append-only audit events with actor attribution.    | All Command Handlers                                    |
| **Customer Refund Processing**     | Refunds create explicit refund payment records linked to the original sale and payment.                | `RefundSaleUseCase`                                     |

---

## 10. Explicit Non-Goals for Phase 7.0

To maintain laser focus on domain modeling, the following areas are strictly **OUT OF SCOPE** for this milestone:

1. **No Code Implementation**: No TypeScript classes, NestJS controllers, Prisma entities, or React components are created in Milestone 7.0.
2. **No Hardware Driver Specifications**: Low-level thermal printer ESC/POS bytes, magnetic stripe readers, or physical cash drawer relays are out of scope.
3. **No Direct Gateway API Bindings**: Concrete Stripe, MercadoPago, or bank API payloads are out of scope; all external interactions are abstracted behind conceptual ports.
4. **No Double-Entry General Ledger**: Balance sheets, asset depreciation schedules, and corporate tax return filings belong to a future accounting context.
