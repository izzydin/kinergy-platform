# Persistence Boundaries & Infrastructure Isolation Specification

**Bounded Context**: `Resources Management`  
**Milestone**: Phase 6.4 — Persistence Layer  
**Document**: Architectural Boundary & Infrastructure Isolation Standard  
**Status**: `APPROVED`  
**Date**: August 27, 2026

---

## 1. Executive Summary

This document specifies the strict architectural boundaries between the **Resources Domain & Application Layers** and the **PostgreSQL + Prisma Infrastructure Persistence Layer**.

In adherence to Clean Architecture and Domain-Driven Design (DDD) principles, the persistence layer exists solely as an implementation detail of the domain's outbound repository ports. Under no circumstances may Prisma runtime types, generated model payloads, or database-specific idioms leak into domain entities, value objects, domain services, or application use cases.

---

## 2. Repository Contracts & Boundary Ports

All persistence operations are mediated exclusively through domain-defined repository interfaces located within the domain module:

```
packages/core/src/resources/domain/
  ├── inventory/repositories/
  │   └── inventory-item.repository.interface.ts  <-- Pure Domain Port
  └── assets/repositories/
      └── fixed-asset.repository.interface.ts     <-- Pure Domain Port
```

### 2.1 Interface Signatures

```typescript
export interface InventoryItemRepository {
  save(item: InventoryItem): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string): Promise<InventoryItem | null>;
  findAll(filter?: InventoryItemFilterOptions): Promise<InventoryItem[]>;
  count(filter?: InventoryItemFilterOptions): Promise<number>;
  delete(id: string): Promise<void>;
}

export interface FixedAssetRepositoryInterface {
  save(asset: FixedAsset): Promise<void>;
  findById(id: AssetId): Promise<FixedAsset | null>;
  findByAssetTag(assetTag: string): Promise<FixedAsset | null>;
  findAll(filter?: FixedAssetFilterOptions): Promise<FixedAsset[]>;
  count(filter?: FixedAssetFilterOptions): Promise<number>;
  delete(id: AssetId): Promise<void>;
}
```

### 2.2 Core Invariants of Repository Ports

1. **Aggregate Root Granularity**: Repositories only persist and reconstitute whole Aggregate Roots (`InventoryItem`, `FixedAsset`). Child entities (`StockMovement`, `AssetHistoryEvent`, `AssetMaintenanceRecord`) are never persisted or queried via independent repository ports.
2. **Pure Domain Types**: Methods accept and return domain primitives, Domain Value Objects (`AssetId`, `Sku`, `Money`, `Quantity`, `AssetLocation`), or Domain Aggregates.
3. **Absence of HTTP/Transport Concerns**: Repositories contain zero knowledge of HTTP request contexts, DTO formats, pagination headers, or GraphQL shapes.

---

## 3. Prisma Infrastructure Isolation

The domain and application layers maintain zero runtime or compile-time dependencies on `@prisma/client`.

| Concern                | Domain / Application Layer                                   | Infrastructure Persistence Layer                                 |
| :--------------------- | :----------------------------------------------------------- | :--------------------------------------------------------------- |
| **Model Types**        | Pure Domain Aggregates (`InventoryItem`, `FixedAsset`)       | Prisma Schema Entities (`Prisma.InventoryItemCreateInput`, etc.) |
| **Decimal & Numeric**  | Domain `Money` and `Quantity` Value Objects                  | `Prisma.Decimal` / `@db.Decimal(10, 2)`                          |
| **Enums**              | TypeScript Domain Enums (`StockMovementType`, `AssetStatus`) | Prisma Enums (1:1 string-backed)                                 |
| **Identifiers**        | Strongly-typed `AssetId`, `Sku`, `MovementId`                | Primitive `string` UUIDs / `@id @default(uuid())`                |
| **Optimistic Locking** | Integer `version: number` on Aggregate                       | Table column `version Int @default(1)`                           |
| **JSON Schemas**       | Encapsulated `LocationRef` / `AssetLocation` VOs             | Raw `Prisma.InputJsonValue` / `@map("location") Json`            |

---

## 4. Mapping Strategy & Reconstitution Purity

Mappers reside strictly within `packages/core/src/resources/infrastructure/persistence/prisma/mappers/`.

### 4.1 Two-Way Mapping Architecture

```
                      +-----------------------------+
                      |   Domain Aggregate Root     |
                      |  (Encapsulated Invariants)  |
                      +--------------+--------------+
                                     |
                         toPersistence() / toDomain()
                                     |
                      +--------------v--------------+
                      |     Prisma Data Record      |
                      |    (Relational Flat Row)    |
                      +-----------------------------+
```

### 4.2 Mapper Responsibilities

1. **`toPersistence(aggregate)`**:
   - Extracts raw primitives from Domain Value Objects (`Money.amount` -> `Prisma.Decimal`, `Quantity.value` -> `Prisma.Decimal`).
   - Maps aggregate properties to snake_case column-mapped Prisma input structures.
   - Serializes child entity arrays (`movements`, `historyEvents`, `maintenanceRecords`).
2. **`toDomain(rawPrismaRecord)`**:
   - Validates that database-persisted values satisfy Value Object contracts upon reconstitution.
   - Converts `Prisma.Decimal` instances to standard JavaScript IEEE-754 numbers rounded to Scale 2.
   - Populates private aggregate internal state while preserving historical version numbers.

---

## 5. Transaction Participation & Unit-of-Work

All aggregate persistence mutations participate in a single atomic database transaction (`$transaction`).

### 5.1 Atomicity Standard

- **Inventory Aggregate**: Persisting an updated `InventoryItem` and its new append-only `StockMovement` records occurs within the same `$transaction` callback. If any movement fails validation or insertion, the entire stock balance change rolls back.
- **Fixed Asset Aggregate**: Persisting an updated `FixedAsset` alongside its append-only `AssetHistoryEvent` or `AssetMaintenanceRecord` occurs within the same `$transaction` callback.

### 5.2 Optimistic Concurrency Control (OCC)

Repositories enforce OCC during updates:

```typescript
const priorVersion = aggregate.version - 1;
const result = await tx.model.updateMany({
  where: { id: aggregate.id, version: priorVersion },
  data: { ...persistedFields, version: aggregate.version },
});

if (result.count === 0) {
  throw new OptimisticLockException(aggregateName, aggregate.id, priorVersion);
}
```

---

## 6. Error Mapping & Diagnostic Translation

Database-level and Prisma-specific exceptions are translated into intentional domain and infrastructure errors:

| Underlying Database Condition      | Prisma Error Code            | Translated Exception              | Error Category             |
| :--------------------------------- | :--------------------------- | :-------------------------------- | :------------------------- |
| Version mismatch / concurrent edit | `updateMany.count === 0`     | `OptimisticLockException`         | Concurrency Conflict       |
| Duplicate SKU or Asset Tag         | `P2002` (Unique constraint)  | `DuplicateResourceException`      | Domain Invariant Violation |
| Foreign key constraint violation   | `P2003` (Foreign key failed) | `InvalidReferenceException`       | Relational Integrity Error |
| Record not found on update/delete  | `P2025`                      | `ResourceNotFoundException`       | NotFound Error             |
| General connection failure         | `P1001` / `P1002`            | `PersistenceUnavailableException` | Infrastructure Error       |

---

## 7. Prevention of Unsafe Mutations

To guarantee that domain invariants established in Phase 6.1, 6.2, and 6.3 can never be bypassed at runtime:

1. **No Partial Bypass Updates**: Repositories expose NO partial mutation methods such as `updateCurrentStock()`, `setQuantityOnHand()`, or `setStatus()`.
2. **Encapsulated Invariant Enforcement**: The only way to alter persisted state is to load the Aggregate Root, execute a domain business method (e.g., `item.receiveStock()`, `asset.sendToMaintenance()`), and save the resulting Aggregate back via `save(aggregate)`.
3. **Append-Only Immutability**: `StockMovement`, `AssetHistoryEvent`, and `AssetMaintenanceRecord` records are strictly append-only. Repository `save()` invokes idempotent `upsert` or `create` with no update mutations allowed on historical rows.
