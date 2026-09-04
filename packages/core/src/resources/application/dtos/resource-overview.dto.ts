export interface ConsumableInventoryOverviewDTO {
  totalValueAmount: number;
  lowStockItemCount: number;
  totalDistinctItems: number;
  totalQuantityUnits: number;
}

export interface FixedAssetsOverviewDTO {
  totalCarryingValueAmount: number;
  activeAssetCount: number;
  underMaintenanceAssetCount: number;
  damagedAssetCount: number;
  retiredAssetCount: number;
  totalAssetCount: number;
}

export interface CombinedResourceOverviewDTO {
  totalCombinedValueAmount: number;
}

export interface ResourceOverviewDTO {
  consumableInventory: ConsumableInventoryOverviewDTO;
  fixedAssets: FixedAssetsOverviewDTO;
  combined: CombinedResourceOverviewDTO;
  currency: string;
  calculatedAt: string;
}
