import { InventoryItem } from '../inventory-item.aggregate';
import { StockMovement } from '../entities/stock-movement.entity';
import { InventoryCategory } from '../enums/inventory-category.enum';
import { InventoryItemStatus } from '../enums/inventory-item-status.enum';
import { StockMovementType } from '../enums/stock-movement-type.enum';

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

export type StockMovementSortField = 'recordedAt' | 'quantityDelta' | 'balanceAfter';

export interface FindStockMovementsFilter {
  itemId?: string;
  tenantId?: string;
  movementType?: StockMovementType | StockMovementType[];
  recordedByUserId?: string;
  referenceId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: StockMovementSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface InventoryOverviewMetrics {
  totalItems: number;
  totalQuantity: number;
  totalValuationCents: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface InventoryOverviewFilter {
  tenantId?: string;
  category?: InventoryCategory | InventoryCategory[];
  includeArchived?: boolean;
}

/**
 * Domain Repository contract for InventoryItem Aggregate Root and Stock Movements.
 */
export interface InventoryItemRepository {
  save(item: InventoryItem): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null>;
  findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]>;
  count(filter?: FindInventoryItemsFilter): Promise<number>;
  findMovements?(filter?: FindStockMovementsFilter): Promise<StockMovement[]>;
  countMovements?(filter?: FindStockMovementsFilter): Promise<number>;
  getOverviewMetrics?(filter?: InventoryOverviewFilter): Promise<InventoryOverviewMetrics>;
  delete(id: string): Promise<void>;
}
