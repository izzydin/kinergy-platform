# Resources Management Bounded Context — Architecture, Boundaries & Invariants Specification

- **Status**: Authoritative Bounded Context Architecture Baseline
- **Location**: `packages/core/src/resources/` (Domain & Application), `apps/api/src/resources/` (API & Adapters), `apps/web/src/modules/resources/` (Frontend)
- **Owners**: Principal Software Engineer, Software Architecture Team
- **Milestone Baseline**: Phase 6 (Milestones 6.0 – 6.17)
- **Governing ADRs**: [ADR-0081](../../architecture/resources/adr/0081-resources-bounded-context-topology-and-domain-segregation.md) through [ADR-0107](../../architecture/resources/adr/0107-phase-6-multi-tier-verification-architecture-and-proof-boundary-testing-strategy.md)
- **Onboarding & Navigation**: [Senior Engineer Onboarding & Architecture Navigation Guide](../../architecture/resources/onboarding.md)

---

## 1. Context Purpose & Business Capability

The **Resources Management Bounded Context** is the authoritative operational domain within the Kinergy platform responsible for providing complete visibility into everything the business owns and consumes.

Physical resources in a health, wellness, gym, and clinical facility fall into two fundamentally distinct sub-domains that share the mission of facility operational readiness:

1. **Consumable Inventory**: High-volume, fungible operational and clinical supplies (therapeutic tape, electrodes, sanitizing wipes, nutritional drinks, supplements) tracked via numerical stock levels, reorder thresholds, unit costs, and an immutable double-entry transaction ledger.
2. **Fixed Assets**: Low-volume, non-fungible durable capital property (commercial gym machinery, clinical ultrasound units, treatment tables, IT hardware, facility fixtures) tracked via unique asset tags, serial numbers, operational lifecycle state machines, condition grades, maintenance service histories, and periodic revaluations.

---

## 2. The Phase 6 Sub-Domain Boundary

A critical architectural decision ([ADR-0081](../../architecture/resources/adr/0081-resources-bounded-context-topology-and-domain-segregation.md), [ADR-0082](../../architecture/resources/adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)) was made to partition Resources Management into two separate sub-domains rather than creating a monolithic "Resource" god-class.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RESOURCES MANAGEMENT BOUNDED CONTEXT                           │
│                                                                                        │
│   ┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐   │
│   │         Consumable Inventory        │    │             Fixed Assets            │   │
│   ├─────────────────────────────────────┤    ├─────────────────────────────────────┤   │
│   │ • Fungible Items (SKU-based)        │    │ • Non-Fungible Capital Property     │   │
│   │ • Aggregate Quantity (quantityOnHand)│   │ • Individually Tagged (assetTag)    │   │
│   │ • Depletion / Restock Lifecycle     │    │ • Multi-State Lifecycle Machine     │   │
│   │ • Append-Only Stock Movements       │    │ • Maintenance & Servicing Records   │   │
│   │ • OCC on Item Balance (version)     │    │ • Condition Grading (EXCELLENT..OOS)│   │
│   │ • Unit Cost / Purchase Cost Basis   │    │ • Acquisition & Depreciation Value  │   │
│   └──────────────────┬──────────────────┘    └──────────────────┬──────────────────┘   │
│                      │                                          │                      │
│                      └────────────────────┬─────────────────────┘                      │
│                                           ▼                                            │
│                      ┌──────────────────────────────────────────┐                      │
│                      │        Synthesized Read Model            │                      │
│                      │    (Resource Overview & Valuation)       │                      │
│                      └──────────────────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why Consumable Inventory and Fixed Assets are Distinct Concepts

| Dimension               | Consumable Inventory                                                                                                                                                                               | Fixed Assets                                                                                                                                                                                                            |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fungibility**         | **Fungible**: Two units of the same SKU (e.g. roll of kinesiology tape) are completely interchangeable.                                                                                            | **Non-Fungible**: Each asset is distinct and uniquely tracked by an `assetTag` and serial number. Machine A is not Machine B even if they are the same model.                                                           |
| **Lifecycle Semantics** | **Depletion & Consumption**: Items are received, held in stock, and consumed or sold until quantity reaches zero.                                                                                  | **Operational Durability**: Assets persist over months or years, transitioning through states: `ACTIVE` $\leftrightarrow$ `UNDER_MAINTENANCE` $\leftrightarrow$ `DAMAGED` $\rightarrow$ `RETIRED` $\rightarrow$ `SOLD`. |
| **Mutation Mechanics**  | **Double-Entry Ledger**: Stock balances are never directly overwritten; every quantity change produces an immutable, append-only `StockMovement` row recording `quantityDelta` and `balanceAfter`. | **State Transitions & Service Logs**: Property changes raise domain events (`AssetStatusChanged`, `AssetTransferred`), append an `AssetHistoryEvent`, and log `AssetMaintenanceRecord` entries.                         |
| **Concurrency Model**   | High-contention Optimistic Concurrency Control (OCC) guarding numerical balances against race conditions and preventing negative stock balances.                                                   | Low-contention OCC guarding single-asset property updates and guaranteeing deterministic lifecycle transitions.                                                                                                         |
| **Valuation Model**     | Dynamic aggregate valuation: $\sum (\text{quantityOnHand} \times \text{purchaseCostAmount})$.                                                                                                      | Asset-specific capital valuation: `purchaseValueAmount` and periodically updated `currentEstimatedValueAmount`.                                                                                                         |
| **Terminal State**      | `ARCHIVED` (Item no longer restocked or purchased; stock reaches 0).                                                                                                                               | `SOLD` (**Terminal State [AST-INV-1]**; irreversibly locks the record from any future state, maintenance, or location mutation).                                                                                        |

---

## 3. Bounded Context Catalog & Ownership Matrix

To maintain system integrity, every domain concept has exactly one authoritative owner. No other bounded context may define, mutate, or govern the business invariants of that concept.

```mermaid
graph TD
    subgraph IAM ["IAM Bounded Context (Phase 1)"]
        IAM_AUTH["AuthenticationGuard / AuthorizationGuard"]
        IAM_PERM["Permissions: inventory.read/write, assets.read/write, billing.read"]
        IAM_ACTOR["AuthenticatedUserContext (userId)"]
    end

    subgraph CLT ["Client Management Context (Phase 2)"]
        CLT_AGG["Client Aggregate Root"]
    end

    subgraph SCHED ["Scheduling Context (Phase 3)"]
        SCHED_ROOM["Room / SchedulableResource Aggregate"]
        SCHED_CAL["Appointment Calendar Engine"]
    end

    subgraph SALES ["Commercial Sales (Deferred / Not Implemented)"]
        SALES_PORT["In-Process Client: InventoryStockDecrementPort"]
    end

    subgraph RES ["Resources Management Bounded Context (Phase 6)"]
        subgraph INV ["Consumable Inventory Sub-Domain"]
            INV_AGG["InventoryItem Aggregate"]
            INV_MVT["StockMovement Ledger"]
            INV_PORT["InventoryStockDecrementPort (Hexagonal Port)"]
        end

        subgraph AST ["Fixed Assets Sub-Domain"]
            AST_AGG["FixedAsset Aggregate"]
            AST_SM["AssetLifecycleStateMachine"]
            AST_HIST["AssetHistoryEvent / AssetMaintenanceRecord"]
        end

        subgraph OVR ["Resources Overview (Synthesized Read Model)"]
            OVR_SYNTH["GetResourceOverviewHandler / Valuation Aggregates"]
        end
    end

    %% IAM dependencies
    IAM_AUTH -->|Guards API Endpoints| INV_AGG
    IAM_AUTH -->|Guards API Endpoints| AST_AGG
    IAM_AUTH -->|Guards API Endpoints| OVR_SYNTH
    IAM_ACTOR -.->|Injected scalar actor ID| INV_MVT
    IAM_ACTOR -.->|Injected scalar actor ID| AST_HIST

    %% Client decoupling
    CLT_AGG -.->|Pure scalar clientId string in movements| INV_MVT

    %% Scheduling decoupling
    SCHED_ROOM -.->|Informational AssetLocation VO: roomId, facilityId| AST_AGG

    %% Sales integration port
    SALES_PORT -->|In-Process Method Call: sellStock()| INV_PORT
    INV_PORT --> INV_AGG

    %% Overview aggregation
    INV_AGG -->|Reads Balances & Cost| OVR_SYNTH
    AST_AGG -->|Reads Status & Valuation| OVR_SYNTH

    classDef primary fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef secondary fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#cbd5e1;
    classDef deferred fill:#1c1917,stroke:#f59e0b,stroke-width:1px,stroke-dasharray: 5 5,color:#fbbf24;

    class INV_AGG,AST_AGG,OVR_SYNTH primary;
    class IAM_AUTH,CLT_AGG,SCHED_ROOM secondary;
    class SALES_PORT deferred;
```

### Authoritative Responsibility Matrix

| Bounded Context                   | Implementation Location                                                             | Authoritative Owner Of                                                                                                                         | Allowed Consumers                                                                                           | Explicit Non-Responsibilities                                                                                                 |
| :-------------------------------- | :---------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **IAM**                           | `apps/api/src/platform/identity/`                                                   | `User`, `Role`, `Permission`, JWT verification, request user context injection.                                                                | All bounded contexts via `@UseGuards()` and `@CurrentUser()`.                                               | ❌ Does not define resource schemas, stock levels, or asset data.                                                             |
| **Client Management**             | `modules/client/`                                                                   | `Client` aggregate, customer profile, client longitudinal timeline.                                                                            | Scheduling, Kinesiology, Gym. Resources accepts an optional scalar `clientId: string`.                      | ❌ Does not own facility assets or inventory stock. Client deletions cannot cascade-delete resource ledgers.                  |
| **Scheduling**                    | `packages/core/src/scheduling/`                                                     | `Appointment`, `RecurrenceSeries`, `Room`, room calendar availability.                                                                         | Kinesiology, Gym, Reception UI. Resources accepts an informational `roomId: string` inside `AssetLocation`. | ❌ Does not own asset condition, maintenance logs, or equipment lifecycle. Equipment maintenance does not lock room bookings. |
| **Consumable Inventory**          | `packages/core/src/resources/domain/inventory/`                                     | `InventoryItem` aggregate, `StockMovement` ledger, `quantityOnHand`, reorder alerts, negative-stock prevention `[INV-INV-2]`, OCC version.     | Reception desk staff (via HTTP API), future Sales module (via `InventoryStockDecrementPort`).               | ❌ Does not own commercial orders, sales receipts, client billing accounts, or POS payment transactions.                      |
| **Fixed Assets**                  | `packages/core/src/resources/domain/assets/`                                        | `FixedAsset` aggregate, `AssetLifecycleStateMachine` (5x5 matrix), condition ratings, location transfers, maintenance logs, asset revaluation. | Facility managers, clinical practitioners, maintenance technicians.                                         | ❌ Does not own room calendar reservations, consumable supplies, or clinical treatment session documentation.                 |
| **Resources Overview**            | `packages/core/src/resources/application/handlers/get-resource-overview.handler.ts` | Synthesized operational read models, combined capital valuations (`inventoryValuation + assetCurrentEstimatedValue`).                          | Executive management dashboard, facility managers (`billing.read` gated).                                   | ❌ Pure read model. Executes zero mutations and maintains zero independent relational tables.                                 |
| **Commercial Sales** _(Deferred)_ | _Not Implemented in Repository_                                                     | _Future_: Sales orders, point-of-sale carts, customer invoices, payment transactions.                                                          | Front desk POS terminals, client mobile apps.                                                               | ❌ Will NOT manage physical stock or mutate inventory tables directly. Must consume `InventoryStockDecrementPort`.            |

---

## 4. Dependency Direction & Clean Architecture Layering

The Resources Bounded Context strictly complies with the **Clean Architecture Dependency Rule**: source code dependencies point inward toward high-level business rules.

```
       ┌──────────────────────────────────────────────────────────┐
       │                ADAPTERS / PRESENTATION                   │
       │  • Controllers: InventoryController, FixedAssetsCtrl     │
       │  • DTOs: CreateInventoryItemDto, ReceiveStockDto, etc.   │
       │  • Frontend: apps/web/src/modules/resources/             │
       └────────────────────────────┬─────────────────────────────┘
                                    │ calls
                                    ▼
       ┌──────────────────────────────────────────────────────────┐
       │                   APPLICATION LAYER                      │
       │  • Command Handlers: ReceiveStockHandler, TransferHandler │
       │  • Query Handlers: GetStockLevelHandler, ListAssetsHdlr  │
       │  • Ports: IInventoryItemRepository, IFixedAssetRepo,     │
       │           InventoryStockDecrementPort                    │
       └────────────────────────────┬─────────────────────────────┘
                                    │ orchestrates
                                    ▼
       ┌──────────────────────────────────────────────────────────┐
       │                     DOMAIN LAYER                         │
       │  • Aggregates: InventoryItem, FixedAsset                 │
       │  • Entities: StockMovement, AssetMaintenanceRecord       │
       │  • State Machines: AssetLifecycleStateMachine            │
       │  • Value Objects: Quantity, Money, SKU, AssetLocation    │
       │  • Invariants: [INV-INV-1..4], [AST-INV-1..4]            │
       │  • Domain Events: StockReceivedEvent, AssetRetiredEvent  │
       └────────────────────────────▲─────────────────────────────┘
                                    │ implements ports
       ┌────────────────────────────┴─────────────────────────────┐
       │                INFRASTRUCTURE / PERSISTENCE              │
       │  • Prisma Repositories: PrismaInventoryItemRepository,   │
       │                         PrismaFixedAssetRepository       │
       │  • Relational Mapping: Prisma Mappers                    │
       │  • Database: PostgreSQL with CHECK constraints and OCC   │
       └──────────────────────────────────────────────────────────┘
```

### Actual Repository Directory Mapping

```
packages/core/src/resources/
├── domain/                                  ◄── Core Domain Layer (Framework-Agnostic)
│   ├── inventory/                           ◄── Consumable Inventory Domain
│   │   ├── inventory-item.aggregate.ts      ◄── Invariants [INV-INV-1..4], stock mutations
│   │   ├── entities/stock-movement.entity.ts◄── Immutable ledger entry
│   │   ├── value-objects/                   ◄── SKU, Quantity, Money, LocationRef
│   │   ├── enums/                           ◄── StockMovementType, InventoryCategory, UnitOfMeasure
│   │   ├── events/                          ◄── StockReceived, StockSold, StockScrapped
│   │   └── repositories/                    ◄── IInventoryItemRepository (Port)
│   ├── assets/                              ◄── Fixed Assets Domain
│   │   ├── fixed-asset.aggregate.ts         ◄── Invariants [AST-INV-1..4], lifecycle mutations
│   │   ├── entities/                        ◄── AssetHistoryEvent, AssetMaintenanceRecord
│   │   ├── services/                        ◄── AssetLifecycleStateMachine (5x5 transition matrix)
│   │   ├── value-objects/                   ◄── AssetLocation, AssetId, Money
│   │   ├── enums/                           ◄── AssetStatus, AssetCondition, AssetCategory
│   │   ├── events/                          ◄── AssetStatusChanged, AssetTransferred, AssetRetired
│   │   └── repositories/                    ◄── IFixedAssetRepository (Port)
│   └── shared/                              ◄── AggregateRoot, ValueObject, DomainEvent base classes
├── application/                             ◄── Application Layer (CQRS Orchestration)
│   ├── commands/ & queries/                 ◄── Command and Query definitions
│   ├── handlers/                            ◄── Command and Query execution handlers
│   ├── mappers/                             ◄── Domain-to-DTO serialization mappers
│   └── ports/                               ◄── In-process ports (InventoryStockDecrementPort)
└── infrastructure/persistence/prisma/       ◄── Infrastructure Layer (Prisma Adapters)
    ├── repositories/                        ◄── PrismaInventoryItemRepository, PrismaFixedAssetRepository
    └── mappers/                             ◄── Prisma entity to Domain model mappers

apps/api/src/resources/                     ◄── API Adapter Layer (NestJS)
├── controllers/                             ◄── InventoryController, FixedAssetsController, etc.
├── dto/                                     ◄── Request/Response DTOs with class-validator
├── resources.module.ts                      ◄── NestJS module registration and DI wiring
└── __tests__/ & __e2e__/                    ◄── Contract, Security, and E2E Journey test suites

apps/web/src/modules/resources/              ◄── Frontend Presentation Layer (React / Vite)
├── inventory/                               ◄── List, Create, Edit, Detail, Movements, LowStock pages
├── assets/                                  ◄── List, Create, Edit, Detail, Overview pages & dialogs
└── overview/                                ◄── Unified Resource Overview Dashboard
```

---

## 5. Cross-Domain Integration Architecture (Milestone 6.16)

Milestone 6.16 established the formal boundaries and decoupling rules between Resources Management and the rest of the platform:

### 5.1 Client Management ↔ Resources Decoupling ([ADR-0104](../../architecture/resources/adr/0104-resources-cross-domain-decoupling-and-client-boundary-invariant.md))

- **Rule**: Resources references Clients exclusively via unconstrained scalar identifiers (`clientId: string`, `referenceId?: string`).
- **Persistence Reality**:
  - Zero foreign keys exist between `inventory_items`, `stock_movements`, `fixed_assets` and the `clients` table.
  - Deleting, archiving, or anonymizing a Client (e.g. GDPR "Right to Be Forgotten") will **never cascade-delete or corrupt** inventory balances, historical stock movements, or capital asset maintenance logs.

### 5.2 Scheduling ↔ Fixed Assets Informational Coordinates ([ADR-0105](../../architecture/resources/adr/0105-scheduling-and-fixed-asset-decoupling-invariant.md))

- **Rule**: Physical placement is modeled as an informational Value Object (`AssetLocation: { facilityId: string, roomId?: string, zone?: string, description?: string }`).
- **Why Relational FKs Were Rejected**:
  - Schedulable room calendars reserve **Spaces** for consultations. Equipment is an amenity within the space.
  - If a piece of equipment enters repair (`UNDER_MAINTENANCE`), the physical room remains operational for other therapies. Relational coupling would cause cascading calendar cancellations.
  - Assets frequently reside in non-schedulable locations (storage closets, reception lounges, off-site repair facilities).

### 5.3 Sales ↔ Consumable Inventory Hexagonal Port ([ADR-0106](../../architecture/resources/adr/0106-sales-inventory-integration-boundary-and-stock-ownership-policy.md))

- **Rule**: No Sales module currently exists in the repository. Speculative sales tables were rejected.
- **Integration Boundary**: The future integration contract is formalized and verified as an in-process hexagonal port:
  ```typescript
  export interface InventoryStockDecrementPort {
    sellStock(params: DecrementStockParams): Promise<ApplicationResult<StockMovementDto>>;
  }
  ```
- **Stock Ownership Invariant**:
  - The Inventory domain strictly owns all stock decrement rules, current balances (`quantityOnHand`), ledger writing, negative-stock defense (`[INV-INV-2]`), and OCC retries.
  - Internal monolith modules must **never** make localhost loopback HTTP requests (`POST /api/v1/resources/inventory/:id/sell`) to deduct stock. They invoke `InventoryStockDecrementPort` in-process.

### 5.4 IAM & Security Integration

- **Rule**: Phase 6 defines **zero custom User, Role, Session, or Credential tables**.
- **Enforcement**:
  - Authentication: `AuthenticationGuard` extracts the JWT bearer token and injects `AuthenticatedUserContext`.
  - Authorization: `AuthorizationGuard` evaluates server-side permissions:
    - `inventory.read` / `inventory.write`: Stock catalog and ledger operations.
    - `assets.read` / `assets.write`: Capital asset lifecycle, condition, and maintenance.
    - `billing.read`: Dual-permission requirement for sensitive financial valuation data (ADR-0095).

---

## 6. Concurrency & Transaction Boundaries

1. **Unit of Work & Ledger Atomicity**:
   - Updates to physical stock and appends to the `StockMovement` ledger are committed within a single atomic database transaction (`this.prisma.$transaction(...)`). If appending the movement ledger fails, the stock change rolls back completely.
2. **Optimistic Concurrency Control (OCC)**:
   - Both `InventoryItem` and `FixedAsset` maintain an integer `version` field.
   - Concurrent updates check `where: { id, version: priorVersion }`. Conflicting simultaneous updates return `count === 0` and throw `OptimisticLockException`.
3. **Double-Entry Balance Verification**:
   - An inventory item's `quantityOnHand` is mathematically provable by summing all historical `quantityDelta` values from its `stock_movements` ledger:
     $$\text{quantityOnHand} \equiv \sum_{i=1}^{n} \text{quantityDelta}_i$$
   - Invariant tests in `inventory-stock-mutation-invariants.spec.ts` prove this equality holds across all mutation types.

---

## 7. Architectural Verification & Evidence

The Phase 6 architecture is continuously verified by **103 test suites**:

- **Layer Purity & Boundary Tests**: `packages/core/src/resources/resources-architecture-boundaries.spec.ts` (proves zero ORM leakages into domain and zero cross-context coupling).
- **In-Process Port Tests**: `packages/core/src/resources/application/__tests__/sales-inventory-integration-port.spec.ts`.
- **Concurrency Race Condition Tests**: `packages/core/src/resources/application/__tests__/inventory-concurrency-race-conditions.spec.ts`.
- **Authoritative State Machine Tests**: `packages/core/src/resources/domain/__tests__/asset-lifecycle-state-machine.spec.ts` (verifies the complete 5x5 transition matrix).
- **External API & Security Tests**: `apps/api/src/resources/__tests__/` (verifies OpenAPI specifications, DTO whitelist validation, and 401/403 security policies).
- **End-to-End Business Scenarios**: `apps/api/src/resources/__e2e__/` (multi-step operational journeys for facility managers).
