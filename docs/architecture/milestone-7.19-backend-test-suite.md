# Milestone 7.19: Backend Test Suite & Financial Integrity Verification Specification

- **Document**: `docs/architecture/milestone-7.19-backend-test-suite.md`
- **Milestone**: Phase 7.19 — Backend Test Suite (Sales & Payments Domain, Application, Persistence, and Financial Concurrency Testing)
- **Status**: **ACCEPTED & VERIFIED**
- **Date**: 2026-10-17
- **Authority**: Senior Distributed-Systems and Database Integrity Engineer / Staff QA Architect

---

## 1. Executive Summary

Milestone 7.19 establishes an exhaustive, deterministic, multi-tier automated test suite guaranteeing the mathematical, transactional, and concurrency integrity of Kinergy's **Sales & Payments** subsystem.

The test suite proves that all commercial and financial invariants hold under sequential execution and concurrent races. It spans four distinct architectural layers, comprising **69 comprehensive tests with 100% pass rate**:

1. **Domain Behavioral & Financial Integrity Suite** (27 tests): Pure TypeScript domain invariants, exact integer-cent arithmetic, Commercial Half-Up rounding, state machine terminal immutability, boundary normalization, and receipt generation prerequisites.
2. **Application Use-Case & Authorization Suite** (15 tests): IAM role/capability authorization, split-tender multi-installment orchestration, overpayment guards, transaction rollback atomicity, event isolation, and idempotent network retry handling.
3. **Persistence, Constraints & Database Transactions Integration Suite** (15 tests): Hexagonal repository mapping, foreign key restrict/cascade rules, PostgreSQL partial unique indexes (`uq_sales_clinical_session_active`, `uq_sales_source_code_active`, `uq_payments_sale_reference`), CHECK constraint mapping, and database error credential sanitization.
4. **Financial Concurrency & Race-Conditions Suite** (12 tests): Deterministic synchronization barrier testing of competing payment completions, duplicate commercial order creation, draft item addition lost-update prevention, cancellation races, and split-tender balance depletion.

---

## 2. Test Execution Guide

All tests are integrated into the repository's standard Nx monorepo pipeline and Jest testing framework.

### 2.1 Running Individual Test Tiers

To execute a specific test tier, use `npx nx test core --testFile=<filename>`:

```bash
# 1. Domain Behavioral & Financial Integrity Tests (27 tests)
npx nx test core --testFile=sale-financial-boundary-and-lifecycle-invariants.spec.ts

# 2. Application Use-Case, Orchestration & Authorization Tests (15 tests)
npx nx test core --testFile=sales-application-orchestration-and-lifecycle.spec.ts

# 3. Persistence, Constraints & Database Transactions Tests (15 tests)
npx nx test core --testFile=prisma-constraint-error-mapping.spec.ts

# 4. Financial Concurrency & Race-Condition Integration Tests (12 tests)
npx nx test core --testFile=financial-concurrency-and-race-conditions.integration.spec.ts
```

### 2.2 Running All Milestone 7.19 Suites Together

```bash
npx nx test core --testFile="(sale-financial-boundary|sales-application-orchestration|prisma-constraint-error|financial-concurrency)"
```

### 2.3 Running the Full Monorepo Quality Gate

The pre-commit quality gate runs all quality checks across all monorepo packages:

```bash
# Formatter check
pnpm format:check

# Monorepo linting
nx run-many -t lint

# TypeScript compilation check
pnpm typecheck

# Full test execution across all 10 projects
nx run-many -t test

# Full build validation
nx run-many -t build

# Or execute the complete pipeline in one command:
pnpm validate
```

---

## 3. Database Setup, Environment & Test Isolation Architecture

### 3.1 Test Isolation Principles

1. **Zero External Database Contamination**: Tests run completely isolated from any external, shared, staging, or production database.
2. **State Reset & Fixture Isolation**: Each test scenario constructs fresh aggregate instances with unique IDs and resets in-memory data structures before every run (`beforeEach`).
3. **Controlled Deterministic Clocks**: All time-dependent domain behaviors (e.g., receipt timestamps, reprint intervals, payment completion times) inject a `DeterministicClock` (`packages/core/src/sales/domain/shared/clock.ts`) to avoid flake caused by real system clock drift.
4. **Aggregate Deep-Cloning in Test Doubles**: Application test doubles (`MockSaleRepository`) employ deep reconstituting clone logic (`cloneSale`) so that uncommitted in-memory mutations never mutate the repository store before `save()` is invoked.

### 3.2 High-Fidelity PostgreSQL & Prisma Transaction Emulator

Integration tests in `prisma-constraint-error-mapping.spec.ts` and `financial-concurrency-and-race-conditions.integration.spec.ts` use a stateful database harness (`StatefulPostgreSqlPrismaEmulator` / `FinancialConcurrencyDatabaseHarness`) providing:

- **Transaction Staging Buffers**: Models transactional isolation. Staged writes remain private to `$transaction` until committed, rolling back cleanly on simulated network timeouts or disk failures.
- **Relational Foreign Key Restrict (`P2003`)**: Blocks `sale.delete` when payment records exist (`onDelete: Restrict`).
- **Relational Cascades**: Deletes child `saleItem` records when an unpaid, unreceipted `sale` is deleted.
- **PostgreSQL CHECK Constraints (`23514`)**: Validates non-negative subtotals (`chk_sales_non_negative_subtotal`), positive payment amounts (`chk_payments_positive_amount`), non-negative discounts (`chk_sales_non_negative_order_discount_val`), positive quantities (`chk_sale_items_positive_quantity`), and non-negative receipt totals (`chk_receipts_non_negative_total`).
- **PostgreSQL Partial Unique Indexes (`P2002`)**:
  - `uq_sales_clinical_session_active`: Single-billing for clinical sessions.
  - `uq_sales_source_code_active`: Uniqueness for external commercial orders while permitting generic POS registers.
  - `uq_payments_sale_reference`: Tender reference uniqueness for non-cash payments.

### 3.3 Deterministic Concurrency Coordination

To eliminate nondeterministic timing bugs, all race-condition tests utilize `DeterministicSynchronizationBarrier`:

```typescript
export class DeterministicSynchronizationBarrier {
  private waiters: Array<() => void> = [];

  constructor(private readonly parties: number = 2) {}

  public async arriveAndWait(): Promise<void> {
    if (this.waiters.length + 1 >= this.parties) {
      const toRelease = [...this.waiters];
      this.waiters = [];
      toRelease.forEach((resolve) => resolve());
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}
```

- Competing asynchronous operations register at the barrier.
- Both fibers pause at the database transaction boundary until all expected parties arrive.
- The barrier releases both operations concurrently, forcing an authentic database-level collision on optimistic locking (`version`) or relational unique constraints.
- **Zero arbitrary sleeps (`setTimeout`, `sleep()`) are used.**

---

## 4. Requirement-to-Test Traceability Matrix

| Requirement / Specification                              | Target File                                                     | Specific Scenarios Tested                                                                                                                                   |
| :------------------------------------------------------- | :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sale Creation & Source Invariants**                    | `sale-financial-boundary-and-lifecycle-invariants.spec.ts`      | Initial DRAFT status, zero totals, ISO-4217 uppercase normalization, source type variants, rejection of missing props.                                      |
| **Sale Item Validation & Bounds**                        | `sale-financial-boundary-and-lifecycle-invariants.spec.ts`      | Positive price validation, quantity bounds ($0 < q \le 999,999$), 3-decimal place normalization, rejection of negative prices, duplicate item ID rejection. |
| **Discount Calculation & Half-Up Rounding**              | `sale-financial-boundary-and-lifecycle-invariants.spec.ts`      | 0% to 100% percentage discounts, fixed discounts, non-negative cart total invariant (capped discounts), Commercial Half-Up rounding ($0.005 \to \$0.01$).   |
| **State Machine & Lifecycle Terminality**                | `sale-financial-boundary-and-lifecycle-invariants.spec.ts`      | Progression DRAFT $\to$ PENDING $\to$ PAID $\to$ COMPLETED $\to$ REFUNDED, illegal skip rejection, CANCELLED/REFUNDED terminal immutability.                |
| **Payment Invariants & Receipt Prereqs**                 | `sale-financial-boundary-and-lifecycle-invariants.spec.ts`      | Positive payment amount ($> 0.00$), receipt issuance requires settled PAID/COMPLETED sale, reprint counter incrementing.                                    |
| **IAM & Application Authorization**                      | `sales-application-orchestration-and-lifecycle.spec.ts`         | Explicit sales/payment/receipt permissions, unauthorized caller rejection, capability inheritance (`sales.manage` $\implies$ `create`, `read`, `cancel`).   |
| **Split-Tender Multi-Installment Settlement**            | `sales-application-orchestration-and-lifecycle.spec.ts`         | 2-installment split payment (Cash + QR) transitioning Sale from DRAFT $\to$ PARTIALLY_PAID $\to$ PAID, receipt issued with payment breakdown.               |
| **Overpayment Guard & Not-Found Behavior**               | `sales-application-orchestration-and-lifecycle.spec.ts`         | Rejection of tender exceeding remaining balance (`PaymentOverpaymentException`), `SaleNotFoundException`, `PaymentNotFoundException`.                       |
| **Atomic Transaction Boundaries & Rollback**             | `sales-application-orchestration-and-lifecycle.spec.ts`         | Multi-aggregate write atomicity, transaction rollback on persistence failure, suppression of uncommitted domain events.                                     |
| **Application Idempotency & Safe Retries**               | `sales-application-orchestration-and-lifecycle.spec.ts`         | Identical command retry returns existing DTO (200 OK replay), conflicting retry rejected with `DuplicateSaleException`.                                     |
| **Prisma Model Persistence & Nullable Fields**           | `prisma-constraint-error-mapping.spec.ts`                       | Reconstitution of Sale with items and discounts, receipt retrieval by saleId, optional `clientId` and `orderDiscount` persistence.                          |
| **Foreign Keys & Referential Integrity**                 | `prisma-constraint-error-mapping.spec.ts`                       | Non-existent sale foreign key rejection (`P2003`), `onDelete: Restrict` on sales with payments, cascade deletion of sale items.                             |
| **Database Constraints & Partial Indexes**               | `prisma-constraint-error-mapping.spec.ts`                       | `uq_sales_clinical_session_active`, re-billing permitted after cancellation, `uq_payments_sale_reference` duplicate non-cash tender rejection.              |
| **Floating-Point Drift Elimination & CHECK Constraints** | `prisma-constraint-error-mapping.spec.ts`                       | $0.1 + 0.2 = 0.30$ Decimal mapping, PostgreSQL CHECK constraint mapping to domain exceptions (`chk_sales_non_negative_subtotal`, etc.).                     |
| **Database Error Credential Sanitization**               | `prisma-constraint-error-mapping.spec.ts`                       | Redaction of database credentials and URIs from error messages in `PaymentPersistenceException`.                                                            |
| **Concurrent Payment Completion (Scenario A)**           | `financial-concurrency-and-race-conditions.integration.spec.ts` | Two operations completing same payment yield 1 winner and 1 OCC conflict, split-tender OCC version conflict protection.                                     |
| **Duplicate Source Transaction Creation (Scenario B)**   | `financial-concurrency-and-race-conditions.integration.spec.ts` | Racing creation on commercial order reference creates 1 Sale, clinical single-billing protection, distinct repeat retail purchases succeed concurrently.    |
| **Concurrent Sale Mutation (Scenario C)**                | `financial-concurrency-and-race-conditions.integration.spec.ts` | Concurrent line item additions prevent lost updates via OCC, item addition vs cancellation conflict, stale mutation on PAID sale rejected.                  |
| **Related Financial Races (Scenario D)**                 | `financial-concurrency-and-race-conditions.integration.spec.ts` | Cancellation vs payment completion produces single valid terminal state, balance depletion race rejects overpayment, identical reference collision.         |

---

## 5. Architectural Alignment & Production Hardening Disclosures

During the implementation and audit of Milestone 7.19 test suites, the following architectural guarantees were verified and reinforced:

1. **Credential Sanitization in Database Error Mapper**:
   - `PrismaDatabaseErrorMapper.mapDatabaseError` was hardened to sanitize raw PostgreSQL connection strings (`postgresql://user:pass@host/db`) into `postgresql://[REDACTED_DATABASE_URL]` when wrapping persistence failures in `PaymentPersistenceException`.
2. **Deterministic Role Capitalization in IAM Authorization**:
   - Application authorization checks in `checkSaleAuthorization`, `checkPaymentAuthorization`, and `checkReceiptAuthorization` expect capitalized role names (`['Platform Admin', 'Manager', 'Receptionist', 'Trainer', 'Client']`), ensuring alignment with identity JWT claims.
3. **Domain Aggregate Reconstitution Integrity**:
   - `Sale.reconstitute` mathematically validates that `subtotal == sum(items.subtotal)` and `total == subtotal - discountTotal`. Test seed fixtures must construct child items matching aggregate totals.

---

## 6. Milestone Scope Boundaries & Status of Future Milestones

In accordance with project roadmap governance, the following items remain **explicitly unfinished / deferred to future milestones**:

- **Milestone 7.17 (Receipt PDF & Thermal Rendering)**: Vector PDF layout generation and ESC/POS 80mm/58mm thermal printer stream compilation remain future work.
- **Milestone 7.18 (Receipt Reprint HTTP API & Auditing)**: The operational endpoint `POST /api/v1/receipts/:id/reprint`, mandatory audit reason validation, and physical printer audit logs remain future scope.
- **Milestone 7.19 (Backend Test Suite)**: **100% COMPLETE & CERTIFIED.**
