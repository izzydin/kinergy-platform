import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType } from '@kinergy-platform/core';

/**
 * Client request DTO for applying an order-level commercial discount (POST /sales/:id/discount).
 *
 * In accordance with Phase 7.3, 7.4 & ADR-0113 / ADR-0114 / ADR-0136:
 * - Accepts only the approved discount inputs: type, value, and optional reason.
 * - Enforces exact 2-decimal scale precision on discount value.
 * - Prevents negative values and unapproved discount types at validation boundary.
 * - Strictly forbids client-submitted subtotal, discountTotal, total, or status overrides.
 */
export class ApplySaleDiscountRequestDto {
  @ApiProperty({
    enum: DiscountType,
    description: 'Commercial discount calculation type (PERCENTAGE, FIXED, FIXED_AMOUNT)',
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
    example: 10,
    type: Number,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Discount value must be a valid number with at most 2 decimal places.' },
  )
  @Min(0, { message: 'Discount value cannot be negative.' })
  @Type(() => Number)
  value!: number;

  @ApiPropertyOptional({
    description: 'Commercial justification or audit reason (max 255 characters)',
    example: 'VIP Membership Promo',
  })
  @IsString({ message: 'Discount reason must be a string if provided.' })
  @IsOptional()
  @MaxLength(255, { message: 'Discount reason cannot exceed 255 characters.' })
  reason?: string;
}
