export enum AssetCategory {
  GYM_EQUIPMENT = 'GYM_EQUIPMENT',
  THERAPY_EQUIPMENT = 'THERAPY_EQUIPMENT',
  KITCHEN_EQUIPMENT = 'KITCHEN_EQUIPMENT',
  OFFICE_FURNITURE = 'OFFICE_FURNITURE',
  ELECTRONICS = 'ELECTRONICS',
  CLEANING_EQUIPMENT = 'CLEANING_EQUIPMENT',
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

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === 'string' && Object.values(AssetCategory).includes(value as AssetCategory);
}

export function parseAssetCategory(value: string): AssetCategory {
  const normalized = value.trim().toUpperCase();
  if (isAssetCategory(normalized)) {
    return normalized;
  }
  throw new Error(
    `Invalid asset category '${value}'. Supported: ${Object.values(AssetCategory).join(', ')}`,
  );
}
