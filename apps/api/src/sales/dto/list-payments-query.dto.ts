import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@kinergy-platform/core';

/**
 * Validated query parameters for listing payments across the tenant ledger.
 * Conforms to ADR-0138 §3.4.
 */
export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Filter payments by associated Sale UUID' })
  @IsOptional()
  @IsString()
  saleId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus, description: 'Filter payments by status' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod, description: 'Filter payments by tender method' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Filter payments created on or after this ISO-8601 UTC timestamp',
  })
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter payments created on or before this ISO-8601 UTC timestamp',
  })
  @IsOptional()
  @IsISO8601()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Alias for fromDate' })
  @IsOptional()
  @IsISO8601()
  createdAtFrom?: string;

  @ApiPropertyOptional({ description: 'Alias for toDate' })
  @IsOptional()
  @IsISO8601()
  createdAtTo?: string;

  @ApiPropertyOptional({ description: 'Page number (>= 1)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size limit (1..100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    default: 'createdAt',
    enum: ['createdAt', 'paidAt', 'amount', 'status'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}
