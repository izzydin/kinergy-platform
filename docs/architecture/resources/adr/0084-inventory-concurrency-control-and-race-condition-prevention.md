# ADR-0084: Inventory Concurrency Control & Race Condition Prevention

- **Status**: Accepted
- **Deciders**: Principal Architect, Staff Platform Reliability Engineer, Lead Backend Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Inventory Concurrency Architecture

---

## Context and Problem Statement

In a multi-user clinical and wellness facility, multiple staff members may record supply usage or adjust stock counts simultaneously. Without rigorous concurrency control, race conditions can cause:

1. **Lost Updates**: User B overwrites User A's stock adjustment.
2. **Negative Stock Balances**: Two simultaneous consumption requests (e.g. 5 units each when stock is 6) both pass application validation and drive stock to $-4$.

---

## Decision Drivers

- **Zero Inconsistent Stock**: Stock must never fall below zero under concurrent workloads.
- **Platform Alignment**: Must align with Kinergy's established Optimistic Concurrency Control (OCC) pattern (ADR-0021).
- **High Throughput**: Avoid global database locks that block unrelated items.

---

## Decision Outcome

We implement a **3-Layer Defense-in-Depth Concurrency Architecture**:

1. **Domain Layer**: `InventoryItem.consumeStock(qty)` verifies `qty <= this.quantityOnHand` before generating domain events.
2. **ORM / Application Layer (OCC)**:
   - `inventory_items` maintains an integer `version` field.
   - The repository updates stock via atomic conditional update:
     `UPDATE inventory_items SET quantity_on_hand = newQty, version = version + 1 WHERE id = itemId AND version = expectedVersion`.
   - If version mismatches, the transaction rolls back and throws `OptimisticLockException` (HTTP 409 Conflict).
3. **Database Engine Floor**:
   - PostgreSQL check constraint `CHECK (quantity_on_hand >= 0)` is applied directly to the `inventory_items` table.

---

## Alternatives Considered

1. **Pessimistic Row Locking (`SELECT ... FOR UPDATE`)**:
   - _Rejected as sole mechanism_: Can cause transaction deadlocks under high-concurrency batch operations.
2. **Serializable Transaction Isolation Level**:
   - _Rejected_: Excessive transaction aborts across unrelated read/write queries in PostgreSQL.

---

## Consequences

- **Positive**: Absolute mathematical guarantee against negative stock and phantom updates.
- **Negative**: Clients must handle HTTP 409 Conflict on simultaneous writes and prompt users to refetch latest stock.
