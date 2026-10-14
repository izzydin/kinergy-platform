import { ApiProperty } from '@nestjs/swagger';
import { PaymentResponseDto } from './payment-response.dto';

export class PaymentPaginationMetadataDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Page size limit' })
  limit!: number;

  @ApiProperty({ example: 100, description: 'Total records matching query' })
  total!: number;

  @ApiProperty({ example: 5, description: 'Total available pages' })
  totalPages!: number;
}

export class PaginatedPaymentsResponseDto {
  @ApiProperty({
    type: [PaymentResponseDto],
    description: 'Paginated collection of payment records',
  })
  items!: PaymentResponseDto[];

  @ApiProperty({ example: 1, description: 'Current page' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Page limit' })
  limit!: number;

  @ApiProperty({ example: 100, description: 'Total count' })
  total!: number;

  @ApiProperty({ example: 5, description: 'Total pages' })
  totalPages!: number;

  @ApiProperty({ example: true, description: 'Indicates if next page exists' })
  hasNextPage!: boolean;

  @ApiProperty({ example: false, description: 'Indicates if previous page exists' })
  hasPreviousPage!: boolean;

  @ApiProperty({
    type: [PaymentResponseDto],
    description: 'Alias for items conforming to ADR-0138',
  })
  get data(): PaymentResponseDto[] {
    return this.items;
  }

  @ApiProperty({ type: PaymentPaginationMetadataDto, description: 'Pagination metadata summary' })
  get meta(): PaymentPaginationMetadataDto {
    return {
      page: this.page,
      limit: this.limit,
      total: this.total,
      totalPages: this.totalPages,
    };
  }
}
