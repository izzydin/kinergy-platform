# Milestone 6.1: Domain Model & Business Rules — Architectural Consistency Review

**Review Date**: 2026-08-25  
**Reviewer**: Principal Domain Architect  
**Milestone**: Phase 6.1 — Consumable Inventory Domain Model & Business Rules  
**Status**: **APPROVED — 100% ARCHITECTURAL ALIGNMENT**

---

## 1. Executive Summary

Milestone 6.1 of the Kinergy Platform established the complete **Consumable Inventory** domain model, value objects, immutable stock ledger entity, business rules, and application-layer use case handlers without implementing premature REST or UI endpoints.

This review certifies that the implementation strictly adheres to:

1. Approved **Phase 6.0 Architecture Baseline** ([`milestone-6.0-architecture-gate.md`](./milestone-6.0-architecture-gate.md));
2. All Phase 6 Architectural Decision Records ([ADR-0081 through ADR-0089](./adr/));
3. Monorepo conventions, Clean Architecture, and Domain-Driven Design (DDD) patterns;
4. The authoritative [`business-rules.md`](./business-rules.md) specification.

---

## 2. Decision & Implementation Consistency Matrix (16 Dimensions)

| Dimension                           | Architectural Specification (Docs & ADRs)                                                                            | Active Implementation (Codebase)                                                                                                     |  Status   | Evidence / Verification                                                                                                               |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :-------: | :------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Product Identity**             | Strongly typed `InventoryItemId` (UUID v4) and tenant-scoped alphanumeric `SKU`.                                     | `InventoryItemId`, `SKU` Value Objects in `packages/core/src/resources/domain/inventory/value-objects/`.                             | **MATCH** | Validated in aggregate factory and SKU regex tests.                                                                                   |
| **2. Category Representation**      | Pure code-defined enum `InventoryCategory` with metadata descriptors (`INVENTORY_CATEGORY_REGISTRY`).                | `InventoryCategory` enum in `packages/core/src/resources/domain/inventory/enums/inventory-category.enum.ts`.                         | **MATCH** | [ADR-0088](./adr/0088-inventory-category-classification-strategy.md); 8 canonical business categories supported.                      |
| **3. Unit Representation**          | Code-defined enum `UnitOfMeasure` with continuous vs discrete classification.                                        | `UnitOfMeasure` enum and `UNIT_OF_MEASURE_REGISTRY` in `packages/core/src/resources/domain/inventory/enums/unit-of-measure.enum.ts`. | **MATCH** | [ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md); validated in aggregate create/update.             |
| **4. Quantity Precision**           | Scale 2 fixed decimal (`DECIMAL(10, 2)`), discrete delta `0.01`, non-negative $QOH \ge 0.00$.                        | `Quantity` Value Object with half-up rounding in `packages/core/src/resources/domain/inventory/value-objects/quantity.vo.ts`.        | **MATCH** | Pure decimal arithmetic methods (`add`, `subtract`, `multiply`); no floating-point drift.                                             |
| **5. Monetary Precision**           | Scale 2 (`DECIMAL(10, 2)`), ISO-4217 uppercase currency (`USD`), non-negative $\ge 0.00$.                            | `Money` Value Object in `packages/core/src/resources/domain/inventory/value-objects/money.vo.ts`.                                    | **MATCH** | Prevents IEEE-754 binary floating-point drift; validates currency parity on arithmetic.                                               |
| **6. Product Status**               | Lifecycle states: `ACTIVE`, `INACTIVE`, `ARCHIVED`. Stock mutations blocked on inactive items.                       | `InventoryItemStatus` enum; aggregate method `assertActiveCatalogStatus()`.                                                          | **MATCH** | Throws `InvalidInventoryItemStateException` on mutation attempts when not active.                                                     |
| **7. Current Stock Representation** | Materialized real-time balance `quantityOnHand` protected by invariants and DB check.                                | `InventoryItem.quantityOnHand`, Prisma schema `@map("quantity_on_hand") Decimal(10, 2)`.                                             | **MATCH** | [ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md); dual-layer invariant protection.        |
| **8. Movement Representation**      | Immutable ledger entity `StockMovement` capturing snapshot `balanceAfter`, `unitCost`, `reason`, `recordedByUserId`. | `StockMovement` entity in `packages/core/src/resources/domain/inventory/entities/stock-movement.entity.ts`.                          | **MATCH** | Implements all canonical fields; read-only accessors with private fields.                                                             |
| **9. Movement Direction**           | Inbound is $+\Delta$, Outbound is $-\Delta$, Correction is signed $\pm\Delta$.                                       | `Quantity.ofDelta(-delta.value)` for Outbound; `Quantity.ofDelta(delta.value)` for Inbound.                                          | **MATCH** | Signed delta arithmetic matches double-entry bookkeeping conventions.                                                                 |
| **10. Movement Immutability**       | Append-only ledger; updates and deletes strictly forbidden.                                                          | Entity has no mutation methods; repository provides only append/insert queries.                                                      | **MATCH** | Movements can only be created via aggregate stock mutation workflows.                                                                 |
| **11. Actor Tracking**              | User identity stamped on movements via authenticated context (`actorId`).                                            | `actorId` passed through use case commands and stored in `StockMovement.recordedByUserId`.                                           | **MATCH** | Fully integrated with Kinergy IAM user context.                                                                                       |
| **12. Reason Semantics**            | Mandatory business reason $\ge 3$ characters on all mutations.                                                       | Validated in `InventoryItem.parseReason()` and all 5 use case command handlers.                                                      | **MATCH** | Prevents empty or whitespace-only ledger entries.                                                                                     |
| **13. Transaction Boundary**        | Aggregate balance update and movement append occur atomically in single DB transaction.                              | `PrismaInventoryItemRepository.save()` executes `prisma.$transaction([updateItem, insertMovement])`.                                 | **MATCH** | ACID guarantee; failed mutations produce zero phantom movements or balance drift.                                                     |
| **14. Concurrency Strategy**        | Optimistic Concurrency Control (OCC) via integer `version` increment on mutation.                                    | Aggregate `version` increment; repository executes `UPDATE ... WHERE id = :id AND version = :priorVersion`.                          | **MATCH** | [ADR-0084](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md); throws `OptimisticLockException` on collision. |
| **15. History Strategy**            | Fundamental Invariant: $QOH = \text{initialStock} + \sum \text{quantityDelta}$.                                      | Aggregate reconstitution reconstructs movements; property tests mathematically prove identity.                                       | **MATCH** | Validated over sequential randomized and deterministic mutation chains.                                                               |
| **16. Database Constraints**        | Engine-level `CHECK (quantity_on_hand >= 0)`, `UNIQUE(tenant_id, sku)`, Foreign Key integrity.                       | Declared in `packages/core/prisma/schema.prisma` and verified in Prisma integration tests.                                           | **MATCH** | [ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md); fail-safe database protection.          |

---

## 3. ADR Audit & Alignment

| ADR Number & Title                                                                                | Documented Decision                                                                     |                                           Code Implementation Parity                                            | Review Outcome |
| :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------: | :------------: |
| **[ADR-0081](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md)**           | Bounded context isolation between Resources, Gym, Scheduling, and Kinesiology.          | Bounded context boundaries verified in `packages/core/src/resources/resources-architecture-boundaries.spec.ts`. |  **ALIGNED**   |
| **[ADR-0082](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)** | Segregation of Consumable Inventory from Fixed Assets.                                  |                    Domain models segregated; inventory package handles consumable SKUs only.                    |  **ALIGNED**   |
| **[ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)**  | Dual-ledger materialized balance + append-only historical movement log.                 |         `InventoryItem.quantityOnHand` + `StockMovement` immutable entity with atomic transaction save.         |  **ALIGNED**   |
| **[ADR-0084](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)**         | Optimistic Concurrency Control (OCC) with version field and DB check constraints.       |         Aggregate `version` management, `OptimisticLockException`, and Prisma atomic version matching.          |  **ALIGNED**   |
| **[ADR-0088](./adr/0088-inventory-category-classification-strategy.md)**                          | Code-defined domain enum `InventoryCategory` with metadata descriptors.                 |                     Implemented with `INVENTORY_CATEGORY_REGISTRY` and validation helpers.                      |  **ALIGNED**   |
| **[ADR-0089](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)**            | Scale 2 fixed decimal precision for money and quantities; code-defined `UnitOfMeasure`. |                Implemented in `Money`, `Quantity`, and `UnitOfMeasure` value objects and enums.                 |  **ALIGNED**   |

---

## 4. Test Matrix & Property Verification Summary

- **Total Test Suites**: 132 passed across `core` (1,260 individual assertions).
- **Concurrency Verification**: Validated competing sales, competing consumption, sale vs consumption race conditions, and OCC rollback.
- **Mathematical Invariant Proof**:
  $$\forall \text{ committed sequences: } QOH \ge 0 \quad \land \quad QOH = \text{initialStock} + \sum \text{quantityDelta}$$
- **Zero Side-Effects Proof**: Verified that failed business operations leave aggregate balance and movement history untouched.

---

## 5. Architectural Deviations & Conflicts

- **Identified Deviations**: **0 (Zero)**.
- **Divergence from Phase 6.0**: **None**. All domain structures, value objects, and persistence models conform strictly to approved baseline designs.
- **Scope Creep Check**: **Clean**. No REST controllers, HTTP endpoints, or frontend screens were introduced.

---

## 6. Remaining Risks & Mitigations

1. **High-Concurrency Retail Bursts**:
   - _Risk_: Multiple cashiers simultaneously selling the final units of a popular retail item could generate OCC retries.
   - _Mitigation_: The application layer will support deterministic exponential backoff retries when integrating REST endpoints in Phase 6.3.
2. **Cross-Context Correlation**:
   - _Risk_: Clinical consumption tracking requires correlation with `treatmentSessionId` from Kinesiology context.
   - _Mitigation_: The `referenceId` field on `StockMovement` and `ConsumeStockCommand` cleanly accommodates loose coupling across bounded contexts without direct foreign key database entanglement.

---

## 7. Formal Recommendation

**MILESTONE 6.1 DOMAIN MODEL & BUSINESS RULES IS CERTIFIED AS COMPLETE AND FULLY CONSISTENT.**

The engineering team is authorized to proceed to **Phase 6.2: Application Services, CQRS Handlers & Domain Integration** (and subsequent REST API / UI DataTables in Phase 6.3+).
