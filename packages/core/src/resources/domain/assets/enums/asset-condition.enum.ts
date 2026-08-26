export enum AssetCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

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

export function isAssetCondition(value: unknown): value is AssetCondition {
  return (
    typeof value === 'string' && Object.values(AssetCondition).includes(value as AssetCondition)
  );
}

export function parseAssetCondition(value: string): AssetCondition {
  const normalized = value.trim().toUpperCase();
  if (isAssetCondition(normalized)) {
    return normalized;
  }
  throw new Error(
    `Invalid asset condition '${value}'. Supported: ${Object.values(AssetCondition).join(', ')}`,
  );
}
