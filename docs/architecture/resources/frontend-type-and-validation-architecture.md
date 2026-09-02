# Phase 6: Frontend Type and Validation Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: TypeScript Type System, ViewModel Layer, Zod Form Schemas & Presentation Boundaries  
**Author**: Principal TypeScript Engineer & Frontend Domain Boundary Architect  
**Governing ADRs**:

- [**ADR-0084: Resources Subsystem Architecture & Boundaries**](./adr/0084-resources-subsystem-architecture-and-boundaries.md)
- [**ADR-0089: Inventory Monetary, Quantity, and Unit Precision Semantics**](./adr/0089-inventory-monetary-quantity-and-unit-precision-semantics.md)
- [**ADR-0090: Fixed Asset Classification, Lifecycle State, and Condition Rating Strategy**](./adr/0090-fixed-asset-classification-lifecycle-state-and-condition-rating-strategy.md)
- [**ADR-0100: Frontend Resources Feature-Module Boundaries & Encapsulation**](./adr/0100-frontend-resources-feature-module-boundaries.md)
- [**Phase 6 Frontend Domain Contract Map**](./frontend-domain-contract-map.md)

---

## 1. Type Layering Architecture & Representation Boundaries

To prevent type proliferation while maintaining strict domain separation, the frontend enforces four distinct representation layers:

```
┌────────────────────────────────────────────────────────┐
│ 1. REST API Contract & ViewModels (`types/*.types.ts`) │
│ - Pure DTO representations returned by backend REST    │
│ - Zero coupling to Prisma models or internal SQL types │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Form Schema & Mutation Payloads (`schemas/*.ts`)    │
│ - Zod schemas for client-side form validation UX       │
│ - Types derived via `z.infer<typeof schema>`           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. URL State & Query Filter Parameters (`types/`)      │
│ - Typed query parameter interfaces for DataTables      │
│ - Synchronized with React Router search parameters     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Presentation & Derived Formatters (`utils/format`)  │
│ - Pure currency, quantity, and date/time formatters    │
│ - Prevents client-side arithmetic drift                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Consumable Inventory Type Map (`src/modules/resources/inventory/`)

### ViewModels (`inventory.types.ts`)

```typescript
export interface InventoryItemVM {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unit: string;
  currentStock: number;
  reorderThreshold: number;
  purchaseCost: number;
  sellingPrice: number | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockLevelVM {
  itemId: string;
  sku: string;
  currentStock: number;
  unit: string;
  reorderThreshold: number;
  isLowStock: boolean;
}

export interface StockMovementVM {
  id: string;
  itemId: string;
  movementType: StockMovementType;
  quantity: number;
  balanceAfter: number;
  referenceReason: string;
  actorId: string;
  createdAt: string;
}

export interface LowStockAlertVM {
  itemId: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  currentStock: number;
  reorderThreshold: number;
  unit: string;
  deficit: number;
}
```

### Form Schemas & Payloads (`inventory.schema.ts`)

```typescript
export const createInventoryItemSchema = z.object({
  sku: z.string().min(2).max(50).trim(),
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(InventoryCategory),
  unit: z.string().min(1).max(20).trim(),
  reorderThreshold: z.coerce.number().min(0),
  purchaseCost: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0).optional().nullable(),
  initialStock: z.coerce.number().min(0).optional().default(0),
});
export type CreateInventoryItemFormValues = z.infer<typeof createInventoryItemSchema>;

export const recordPurchaseSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  supplierName: z.string().min(2, 'Supplier name required').trim(),
  invoiceNumber: z.string().min(1, 'Invoice number required').trim(),
  notes: z.string().max(250).optional(),
});
export type RecordPurchaseFormValues = z.infer<typeof recordPurchaseSchema>;

export const recordSaleSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  clientId: z.string().uuid('Valid client ID required').optional(),
  receiptNumber: z.string().min(1, 'Receipt number required').trim(),
  notes: z.string().max(250).optional(),
});
export type RecordSaleFormValues = z.infer<typeof recordSaleSchema>;

export const recordConsumptionSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  treatmentSessionId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  practitionerId: z.string().min(1, 'Practitioner required').trim(),
  reason: z.string().min(3, 'Consumption reason required').trim(),
});
export type RecordConsumptionFormValues = z.infer<typeof recordConsumptionSchema>;

export const adjustStockSchema = z.object({
  newQuantity: z.coerce.number().min(0, 'Stock cannot be negative'),
  reason: z.string().min(3, 'Audit adjustment reason required').max(250).trim(),
});
export type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;
```

---

## 3. Fixed Asset Type Map (`src/modules/resources/assets/`)

### ViewModels (`fixed-asset.types.ts`)

```typescript
export interface AssetLocationVM {
  facilityId: string;
  facilityName?: string;
  roomId?: string;
  roomName?: string;
  zone?: string;
}

export interface FixedAssetVM {
  id: string;
  assetTag: string;
  name: string;
  description: string | null;
  category: AssetCategory;
  location: AssetLocationVM;
  purchaseDate: string;
  purchaseCost: number;
  carryingValue: number;
  status: FixedAssetStatus;
  condition: AssetCondition;
  serialNumber: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetHistoryEventVM {
  id: string;
  assetId: string;
  eventType: string;
  fromState: string | null;
  toState: string | null;
  actorId: string;
  notes: string | null;
  timestamp: string;
}

export interface AssetMaintenanceVM {
  id: string;
  assetId: string;
  workOrderNumber: string;
  technicianName: string;
  serviceDate: string;
  cost: number;
  description: string;
  partsReplaced: string[];
  createdAt: string;
}
```

### Form Schemas & Payloads (`fixed-asset.schema.ts`)

```typescript
export const createFixedAssetSchema = z.object({
  assetTag: z.string().min(3).max(50).trim(),
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(AssetCategory),
  facilityId: z.string().min(1, 'Facility is required'),
  roomId: z.string().optional(),
  zone: z.string().max(50).optional(),
  purchaseDate: z.string().min(10, 'Valid purchase date required'),
  purchaseCost: z.coerce.number().min(0, 'Purchase cost cannot be negative'),
  serialNumber: z.string().max(100).optional(),
});
export type CreateFixedAssetFormValues = z.infer<typeof createFixedAssetSchema>;

export const transferAssetLocationSchema = z.object({
  targetFacilityId: z.string().min(1, 'Target facility is required'),
  targetRoomId: z.string().optional(),
  targetZone: z.string().max(50).optional(),
  reason: z.string().min(3, 'Transfer reason required').max(250).trim(),
});
export type TransferAssetLocationFormValues = z.infer<typeof transferAssetLocationSchema>;

export const changeAssetStatusSchema = z.object({
  status: z.nativeEnum(FixedAssetStatus),
  reason: z.string().min(3, 'Status transition reason required').max(250).trim(),
});
export type ChangeAssetStatusFormValues = z.infer<typeof changeAssetStatusSchema>;

export const recordMaintenanceSchema = z.object({
  workOrderNumber: z.string().min(2, 'Work order number required').trim(),
  technicianName: z.string().min(2, 'Technician name required').trim(),
  serviceDate: z.string().min(10, 'Service date required'),
  cost: z.coerce.number().min(0, 'Cost cannot be negative'),
  description: z.string().min(5, 'Maintenance description required').max(500).trim(),
  partsReplaced: z.array(z.string()).default([]),
});
export type RecordMaintenanceFormValues = z.infer<typeof recordMaintenanceSchema>;
```

---

## 4. Resource Valuation Type Map (`src/modules/resources/valuation/`)

### ViewModels (`valuation.types.ts`)

```typescript
export interface InventoryValuationVM {
  totalInventoryValue: number;
  totalActiveItems: number;
  categoryBreakdown: Record<string, number>;
  evaluatedAt: string;
}

export interface AssetValuationSummaryVM {
  totalHistoricalCost: number;
  totalCarryingValue: number;
  totalActiveAssets: number;
  statusBreakdown: Record<string, number>;
  evaluatedAt: string;
}

export interface CombinedResourceValuationVM {
  totalResourceValue: number;
  inventoryValue: number;
  assetCarryingValue: number;
  assetHistoricalCost: number;
  evaluatedAt: string;
}
```

---

## 5. Enum Source-of-Truth Strategy

All resource-related enums are defined authoritatively in `@kinergy-platform/types` and consumed natively by both backend schemas and frontend ViewModels:

| Enum Name           | Canonical Values                                                                                                                     | Primary Use Cases                          |
| :------------------ | :----------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| `InventoryCategory` | `CLINICAL_SUPPLIES`, `REHAB_EQUIPMENT`, `RETAIL_PRODUCTS`, `NUTRITION_SUPPLEMENTS`, `FACILITY_SUPPLIES`, `OFFICE_SUPPLIES`           | Product classification & faceted filtering |
| `StockMovementType` | `PURCHASE_RECEIPT`, `RETAIL_SALE`, `CLINICAL_CONSUMPTION`, `DAMAGE_SCRAP`, `AUDIT_ADJUSTMENT`, `INITIAL_STOCK`                       | Movement ledger badges & delta rendering   |
| `AssetCategory`     | `HEAVY_TRAINING_EQUIPMENT`, `CARDIO_MACHINES`, `KINESIOLOGY_DEVICES`, `IT_HARDWARE`, `FURNITURE_FIXTURES`, `FACILITY_INFRASTRUCTURE` | Asset classification & filter tags         |
| `FixedAssetStatus`  | `ACTIVE`, `UNDER_MAINTENANCE`, `DAMAGED`, `RETIRED`, `SOLD`                                                                          | 5-state lifecycle state machine pills      |
| `AssetCondition`    | `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `DAMAGED`                                                                                       | Physical inspection status badges          |

---

## 6. Monetary, Quantity & DateTime Presentation Rules

1. **Monetary Values**:
   - Transferred over REST as JSON numbers (e.g., `24.50`, `1250.00`).
   - Rendered using centralized formatter: `formatCurrency(value, currency = 'USD')` $\to$ `"$1,250.00"`.
   - Client components **never** perform floating-point valuation aggregation.
2. **Quantity Values**:
   - Transferred over REST as JSON numbers (e.g., `15.00`).
   - Rendered using: `formatQuantity(value, unit)` $\to$ `"15 units"`.
3. **Date/Time Values**:
   - Transferred as UTC ISO-8601 strings (`"2026-08-31T14:30:00.000Z"`).
   - Rendered using localized formatters: `formatIsoDate(isoString)` $\to$ `"Aug 31, 2026"` and `formatIsoDateTime(isoString)` $\to$ `"Aug 31, 2026, 2:30 PM"`.
