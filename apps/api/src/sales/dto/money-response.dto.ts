import { ApiProperty } from '@nestjs/swagger';

/**
 * Deterministic API Representation of Monetary Values.
 * Defined by Milestone 7.4 Monetary Policy (ADR-0114).
 *
 * OpenAPI Contract Specification:
 * - Currency: Normalized 3-letter ISO-4217 uppercase code (e.g. 'USD', 'CAD', 'EUR').
 * - Precision: Exact integer minor units (cents).
 * - Scale: 2 decimal places (fixed point 0.01).
 * - Serialization Type: JSON Object `{ amount, currency, formatted, cents }`.
 * - Invariants: Non-negative amount (amount >= 0.00), zero values allowed ($0.00), no unrounded floats.
 */
export class MoneyResponseDto {
  @ApiProperty({
    description:
      'Monetary amount in major currency units. Precision: 2 decimal places (scale: 2). Guaranteed non-negative and free of binary floating-point drift.',
    example: 49.99,
    type: Number,
  })
  amount!: number;

  @ApiProperty({
    description: 'Normalized 3-letter uppercase ISO-4217 currency code (e.g., USD, CAD, EUR).',
    example: 'USD',
    type: String,
  })
  currency!: string;

  @ApiProperty({
    description:
      'Exact string formatting with fixed 2 decimal places (scale: 2). Guarantees lossless representation for arbitrary-precision clients.',
    example: '49.99',
    type: String,
  })
  formatted!: string;

  @ApiProperty({
    description:
      'Exact monetary amount in integer minor units (cents, scale: 0). Guaranteed 100% precision without floating-point artifacts.',
    example: 4999,
    type: Number,
  })
  cents!: number;
}
