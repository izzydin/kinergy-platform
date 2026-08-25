# ADR-0082: Fixed Asset Domain Modeling & Complete Segregation from Inventory

- **Status**: Accepted
- **Deciders**: Principal Architect, Principal Data Architect, Lead Backend Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Resources Management Architectural Baseline

---

## Context and Problem Statement

A common anti-pattern in resource management systems is attempting to unify consumable inventory items and fixed physical assets into a single polymorphic entity or database table (e.g. `resources` table with a `type` discriminator).

We must decide whether `FixedAsset` and `InventoryItem` should share an entity/table hierarchy or be modeled as completely separate domain aggregates and database tables.

---

## Decision Drivers

- **Domain Semantics**: Inventory is _fungible_ and tracked by aggregate count; Assets are _non-fungible_ and tracked by unique physical tag/serial number.
- **Relational Cleanliness**: Property overlap between inventory and fixed assets is $< 20\%$. Single Table Inheritance (STI) results in sparse, nullable tables and muddy business invariants.
- **Query Optimization**: Indexing requirements for high-frequency stock level queries conflict with long-term asset maintenance and depreciation lookups.

---

## Decision Outcome

We decide that **`InventoryItem` and `FixedAsset` will be modeled as two completely distinct Aggregate Roots and persisted into separate PostgreSQL tables (`inventory_items`, `fixed_assets`)**.

- **Zero Class Inheritance**: There will be no `BaseResource` abstract class or polymorphic database discriminator.
- **Shared Primitives via Value Objects**: Common attributes (such as `LocationRef` and `Money`) are shared purely as immutable value objects.

---

## Alternatives Considered

1. **Single Table Inheritance (`resources` table with `discriminator = INVENTORY | ASSET`)**:
   - _Rejected_: Leads to dozens of nullable columns (`quantity_on_hand` null for assets; `serial_number`, `depreciation_schedule`, `warranty_date` null for inventory).
2. **Class Table Inheritance / Polymorphic Joins (`resources` base table with child `inventory_items` and `fixed_assets` tables)**:
   - _Rejected_: Adds unnecessary join overhead on every read query with zero operational benefit.

---

## Consequences

- **Positive**: Clear domain boundaries, 100% non-null relational column guarantees where appropriate, focused query performance.
- **Negative**: Minor code duplication in basic metadata fields (name, description), mitigated by shared value objects.
