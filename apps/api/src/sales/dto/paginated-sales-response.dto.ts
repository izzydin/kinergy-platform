import { ApiProperty } from '@nestjs/swagger';
import { SaleSummaryResponseDto } from './sale-response.dto';

export class PaginatedSalesResponseDto {
  @ApiProperty({
    description: 'Array of sale order summary projections for the current page',
    type: () => [SaleSummaryResponseDto],
  })
  items!: SaleSummaryResponseDto[];

  @ApiProperty({
    description: 'Total number of sales matching the query criteria across all pages',
    example: 42,
  })
  total!: number;

  @ApiProperty({
    description: 'Current 1-indexed page number',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Requested page limit (items per page)',
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: 'Total number of pages calculated as ceil(total / limit)',
    example: 3,
  })
  totalPages!: number;

  @ApiProperty({
    description: 'Flag indicating if a subsequent page of results is available',
    example: true,
  })
  hasNextPage!: boolean;

  @ApiProperty({
    description: 'Flag indicating if a preceding page of results exists',
    example: false,
  })
  hasPreviousPage!: boolean;
}
