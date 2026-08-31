import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssetCategory,
  AssetCondition,
  AssetStatus,
  AssetHistoryEventType,
} from '@kinergy-platform/core';

export class AssetLocationDto {
  @ApiProperty({ description: 'Target facility identifier', example: 'fac_main' })
  @IsString()
  facilityId!: string;

  @ApiPropertyOptional({ description: 'Specific room within facility' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Floor / zone designation' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'Human-readable location description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateFixedAssetRequestDto {
  @ApiProperty({ description: 'Unique asset tag barcode identifier', example: 'AST-KNE-2026-001' })
  @IsString()
  @MinLength(3)
  assetTag!: string;

  @ApiProperty({
    description: 'Asset name / model',
    example: 'Biodex System 4 Pro Isokinetic Dynamometer',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ description: 'Detailed equipment specifications' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssetCategory, description: 'Asset category classification' })
  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @ApiProperty({ description: 'Acquisition / purchase date', example: '2026-01-15T00:00:00.000Z' })
  @IsDateString()
  purchaseDate!: string;

  @ApiProperty({ description: 'Original invoice acquisition cost amount', example: 45000.0 })
  @IsNumber()
  @Min(0)
  purchaseValueAmount!: number;

  @ApiPropertyOptional({ description: 'Purchase currency', default: 'USD' })
  @IsOptional()
  @IsString()
  purchaseValueCurrency?: string;

  @ApiPropertyOptional({ description: 'Current estimated fair value amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentEstimatedValueAmount?: number;

  @ApiPropertyOptional({ enum: AssetCondition, description: 'Initial condition rating' })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @ApiPropertyOptional({ enum: AssetStatus, description: 'Initial lifecycle status' })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiProperty({ description: 'Physical location assignment', type: AssetLocationDto })
  @ValidateNested()
  @Type(() => AssetLocationDto)
  @IsObject()
  location!: AssetLocationDto;

  @ApiPropertyOptional({ description: 'Initial onboarding notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFixedAssetDetailsRequestDto {
  @ApiPropertyOptional({ description: 'Updated asset name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Audit reason for details update' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TransferFixedAssetLocationRequestDto {
  @ApiProperty({ description: 'New target physical location', type: AssetLocationDto })
  @ValidateNested()
  @Type(() => AssetLocationDto)
  @IsObject()
  location!: AssetLocationDto;

  @ApiPropertyOptional({ description: 'Reason for location transfer' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ChangeFixedAssetStatusRequestDto {
  @ApiProperty({ enum: AssetStatus, description: 'Target lifecycle status' })
  @IsEnum(AssetStatus)
  status!: AssetStatus;

  @ApiProperty({
    description: 'Mandatory operational justification (>= 3 chars)',
    example: 'Decommissioning asset due to beyond economic repair',
  })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class UpdateFixedAssetConditionRequestDto {
  @ApiProperty({ enum: AssetCondition, description: 'Updated physical condition rating' })
  @IsEnum(AssetCondition)
  condition!: AssetCondition;

  @ApiPropertyOptional({ description: 'Inspection justification notes' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordAssetMaintenanceRequestDto {
  @ApiProperty({
    description: 'Date maintenance / service was performed',
    example: '2026-08-30T10:00:00.000Z',
  })
  @IsDateString()
  serviceDate!: string;

  @ApiProperty({ description: 'Detailed work order / maintenance description' })
  @IsString()
  @MinLength(3)
  description!: string;

  @ApiProperty({
    description: 'Direct service cost amount in integer cents or decimal currency',
    example: 450.0,
  })
  @IsNumber()
  @Min(0)
  costAmount!: number;

  @ApiPropertyOptional({ description: 'Cost currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  costCurrency?: string;

  @ApiProperty({
    description: 'Name or identifier of technician / vendor who performed service',
    example: 'Biodex Certified Field Tech #88',
  })
  @IsString()
  @MinLength(2)
  performedBy!: string;

  @ApiPropertyOptional({
    enum: AssetCondition,
    description: 'Optional post-service condition update',
  })
  @IsOptional()
  @IsEnum(AssetCondition)
  updateConditionTo?: AssetCondition;

  @ApiPropertyOptional({ description: 'Additional service invoice / report notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFixedAssetValuationRequestDto {
  @ApiProperty({ description: 'New estimated fair market / book value amount', example: 38000.0 })
  @IsNumber()
  @Min(0)
  estimatedValueAmount!: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Appraisal / write-down justification reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListFixedAssetsQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search term matching assetTag, name, or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AssetCategory, description: 'Filter by asset category' })
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @ApiPropertyOptional({ enum: AssetStatus, description: 'Filter by lifecycle status' })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @ApiPropertyOptional({ enum: AssetCondition, description: 'Filter by condition rating' })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @ApiPropertyOptional({ description: 'Filter by facility ID' })
  @IsOptional()
  @IsString()
  facilityId?: string;

  @ApiPropertyOptional({ description: 'Filter by room ID' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Include decommissioned assets', default: false })
  @IsOptional()
  includeDecommissioned?: boolean;

  @ApiPropertyOptional({ description: 'Page index (1-indexed)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order (asc | desc)', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class GetAssetHistoryQueryDto {
  @ApiPropertyOptional({
    enum: AssetHistoryEventType,
    description: 'Filter by specific event type',
  })
  @IsOptional()
  @IsEnum(AssetHistoryEventType)
  eventType?: AssetHistoryEventType;

  @ApiPropertyOptional({ description: 'Filter by recording actor user ID' })
  @IsOptional()
  @IsString()
  recordedByUserId?: string;

  @ApiPropertyOptional({ description: 'History from date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'History to date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Page index', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort direction', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class GetMaintenanceHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by technician / service provider' })
  @IsOptional()
  @IsString()
  performedBy?: string;

  @ApiPropertyOptional({ description: 'Filter from service date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter to service date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Page index', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort direction', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class FixedAssetResponseDto {
  @ApiProperty({ description: 'Unique Fixed Asset ID' })
  id!: string;

  @ApiProperty({ description: 'Asset Tag Barcode' })
  assetTag!: string;

  @ApiProperty({ description: 'Asset Name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Asset Description' })
  description?: string;

  @ApiProperty({ enum: AssetCategory })
  category!: AssetCategory;

  @ApiProperty({ enum: AssetStatus })
  status!: AssetStatus;

  @ApiProperty({ enum: AssetCondition })
  condition!: AssetCondition;

  @ApiProperty({ description: 'Acquisition Date' })
  purchaseDate!: string;

  @ApiProperty({ description: 'Physical Location', type: AssetLocationDto })
  location!: AssetLocationDto;

  @ApiProperty({ description: 'Optimistic Concurrency Version' })
  version!: number;

  @ApiProperty({ description: 'Creation Timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last Update Timestamp' })
  updatedAt!: string;
}

export class FixedAssetValuationResponseDto {
  @ApiProperty({ description: 'Asset identifier' })
  assetId!: string;

  @ApiProperty({ description: 'Asset Tag Barcode' })
  assetTag!: string;

  @ApiProperty({ description: 'Asset Name' })
  name!: string;

  @ApiProperty({ description: 'Original purchase acquisition cost amount' })
  purchaseValueAmount!: number;

  @ApiProperty({ description: 'Purchase currency' })
  purchaseValueCurrency!: string;

  @ApiProperty({ description: 'Current estimated fair value amount' })
  currentEstimatedValueAmount!: number;

  @ApiProperty({ description: 'Current estimated value currency' })
  currentEstimatedValueCurrency!: string;

  @ApiProperty({ description: 'Last valuation date' })
  lastValuationDate!: string;
}
