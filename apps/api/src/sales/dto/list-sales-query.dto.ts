import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class ListSalesQueryDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for pagination. Default: 1.',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size limit (number of items per page). Min: 1, Max: 100, Default: 20.',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Optional cursor for cursor-based pagination. If provided, must be a non-empty string.',
    example: 'sale_01j9876543210abcdef',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Free-text search filter matching sourceCode substring or exact Sale ID.',
    example: 'REGISTER_1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiPropertyOptional({
    description: 'Alias for free-text search filter.',
    example: 'REGISTER_1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter sales by customer/client ID.',
    example: 'client_456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientId?: string;

  @ApiPropertyOptional({
    description:
      'Filter sales by lifecycle status (DRAFT, PENDING_PAYMENT, PARTIALLY_PAID, PAID, COMPLETED, CANCELLED, REFUNDED).',
    example: 'DRAFT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional({
    description:
      'Filter sales by catalog source origin type (e.g. INVENTORY_ITEM, MEMBERSHIP_PLAN, etc.).',
    example: 'INVENTORY_ITEM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter sales by external origin entity reference identifier.',
    example: 'inv_123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceReferenceId?: string;

  @ApiPropertyOptional({
    description: 'Filter sales created on or after this ISO-8601 UTC timestamp.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'fromDate must be a valid ISO-8601 date string.' })
  @MaxLength(50)
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Alias for fromDate filter.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'dateFrom must be a valid ISO-8601 date string.' })
  @MaxLength(50)
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter sales created on or before this ISO-8601 UTC timestamp.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'toDate must be a valid ISO-8601 date string.' })
  @MaxLength(50)
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Alias for toDate filter.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'dateTo must be a valid ISO-8601 date string.' })
  @MaxLength(50)
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Compound sort query string adhering to frontend conventions: <field>.<dir> (e.g. createdAt.desc, total.asc, status.desc).',
    example: 'createdAt.desc',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({
    description:
      'Primary sort field. Allowed: createdAt, total, totalAmount, status. Default: createdAt.',
    example: 'createdAt',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'total', 'totalAmount', 'status'])
  sortField?: string;

  @ApiPropertyOptional({
    description: 'Sort direction. Allowed: asc, desc. Default: desc.',
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDirection?: string;
}
