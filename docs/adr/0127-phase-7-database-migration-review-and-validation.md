# 0127. Phase 7 Database Migration Review, Data Compatibility, and Verification

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: Senior Database Migration Engineer, Principal Database Architect, Lead Financial Systems Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.10: Migration Review & Data Compatibility). Following the completion of Milestone 7.10 (transaction boundaries, index strategy, uniqueness audit, and hexagonal repository reconciliation), we must perform a formal database migration engineering review of all Phase 7 migrations (`20260918000000` through `20261002000000`).
- **Consulted ADRs**:
  - [ADR-0011: Prisma ORM Persistence Infrastructure Setup](0011-prisma-orm-persistence-infrastructure.md)
  - [ADR-0108: Money Representation](0108-money-representation.md)
  - [ADR-0109: Payment Lifecycle](0109-payment-lifecycle.md)
  - [ADR-0110: Sale Ownership](0110-sale-ownership.md)
  - [ADR-0113: Item-Level Discounts](0113-item-level-discounts.md)
  - [ADR-0114: Canonical Monetary Policy and Sale Totals](0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0115: Payment Domain Canonical Architecture](0115-payment-domain-canonical-architecture.md)
  - [ADR-0116: Payment State Machine and Lifecycle Specification](0116-payment-state-machine-and-lifecycle-specification.md)
  - [ADR-0117: Receipt Domain Boundary and Document Model](0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0120: Commercial Transaction Uniqueness and Sale Idempotency](0120-commercial-transaction-uniqueness-and-sale-idempotency.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](0121-sale-source-references-and-commercial-origin-model.md)
  - [ADR-0122: Phase 7 Financial Persistence Architecture](0122-phase-7-financial-persistence-architecture.md)
  - [ADR-0123: Phase 7 Financial Model Database Index Strategy](0123-phase-7-financial-database-index-strategy.md)
  - [ADR-0124: Phase 7 Financial Models Uniqueness Audit](0124-phase-7-financial-models-uniqueness-audit.md)
  - [ADR-0125: Phase 7 Transaction Architecture and Atomic Boundaries](0125-phase-7-transaction-architecture-and-atomic-boundaries.md)
  - [ADR-0126: Phase 7 Hexagonal Architecture Repository Reconciliation](0126-phase-7-hexagonal-architecture-repository-reconciliation.md)

---

## 1. Context and Problem Statement

Database migrations in financial domains represent irreversible operational risk if executed without thorough inspection. A migration that:

- silently defaults unknown money values to `0.00`,
- fabricates synthetic source references or payment statuses,
- applies blanket unique constraints that lock retail checkout or membership renewals, or
- truncates decimal precision from minor units,
  will corrupt financial audit trails and cause production outages.

This ADR records the audit of every Phase 7 migration against strict zero-fabrication, backward compatibility, and relational integrity standards.

---

## 2. Phase 7 Migration Inventory & Audit Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 7 MIGRATION AUDIT INVENTORY                               │
├────────────────────────┬─────────────────────────────────────────────┬─────────────────┤
│ MIGRATION ID           │ PURPOSE / SCOPE                             │ AUDIT VERDICT   │
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20260918000000         │ Initial sales & sale_items tables,          │ PASSED (Clean   │
│                        │ DECIMAL(12,2), SaleStatus enum, FKs         │ Green-field DDL)│
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20260921000000         │ payments table, PaymentMethod,              │ PASSED (Clean   │
│                        │ PaymentStatus enum, RESTRICT FK on sales    │ Relational DDL) │
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20260924000000         │ receipts & receipt_sequences tables,        │ PASSED (Clean   │
│                        │ JSONB snapshots, unique tenant voucher keys │ Snapshot DDL)   │
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20260930000000         │ SaleSource correlation indexes on           │ PASSED (Non-    │
│                        │ sales and sale_items                        │ blocking B-tree)│
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20261001000000         │ Non-negative & positive CHECK constraints   │ PASSED (Existing│
│                        │ on sales, sale_items, payments, receipts    │ data compatible)│
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20261001010000         │ Discount structural CHECK constraints       │ PASSED (Handles │
│                        │ (supported type, max 100%, co-presence)     │ NULL co-presence│
├────────────────────────┼─────────────────────────────────────────────┼─────────────────┤
│ 20261002000000         │ Index optimization: drops redundant single- │ PASSED (DROP IF │
│                        │ column indexes, adds compound with sort     │ EXISTS safe)    │
└────────────────────────┴─────────────────────────────────────────────┴─────────────────┘
```

---

## 3. Detailed Migration Engineering Findings

### 3.1 Zero-Fabrication Financial Values Policy

- **Audit Mandate**: Never invent default financial values. Never silently convert unknown historical money values.
- **Verification**:
  - `sales.subtotal_amount`, `sales.total_amount`, `sale_items.unit_price_amount`, `sale_items.total_amount`, and `payments.amount` are defined as `NOT NULL` without default clauses.
  - Column defaults are applied strictly to operational lifecycle flags: `status DEFAULT 'DRAFT'`, `version DEFAULT 1`, `created_at DEFAULT CURRENT_TIMESTAMP`, `reprint_count DEFAULT 0`, `current_value DEFAULT 0`.
  - No synthetic `$0.00` filler is injected by migrations. All monetary inputs must originate from authorized domain commands.

### 3.2 Existing-Data Compatibility & Remediations

- **CHECK Constraints (`20261001000000` & `20261001010000`)**:
  - `chk_sales_non_negative_subtotal`: Validates `subtotal_amount >= 0.00`.
  - `chk_payments_positive_amount`: Validates `amount > 0.00`.
  - `chk_sales_discount_co_presence`: Enforces `(type IS NULL AND value IS NULL) OR (type IS NOT NULL AND value IS NOT NULL)`.
  - **Compatibility Assessment**: All existing production-like test and seed records comply with these invariants. No orphan discount values or negative payment rows exist.
  - **Remediation Policy**: If legacy rows in future environments contain invalid states, they must **never** be silently deleted or overwritten with fabricated values. Legacy records must be flagged via an audit remediation script with explicit business supervisor sign-off before applying constraints.

### 3.3 Safe Uniqueness & PostgreSQL NULL Semantics

- **Audit Mandate**: Do not introduce accidental uniqueness that prevents legitimate business behavior.
- **Verification**:
  - `receipts(tenant_id, sale_id)` and `receipts(tenant_id, receipt_number)` are strictly enforced unique keys. Both fields are `NOT NULL`, eliminating SQL `NULLS DISTINCT` ambiguity.
  - Blanket database uniqueness on `sales(source_type, source_id)` was **intentionally rejected** (ADR-0124) because it would fatally block:
    1. Multiple sales of the same retail item (`FOOD`, `DRINK`).
    2. Multiple athlete enrollments in the same `GYM_MEMBERSHIP` plan.
    3. Recurring hourly turnover of a `ROOM_RENTAL` facility.
    4. Legitimate re-billing following an agreement cancellation (`status = CANCELLED`).
  - Single-billing invariant `SALE-010` for clinical kinesiology sessions is enforced via atomic transactional pre-checks in `PrismaSaleRepository.save()`.

### 3.4 Decimal Precision Standardization

- All currency columns use standard PostgreSQL `DECIMAL(12, 2)`:
  - Range: up to `±999,999,999.99` (nearly 1 billion units), matching maximum commercial volume.
  - Scale: fixed 2 decimal places matching ISO 4217 minor units (cents).
- Physical quantity on line items uses PostgreSQL `DECIMAL(10, 3)`:
  - Supports fractional metrics (e.g. `2.500` hours or `0.333` kg) with exact precision.
- No float/double IEEE-754 approximations exist in any migration DDL.

### 3.5 Idempotency and Forward Migration Safety

- Index optimization (`20261002000000`) utilizes `DROP INDEX IF EXISTS` prior to creating compound indexes. This prevents migration failures during zero-downtime blue/green rollouts or re-entrant deployments.
- Foreign keys utilize `ON DELETE RESTRICT` for financial and fiscal records (`payments.sale_id`, `receipts.sale_id`), guaranteeing that parent commercial transactions cannot be deleted while payments or legal proof-of-purchase vouchers exist.

---

## 4. Verification Workflow

1. `prisma validate`: Confirmed schema is 100% syntactically valid against all migration definitions.
2. `prisma generate`: Verified Prisma Client (v6.19.3) code generation without warnings or broken model typings.
3. Automated Integration Tests: Full database constraints, index usage, uniqueness semantics, and mapping roundtrip suites execute without regression.

---

## 5. Consequences

### Positive

- Every migration is provably non-destructive, non-fabricating, and compatible with historical financial data.
- Relational integrity is enforced at the database layer (CHECK constraints, foreign keys, compound indexes) without placing excessive constraints that destroy legitimate retail, gym, or rental business.
- Verified compliant with the project's migration deployment workflow.
