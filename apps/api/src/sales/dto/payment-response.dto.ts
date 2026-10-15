import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@kinergy-platform/core';
import { MoneyResponseDto } from './money-response.dto';

/**
 * Compact summary projection of a Payment transaction.
 * Designed for lightweight listing views and chronological order history without redundant fields.
 */
export class PaymentSummaryResponseDto {
  @ApiProperty({
    description: 'Unique payment transaction identifier (UUID)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    type: String,
  })
  id!: string;

  @ApiProperty({
    description: 'Identifier of the associated commercial Sale aggregate (UUID)',
    example: 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c',
    type: String,
  })
  saleId!: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Supported tender method utilized for payment (e.g. CASH, QR)',
    example: PaymentMethod.CASH,
  })
  method!: PaymentMethod;

  @ApiProperty({
    type: () => MoneyResponseDto,
    description:
      'Structured monetary amount with exact cents and deterministic string formatting. Guaranteed zero IEEE-754 floating-point drift.',
  })
  amount!: MoneyResponseDto;

  @ApiProperty({
    description: 'Decimal number representation of payment amount in major currency units.',
    example: 49.99,
    type: Number,
  })
  amountValue!: number;

  @ApiProperty({
    enum: PaymentStatus,
    description:
      'Current lifecycle state of payment (PENDING, COMPLETED, FAILED, CANCELLED). Note: A status of COMPLETED indicates the payment tender was registered as settled in the internal sales aggregate ledger (e.g. physical cash tendered or cashier-confirmed counter QR). It does not imply external rail settlement or third-party banking verification unless coordinated through an integrated gateway.',
    example: PaymentStatus.COMPLETED,
  })
  status!: PaymentStatus;

  @ApiProperty({
    description: 'Audit drawer tag, receipt sequence, or gateway transaction trace reference.',
    example: 'DRAWER-01-RECEIPT-99',
    nullable: true,
    type: String,
  })
  reference!: string | null;

  @ApiProperty({
    description:
      'ISO 8601 UTC timestamp of financial settlement, or null if pending, failed, or cancelled.',
    example: '2026-09-21T10:00:00.000Z',
    nullable: true,
    type: String,
  })
  paidAt!: string | null;

  @ApiProperty({
    description: 'ISO 8601 UTC creation timestamp.',
    example: '2026-09-21T10:00:00.000Z',
    type: String,
  })
  createdAt!: string;
}

/**
 * Standard API Response Representation for a Payment transaction.
 * Conforms strictly to ADR-0115 and Milestone 7.4 Monetary Serialization Policy.
 */
export class PaymentResponseDto extends PaymentSummaryResponseDto {
  @ApiProperty({
    description: 'Optimistic concurrency control integer version sequence.',
    example: 1,
    type: Number,
  })
  version!: number;
}

/**
 * Detailed API Response Representation for a Payment transaction.
 * Provides explicit contract semantics for individual payment lookups while maintaining
 * zero-leakage of internal persistence fields (e.g. tenantId, ORM timestamps).
 */
export class PaymentDetailResponseDto extends PaymentResponseDto {}
