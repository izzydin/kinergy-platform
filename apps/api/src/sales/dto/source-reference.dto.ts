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
import { SaleSource, SaleSourceType } from '@kinergy-platform/core';

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
 * Represents the generic reference without leaking implementation details.
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
    description: 'Optional human order reference or terminal code, or null if absent',
    example: 'ORD-2026-0042',
    nullable: true,
  })
  referenceCode?: string | null;

  // Legacy compatibility aliases
  @ApiPropertyOptional({
    description: 'Legacy compatibility alias for type',
    deprecated: true,
  })
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Legacy compatibility alias for referenceId',
    deprecated: true,
  })
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Legacy compatibility alias for referenceCode',
    deprecated: true,
    nullable: true,
  })
  sourceCode?: string | null;

  public static fromDomain(
    source: SaleSource | Record<string, unknown> | null | undefined,
  ): SaleSourceResponseDto | null {
    if (!source) {
      return null;
    }
    const dto = new SaleSourceResponseDto();
    if (source instanceof SaleSource) {
      dto.type = source.type;
      dto.referenceId = source.referenceId;
      dto.referenceCode = null;
    } else {
      const src = source as Record<string, unknown>;
      const resolvedType = (src.type ?? src.sourceType) as string | undefined;
      const resolvedRefId = (src.referenceId ?? src.sourceId) as string | undefined;
      if (!resolvedType || !resolvedRefId) {
        return null;
      }
      dto.type = resolvedType;
      dto.referenceId = resolvedRefId;
      dto.referenceCode = ((src.referenceCode ?? src.sourceCode) as string | null) ?? null;
    }
    return dto;
  }
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
