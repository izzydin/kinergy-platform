import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoneyResponseDto } from './money-response.dto';
import { SaleItemResponseDto } from './sale-item-response.dto';

export class SaleResponseDto {
  @ApiProperty({
    description: 'Unique canonical identifier of the sale (SaleId)',
    example: 'sale_01j9876543210abcdef',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Multi-tenant organization boundary identifier',
    example: 'tenant_123',
  })
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Optional customer/client identifier',
    example: 'client_456',
  })
  clientId?: string;

  @ApiProperty({
    description: 'Operating currency code (ISO-4217)',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Current commercial lifecycle status',
    example: 'DRAFT',
  })
  status!: string;

  // --- CANONICAL MONETARY FIELDS (STRUCTURED MONEY DTO) ---

  @ApiProperty({
    description:
      'Gross order subtotal as structured Money. Sum of line item subtotals: Σ(item.quantity × item.unitPrice). Invariant: subtotal >= 0.00.',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description:
      'Total discounts applied to the order as structured Money. Sum of line item discounts: Σ(item.discountTotal). Invariant: 0.00 <= discountTotal <= subtotal.',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description:
      'Net payable order total as structured Money. Calculated deterministically as subtotal - discountTotal. Invariant: total >= 0.00.',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  // --- FLAT SUMMARY READ PROJECTIONS (ADR-0114 Section 5.5) ---

  @ApiProperty({
    description:
      'Flat projection: Gross order subtotal amount in major currency units. Precision: integer cents, scale: 2 decimal places. Guaranteed non-negative (>= 0.00).',
    example: 109.96,
    type: Number,
  })
  subtotalAmount!: number;

  @ApiProperty({
    description:
      'Flat projection: Total order discount amount in major currency units. Precision: integer cents, scale: 2 decimal places. Guaranteed non-negative (>= 0.00).',
    example: 17.5,
    type: Number,
  })
  discountTotalAmount!: number;

  @ApiProperty({
    description:
      'Flat projection: Net payable order total amount in major currency units. Calculated as subtotalAmount - discountTotalAmount. Precision: integer cents, scale: 2 decimal places. Guaranteed non-negative (>= 0.00).',
    example: 92.46,
    type: Number,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'Total count of line items in this order',
    example: 2,
  })
  itemCount!: number;

  @ApiProperty({
    description: 'Line items belonging to this commercial sale',
    type: () => [SaleItemResponseDto],
  })
  items!: SaleItemResponseDto[];

  @ApiProperty({
    description: 'Optimistic concurrency control version counter',
    example: 1,
  })
  version!: number;

  @ApiProperty({
    description: 'Creation timestamp in ISO-8601 UTC format',
    example: '2026-09-18T12:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last update timestamp in ISO-8601 UTC format',
    example: '2026-09-18T12:00:00.000Z',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description: 'Completion timestamp in ISO-8601 UTC format',
    example: null,
  })
  completedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Cancellation timestamp in ISO-8601 UTC format',
    example: null,
  })
  cancelledAt?: string | null;

  @ApiPropertyOptional({
    description: 'Commercial reason for cancellation',
    example: null,
  })
  cancellationReason?: string | null;

  @ApiPropertyOptional({
    description: 'Refund timestamp in ISO-8601 UTC format',
    example: null,
  })
  refundedAt?: string | null;
}

export class SaleSummaryResponseDto {
  @ApiProperty({
    description: 'Sale identifier',
    example: 'sale_01j9876543210abcdef',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Tenant boundary ID',
    example: 'tenant_123',
  })
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Client identifier',
    example: 'client_456',
  })
  clientId?: string;

  @ApiProperty({
    description: 'Currency code',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Sale lifecycle status',
    example: 'DRAFT',
  })
  status!: string;

  @ApiProperty({
    description: 'Gross order subtotal as structured Money',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Order discount total as structured Money',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Net payable total as structured Money',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat projection: Subtotal amount',
    example: 100.0,
    type: Number,
  })
  subtotalAmount!: number;

  @ApiProperty({
    description: 'Flat projection: Discount total amount',
    example: 15.0,
    type: Number,
  })
  discountTotalAmount!: number;

  @ApiProperty({
    description: 'Flat projection: Total amount',
    example: 85.0,
    type: Number,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'Total item count',
    example: 2,
  })
  itemCount!: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-09-18T12:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-09-18T12:00:00.000Z',
  })
  updatedAt!: string;
}
