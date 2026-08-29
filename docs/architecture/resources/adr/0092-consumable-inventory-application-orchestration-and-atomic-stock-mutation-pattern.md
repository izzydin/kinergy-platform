# ADR 0092: Consumable Inventory Application Orchestration & Atomic Stock Mutation Pattern

**Status**: `APPROVED`  
**Date**: August 28, 2026  
**Context**: Resources Management — Consumable Inventory Application Layer (Milestone 6.5)  
**Deciders**: Architecture Review Board, Principal Backend Engineer, Security Architect

---

## 1. Context & Problem Statement

Consumable inventory mutations across Kinergy facilities (purchases, sales, clinical consumption, manual reconciliation, and scrap adjustments) require strict transactional atomicity, non-negative stock balance invariants (`quantityOnHand >= 0`), append-only ledger completeness (`StockMovement` table), Optimistic Concurrency Control (OCC), and clean event-driven boundaries.

Without a centralized application orchestration foundation, business logic and transactional error-handling risks duplication across use cases, leading to potential ledger desynchronization, phantom stock increments, or binary floating-point rounding errors.

---

## 2. Decision & Architecture

We establish the **Consumable Inventory Application Orchestration Pattern**:

1. **Shared Transactional Orchestrator (`StockOperationOrchestrator`)**:
   - Encapsulates the canonical 10-step mutation sequence:
     1. Pre-flight input validation (positive quantities, required IDs).
     2. Aggregate reconstitution via `InventoryItemRepository.findById()`.
     3. Strict multi-tenant boundary verification (`item.tenantId === command.tenantId`).
     4. Execution of domain mutation closure (`item.receiveStock()`, `item.sellStock()`, `item.consumeStock()`, etc.), incrementing aggregate `version`.
     5. Atomic database transaction (`$transaction`) updating aggregate row with OCC version check (`WHERE version = priorVersion`) and appending the new `StockMovement` row.
     6. Rollback cleanly on OCC conflict or domain exception with zero ledger pollution.
     7. Post-commit event publication via `ResourcesEventPublisherPort`.
     8. Mapping resulting aggregate and movement to `StockMutationResultDTO`.

2. **Catalog Price Stability & Transaction Snapshotting**:
   - Purchases snapshot purchase `unitCost` and sales snapshot `sellingPrice` on the immutable `StockMovement` record without mutating master catalog pricing.

3. **No-Silent-Corrections Principle**:
   - `UpdateInventoryItemHandler` strictly forbids modifying `quantityOnHand`. All physical stock mutations require an explicit business command.
   - Adjustments strictly require $\ge 3$ characters of non-whitespace justification for audit provenance.

4. **Fixed-Cents Asset Valuation**:
   - `GetInventoryValuationHandler` computes working capital in exact integer cents (`Math.round(qty * unitCost * 100)`), eliminating IEEE 754 floating-point drift.

---

## 3. Consequences

### Positive:

- **Zero Ledger Divergence**: Stock balances and historical movements are atomically bound.
- **Race Condition Immunity**: Parallel operations competing for finite stock cannot produce negative balances.
- **Audit Completeness**: Every balance change records actor, reason, timestamp, and reference ID.

### Trade-offs:

- Concurrent writers to the same product require client retry on OCC conflict.
