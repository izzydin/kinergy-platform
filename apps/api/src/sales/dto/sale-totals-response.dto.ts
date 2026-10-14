import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoneyResponseDto } from './money-response.dto';
import { ItemDiscountResponseDto } from './sale-item-response.dto';

/**
 * OpenAPI Response DTO for Authoritative Sales Calculations (GET /sales/:id/calculate).
 * Represents in-memory recalculation of financial totals without persistence side-effects.
 */
export class SaleTotalsResponseDto {
  @ApiProperty({
    description: 'Target sale order unique identifier',
    example: 'sale_01j9876543210abcdef',
  })
  saleId!: string;

  @ApiProperty({
    description: 'ISO-4217 3-letter currency code',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Authoritative gross subtotal as structured Money',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Authoritative total discount as structured Money',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Authoritative net payable total as structured Money',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat numeric subtotal amount in major currency units',
    example: 99.98,
    type: Number,
  })
  subtotalAmount!: number;

  @ApiProperty({
    description: 'Flat numeric discount total amount in major currency units',
    example: 15.0,
    type: Number,
  })
  discountTotalAmount!: number;

  @ApiProperty({
    description: 'Flat numeric net payable total amount in major currency units',
    example: 84.98,
    type: Number,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'Total item count contributing to this calculation',
    example: 2,
    type: Number,
  })
  itemCount!: number;

  @ApiPropertyOptional({
    description: 'Order-level discount configuration, or null if none applied',
    type: () => ItemDiscountResponseDto,
    nullable: true,
  })
  orderDiscount?: ItemDiscountResponseDto | null;
}
