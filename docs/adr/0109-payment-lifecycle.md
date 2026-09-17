# 0109. Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability

- **Status**: Accepted
- **Date**: 2026-09-17
- **Deciders**: Principal Payments Architect, Principal Software Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments). The platform must process customer tenders across multiple payment methods (cash, card, QR, bank transfer), support split payments and partial deposits, prevent financial tampering, guarantee progressive immutability, and enforce clean separation between commercial orders and financial tenders.

---

## 1. Context and Problem Statement

A fundamental architectural failure in Point of Sale (POS) and billing systems is conflating the **commercial agreement** (the order/cart) with the **monetary tender** (the payment transaction). When an application couples `Sale` and `Payment` into a 1:1 model or mutates historical payment records when corrections occur:

1. **Split Tenders Break**: Customers cannot split a $100 bill across multiple payment methods (e.g., $40 cash and $60 credit card).
2. **Deposit & Partial Payments Fail**: Front-desk operations cannot accept deposits on kinesiology treatment plans or membership sign-ups while deferring remaining balances.
3. **Audit Trails Corrupt**: Mutating or deleting a settled payment record to fix a mistake or issue a refund destroys historical cash register closing totals and daily bank reconciliations.
4. **Provider Couplings Leak**: Raw payment gateway states (e.g., Stripe webhooks, terminal timeout packets) corrupt core business rules.

We must define a deterministic, auditable payment lifecycle and financial immutability architecture before implementing persistence in Sales & Payments.

---

## 2. Decision Drivers

- **Strict Decoupling**: Complete separation between the `Sale` lifecycle (commercial contract) and the `Payment` lifecycle (financial tender).
- **Split & Partial Payment Support**: Support 1-to-many payments per sale, enabling partial deposits, split tenders, and incremental balance settlement.
- **Progressive Immutability**: Guarantee that commercial terms, settled transactions, and customer receipt vouchers freeze permanently at precise domain milestones.
- **Append-Only Auditing**: Settled payment records are write-once and permanently immutable. Refunds and adjustments must be modeled as autonomous compensating transactions, never in-place mutations.
- **Gateway Isolation**: Decouple domain payment states (`PENDING`, `SETTLED`, etc.) from third-party gateway providers and physical hardware terminals.

---

## 3. Considered Options

### Option 1: 1-to-1 Embedded Sale-Payment Model with In-Place Mutation

- The `Sale` entity contains embedded payment fields (`paymentMethod`, `paymentStatus`, `paidAmount`).
- Paying mutates the sale; refunds mutate the `paidAmount` backwards or flip `paymentStatus` to `REFUNDED`.
- **Verdict**: **Rejected**. Violates single-responsibility, prevents split payments, prevents partial deposits, and corrupts financial audit logs.

### Option 2: Autonomous Payment Aggregates with In-Place Status Mutation for Refunds

- `Payment` is an autonomous aggregate linked by `saleId`.
- When a refund occurs, the existing `Payment` status is updated from `SETTLED` to `REFUNDED`.
- **Verdict**: **Rejected**. Mutating a settled record erases the fact that funds were physically collected and settled on that date. Cash drawer reconciliations for past dates would silently alter.

### Option 3: Autonomous Multi-Tender Payment Aggregates with Append-Only Compensating Refunds & Progressive Immutability

- `Payment` is an autonomous aggregate root linked to `Sale` via scalar `SaleId` (supporting 1-to-many payments).
- `Payment` executes its own deterministic state machine (`PENDING`, `AUTHORIZED`, `SETTLED`, `FAILED`, `CANCELLED`).
- Settled payments are permanently immutable; refunds are modeled as separate compensating transactions referencing the original tender.
- `Receipt` is an immutable document voucher issued upon settlement that never changes financial truth.
- **Verdict**: **Selected**.

---

## 4. Decision Outcome

Chosen Option: **Option 3: Autonomous Multi-Tender Payment Aggregates with Append-Only Compensating Refunds & Progressive Immutability**.

---

## 5. Architectural Specification

### 5.1 Payment State Machine

The Kinergy payment lifecycle governs individual monetary tender attempts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT STATE MACHINE                           │
│                                                                        │
│                          ┌─────────────┐                               │
│                          │  [Initial]  │                               │
│                          └──────┬──────┘                               │
│                                 │ initiatePayment()                    │
│                                 ▼                                      │
│                          ┌─────────────┐                               │
│                          │   PENDING   │                               │
│                          └──┬───┬───┬──┘                               │
│         authorizeHold()     │   │   │  immediateCapture()              │
│       ┌─────────────────────┘   │   └────────────────────┐             │
│       ▼                         ▼ abort()                ▼             │
│ ┌────────────┐           ┌─────────────┐          ┌─────────────┐      │
│ │ AUTHORIZED │           │  CANCELLED  │          │   SETTLED   │      │
│ └─────┬──────┘           └─────────────┘          └─────────────┘      │
│       │ capture()          (Terminal)               (Terminal          │
│       ├─────────────────────────────────────────────► Immutable)       │
│       │ voidHold()                                                     │
│       ▼                                                                │
│ ┌────────────┐                                                         │
│ │   FAILED   │◄───────────────── gatewayReject()                       │
│ └────────────┘                                                         │
│   (Terminal)                                                           │
└────────────────────────────────────────────────────────────────────────┘
```

#### Deterministic State Transition Matrix

| From         | To           | Allowed? | Reason                                                                                              | Preconditions                                                                                   |
| :----------- | :----------- | :------: | :-------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| `[*]`        | `PENDING`    | **YES**  | Cashier initiates tender or terminal prompts customer.                                              | Amount $> 0$; valid `tenantId`, `saleId`, and `PaymentMethod`.                                  |
| `PENDING`    | `AUTHORIZED` | **YES**  | Card processor verifies credit line and places pre-authorization hold.                              | Gateway authorization reference code received; hold expiration timestamp recorded.              |
| `PENDING`    | `SETTLED`    | **YES**  | Tender physically collected (cash counted) or instant electronic capture (debit PIN, QR code scan). | Full tender amount received; cashier/terminal confirmation recorded.                            |
| `PENDING`    | `FAILED`     | **YES**  | Card declined, insufficient funds, network timeout, terminal hardware error.                        | Provider error code and descriptive failure reason recorded.                                    |
| `PENDING`    | `CANCELLED`  | **YES**  | Customer changes payment method or cashier cancels in-flight tender.                                | No funds received or held; initiated prior to gateway charge execution.                         |
| `AUTHORIZED` | `SETTLED`    | **YES**  | Pre-authorized hold captured upon order completion.                                                 | Capture request accepted within hold validity window.                                           |
| `AUTHORIZED` | `CANCELLED`  | **YES**  | Cashier voids authorization hold before capture (release hold).                                     | Gateway reversal/void confirmed; no funds transferred.                                          |
| `AUTHORIZED` | `FAILED`     | **YES**  | Capture request rejected or pre-authorization hold expired.                                         | Gateway capture rejection code recorded.                                                        |
| `AUTHORIZED` | `PENDING`    |  **NO**  | Cannot revert an active hold back to pending initiation.                                            | —                                                                                               |
| `SETTLED`    | `*` (Any)    |  **NO**  | **Settled payments are permanently immutable**. Zero state mutations permitted.                     | Financial records cannot be updated or deleted. Compensating transactions required for refunds. |
| `FAILED`     | `*` (Any)    |  **NO**  | Terminal state. Retry requires instantiating a new `Payment` aggregate.                             | Failed attempts remain preserved for audit logging.                                             |
| `CANCELLED`  | `*` (Any)    |  **NO**  | Terminal state. Tender was aborted without financial transfer.                                      | Preserved for cashier audit history.                                                            |

---

### 5.2 Payment Methods Conceptual Architecture

The architecture enforces strict separation between:

1. **Payment Method** (`PaymentMethod`): The business classification of the tender.
2. **Payment Lifecycle Status** (`PaymentStatus`): The internal Kinergy state machine.
3. **External Provider State** (`ExternalProviderMetadata`): Raw gateway payloads and identifiers.

```
┌──────────────────┐       ┌──────────────────┐       ┌─────────────────────────────┐
│  PaymentMethod   │       │  PaymentStatus   │       │   ExternalProviderState     │
│  (Domain Enum)   │       │  (State Machine) │       │   (Isolated Gateway VO)     │
├──────────────────┤       ├──────────────────┤       ├─────────────────────────────┤
│ CASH             │       │ PENDING          │       │ provider: "STRIPE" | "POS"  │
│ CARD             │       │ AUTHORIZED       │       │ externalTransactionId       │
│ QR_CODE          │       │ SETTLED          │       │ rawProviderStatus           │
│ BANK_TRANSFER    │       │ FAILED           │       │ authorizationCode           │
│ DIGITAL_WALLET   │       │ CANCELLED        │       │ terminalHardwareId          │
└──────────────────┘       └──────────────────┘       └─────────────────────────────┘
```

- **Cash**: Physical currency. Skips `AUTHORIZED`; transitions directly `PENDING` $\rightarrow$ `SETTLED` upon cashier drawer confirmation.
- **Card**: Credit or Debit card via physical EMV terminal or online checkout. Supports 2-step (`AUTHORIZED` $\rightarrow$ `SETTLED`) or 1-step direct capture.
- **QR Payment**: Dynamic/static QR codes (e.g. PIX, wallet scan). Awaiting webhook confirmation while in `PENDING`, transitions to `SETTLED` on payment webhook or `FAILED` on expiration.
- **Bank Transfer**: Wire, ACH, or SEPA transfers. Stays `PENDING` until back-office cashier confirms bank receipt.
- **Digital Wallet / Future Providers**: Apple Pay, Google Pay, Mercado Pago, Stripe. Domain models remain 100% agnostic to gateway APIs through port interfaces (`PaymentGatewayPort`).

---

### 5.3 Partial Payments, Split Tenders, and Balance Settlement

- **Multiple Payments per Sale**: Fully supported (`Sale 1 -> 0..* Payment`). Each payment represents an independent tender transaction.
- **Split Tenders**: A customer may settle a single bill across multiple tender types (e.g., $30 Cash + $70 Card).
- **Partial Payments & Deposits**: Supported. Each settled payment reduces `Sale.balanceRemaining`.
- **Underpayment Rules**:
  - Permitted during checkout. Leaves the `Sale` in `PARTIALLY_PAID`.
  - **Completion Guard**: A `Sale` **CANNOT** transition to `PAID` or `COMPLETED` until $\text{balanceRemaining} == 0$.
  - Services requiring full payment prior to fulfillment (e.g. retail products, gym access) verify $\text{balanceRemaining} == 0$ before releasing assets.
- **Overpayment Rules**:
  - **Electronic Payments**: Strictly prohibited. Gateway tender amount cannot exceed `balanceRemaining`.
  - **Cash Change Handling**: When a customer tenders cash exceeding the balance (e.g. $100 bill on a $75 sale):
    - `Payment.amount` is recorded as the exact debt-settling amount ($75.00).
    - Front-end POS records `tenderedAmount` ($100.00) and `changeGiven` ($25.00) for cash drawer tracking.
    - `Sale.balanceRemaining` reaches exactly $0.00; balances never become negative.

---

### 5.4 Refunds Architecture: Append-Only Compensating Transactions

1. **In-Place Mutation Prohibited**: Settled payments are never edited, deleted, or transitioned to a `REFUNDED` status. Mutating historical settled records corrupts past cash drawer closes and tax reports.
2. **Compensating Transactions**: A refund is an autonomous compensating financial record (`PaymentRefund` or `Payment` with direction `REFUND`) that:
   - References `originalPaymentId` and `saleId`.
   - Records positive scalar refund amount ($\le \text{originalPayment.amount}$).
   - Records business justification and `authorizedByUserId` (Manager/Owner).
   - Emits `PaymentRefundedDomainEvent`.
3. **Phase 7 Initial Scope**:
   - The conceptual model and data relationships are established in Phase 7.0 to guarantee future refundability.
   - Full automated gateway refund dispatch (e.g. issuing Stripe API reverse transfers) is scheduled for Phase 7.x extensions.

---

### 5.5 Sale Lifecycle vs. Payment Lifecycle

| Dimension                 | `Sale` Lifecycle                                                                           | `Payment` Lifecycle                                                        |
| :------------------------ | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Domain Scope**          | Commercial Agreement & Fulfillment                                                         | Individual Monetary Tender                                                 |
| **Cardinality**           | 1 per Customer Checkout Session                                                            | 0 to Many per Sale                                                         |
| **Key States**            | `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `COMPLETED`, `CANCELLED`, `REFUNDED` | `PENDING`, `AUTHORIZED`, `SETTLED`, `FAILED`, `CANCELLED`                  |
| **Transitions Driven By** | Cart operations, commercial finalization, inventory fulfillment, aggregate payment balance | Physical cash receipt, terminal EMV flow, gateway webhooks                 |
| **Invariants Protected**  | Line item price freezing, non-negative totals, discount limits, inventory consistency      | Tender amount validation, gateway authorization codes, ledger immutability |

```
Sale:    [DRAFT] ──────► [PENDING_PAYMENT] ─────────────► [PAID] ─────────► [COMPLETED]
                                ▲                            ▲
Payments:                       │                            │
  Payment #1 ($40 Cash):        └── [PENDING] ──► [SETTLED] ─┤
  Payment #2 ($60 Card):        └── [PENDING] ──► [SETTLED] ─┘
```

---

### 5.6 Receipt Architecture

1. **Generation Milestone**: Issued automatically when a `Sale` reaches `PAID` (or upon recording a formal partial deposit).
2. **Not the Financial Source of Truth**: The `Receipt` is a customer-facing legal proof-of-purchase voucher. Financial truth resides strictly in the `Sale` and settled `Payment` aggregates.
3. **Sequential Monotonic Numbering**: Every receipt receives a gap-free, sequential human-readable identifier (e.g. `REC-2026-000421`) generated per tenant.
4. **Permanent Immutability & Deletion Prohibition**: Receipts are write-once. Hard deletion is forbidden by database foreign key constraints. If a transaction is refunded, the original receipt remains untouched; a `RefundReceipt` or `CreditNote` is issued.
5. **Reprint Behavior**: Reprinting does **NOT** generate a new receipt record. It re-renders the frozen receipt document stamped with a mandatory `DUPLICATE / REPRINT` watermark and audit header (`Reprinted by: <userId> at <timestamp>`).

---

### 5.7 The 4-Tier Financial Immutability Matrix

| Milestone                 | Trigger Event                  | Permanently Immutable Fields                                                                                                                                                    | Mutability Permitted                                       |
| :------------------------ | :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------- |
| **1. Sale Creation**      | `POST /sales` (enters `DRAFT`) | `id`, `tenantId`, `createdAt`, `initialCashierId`.                                                                                                                              | `items`, `quantities`, `discounts`, `notes`, `clientId`.   |
| **2. Sale Finalization**  | Enters `PENDING_PAYMENT`       | **All line items frozen**: `description`, `skuOrCode`, `unitPrice`, `taxRate`, `itemDiscount`. Order totals (`subtotal`, `taxTotal`, `total`) are locked. Cart edits forbidden. | `status`, `payments`, `completedAt`, `cancellationReason`. |
| **3. Payment Completion** | Enters `SETTLED`               | **Entire payment record frozen**: `paymentId`, `saleId`, `amount`, `currency`, `method`, `settledAt`, `externalTransactionId`. SQL `UPDATE`/`DELETE` blocked.                   | **None**. Zero post-settlement mutations permitted.        |
| **4. Receipt Issuance**   | Emitted upon `PAID`            | `receiptId`, `receiptNumber`, `saleSnapshot`, `paymentSnapshots`, `issuedAt`.                                                                                                   | **None**. 100% frozen legal document.                      |

---

## 6. Consequences

### Positive

- **Guaranteed Audit Integrity**: Eliminating in-place mutations ensures that cash register balances, bank deposits, and accounting ledgers reconcile perfectly across historical dates.
- **Split Tender Flexibility**: Front-desk cashiers can seamlessly combine cash, card, and digital vouchers on any commercial transaction.
- **Clean Gateway Boundaries**: External payment provider failures or API changes never leak into core commercial order logic.

### Negative / Trade-offs

- **Multiple Entities per Checkout**: Requires orchestrating both `Sale` and `Payment` aggregates rather than writing to a single monolithic database row.
- **Compensating Refund Overhead**: Processing a refund requires inserting compensating ledger entries rather than simply updating a row status.

---

## 7. Migration and Implementation Plan

1. **Shared Kernel Integration**: Align `PaymentMethod` and `PaymentStatus` enums with core value objects (`Money`).
2. **Database Constraints**: Enforce PostgreSQL triggers or Prisma middleware preventing `UPDATE` and `DELETE` on records where `Payment.status = 'SETTLED'` and `Receipt` rows.
3. **Application Service Orchestration**: Implement `ProcessPaymentUseCase` coordinating tender creation, gateway port invocation, balance recalculation, and `Sale` status transitions.
