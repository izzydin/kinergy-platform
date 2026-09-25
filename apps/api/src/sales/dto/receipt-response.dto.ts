import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  ReceiptStatus,
  ReceiptDTO,
  ReceiptClientSnapshotDTO,
  ReceiptItemSnapshotDTO,
  ReceiptPaymentSnapshotDTO,
} from '@kinergy-platform/core';
import { MoneyResponseDto } from './money-response.dto';

export class ReceiptClientSnapshotResponseDto {
  @ApiProperty({
    description: 'Unique client identifier',
    example: 'cli_01j9876543210abcdef',
  })
  clientId!: string;

  @ApiPropertyOptional({
    description: 'Human-readable customer reference/membership number',
    example: 'CLI-2026-00042',
    nullable: true,
  })
  referenceNumber!: string | null;

  @ApiProperty({
    description: 'Customer legal or display full name',
    example: 'Jane Doe',
  })
  fullName!: string;

  @ApiPropertyOptional({
    description: 'Customer contact email address',
    example: 'jane.doe@example.com',
    nullable: true,
  })
  email!: string | null;

  @ApiPropertyOptional({
    description: 'Customer contact telephone number',
    example: '+1-555-0199',
    nullable: true,
  })
  phone!: string | null;

  public static fromDTO(
    dto: ReceiptClientSnapshotDTO | null,
  ): ReceiptClientSnapshotResponseDto | null {
    if (!dto) {
      return null;
    }
    const response = new ReceiptClientSnapshotResponseDto();
    response.clientId = dto.clientId;
    response.referenceNumber = dto.referenceNumber;
    response.fullName = dto.fullName;
    response.email = dto.email;
    response.phone = dto.phone;
    return response;
  }
}

export class ReceiptItemSnapshotResponseDto {
  @ApiProperty({
    description: 'Original Sale line item identifier',
    example: 'item_01j9876543210abcdef',
  })
  itemId!: string;

  @ApiProperty({
    description: 'Item source catalog domain type (e.g. INVENTORY_ITEM, MEMBERSHIP_PLAN)',
    example: 'INVENTORY_ITEM',
  })
  sourceType!: string;

  @ApiProperty({
    description: 'Identifier within the source catalog bounded context',
    example: 'inv_item_protein_shake_01',
  })
  sourceId!: string;

  @ApiProperty({
    description: 'Historical item description frozen at checkout',
    example: 'Whey Protein Isolate 1kg - Vanilla',
  })
  description!: string;

  @ApiPropertyOptional({
    description: 'Product SKU or catalog code snapshotted at sale time',
    example: 'SKU-PROT-VAN-01',
    nullable: true,
  })
  skuOrCode!: string | null;

  @ApiProperty({
    description: 'Purchased quantity',
    example: 1,
  })
  quantity!: number;

  @ApiProperty({
    description: 'Unit price captured at point of sale',
    type: () => MoneyResponseDto,
  })
  unitPrice!: MoneyResponseDto;

  @ApiProperty({
    description: 'Discount applied to this line item',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Line gross subtotal before discounts',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Line net total payable amount',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  public static fromDTO(dto: ReceiptItemSnapshotDTO): ReceiptItemSnapshotResponseDto {
    const response = new ReceiptItemSnapshotResponseDto();
    response.itemId = dto.itemId;
    response.sourceType = dto.sourceType;
    response.sourceId = dto.sourceId;
    response.description = dto.description;
    response.skuOrCode = dto.skuOrCode;
    response.quantity = dto.quantity;
    response.unitPrice = {
      amount: dto.unitPrice.amount,
      currency: dto.unitPrice.currency,
      formatted: dto.unitPrice.formatted,
      cents: dto.unitPrice.cents,
    };
    response.discountTotal = {
      amount: dto.discountTotal.amount,
      currency: dto.discountTotal.currency,
      formatted: dto.discountTotal.formatted,
      cents: dto.discountTotal.cents,
    };
    response.subtotal = {
      amount: dto.subtotal.amount,
      currency: dto.subtotal.currency,
      formatted: dto.subtotal.formatted,
      cents: dto.subtotal.cents,
    };
    response.total = {
      amount: dto.total.amount,
      currency: dto.total.currency,
      formatted: dto.total.formatted,
      cents: dto.total.cents,
    };
    return response;
  }
}

export class ReceiptPaymentSnapshotResponseDto {
  @ApiProperty({
    description: 'Payment aggregate identifier',
    example: 'pay_01j9876543210abcdef',
  })
  paymentId!: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Payment tender method utilized',
    example: PaymentMethod.CASH,
  })
  method!: PaymentMethod;

  @ApiProperty({
    description: 'Settled payment tender amount',
    type: () => MoneyResponseDto,
  })
  amount!: MoneyResponseDto;

  @ApiProperty({
    enum: PaymentStatus,
    description: 'Payment lifecycle status at settlement (COMPLETED)',
    example: PaymentStatus.COMPLETED,
  })
  status!: PaymentStatus;

  @ApiPropertyOptional({
    description: 'External gateway transaction trace, authorization code, or drawer tag',
    example: 'GATEWAY_CH_987654',
    nullable: true,
  })
  reference!: string | null;

  @ApiPropertyOptional({
    description: 'ISO 8601 UTC timestamp when payment was confirmed settled',
    example: '2026-09-25T10:00:00.000Z',
    nullable: true,
  })
  paidAt!: string | null;

  public static fromDTO(dto: ReceiptPaymentSnapshotDTO): ReceiptPaymentSnapshotResponseDto {
    const response = new ReceiptPaymentSnapshotResponseDto();
    response.paymentId = dto.paymentId;
    response.method = dto.method;
    response.amount = {
      amount: dto.amount.amount,
      currency: dto.amount.currency,
      formatted: dto.amount.formatted,
      cents: dto.amount.cents,
    };
    response.status = dto.status;
    response.reference = dto.reference;
    response.paidAt = dto.paidAt;
    return response;
  }
}

/**
 * Standard API Response Representation for an immutable Receipt proof-of-purchase document.
 * Codified by ADR-0114, ADR-0117, and ADR-0118.
 */
export class ReceiptResponseDto {
  @ApiProperty({
    description: 'Unique receipt identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  id!: string;

  @ApiProperty({
    description: 'Multi-tenant organization boundary identifier',
    example: 'tenant_kinergy_prime',
  })
  tenantId!: string;

  @ApiProperty({
    description: 'Reference to associated commercial Sale aggregate identifier (UUID)',
    example: 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c',
  })
  saleId!: string;

  @ApiProperty({
    description: 'Monotonically increasing, gap-free alphanumeric receipt sequence number',
    example: 'REC-2026-000421',
  })
  receiptNumber!: string;

  @ApiProperty({
    description: 'Commercial transaction reference snapshotted from sale at issuance',
    example: 'ORD-2026-00042',
  })
  saleReference!: string;

  @ApiProperty({
    description: 'ISO 8601 UTC timestamp of official receipt issuance',
    example: '2026-09-25T10:00:00.000Z',
  })
  issuedAt!: string;

  @ApiPropertyOptional({
    description:
      'Client customer presentation information frozen at issuance, or null for walk-ins',
    type: () => ReceiptClientSnapshotResponseDto,
    nullable: true,
  })
  clientSnapshot!: ReceiptClientSnapshotResponseDto | null;

  @ApiProperty({
    description: 'Itemized line products/services frozen at checkout',
    type: () => [ReceiptItemSnapshotResponseDto],
  })
  items!: ReceiptItemSnapshotResponseDto[];

  @ApiProperty({
    description: 'Total number of itemized line records',
    example: 2,
  })
  itemCount!: number;

  @ApiProperty({
    description: 'Gross subtotal as structured Money (sum of line items before discounts)',
    type: () => MoneyResponseDto,
  })
  subtotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Total discount amount applied as structured Money',
    type: () => MoneyResponseDto,
  })
  discountTotal!: MoneyResponseDto;

  @ApiProperty({
    description: 'Net payable total amount evidenced by this receipt',
    type: () => MoneyResponseDto,
  })
  total!: MoneyResponseDto;

  @ApiProperty({
    description: 'Operating currency code (ISO-4217)',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description: 'Chronological breakdown of settled payment tenders evidencing this receipt',
    type: () => [ReceiptPaymentSnapshotResponseDto],
  })
  payments!: ReceiptPaymentSnapshotResponseDto[];

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Payment tender method utilized for the primary settlement tender',
    example: PaymentMethod.CASH,
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    enum: PaymentStatus,
    description: 'Payment status of the primary tender (COMPLETED)',
    example: PaymentStatus.COMPLETED,
  })
  paymentStatus!: PaymentStatus;

  @ApiProperty({
    enum: ReceiptStatus,
    description: 'Current voucher lifecycle status (ISSUED, REPRINTED)',
    example: ReceiptStatus.ISSUED,
  })
  status!: ReceiptStatus;

  @ApiProperty({
    description: 'Operational duplicate reprint count. 0 for original issued voucher.',
    example: 0,
  })
  reprintCount!: number;

  @ApiPropertyOptional({
    description: 'ISO 8601 UTC timestamp of last duplicate reprint, or null if original',
    example: null,
    nullable: true,
  })
  lastReprintedAt!: string | null;

  @ApiProperty({
    description: 'ISO 8601 UTC creation timestamp in database',
    example: '2026-09-25T10:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Optimistic concurrency control version sequence',
    example: 1,
  })
  version!: number;

  public static fromDTO(dto: ReceiptDTO): ReceiptResponseDto {
    const response = new ReceiptResponseDto();
    response.id = dto.id;
    response.tenantId = dto.tenantId;
    response.saleId = dto.saleId;
    response.receiptNumber = dto.receiptNumber;
    response.saleReference = dto.saleReference;
    response.issuedAt = dto.issuedAt;
    response.clientSnapshot = ReceiptClientSnapshotResponseDto.fromDTO(dto.clientSnapshot);
    response.items = dto.items.map((item) => ReceiptItemSnapshotResponseDto.fromDTO(item));
    response.itemCount = dto.itemCount;
    response.subtotal = {
      amount: dto.subtotal.amount,
      currency: dto.subtotal.currency,
      formatted: dto.subtotal.formatted,
      cents: dto.subtotal.cents,
    };
    response.discountTotal = {
      amount: dto.discountTotal.amount,
      currency: dto.discountTotal.currency,
      formatted: dto.discountTotal.formatted,
      cents: dto.discountTotal.cents,
    };
    response.total = {
      amount: dto.total.amount,
      currency: dto.total.currency,
      formatted: dto.total.formatted,
      cents: dto.total.cents,
    };
    response.currency = dto.currency;
    response.payments = dto.payments.map((p) => ReceiptPaymentSnapshotResponseDto.fromDTO(p));
    response.paymentMethod = dto.paymentMethod;
    response.paymentStatus = dto.paymentStatus;
    response.status = dto.status;
    response.reprintCount = dto.reprintCount;
    response.lastReprintedAt = dto.lastReprintedAt;
    response.createdAt = dto.createdAt;
    response.version = dto.version;
    return response;
  }
}
