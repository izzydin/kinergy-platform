import { InventoryItem } from '../inventory-item.aggregate';
import { InventoryCategory } from '../enums/inventory-category.enum';
import { InventoryItemStatus } from '../enums/inventory-item-status.enum';

export type InventorySortField =
  'name' | 'sku' | 'category' | 'quantityOnHand' | 'sellingPrice' | 'createdAt' | 'updatedAt';

export interface FindInventoryItemsFilter {
  tenantId?: string;
  category?: InventoryCategory | InventoryCategory[];
  status?: InventoryItemStatus | InventoryItemStatus[];
  includeArchived?: boolean;
  search?: string;
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  lowStockOnly?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: InventorySortField;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Domain Repository contract for InventoryItem Aggregate Root.
 */
export interface InventoryItemRepository {
  save(item: InventoryItem): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null>;
  findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]>;
  count(filter?: FindInventoryItemsFilter): Promise<number>;
  delete(id: string): Promise<void>;
}
