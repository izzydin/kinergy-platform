# ADR-0081: Resources Bounded Context Topology & Domain Segregation

- **Status**: Accepted
- **Deciders**: Principal Architect, Principal Domain Architect, Lead Backend Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Resources Management Architectural Baseline

---

## Context and Problem Statement

Phase 6 introduces visibility into everything the business owns and consumes. This encompasses two distinct operational areas:

1. Consumable supplies used in treatments, training, and facility operations (e.g. therapeutic tape, electrodes, sanitizer).
2. Durable capital property retained for operational use (e.g. ultrasound devices, exercise machines, furniture).

We must decide the bounded context topology: Should these exist as two independent top-level bounded contexts (`InventoryContext` and `AssetsContext`), a single unified `Resources` bounded context, or be coupled into prospective procurement/accounting contexts?

---

## Decision Drivers

- **Domain Cohesion**: Both sub-domains share the business mission of resource tracking across Kinergy facilities.
- **Simplicity**: Small-to-medium health/wellness facilities do not require separate micro-services or heavy ERP bounded context partitioning.
- **Clear Boundaries**: Prevent premature coupling to future procurement, billing, or general ledger accounting systems.

---

## Decision Outcome

We establish a **single unified `Resources` Bounded Context** located in `packages/core/src/resources/`, partitioned into two internal sub-domains:

1. `resources/inventory/`: Consumable stock catalog, inventory movements, reorder thresholds.
2. `resources/assets/`: Fixed asset registry, operational lifecycle, maintenance logs, depreciation.

External integrations with `Identity`, `Scheduling`, and `Kinesiology` are maintained via scalar identifier references (`recordedByUserId`, `schedulableResourceId`, `treatmentSessionId`) and asynchronous domain events.

---

## Alternatives Considered

1. **Separate `Inventory` and `Assets` Top-Level Packages**:
   - _Rejected_: Adds unnecessary package boilerplate and fragmentation for an organization that manages them under unified facility management.
2. **Coupling to Sales / POS / Procurement Contexts**:
   - _Rejected_: Violates Single Responsibility. Procurement and Point-of-Sale belong to distinct commercial phases.

---

## Consequences

- **Positive**: Clean encapsulation of all physical resources within a single cohesive package, with strict internal sub-domain boundaries.
- **Negative**: Requires strict discipline to prevent developers from creating monolithic "Resource" god classes across the sub-domains.
