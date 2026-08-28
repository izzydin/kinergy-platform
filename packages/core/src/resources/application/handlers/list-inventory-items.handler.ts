import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListInventoryItemsQuery } from '../queries/list-inventory-items.query';
import { InventoryItemDTO } from '../dtos/inventory-item.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';
import {
  InventoryItemRepository,
  InventorySortField,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';

const ALLOWED_SORT_FIELDS = new Set<InventorySortField>([
  'name',
  'sku',
  'category',
  'quantityOnHand',
  'sellingPrice',
  'createdAt',
  'updatedAt',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Use case handler orchestrating catalog querying, filtering, and bounded pagination.
 * Follows the deterministic specification in `docs/architecture/resources/inventory-query-contract.md`.
 */
export class ListInventoryItemsHandler implements QueryHandler<
  ListInventoryItemsQuery,
  ApplicationResult<PaginatedResultDTO<InventoryItemDTO>>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(
    query: ListInventoryItemsQuery,
  ): Promise<ApplicationResult<PaginatedResultDTO<InventoryItemDTO>>> {
    try {
      const { tenantId, filter } = query.input;

      // 1. Normalize Pagination Bounds
      const rawPage = filter?.page ?? DEFAULT_PAGE;
      const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_PAGE;

      const rawLimit = filter?.limit ?? DEFAULT_LIMIT;
      let limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) {
        limit = MAX_LIMIT;
      }

      const offset = (page - 1) * limit;

      // 2. Validate & Normalize Sorting Whitelist
      let sortBy: InventorySortField = 'name';
      if (filter?.sortBy && ALLOWED_SORT_FIELDS.has(filter.sortBy as InventorySortField)) {
        sortBy = filter.sortBy as InventorySortField;
      }

      const sortOrder: 'asc' | 'desc' = filter?.sortOrder === 'desc' ? 'desc' : 'asc';

      // 3. Normalize Search String
      const search = filter?.search?.trim();

      // 4. Query Repository
      const repoFilter = {
        tenantId,
        category: filter?.category,
        status: filter?.status,
        includeArchived: filter?.includeArchived,
        search: search && search.length > 0 ? search.slice(0, 100) : undefined,
        stockStatus: filter?.stockStatus,
        limit,
        offset,
        sortBy,
        sortOrder,
      };

      const [items, total] = await Promise.all([
        this.repository.findMany(repoFilter),
        this.repository.count(repoFilter),
      ]);

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1 && total > 0;

      const result: PaginatedResultDTO<InventoryItemDTO> = {
        items: items.map(InventoryItemMapper.toDTO),
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };

      return ApplicationResult.ok(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list inventory items.';
      return ApplicationResult.fail(message);
    }
  }
}
