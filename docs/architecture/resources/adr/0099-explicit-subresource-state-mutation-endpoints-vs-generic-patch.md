# ADR-0099: Explicit Sub-Resource State Mutation Endpoints vs. Generic PATCH

**Status**: `ACCEPTED`  
**Date**: 2026-08-31  
**Context**: Phase 6.9 — Backend API Layer  
**Deciders**: Principal REST API Architect, Kinergy Architecture Review Board (ARB)

---

## 1. Context and Problem Statement

In REST API design, applications often face a choice between:

1. **Generic Resource Mutation**: Allowing clients to submit partial entity representations via `PATCH /resources/:id` with arbitrary field sets (e.g. `{ "status": "RETIRED", "location": { "roomId": "r2" }, "quantityOnHand": 50 }`).
2. **Explicit Sub-Resource Action Endpoints**: Exposing dedicated action routes (e.g. `POST /resources/assets/:id/transfer`, `POST /resources/assets/:id/status`, `POST /resources/inventory/:id/receive`) for state machine transitions, physical transfers, and stock mutations.

Allowing generic `PATCH` operations to mutate operational state machines, physical locations, or stock balances in the Resources Management bounded context creates severe architectural and security risks:

- **Audit & Invariant Bypass**: Changing stock on hand via `PATCH` bypasses double-entry inventory movement ledger creation and reason codes.
- **State Machine Violations**: Mutating asset status directly via `PATCH` circumvents the 5x5 operational lifecycle transition matrix ([ADR-0085](./0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)).
- **Location Integrity Bypass**: Changing an asset's room via `PATCH` circumvents facility verification, occupancy checks, and asset history logging.
- **Authorization Coarseness**: Generic `PATCH` endpoints make it impossible to enforce granular permissions (e.g. allowing a trainer to transfer a spin bike without granting permission to scrap or revalue capital equipment).

---

## 2. Decision Drivers

- **Domain Model Integrity**: Aggregate state transitions must be driven by explicit domain methods (`receiveStock`, `transferLocation`, `changeStatus`) that enforce invariants and record immutable ledger history.
- **Auditability & Provenance**: Every physical stock mutation and asset transfer requires explicit metadata (`reason`, `referenceNote`, `workOrderNumber`, `actorId`).
- **Granular RBAC**: Financial revaluations (`billing.read + assets.write`) must be segregated from operational status changes (`assets.write`).
- **Zero Frontend Trust**: The API contract must prevent frontend clients from bypassing domain business rules by crafting arbitrary JSON patches.

---

## 3. Considered Options

1. **Option 1: Unrestricted Generic PATCH (`PATCH /assets/:id`, `PATCH /inventory/:id`)**
   - Allows clients to pass any combination of fields. The controller or aggregate inspects changes and tries to infer transitions.
   - _Rejected_: Inflexible, prone to silent bypasses, cannot enforce required transition metadata, and obscures domain intent.

2. **Option 2: JSON Patch / JSON Merge Patch (RFC 6902 / RFC 7396)**
   - Standardized patch format.
   - _Rejected_: Extremely complex to validate against multi-step domain invariants; exposes internal aggregate property structures to HTTP clients.

3. **Option 3: Strict Segregation of Generic Metadata vs. Explicit State-Action Routes (SELECTED)**
   - Generic `PATCH /inventory/:id` is restricted to non-state metadata (product name, description, category, unit, pricing, reorder thresholds). Stock quantity on hand is strictly immutable in `PATCH`.
   - Generic `PATCH /assets/:id` is restricted to non-state metadata (asset name, description, category, notes). Status, condition, location, and financial carrying values are strictly immutable in `PATCH`.
   - All state transitions and inventory adjustments require dedicated `POST` sub-resource endpoints (`/receive`, `/sell`, `/consume`, `/scrap`, `/adjust`, `/transfer`, `/status`, `/condition`, `/maintenance`, `/valuation`).

---

## 4. Decision Outcome

**Accepted Option 3**.

### Concrete Route Segregation Rules:

#### 1. Consumable Inventory:

- `PATCH /api/v1/resources/inventory/:id`: Updates product name, description, category, purchase cost, selling price, reorder threshold, and unit of measure. **Stock quantity is rejected if present.**
- `POST /api/v1/resources/inventory/:id/receive`: Explicit stock replenishment with supplier PO reference and movement ledger generation.
- `POST /api/v1/resources/inventory/:id/sell`: Explicit POS sale deduction with receipt reference.
- `POST /api/v1/resources/inventory/:id/consume`: Explicit internal facility consumption with department/practitioner reference.
- `POST /api/v1/resources/inventory/:id/scrap`: Explicit disposal of damaged/expired goods with mandatory scrap reason.
- `POST /api/v1/resources/inventory/:id/adjust`: Explicit reconciliation audit adjustment with mandatory variance explanation.
- `POST /api/v1/resources/inventory/:id/archive`: Explicit catalog soft-archiving.
- `POST /api/v1/resources/inventory/:id/activate`: Explicit catalog re-activation.
- `POST /api/v1/resources/inventory/:id/deactivate`: Explicit catalog deactivation (seasonal freeze).

#### 2. Fixed Assets:

- `PATCH /api/v1/resources/assets/:id`: Updates asset name, description, category, and general administrative notes. **Status, condition, location, and valuations are rejected if present.**
- `POST /api/v1/resources/assets/:id/transfer`: Explicit physical room/facility relocation with room verification and audit history.
- `POST /api/v1/resources/assets/:id/status`: Explicit lifecycle state machine transition (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`) with disposal reason and state validation.
- `POST /api/v1/resources/assets/:id/condition`: Explicit qualitative condition rating update (`EXCELLENT` through `DAMAGED`) with inspection notes.
- `POST /api/v1/resources/assets/:id/maintenance`: Explicit maintenance work order logging with technician, cost, and service details.
- `POST /api/v1/resources/assets/:id/valuation`: Explicit balance sheet appraisal revaluation protected by composed `billing.read + assets.write` permissions.

---

## 5. Consequences and Trade-offs

### Positive Consequences:

- **Zero Invariant Bypass**: No client can alter stock balances or asset locations without providing required audit trail metadata.
- **Explicit Domain Intent**: API request logs and OpenAPI documentation reflect real-world business operations rather than generic database updates.
- **Granular Security**: Fine-grained RBAC permissions map 1-to-1 to discrete operational capabilities.
- **Strict Immutability**: Historical ledgers (`InventoryMovement`, `AssetHistory`, `MaintenanceRecord`) remain cryptographically reliable.

### Negative Consequences / Mitigations:

- **Slightly More Controller Endpoints**: Requires defining separate request DTOs and routes for each operational action.  
  _Mitigation_: Handlers are already implemented in `@kinergy-platform/core`; controllers remain thin 10-line adapter methods.
