import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SourceReferenceInputDto } from './source-reference.dto';
import { ApplySaleDiscountRequestDto } from './sales-input.dto';
import { AddSaleItemRequestDto } from './add-sale-item-request.dto';

/**
 * Request DTO for initializing a new commercial checkout session (POST /sales).
 * Adheres strictly to ADR-0121, ADR-0135, and ADR-0136.
 *
 * Enforces:
 * - Deterministic DRAFT status initialized exclusively by domain aggregate
 * - Rejection of client-authoritative calculated totals (subtotal, discountTotal, total)
 * - Rejection of lifecycle status, payment, or receipt data injection
 * - ISO-4217 currency format validation
 * - Generic SaleSource origin reference validation (ADR-0121)
 * - Strict field whitelisting via GlobalSanitizationValidationPipe
 */
export class CreateSaleRequestDto {
  @ApiPropertyOptional({
    description: 'Client-supplied unique Sale ID or transaction identity',
    example: 'sale_01j9876543210abcdef',
    maxLength: 255,
  })
  @IsString({ message: 'id must be a string.' })
  @Matches(/\S/, { message: 'id cannot be empty or whitespace.' })
  @MaxLength(255, { message: 'id cannot exceed 255 characters.' })
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate creation on network retries',
    example: 'idem_987654321',
    maxLength: 255,
  })
  @IsString({ message: 'idempotencyKey must be a string.' })
  @Matches(/\S/, { message: 'idempotencyKey cannot be empty or whitespace.' })
  @MaxLength(255, { message: 'idempotencyKey cannot exceed 255 characters.' })
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Normalized 3-letter uppercase ISO-4217 currency code',
    example: 'USD',
    default: 'USD',
  })
  @IsString({ message: 'currency must be a string.' })
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter uppercase ISO-4217 code (e.g. USD, CAD, EUR).',
  })
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    description:
      'Customer or member ID participating in transaction. If omitted, represents anonymous walk-in.',
    example: 'client_456',
    maxLength: 255,
  })
  @IsString({ message: 'clientId must be a string.' })
  @Matches(/\S/, { message: 'clientId cannot be empty or whitespace.' })
  @MaxLength(255, { message: 'clientId cannot exceed 255 characters.' })
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Commercial origin source reference initiating checkout session (ADR-0121)',
    type: () => SourceReferenceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  sourceReference?: SourceReferenceInputDto;

  @ApiPropertyOptional({
    description: 'Legacy commercial origin source reference alias initiating checkout session',
    type: () => SourceReferenceInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceReferenceInputDto)
  source?: SourceReferenceInputDto;

  @ApiPropertyOptional({
    description: 'Initial line items to attach upon creation (ADR-0136)',
    type: () => [AddSaleItemRequestDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddSaleItemRequestDto)
  items?: AddSaleItemRequestDto[];

  @ApiPropertyOptional({
    description: 'Initial order discount to apply upon creation (ADR-0136)',
    type: () => ApplySaleDiscountRequestDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApplySaleDiscountRequestDto)
  orderDiscount?: ApplySaleDiscountRequestDto;
}
