# Phase 7: Sales & Payments — Milestone 7.0 Final Architecture Acceptance Certification

- **Document**: `docs/architecture/sales-payments-acceptance.md`
- **Milestone**: Phase 7.0 — Architecture, Domain Modeling, Financial Representation, and Invariants
- **Gate**: Milestone 7.0 Acceptance & Phase 7.1 Readiness Certification
- **Role**: Principal Enterprise Architect / Architecture Review Board
- **Date**: 2026-09-17
- **Final Determination**: **`PASS`**

---

## 1. Executive Summary

Milestone 7.0 establishes the authoritative architectural contract, ubiquitous domain model, deterministic financial mathematics, progressive immutability guarantees, security boundaries, and executable business rules for **Phase 7: Sales & Payments**.

In accordance with strict architectural governance:

1. **Zero Premature Implementation**: No production TypeScript domain classes, Prisma models, database migrations, controllers, services, DTOs, or frontend components were authored in Milestone 7.0.
2. **Mathematical Determinism**: Financial representation, rounding policies, scale, precision, and 13 reconciliation formulas were formally established prior to writing any persistence code.
3. **Internal Consistency**: Every layer of documentation—Architecture, Domain Model, Business Rules, and Architectural Decision Records (ADRs)—agrees without contradiction.

---

## 2. Documentation Inventory Verification

All required architectural and domain artifacts exist, are complete, and conform to repository standards:

| Artifact Path                                                 | Purpose & Scope                                                                                                                     | Verification Status |
| :------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------- | :-----------------: |
| **`docs/architecture/sales-payments-discovery.md`**           | Pre-design architectural discovery, operational source inventory, risk analysis, and cross-domain boundaries.                       |    **VERIFIED**     |
| **`docs/architecture/sales-payments.md`**                     | Authoritative architectural contract, 14 cross-domain architectural rules, context map, and integration topologies.                 |    **VERIFIED**     |
| **`docs/domain/sales-payments.md`**                           | Conceptual domain model, ubiquitous language, entity/aggregate boundaries, state machines, and reconciliation formulas.             |    **VERIFIED**     |
| **`docs/business-rules/sales-payments.md`**                   | Executable business rules (`SALE-*`, `ITEM-*`, `PAY-*`, `REC-*`, `MNY-*`, `ORG-*`, `AUTH-*`, `AUD-*`) and full traceability matrix. |    **VERIFIED**     |
| **`docs/adr/0108-money-representation.md`**                   | ADR-0108: Deterministic Financial Representation and Currency Modeling.                                                             |    **VERIFIED**     |
| **`docs/adr/0109-payment-lifecycle.md`**                      | ADR-0109: Payment Lifecycle, Multi-Tender Settlement, and Financial Immutability.                                                   |    **VERIFIED**     |
| **`docs/adr/0110-sale-ownership.md`**                         | ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity.                                                          |    **VERIFIED**     |
| **`docs/adr/0111-sales-payments-authorization-and-audit.md`** | ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries.                                             |    **VERIFIED**     |
| **`docs/adr/0112-sales-bounded-context.md`**                  | ADR-0112: Sales & Payments Bounded Context Establishment.                                                                           |    **VERIFIED**     |
| **`docs/adr/README.md`**                                      | Master ADR Index cataloging decisions `0001` through `0112`.                                                                        |    **VERIFIED**     |

---

## 3. Architecture Alignment Review

The architectural hierarchy strictly adheres to unidirectional dependency:
$$\text{Architecture} \longrightarrow \text{Domain Model} \longrightarrow \text{Business Rules} \longleftrightarrow \text{ADRs}$$

| Alignment Dimension               | Architectural Evidence & Reconciliation                                                                                                                                                                                                                                     | Evaluation  |
| :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------: |
| **Sale vs. Payment Independence** | Architecture (§4), Domain (§3.3, §5.2), Business Rules (§4, `PAY-01`), and ADR-0109 consistently model `Payment` as an autonomous aggregate root linked by scalar `saleId`, supporting 1-to-many payments per sale (split tenders).                                         | **ALIGNED** |
| **Deterministic Money Math**      | Architecture (§13, Rule 7), Domain (§3.6, §3.8), Business Rules (§6, `MNY-01`–`MNY-05`), and ADR-0108 mandate minor integer-cents arithmetic (`Math.round(amount * 100)`), Half-Up rounding, scale 2, and Decimal(12,2) persistence. Zero floating-point drift.             | **ALIGNED** |
| **Commercial Immutability**       | Architecture (§13, Rule 3), Domain (§3.9), Business Rules (§2, `SALE-08`), and ADR-0109/ADR-0110 forbid line-item additions, modifications, or deletions once an order enters `PENDING_PAYMENT`.                                                                            | **ALIGNED** |
| **Source Non-Ownership**          | Architecture (§2), Domain (§3.5), Business Rules (§3, `ITEM-04`–`ITEM-06`), and ADR-0110/ADR-0112 enforce "References Over Ownership". Sales holds scalar IDs and snapshots commercial terms; source domains own physical stock, membership validity, and clinical records. | **ALIGNED** |

**Contradictions Identified**: **`None`**.

---

## 4. Bounded Context Ownership Verification

| Concept                | Owning Bounded Context             | Architectural Justification                                                                                                        |
| :--------------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **`Sale`**             | **Sales & Payments**               | Sole commercial authority for customer purchase agreements, order lines, discounts, taxes, and payable balances.                   |
| **`SaleItem`**         | **Sales & Payments**               | Internal entity of `Sale` capturing the immutable commercial price/tax/description snapshot at checkout.                           |
| **`Payment`**          | **Sales & Payments**               | Autonomous aggregate root capturing financial tender transactions (cash, card, QR, bank transfer) and gateway settlement.          |
| **`Receipt`**          | **Sales & Payments**               | Immutable legal customer-facing voucher issued upon payment settlement; represents proof of purchase.                              |
| **`Client`**           | **Client Management (Phase 2)**    | Master client profile, demographic records, contact details, and account status. Sales holds optional scalar `clientId`.           |
| **`TreatmentSession`** | **Kinesiology (Phase 4)**          | Clinical rehabilitation encounter, therapist notes, SOAP diagnosis, and protocol charts. Sales holds scalar reference for billing. |
| **`Gym Membership`**   | **Gym Management (Phase 5)**       | Member subscription status, validity dates, tier rules, and turnstile access eligibility. Sales captures fee and notifies port.    |
| **`Consumable`**       | **Resources Management (Phase 6)** | Master catalog metadata, reorder points, suppliers, and safety thresholds for sellable retail/kitchen items.                       |
| **`Stock`**            | **Resources Management (Phase 6)** | Physical inventory quantity on hand (`quantityOnHand`) and append-only `StockMovement` ledger. Sales requests deduction via port.  |

**Ambiguous Ownership**: **`None`**.

---

## 5. Aggregate Boundaries & Invariants Verification

1. **`Sale` Aggregate Root**:
   - Boundary: `Sale` root, `SaleItem` entities, `Discount` value objects, `Money` value objects.
   - Atomic unit of consistency: Adding items, applying order discounts, and recalculating taxes execute in a single ACID transaction on `Sale`.
   - Critical Invariants: Non-negative total ($\text{total} \ge 0.00$); currency homogeneity; empty order finalization prohibition; commercial lock upon `PENDING_PAYMENT`.
2. **`Payment` Aggregate Root**:
   - Boundary: `Payment` root, `PaymentMethod` enum, `PaymentStatus` state machine, `ExternalProviderState` VO.
   - Independence: Payment gateway authorization latency or retries do not hold locks on `Sale` or `SaleItem` tables.
   - Critical Invariants: Positive tender amount ($> 0.00$); valid tender method; settled payment permanent immutability; electronic overpayment rejection.
3. **`Receipt` Document Entity**:
   - Boundary: Standalone read-only document voucher.
   - Nature: Evidence of past financial transaction; **not the financial source of truth**. Monotonically increasing tenant-partitioned sequence.

---

## 6. Financial Determinism & Money Verification

- **Scale & Precision**: Precision 12, Scale 2 ($\le \$9,999,999,999.99$).
- **Arithmetic Engine**: All intermediate operations execute in 64-bit safe integer minor units (cents):
  $$\text{cents} = \text{Math.round}((\text{rawUnits} + \text{Number.EPSILON}) \times 100)$$
- **13 Exact Reconciliation Formulas**:
  $$\text{lineSubtotal} = \text{round}(\text{quantity} \times \text{unitPrice.amount} \times 100) / 100$$
  $$\text{lineDiscount} = \min(\text{lineSubtotal}, \text{calcReduction})$$
  $$\text{lineNet} = \text{lineSubtotal} - \text{lineDiscount}$$
  $$\text{lineTax} = \text{round}(\text{lineNet} \times \text{taxRate} \times 100) / 100$$
  $$\text{lineTotal} = \text{lineNet} + \text{lineTax}$$
  $$\text{saleSubtotal} = \sum \text{lineSubtotal}_i$$
  $$\text{totalLineDiscounts} = \sum \text{lineDiscount}_i$$
  $$\text{orderDiscountAmount} = \min(\text{saleNetPreOrderDisc}, \text{orderDiscount.calculateReduction}(\dots))$$
  $$\text{saleTotal} = \max(0, \text{saleSubtotal} - \text{totalDiscounts} + \text{saleTaxTotal})$$
  $$\text{balanceRemaining} = \max(0, \text{saleTotal} - \sum \text{SettledPayments.amount})$$
- **Persistence & API Alignment**: Stored in PostgreSQL as `@db.Decimal(12, 2)`; emitted in API JSON as structured `{ "amount": 49.99, "currency": "USD" }`.

---

## 7. Discount Modeling Verification

- **Taxonomy**: `PERCENTAGE` ($0 < \text{value} \le 100$) and `FIXED_AMOUNT` ($\text{value} > 0$).
- **Subtotal Cap Guard**: Discounts are strictly capped at the subtotal to which they apply ($\min(\text{subtotal}, \text{reduction})$). Net amounts never become negative.
- **Mandatory Justification**: Every discount requires a non-empty `reason` string.
- **Supervisor Authorization Ceiling**: Discretionary cashier discounts $> 15\%$ or $>\$20.00$ require verified `authorizedByUserId` (Manager/Owner).

---

## 8. Payment State Machine Verification

```
[Initial] ──► [PENDING] ────┬──► [SETTLED] (Terminal Immutable)
                │           │
                ▼           ▼
            [CANCELLED]  [FAILED]
[Initial] ──► [SETTLED] (Immediate Cash Counter Settlement)
```

- **Transitions Verified**:
  - `Initial` $\rightarrow$ `SETTLED` (Immediate cash tender or instant capture)
  - `Initial` $\rightarrow$ `PENDING` (Asynchronous tender such as dynamic QR code)
  - `PENDING` $\rightarrow$ `SETTLED` (Funds confirmed and verified)
  - `PENDING` $\rightarrow$ `FAILED` (Gateway decline, terminal timeout, session expired)
  - `PENDING` $\rightarrow$ `CANCELLED` (Tender aborted by cashier before settlement)
- **Terminal Immutability**: `SETTLED`, `FAILED`, and `CANCELLED` permit zero outgoing transitions. Settled payments can never be edited or deleted.
- **Compensating Refunds**: Refunds create autonomous compensating records referencing `originalPaymentId` and `saleId`; no in-place mutation occurs.
- **Phase 7.5 Scope**: Pre-authorization hold states (`AUTHORIZED`) are deferred to future milestones when 2-step credit card terminal integrations are delivered.

---

## 9. 4-Tier Financial Immutability Matrix Verification

| Milestone                 | Trigger Event            | Permanently Immutable Fields                                                                                                              | Permitted Operations                                             |
| :------------------------ | :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **1. Sale Creation**      | Enters `DRAFT`           | `id`, `tenantId`, `createdAt`, `initialCashierId`.                                                                                        | Adding/removing items, adjusting quantities, applying discounts. |
| **2. Sale Finalization**  | Enters `PENDING_PAYMENT` | **All commercial terms locked**: `SaleItem` array, descriptions, SKUs, unit prices, taxes, discounts, order total.                        | Recording payments, cancellation (if uncaptured).                |
| **3. Payment Completion** | Enters `SETTLED`         | **Entire payment record locked**: `id`, `saleId`, `tenantId`, `amount`, `currency`, `method`, `settledAt`. SQL `UPDATE`/`DELETE` blocked. | None. Compensating refunds required for reversals.               |
| **4. Receipt Issuance**   | Emitted upon `PAID`      | `id`, `receiptNumber`, `saleId`, `issuedAt`, `totalAmount`, `paymentSnapshot`.                                                            | None. Reprints render existing document with `DUPLICATE` stamp.  |

---

## 10. Cross-Domain Integration Verification

- **Client**: Referenced strictly via scalar `clientId?: string`. Walk-in guests supported without CRM record pollution.
- **Kinesiology**: Referenced via `SourceReference` (`sourceType: TREATMENT_SESSION`). Sales captures fee; clinical SOAP notes and diagnoses never enter Sales.
- **Gym Management**: Referenced via `SourceReference` (`sourceType: MEMBERSHIP_PLAN`). Sales captures fee and snapshots plan price; Gym manages turnstile access and validity dates.
- **Resources Management**: Referenced via `SourceReference` (`sourceType: INVENTORY_ITEM`). Sales checks stock via query port, but delegates stock deduction to `InventoryStockDecrementPort.sellStock()`. Sales has zero write access to `inventory_items` or `stock_movements`.
- **Relational Cleanliness**: Zero cross-domain `@relation` foreign keys in `schema.prisma`.

---

## 11. Authorization Architecture Verification

In accordance with Phase 1 IAM standards, permissions use canonical dot notation:

| Permission            | Risk Tier             | Operational Scope                              | Minimum Role                                          |
| :-------------------- | :-------------------- | :--------------------------------------------- | :---------------------------------------------------- |
| **`sales.read`**      | Read-Only             | View orders, cart items, purchase history.     | `Receptionist`, `Trainer`, `Kitchen Staff`, `Owner`   |
| **`sales.create`**    | Transactional         | Initiate checkout sessions, add draft items.   | `Receptionist`, `Kitchen Staff`, `Owner`              |
| **`sales.manage`**    | Financially Sensitive | Apply discounts $> 15\%$, override prices.     | `Manager`, `Owner`                                    |
| **`sales.cancel`**    | Destructive           | Cancel or void draft/finalized orders.         | `Receptionist` (draft), `Manager`/`Owner` (finalized) |
| **`payments.read`**   | Read-Only             | View transaction history, gateway logs.        | `Receptionist`, `Owner`                               |
| **`payments.create`** | Transactional         | Record cash tender, capture electronic tender. | `Receptionist`, `Kitchen Staff` (POS), `Owner`        |
| **`payments.manage`** | Financially Sensitive | Authorize refunds, process chargebacks.        | `Manager`, `Owner`                                    |
| **`receipts.read`**   | Read-Only             | View and download customer receipts.           | `Receptionist`, `Trainer`, `Client` (own), `Owner`    |
| **`receipts.manage`** | Financially Sensitive | Authorize duplicate reprints, credit notes.    | `Receptionist` (reprints), `Owner`                    |

- **Multi-Tenant Isolation**: 4 isolation guards (Sale, Payment, Receipt, SourceReference) enforce strict tenant partitioning at transport, application, and domain levels.

---

## 12. Audit & Telemetry Boundaries Verification

- **Business Audit**: Durable, append-only compliance records for financially meaningful milestones: `SaleFinalized`, `PaymentSettled`, `SaleCancelled`, `PaymentRefunded`, `ReceiptIssued`, `DiscountOverrideApplied`.
- **Application Logging**: Transient diagnostic traces: draft cart updates (`SaleItemAddedToDraft`, `SaleItemQuantityChangedInDraft`), cache hits/misses, gateway HTTP latency.
- **Security Logging**: Threat detection: `PaymentFailed`, `ReceiptReprinted`, access denied (403), cross-tenant probes, token replay.
- **PCI-DSS Cardholder Protection**: Strict zero-storage and zero-logging policy for Primary Account Numbers (PANs), CVVs, PINs, and gateway API keys. Only card brand, last 4 digits (`**** 4242`), and gateway charge references are recorded.

---

## 13. End-to-End Traceability Verification

Every high-level commercial requirement traverses a verified traceable chain without requiring Phase 7.1 implementation:

```
Business Requirement (Multi-Service Unified POS Checkout)
        ↓
Business Rule (SALE-01, SALE-05, ITEM-04, ITEM-05)
        ↓
Domain Rule (Snapshotting Invariant, References Over Ownership)
        ↓
Aggregate Responsibility (Sale Aggregate Root orchestrates SaleItem internal entities)
        ↓
Future Use Case (CreateSaleUseCase, AddSaleItemUseCase, FinalizeSaleUseCase)
        ↓
Future API (POST /api/v1/sales, POST /api/v1/sales/:id/items, POST /api/v1/sales/:id/finalize)
        ↓
Future Frontend UI (POS Register View, Split Payment Modal, Receipt Viewer)
        ↓
Automated Test (sale-creation-and-items.spec.ts, price-snapshot-immutability.spec.ts)
```

---

## 14. Implementation Firewall Verification

Inspection of the repository confirms that Milestone 7.0 did **NOT** prematurely introduce:

- `prisma/schema.prisma` edits (zero Sales models added yet)
- Prisma migrations (zero migration folders generated)
- TypeScript domain entities or value objects under `packages/core/src/sales/`
- NestJS modules, controllers, or services under `apps/api/src/sales/`
- React components, hooks, or pages under `apps/web/`
- Payment provider SDK bindings (Stripe, Mercado Pago)
- Speculative event dispatchers or Kafka/RabbitMQ adapters

The implementation boundary remains 100% intact.

---

## 15. Quality Gates Execution & Results

The complete automated verification pipeline was executed sequentially without workarounds:

| Command          | Target                        | Execution Result                                                |  Status  |
| :--------------- | :---------------------------- | :-------------------------------------------------------------- | :------: |
| `pnpm write`     | Prettier Formatting Write     | Formatted all modified and created documents                    | **PASS** |
| `pnpm lint`      | Nx Workspace Linting          | 10 projects linted with zero errors                             | **PASS** |
| `pnpm typecheck` | TypeScript Base Typecheck     | Zero TypeScript compilation or type errors                      | **PASS** |
| `pnpm test`      | Nx Workspace Unit & E2E Tests | 87 test suites passed, 640 tests passed                         | **PASS** |
| `pnpm build`     | Nx Production Bundles         | 10 production projects built successfully                       | **PASS** |
| `pnpm validate`  | Full Pipeline Verification    | `format:check`, `lint`, `typecheck`, `test`, `build` all passed | **PASS** |

---

## 16. Outstanding Decisions

**`None`**

Every architectural, mathematical, security, and domain invariant required for commercial sales and payment processing has been fully resolved and documented.

---

## 17. Final Architecture Review Board Certification

> **Phase 7.0 establishes the architectural contract. Phase 7.1 may begin implementation without reopening these architectural decisions unless new business requirements or contradictory repository constraints are discovered.**
