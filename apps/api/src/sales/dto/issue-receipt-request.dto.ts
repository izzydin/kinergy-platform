import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * Request payload for issuing a customer receipt voucher.
 *
 * Invariant Enforcement:
 * Clients MUST NOT submit domain-controlled financial values (subtotal, discount, total,
 * payment status, payment method, issue date). The server derives all snapshot state
 * authoritatively from settled Sale and Payment aggregates.
 * Codified by ADR-0117.
 */
export class IssueReceiptRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional client-supplied receipt domain identifier (UUID v4) for strict idempotency.',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    type: String,
  })
  @IsOptional()
  @IsUUID('4', { message: 'receiptId must be a valid UUID v4' })
  receiptId?: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable commercial order reference override.',
    example: 'ORD-2026-00042',
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  saleReference?: string;
}

/**
 * Request payload when issuing a receipt directly via POST /receipts with saleId in body.
 */
export class IssueReceiptDirectRequestDto extends IssueReceiptRequestDto {
  @ApiProperty({
    description: 'Target Sale identifier. Required when calling POST /receipts directly.',
    example: 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c',
    type: String,
  })
  @IsNotEmpty({ message: 'saleId is required.' })
  @IsString({ message: 'saleId must be a string.' })
  @Matches(/\S/, { message: 'saleId cannot be empty or whitespace.' })
  saleId!: string;
}
