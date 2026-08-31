# ADR 0094: Resources Authorization & Permission Taxonomy Model

**Status**: `APPROVED`  
**Date**: August 31, 2026  
**Context**: Resources Management — Authorization & Security (Milestone 6.7)  
**Deciders**: Architecture Review Board, Principal Security Architect, Principal Backend Engineer

---

## 1. Context & Problem Statement

Phase 6 introduces comprehensive management for both high-frequency consumable inventory (supplements, food, retail, medical supplies) and high-value fixed capital assets (cryotherapy chambers, reformer beds, diagnostic scanners).

We must establish an authorization model that:

1. Adheres to Phase 1 Kinergy security philosophy (coarse-grained `<resource>.<action>` taxonomy).
2. Enforces strict Least Privilege (preventing kitchen staff from accessing or altering facility capital equipment).
3. Protects sensitive financial balance-sheet valuations without creating permission explosion.
4. Remains backward-compatible with seeded Phase 1 permissions (`inventory.read`, `inventory.write`).

---

## 2. Decision & Architecture

We adopt the **Sub-Domain Standard Permission Taxonomy with Compositional Valuation Security**:

1. **Sub-Domain Segregation**:
   - **Consumable Inventory**: Protected by `inventory.read` and `inventory.write`.
   - **Fixed Capital Assets**: Protected by `assets.read` and `assets.write`.

2. **Compositional Financial Security**:
   - Highly sensitive valuation queries and revaluations (`GetInventoryValuationQuery`, `GetAssetValueQuery`, `UpdateFixedAssetValuationCommand`) require dual-permission composition with Phase 1 financial permissions:
     - Inventory Valuation: `@Permissions('inventory.read', 'billing.read')`
     - Fixed Asset Valuation: `@Permissions('assets.read', 'billing.read')`
     - Fixed Asset Revaluation: `@Permissions('assets.write', 'billing.read')`

3. **Domain Actor Provenance & Zero Client Trust**:
   - Request DTOs strictly forbid client-supplied `actorId` and `tenantId`. Handlers receive verified identities extracted from the authenticated JWT token via `@CurrentUser()`.

---

## 3. Evaluated Alternatives

1. **Monolithic `resources.read` / `resources.manage`**:
   - _Rejected_: Violates Least Privilege. Lumping consumables with capital assets grants kitchen staff unintended visibility and modification authority over clinical/gym equipment.
2. **Hyper-Granular Micro-Permissions (15+ Action Permissions)**:
   - _Rejected_: Over-engineers permission management, creates administrative friction, and deviates from Kinergy's Phase 1 coarse `<resource>.<action>` standard.

---

## 4. Consequences

### Positive:

- **Clean Sub-Domain Isolation**: Consumables and capital assets are decoupled.
- **Zero Permission Explosion**: Phase 6 requires exactly 4 core permissions (`inventory.read`, `inventory.write`, `assets.read`, `assets.write`).
- **Robust Financial Protection**: Prevents unauthorized balance sheet data leakage to operational staff via composition with `billing.read`.

### Trade-offs:

- Users managing both consumables and fixed assets (e.g. general facility administrators) require both `inventory.*` and `assets.*` permission grants.
