export interface StockMovementDTO {
  id: string;
  inventoryItemId: string;
  movementType: string;
  quantityDelta: number;
  balanceAfter: number;
  unitCostAmount: number;
  unitCostCurrency: string;
  reason: string;
  recordedByUserId: string;
  referenceId?: string | null;
  recordedAt: string;
}
