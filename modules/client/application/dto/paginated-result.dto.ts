import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResultDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;

  public static create<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResultDto<T> {
    const safeLimit = Math.max(1, limit);
    const safePage = Math.max(1, page);
    const totalPages = Math.ceil(total / safeLimit);

    const dto = new PaginatedResultDto<T>();
    dto.items = items;
    dto.total = total;
    dto.page = safePage;
    dto.limit = safeLimit;
    dto.totalPages = totalPages;
    dto.hasNextPage = safePage < totalPages;
    dto.hasPreviousPage = safePage > 1;
    return dto;
  }
}
