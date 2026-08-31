import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { InventoryCategory, InventoryItemStatus, StockMovementType } from '@kinergy-platform/core';

export class CreateInventoryItemRequestDto {
  @ApiProperty({ description: 'Unique Stock Keeping Unit (SKU)', example: 'PROT-WHEY-VAN-1KG' })
  @IsString()
  @MinLength(3)
  sku!: string;

  @ApiProperty({ description: 'Product title / name', example: 'Organic Grass-Fed Whey Isolate' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ description: 'Detailed product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: InventoryCategory, description: 'Inventory category classification' })
  @IsEnum(InventoryCategory)
  category!: InventoryCategory;

  @ApiProperty({ description: 'Purchase acquisition cost per unit', example: 25.5 })
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @ApiProperty({ description: 'Retail / catalog selling price per unit', example: 45.0 })
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({ description: 'Initial opening stock on hand', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantityOnHand?: number;

  @ApiPropertyOptional({ description: 'Reorder trigger threshold quantity', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number;

  @ApiPropertyOptional({ description: 'Unit of measure', example: 'TUB', default: 'UNIT' })
  @IsOptional()
  @IsString()
  unitOfMeasure?: string;
}

export class UpdateInventoryItemRequestDto {
  @ApiPropertyOptional({ description: 'Updated product title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: InventoryCategory, description: 'Updated category' })
  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  @ApiPropertyOptional({ description: 'Updated purchase unit cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Updated retail selling price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Updated reorder threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number;

  @ApiPropertyOptional({ description: 'Updated unit of measure' })
  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @ApiPropertyOptional({ description: 'Expected aggregate version for OCC' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ReceiveStockRequestDto {
  @ApiProperty({ description: 'Positive quantity of units received', example: 24 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Specific invoice unit cost for this receipt batch' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Supplier / vendor name' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Purchase order or invoice reference number' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Operational notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SellStockRequestDto {
  @ApiProperty({ description: 'Quantity of units sold', example: 1 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Actual transaction unit price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'POS or Billing invoice reference ID' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Operational notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConsumeStockRequestDto {
  @ApiProperty({ description: 'Quantity of units consumed during treatment', example: 1 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Kinesiology treatment session reference ID' })
  @IsOptional()
  @IsString()
  treatmentSessionId?: string;

  @ApiPropertyOptional({ description: 'Clinical treatment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustStockRequestDto {
  @ApiProperty({
    description: 'Quantity delta (positive for found stock, negative for shrinkage / scrap)',
    example: -2,
  })
  @IsInt()
  deltaQuantity!: number;

  @ApiProperty({
    description: 'Mandatory justification reason for audit trail (>= 3 chars)',
    example: 'Damaged container during inventory count',
  })
  @IsString()
  @MinLength(3)
  reason!: string;

  @ApiPropertyOptional({ description: 'Audit notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ScrapStockRequestDto {
  @ApiProperty({ description: 'Positive quantity of units to scrap / dispose', example: 3 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({
    description: 'Mandatory justification reason for scrapping (damaged, expired, contaminated)',
    example: 'Damaged packaging during storage',
  })
  @IsString()
  @MinLength(3)
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional operational notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CategoryMetadataDto {
  @ApiProperty({ description: 'Category enum code identifier', example: 'SUPPLEMENTS' })
  code!: string;

  @ApiProperty({ description: 'Human-readable category label', example: 'Supplements & Nutrition' })
  displayName!: string;

  @ApiProperty({ description: 'Category description and purpose' })
  description!: string;
}

export class ListInventoryItemsQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search term across SKU, name, and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InventoryCategory, description: 'Filter by category' })
  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  @ApiPropertyOptional({ enum: InventoryItemStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(InventoryItemStatus)
  status?: InventoryItemStatus;

  @ApiPropertyOptional({
    description: 'Filter by stock availability status (IN_STOCK, LOW_STOCK, OUT_OF_STOCK)',
    enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
  })
  @IsOptional()
  @IsString()
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  @ApiPropertyOptional({
    description: 'Whether to include soft-archived items in results',
    default: false,
  })
  @IsOptional()
  includeArchived?: boolean;

  @ApiPropertyOptional({ description: 'Page index (1-indexed)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page (max 100)',
    default: 20,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Field to sort by (name, sku, category, quantityOnHand, sellingPrice, createdAt, updatedAt)',
    default: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'name';

  @ApiPropertyOptional({ description: 'Sort direction (asc | desc)', default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}

export class InventoryItemResponseDto {
  @ApiProperty({ description: 'Unique Inventory Item ID' })
  id!: string;

  @ApiProperty({ description: 'Stock Keeping Unit' })
  sku!: string;

  @ApiProperty({ description: 'Item name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Item description' })
  description?: string;

  @ApiProperty({ enum: InventoryCategory })
  category!: InventoryCategory;

  @ApiProperty({ enum: InventoryItemStatus })
  status!: InventoryItemStatus;

  @ApiProperty({ description: 'Purchase unit cost' })
  unitCost!: number;

  @ApiProperty({ description: 'Retail selling price' })
  sellingPrice!: number;

  @ApiProperty({ description: 'Physical quantity on hand' })
  quantityOnHand!: number;

  @ApiProperty({ description: 'Reorder trigger threshold' })
  reorderThreshold!: number;

  @ApiProperty({ description: 'Unit of measure' })
  unitOfMeasure!: string;

  @ApiProperty({ description: 'Optimistic locking version' })
  version!: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}

export class PaginatedInventoryResponseDto {
  @ApiProperty({ type: [InventoryItemResponseDto] })
  items!: InventoryItemResponseDto[];

  @ApiProperty({ description: 'Total count of items matching the filter criteria', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current 1-indexed page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Page size limit applied', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages available', example: 3 })
  totalPages!: number;

  @ApiProperty({ description: 'Whether a subsequent page exists', example: true })
  hasNextPage!: boolean;

  @ApiProperty({ description: 'Whether a preceding page exists', example: false })
  hasPreviousPage!: boolean;
}

export class StockMovementResponseDto {
  @ApiProperty({ description: 'Unique Movement ID' })
  id!: string;

  @ApiProperty({ description: 'Inventory Item ID' })
  itemId!: string;

  @ApiProperty({ enum: StockMovementType })
  type!: StockMovementType;

  @ApiProperty({ description: 'Quantity change' })
  quantity!: number;

  @ApiProperty({ description: 'Stock balance after movement' })
  balanceAfter!: number;

  @ApiPropertyOptional({ description: 'Unit cost or selling price snapshot' })
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'External reference identifier' })
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Operational reason' })
  reason?: string;

  @ApiProperty({ description: 'User ID of the recording actor' })
  recordedByUserId!: string;

  @ApiProperty({ description: 'Movement timestamp' })
  recordedAt!: string;
}

export class InventoryValuationResponseDto {
  @ApiProperty({ description: 'Total distinct product items' })
  totalDistinctItems!: number;

  @ApiProperty({ description: 'Total units of stock across all products' })
  totalQuantityUnits!: number;

  @ApiProperty({ description: 'Total working capital value amount' })
  totalValueAmount!: number;

  @ApiProperty({ description: 'Currency code' })
  currency!: string;

  @ApiProperty({ description: 'Calculation timestamp' })
  calculatedAt!: string;
}
