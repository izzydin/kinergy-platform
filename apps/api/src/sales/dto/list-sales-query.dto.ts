import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
    description: 'Free-text search filter matching sourceCode substring or exact Sale ID.',
    example: 'REGISTER_1',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Alias for free-text search filter.',
    example: 'REGISTER_1',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter sales by customer/client ID.',
    example: 'client_456',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description:
      'Filter sales by lifecycle status (DRAFT, PENDING_PAYMENT, PARTIALLY_PAID, PAID, COMPLETED, CANCELLED, REFUNDED).',
    example: 'DRAFT',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Filter sales by catalog source origin type (e.g. INVENTORY_ITEM, MEMBERSHIP_PLAN, etc.).',
    example: 'INVENTORY_ITEM',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter sales by external origin entity reference identifier.',
    example: 'inv_123',
  })
  @IsOptional()
  @IsString()
  sourceReferenceId?: string;

  @ApiPropertyOptional({
    description: 'Filter sales created on or after this ISO-8601 UTC timestamp.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter sales created on or before this ISO-8601 UTC timestamp.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({
    description:
      'Compound sort query string adhering to frontend conventions: <field>.<dir> (e.g. createdAt.desc, total.asc, status.desc).',
    example: 'createdAt.desc',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({
    description: 'Primary sort field. Allowed: createdAt, total, status. Default: createdAt.',
    example: 'createdAt',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'total', 'status'])
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
