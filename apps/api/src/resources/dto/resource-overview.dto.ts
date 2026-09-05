import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConsumableInventoryOverviewResponseDto {
  @ApiProperty({
    description: 'Total working capital acquisition value in dollars',
    example: 38450.0,
  })
  totalValueAmount!: number;

  @ApiProperty({
    description: 'Count of inventory items at or below reorder threshold',
    example: 3,
  })
  lowStockItemCount!: number;

  @ApiProperty({
    description: 'Total number of distinct inventory products / SKUs',
    example: 42,
  })
  totalDistinctItems!: number;

  @ApiProperty({
    description: 'Total physical quantity units on hand across all items',
    example: 1250,
  })
  totalQuantityUnits!: number;
}

export class FixedAssetsOverviewResponseDto {
  @ApiProperty({
    description: 'Total carrying book value of fixed assets in dollars',
    example: 185000.0,
  })
  totalCarryingValueAmount!: number;

  @ApiProperty({
    description: 'Total number of active fixed assets',
    example: 14,
  })
  activeAssetCount!: number;

  @ApiProperty({
    description: 'Total number of assets currently undergoing maintenance',
    example: 1,
  })
  underMaintenanceAssetCount!: number;

  @ApiProperty({
    description: 'Total number of damaged assets awaiting repair or disposal',
    example: 0,
  })
  damagedAssetCount!: number;

  @ApiProperty({
    description: 'Total number of retired / decommissioned assets',
    example: 2,
  })
  retiredAssetCount!: number;

  @ApiProperty({
    description: 'Total number of fixed assets across all lifecycle statuses',
    example: 17,
  })
  totalAssetCount!: number;
}

export class CombinedResourceOverviewResponseDto {
  @ApiProperty({
    description:
      'Total combined resource balance sheet value (Inventory Working Capital + Fixed Asset Carrying Value)',
    example: 223450.0,
  })
  totalCombinedValueAmount!: number;
}

export class ResourceOverviewResponseDto {
  @ApiProperty({
    description: 'Consumable inventory operational overview and working capital telemetry',
    type: ConsumableInventoryOverviewResponseDto,
  })
  consumableInventory!: ConsumableInventoryOverviewResponseDto;

  @ApiProperty({
    description: 'Fixed assets operational overview and carrying value telemetry',
    type: FixedAssetsOverviewResponseDto,
  })
  fixedAssets!: FixedAssetsOverviewResponseDto;

  @ApiProperty({
    description: 'Combined enterprise resource balance sheet valuation',
    type: CombinedResourceOverviewResponseDto,
  })
  combined!: CombinedResourceOverviewResponseDto;

  @ApiProperty({
    description: 'ISO currency code',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'ISO 8601 calculation timestamp',
    example: '2026-09-05T14:30:00.000Z',
  })
  calculatedAt!: string;
}

export class GetResourceOverviewQueryDto {
  @ApiPropertyOptional({
    description: 'Whether to include soft-archived items in overview calculations',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}
