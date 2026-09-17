# 0110. Sale Transaction Ownership and Source Bounded-Context Integrity

- **Status**: Accepted
- **Date**: 2026-09-17
- **Deciders**: Principal Software Architect, Principal Domain Architect, Security Architect, Staff Platform Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments). Commercial transactions originate across clinical kinesiology sessions (Phase 4), gym memberships (Phase 5), consumable wellness inventory (Phase 6), and future facility services. The platform requires a unified checkout and settlement system without allowing Sales to usurp ownership of source business entities.

---

## 1. Context and Problem Statement

In a multi-disciplinary health, wellness, and fitness platform, clients purchase diverse products and services in single checkout sessions (e.g., renewing a gym membership, booking a physiotherapy evaluation, and purchasing protein supplements at the front desk).

When architecting a centralized Sales & Payments engine, two architectural traps emerge:

1. **The "Everything Financial" Monolithic Anti-Pattern**: The Sales domain takes ownership of product inventories, stock depletion ledgers, membership validity dates, turnstile access policies, and clinical session documentation. This creates high coupling, circular dependencies, and monolithic domain leakage.
2. **The Fragmented Siloed Billing Anti-Pattern**: Each bounded context (Gym, Kinesiology, Resources) implements its own ad-hoc checkout, invoices, cash drawers, and payment processor integrations. This results in fragmented customer receipts, impossible multi-service checkouts, fractured financial reporting, and replicated security vulnerabilities.

We must define why and how **Sales owns the commercial transaction** while **source domains retain exclusive ownership of their business entities**, codifying the principle of **"References Over Ownership"**.

---

## 2. Decision Drivers

- **Domain Boundaries**: Clear segregation between commercial agreements (orders, tenders, receipts) and operational domain lifecycles (inventory, memberships, clinical treatments).
- **Unified Checkout Experience**: Cashiers and front-desk staff must be able to sell heterogeneous items across multiple operational areas in a single checkout session.
- **Historical Immutability & Audit Protection**: Updating a product catalog price, modifying a gym plan fee, or archiving a discontinued item must never retroactively corrupt past sales totals, receipts, or balance sheets.
- **Decoupled Fulfillment**: Business mutations (stock movements, membership activation) must execute through explicit application ports without Sales acquiring direct database write access to source domain tables.
- **Zero Cyclic Dependencies**: Sales may query source domain query ports for price and status verification, but source domains must never depend on Sales for their core domain operations.

---

## 3. Considered Options

### Option 1: Monolithic Sales Domain (Sales Owns Catalog, Stock, and Memberships)

- Move `MembershipPlan`, `InventoryItem`, and `TreatmentSession` billing records directly into the Sales domain.
- **Verdict**: **Rejected**. Destroys bounded context autonomy. Resources cannot manage warehouse replenishments without touching Sales; Gym cannot manage workout tracking without touching Sales.

### Option 2: Fragmented Domain Billing (Each Context Manages Its Own Sales)

- Gym processes membership payments; Resources processes smoothie payments; Kinesiology processes therapy payments.
- **Verdict**: **Rejected**. Prevents unified front-desk point of sale (POS). A customer purchasing a smoothie and renewing a membership would require two separate card transactions and two separate receipts.

### Option 3: "References Over Ownership" with Snapshot Line Items & Port-Driven Fulfillment

- The `Sale` aggregate exclusively owns the commercial agreement: checkout session, line item snapshots, applied discounts, computed taxes, and total payable amount.
- `SaleItem` stores scalar **unconstrained foreign references** (`SourceReference`) and **permanently snapshots** commercial attributes (`description`, `skuOrCode`, `unitPrice`, `taxRate`).
- Source domains retain 100% exclusive authority over their business entities, inventories, access rules, and clinical charts.
- Fulfillment is orchestrated via outbound capability ports (`InventoryStockDecrementPort`, `GymMembershipActivationPort`).
- **Verdict**: **Selected**.

---

## 4. Decision Outcome

Chosen Option: **Option 3: "References Over Ownership" with Snapshot Line Items & Port-Driven Fulfillment**.

---

## 5. Architectural Specification

### 5.1 The Six Delineated Responsibilities

The platform cleanly separates the commercial workflow into six autonomous phases:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THE SIX RESPONSIBILITIES                        │
│                                                                        │
│  1. SELLING        Agree on items, quantities, snapshot prices,        │
│     (Sales)        discounts & taxes. Governed by Sale.                │
│                           │                                            │
│                           ▼                                            │
│  2. PAYING         Capture monetary tender (cash, card, QR, transfer). │
│     (Payments)     Governed by Payment aggregate.                      │
│                           │                                            │
│              ┌────────────┴────────────┐                               │
│              ▼                         ▼                               │
│  3. RECEIPTING                         4. FULFILLING                   │
│     (Receipt)                             (Source Domains)             │
│     Emit immutable customer voucher.      Decrement inventory stock,   │
│                                           activate gym plan, mark      │
│                                           treatment session billed.    │
│              │                         │                               │
│              └────────────┬────────────┘                               │
│                           ▼                                            │
│  5. OWNING         Source domains maintain sole lifecycle authority    │
│     (Source)       over master catalog, stock levels, and medical data.│
│                                                                        │
│  6. AUDITING       Append-only sub-ledger of commercial actions and    │
│     (Ledger)       compensating financial transactions.                │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 5.2 What Sales Owns vs. What Source Domains Own

| Domain                   | What It Owns                                                                                                                                                                                                                                                      | What It NEVER Owns                                                                                                                                                                                                                                                                                                               |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sales & Payments**     | - Commercial agreement (`Sale`)<br>- Snapshot line items (`SaleItem`)<br>- Order & item discounts (`Discount`)<br>- Monetary tenders (`Payment`)<br>- Legal vouchers (`Receipt`)<br>- Checkout lifecycle (`DRAFT` $\rightarrow$ `PAID` $\rightarrow$ `COMPLETED`) | - Physical inventory quantity on hand (`quantityOnHand`)<br>- Warehouse stock movement ledgers (`StockMovement`)<br>- Capital asset depreciation & maintenance<br>- Gym membership plan rules & access control<br>- Medical notes, treatment session diagnoses & SOAP records<br>- Master customer identities & auth credentials |
| **Resources Management** | - Physical inventory items (`InventoryItem`)<br>- Stock replenishment & depletion ledgers<br>- Fixed assets, locations, maintenance schedules                                                                                                                     | - Sales checkout sessions<br>- Point of sale cash drawers<br>- Customer payment card authorizations                                                                                                                                                                                                                              |
| **Gym Management**       | - Membership plans, pricing tiers, validity terms<br>- Member subscription lifecycles & turnstile rules                                                                                                                                                           | - Direct card processing gateways<br>- Split tender calculations<br>- Point of sale line items                                                                                                                                                                                                                                   |
| **Kinesiology**          | - Clinical treatment sessions, protocols, SOAP notes<br>- Therapist assignments & rehabilitation plans                                                                                                                                                            | - Commercial payment collection<br>- Cash register drawer reconciliation                                                                                                                                                                                                                                                         |

---

### 5.3 The Commercial Snapshotting Invariant

To guarantee that corporate balance sheets, daily cashier closings, and legal receipts remain deterministically immutable:

1. **Foreign Key Decoupling**: A `SaleItem` **never** performs a database `JOIN` to `inventory_items` or `membership_plans` at read time to retrieve descriptions or prices.
2. **Permanent Snapshotting**: When an item is added to a `Sale`, the following fields are frozen in `SaleItem`:
   - `description`: Text snapshot at checkout (e.g. `"1-Month Standard Gym Membership"`).
   - `skuOrCode`: Business identifier or barcode at checkout (e.g. `"PLAN-MTH-01"`).
   - `unitPrice`: Monetary amount agreed upon at checkout.
   - `taxRate`: Applicable tax rate at checkout.
3. **Price Change Immunity**: If an administrator increases a gym plan price from $50 to $60 next week, all past sales retain the frozen $50 price. Historical revenue reports remain 100% accurate.
4. **Item Deletion / Archival Immunity**: If a consumable item or membership plan is archived or discontinued, past sales queries load seamlessly without relational null errors.

---

### 5.4 Source Entity Lifecycle Protections

1. **Sales Never Mutates Source Entities Directly**:
   - Sales has **zero SQL `UPDATE` access** to source domain tables.
   - Depleting inventory executes via `InventoryStockDecrementPort.sellStock()`. Resources checks stock levels, enforces concurrency locks, and logs the append-only `StockMovement`.
   - Activating a gym membership executes via `GymMembershipActivationPort.activate()`. Gym updates membership validity and publishes access events.
2. **Protection Against Deletion of Sold Items**:
   - Source domains must enforce soft-delete/archival policies (`ARCHIVED`). Hard SQL deletion of catalog items with historical sales or stock movements is strictly prohibited by domain invariants and foreign key RESTRICT rules.

---

## 6. Consequences

### Positive

- **Complete Domain Decoupling**: Changes to product catalogs, gym plan tiers, or therapy pricing do not cascade into historical sales data.
- **Unified Front-Desk POS**: Front-desk staff can sell any combination of goods, memberships, and clinical services in a single, atomic checkout.
- **Zero Cyclic Dependencies**: Clean unidirectional dependency: `Sales` $\rightarrow$ `Port Interfaces` $\rightarrow$ `Source Adapters`.

### Negative / Trade-offs

- **Denormalized Storage**: `SaleItem` duplicates text descriptions and SKU strings rather than relying on normalized foreign key joins. This is a deliberate, necessary trade-off for financial immutability.
- **Orchestration Complexity**: Post-payment fulfillment requires reliable domain event dispatch or application service orchestration across ports.

---

## 7. Implementation Guidelines

- Model `SourceReference` as an immutable Value Object (`sourceType`, `sourceId`, `sourceCode`).
- Persist `SaleItem` with standalone snapshot columns: `description String`, `skuOrCode String?`, `unitPrice Decimal(12,2)`, `taxRate Decimal(5,4)`.
- Enforce that `Sale` aggregates emit domain events (`SalePaidDomainEvent`, `SaleCompletedDomainEvent`) that downstream fulfillment handlers consume asynchronously or via transactional outbox.
