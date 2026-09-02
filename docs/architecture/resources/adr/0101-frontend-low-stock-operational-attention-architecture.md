# ADR-0101: Frontend Low Stock Operational Attention Architecture & Workflow

**Status**: Approved & Authoritative  
**Date**: 2026-09-02  
**Deciders**: Inventory Operations UX Specialist, Senior Frontend Engineer, Principal Architect  
**Subsystem**: Resources Management (`apps/web/src/modules/resources/inventory/`)  
**Related ADRs**:

- [ADR-0084: Resources Subsystem Architecture & Boundaries](./0084-resources-subsystem-architecture-and-boundaries.md)
- [ADR-0092: Consumable Inventory Application Orchestration](./0092-consumable-inventory-application-orchestration-and-atomic-stock-mutation-pattern.md)
- [ADR-0100: Frontend Resources Feature-Module Boundaries](./0100-frontend-resources-feature-module-boundaries.md)

---

## 1. Context & Business Rules

Stock depletion threatens operational continuity in clinical and gym operations (e.g., treatment consumables, retail supplements). An inventory management system must answer the core operational question:

> **"What needs attention right now?"**

### Mandatory Business Rule

Unless an approved business decision changed the rule:
$$\text{Low Stock} \iff \text{currentStock} \le \text{minimumStock}$$

- **Zero stock is low stock**: When $\text{currentStock} = 0$, the item is both out of stock and critically low stock.
- The frontend must never invent a conflicting or synthetic client-side threshold.
- The backend domain aggregate (`InventoryItem.isLowStock()`) is authoritative for this evaluation.

---

## 2. Implementation Decision: Dedicated Route vs. Canonical Filter

### Options Evaluated

1. **Option A: Generic Product List Filter Only (`/resources/inventory?stockStatus=LOW_STOCK`)**
   - _Pros_: Reuses the generic catalog table.
   - _Cons_: Fails to answer "What needs attention?" effectively. The generic catalog table is designed for browsing, pagination, and multi-faceted searching; it lacks deficit calculations, urgency sorting, operational priority queues, and direct replenishment actions.

2. **Option B: Dedicated Attention Route (`/resources/inventory/low-stock`) Paired with Dedicated Backend Contract (`GET /api/v1/resources/inventory/low-stock`)**
   - _Pros_: Directly consumes the specialized query `GetLowStockItemsQuery` (`useLowStockItems()`), provides dedicated operational KPI cards (Total Needing Attention, Out of Stock, Low Stock, Total Deficit Units), presents deficit badges ($\Delta = q_{\text{min}} - q$), highlights immediate replenishment (`ReceiveStockDialog` in-flow), and renders a rich positive empty state ("All Inventory Stocks Healthy").
   - _Cons_: Requires an additional page route.

### Authoritative Decision

**We adopt Option B with Canonical Cross-Linking:**

1. A **Dedicated Operational Route** is established at `/resources/inventory/low-stock` (`LowStockPage`), consuming `useLowStockItems()` (`GET /api/v1/resources/inventory/low-stock`).
2. The **Canonical Product List** (`/resources/inventory?stockStatus=LOW_STOCK`) remains fully functional for catalog searches, with an operational banner guiding users to the dedicated attention queue for reordering.
3. The **Inventory Overview Dashboard** (`/resources/inventory/overview`) features the `LowStockAlertTable` linking directly to `/resources/inventory/low-stock` as the full operational attention queue.

---

## 3. Operational Presentation & Ergonomics

| Feature                    | Operational Behavior                                                                                                                                                                                                                                                        |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Urgency Classification** | • `OUT OF STOCK` ($q = 0$): Critical priority badge with destructive styling.<br>• `LOW STOCK` ($0 < q \le q_{\text{min}}$): Urgent attention badge with amber styling.                                                                                                     |
| **Replenishment Deficit**  | Computes $\text{Deficit Units} = \max(0, \text{minimumStock} - \text{currentStock})$, displaying a `Need +X [unit]` badge.                                                                                                                                                  |
| **Authorized Actions**     | • **Receive Stock**: Guarded by `inventory.write` permission. Opens in-flow `ReceiveStockDialog` for immediate purchase receipt without losing queue context.<br>• **View Product**: Navigates to `/resources/inventory/:id` for historical movements and supplier records. |
| **Positive Empty State**   | When no products are below threshold, renders a prominent positive health banner (`CheckCircle2` green icon: _"All Inventory Stocks Healthy — Zero products currently require reorder attention"_), rather than a sterile empty table.                                      |
| **Error Transparency**     | Renders clear domain error messaging with a retry button on network or query failure.                                                                                                                                                                                       |

---

## 4. Quality Rule & Invariant

> **Quality Rule**:  
> _The backend determines which products are low stock. The frontend communicates that authoritative state and enables approved, auditable operational action._
