# Phase 6: Frontend Domain Contract Map & Presentation Boundary Strategy

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: Frontend-to-Backend Domain Mapping, ViewModel Types, Money/Quantity Representation & State-Machine Presentation  
**Author**: Principal Frontend Architect, API Contract Engineer & Domain Boundary Reviewer  
**Governing Architecture Documents**:

- [**Phase 6 Frontend Architecture Baseline**](./frontend-architecture-baseline.md)
- [**Phase 6 API Contract Specification**](./phase-6-api-contract-and-implementation.md)
- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0097: Resource Valuation Policy & Carrying Value Rules**](./adr/0097-resource-valuation-policy-and-carrying-value.md)

---

## 1. Backend Contract Inventory

The frontend consumes contracts produced by the Phase 6 REST API controllers. It has zero dependencies on Prisma models, SQL schema, or internal aggregate methods:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend API Surface                             │
├────────────────────────────────┬───────────────────────────────────────┤
│ Inventory Controller           │ `/api/v1/resources/inventory/*`       │
│ Fixed Assets Controller        │ `/api/v1/resources/assets/*`          │
│ Resource Valuation Controller  │ `/api/v1/resources/valuation/*`       │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. Consumable Inventory Domain Contract Map

| Backend Concept          | API DTO Type                    | Frontend ViewModel (`types/`)          | Form / Input Type (`schemas/`)                          | Mutation Payload             | Derived Display Representation                                | URL Param Key                |
| :----------------------- | :------------------------------ | :------------------------------------- | :------------------------------------------------------ | :--------------------------- | :------------------------------------------------------------ | :--------------------------- |
| **Product Item**         | `InventoryItemResponseDto`      | `InventoryItemVM`                      | `CreateInventoryItemInput` / `UpdateInventoryItemInput` | `CreateInventoryItemPayload` | Name, SKU badge, Category tag                                 | `id`, `sku`                  |
| **Category**             | `InventoryCategory`             | `InventoryCategory` enum               | `category: InventoryCategory`                           | `category` string            | Formatted title (`Clinical Supplies`, `Retail Products`)      | `category`                   |
| **Product Status**       | `InventoryItemStatus`           | `'ACTIVE' \| 'INACTIVE' \| 'ARCHIVED'` | N/A (Action triggered)                                  | N/A                          | Semantic Status Badge (Green/Yellow/Slate)                    | `status`                     |
| **Stock Level**          | `StockLevelResponseDto`         | `StockLevelVM`                         | N/A                                                     | N/A                          | `15.00 units` (Low-stock warning tag)                         | N/A                          |
| **Stock Movement**       | `StockMovementResponseDto`      | `StockMovementVM`                      | N/A                                                     | N/A                          | Signed delta (`+10`, `-2`), timestamp, actor                  | `type`, `dateFrom`, `dateTo` |
| **Movement Type**        | `StockMovementType`             | `StockMovementType` enum               | N/A                                                     | N/A                          | Badge: `PURCHASE`, `SALE`, `CONSUMPTION`, `ADJUSTMENT`        | `movementType`               |
| **Stock Purchase**       | `RecordPurchaseRequestDto`      | N/A                                    | `RecordPurchaseInput`                                   | `RecordPurchasePayload`      | Purchase receipt confirmation dialog                          | N/A                          |
| **Retail Sale**          | `RecordSaleRequestDto`          | N/A                                    | `RecordSaleInput`                                       | `RecordSalePayload`          | Point-of-sale receipt modal                                   | N/A                          |
| **Clinical Consumption** | `RecordConsumptionRequestDto`   | N/A                                    | `RecordConsumptionInput`                                | `RecordConsumptionPayload`   | Treatment session consumable log modal                        | N/A                          |
| **Stock Adjustment**     | `AdjustStockRequestDto`         | N/A                                    | `AdjustStockInput`                                      | `AdjustStockPayload`         | Shrinkage / audit correction modal                            | N/A                          |
| **Inventory Valuation**  | `InventoryValuationResponseDto` | `InventoryValuationVM`                 | N/A                                                     | N/A                          | Formatted currency `$24,850.00`, Category breakdown bar chart | `category`                   |

---

## 3. Fixed Asset Domain Contract Map

| Backend Concept        | API DTO Type                | Frontend ViewModel (`types/`) | Form / Input Type (`schemas/`)                    | Mutation Payload               | Derived Display Representation                                             | URL Param Key          |
| :--------------------- | :-------------------------- | :---------------------------- | :------------------------------------------------ | :----------------------------- | :------------------------------------------------------------------------- | :--------------------- |
| **Fixed Asset**        | `FixedAssetResponseDto`     | `FixedAssetVM`                | `CreateFixedAssetInput` / `UpdateFixedAssetInput` | `CreateFixedAssetPayload`      | Name, Asset Tag badge, Carrying Value                                      | `id`, `tag`            |
| **Asset Status**       | `AssetStatus`               | `AssetStatus` enum            | `status: AssetStatus`                             | `status` string                | Status Badge (`ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`) | `status`               |
| **Asset Condition**    | `AssetCondition`            | `AssetCondition` enum         | `condition: AssetCondition`                       | `condition` string             | Condition Rating Pill (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`)     | `condition`            |
| **Asset Location**     | `AssetLocationDto`          | `AssetLocationVM`             | `TransferAssetLocationInput`                      | `TransferAssetLocationPayload` | Location breadcrumb (`South Wing > Room 102 > Zone A`)                     | `facilityId`, `roomId` |
| **Maintenance Record** | `AssetMaintenanceDto`       | `AssetMaintenanceVM`          | `RecordMaintenanceInput`                          | `RecordMaintenancePayload`     | Service date, cost, technician name, notes                                 | N/A                    |
| **Asset History**      | `AssetHistoryEventDto`      | `AssetHistoryEventVM`         | N/A                                               | N/A                            | Chronological audit timeline stream with icon badges                       | `sortBy`, `sortOrder`  |
| **Asset Valuation**    | `AssetValuationResponseDto` | `AssetValuationVM`            | `UpdateAssetValuationInput`                       | `UpdateAssetValuationPayload`  | Carrying Value vs Acquisition CAPEX                                        | N/A                    |

---

## 4. Resource Overview & Portfolio Valuation Contract Map

| Overview Concept                | API Endpoint                                | Frontend ViewModel            | Display Representation                                                                        | Permission       |
| :------------------------------ | :------------------------------------------ | :---------------------------- | :-------------------------------------------------------------------------------------------- | :--------------- |
| **Consumable Working Capital**  | `GET /resources/valuation/inventory`        | `InventoryValuationVM`        | Metric card: Total Working Capital ($), Items count, Category share pie                       | `valuation.read` |
| **Fixed Asset Carrying Value**  | `GET /resources/valuation/assets`           | `AssetValuationSummaryVM`     | Metric card: Total Carrying Value ($), Historical CAPEX ($), Status breakdown                 | `valuation.read` |
| **Combined Resource Portfolio** | `GET /resources/valuation/combined`         | `CombinedResourceValuationVM` | Executive summary card: Total Resource Wealth ($), Allocation ratio (Inventory % vs Assets %) | `valuation.read` |
| **Low Stock Alert Stream**      | `GET /resources/inventory/alerts/low-stock` | `LowStockAlertVM[]`           | Alert banner & urgent reorder table widget                                                    | `inventory.read` |

---

## 5. DTO and Type Strategy

1. **Contract Colocation**: Frontend view models and payload interfaces are defined in `src/modules/resources/types/` mirroring API schemas.
2. **Readonly Invariance**: All properties in frontend view models are strictly `readonly` to enforce unidirectional data flow.
3. **Zero Backend Entity Leakage**: Aggregate private fields (e.g. `_domainEvents`, raw SQL IDs, DB transaction IDs) are never represented in frontend types.

---

## 6. Money Representation Strategy

- **Backend Transfer Format**: Standard JSON decimal numbers representing currency units (e.g. `24.50`, `4500.00`).
- **Frontend Storage Format**: TypeScript `number` inside ViewModels.
- **Frontend Presentation Layer**: Formatted exclusively through centralized currency formatters:
  ```typescript
  export const formatCurrency = (amount: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };
  ```
- **Rule**: The frontend performs zero client-side balance aggregations or complex rounding math; it displays authoritative values calculated by the backend.

---

## 7. Quantity & Unit Representation Strategy

- **Backend Transfer Format**: Decimal `number` (e.g. `10`, `12.5`).
- **Frontend Display**: Formatted with unit of measure:
  ```typescript
  export const formatQuantity = (qty: number, unit = 'UNIT'): string => {
    return `${qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit.toLowerCase()}`;
  };
  ```

---

## 8. Date and Time Representation Strategy

- **Backend Transfer Format**: ISO-8601 UTC strings (e.g. `2026-09-02T12:00:00.000Z`).
- **Frontend Storage**: `string` (ISO-8601).
- **Frontend Presentation**: Formatted at render time using standard localized helpers (`formatDate(iso, 'MMM d, yyyy')`, `formatRelativeTime(iso)`).

---

## 9. Enum Strategy & Progressive Localization

The frontend imports domain enums directly from `@kinergy-platform/core` to guarantee enum synchronization:

- `InventoryCategory`: `CLINICAL_SUPPLIES`, `RETAIL_PRODUCTS`, `FACILITY_SUPPLIES`, `EQUIPMENT_PARTS`, `OFFICE_SUPPLIES`.
- `InventoryItemStatus`: `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- `StockMovementType`: `PURCHASE`, `SALE`, `CONSUMPTION`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER`, `DISPOSAL`.
- `AssetStatus`: `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`.
- `AssetCondition`: `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`.

---

## 10. State Machine Representation & UI Action Derivation

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Asset Status State Machine                      │
├────────────────────────────────────────────────────────────────────────┤
│ ACTIVE ───────────► DAMAGED ───────────► UNDER_MAINTENANCE             │
│   │                    │                         │                     │
│   ├────────────────────┴─────────────────────────┤                     │
│   ▼                                              ▼                     │
│ RETIRED                                        ACTIVE (Restored)       │
│   │                                                                    │
│   ▼                                                                    │
│ SOLD (Terminal)                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### UI Action Derivation Rules

1. **Contextual Action Menus**: Action buttons ("Transfer Location", "Log Maintenance", "Decommission", "Mark Damaged") are enabled or disabled based on `asset.status` and user permissions.
2. **Terminal State Lockdown**: When an asset is `RETIRED` or `SOLD`, all mutation actions (transfers, maintenance, revaluation) are disabled in the UI.
3. **Backend Authoritative Rejection Handling**: If a stale UI attempts an invalid transition, the backend returns `400 Bad Request` (`Invalid status transition`). The mutation pipeline catches the error, displays an error toast, and invalidates the asset query key to immediately refresh the view.

---

## 11. Contract Drift Mitigation

1. **Automated Monorepo Typechecking**: `pnpm validate` executes `tsc --noEmit` across API and Web, ensuring contract changes trigger compile-time errors.
2. **API Contract Spec Validation**: Vitest integration tests in `apps/api/src/resources/__tests__/` guarantee response shapes match DTO definitions.
