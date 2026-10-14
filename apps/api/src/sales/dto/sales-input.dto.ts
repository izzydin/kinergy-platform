import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType, SourceType } from '@kinergy-platform/core';

export { SourceReferenceInputDto } from './source-reference.dto';

export class ItemSourceInputDto {
  @ApiPropertyOptional({
    enum: SourceType,
    description: 'Catalog origin category',
    example: SourceType.INVENTORY_ITEM,
  })
  @IsEnum(SourceType)
  @IsOptional()
  sourceType?: SourceType;

  @ApiPropertyOptional({
    description: 'Identifier of catalog origin entity',
    example: 'inv_123',
  })
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Business catalog code',
    example: 'PROTEIN_1KG',
  })
  @IsString()
  @IsOptional()
  sourceCode?: string;
}

export class ItemDiscountInputDto {
  @ApiProperty({
    enum: DiscountType,
    description: 'Discount type (PERCENTAGE, FIXED, FIXED_AMOUNT)',
    example: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType, {
    message: 'Discount type must be one of: PERCENTAGE, FIXED, FIXED_AMOUNT.',
  })
  @IsNotEmpty({ message: 'Discount type cannot be empty.' })
  type!: DiscountType | string;

  @ApiProperty({
    description:
      'Discount value (0-100 for percentage, or non-negative fixed amount with up to 2 decimal places)',
    example: 15,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Discount value must be a valid number with at most 2 decimal places.' },
  )
  @Min(0, { message: 'Discount value cannot be negative.' })
  @Type(() => Number)
  value!: number;

  @ApiPropertyOptional({
    description: 'Commercial justification reason',
    example: 'VIP Membership Promo',
  })
  @IsString({ message: 'Discount reason must be a string if provided.' })
  @IsOptional()
  @MaxLength(255, { message: 'Discount reason cannot exceed 255 characters.' })
  reason?: string;
}

export { ApplySaleDiscountRequestDto } from './apply-sale-discount-request.dto';

export class FinalizeSaleRequestDto {
  @ApiPropertyOptional({
    description: 'Optional cashier notes upon finalization',
    example: 'Checked out at Front Desk Terminal 1',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export { CancelSaleRequestDto } from './cancel-sale-request.dto';

export class CoordinateSalePaymentRequestDto {
  @ApiProperty({
    description: 'UUID of the completed payment to coordinate against the Sale',
    example: 'pay_01j9876543210abcdef',
  })
  @IsString({ message: 'Payment ID must be a string.' })
  @Matches(/\S/, { message: 'Payment ID cannot be empty or whitespace.' })
  @IsNotEmpty({ message: 'Payment ID cannot be empty.' })
  paymentId!: string;
}
