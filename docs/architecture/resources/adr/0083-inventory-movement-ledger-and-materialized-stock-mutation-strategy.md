# ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy

- **Status**: Accepted
- **Deciders**: Principal Architect, Principal Backend Engineer, Lead Data Architect
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Consumable Inventory Ledger Strategy

---

## Context and Problem Statement

When managing consumable inventory stock, systems typically choose between three mutation models:

- **Strategy A (Direct Mutable Balance Only)**: Update `quantityOnHand` column directly; no movement history.
- **Strategy B (Pure Event-Sourced Ledger Only)**: Insert append-only movements; calculate current balance via `SUM(quantityDelta)` on every read.
- **Strategy C (Materialized Balance + Append-Only Ledger)**: Store current `quantityOnHand` directly on the item, and append an immutable `StockMovement` row within the same atomic transaction.

---

## Decision Drivers

- **Audit Permanence**: Every receipt, consumption, adjustment, and scrap event must have an immutable audit trail.
- **Read Performance**: Listing 500+ inventory items with real-time stock levels must return in $< 20\text{ms}$ without calculating dynamic sums across millions of historical movement rows.
- **Transactional Consistency**: The materialized balance and movement log must never drift.

---

## Decision Outcome

We adopt **Strategy C: Materialized Balance + Append-Only Immutable Ledger**.

1. **`inventory_items`** stores the materialized `quantity_on_hand` and `version` (for optimistic concurrency).
2. **`stock_movements`** is an append-only journal (`RECEIPT`, `CONSUMPTION`, `ADJUSTMENT`, `CORRECTION`, `SCRAP`).
3. Every stock mutation executes inside an atomic `prisma.$transaction`, ensuring `inventory_items.quantity_on_hand` and the new `stock_movements` record are committed together.
4. Updates or deletes on `stock_movements` are strictly prohibited. Errors are corrected exclusively via new `CORRECTION` movements.

---

## Alternatives Considered

1. **Strategy A (Direct Mutable Column Only)**:
   - _Rejected_: Zero auditability. Impossible to reconstruct who consumed supplies or reconcile physical discrepancies.
2. **Strategy B (Pure Dynamic SUM Aggregate)**:
   - _Rejected_: Terrible read latency as transaction volume grows, requiring complex read-model snapshotting.

---

## Consequences

- **Positive**: Blazing fast reads on catalog views while maintaining 100% audit traceability and mathematical reconcilability.
- **Negative**: Requires strict atomic transactions during write operations to guarantee no ledger-to-balance drift.
