# Architectural Review: SaleSource Extensibility and Evolution Strategy

- **Document**: `docs/architecture/sale-source-extensibility-review.md`
- **Status**: Accepted Architectural Evaluation
- **Author**: Senior Architecture Engineer
- **Context**: Kinergy Platform Phase 7 (Sales & Payments — Milestone 7.9: Sale Source References)
- **Governing ADRs**:
  - [ADR-0110: Sale Transaction Ownership and Source Bounded-Context Integrity](../adr/0110-sale-ownership.md)
  - [ADR-0112: Sales & Payments Bounded Context Establishment](../adr/0112-sales-bounded-context.md)
  - [ADR-0119: Sale Aggregate Boundary, Invariants, and Commercial Transaction Integrity](../adr/0119-sale-aggregate-boundary-and-invariants.md)
  - [ADR-0121: Sale Source References and Commercial Origin Model](../adr/0121-sale-source-references-and-commercial-origin-model.md)
- **Date**: 2026-10-01

---

## 1. Executive Summary

This document evaluates the architectural design of `SaleSource` for long-term extensibility, verifying that the Kinergy platform can accommodate emerging commercial offerings without requiring a redesign of the `Sale` aggregate root, without subclassing `Sale`, without creating source-specific database tables, and without introducing the operational complexity of a dynamic database-driven registry.

### Current Supported Values

The platform explicitly enforces the following 5 canonical commercial origin types:

1. `KINESIOLOGY_SESSION` (Clinical therapy / rehabilitation appointments)
2. `GYM_MEMBERSHIP` (Gym memberships and plan subscriptions)
3. `FOOD` (Kitchen meals, snacks, nutritional retail items)
4. `DRINK` (Beverages, smoothies, functional shakes)
5. `ROOM_RENTAL` (Facility rooms, studios, treatment bays)

### Rejection of Unsupported Values

All unsupported values (e.g. potential future types like `PRODUCT`, `PACKAGE`, `MEMBERSHIP_RENEWAL`, `WORKSHOP`, or arbitrary strings like `UNKNOWN`, `LEGACY`) are **strictly rejected** across all architectural layers:

- **API Transport Layer**: `SourceReferenceInputDto` validates `@IsEnum(SaleSourceType)`, returning `HTTP 400 Bad Request` before invoking application handlers.
- **Domain Layer**: `SaleSource` Value Object constructor and `isValidSaleSourceType()` enforce enum membership, throwing `InvalidSaleSourceException` (`INVALID_SALE_SOURCE_TYPE`).
- **Persistence Layer**: `PrismaSaleRepository` reconstitutes only valid values; invalid persisted rows fail domain reconstitution.

---

## 2. Evaluation of System Modifications for Adding Future Source Types

When a new commercial source type is introduced in the future (e.g. `PRODUCT`, `PACKAGE`, `MEMBERSHIP_RENEWAL`, `WORKSHOP`), the required changes across the platform stack are evaluated as follows:

| Layer / Concern                    |   Modification Required?   | Impact Analysis & Implementation Details                                                                                                                                                                                                                                                                                                                                                                          |
| :--------------------------------- | :------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain Enum Change**             |     **YES (Required)**     | Add the new string literal to `SaleSourceType` enum in `packages/core/src/sales/domain/enums/sale-source-type.enum.ts`. Because `isValidSaleSourceType()` dynamically checks `Object.values(SaleSourceType)`, updating the enum immediately extends domain validation with zero additional boilerplate.                                                                                                           |
| **API Schema Update**              | **AUTOMATIC (Zero Code)**  | In NestJS, `SourceReferenceInputDto` and `SaleSourceResponseDto` bind `@ApiProperty({ enum: SaleSourceType })` and `@IsEnum(SaleSourceType)`. Updating the TypeScript enum automatically updates class-validator validation rules and Swagger/OpenAPI 3.0 schema definitions. No new DTO classes or API controllers are required.                                                                                 |
| **Documentation Update**           |     **YES (Required)**     | Document the new commercial category in ADR-0121 Section 4.3 (Supported Source Types table), mapping the new type to its originating upstream bounded context, typical entity, and billing rules.                                                                                                                                                                                                                 |
| **Source Validation Registration** |  **OPTIONAL (As Needed)**  | If the new source type represents a single-billing or prerequisite-governed entity (similar to `KINESIOLOGY_SESSION`), an application adapter implementing `SaleSourceValidatorPort` is registered in application orchestration to verify entity status prior to checkout. If the source type represents retail catalog items or walk-in purchases, synchronous validation is not required.                       |
| **Persistence Changes**            | **NONE (Zero DB Changes)** | The PostgreSQL relational schema persists `sourceType` as a generic `TEXT` column (`source_type` in `sales` and `sale_items` tables) with index `@@index([tenantId, sourceType, sourceId])`. It does **NOT** use a PostgreSQL native `CREATE TYPE ... AS ENUM` or relational foreign keys. Adding a new source type requires **zero database migrations, zero table alterations, and zero maintenance downtime**. |
| **Sale Redesign / Subclassing**    |  **NONE (Zero Redesign)**  | `Sale` remains 100% generic. All financial calculations (`subtotal`, `discountTotal`, `total`, currency homogeneity, payment coordination, tax accounting) apply uniformly regardless of source type.                                                                                                                                                                                                             |

---

## 3. Structural Extensibility Guarantees

### 3.1 Rejection of the Subclassing Anti-Pattern (Zero Polymorphic Explosion)

Systems attempting to model multi-service facilities often suffer from polymorphic aggregate explosion:

- ❌ Anti-Pattern: Creating `FoodSale`, `GymSale`, `RoomSale`, `WorkshopSale`, `PackageSale`.
- Result of Anti-Pattern: Financial invariants, rounding logic, tender reconciliation, and receipt numbering diverge across separate aggregate classes, leading to accounting bugs and maintenance paralysis.
- ✅ Kinergy Solution: Under ADR-0121, **a `Sale` is always a `Sale`**. Commercial origin is captured as an unconstrained, immutable scalar Value Object (`SaleSource` containing `type` and `referenceId`).

### 3.2 Rejection of Source-Specific Tables (Zero Schema Proliferation)

- ❌ Anti-Pattern: Introducing relational tables like `sale_food_details`, `sale_gym_memberships`, `sale_workshop_registrations`.
- Result of Anti-Pattern: High database table count, complex outer joins, schema migration overhead, and cross-context table coupling.
- ✅ Kinergy Solution: The Sales bounded context stores only scalar correlation tokens:
  ```prisma
  model Sale {
    id         String   @id @default(uuid())
    sourceType String   @map("source_type")  // Stores SaleSourceType enum value
    sourceId   String   @map("source_id")    // Stores referenceId
    sourceCode String?  @map("source_code")  // Stores optional referenceCode
    ...
  }
  ```

### 3.3 Rejection of Dynamic Database-Driven Registry

We explicitly evaluated and **REJECTED** introducing a dynamic, database-driven source-type registry table (e.g. `sale_source_types` table with runtime caching, dynamic reflection, and plugin loaders):

1. **Premature Over-Engineering**: The addition of new top-level commercial facility offerings occurs infrequently (milestone-level feature launches, measured in quarters, not minutes).
2. **Loss of Compile-Time Type Safety**: A dynamic string registry in PostgreSQL forfeits TypeScript's exhaustive compile-time checking, type inference across NestJS DTOs, and automated OpenAPI documentation generation.
3. **Operational Overhead**: Requires distributed cache invalidation, fallback policies, and runtime database dependency during simple DTO validation.
4. **Conclusion**: Keeping the design **explicit, static, and type-safe via TypeScript enums** delivers maximum developer ergonomics, zero runtime latency, and deterministic validation.

---

## 4. End-to-End Walkthrough: Introducing a Future Source Type

To demonstrate future extensibility, here is the exact, complete sequence of steps required to introduce a hypothetical new source type (e.g. `WORKSHOP`):

```text
Step 1: Domain Enum
└── Add WORKSHOP = 'WORKSHOP' to SaleSourceType in packages/core/src/sales/domain/enums/sale-source-type.enum.ts.
    (Takes 1 line of code. Automatically updates isValidSaleSourceType).

Step 2: Upstream Context & Orchestration (Outside Sales)
└── Upstream bounded context (e.g. packages/core/src/workshops) defines Workshop entity.
└── If synchronous validation is desired: implement SaleSourceValidatorPort adapter in application layer.

Step 3: API & Documentation
└── Update ADR-0121 Section 4.3 table to document WORKSHOP category.
└── OpenAPI documentation automatically updates via NestJS Swagger reflection.

Step 4: Persistence
└── NO SQL migrations required. PostgreSQL source_type column accepts 'WORKSHOP' immediately.
```

**Total Sales Domain Code Modified**: 1 line in `sale-source-type.enum.ts`.  
**Total Database Migrations**: 0.  
**Total New Classes / Tables**: 0.

---

## 5. Architectural Invariants Matrix

| Architectural Principle                    | How It Is Protected                                                                                                  |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **"References Over Ownership" (ADR-0110)** | `Sale` stores scalar pointers (`type` + `referenceId`). It never assumes lifecycle authority over upstream entities. |
| **Uniform Financial Engine (ADR-0114)**    | Monetary arithmetic, discounts, and payment coordination remain generic across all source types.                     |
| **Type-Safe Static Contracts**             | Enforced via TypeScript enum `SaleSourceType`, class-validator `@IsEnum`, and OpenAPI schema reflection.             |
| **Fast, Safe Evolution**                   | Adding new source types requires zero DB migrations, zero aggregate modifications, and zero controller additions.    |
