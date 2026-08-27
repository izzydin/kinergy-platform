# Milestone 6.4: Resources Persistence Decisions & Precision Specification

- **Author**: Principal Database Engineer & Domain Architect
- **Date**: 2026-08-27
- **Status**: **AUTHORITATIVE ARCHITECTURAL SPECIFICATION (APPROVED & ACTIVE)**
- **Domain**: Phase 6 — Resources Management (Consumable Inventory & Fixed Assets)
- **Governing ADRs**:
  - [ADR-0081: Resources Bounded Context Topology & Domain Segregation](./adr/0081-resources-bounded-context-topology-and-domain-segregation.md)
  - [ADR-0082: Fixed Asset Domain Modeling & Segregation from Inventory](./adr/0082-fixed-asset-domain-modeling-and-complete-segregation-from-inventory.md)
  - [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md)
  - [ADR-0084: Inventory Concurrency Control & Race Condition Prevention](./adr/0084-inventory-concurrency-control-and-race-condition-prevention.md)
  - [ADR-0088: Inventory Category Classification Strategy](./adr/0088-inventory-category-classification-strategy.md)
  - [ADR-0089: Inventory Monetary, Quantity, and Unit Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
  - [ADR-0090: Fixed Asset Classification, Lifecycle State, and Condition Rating Strategy](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)

---

## 1. Executive Summary & Purpose

This document records the explicit, intentional decisions governing data types, numerical precision, enum representation, timestamps, timezones, and audit metadata for the **Resources Bounded Context** in PostgreSQL and Prisma ORM.

Zero decisions in this specification rely on default ORM behaviors or implicit database coercion.

---

## 2. Monetary Precision Specification

### 2.1 The Ban on Floating-Point Money

Floating-point data types (`Float`, `REAL`, `DOUBLE PRECISION`) are **strictly prohibited** for monetary values across all tables, models, and domain entities. Floating-point binary representation introduces rounding errors that violate financial accounting principles.

### 2.2 PostgreSQL & Prisma Decimal Representation

All monetary fields are declared as fixed-point decimals:
$$\text{PostgreSQL: } \texttt{DECIMAL(10, 2)} \quad / \quad \text{Prisma: } \texttt{Decimal @db.Decimal(10, 2)}$$

- **Precision (10 digits)**: Accommodates valuations and financial transactions up to $\$99,999,999.99$ (99.99 million USD).
- **Scale (2 decimal places)**: Enforces exact representation down to $0.01$ (cents).
- **Currency Coupling**: Every monetary amount column is paired with a corresponding ISO-4217 uppercase currency column (`TEXT` with default `"USD"`).

### 2.3 Comprehensive Monetary Field Inventory

| Model                    | Prisma Field                    | PostgreSQL Column                  | Data Type        | Nullable | Default | Constraints                                                          |
| :----------------------- | :------------------------------ | :--------------------------------- | :--------------- | :------: | :-----: | :------------------------------------------------------------------- |
| `InventoryItem`          | `purchaseCostAmount`            | `purchase_cost_amount`             | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (`chk_inventory_items_purchase_cost_non_negative`)        |
| `InventoryItem`          | `purchaseCostCurrency`          | `purchase_cost_currency`           | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |
| `InventoryItem`          | `sellingPriceAmount`            | `selling_price_amount`             | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (`chk_inventory_items_selling_price_non_negative`)        |
| `InventoryItem`          | `sellingPriceCurrency`          | `selling_price_currency`           | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |
| `StockMovement`          | `unitCostAmount`                | `unit_cost_amount`                 | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (Historical acquisition unit cost)                        |
| `StockMovement`          | `unitCostCurrency`              | `unit_cost_currency`               | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |
| `FixedAsset`             | `purchaseValueAmount`           | `purchase_value_amount`            | `Decimal(10, 2)` |    No    |    —    | $\ge 0.00$ (`chk_fixed_assets_purchase_value_non_negative`)          |
| `FixedAsset`             | `purchaseValueCurrency`         | `purchase_value_currency`          | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |
| `FixedAsset`             | `currentEstimatedValueAmount`   | `current_estimated_value_amount`   | `Decimal(10, 2)` |    No    |    —    | $\ge 0.00$ (`chk_fixed_assets_current_estimated_value_non_negative`) |
| `FixedAsset`             | `currentEstimatedValueCurrency` | `current_estimated_value_currency` | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |
| `AssetMaintenanceRecord` | `costAmount`                    | `cost_amount`                      | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (`chk_asset_maintenance_cost_non_negative`)               |
| `AssetMaintenanceRecord` | `costCurrency`                  | `cost_currency`                    | `Text`           |    No    | `"USD"` | ISO-4217 code (3 chars)                                              |

### 2.4 Domain & Serialization Boundary

- **Inside Domain**: Represented via the immutable `Money` Value Object containing integer cents (`amountInCents: number`) or Scale 2 arithmetic.
- **Inside Prisma Mapper**: Mapped to `Prisma.Decimal` instances: `new Prisma.Decimal(item.purchaseCost.amount.toFixed(2))`.
- **API Boundary**: Serialized as a fixed decimal string (`"125.50"`) or nested DTO `{ "amount": 125.50, "currency": "USD" }`.

---

## 3. Quantity Precision Specification

### 3.1 Decimal vs Integer for Physical Inventory

Physical inventory across healthcare, kinesiology, therapy, and fitness operations requires fractional measurement (e.g., $0.25\text{ kg}$ chalk/protein powder, $1.50\text{ liters}$ disinfectant/oil, $0.50\text{ rolls}$ kinesiology tape). Pure integers are insufficient.

### 3.2 Scale 2 Fixed Decimal Quantities

All quantity fields are declared as Scale 2 decimals:
$$\text{PostgreSQL: } \texttt{DECIMAL(10, 2)} \quad / \quad \text{Prisma: } \texttt{Decimal @db.Decimal(10, 2)}$$

- **Resolution**: $0.01$ units minimum physical precision.
- **Non-Negative Floor**: $QOH \ge 0.00$ enforced in domain assertions and PostgreSQL `CHECK` constraint.
- **Zero Semantics**: $0.00$ represents depleted stock (valid operational state), strictly distinct from negative balances.

### 3.3 Quantity Field Inventory

| Model           | Prisma Field     | PostgreSQL Column  | Data Type        | Nullable | Default | Constraints                                                   |
| :-------------- | :--------------- | :----------------- | :--------------- | :------: | :-----: | :------------------------------------------------------------ |
| `InventoryItem` | `quantityOnHand` | `quantity_on_hand` | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (`chk_inventory_items_quantity_non_negative`)      |
| `InventoryItem` | `minimumStock`   | `minimum_stock`    | `Decimal(10, 2)` |    No    | `0.00`  | $\ge 0.00$ (`chk_inventory_items_minimum_stock_non_negative`) |
| `StockMovement` | `quantityDelta`  | `quantity_delta`   | `Decimal(10, 2)` |    No    |    —    | Signed: $> 0.00$ for IN, $< 0.00$ for OUT. Non-zero.          |
| `StockMovement` | `balanceAfter`   | `balance_after`    | `Decimal(10, 2)` |    No    |    —    | $\ge 0.00$ (Materialized post-mutation snapshot)              |

---

## 4. Enum Strategy & Classification Analysis

We explicitly evaluate every conceptual enum in the Resources domain:

| Domain Enum                 | PostgreSQL Type                | Strategy                      | Values                                                                                                                                                  | Architectural Justification                                                                                                                                          |
| :-------------------------- | :----------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`InventoryItemStatus`**   | `enum "InventoryItemStatus"`   | Prisma Enum                   | `ACTIVE`, `INACTIVE`, `ARCHIVED`                                                                                                                        | Core lifecycle state machine. Changes require code logic.                                                                                                            |
| **`StockMovementType`**     | `enum "StockMovementType"`     | Prisma Enum                   | `PURCHASE`, `SALE`, `CONSUMPTION`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`                                                                                    | Closed accounting ledger algebra. Zero dynamic expansion allowed.                                                                                                    |
| **`UnitOfMeasure`**         | `enum "UnitOfMeasure"`         | Prisma Enum                   | `UNITS`, `BOXES`, `BOTTLES`, `ROLLS`, `MILLILITERS`, `GRAMS`                                                                                            | Standard physical measurement units.                                                                                                                                 |
| **`InventoryCategory`**     | `enum "InventoryCategory"`     | Prisma Enum + Domain Registry | `HEALTHY_MEALS`, `HEALTHY_DRINKS`, `CLEANING_SUPPLIES`, `OFFICE_SUPPLIES`, `SUPPLEMENTS`, `CLINICAL_SUPPLIES`, `THERAPY_CONSUMABLES`, `RETAIL_PRODUCTS` | Canonical 8 categories ([ADR-0088](./adr/0088-inventory-category-classification-strategy.md)). Bound to domain compliance rules.                                     |
| **`AssetStatus`**           | `enum "AssetStatus"`           | Prisma Enum                   | `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`                                                                                             | 5-state operational FSM ([ADR-0085](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md)). Terminal sinks strictly enforced.  |
| **`AssetCondition`**        | `enum "AssetCondition"`        | Prisma Enum                   | `EXCELLENT`, `GOOD`, `FAIR`, `NEEDS_REPAIR`, `OUT_OF_SERVICE`                                                                                           | Closed 5-level serviceability rating ([ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)).                           |
| **`AssetHistoryEventType`** | `enum "AssetHistoryEventType"` | Prisma Enum                   | `CREATED`, `UPDATED`, `TRANSFERRED`, `STATUS_CHANGED`, `CONDITION_CHANGED`, `VALUE_UPDATED`, `MAINTENANCE_RECORDED`, `RETIRED`, `SOLD`                  | 9 closed operational audit event types.                                                                                                                              |
| **`AssetCategory`**         | `enum "AssetCategory"`         | Prisma Enum + Domain Registry | `GYM_EQUIPMENT`, `THERAPY_EQUIPMENT`, `KITCHEN_EQUIPMENT`, `OFFICE_FURNITURE`, `ELECTRONICS`, `CLEANING_EQUIPMENT`                                      | Canonical 6 categories ([ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)). Bound to maintenance interval defaults. |

---

## 5. Timestamp & Timezone Strategy

### 5.1 Clear Separation of Technical vs Business Timestamps

The platform strictly forbids overloading `updatedAt` as a business event timestamp:

1. **Technical Timestamps**:
   - `createdAt` (`DateTime @default(now()) @map("created_at")`): Physical database row insertion time.
   - `updatedAt` (`DateTime @updatedAt @map("updated_at")`): Physical database row modification time.
2. **Business Event Timestamps**:
   - `purchaseDate` (`DateTime @map("purchase_date")`): Business acquisition calendar instant for fixed assets.
   - `serviceDate` (`DateTime @map("service_date")`): Date maintenance was actually performed by a technician.
   - `recordedAt` (`DateTime @default(now()) @map("recorded_at")`): Immutable transaction instant on `stock_movements` and `asset_history_events`.

### 5.2 Timezone Uniformity (UTC Storage)

- **PostgreSQL Level**: All timestamp columns are created as `TIMESTAMP(3)` / `TIMESTAMPTZ` storing **UTC**.
- **Application Level**: All domain events and entities construct timestamps via `new Date()` (UTC).
- **Presentation Level**: Conversion to the tenant/facility local timezone occurs exclusively at the UI/presentation boundary (aligned with Phase 3 Timezone Architecture).

---

## 6. Audit Metadata & Actor Provenance Strategy

### 6.1 Technical Audit vs Business Actor

| Layer               | Metadata Field              | Table                                                                  | Type                  | Purpose                                                              |
| :------------------ | :-------------------------- | :--------------------------------------------------------------------- | :-------------------- | :------------------------------------------------------------------- |
| **Technical**       | `version`                   | `inventory_items`, `fixed_assets`                                      | `INTEGER @default(1)` | Optimistic Concurrency Control (OCC) lost-update prevention.         |
| **Technical**       | `created_at` / `updated_at` | All tables                                                             | `TIMESTAMP(3)`        | System-level replication, cache invalidation, and debugging.         |
| **Business Actor**  | `recorded_by_user_id`       | `stock_movements`, `asset_history_events`, `asset_maintenance_records` | `TEXT` (UUID v4)      | Provenance tracking of the operator/therapist executing the action.  |
| **Business Vendor** | `performed_by`              | `asset_maintenance_records`                                            | `TEXT`                | Human/vendor name of the technician performing physical repairs.     |
| **Business Audit**  | `details`                   | `asset_history_events`                                                 | `JSONB`               | Structured snapshot of prior/new values and business justifications. |

### 6.2 Decoupled Cross-Context Actor Integrity

- `recorded_by_user_id` is stored as a plain `TEXT` scalar without an `@relation` foreign key constraint to `users.id`.
- **Guarantee**: Deactivating, suspending, or purging an IAM User in the Identity Bounded Context **never deletes or corrupts** historical inventory movements, asset history logs, or maintenance records.

---

## 7. Nullability & Optionality Specification

To eliminate ambiguity and prevent runtime null pointer exceptions:

```prisma
// INVENTORY ITEM
id                   String              @id @default(uuid())
tenantId             String?             @map("tenant_id")      // NULLABLE: Supports single-tenant / optional multi-tenant scoping
sku                  String              @unique               // REQUIRED
name                 String                                    // REQUIRED
description          String?                                   // NULLABLE: Optional catalog text
category             InventoryCategory   @default(CLINICAL_SUPPLIES) // REQUIRED
unit                 UnitOfMeasure       @default(UNITS)       // REQUIRED
minimumStock         Decimal             @default(0) @db.Decimal(10, 2) // REQUIRED
quantityOnHand       Decimal             @default(0) @db.Decimal(10, 2) // REQUIRED
purchaseCostAmount   Decimal             @default(0) @db.Decimal(10, 2) // REQUIRED
purchaseCostCurrency String              @default("USD")       // REQUIRED
sellingPriceAmount   Decimal             @default(0) @db.Decimal(10, 2) // REQUIRED
sellingPriceCurrency String              @default("USD")       // REQUIRED
status               InventoryItemStatus @default(ACTIVE)      // REQUIRED
locationRef          Json?               @map("location_ref")  // NULLABLE: Optional location coordinates
version              Int                 @default(1)           // REQUIRED
createdAt            DateTime            @default(now())       // REQUIRED
updatedAt            DateTime            @updatedAt            // REQUIRED

// STOCK MOVEMENT
id                   String              @id @default(uuid())  // REQUIRED
inventoryItemId      String              @map("inventory_item_id") // REQUIRED
movementType         StockMovementType   @map("movement_type") // REQUIRED
quantityDelta        Decimal             @db.Decimal(10, 2)    // REQUIRED
balanceAfter         Decimal             @db.Decimal(10, 2)    // REQUIRED
unitCostAmount       Decimal             @default(0) @db.Decimal(10, 2) // REQUIRED
unitCostCurrency     String              @default("USD")       // REQUIRED
reason               String                                    // REQUIRED: Mandatory justification
recordedByUserId     String              @map("recorded_by_user_id") // REQUIRED
referenceId          String?             @map("reference_id")  // NULLABLE: Optional PO / invoice reference
recordedAt           DateTime            @default(now())       // REQUIRED

// FIXED ASSET
id                          String         @id @default(uuid())
tenantId                    String?        @map("tenant_id")
assetTag                    String         @unique @map("asset_tag")
name                        String
description                 String?
category                    AssetCategory
purchaseDate                DateTime       @map("purchase_date")
purchaseValueAmount         Decimal        @db.Decimal(10, 2)
purchaseValueCurrency       String         @default("USD")
currentEstimatedValueAmount Decimal        @db.Decimal(10, 2)
currentEstimatedValueCurrency String       @default("USD")
condition                   AssetCondition @default(EXCELLENT)
status                      AssetStatus    @default(ACTIVE)
location                    Json           @map("location")      // REQUIRED: Must have structured location
notes                       String?                              // NULLABLE: Optional free notes
version                     Int            @default(1)
createdAt                   DateTime       @default(now())
updatedAt                   DateTime       @updatedAt

// ASSET HISTORY EVENT
id               String                @id @default(uuid())
assetId          String                @map("asset_id")
eventType        AssetHistoryEventType @map("event_type")
description      String
details          Json?                 @map("details")           // NULLABLE: Optional structured diff payload
recordedByUserId String                @map("recorded_by_user_id")
recordedAt       DateTime              @default(now())

// ASSET MAINTENANCE RECORD
id               String                @id @default(uuid())
assetId          String                @map("asset_id")
serviceDate      DateTime              @map("service_date")
description      String
costAmount       Decimal               @default(0) @db.Decimal(10, 2)
costCurrency     String                @default("USD")
performedBy      String                @map("performed_by")
notes            String?                                         // NULLABLE
recordedByUserId String                @map("recorded_by_user_id")
createdAt        DateTime              @default(now())
```

---

## 8. Rejected Alternatives & Rationale

1. **Floating-Point Storage (`Float`) for Money or Stock**:
   - _Rejected_: Binary IEEE-754 floating-point numbers lead to rounding errors (e.g., $0.1 + 0.2 = 0.30000000000000004$), causing discrepancies between movements and stock totals.
   - _Adopted_: Fixed-point `Decimal(10, 2)` throughout.
2. **Dynamic Database Tables for Categories**:
   - _Rejected_: Dynamic category tables allow arbitrary user categorization that breaks compile-time clinical and maintenance workflow logic.
   - _Adopted_: Closed Prisma Enums paired with rich domain code registries ([ADR-0088](./adr/0088-inventory-category-classification-strategy.md), [ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)).
3. **Hard Foreign Key Relational Cascades to IAM `User` Table**:
   - _Rejected_: A hard foreign key cascade would either delete historical audit ledgers when a staff member leaves (`ON DELETE CASCADE`) or block user deactivation (`ON DELETE RESTRICT`).
   - _Adopted_: Scalar `recordedByUserId: String` with permanent provenance.
4. **Single Monolithic Event-Sourcing Ledger for Entire Platform**:
   - _Rejected_: Extreme complexity, unneeded CQRS operational overhead for simple inventory and asset management.
   - _Adopted_: Materialized aggregate state + dedicated append-only child ledger tables (`stock_movements`, `asset_history_events`).

---

## 9. Architectural Decision Record (ADR) Review

We evaluated whether a new ADR is required for Milestone 6.4 persistence decisions:

- **Monetary & Quantity Precision**: Formally documented in [ADR-0089: Inventory Monetary, Quantity, and Unit Precision Semantics](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md).
- **Movement Ledger & Stock Materialization**: Formally documented in [ADR-0083: Inventory Movement Ledger & Materialized Stock Mutation Strategy](./adr/0083-inventory-movement-ledger-and-materialized-stock-mutation-strategy.md).
- **Category Persistence & Classification**: Formally documented in [ADR-0088](./adr/0088-inventory-category-classification-strategy.md) and [ADR-0090](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md).
- **Asset Operational Lifecycle State Machine**: Formally documented in [ADR-0085](./adr/0085-fixed-asset-operational-lifecycle-state-machine-and-terminal-disposal-policy.md).
- **Asset Maintenance Service Model**: Formally documented in [ADR-0086](./adr/0086-fixed-asset-maintenance-history-and-service-tracking-model.md).

**Conclusion**: All architectural decisions are fully covered by the approved ADR suite ([ADR-0081 through ADR-0090](./adr/)). No redundant ADRs are required for field-level DDL specifications.
