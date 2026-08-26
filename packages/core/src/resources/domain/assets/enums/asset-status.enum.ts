export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  DAMAGED = 'DAMAGED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}

export interface AssetStatusDescriptor {
  readonly code: AssetStatus;
  readonly displayName: string;
  readonly description: string;
  readonly isOperational: boolean;
  readonly isTerminal: boolean;
  readonly allowsLocationTransfer: boolean;
  readonly allowsMaintenance: boolean;
  readonly allowsRevaluation: boolean;
}

export const ASSET_STATUS_REGISTRY: Record<AssetStatus, AssetStatusDescriptor> = {
  [AssetStatus.ACTIVE]: {
    code: AssetStatus.ACTIVE,
    displayName: 'Active',
    description: 'Fully operational and commissioned for facility, gym, or clinical treatment use.',
    isOperational: true,
    isTerminal: false,
    allowsLocationTransfer: true,
    allowsMaintenance: true,
    allowsRevaluation: true,
  },
  [AssetStatus.UNDER_MAINTENANCE]: {
    code: AssetStatus.UNDER_MAINTENANCE,
    displayName: 'Under Maintenance',
    description:
      'Temporarily offline for scheduled servicing, preventive maintenance, calibration, or overhaul.',
    isOperational: false,
    isTerminal: false,
    allowsLocationTransfer: true,
    allowsMaintenance: true,
    allowsRevaluation: true,
  },
  [AssetStatus.DAMAGED]: {
    code: AssetStatus.DAMAGED,
    displayName: 'Damaged',
    description:
      'Impaired due to mechanical malfunction, breakdown, or safety defect pending diagnostic repair.',
    isOperational: false,
    isTerminal: false,
    allowsLocationTransfer: true,
    allowsMaintenance: true,
    allowsRevaluation: true,
  },
  [AssetStatus.RETIRED]: {
    code: AssetStatus.RETIRED,
    displayName: 'Retired',
    description:
      'Permanently decommissioned from active service due to obsolescence or end of lifecycle.',
    isOperational: false,
    isTerminal: false,
    allowsLocationTransfer: false, // Invariant [AST-INV-2]
    allowsMaintenance: false,
    allowsRevaluation: true,
  },
  [AssetStatus.SOLD]: {
    code: AssetStatus.SOLD,
    displayName: 'Sold',
    description: 'Permanently liquidated or sold for salvage value. Irreversible terminal state.',
    isOperational: false,
    isTerminal: true, // Invariant [AST-INV-1]
    allowsLocationTransfer: false,
    allowsMaintenance: false,
    allowsRevaluation: false,
  },
};

export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === 'string' && Object.values(AssetStatus).includes(value as AssetStatus);
}

export function isTerminalAssetStatus(status: AssetStatus): boolean {
  return status === AssetStatus.SOLD;
}

export function parseAssetStatus(value: string): AssetStatus {
  const normalized = value.trim().toUpperCase();
  if (isAssetStatus(normalized)) {
    return normalized;
  }
  throw new Error(
    `Invalid asset status '${value}'. Supported: ${Object.values(AssetStatus).join(', ')}`,
  );
}
