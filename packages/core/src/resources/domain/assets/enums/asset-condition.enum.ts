export enum AssetCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

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
