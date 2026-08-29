import { QueryHandler } from '../shared/query-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { GetStockLevelQuery } from '../queries/get-stock-level.query';
import { StockLevelDTO } from '../dtos/stock-level.dto';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';

/**
 * Use case handler retrieving the maintained stock level for a product.
 * Avoids recalculating stock from the full movement ledger on every query.
 */
export class GetStockLevelHandler implements QueryHandler<
  GetStockLevelQuery,
  ApplicationResult<StockLevelDTO>
> {
  constructor(private readonly repository: InventoryItemRepository) {}

  public async execute(query: GetStockLevelQuery): Promise<ApplicationResult<StockLevelDTO>> {
    const { input } = query;

    if (!input.itemId?.trim()) {
      return ApplicationResult.fail('Item ID is required to retrieve stock level.');
    }

    const item = await this.repository.findById(input.itemId.trim());
    if (!item) {
      return ApplicationResult.fail(`Inventory item with id '${input.itemId}' not found.`);
    }

    if (input.tenantId && item.tenantId && item.tenantId !== input.tenantId) {
      return ApplicationResult.fail(`Inventory item with id '${input.itemId}' not found.`);
    }

    const dto: StockLevelDTO = {
      itemId: item.id.getValue(),
      sku: item.sku.value,
      name: item.name,
      quantityOnHand: item.quantityOnHand.value,
      minimumStock: item.minimumStock.value,
      unit: item.unit,
      status: item.status,
      isLowStock: item.isLowStock(),
      isOutOfStock: item.isOutOfStock(),
      category: item.category,
      version: item.version,
      updatedAt: item.updatedAt.toISOString(),
    };

    return ApplicationResult.ok(dto);
  }
}
