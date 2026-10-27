/**
 * Authoritative client-safe Fixed Asset Enums
 * Decoupled from @kinergy-platform/core to prevent server domain leakage into client bundle
 */
export enum AssetCategory {
  GYM_EQUIPMENT = 'GYM_EQUIPMENT',
  THERAPY_EQUIPMENT = 'THERAPY_EQUIPMENT',
  KITCHEN_EQUIPMENT = 'KITCHEN_EQUIPMENT',
  OFFICE_FURNITURE = 'OFFICE_FURNITURE',
  ELECTRONICS = 'ELECTRONICS',
  CLEANING_EQUIPMENT = 'CLEANING_EQUIPMENT',
}

export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  DAMAGED = 'DAMAGED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}

export enum AssetCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

export enum AssetHistoryEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  TRANSFERRED = 'TRANSFERRED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  CONDITION_CHANGED = 'CONDITION_CHANGED',
  VALUE_UPDATED = 'VALUE_UPDATED',
  MAINTENANCE_RECORDED = 'MAINTENANCE_RECORDED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}

export interface AssetCategoryDescriptor {
  readonly code: AssetCategory;
  readonly displayName: string;
  readonly description: string;
  readonly requiresMaintenance: boolean;
  readonly defaultInspectionIntervalDays?: number;
}

export const ASSET_CATEGORY_REGISTRY: Record<AssetCategory, AssetCategoryDescriptor> = {
  [AssetCategory.GYM_EQUIPMENT]: {
    code: AssetCategory.GYM_EQUIPMENT,
    displayName: 'Gym Equipment',
    description:
      'Heavy machinery, cardio machines, free weights, and functional training stations.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 90,
  },
  [AssetCategory.THERAPY_EQUIPMENT]: {
    code: AssetCategory.THERAPY_EQUIPMENT,
    displayName: 'Therapy Equipment',
    description: 'Clinical lasers, ultrasound machines, shockwave units, and treatment tables.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 60,
  },
  [AssetCategory.KITCHEN_EQUIPMENT]: {
    code: AssetCategory.KITCHEN_EQUIPMENT,
    displayName: 'Kitchen Equipment',
    description: 'Commercial blenders, refrigeration, shake station appliances, and ice machines.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 180,
  },
  [AssetCategory.OFFICE_FURNITURE]: {
    code: AssetCategory.OFFICE_FURNITURE,
    displayName: 'Office Furniture',
    description: 'Desks, consultation chairs, reception counters, and filing cabinets.',
    requiresMaintenance: false,
  },
  [AssetCategory.ELECTRONICS]: {
    code: AssetCategory.ELECTRONICS,
    displayName: 'Electronics',
    description: 'POS terminals, sound systems, computers, tablets, and network infrastructure.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 180,
  },
  [AssetCategory.CLEANING_EQUIPMENT]: {
    code: AssetCategory.CLEANING_EQUIPMENT,
    displayName: 'Cleaning Equipment',
    description: 'Industrial floor scrubbers, sanitization foggers, and wet-dry vacuums.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 90,
  },
};

export interface AssetConditionDescriptor {
  readonly code: AssetCondition;
  readonly displayName: string;
  readonly description: string;
  readonly severityRank: number; // 1 (Best) to 5 (Worst)
  readonly isServiceable: boolean;
  readonly requiresTechnicianAttention: boolean;
}

export const ASSET_CONDITION_REGISTRY: Record<AssetCondition, AssetConditionDescriptor> = {
  [AssetCondition.EXCELLENT]: {
    code: AssetCondition.EXCELLENT,
    displayName: 'Excellent',
    description:
      'Like-new or newly commissioned condition with zero mechanical or aesthetic degradation.',
    severityRank: 1,
    isServiceable: true,
    requiresTechnicianAttention: false,
  },
  [AssetCondition.GOOD]: {
    code: AssetCondition.GOOD,
    displayName: 'Good',
    description:
      'Normal operational condition with minimal superficial wear and flawless performance.',
    severityRank: 2,
    isServiceable: true,
    requiresTechnicianAttention: false,
  },
  [AssetCondition.FAIR]: {
    code: AssetCondition.FAIR,
    displayName: 'Fair',
    description:
      'Noticeable wear or minor cosmetic degradation; fully functional but nearing scheduled servicing.',
    severityRank: 3,
    isServiceable: true,
    requiresTechnicianAttention: false,
  },
  [AssetCondition.NEEDS_REPAIR]: {
    code: AssetCondition.NEEDS_REPAIR,
    displayName: 'Needs Repair',
    description:
      'Mechanical faults, calibration drift, or component wear requiring prompt technician intervention.',
    severityRank: 4,
    isServiceable: false,
    requiresTechnicianAttention: true,
  },
  [AssetCondition.OUT_OF_SERVICE]: {
    code: AssetCondition.OUT_OF_SERVICE,
    displayName: 'Out of Service',
    description:
      'Complete breakdown, structural failure, or safety hazard prohibiting any operation.',
    severityRank: 5,
    isServiceable: false,
    requiresTechnicianAttention: true,
  },
};

/**
 * Client-safe state machine allowed transitions lookup table
 * Matches domain AssetLifecycleStateMachine adjacency graph
 */
export const CLIENT_ASSET_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  [AssetStatus.ACTIVE]: [
    AssetStatus.UNDER_MAINTENANCE,
    AssetStatus.DAMAGED,
    AssetStatus.RETIRED,
    AssetStatus.SOLD,
  ],
  [AssetStatus.UNDER_MAINTENANCE]: [
    AssetStatus.ACTIVE,
    AssetStatus.DAMAGED,
    AssetStatus.RETIRED,
    AssetStatus.SOLD,
  ],
  [AssetStatus.DAMAGED]: [
    AssetStatus.UNDER_MAINTENANCE,
    AssetStatus.ACTIVE,
    AssetStatus.RETIRED,
    AssetStatus.SOLD,
  ],
  [AssetStatus.RETIRED]: [AssetStatus.SOLD],
  [AssetStatus.SOLD]: [],
};

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
  purchaseValueAmount?: number;
  purchaseValueCurrency?: string;
  currentEstimatedValueAmount?: number;
  currentEstimatedValueCurrency?: string;
  location: AssetLocationVM;
  notes?: string | null;
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

export interface FixedAssetCategoryValuationVM {
  totalCarryingValueAmount: number;
  totalPurchaseValueAmount: number;
  assetCount: number;
}

export interface FixedAssetStatusValuationVM {
  count: number;
  totalCarryingValueAmount: number;
}

export interface FixedAssetConditionValuationVM {
  count: number;
  totalCarryingValueAmount: number;
}

/**
 * Fixed Asset Estate Aggregate Valuation Summary View Model
 * Matches NestJS FixedAssetValuationSummaryResponseDto (/api/v1/resources/assets/valuation/summary)
 */
export interface FixedAssetValuationSummaryVM {
  totalCarryingValueAmount: number;
  totalPurchaseValueAmount: number;
  currency: string;
  totalAssetCount: number;
  activeAssetCount: number;
  calculatedAt?: string;
  breakdownByCategory?: Record<string, FixedAssetCategoryValuationVM>;
  breakdownByStatus?: Record<string, FixedAssetStatusValuationVM>;
  breakdownByCondition?: Record<string, FixedAssetConditionValuationVM>;
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

export type PaginatedFixedAssetsVM = PaginatedAssetsVM;

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
