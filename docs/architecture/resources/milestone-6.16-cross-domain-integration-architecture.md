# Milestone 6.16: Cross-Domain Integration Architecture Specification

- **Status**: **Approved & Active**
- **Milestone**: Phase 6.16 — Cross-Domain Integration Architecture
- **Date**: 2026-09-11
- **Authors**: Principal Domain Architect, Senior API Architect, Senior Database Architect, Senior Integration Test Engineer
- **Governing ADRs**:
  - [**ADR-0104: Resources Cross-Domain Decoupling & Client Boundary Invariant**](./adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md)
  - [**ADR-0105: Scheduling & Fixed Asset Decoupling Invariant and Location Semantics**](./adr/0105-scheduling-and-fixed-asset-decoupling-invariant.md)
  - [**ADR-0106: Sales ↔ Inventory Integration Boundary and Stock Ownership Policy**](./adr/0106-sales-inventory-integration-boundary-and-stock-ownership-policy.md)

---

## 1. Executive Summary & Philosophy

Milestone 6.16 establishes the formal integration and decoupling boundaries between **Phase 6: Resources Management** and all other platform domains:

- **Phase 1**: Identity & Access Management (IAM)
- **Phase 2**: Client Management
- **Phase 3**: Scheduling & Facilities
- **Phase 4**: Treatment Sessions (Kinesiology)
- **Phase 5**: Gym Management
- **Commercial Boundary**: Future Sales / Point-of-Sale (POS) / Nutrition / Orders

### The Fundamental Rule of Integration

> **Domains remain completely independent by default unless a real, concrete business workflow proves integration is necessary.**

Under no circumstances are relational foreign keys, shared persistence models, or direct database mutations created between bounded contexts simply because they appear "technically convenient."

---

## 2. Cross-Domain Boundary Architecture

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
  └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Domain-by-Domain Integration Architecture

### 3.1 Client Management ↔ Resources: Complete Decoupling

- **Current Architecture**: Resources references Clients **exclusively by unconstrained scalar IDs (`clientId: string`)**.
- **No Direct Relationship**:
  - The database tables `inventory_items` and `fixed_assets` have **zero foreign keys** to `clients`.
  - The Resources domain contains **zero** `Customer`, `Patient`, `Member`, or duplicate person models.
- **Why No Relationship Exists**:
  - Capital assets are owned by the wellness facility, not by individual clients.
  - Consumable inventory belongs to facility warehouse/shelf stock.
  - In commercial transactions (such as buying a protein shake) or clinical treatments (using kinesiology tape), the client relationship is owned by the transaction/session domain. Resources merely receives an optional scalar identifier (`referenceId`) in the immutable movement ledger.
- **Cascade Delete Immunity**:
  - Deleting or anonymizing a Client (e.g., GDPR compliance) will **never cascade-delete or corrupt** inventory stock balances, historical movements, or fixed asset service records.

### 3.2 Scheduling (Rooms & Areas) ↔ Fixed Assets: Informational Coordinates

- **Current Architecture**: Fixed Assets model location as an **informational Value Object (`AssetLocation`)**, not a relational entity.
- **Why Relational Linking is Intentionally Deferred**:
  - In Kinergy, appointments book a **Space** (`Room`), a **Therapist**, and a **Client**. Equipment is an amenity inside the space; practitioners and clients do not book equipment as independent calendar lines.
  - If a piece of equipment enters repair (`UNDER_MAINTENANCE`), the physical room remains operational for consultations and other therapies. Coupling equipment maintenance to room calendar availability would cause severe cascading appointment disruptions.
  - Assets frequently move to non-schedulable locations (storage closets, reception lounges, off-site calibration labs). A relational foreign key would require artificial "dummy rooms."
- **Current Business Semantics**:
  - Physical placement is captured via `AssetLocation`:
    ```typescript
    export class AssetLocation {
      readonly facilityId: string;
      readonly roomId?: string;
      readonly zone?: string;
      readonly description?: string;
    }
    ```
  - Transfers generate an immutable, auditable `AssetHistoryEvent` (`TRANSFERRED`).

### 3.3 Sales ↔ Consumable Inventory: In-Process Application Capability

- **Current Architecture**:
  - **No Sales module currently exists** in the repository. Speculative Sales tables were intentionally avoided.
  - Instead, the future integration boundary has been formalized and validated as an in-process hexagonal port:
    `InventoryStockDecrementPort.sellStock(params: DecrementStockParams)`.
- **Mandatory Stock Ownership Rule**:
  > **The Inventory domain strictly owns ALL stock mutation rules.**
  - Current stock balances (`quantityOnHand`).
  - Immutable movement ledger (`StockMovement` append).
  - Negative-stock prevention (`[INV-INV-2]`).
  - Movement validation and unit precision.
  - Optimistic Concurrency Control (`version` matching and retries).
- **In-Process Boundary vs. HTTP Overhead**:
  - In Kinergy's modular monolith, internal backend modules must **never** make localhost loopback HTTP calls (`POST /api/v1/resources/inventory/:id/sell`) to deduct stock.
  - Internal consumers (POS, subscriptions, food orders) invoke `InventoryStockDecrementPort` directly in-process. The HTTP endpoint is strictly reserved for authenticated front-desk staff recording counter sales.

### 3.4 Identity & Access Management (IAM Phase 1)

- **Current Architecture**: Every Resource endpoint and mutation strictly reuses Phase 1 IAM infrastructure:
  - Authentication: `AuthenticationGuard` resolves bearer tokens and injects `AuthenticatedUserContext`.
  - Authorization: `AuthorizationGuard` evaluates server-side permissions.
  - Unified Permissions:
    - `inventory.read`: Product browsing, stock level inquiries, movement logs.
    - `inventory.write`: Creating products, updating metadata, recording stock receipts, sales, consumption, and scrap.
    - `assets.read`: Fixed asset catalog inquiries, history inspections.
    - `assets.write`: Asset registration, location transfers, status transitions, maintenance logging.
    - `billing.read`: Dual composition with resource permissions for accessing sensitive financial valuations.
  - Zero Custom IAM: Resources defines **zero custom User, Token, Session, or Credential entities**.

---

## 4. Concurrency & Transaction Boundaries

1. **No Distributed Transactions (No 2PC)**:
   - Sales order creation and stock decrements are coordinated locally via orchestrator use cases. If `sellStock` returns `isFailure`, Sales cancels order checkout with a deterministic error.
2. **Optimistic Concurrency Control (OCC)**:
   - Both `InventoryItem` and `FixedAsset` maintain an integer `version` property.
   - Concurrent writes are protected via atomic version checks in PostgreSQL. Conflicting updates fail cleanly without corrupted balances or negative stock.
3. **Ledger Atomicity**:
   - Updates to physical stock and appends to the `StockMovement` ledger are committed within a single database transaction. If ledger writing fails, the stock change is completely rolled back.

---

## 5. Architectural Quality Evidence & Test Suites

The cross-domain boundaries and invariants are continuously validated by automated test suites:

- **Architecture Boundary Tests**: `packages/core/src/resources/resources-architecture-boundaries.spec.ts` (9 tests verifying layer purity, zero foreign ORM leakages, and zero cross-domain coupling).
- **Sales/Inventory Capability Tests**: `packages/core/src/resources/application/__tests__/sales-inventory-integration-port.spec.ts` (8 tests verifying retail sales, negative-stock prevention, defect defense, concurrency race conditions, and persistence failure resilience).
- **OpenAPI / Swagger Contract Tests**: `apps/api/src/resources/__tests__/resources-openapi.spec.ts` (32 tests verifying endpoint routes, schemas, and security models).
- **DTO Validation Tests**: `apps/api/src/resources/__tests__/resources-validation.spec.ts` (32 tests verifying input sanitization, boundaries, and forbidNonWhitelisted protection).
- **Full Platform Quality Gate**: `pnpm validate` passing cleanly across all 169 suites (1,815 tests, 0 failures, 10 projects built).
