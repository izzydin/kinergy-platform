# ADR-0134: Financial Settlement Validation, Multi-Tender Boundaries & Overpayment Invariants

- **Status**: **ACCEPTED**
- **Date**: 2026-10-07
- **Author**: Senior Financial Domain Architect
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.12). The platform requires an authoritative and unambiguous specification of what `payment.amount → valid amount` means across the pure Domain layer, Application Orchestration layer, and Relational Persistence boundary. Specifically, this decision formalizes the commercial settlement matrix across single tenders, partial payments, split tenders, customer deposits, overpayments, and completion boundaries.

---

## 1. Executive Summary & Problem Statement

Monetary processing in healthcare, physiotherapy, and fitness facilities presents diverse tender patterns:

1. A client pays the full balance of a retail product immediately in cash.
2. A patient books a 10-session kinesiology treatment plan and leaves a **partial deposit** (e.g. \$150.00 of \$500.00), deferring the remaining \$350.00 until treatment milestones.
3. A client settles a single high-ticket wellness package using **split tender** (\$200.00 CASH + \$100.00 dynamic QR).
4. An operator accidentally enters an amount exceeding the remaining debt.

Without an explicit architectural contract, systems suffer from:

- Confusion between **intrinsic tender invariants** (owned by `Payment`) and **extrinsic debt invariants** (owned by `Sale` coordination).
- Floating-point rounding discrepancies causing fractional penny drift.
- Ambiguity regarding whether multiple completed payments are permitted per sale order.

This ADR authoritatively defines the financial rules of `payment.amount` in Kinergy.

---

## 2. Definitive Answers to the 7 Financial Architecture Questions

Based on [ADR-0108](0108-money-representation.md), [ADR-0109](0109-payment-lifecycle.md), [ADR-0114](0114-canonical-monetary-policy-and-sale-totals.md), [ADR-0115](0115-payment-domain-canonical-architecture.md), [ADR-0116](0116-payment-state-machine-and-lifecycle-specification.md), [ADR-0119](0119-sale-aggregate-boundary-and-invariants.md), and [ADR-0133](0133-payment-application-layer-architecture.md):

| #     | Architectural Question                 | System Support | Authoritative Decision & Rule                                                                                                                                                                                                                                                                                                                                                                          |
| :---- | :------------------------------------- | :------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Payment amount == Sale total only?** |     **NO**     | Kinergy does **NOT** require an individual payment amount to equal the `Sale.total`. A payment amount may be less than the total, enabling multi-tender and incremental payment workflows.                                                                                                                                                                                                             |
| **2** | **Payment amount <= Sale total?**      |    **YES**     | An individual payment amount must satisfy $\text{payment.amount} \le \text{remainingBalance} \le \text{Sale.total}$. A payment can never exceed the remaining unpaid balance of the referenced `Sale`.                                                                                                                                                                                                 |
| **3** | **Partial payments?**                  |    **YES**     | Partial payments are **fully supported**. When a completed tender is less than the remaining balance ($0 < \text{amount} < \text{remainingBalance}$), the `Sale` transitions from `PENDING_PAYMENT` to `PARTIALLY_PAID` via `sale.markPartiallyPaid(clock)`.                                                                                                                                           |
| **4** | **Multiple payments?**                 |    **YES**     | A `Sale` supports a 1-to-many relationship ($1 \text{ Sale} \to N \text{ Payments}$). Split tenders (e.g. CASH + QR) and progressive milestone settlements are standard operations.                                                                                                                                                                                                                    |
| **5** | **Overpayments?**                      |     **NO**     | Overpayment ($\text{amount} > \text{remainingBalance}$) is **strictly prohibited**. Attempting to record or complete a payment exceeding the unpaid balance throws [`PaymentOverpaymentException`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/exceptions/payment-overpayment.exception.ts). No unallocated credit or uncaptured excess is accepted on a commercial sale. |
| **6** | **Deposits?**                          |    **YES**     | Deposits are supported as initial partial payments against finalized commercial sales. The deposit tender transitions the sale to `PARTIALLY_PAID`, and subsequent payments clear the remaining obligation.                                                                                                                                                                                            |
| **7** | **One completed Payment per Sale?**    |     **NO**     | A `Sale` may receive **multiple `COMPLETED` payments** over its lifecycle until $\sum \text{SettledPayments} = \text{Sale.total}$. Once fully cleared, the sale transitions to `PAID` via `sale.markPaid(clock)`.                                                                                                                                                                                      |

---

## 3. Strict Layering & Separation of Concerns

To guarantee DDD aggregate autonomy and prevent logic duplication, financial validation is bifurcated across boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PAYMENT DOMAIN BOUNDARY (INTRINSIC)                  │
│                                                                        │
│   Payment Aggregate Root & Money VO Authoritatively Enforce:           │
│   • amount instanceof Money                                            │
│   • amount.cents > 0 (strictly positive; zero and negative rejected)  │
│   • scale == 2 (exact decimal scale; fractional cents rejected)       │
│   • currency is valid ISO 4217 code                                    │
│                                                                        │
│   Payment does NOT know Sale.total or sibling Payment records.         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              APPLICATION ORCHESTRATION BOUNDARY (EXTRINSIC)            │
│                                                                        │
│   CreatePaymentHandler & CompletePaymentHandler Authoritatively:      │
│   • Loads referenced Sale via SaleRepositoryPort                       │
│   • Verifies currency homogeneity (payment.currency == sale.currency)  │
│   • Verifies Sale is payable (PENDING_PAYMENT or PARTIALLY_PAID)       │
│   • Computes settled total from sibling payments via PaymentRepository │
│   • Enforces debt cap: payment.amount <= remainingBalance              │
│   • Coordinates Sale lifecycle: markPartiallyPaid() or markPaid()      │
│                                                                        │
│   All balance arithmetic uses canonical Money VO (zero floats).        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 What `payment.amount → valid amount` Means in Payment Domain

In the pure [`Payment`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/payment.aggregate.ts) aggregate root:

- The amount is strictly an instance of canonical [`Money`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/money.vo.ts).
- $\text{amount.cents} > 0$ (must be strictly greater than zero).
- Fractional currency units are forbidden (enforced by `Money.create` integer arithmetic).
- The `Payment` aggregate root **must never reference or validate against `Sale.total`**. In hexagonal architecture, aggregates communicate via scalar identifiers (`saleId: SaleId`), maintaining isolated aggregate consistency boundaries.

### 3.2 What `payment.amount → valid amount` Means in Application Layer

In [`CreatePaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/create-payment.handler.ts) and [`CompletePaymentHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/application/handlers/complete-payment.handler.ts):

- **Currency Match**: $\text{payment.currency} = \text{sale.currency}$.
- **Balance Calculation**:
  $$\text{SettledTotal} = \sum_{p \in \text{CompletedPayments}} p.\text{amount}$$
  $$\text{RemainingBalance} = \text{sale.total}.\text{subtract}(\text{SettledTotal})$$
- **Overpayment Guard**:
  $$\text{payment.amount}.\text{greaterThan}(\text{RemainingBalance}) \implies \text{Throw } \text{PaymentOverpaymentException}$$
- **Lifecycle Advancement**:
  - If $\text{SettledTotal} + \text{payment.amount} \ge \text{sale.total} \implies \text{sale.markPaid(clock)}$.
  - If $\text{SettledTotal} + \text{payment.amount} < \text{sale.total} \land \text{sale.status} = \text{PENDING\_PAYMENT} \implies \text{sale.markPartiallyPaid(clock)}$.

---

## 4. Prohibition of Floating-Point Calculations

In accordance with [ADR-0108](0108-money-representation.md) and [ADR-0114](0114-canonical-monetary-policy-and-sale-totals.md):

- JavaScript `number` arithmetic (`+`, `-`, `*`, `/`) is **strictly prohibited** for financial balance and settlement calculations.
- All monetary operations utilize `Money.add()`, `Money.subtract()`, `Money.greaterThan()`, and `Money.greaterThanOrEqual()`.
- Financial fields persist to PostgreSQL as `DECIMAL(12, 2)` through Prisma repositories, guaranteeing integer-cent fidelity from HTTP request to database disk.

---

## 5. Consequences & Invariant Guarantees

1. **Deterministic Debt Discharge**: A sale can never be overpaid. Commercial obligations are discharged precisely to zero.
2. **Flexible Real-World POS**: Receptionists and cashiers can seamlessly accept partial deposits, split payments across physical cash and digital QR, and reconcile patient accounts incrementally.
3. **Domain Integrity**: Aggregate consistency boundaries remain unviolated; `Payment` does not bleed into `Sale`, and `Sale` does not contain collections of `Payment`.
4. **Complete Traceability**: Every tender creates an autonomous, immutable `Payment` record with OCC concurrency versioning and event telemetry.
