import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
} from '@kinergy-platform/core';

/**
 * Re-export authoritative core enums for clean module-level consumption
 */
export { AssetCategory, AssetStatus, AssetCondition, AssetHistoryEventType };

/**
 * Physical Location Representation View Model
 */
export interface AssetLocationVM {
  facilityId: string;
  roomId?: string;
  zone?: string;
  description?: string;
}

/**
 * Fixed Asset View Model (Standard REST Entity Representation)
 * Note: Purchase acquisition cost and fair value carrying amount are
 * deliberately excluded from the general asset DTO for financial confidentiality.
 */
export interface FixedAssetVM {
  id: string;
  assetTag: string;
  name: string;
  description: string | null;
  category: AssetCategory;
  status: AssetStatus;
  condition: AssetCondition;
  purchaseDate: string;
  location: AssetLocationVM;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fixed Asset Financial Valuation Details View Model (Dual-Permission Protected)
 */
export interface FixedAssetValuationVM {
  assetId: string;
  assetTag: string;
  name: string;
  purchaseValueAmount: number;
  purchaseValueCurrency: string;
  currentEstimatedValueAmount: number;
  currentEstimatedValueCurrency: string;
  lastValuationDate: string;
}

/**
 * Fixed Asset Estate Aggregate Valuation Summary View Model
 */
export interface FixedAssetValuationSummaryVM {
  totalCarryingValue: {
    amount: number;
    currency: string;
  };
  totalPurchaseValue: {
    amount: number;
    currency: string;
  };
  assetCount: number;
  activeCount: number;
  decommissionedCount: number;
  breakdownByCategory: Array<{
    category: string;
    count: number;
    carryingValue: number;
  }>;
}

/**
 * Asset Category Taxonomy Metadata View Model
 */
export interface AssetCategoryMetadataVM {
  code: AssetCategory;
  displayName: string;
  description: string;
  requiresMaintenance: boolean;
  defaultInspectionIntervalDays?: number;
}

/**
 * Immutable Lifecycle Event Audit Record View Model
 */
export interface AssetHistoryEventVM {
  id: string;
  assetId: string;
  eventType: AssetHistoryEventType;
  description: string;
  details: Record<string, unknown>;
  recordedByUserId: string;
  recordedAt: string;
}

/**
 * Asset Servicing & Maintenance Work Order View Model
 */
export interface AssetMaintenanceRecordVM {
  id: string;
  assetId: string;
  serviceDate: string;
  description: string;
  cost: {
    amount: number;
    currency: string;
  };
  performedBy: string;
  notes?: string;
  recordedByUserId: string;
  createdAt: string;
}

/**
 * Paginated Fixed Assets Response Envelope
 */
export interface PaginatedAssetsVM {
  items: FixedAssetVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Paginated Asset History Response Envelope
 */
export interface PaginatedAssetHistoryVM {
  items: AssetHistoryEventVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Paginated Asset Maintenance Response Envelope
 */
export interface PaginatedMaintenanceVM {
  items: AssetMaintenanceRecordVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Filter Parameters for Asset Catalog Query
 */
export interface ListFixedAssetsFilterParams {
  search?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  condition?: AssetCondition;
  facilityId?: string;
  roomId?: string;
  includeDecommissioned?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter Parameters for Asset Audit History Query
 */
export interface GetAssetHistoryFilterParams {
  eventType?: AssetHistoryEventType;
  recordedByUserId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter Parameters for Asset Maintenance History Query
 */
export interface GetMaintenanceHistoryFilterParams {
  performedBy?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Input Payload for Fixed Asset Commissioning
 */
export interface CreateFixedAssetInputVM {
  assetTag: string;
  name: string;
  description?: string;
  category: AssetCategory;
  purchaseDate: string;
  purchaseValueAmount: number;
  purchaseValueCurrency?: string;
  currentEstimatedValueAmount?: number;
  condition?: AssetCondition;
  status?: AssetStatus;
  location: AssetLocationVM;
  notes?: string;
}

/**
 * Input Payload for Fixed Asset Metadata Update
 */
export interface UpdateFixedAssetDetailsInputVM {
  name?: string;
  description?: string;
  notes?: string;
  reason?: string;
}

/**
 * Input Payload for Fixed Asset Physical Location Relocation
 */
export interface TransferFixedAssetLocationInputVM {
  location: AssetLocationVM;
  reason?: string;
}

/**
 * Input Payload for Fixed Asset Lifecycle Status Change
 */
export interface ChangeFixedAssetStatusInputVM {
  status: AssetStatus;
  reason: string;
}

/**
 * Input Payload for Fixed Asset Condition Rating Update
 */
export interface UpdateFixedAssetConditionInputVM {
  condition: AssetCondition;
  reason?: string;
}

/**
 * Input Payload for Logging Asset Maintenance Work Order
 */
export interface RecordAssetMaintenanceInputVM {
  serviceDate: string;
  description: string;
  costAmount: number;
  costCurrency?: string;
  performedBy: string;
  updateConditionTo?: AssetCondition;
  notes?: string;
}

/**
 * Input Payload for Updating Fair Value Carrying Amount
 */
export interface UpdateFixedAssetValuationInputVM {
  estimatedValueAmount: number;
  currency?: string;
  reason?: string;
}
