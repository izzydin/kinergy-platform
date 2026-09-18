import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoneyResponseDto } from './money-response.dto';

export class ItemDiscountResponseDto {
  @ApiProperty({
    description: 'Type of discount (FIXED or PERCENTAGE)',
    example: 'PERCENTAGE',
  })
  type!: string;

  @ApiProperty({
    description: 'Discount value (percentage 0-100 or fixed amount in major currency units)',
    example: 10,
  })
  value!: number;

  @ApiPropertyOptional({
    description: 'Audit justification reason for applying discount',
    example: 'VIP 10% Member Concession',
  })
  reason?: string | null;
}

export class SaleItemResponseDto {
  @ApiProperty({
    description: 'Unique internal identifier for the line item (SaleItemId)',
    example: 'item_01j9876543210abcdef',
  })
  id!: string;

  @ApiProperty({
    description: 'Classification of origin entity (INVENTORY_ITEM, MEMBERSHIP_PLAN, etc.)',
    example: 'INVENTORY_ITEM',
  })
  sourceType!: string;

  @ApiProperty({
    description: 'External ID in origin bounded context catalog',
    example: 'inv_123',
  })
  sourceId!: string;

  @ApiPropertyOptional({
    description: 'Optional catalog or billing code snapshot',
    example: 'PROTEIN_1KG',
  })
  sourceCode?: string | null;

  @ApiProperty({
    description: 'Snapshot description at checkout',
    example: 'Bulk Protein Powder (1.25 kg)',
  })
  description!: string;

  @ApiPropertyOptional({
    description: 'SKU or plan code snapshot',
    example: 'PROT-1KG-VAN',
  })
  skuOrCode?: string | null;

  @ApiProperty({
    description: 'Quantity purchased (up to 3 decimal places)',
    example: 1.25,
  })
  quantity!: number;

  // --- MONETARY FIELDS (STRUCTURED VO) ---

  @ApiProperty({
    description: 'Agreed gross unit price as structured Money',
    type: () => MoneyResponseDto,
  })
  unitPrice!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat projection: Agreed gross unit price amount (scale: 2)',
    example: 24.5,
    type: Number,
  })
  unitPriceAmount!: number;

  @ApiProperty({
    description:
      'Gross line subtotal as structured Money. Calculated as unitPrice * quantity with Half-Up rounding.',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat projection: Gross line subtotal amount (scale: 2)',
    example: 30.63,
    type: Number,
  })
  subtotalAmount!: number;

  @ApiPropertyOptional({
    description: 'Optional discount applied to this line item',
    type: () => ItemDiscountResponseDto,
  })
  discount?: ItemDiscountResponseDto | null;

  @ApiProperty({
    description:
      'Total discount deduction applied to this line item as structured Money. Invariant: discountTotal <= subtotal.',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat projection: Line discount total amount (scale: 2)',
    example: 3.06,
    type: Number,
  })
  discountTotalAmount!: number;

  @ApiProperty({
    description:
      'Net line total payable as structured Money. Calculated as subtotal - discountTotal. Guaranteed non-negative (>= 0.00).',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  @ApiProperty({
    description: 'Flat projection: Net line total payable amount (scale: 2)',
    example: 27.57,
    type: Number,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'ISO-4217 uppercase currency code',
    example: 'USD',
  })
  currency!: string;
}
