import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ListStockMovementsQuery } from '../queries/list-stock-movements.query';
import { StockMovementDTO } from '../dtos/stock-movement.dto';
import { PaginatedResultDTO } from '../dtos/paginated-result.dto';
import {
  InventoryItemRepository,
  FindStockMovementsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { InventoryItemMapper } from '../mappers/inventory-item.mapper';

/**
 * Use case handler retrieving paginated and filtered stock movement ledger entries.
 * Enforces deterministic date range parsing, pagination caps, and stable sorting.
 */
export class ListStockMovementsHandler implements QueryHandler<
  ListStockMovementsQuery,
  ApplicationResult<PaginatedResultDTO<StockMovementDTO>>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(
    query: ListStockMovementsQuery,
  ): Promise<ApplicationResult<PaginatedResultDTO<StockMovementDTO>>> {
    const { input } = query;

    // 1. Deterministic date boundary parsing
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (input.fromDate) {
      fromDate = typeof input.fromDate === 'string' ? new Date(input.fromDate) : input.fromDate;
      if (isNaN(fromDate.getTime())) {
        return ApplicationResult.fail(`Invalid fromDate provided: '${input.fromDate}'.`);
      }
    }

    if (input.toDate) {
      if (typeof input.toDate === 'string') {
        // If date-only string (e.g. YYYY-MM-DD), expand to end of day UTC
        if (/^\d{4}-\d{2}-\d{2}$/.test(input.toDate.trim())) {
          toDate = new Date(`${input.toDate.trim()}T23:59:59.999Z`);
        } else {
          toDate = new Date(input.toDate);
        }
      } else {
        toDate = input.toDate;
      }

      if (isNaN(toDate.getTime())) {
        return ApplicationResult.fail(`Invalid toDate provided: '${input.toDate}'.`);
      }
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return ApplicationResult.fail('fromDate cannot be after toDate.');
    }

    // 2. Pagination bounds (default page=1, limit=20, max 100)
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const offset = (page - 1) * limit;

    // 3. Build repository filter
    const filter: FindStockMovementsFilter = {
      itemId: input.itemId?.trim() || undefined,
      tenantId: input.tenantId?.trim() || undefined,
      movementType: input.movementType,
      recordedByUserId: input.recordedByUserId?.trim() || undefined,
      referenceId: input.referenceId?.trim() || undefined,
      fromDate,
      toDate,
      limit,
      offset,
      sortBy: input.sortBy ?? 'recordedAt',
      sortOrder: input.sortOrder ?? 'desc',
    };

    const movements = this.repository.findMovements
      ? await this.repository.findMovements(filter)
      : [];
    const total = this.repository.countMovements
      ? await this.repository.countMovements(filter)
      : movements.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1 && total > 0;

    const items = movements.map(InventoryItemMapper.toMovementDTO);

    return ApplicationResult.ok({
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    });
  }
}
