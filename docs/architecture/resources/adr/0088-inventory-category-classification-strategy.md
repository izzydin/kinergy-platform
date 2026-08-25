# ADR-0088: Inventory Category Classification Strategy (Code-Defined Domain Enum vs Database-Managed Entity)

- **Status**: Accepted
- **Deciders**: Principal Domain Architect, Principal Backend Engineer, Lead Architecture Review Board
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6.1 — Consumable Inventory Domain Model & Business Rules

---

## Context and Problem Statement

The Consumable Inventory domain requires a mechanism to categorize consumable supplies, retail goods, and operational products across Kinergy facilities. The minimum business categories required by the platform are:

1. **Healthy Meals** (`HEALTHY_MEALS`)
2. **Healthy Drinks** (`HEALTHY_DRINKS`)
3. **Cleaning Supplies** (`CLEANING_SUPPLIES`)
4. **Office Supplies** (`OFFICE_SUPPLIES`)
5. **Future Supplements** (`SUPPLEMENTS`)
6. **Clinical Supplies** (`CLINICAL_SUPPLIES`)
7. **Therapy Consumables** (`THERAPY_CONSUMABLES`)
8. **Retail Products** (`RETAIL_PRODUCTS`)

We must decide whether inventory categories should be represented as a **code-defined domain enum / strongly-typed Value Object** or as a **dynamically managed database entity** (`categories` table with runtime CRUD endpoints).

---

## Decision Drivers

- **Domain Simplicity & YAGNI**: Avoid introducing unnecessary tables, repositories, controllers, services, DTOs, and UI management screens for categories that represent stable business taxonomies.
- **Reporting & Business Rule Invariants**: Financial reporting, stock valuation, margin analysis, and consumption tracking aggregate data deterministically along standard canonical category boundaries.
- **Type Safety & Compiler Guarantees**: Strongly typed enums provide compile-time guarantees across domain models, use cases, mappers, queries, and frontend interfaces.
- **Kinergy Architectural Consistency**: Across all established Kinergy bounded contexts (`UserRole`, `UserStatus`, `AppointmentType`, `MembershipStatus`, `PlanStatus`, `CheckInMethod`, `AccessResult`), core business classifications are consistently modeled as code-defined domain enums/value objects rather than runtime database lookup tables.

---

## Decision Outcome

We choose **Option A: Code-Defined Domain Enum backed by a Domain Value Object & PostgreSQL Native Enum**.

### Implementation Specification

1. **Domain Enum**: Defined in `packages/core/src/resources/domain/inventory/enums/inventory-category.enum.ts` containing the standard canonical categories:
   - `HEALTHY_MEALS`
   - `HEALTHY_DRINKS`
   - `CLEANING_SUPPLIES`
   - `OFFICE_SUPPLIES`
   - `SUPPLEMENTS`
   - `CLINICAL_SUPPLIES`
   - `THERAPY_CONSUMABLES`
   - `RETAIL_PRODUCTS`
2. **Domain Value Object / Factory & Validation**: Enforced inside `InventoryCategory` domain types and the `InventoryItem` aggregate root. Invalid or arbitrary strings are rejected at the boundary with an `InvalidInventoryItemStateException` or `InvalidCategoryException`.
3. **Persistence Mapping**: Mapped directly to native PostgreSQL enum `InventoryCategory` in `prisma/schema.prisma` and indexed via `@@index([category])` on the `inventory_items` table for zero-join, high-performance query execution.
4. **Zero Category CRUD**: No CRUD controllers, REST endpoints, database tables, or UI admin screens are created for category management.

---

## Alternatives Considered

### Option B: Database-Managed Entity (`categories` Table + CRUD)

- **Description**: Introduce a `categories` database table with `id`, `name`, `description`, `tenantId`, unique constraints, foreign keys on `inventory_items.category_id`, and full CRUD API endpoints and UI screens.
- **Rejected Reasons**:
  - **Unnecessary Accidental Complexity**: Introduces an entire CRUD lifecycle, foreign key constraints, cascade/deletion handling rules, and additional database joins with zero current business requirement.
  - **Reporting Fragility**: Allowing arbitrary tenant users to create, rename, or delete categories corrupts reporting aggregations and cross-facility standardized performance dashboards.
  - **Domain Indirection**: Violates Kinergy's established pattern where business taxonomy is part of the ubiquitous language and domain model, not user-generated runtime configuration.

---

## Consequences

- **Positive**:
  - High performance: Single-column enum storage with direct B-tree indexing and zero relational join overhead.
  - Type safety: Compile-time typechecking from domain entities through Prisma client to frontend consumers.
  - Robust invariants: Prevents accidental creation of duplicate or misspelled categories (e.g., `Healthy Drink` vs `Healthy Drinks`).
  - Architectural consistency: 100% aligned with Phases 1 through 5 design standards.
- **Negative**:
  - Adding a new category requires a code deployment and database migration (standard for core domain taxonomy).

---

## Related Decisions

- [ADR-0081: Resources Bounded Context Topology & Domain Segregation](./0081-resources-bounded-context-topology-and-domain-segregation.md)
- [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
