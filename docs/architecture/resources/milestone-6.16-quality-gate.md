# Milestone 6.16: Cross-Domain Integration Architecture Quality Gate Sign-Off

**Milestone**: Phase 6.16 — Cross-Domain Integration Architecture  
**Bounded Context**: `Resources Management`  
**Sub-Domains**: `Consumable Inventory`, `Fixed Assets`, `Cross-Domain Integration Boundaries`  
**Review Date**: September 11, 2026  
**Reviewers**:

- Principal Enterprise Architect
- Principal Domain Architect
- Senior Integration Architect
- Senior Database Architect
- Senior Test & QA Governance Engineer
- Kinergy Architecture Review Board (ARB)

**Decision**: **APPROVED — CROSS-DOMAIN INTEGRATION ARCHITECTURE READY FOR PRODUCTION**

---

## 1. Executive Summary

Milestone 6.16 delivers the formal cross-domain integration architecture, isolation boundaries, and production sign-off for **Phase 6: Resources Management** across all bounded contexts of the Kinergy Platform.

Building upon the domain models, database topology, application orchestrations, HTTP APIs, and frontend interfaces delivered in Milestones 6.0 through 6.15, Milestone 6.16 certifies that:

1. **Zero Unnecessary Relational Coupling**: Under the governing rule that _"domains remain completely independent by default unless a real, concrete business workflow proves integration is necessary"_, no speculative foreign keys or shared persistence models exist between Resources and external bounded contexts.
2. **Explicit Hexagonal Application Port for Commercial Sales**: Stock deduction for commercial sales, retail transactions, and future order flows is encapsulated within an in-process hexagonal application port (`InventoryStockDecrementPort`). Internal modules are strictly forbidden from making localhost loopback HTTP requests.
3. **Mandatory Stock Ownership Invariant**: The Inventory domain strictly and exclusively owns all stock mutation logic, non-negative stock invariants (`[INV-INV-2]`), double-entry ledger reconstruction, and Optimistic Concurrency Control (OCC) version increments.
4. **Resilient Decoupling Across All Domains**:
   - **IAM (Phase 1)**: Unified permission model (`inventory.read`, `inventory.write`, `assets.read`, `assets.write`, `billing.read`) with zero duplicate identity abstractions.
   - **Client Management (Phase 2)**: Complete decoupling invariant governed by [ADR-0104](./adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md); clients are referenced exclusively by unconstrained scalar IDs (`clientId: string`), providing GDPR cascade-delete immunity.
   - **Scheduling (Phase 3)**: Physical placement is modeled as an informational `AssetLocation` Value Object per [ADR-0105](./adr/0105-scheduling-and-fixed-asset-decoupling-invariant.md); asset maintenance does not cascade to room booking calendars.
   - **Kinesiology (Phase 4)**: Treatment consumable consumption is recorded with scalar `treatmentSessionId` in append-only `StockMovement` logs with zero clinical model leakage.
5. **100% Automated Test Verification**: Architecture boundaries, concurrency resilience, and cross-domain invariants are permanently guarded by automated test suites passing cleanly across the entire monorepo.

---

## 2. Cross-Domain Boundary Architecture & Decision Matrix

```
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           EXTERNAL CALLERS                                  │
  │   (Frontend Web UI, Reception POS, WhatsApp Bot, Future Sales Module)       │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                         PHASE 1 IAM GATEWAY                                 │
  │     (AuthenticationGuard, AuthorizationGuard, Role/Permission Evaluator)    │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                 PHASE 6 APPLICATION LAYER (PORTS & HANDLERS)                │
  │                                                                             │
  │   [InventoryStockDecrementPort] ──► [SellStockHandler]                      │
  │   [FixedAssetCommands]          ──► [TransferLocationHandler, StatusHandler]│
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                          DOMAIN AGGREGATE ROOTS                             │
  │                                                                             │
  │   [InventoryItem Aggregate]                [FixedAsset Aggregate]           │
  │    - Owns ALL stock mutation rules          - Owns lifecycle state machine  │
  │    - Owns negative-stock invariants         - Owns revaluation & history    │
  │    - Appends immutable StockMovement        - Owns maintenance records      │
  │    - Enforces OCC (version)                 - Pure scalar AssetLocation     │
  └───────────────────────────────┬─────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                     PERSISTENCE / REPOSITORY LAYER                          │
  │     (Prisma PostgreSQL with RESTRICT on historical ledgers, 0 foreign FKs)  │
  └───────────────────────────────┬─────────────────────────────────────────────┘
```

| Integration Boundary                      | Relationship Classification    | Key Architectural Invariant                                                                                                                          | Governing ADR / Port                                                                         |
| :---------------------------------------- | :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **IAM (Phase 1) ↔ Resources**             | Mandatory Security Integration | Unified permissions (`inventory.*`, `assets.*`, `billing.read`); zero duplicate User/Token/Session models in Resources.                              | [ADR-0094](./adr/0094-resources-authorization-and-permission-taxonomy-model.md)              |
| **Clients (Phase 2) ↔ Resources**         | Complete Decoupling            | Scalar `clientId` reference only; zero foreign keys in `inventory_items` or `fixed_assets`; zero `Customer`/`Patient` types; GDPR deletion immunity. | [ADR-0104](./adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md)    |
| **Scheduling (Phase 3) ↔ Fixed Assets**   | Informational Coordinates      | Location is an unconstrained Value Object (`AssetLocation`); zero FKs to `rooms`; asset maintenance never blocks room calendars.                     | [ADR-0105](./adr/0105-scheduling-and-fixed-asset-decoupling-invariant.md)                    |
| **Treatments (Phase 4) ↔ Inventory**      | Operational Ledger Reference   | Scalar `treatmentSessionId` in `StockMovement` (type `CONSUMPTION`); zero clinical notes or medical diagnoses in Resources.                          | [ADR-0083](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md) |
| **Commercial Sales (Future) ↔ Inventory** | In-Process Capability Port     | Downstream consumers call `InventoryStockDecrementPort.sellStock()`; no localhost HTTP loopbacks; Inventory strictly owns stock mutations.           | [ADR-0106](./adr/0106-sales-inventory-integration-boundary-and-stock-ownership-policy.md)    |

---

## 3. Concurrency, OCC & Atomicity Guarantees

1. **No Distributed 2-Phase Commit (No 2PC)**:
   - Order creation and inventory deduction are coordinated via local use case orchestration. If `sellStock()` fails with `INSUFFICIENT_STOCK`, the calling domain aborts checkout with a deterministic error.
2. **Optimistic Concurrency Control (OCC)**:
   - Both `InventoryItem` and `FixedAsset` maintain integer `version` properties.
   - Concurrent writes are protected via atomic version checks in PostgreSQL. Conflicting updates fail cleanly without corrupted balances or negative stock.
3. **Transaction Atomicity**:
   - Stock balance adjustments and append-only `StockMovement` entries are committed within a single atomic database transaction. Partial failures trigger an immediate rollback, leaving the physical balance and ledger synchronized.

---

## 4. Automated Verification & Quality Evidence

### A. Dedicated Milestone 6.16 Test Suites

| Test Suite                        | Spec File                                   | Tests Passing | Verification Scope                                                                                                                                          |
| :-------------------------------- | :------------------------------------------ | :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture Boundary Purity**  | `resources-architecture-boundaries.spec.ts` | 9             | Domain layer purity, zero foreign context imports, zero duplicate IAM/client models, Prisma schema foreign-key isolation                                    |
| **Sales/Inventory Port Contract** | `sales-inventory-integration-port.spec.ts`  | 8             | Retail sales execution, negative-stock prevention, input sanitization defense, multi-tenant boundaries, concurrency race conditions, persistence resilience |
| **QA Invariant Hardening**        | `resources-qa-invariant-hardening.spec.ts`  | 15            | Cross-domain asset valuation revaluation history, lifecycle status transitions, simulated PostgreSQL CHECK constraints, OCC rollback                        |
| **OpenAPI Contract Parity**       | `resources-openapi.spec.ts`                 | 32            | Route definitions, HTTP verbs, response DTO schemas, security scheme tags                                                                                   |
| **DTO Boundary Validation**       | `resources-validation.spec.ts`              | 32            | Whitelist enforcement, forbidNonWhitelisted rejection, positive numbers, XSS pre-sanitization                                                               |

### B. Full Monorepo Quality Gate Validation

The complete platform validation script (`pnpm validate`) executed cleanly across all monorepo projects:

```bash
$ pnpm validate
✔ format:check: All matched files use Prettier code style!
✔ lint: All 10 projects pass linting without errors or warnings
✔ typecheck: tsc --noEmit passed with 0 errors
✔ test: 83 API test suites passed (612 tests), 38 Web test suites passed (381 tests), Core & Domain test suites passed (100% pass rate)
✔ build: 10 projects compiled and built production bundles successfully (including web:build:production)
```

---

## 5. Architectural Sign-Off

The **Kinergy Architecture Review Board (ARB)** hereby issues formal sign-off for **Milestone 6.16: Cross-Domain Integration Architecture Quality Gate**.

The **Resources Management Subsystem (Phase 6)** is fully production-ready, architecturally segregated, and completely protected against cross-domain coupling, concurrency anomalies, and security bypass vectors.
