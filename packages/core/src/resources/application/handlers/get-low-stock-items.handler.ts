import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetLowStockItemsQuery } from '../queries/get-low-stock-items.query';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';

/**
 * Use case handler retrieving products where current stock <= minimumStock threshold.
 * Includes zero-stock items and excludes archived items by default.
 */
export class GetLowStockItemsHandler implements QueryHandler<
  GetLowStockItemsQuery,
  ApplicationResult<PaginatedResultDTO<InventoryItemDTO>>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(
    query: GetLowStockItemsQuery,
  ): Promise<ApplicationResult<PaginatedResultDTO<InventoryItemDTO>>> {
    const { input } = query;

    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const offset = (page - 1) * limit;

    const filter: FindInventoryItemsFilter = {
      tenantId: input.tenantId?.trim() || undefined,
      category: input.category,
      includeArchived: input.includeArchived ?? false,
      lowStockOnly: true,
      limit,
      offset,
      sortBy: input.sortBy ?? 'name',
      sortOrder: input.sortOrder ?? 'asc',
    };

    const items = await this.repository.findMany(filter);
    const total = await this.repository.count(filter);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1 && total > 0;

    const dtos = items.map(InventoryItemMapper.toDTO);

    return ApplicationResult.ok({
      items: dtos,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    });
  }
}
