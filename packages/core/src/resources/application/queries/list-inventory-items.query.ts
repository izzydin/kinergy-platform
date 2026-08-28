import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';

export interface ListInventoryItemsFilter {
  search?: string;
  category?: InventoryCategory | InventoryCategory[];
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  status?: InventoryItemStatus | InventoryItemStatus[];
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sortBy?:
    'name' | 'sku' | 'category' | 'quantityOnHand' | 'sellingPrice' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ListInventoryItemsInput {
  tenantId?: string;
  filter?: ListInventoryItemsFilter;
}

export class ListInventoryItemsQuery {
  constructor(public readonly input: ListInventoryItemsInput) {
    Object.freeze(this);
  }
}
