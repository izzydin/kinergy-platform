export interface InventoryValuationComponentDTO {
  totalValueAmount: number;
  totalDistinctItems: number;
  totalQuantityUnits: number;
  sharePercentage: number;
}

export interface FixedAssetValuationComponentDTO {
  totalCarryingValueAmount: number;
  totalPurchaseValueAmount: number;
  totalAssetCount: number;
  activeAssetCount: number;
  sharePercentage: number;
}

export interface ResourceValuationSummaryDTO {
  totalCombinedValueAmount: number;
  totalCombinedPurchaseValueAmount: number;
  currency: string;
  inventory: InventoryValuationComponentDTO;
  fixedAssets: FixedAssetValuationComponentDTO;
  calculatedAt: string;
}
