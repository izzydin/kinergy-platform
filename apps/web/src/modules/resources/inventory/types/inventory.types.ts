/**
 * Authoritative client-safe Consumable Inventory Enums
 * Decoupled from @kinergy-platform/core to prevent server domain leakage into client bundle
 */
export enum InventoryCategory {
  HEALTHY_MEALS = 'HEALTHY_MEALS',
  HEALTHY_DRINKS = 'HEALTHY_DRINKS',
  CLEANING_SUPPLIES = 'CLEANING_SUPPLIES',
  OFFICE_SUPPLIES = 'OFFICE_SUPPLIES',
  SUPPLEMENTS = 'SUPPLEMENTS',
  CLINICAL_SUPPLIES = 'CLINICAL_SUPPLIES',
  THERAPY_CONSUMABLES = 'THERAPY_CONSUMABLES',
  RETAIL_PRODUCTS = 'RETAIL_PRODUCTS',
}

export enum InventoryItemStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum UnitOfMeasure {
  UNITS = 'UNITS',
  BOXES = 'BOXES',
  BOTTLES = 'BOTTLES',
  ROLLS = 'ROLLS',
  MILLILITERS = 'MILLILITERS',
  GRAMS = 'GRAMS',
}

export enum StockMovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  CONSUMPTION = 'CONSUMPTION',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
  CORRECTION = 'CORRECTION',
  SCRAP = 'SCRAP',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface InventoryCategoryDescriptor {
  readonly code: InventoryCategory;
  readonly displayName: string;
  readonly description: string;
  readonly isPerishable: boolean;
  readonly isRetailEligible: boolean;
}

export const INVENTORY_CATEGORY_REGISTRY: Record<InventoryCategory, InventoryCategoryDescriptor> = {
  [InventoryCategory.HEALTHY_MEALS]: {
    code: InventoryCategory.HEALTHY_MEALS,
    displayName: 'Healthy Meals',
    description: 'Fresh and prepared nutritional meal portions for clients and athletes.',
    isPerishable: true,
    isRetailEligible: true,
  },
  [InventoryCategory.HEALTHY_DRINKS]: {
    code: InventoryCategory.HEALTHY_DRINKS,
    displayName: 'Healthy Drinks',
    description: 'Electrolyte beverages, smoothies, juices, and functional wellness drinks.',
    isPerishable: true,
    isRetailEligible: true,
  },
  [InventoryCategory.CLEANING_SUPPLIES]: {
    code: InventoryCategory.CLEANING_SUPPLIES,
    displayName: 'Cleaning Supplies',
    description: 'Disinfectants, sanitizing wipes, detergents, and facility hygiene materials.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.OFFICE_SUPPLIES]: {
    code: InventoryCategory.OFFICE_SUPPLIES,
    displayName: 'Office Supplies',
    description: 'Administrative consumables, paper goods, printing items, and stationery.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.SUPPLEMENTS]: {
    code: InventoryCategory.SUPPLEMENTS,
    displayName: 'Supplements',
    description: 'Nutritional powders, vitamins, protein bars, and performance supplements.',
    isPerishable: false,
    isRetailEligible: true,
  },
  [InventoryCategory.CLINICAL_SUPPLIES]: {
    code: InventoryCategory.CLINICAL_SUPPLIES,
    displayName: 'Clinical Supplies',
    description: 'Acupuncture needles, ultrasound gel, massage lotions, and exam disposables.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.THERAPY_CONSUMABLES]: {
    code: InventoryCategory.THERAPY_CONSUMABLES,
    displayName: 'Therapy Consumables',
    description:
      'Elastic therapeutic tape, resistance bands, exercise putty, and rehab disposables.',
    isPerishable: false,
    isRetailEligible: true,
  },
  [InventoryCategory.RETAIL_PRODUCTS]: {
    code: InventoryCategory.RETAIL_PRODUCTS,
    displayName: 'Retail Products',
    description: 'Commercial merchandise, foam rollers, branded apparel, and gear for sale.',
    isPerishable: false,
    isRetailEligible: true,
  },
};

export interface UnitOfMeasureDescriptor {
  readonly code: UnitOfMeasure;
  readonly displayName: string;
  readonly description: string;
  readonly isContinuous: boolean;
  readonly standardScale: number;
}

export const UNIT_OF_MEASURE_REGISTRY: Record<UnitOfMeasure, UnitOfMeasureDescriptor> = {
  [UnitOfMeasure.UNITS]: {
    code: UnitOfMeasure.UNITS,
    displayName: 'Units (each)',
    description:
      'Discrete individual items or individual portions (e.g., meal prep containers, resistance bands).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.BOXES]: {
    code: UnitOfMeasure.BOXES,
    displayName: 'Boxes',
    description:
      'Packaged multi-item containers or carton packs (e.g., box of acupuncture needles, box of nitrile gloves).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.BOTTLES]: {
    code: UnitOfMeasure.BOTTLES,
    displayName: 'Bottles',
    description:
      'Individual packaged drink, spray, or massage lotion bottles (e.g., electrolyte drink, disinfectant spray).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.ROLLS]: {
    code: UnitOfMeasure.ROLLS,
    displayName: 'Rolls',
    description:
      'Continuous rolled supplies (e.g., kinesiology tape rolls, examination table paper rolls).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.MILLILITERS]: {
    code: UnitOfMeasure.MILLILITERS,
    displayName: 'Milliliters (ml)',
    description:
      'Volumetric liquid or gel measure for clinical and cleaning applications (e.g., ultrasound gel, liquid disinfectant).',
    isContinuous: true,
    standardScale: 2,
  },
  [UnitOfMeasure.GRAMS]: {
    code: UnitOfMeasure.GRAMS,
    displayName: 'Grams (g)',
    description:
      'Mass or weight measure for powders and nutritional supplements (e.g., protein powder, electrolyte blend).',
    isContinuous: true,
    standardScale: 2,
  },
};

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
  item?: InventoryProductVM;
  movement?: StockMovementVM;
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
  movementType?: StockMovementType;
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
