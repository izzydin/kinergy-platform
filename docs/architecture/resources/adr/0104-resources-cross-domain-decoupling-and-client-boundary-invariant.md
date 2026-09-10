# ADR-0104: Resources Cross-Domain Decoupling & Client Boundary Invariant

- **Status**: Accepted
- **Deciders**: Senior Domain Architect, Principal Architect, Lead Backend Engineer
- **Date**: 2026-09-10
- **Context/Milestone**: Milestone 6.16 — Cross-Domain Integration Architecture

---

## 1. Context and Problem Statement

During Milestone 6.16 (Cross-Domain Integration), we evaluated whether Phase 6 Resources (Consumable Inventory & Fixed Assets) should introduce direct relationships with Phase 2 Client Management:

1. Should `InventoryItem` or `StockMovement` maintain a foreign key or relationship to `Client`?
2. Should `FixedAsset` maintain an ownership, assignment, or checkout relationship to `Client`?
3. Should Resources introduce lightweight `Customer`, `Patient`, `Member`, or duplicate `Person` concepts for retail checkout or equipment allocation?

We must establish a permanent architectural invariant to ensure bounded context isolation, avoid identity duplication, and maintain domain purity.

---

## 2. Decision Drivers

- **Domain Semantics & Business Truth**:
  - **Fixed Assets** represent capital property owned by the business facility (gym equipment, lasers, ultrasound units, computers, furniture). Clients never own or hold long-term assignments to business assets.
  - **Consumable Inventory** represents facility catalog stock. Clients do not own warehouse inventory or have dedicated physical stock reservations.
  - **Retail Sales**: When a client purchases a retail item (shakes, supplements), the customer identity and transaction details are recorded within the commercial checkout/order domain. The inventory ledger simply records a stock reduction (`StockMovementType.SALE`) with an opaque scalar transaction identifier (`referenceId`).
- **Identity Integrity**: Phase 2 `Client` is the sole source of truth for clients/patients. Duplicating person or customer models inside Resources breaches Kinergy's core architectural standards.
- **Relational Cleanliness**: Adding `clientId` foreign keys to `inventory_items` or `fixed_assets` creates false coupling, complicates deletion lifecycles, and breaks multi-tenant data independence.

---

## 3. Decision Outcome

We establish the **Client ↔ Resources Complete Decoupling Policy**:

1. **NO DIRECT RELATIONSHIP**:
   - Neither `InventoryItem` nor `FixedAsset` will reference `Client` via foreign keys or domain relationships.
   - The relationship is explicitly classified as **NOT REQUIRED**.
2. **ZERO DUPLICATE PERSON/CUSTOMER MODELS**:
   - Resources will NOT declare `Person`, `Customer`, `Patient`, `Member`, or alias identity models.
   - Any external association (such as retail sales or session consumption) is tracked exclusively through unconstrained scalar identifiers (`referenceId`) pointing to external transactions (e.g., `orderId`, `treatmentSessionId`).
3. **AUTOMATED ARCHITECTURAL ENFORCEMENT**:
   - Architectural tests in `packages/core/src/resources/resources-architecture-boundaries.spec.ts` permanently enforce:
     - Zero imports of `Client` within the Resources domain layer.
     - Zero `Customer`/`Patient`/`Member` entity/interface/type declarations inside `resources/domain`.
     - Zero `clientId` columns or relational references to `clients` in Prisma schema `inventory_items` and `fixed_assets`.

---

## 4. Consequences

### Positive

- **Domain Independence**: Resources operates purely on physical items, assets, locations, and inventory counts.
- **High Cohesion**: Changes to client workflows, GDPR deletion policies, or client lifecycle states have zero ripple effect on inventory catalogs or asset histories.
- **Preserved Audit Trails**: Historic stock movements and asset maintenance records remain intact even if a client record is archived or removed from the system.

### Negative / Trade-offs

- If a future point-of-sale reporting view needs to display which client purchased a retail item, it must query the sales transaction table using `StockMovement.referenceId`, rather than querying an inventory join directly. This is the correct DDD boundary separation.
