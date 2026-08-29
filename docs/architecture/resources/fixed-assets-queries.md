# Fixed Assets Read & Query Architecture

**Bounded Context**: `Resources Management`  
**Sub-Domain**: `Fixed Assets (Capital Equipment)`  
**Milestone**: Phase 6.6 — Fixed Asset Application Layer  
**Document**: Authoritative Specification for Fixed Asset History, Maintenance Ledger, and Valuation Queries  
**Status**: `APPROVED & ACTIVE`  
**Date**: August 29, 2026

---

## 1. Get Asset History Query Contract

Executed via [`GetAssetHistoryHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/handlers/get-asset-history.handler.ts) running [`GetAssetHistoryQuery`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/queries/get-asset-history.query.ts).

```typescript
export interface GetAssetHistoryInput {
  assetId: string; // Target FixedAsset UUID
  tenantId?: string; // Tenant isolation boundary
  eventType?: AssetHistoryEventType | AssetHistoryEventType[]; // Optional filter
  recordedByUserId?: string; // Optional filter by actor
  fromDate?: Date | string; // Inclusive start timestamp/date
  toDate?: Date | string; // Inclusive end timestamp/date
  page?: number; // 1-based page number (default 1)
  pageSize?: number; // Page limit (default 20, max 100)
  sortBy?: 'recordedAt'; // Whitelisted sort field (default recordedAt)
  sortOrder?: 'asc' | 'desc'; // Sort direction (default desc: newest-first)
}
```

### 1.1 Ordering & Tie-Breaking

- **Default Order**: `recordedAt: desc` (newest-first).
- **Deterministic Tie-Breaker**: When multiple history events occur in the same millisecond timestamp, the stable tie-breaker preserves aggregate chronological insertion sequence (`b.index - a.index` in descending order).

---

## 2. Get Maintenance History Query Contract

Executed via [`GetMaintenanceHistoryHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/handlers/get-maintenance-history.handler.ts) running [`GetMaintenanceHistoryQuery`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/queries/get-maintenance-history.query.ts).

```typescript
export interface GetMaintenanceHistoryInput {
  assetId: string; // Target FixedAsset UUID
  tenantId?: string; // Tenant isolation boundary
  performedBy?: string; // Case-insensitive substring search for technician/contractor
  fromDate?: Date | string; // Inclusive start service date
  toDate?: Date | string; // Inclusive end service date
  page?: number; // 1-based page (default 1)
  pageSize?: number; // Page limit (default 20, max 100)
  sortBy?: 'serviceDate' | 'createdAt'; // Default serviceDate
  sortOrder?: 'asc' | 'desc'; // Default desc (newest service date first)
}
```

---

## 3. Date Range Semantics & Validation

1. **Inclusive Boundaries**: `fromDate` and `toDate` are evaluated inclusively (`fromDate <= eventTimestamp <= toDate`).
2. **Date-Only Expansion**: Date-only strings (`YYYY-MM-DD`) provided as `toDate` are deterministically expanded to the end of the UTC day (`YYYY-MM-DDT23:59:59.999Z`).
3. **Boundary Invalidation**: If `fromDate > toDate`, the query handler rejects the input immediately with an `ApplicationResult.fail('fromDate cannot be after toDate.')`.

---

## 4. Get Asset Value Query Contract

Executed via [`GetAssetValueHandler`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/handlers/get-asset-value.handler.ts) running [`GetAssetValueQuery`](file:///c:/Projects/kinergy-platform/packages/core/src/resources/application/queries/get-asset-value.query.ts).

```typescript
export interface AssetValuationDTO {
  assetId: string;
  assetTag: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  condition: AssetCondition;
  purchaseDate: Date;
  purchaseValueAmount: number; // Historical acquisition cost (cents precision)
  purchaseValueCurrency: string; // ISO-4217 code (e.g. USD)
  currentEstimatedValueAmount: number; // Current book/estimated value
  currentEstimatedValueCurrency: string;
  lastValuationDate: Date;
}
```

### 4.1 Value Representation

- Strictly separates historical `purchaseValue` from `currentEstimatedValue`.
- Preserves 2 decimal places precision via `Money` VO (`Math.round(amount * 100) / 100`).
- Does not compute speculative depreciation curves unless explicitly triggered through accounting write-down workflows.

---

## 5. Authorization Matrix

| Query Operation         | Required Permission            | Allowed Roles                                                  |
| ----------------------- | ------------------------------ | -------------------------------------------------------------- |
| `GetAssetHistory`       | `assets.read`                  | Platform Admin, Facility Manager, Maintenance Lead, Auditor    |
| `GetMaintenanceHistory` | `assets.read`                  | Platform Admin, Facility Manager, Maintenance Lead, Technician |
| `GetAssetValue`         | `finance.read` / `assets.read` | Platform Admin, Facility Manager, Finance Director             |
