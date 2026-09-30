import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SaleSourceType } from '@kinergy-platform/core';

/**
 * Validated Input DTO representing a commercial origin reference (ADR-0121).
 *
 * Enforces:
 * - Supported canonical type (KINESIOLOGY_SESSION, GYM_MEMBERSHIP, FOOD, DRINK, ROOM_RENTAL)
 * - Required, non-empty, sanitized referenceId (max 255 characters, no control characters)
 * - Optional human order referenceCode
 * - Backward compatibility with legacy sourceType/sourceId fields
 */
export class SourceReferenceInputDto {
  @ApiProperty({
    enum: SaleSourceType,
    description: 'Commercial origin source type (ADR-0121)',
    example: SaleSourceType.FOOD,
  })
  @IsEnum(SaleSourceType, {
    message: `type must be a valid SaleSourceType (${Object.values(SaleSourceType).join(', ')})`,
  })
  @IsNotEmpty({ message: 'type is required and cannot be empty.' })
  type!: SaleSourceType;

  @ApiProperty({
    description: 'Generic opaque correlation identifier in source domain (ADR-0121)',
    example: 'food_order_123',
    maxLength: 255,
  })
  @IsString({ message: 'referenceId must be a string.' })
  @Matches(/\S/, { message: 'referenceId cannot be empty or whitespace.' })
  @IsNotEmpty({ message: 'referenceId cannot be empty or whitespace.' })
  @MaxLength(255, { message: 'referenceId cannot exceed 255 characters.' })
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\x00-\x1F\x7F]+$/, {
    message: 'referenceId contains invalid control characters.',
  })
  referenceId!: string;

  @ApiPropertyOptional({
    description: 'Optional human order reference or terminal code',
    example: 'ORD-2026-0042',
    maxLength: 255,
  })
  @IsString({ message: 'referenceCode must be a string.' })
  @IsOptional()
  @MaxLength(255, { message: 'referenceCode cannot exceed 255 characters.' })
  referenceCode?: string;
}

/**
 * Response DTO exposing commercial origin source reference (ADR-0121).
 */
export class SaleSourceResponseDto {
  @ApiProperty({
    enum: SaleSourceType,
    description: 'Canonical commercial source category (ADR-0121)',
    example: 'FOOD',
  })
  type!: string;

  @ApiProperty({
    description: 'Generic opaque correlation identifier in source domain',
    example: 'food_order_123',
  })
  referenceId!: string;

  @ApiPropertyOptional({
    description: 'Optional human order reference or terminal code',
    example: 'ORD-2026-0042',
  })
  referenceCode?: string | null;

  // Legacy compatibility aliases
  @ApiPropertyOptional({ description: 'Legacy compatibility alias for type' })
  sourceType?: string;

  @ApiPropertyOptional({ description: 'Legacy compatibility alias for referenceId' })
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Legacy compatibility alias for referenceCode' })
  sourceCode?: string | null;
}

/**
 * Command payload to assign or update commercial origin on a draft Sale.
 */
export class AssignSaleSourceRequestDto {
  @ApiProperty({
    description: 'Commercial origin source reference to assign (ADR-0121)',
    type: () => SourceReferenceInputDto,
  })
  @Transform(({ obj, value }) => value ?? obj?.source)
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  @IsNotEmpty({ message: 'sourceReference object is required.' })
  sourceReference!: SourceReferenceInputDto;

  @ApiPropertyOptional({
    description: 'Legacy alias for sourceReference',
    type: () => SourceReferenceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  source?: SourceReferenceInputDto;
}
