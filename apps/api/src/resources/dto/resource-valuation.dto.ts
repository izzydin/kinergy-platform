import { ApiProperty } from '@nestjs/swagger';

export class FixedAssetCategoryValuationDto {
  @ApiProperty({ description: 'Total carrying book value in dollars' })
  totalCarryingValueAmount!: number;

  @ApiProperty({ description: 'Total original purchase acquisition cost in dollars' })
  totalPurchaseValueAmount!: number;

  @ApiProperty({ description: 'Number of assets in category' })
  assetCount!: number;
}

export class FixedAssetStatusValuationDto {
  @ApiProperty({ description: 'Asset count with this status' })
  count!: number;

  @ApiProperty({ description: 'Total carrying book value for this status' })
  totalCarryingValueAmount!: number;
}

export class FixedAssetConditionValuationDto {
  @ApiProperty({ description: 'Asset count with this condition rating' })
  count!: number;

  @ApiProperty({ description: 'Total carrying book value for this condition rating' })
  totalCarryingValueAmount!: number;
}

export class FixedAssetValuationSummaryResponseDto {
  @ApiProperty({ description: 'Total carrying book value of active estate in dollars' })
  totalCarryingValueAmount!: number;

  @ApiProperty({ description: 'Total original CAPEX purchase value in dollars' })
  totalPurchaseValueAmount!: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Total number of assets evaluated' })
  totalAssetCount!: number;

  @ApiProperty({ description: 'Total number of active assets contributing to carrying value' })
  activeAssetCount!: number;

  @ApiProperty({ description: 'Calculation timestamp' })
  calculatedAt!: string;

  @ApiProperty({ description: 'Valuation breakdown by asset category' })
  breakdownByCategory!: Record<string, FixedAssetCategoryValuationDto>;

  @ApiProperty({ description: 'Valuation breakdown by lifecycle status' })
  breakdownByStatus!: Record<string, FixedAssetStatusValuationDto>;

  @ApiProperty({ description: 'Valuation breakdown by physical condition rating' })
  breakdownByCondition!: Record<string, FixedAssetConditionValuationDto>;
}

export class InventoryValuationComponentResponseDto {
  @ApiProperty({ description: 'Total inventory acquisition cost in dollars' })
  totalValueAmount!: number;

  @ApiProperty({ description: 'Total distinct product SKUs' })
  totalDistinctItems!: number;

  @ApiProperty({ description: 'Total quantity units on hand' })
  totalQuantityUnits!: number;

  @ApiProperty({ description: 'Share percentage of combined resource balance sheet' })
  sharePercentage!: number;
}

export class FixedAssetValuationComponentResponseDto {
  @ApiProperty({ description: 'Total carrying book value in dollars' })
  totalCarryingValueAmount!: number;

  @ApiProperty({ description: 'Total original CAPEX acquisition cost in dollars' })
  totalPurchaseValueAmount!: number;

  @ApiProperty({ description: 'Total number of physical assets' })
  totalAssetCount!: number;

  @ApiProperty({ description: 'Total number of active capital assets' })
  activeAssetCount!: number;

  @ApiProperty({ description: 'Share percentage of combined resource balance sheet' })
  sharePercentage!: number;
}

export class ResourceValuationSummaryResponseDto {
  @ApiProperty({
    description:
      'Total combined resource value (Inventory Working Capital + Fixed Asset Carrying Value)',
  })
  totalCombinedValueAmount!: number;

  @ApiProperty({ description: 'Total combined CAPEX purchase investment' })
  totalCombinedPurchaseValueAmount!: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Consumable inventory valuation component' })
  inventory!: InventoryValuationComponentResponseDto;

  @ApiProperty({ description: 'Fixed assets valuation component' })
  fixedAssets!: FixedAssetValuationComponentResponseDto;

  @ApiProperty({ description: 'Calculation timestamp' })
  calculatedAt!: string;
}
