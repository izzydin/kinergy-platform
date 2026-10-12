import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SourceReferenceInputDto } from './source-reference.dto';
import { ItemDiscountInputDto, ItemSourceInputDto } from './sales-input.dto';

/**
 * Request DTO for adding a catalog line item to a draft Sale (POST /sales/:id/items).
 * Adheres strictly to ADR-0121, ADR-0135, and ADR-0136.
 *
 * Enforces:
 * - Line item description, positive quantity (0.001 - 999999), and non-negative unit price
 * - Optional commercial origin source reference (defaults to parent Sale origin if omitted)
 * - Optional line-item discount configuration
 * - Rejection of client-calculated financial totals (subtotal, discountTotal, total, lineTotal)
 * - Rejection of foreign saleId or entity ID injection
 */
export class AddSaleItemRequestDto {
  @ApiProperty({
    description: 'Line item description snapshot at checkout',
    example: 'Bulk Protein Powder (1.25 kg)',
    maxLength: 255,
  })
  @IsString({ message: 'description must be a string.' })
  @Matches(/\S/, { message: 'description cannot be empty or whitespace.' })
  @IsNotEmpty({ message: 'description is required.' })
  @MaxLength(255, { message: 'description cannot exceed 255 characters.' })
  description!: string;

  @ApiProperty({
    description: 'Quantity purchased (up to 3 decimal places, min: 0.001, max: 999999)',
    example: 1.25,
  })
  @IsNumber({}, { message: 'quantity must be a valid number.' })
  @Min(0.001, { message: 'quantity must be at least 0.001.' })
  @Max(999999, { message: 'quantity cannot exceed 999999.' })
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({
    description:
      'Agreed gross unit price in major currency units. Scale: 2 decimal places, non-negative.',
    example: 24.5,
  })
  @IsNumber({}, { message: 'unitPriceAmount must be a valid number.' })
  @Min(0, { message: 'unitPriceAmount cannot be negative.' })
  @Type(() => Number)
  unitPriceAmount!: number;

  @ApiPropertyOptional({
    description: 'SKU or plan code snapshot',
    example: 'PROT-1KG',
    maxLength: 100,
  })
  @IsString({ message: 'skuOrCode must be a string.' })
  @IsOptional()
  @MaxLength(100, { message: 'skuOrCode cannot exceed 100 characters.' })
  skuOrCode?: string;

  @ApiPropertyOptional({
    description:
      'Commercial origin source reference (ADR-0121). If omitted, defaults to parent Sale source.',
    type: () => SourceReferenceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  sourceReference?: SourceReferenceInputDto;

  @ApiPropertyOptional({
    description: 'Legacy commercial origin source reference alias',
    type: () => ItemSourceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemSourceInputDto)
  source?: ItemSourceInputDto;

  @ApiPropertyOptional({
    description: 'Optional discount configuration applied to line item',
    type: () => ItemDiscountInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemDiscountInputDto)
  discount?: ItemDiscountInputDto;
}
