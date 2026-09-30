# SaleSource Database Migration Architecture & Decision Record

**Bounded Context**: `Sales` / `Commercial Agreements`  
**Milestone**: Phase 7.9 — Persistence & Migration Architecture  
**Role**: Senior Database Migration Engineer  
**Status**: `APPROVED`  
**Date**: September 30, 2026  
**Related Documents**:

- [ADR-0121: Sale Source References and Commercial Origin Model](file:///c:/Projects/kinergy-platform/docs/adr/0121-sale-source-references-and-commercial-origin-model.md)
- [Sale Invariants Catalog](file:///c:/Projects/kinergy-platform/docs/business-rules/sale-invariants-catalog.md)
- Migration: [`prisma/migrations/20260930000000_add_sale_source_correlation_indexes/migration.sql`](file:///c:/Projects/kinergy-platform/prisma/migrations/20260930000000_add_sale_source_correlation_indexes/migration.sql)
- Target Schema: [`prisma/schema.prisma`](file:///c:/Projects/kinergy-platform/prisma/schema.prisma)

---

## 1. Executive Summary

This document specifies the database migration strategy for persisting `SaleSource` in accordance with **ADR-0121** ("References Over Ownership") and the Kinergy platform persistence standards.

The migration preserves strict relational data integrity, requires zero data backfill or fabricated reference values, guarantees backward compatibility with pre-existing sales records, and adds high-performance composite indexes for source correlation lookups.

---

## 2. Pre-Migration Schema & Data Inspection

Before formulating the migration strategy, a thorough inspection of the database schema and existing data was conducted:

| Inspection Criterion           | Findings & Status                                                                                                                | Architectural Conclusion                                                                                                                                                                                 |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing Sale Records**      | Tables `sales` and `sale_items` were created in migration `20260918000000_add_sales_and_payments_monetary_persistence`.          | Baseline persistence is already deployed; no schema recreation required.                                                                                                                                 |
| **Pre-existing Source Fields** | Columns `source_type TEXT NOT NULL`, `source_id TEXT NOT NULL`, and `source_code TEXT NULL` were established on table inception. | Relational columns already exist in both `sales` and `sale_items`.                                                                                                                                       |
| **Nullability State**          | Relational columns `source_type` and `source_id` are strictly `NOT NULL` at the database engine level.                           | Conceptual pair integrity is enforced by relational constraints: half-null states (`sourceType = FOOD, sourceId = null` or `sourceType = null, sourceId = "123"`) are physically rejected by PostgreSQL. |
| **Existing Row Compatibility** | Any historical rows already satisfy the `NOT NULL` constraint with legitimate source data assigned at transaction inception.     | Existing rows satisfy the relational schema without schema changes or column mutations.                                                                                                                  |
| **Data Fabrication Risk**      | No rows exist that lack source information.                                                                                      | **Zero need for fake references** (`UNKNOWN`, `LEGACY`, `MIGRATED`, or placeholder `FOOD`). Fake values are explicitly rejected.                                                                         |

---

## 3. Staged Migration Strategy Evaluation

Database migrations in high-availability financial systems often follow a 4-phase staged rollout:

```text
Phase 1: Introduce Nullable Column
       │
       ▼
Phase 2: Deploy Application Compatibility (Write Both / Dual Read)
       │
       ▼
Phase 3: Backfill Legitimate Historical Data
       │
       ▼
Phase 4: Enforce NOT NULL & Database Constraints
```

### Architectural Evaluation for SaleSource:

1. **Why Phase 1–4 Column Introduction Was NOT Required**:
   - `source_type` and `source_id` were already non-nullable scalar columns in the baseline table creation (`20260918000000`).
   - No new physical columns are introduced, and no column nullability constraints are being modified.
2. **Application-Layer Staged Compatibility**:
   - Phase 2 (Application Compatibility) was deployed at the persistence mapper layer ([`PrismaSaleMapper`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-sale.mapper.ts) and [`PrismaSaleItemMapper`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/infrastructure/persistence/prisma/mappers/prisma-sale-item.mapper.ts)):
     - When `source_type` matches one of the canonical 5 types (`KINESIOLOGY_SESSION`, `GYM_MEMBERSHIP`, `FOOD`, `DRINK`, `ROOM_RENTAL`), it reconstitutes as the rich [`SaleSource`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/sale-source.vo.ts) Value Object.
     - When `source_type` matches a legacy type (e.g. `INVENTORY_ITEM`, `PACKAGE`), it safely reconstitutes as [`SourceReference`](file:///c:/Projects/kinergy-platform/packages/core/src/sales/domain/value-objects/source-reference.vo.ts).
   - This provides **100% backward and forward compatibility** without mutating historical data or inventing synthetic source references.

---

## 4. Indexing & Query Optimization Strategy

The approved migration introduces three compound B-Tree indexes to accelerate high-frequency query patterns:

### 4.1 Index Definitions

```sql
-- Migration: 20260930000000_add_sale_source_correlation_indexes

-- 1. Accelerates tenant-scoped single-billing checks and collision detection (findBySourceReference)
CREATE INDEX "sales_tenant_id_source_type_source_id_idx"
  ON "sales"("tenant_id", "source_type", "source_id");

-- 2. Accelerates cross-tenant audit reconciliation and global source lookups
CREATE INDEX "sales_source_type_source_id_idx"
  ON "sales"("source_type", "source_id");

-- 3. Accelerates line-item operational tracebacks
CREATE INDEX "sale_items_source_type_source_id_idx"
  ON "sale_items"("source_type", "source_id");
```

### 4.2 Query Patterns Covered

1. **Active Collision Detection (`findBySourceReference`)**:
   ```sql
   SELECT * FROM sales
   WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3 AND status != 'CANCELLED'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   _Plan: Index Scan using `sales_tenant_id_source_type_source_id_idx` (Cost: O(log N), zero sequential scan)._
2. **Item-Level Provenance Traceback**:
   ```sql
   SELECT * FROM sale_items
   WHERE source_type = $1 AND source_id = $2;
   ```
   _Plan: Index Scan using `sale_items_source_type_source_id_idx`._

---

## 5. Composite Uniqueness Policy (ADR-0121 Compliance)

A key architectural requirement evaluated during migration design was whether to enforce database-level composite uniqueness:

```sql
-- STRICTLY REJECTED:
ALTER TABLE sales ADD CONSTRAINT uq_sales_source UNIQUE (tenant_id, source_type, source_id);
```

### Rationale for Rejection:

- **Consumable Retail (`FOOD`, `DRINK`)**: Multiple sales legitimately share the same catalog reference across different customers.
- **Subscriptions & Plans (`GYM_MEMBERSHIP`)**: Hundreds of members purchase the same plan reference (`plan_annual_gold`).
- **Turnaround Rooms (`ROOM_RENTAL`)**: The same studio bay is billed across distinct calendar slots.
- **Re-billing Post-Cancellation**: If a checkout is cancelled (`status === 'CANCELLED'`), a subsequent valid sale must be permitted for the same source reference. A database unique constraint would permanently deadlock cancelled sessions.
- **Enforcement Boundary**: Operational single-billing (`SALE-010`) is enforced at the application/repository boundary (`PrismaSaleRepository.save()`), checking for active (non-cancelled) duplicates within a serializable transaction.

---

## 6. Rollback & Disaster Recovery Considerations

The migration is completely non-destructive (adding secondary indexes only).

### 6.1 Rollback Script

If the migration needs to be reversed for any operational reason:

```sql
-- Rollback Migration: 20260930000000_add_sale_source_correlation_indexes
DROP INDEX IF EXISTS "sales_tenant_id_source_type_source_id_idx";
DROP INDEX IF EXISTS "sales_source_type_source_id_idx";
DROP INDEX IF EXISTS "sale_items_source_type_source_id_idx";
```

### 6.2 Operational Safety & Zero Downtime

- Dropping secondary indexes requires zero schema alterations or table rewrites.
- In high-throughput production environments with large tables, indexes can be created concurrently (`CREATE INDEX CONCURRENTLY`) to eliminate table-level write locks.
- Underlying business data in `sales` and `sale_items` remains intact with 100% data recovery guarantees.

---

## 7. Migration Verification Matrix

| Validation Phase             | Verification Command / Target                                                                   | Result                                                                 |  Status   |
| :--------------------------- | :---------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :-------: |
| **Prisma Formatting**        | `pnpm exec prisma format`                                                                       | Formatted `prisma/schema.prisma` in 46ms                               | ✅ Passed |
| **Prisma Validation**        | `pnpm exec prisma validate`                                                                     | "The schema at prisma\schema.prisma is valid 🚀"                       | ✅ Passed |
| **Client Generation**        | `pnpm exec prisma generate`                                                                     | Generated Prisma Client v6.19.3                                        | ✅ Passed |
| **Prisma Persistence Tests** | `pnpm nx test core --testPathPattern=packages/core/src/sales/infrastructure/persistence/prisma` | 6 passed suites, 93 passed tests, 0 failures                           | ✅ Passed |
| **Sales Domain & App Tests** | `pnpm nx test core --testPathPattern=packages/core/src/sales`                                   | 60 passed suites, 1544 passed tests, 0 failures                        | ✅ Passed |
| **Pre-commit Quality Gate**  | `pnpm validate`                                                                                 | Full pipeline passed (lint, typecheck, test, build across 10 projects) | ✅ Passed |
