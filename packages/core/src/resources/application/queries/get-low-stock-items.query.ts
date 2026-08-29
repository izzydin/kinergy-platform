import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { InventorySortField } from '../../domain/inventory/repositories/inventory-item.repository.interface';

export interface GetLowStockItemsInput {
  tenantId?: string;
  category?: InventoryCategory | InventoryCategory[];
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: InventorySortField;
  sortOrder?: 'asc' | 'desc';
}

export class GetLowStockItemsQuery {
  constructor(public readonly input: GetLowStockItemsInput = {}) {
    Object.freeze(this);
  }
}
