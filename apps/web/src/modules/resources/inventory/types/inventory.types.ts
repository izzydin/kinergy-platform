import {
  InventoryCategory,
  InventoryItemStatus,
  StockMovementType,
  UnitOfMeasure,
} from '@kinergy-platform/core';

/**
 * Re-export authoritative core enums for clean module-level consumption
 */
export { InventoryCategory, InventoryItemStatus, StockMovementType, UnitOfMeasure };

/**
 * Money Amount Presentation View Model
 */
export interface MoneyVM {
  amount: number;
  currency: string;
}

/**
 * Consumable Inventory Product View Model (REST Response Representation)
 */
export interface InventoryProductVM {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unitCost: MoneyVM;
  sellingPrice: MoneyVM;
  currentStock: number;
  reorderThreshold: number;
  unitOfMeasure: string;
  status: InventoryItemStatus;
  isLowStock: boolean;
  isOutOfStock: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Category Metadata Descriptor View Model
 */
export interface CategoryMetadataVM {
  code: InventoryCategory;
  displayName: string;
  description: string;
}

/**
 * Live Stock Level Metrics View Model
 */
export interface StockLevelMetricsVM {
  itemId: string;
  currentStock: number;
  unit: string;
  reorderThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

/**
 * Stock Movement Ledger Audit View Model
 */
export interface StockMovementVM {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  unitCost: MoneyVM | null;
  sellingPrice: MoneyVM | null;
  referenceNumber: string | null;
  reason: string;
  actorId: string;
  occurredAt: string;
}

/**
 * Stock Transaction Mutation Result View Model
 */
export interface StockMutationResultVM {
  success: boolean;
  movementId: string;
  balanceAfter: number;
  occurredAt: string;
}

/**
 * Paginated Inventory Catalog Response View Model
 */
export interface PaginatedInventoryVM {
  items: InventoryProductVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginated Stock Movements Response View Model
 */
export interface PaginatedStockMovementsVM {
  items: StockMovementVM[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Inventory Working Capital Valuation View Model
 */
export interface InventoryValuationVM {
  totalDistinctItems: number;
  totalQuantityUnits: number;
  totalValueAmount: number;
  currency: string;
  calculatedAt: string;
}

/**
 * Filter Parameters for Inventory Catalog List Query
 */
export interface ListInventoryFilterParams {
  search?: string;
  category?: InventoryCategory;
  status?: InventoryItemStatus;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  includeArchived?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'sku' | 'category' | 'currentStock' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter Parameters for Stock Movements Ledger Query
 */
export interface ListStockMovementsFilterParams {
  page?: number;
  limit?: number;
}

/**
 * Input Payload for Product Creation
 */
export interface CreateProductInputVM {
  sku: string;
  name: string;
  description?: string;
  category: InventoryCategory;
  unitCost: number;
  sellingPrice: number;
  quantityOnHand?: number;
  reorderThreshold?: number;
  unitOfMeasure?: string;
}

/**
 * Input Payload for Product Metadata Update
 */
export interface UpdateProductInputVM {
  name?: string;
  description?: string;
  category?: InventoryCategory;
  unitCost?: number;
  sellingPrice?: number;
  reorderThreshold?: number;
  unitOfMeasure?: string;
}

/**
 * Input Payload for Stock Receipt (Purchase)
 */
export interface ReceiveStockInputVM {
  quantity: number;
  unitCost?: number;
  referenceNumber: string;
  notes?: string;
}

/**
 * Input Payload for Retail Point-of-Sale
 */
export interface SellStockInputVM {
  quantity: number;
  unitPrice?: number;
  referenceId?: string;
  notes?: string;
}

/**
 * Input Payload for Clinical Treatment Consumption
 */
export interface ConsumeStockInputVM {
  quantity: number;
  treatmentSessionId?: string;
  notes?: string;
}

/**
 * Input Payload for Scrapping Damaged / Expired Stock
 */
export interface ScrapStockInputVM {
  quantity: number;
  reason: string;
}

/**
 * Input Payload for Audit Physical Stock Count Adjustment
 */
export interface AdjustStockInputVM {
  deltaQuantity: number;
  reason: string;
}
