import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@kinergy-platform/core';

/**
 * Client request DTO to record a payment tender against a finalized sale.
 *
 * In accordance with ADR-0115:
 * - Authoritatively specifies method, amount, and optional reference.
 * - Does NOT accept subtotal, discountTotal, total, status, or paidAt from the client.
 */
export class RecordPaymentRequestDto {
  @ApiProperty({
    enum: PaymentMethod,
    description: 'Supported payment tender method (e.g., CASH, QR)',
    example: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod, {
    message: 'Payment method must be one of the supported methods: CASH, QR.',
  })
  @IsNotEmpty({ message: 'Payment method cannot be empty.' })
  method!: PaymentMethod;

  @ApiProperty({
    description:
      'Payment tender amount in major currency units. Must be strictly positive and conform to exact 2-decimal scale.',
    example: 49.99,
    type: Number,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Payment amount must be a valid number with at most 2 decimal places.' },
  )
  @IsPositive({ message: 'Payment amount must be strictly greater than 0.' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Normalized 3-letter uppercase ISO-4217 currency code. Must match Sale currency.',
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
    description:
      'Optional cashier register drawer tag, receipt sequence, or gateway transaction trace reference.',
    example: 'DRAWER-01-RECEIPT-99',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Reference cannot exceed 100 characters.' })
  @Matches(/^[A-Za-z0-9#\-_/.: ]+$/, {
    message:
      'Reference contains prohibited characters. Only alphanumeric characters and safe punctuation (#, -, _, /, ., :, space) are permitted.',
  })
  reference?: string;
}
