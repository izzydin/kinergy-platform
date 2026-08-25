export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  DAMAGED = 'DAMAGED',
  RETIRED = 'RETIRED',
  SOLD = 'SOLD',
}

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
