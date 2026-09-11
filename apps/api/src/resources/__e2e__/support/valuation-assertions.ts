import { ResourceOverviewResponseDto } from '../../dto';

export interface ExpectedOverviewValues {
  inventoryTotal?: number;
  inventoryQuantity?: number;
  inventoryItemsCount?: number;
  assetsCarryingTotal?: number;
  activeAssetCount?: number;
  totalAssetCount?: number;
  combinedTotal?: number;
}

export function assertResourceOverview(
  actual: ResourceOverviewResponseDto,
  expected: ExpectedOverviewValues,
): void {
  if (expected.inventoryTotal !== undefined) {
    expect(actual.consumableInventory.totalValueAmount).toBeCloseTo(expected.inventoryTotal, 2);
  }
  if (expected.inventoryQuantity !== undefined) {
    expect(actual.consumableInventory.totalQuantityUnits).toBe(expected.inventoryQuantity);
  }
  if (expected.inventoryItemsCount !== undefined) {
    expect(actual.consumableInventory.totalDistinctItems).toBe(expected.inventoryItemsCount);
  }
  if (expected.assetsCarryingTotal !== undefined) {
    expect(actual.fixedAssets.totalCarryingValueAmount).toBeCloseTo(
      expected.assetsCarryingTotal,
      2,
    );
  }
  if (expected.activeAssetCount !== undefined) {
    expect(actual.fixedAssets.activeAssetCount).toBe(expected.activeAssetCount);
  }
  if (expected.totalAssetCount !== undefined) {
    expect(actual.fixedAssets.totalAssetCount).toBe(expected.totalAssetCount);
  }
  if (expected.combinedTotal !== undefined) {
    expect(actual.combined.totalCombinedValueAmount).toBeCloseTo(expected.combinedTotal, 2);
  }
}
