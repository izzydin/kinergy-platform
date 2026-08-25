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

export function isAssetHistoryEventType(value: unknown): value is AssetHistoryEventType {
  return (
    typeof value === 'string' &&
    Object.values(AssetHistoryEventType).includes(value as AssetHistoryEventType)
  );
}
