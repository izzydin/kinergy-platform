import { InventoryItem } from '../inventory-item.aggregate';
import { InventoryCategory } from '../enums/inventory-category.enum';
import { InventoryItemStatus } from '../enums/inventory-item-status.enum';

export interface FindInventoryItemsFilter {
  tenantId?: string;
  category?: InventoryCategory;
  status?: InventoryItemStatus;
  search?: string;
  lowStockOnly?: boolean;
  limit?: number;
  offset?: number;
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
