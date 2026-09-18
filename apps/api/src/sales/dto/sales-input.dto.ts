import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SourceType } from '@kinergy-platform/core';

export class SourceReferenceInputDto {
  @ApiProperty({
    enum: SourceType,
    description: 'Catalog origin category',
    example: SourceType.INVENTORY_ITEM,
  })
  @IsEnum(SourceType)
  sourceType!: SourceType;

  @ApiProperty({
    description: 'Identifier of catalog origin entity',
    example: 'inv_123',
  })
  @IsString()
  @IsNotEmpty()
  sourceId!: string;

  @ApiPropertyOptional({
    description: 'Business catalog code',
    example: 'PROTEIN_1KG',
  })
  @IsString()
  @IsOptional()
  sourceCode?: string;
}

export class CreateSaleRequestDto {
  @ApiPropertyOptional({
    description: 'Normalized 3-letter uppercase ISO-4217 currency code',
    example: 'USD',
    default: 'USD',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter uppercase ISO-4217 code (e.g. USD, CAD, EUR).',
  })
  currency?: string;

  @ApiPropertyOptional({
    description: 'Customer or member ID participating in transaction',
    example: 'client_456',
  })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Origin source reference initiating checkout session',
    type: () => SourceReferenceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  source?: SourceReferenceInputDto;
}

export class ItemDiscountInputDto {
  @ApiProperty({
    description: 'Discount type (FIXED or PERCENTAGE)',
    example: 'PERCENTAGE',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    description:
      'Discount value (0-100 for percentage, or non-negative fixed amount with up to 2 decimal places)',
    example: 15,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value!: number;

  @ApiPropertyOptional({
    description: 'Commercial justification reason',
    example: 'VIP Membership Promo',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class AddSaleItemRequestDto {
  @ApiProperty({
    description: 'Commercial origin source reference',
    type: () => SourceReferenceInputDto,
  })
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  source!: SourceReferenceInputDto;

  @ApiProperty({
    description: 'Line item description snapshot at checkout',
    example: 'Bulk Protein Powder (1.25 kg)',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({
    description: 'SKU or plan code snapshot',
    example: 'PROT-1KG',
  })
  @IsString()
  @IsOptional()
  skuOrCode?: string;

  @ApiProperty({
    description: 'Quantity purchased (up to 3 decimal places, min: 0.001, max: 999999)',
    example: 1.25,
  })
  @IsNumber()
  @Min(0.001)
  @Max(999999)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({
    description:
      'Agreed gross unit price in major currency units. Scale: 2 decimal places, non-negative.',
    example: 24.5,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPriceAmount!: number;

  @ApiPropertyOptional({
    description: 'Optional discount configuration applied to line item',
    type: () => ItemDiscountInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemDiscountInputDto)
  discount?: ItemDiscountInputDto;
}

export class FinalizeSaleRequestDto {
  @ApiPropertyOptional({
    description: 'Optional cashier notes upon finalization',
    example: 'Checked out at Front Desk Terminal 1',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
