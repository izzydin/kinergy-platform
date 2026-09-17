/**
 * Classifications of external source entities participating in commercial sales.
 */
export enum SourceType {
  INVENTORY_ITEM = 'INVENTORY_ITEM',
  MEMBERSHIP_PLAN = 'MEMBERSHIP_PLAN',
  TREATMENT_SESSION = 'TREATMENT_SESSION',
  CUSTOM_SERVICE = 'CUSTOM_SERVICE',
}

/**
 * Validates whether a value is a recognized SourceType enum value.
 */
export function isValidSourceType(sourceType: unknown): sourceType is SourceType {
  return (
    typeof sourceType === 'string' && Object.values(SourceType).includes(sourceType as SourceType)
  );
}
