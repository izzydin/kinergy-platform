# Fixed Asset Application Layer Architectural Baseline & Discovery

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets (Capital Equipment)`  
**Milestone**: Phase 6.6 — Fixed Asset Application Layer  
**Architectural Role**: Principal Software Architect & Senior Backend Engineer  
**Status**: `APPROVED BASELINE`  
**Date**: August 29, 2026

---

## 1. Executive Summary

Milestone 6.6 establishes the backend application orchestration layer for **Fixed Assets** (physical capital equipment, clinical rehabilitation devices, kinesiology machinery, and facility assets).

Fixed Assets are non-fungible capital items characterized by:

- Explicit individual asset tags (`AST-GYM-001`, `AST-CLN-042`) and serial tracking.
- Physical facility/room placement (`AssetLocation`).
- Strict operational lifecycle state machines (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`).
- Condition ratings (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`).
- Servicing and maintenance history (`AssetMaintenanceRecord`).
- Append-only provenance audit trail (`AssetHistoryEvent`).
- Economic valuation tracking (purchase cost vs current estimated book value).

This milestone translates the certified domain model and persistence schema into explicit, authorized, transactional, and auditable application workflows.

---

## 2. Existing Application Architecture & Conventions

### 2.1 Clean Architecture Alignment

The Resources bounded context strictly follows Clean Architecture and DDD principles established across Kinergy:

```
packages/core/src/resources/
├── domain/
│   ├── assets/                       # Fixed Asset Domain Model (Milestone 6.2/6.3)
│   │   ├── entities/                 # AssetHistoryEvent, AssetMaintenanceRecord
│   │   ├── enums/                    # AssetCategory, AssetStatus, AssetCondition, AssetHistoryEventType
│   │   ├── events/                   # Pure domain events (AssetCreated, Transferred, Sold, etc.)
│   │   ├── exceptions/               # InvalidAssetStateException, AssetNotFoundException
│   │   ├── repositories/             # FixedAssetRepositoryInterface
│   │   ├── services/                 # AssetLifecycleStateMachine
│   │   ├── value-objects/            # AssetId, AssetLocation, MaintenanceRecordId, AssetHistoryId
│   │   └── fixed-asset.aggregate.ts  # FixedAsset Aggregate Root
│   ├── inventory/                    # Consumable Inventory Domain Model (Milestone 6.1)
│   └── shared/                       # AggregateRoot, DomainEvent, Entity, ValueObject
├── application/                      # Milestone 6.5 / 6.6 Application Layer
│   ├── commands/                     # Command objects (Write intent)
│   ├── queries/                      # Query objects (Read intent)
│   ├── handlers/                     # Command & Query Handler implementations
│   ├── dtos/                         # Application DTOs (Serialization & UI presentation)
│   ├── mappers/                      # Application DTO mappers
│   ├── ports/                        # Outbound ports (e.g. ResourcesEventPublisherPort)
│   └── shared/                       # ApplicationResult, CommandHandler, QueryHandler
└── infrastructure/
    └── persistence/prisma/           # PostgreSQL/Prisma implementation (Milestone 6.4)
        ├── mappers/                  # Prisma <-> Domain mappers
        └── repositories/             # PrismaFixedAssetRepository, PrismaInventoryItemRepository
```

### 2.2 Strict Boundary Isolation

- **Domain Independence**: The `domain/` layer has zero dependencies on Prisma, NestJS, HTTP frameworks, or infrastructure packages.
- **Application Orchestration**: The `application/` layer defines ports and command/query contracts. It depends only on `domain/` and `@kinergy/types`.
- **Infrastructure Encapsulation**: `@prisma/client` and raw database transactions are strictly isolated in `infrastructure/persistence/prisma/`.

---

## 3. Existing Use-Case & CQRS Conventions

1. **Command / Query Responsibility Segregation (CQRS)**:
   - **Commands**: Named with imperative verbs (`CreateFixedAssetCommand`, `TransferFixedAssetLocationCommand`, `RecordAssetMaintenanceCommand`, `RetireFixedAssetCommand`, `SellFixedAssetCommand`).
   - **Queries**: Named with retrieval verbs (`GetFixedAssetByIdQuery`, `ListFixedAssetsQuery`, `GetFixedAssetHistoryQuery`, `GetFixedAssetsValuationQuery`).
2. **Standard Result Container (`ApplicationResult<TValue, TError>`)**:
   - Handlers do not leak unhandled runtime exceptions.
   - Handlers return `ApplicationResult.ok(dto)` on success or `ApplicationResult.fail(message)` on business invariant rejection.
3. **Execution Pattern**:
   ```typescript
   export interface CommandHandler<TCommand, TResult> {
     execute(command: TCommand): Promise<ApplicationResult<TResult, string>>;
   }
   ```

---

## 4. Authorization & Actor Propagation Conventions

1. **Explicit Actor Identification**:
   - Every mutating command and sensitive audit query requires an authenticated `actorId` and `tenantId`.
   - Security context is resolved at the API transport layer (JWT / Session) and mapped into strongly-typed command properties.
   - The aggregate records `recordedByUserId = actorId` on all generated `AssetHistoryEvent` and `AssetMaintenanceRecord` entries.
2. **RBAC Permission Matrix**:
   - `resources:asset:create` -> Register new capital equipment.
   - `resources:asset:update` -> Edit descriptive metadata and notes.
   - `resources:asset:transfer` -> Transfer physical room/facility location.
   - `resources:asset:status` -> Change operational lifecycle status.
   - `resources:asset:condition` -> Update condition rating.
   - `resources:asset:maintenance` -> Record maintenance and repairs.
   - `resources:asset:revalue` -> Update current estimated value.
   - `resources:asset:retire` -> Decommission asset permanently.
   - `resources:asset:sell` -> Liquidate asset for salvage value.
   - `resources:asset:read` -> View asset details and listings.
   - `resources:asset:history` -> Audit timeline inspection.
   - `resources:asset:valuation` -> Financial book value queries.

---

## 5. Transaction & Concurrency Conventions

1. **Optimistic Concurrency Control (OCC)**:
   - `FixedAsset` aggregate maintains an integer `version` field.
   - Every mutation increments `_version += 1` and updates `_updatedAt`.
   - `PrismaFixedAssetRepository.save()` executes within a Prisma `$transaction`:
     ```sql
     UPDATE "fixed_assets"
     SET ..., version = version + 1
     WHERE id = :id AND version = :priorVersion
     ```
   - If `result.count === 0`, an `OptimisticLockException` is thrown and the transaction rolls back cleanly.
2. **Append-Only Children Persistence**:
   - Generated `AssetHistoryEvent` rows and `AssetMaintenanceRecord` rows are inserted within the same transaction.
   - Rollback leaves zero orphaned audit or servicing rows.

---

## 6. Query, Pagination, and Sorting Conventions

1. **List Assets Query Contract (`ListFixedAssetsQuery`)**:
   - **Multi-Dimensional Filters**: `tenantId`, `category`, `status`, `condition`, `facilityId`, `roomId`, `search` (case-insensitive substring match against `name`, `assetTag`, `description`).
   - **Whitelist Sorting**: `name`, `assetTag`, `category`, `purchaseDate`, `purchaseValueAmount`, `currentEstimatedValueAmount`, `status`, `condition`, `createdAt`, `updatedAt` (default: `name: 'asc'`).
   - **Stable Tie-Breaking**: Appends `id: 'asc'` as secondary sort key to prevent pagination jitter.
   - **Bounded Pagination**: `page` (default 1), `pageSize` (default 20, max 100), returning `{ items, total, page, pageSize, totalPages }`.
2. **Asset Valuation Query Contract (`GetFixedAssetsValuationQuery`)**:
   - Aggregates total acquisition cost, total current estimated value, and category breakdowns.
   - Preserves financial precision in fixed integer cents (`Scale 2`).

---

## 7. Audit & History Conventions

1. **Immutable Historical Provenance**:
   - `AssetHistoryEvent` captures every significant business lifecycle mutation:
     - `CREATED`, `UPDATED`, `TRANSFERRED`, `STATUS_CHANGED`, `CONDITION_CHANGED`, `MAINTENANCE_RECORDED`, `VALUE_UPDATED`, `RETIRED`, `SOLD`.
   - Every history event stores:
     - `assetId`: Target aggregate ID.
     - `eventType`: Authoritative event type enum.
     - `description`: Human-readable summary (e.g. _"Location transferred from [Room 101] to [Room 204]: Relocated for rehab"_).
     - `details`: Structured JSON snapshot containing `prior` and `new` field values.
     - `recordedByUserId`: Authenticated user ID.
     - `recordedAt`: Immutable timestamp.
2. **Meaningful Audit Rule**:
   - No-op updates (e.g. updating name to identical string) produce **zero** history entries.
   - Decommissioned / sold assets maintain full historical readability.

---

## 8. Required Fixed Asset Use Cases (Milestone 6.6)

| Conceptual Use Case       | Concrete Application Command / Query                 | Concrete Handler                                         |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| **CreateAsset**           | `CreateFixedAssetCommand`                            | `CreateFixedAssetHandler`                                |
| **UpdateAsset**           | `UpdateFixedAssetDetailsCommand`                     | `UpdateFixedAssetDetailsHandler`                         |
| **GetAsset**              | `GetFixedAssetByIdQuery` / `GetFixedAssetByTagQuery` | `GetFixedAssetByIdHandler` / `GetFixedAssetByTagHandler` |
| **ListAssets**            | `ListFixedAssetsQuery`                               | `ListFixedAssetsHandler`                                 |
| **TransferAsset**         | `TransferFixedAssetLocationCommand`                  | `TransferFixedAssetLocationHandler`                      |
| **ChangeAssetStatus**     | `ChangeFixedAssetStatusCommand`                      | `ChangeFixedAssetStatusHandler`                          |
| **RetireAsset**           | `RetireFixedAssetCommand`                            | `RetireFixedAssetHandler`                                |
| **SellAsset**             | `SellFixedAssetCommand`                              | `SellFixedAssetHandler`                                  |
| **ChangeAssetCondition**  | `UpdateFixedAssetConditionCommand`                   | `UpdateFixedAssetConditionHandler`                       |
| **RecordMaintenance**     | `RecordAssetMaintenanceCommand`                      | `RecordAssetMaintenanceHandler`                          |
| **UpdateAssetValue**      | `UpdateFixedAssetValuationCommand`                   | `UpdateFixedAssetValuationHandler`                       |
| **GetAssetHistory**       | `GetFixedAssetHistoryQuery`                          | `GetFixedAssetHistoryHandler`                            |
| **GetMaintenanceHistory** | `GetFixedAssetMaintenanceHistoryQuery`               | `GetFixedAssetMaintenanceHistoryHandler`                 |
| **GetAssetValue**         | `GetFixedAssetsValuationQuery`                       | `GetFixedAssetsValuationHandler`                         |

---

## 9. Proposed Implementation Sequence

1. **Step 1: Application DTOs & Mappers**:
   - Define `FixedAssetDTO`, `AssetLocationDTO`, `AssetHistoryEventDTO`, `AssetMaintenanceRecordDTO`, `FixedAssetsValuationDTO`.
   - Build pure mappers converting domain aggregates and entities to transport DTOs.
2. **Step 2: Asset Lifecycle & Mutation Commands**:
   - Implement `CreateFixedAssetHandler`, `UpdateFixedAssetDetailsHandler`, `TransferFixedAssetLocationHandler`.
   - Implement lifecycle commands: `ChangeFixedAssetStatusHandler`, `RetireFixedAssetHandler`, `SellFixedAssetHandler`.
   - Implement condition and valuation commands: `UpdateFixedAssetConditionHandler`, `UpdateFixedAssetValuationHandler`.
   - Implement maintenance command: `RecordAssetMaintenanceHandler`.
3. **Step 3: Deterministic Query Handlers**:
   - Implement `GetFixedAssetByIdHandler`, `GetFixedAssetByTagHandler`, `ListFixedAssetsHandler`.
   - Implement audit query handlers: `GetFixedAssetHistoryHandler`, `GetFixedAssetMaintenanceHistoryHandler`.
   - Implement aggregate valuation query: `GetFixedAssetsValuationHandler`.
4. **Step 4: Comprehensive QA Hardening & Verification**:
   - Multi-step asset lifecycle tests (Create -> Transfer -> Damage -> Maintenance -> Active -> Retire -> Sell).
   - Invariant enforcement verification (prohibiting mutations on `SOLD` or `RETIRED` assets).
   - OCC race condition tests (competing transfers or maintenance records).
   - Failure rollback atomicity verification.
5. **Step 5: Architectural Documentation & Milestone Review**:
   - Update `fixed-assets-use-cases.md`, `fixed-assets-operations.md`, `fixed-assets-testing.md`.
   - Conduct Milestone 6.6 Quality Gate audit.

---

## 10. Architectural Risks & Gaps

| Risk / Gap                             | Severity | Mitigation Strategy                                                                                                        |
| -------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Location Reference Inconsistencies** | Medium   | Validate `facilityId` format and room existence via `AssetLocation` value object invariants.                               |
| **Terminal State Bypass**              | High     | Enforce `assertNotSold()` and `assertNotRetired()` guards in aggregate methods before state mutation.                      |
| **Floating-Point Drift in Valuation**  | Medium   | Use `Money` Scale 2 integer cents representation across all valuation sums.                                                |
| **Unbounded History Query Latency**    | Low      | Index `asset_history_events(asset_id, recorded_at)` and `asset_maintenance_records(asset_id, service_date)` in PostgreSQL. |
