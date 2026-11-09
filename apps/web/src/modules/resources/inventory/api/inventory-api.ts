import { httpClient } from '../../../../shared/api/http-client';
import { StockMovementType, InventoryCategory, InventoryItemStatus } from '../types';
import type {
  CategoryMetadataVM,
  InventoryProductVM,
  PaginatedInventoryVM,
  StockLevelMetricsVM,
  PaginatedStockMovementsVM,
  StockMovementVM,
  InventoryValuationVM,
  MoneyVM,
  ListInventoryFilterParams,
  ListStockMovementsFilterParams,
  CreateProductInputVM,
  UpdateProductInputVM,
  ReceiveStockInputVM,
  SellStockInputVM,
  ConsumeStockInputVM,
  ScrapStockInputVM,
  AdjustStockInputVM,
  StockMutationResultVM,
} from '../types';

interface RawStockMovementResponse {
  id: string;
  inventoryItemId?: string;
  itemId?: string;
  movementType?: StockMovementType;
  type?: StockMovementType;
  quantityDelta?: number;
  quantity?: number;
  balanceAfter?: number;
  newBalance?: number;
  previousBalance?: number;
  unitCostAmount?: number;
  unitCostCurrency?: string;
  unitCost?: { amount: number; currency: string } | null;
  sellingPrice?: { amount: number; currency: string } | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  reason?: string;
  recordedByUserId?: string;
  actorId?: string;
  recordedAt?: string;
  occurredAt?: string;
}

interface RawLowStockItemResponse {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category: string;
  unit?: string;
  unitOfMeasure?: string;
  minimumStock?: number;
  reorderThreshold?: number;
  quantityOnHand?: number;
  currentStock?: number;
  purchaseCostAmount?: number;
  purchaseCostCurrency?: string;
  sellingPriceAmount?: number;
  sellingPriceCurrency?: string;
  unitCost?: MoneyVM | null;
  sellingPrice?: MoneyVM | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RawStockMutationResponse {
  success?: boolean;
  item?: RawLowStockItemResponse;
  movement?: RawStockMovementResponse;
  movementId?: string;
  balanceAfter?: number;
  occurredAt?: string;
}

function mapRawInventoryItem(item: RawLowStockItemResponse): InventoryProductVM {
  const currentStock =
    typeof item.quantityOnHand === 'number'
      ? item.quantityOnHand
      : typeof item.currentStock === 'number'
        ? item.currentStock
        : 0;
  const reorderThreshold =
    typeof item.minimumStock === 'number'
      ? item.minimumStock
      : typeof item.reorderThreshold === 'number'
        ? item.reorderThreshold
        : 0;
  const isLowStock = currentStock <= reorderThreshold;
  const isOutOfStock = currentStock === 0;

  // Resolve selling price cleanly without assuming 0 is valid configured price
  let sellingPrice: MoneyVM;
  if (
    item.sellingPrice &&
    typeof item.sellingPrice === 'object' &&
    typeof item.sellingPrice.amount === 'number' &&
    !Number.isNaN(item.sellingPrice.amount)
  ) {
    sellingPrice = {
      amount: item.sellingPrice.amount,
      currency: item.sellingPrice.currency || item.sellingPriceCurrency || 'USD',
    };
  } else if (
    typeof item.sellingPriceAmount === 'number' &&
    !Number.isNaN(item.sellingPriceAmount)
  ) {
    sellingPrice = {
      amount: item.sellingPriceAmount,
      currency: item.sellingPriceCurrency || 'USD',
    };
  } else {
    sellingPrice = {
      amount: 0,
      currency: item.sellingPriceCurrency || 'USD',
    };
  }

  let unitCost: MoneyVM;
  if (
    item.unitCost &&
    typeof item.unitCost === 'object' &&
    typeof item.unitCost.amount === 'number' &&
    !Number.isNaN(item.unitCost.amount)
  ) {
    unitCost = {
      amount: item.unitCost.amount,
      currency: item.unitCost.currency || item.purchaseCostCurrency || 'USD',
    };
  } else if (
    typeof item.purchaseCostAmount === 'number' &&
    !Number.isNaN(item.purchaseCostAmount)
  ) {
    unitCost = {
      amount: item.purchaseCostAmount,
      currency: item.purchaseCostCurrency || 'USD',
    };
  } else {
    unitCost = {
      amount: 0,
      currency: item.purchaseCostCurrency || 'USD',
    };
  }

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description ?? null,
    category: item.category as InventoryCategory,
    unitCost,
    sellingPrice,
    currentStock,
    reorderThreshold,
    unitOfMeasure: item.unitOfMeasure || item.unit || 'unit',
    status: (item.status as InventoryItemStatus) || InventoryItemStatus.ACTIVE,
    isLowStock,
    isOutOfStock,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function mapRawStockMovement(dto: RawStockMovementResponse, fallbackItemId = ''): StockMovementVM {
  const type = (dto.movementType || dto.type || StockMovementType.PURCHASE) as StockMovementType;
  const quantityDelta =
    typeof dto.quantityDelta === 'number' ? dto.quantityDelta : dto.quantity || 0;
  const newBalance = typeof dto.balanceAfter === 'number' ? dto.balanceAfter : dto.newBalance || 0;
  const previousBalance =
    typeof dto.previousBalance === 'number' ? dto.previousBalance : newBalance - quantityDelta;

  return {
    id: dto.id,
    itemId: dto.inventoryItemId || dto.itemId || fallbackItemId,
    type,
    quantity: Math.abs(quantityDelta),
    previousBalance,
    newBalance,
    unitCost: dto.unitCostAmount
      ? { amount: dto.unitCostAmount, currency: dto.unitCostCurrency || 'USD' }
      : dto.unitCost || null,
    sellingPrice: dto.sellingPrice || null,
    referenceNumber: dto.referenceId || dto.referenceNumber || null,
    reason: dto.reason || '',
    actorId: dto.recordedByUserId || dto.actorId || 'system',
    occurredAt: dto.recordedAt || dto.occurredAt || new Date().toISOString(),
  };
}

function mapStockMutationResult(
  response: RawStockMutationResponse,
  fallbackItemId = '',
): StockMutationResultVM {
  const movement = response.movement;
  const item = response.item;
  const balanceAfter =
    typeof response.balanceAfter === 'number'
      ? response.balanceAfter
      : typeof movement?.balanceAfter === 'number'
        ? movement.balanceAfter
        : typeof item?.quantityOnHand === 'number'
          ? item.quantityOnHand
          : 0;

  const movementId = response.movementId || movement?.id || '';
  const occurredAt =
    response.occurredAt || movement?.recordedAt || movement?.occurredAt || new Date().toISOString();

  return {
    success: response.success ?? true,
    movementId,
    balanceAfter,
    occurredAt,
    item: item ? mapRawInventoryItem(item) : undefined,
    movement: movement ? mapRawStockMovement(movement, fallbackItemId) : undefined,
  };
}

export const inventoryApi = {
  /**
   * Retrieves static category taxonomy metadata
   */
  async getCategories(): Promise<CategoryMetadataVM[]> {
    return httpClient.get<CategoryMetadataVM[]>('/api/v1/resources/inventory/categories');
  },

  /**
   * Lists inventory catalog items with multi-criteria filtering and server pagination
   */
  async listItems(params?: ListInventoryFilterParams): Promise<PaginatedInventoryVM> {
    const response = await httpClient.get<{
      items: RawLowStockItemResponse[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage?: boolean;
      hasPreviousPage?: boolean;
    }>('/api/v1/resources/inventory', {
      params: {
        search: params?.search,
        category: params?.category,
        status: params?.status,
        stockStatus: params?.stockStatus,
        includeArchived: params?.includeArchived,
        page: params?.page,
        limit: params?.limit,
        sortBy: params?.sortBy,
        sortOrder: params?.sortOrder,
      },
    });

    const items = (response.items || []).map(mapRawInventoryItem);
    return {
      items,
      total: response.total ?? items.length,
      page: response.page ?? 1,
      limit: response.limit ?? 20,
      totalPages: response.totalPages ?? (items.length > 0 ? 1 : 0),
    };
  },

  /**
   * Lists all products where stock on hand is below or at reorder threshold
   * Enforces invariant: currentStock <= minimumStock (zero stock is low stock).
   */
  async getLowStock(): Promise<InventoryProductVM[]> {
    const response = await httpClient.get<
      RawLowStockItemResponse[] | { items: RawLowStockItemResponse[] }
    >('/api/v1/resources/inventory/low-stock');

    const rawList = Array.isArray(response) ? response : response?.items || [];
    return rawList.map(mapRawInventoryItem);
  },

  /**
   * Computes working capital valuation of consumable inventory
   */
  async getValuation(): Promise<InventoryValuationVM> {
    return httpClient.get<InventoryValuationVM>('/api/v1/resources/inventory/valuation');
  },

  /**
   * Retrieves single inventory product by ID
   */
  async getItemById(id: string): Promise<InventoryProductVM> {
    const raw = await httpClient.get<RawLowStockItemResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}`,
    );
    return mapRawInventoryItem(raw);
  },

  /**
   * Retrieves physical stock level and low stock indicators
   */
  async getStockLevel(id: string): Promise<StockLevelMetricsVM> {
    return httpClient.get<StockLevelMetricsVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/stock-level`,
    );
  },

  /**
   * Retrieves chronological stock movement ledger
   */
  async getMovements(
    id: string,
    params?: ListStockMovementsFilterParams,
  ): Promise<PaginatedStockMovementsVM> {
    const response = await httpClient.get<{
      items: RawStockMovementResponse[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/v1/resources/inventory/${encodeURIComponent(id)}/movements`, {
      params: {
        page: params?.page,
        limit: params?.limit,
        movementType: params?.movementType,
      },
    });

    return {
      items: (response.items || []).map((dto: RawStockMovementResponse): StockMovementVM => {
        const type = (dto.movementType ||
          dto.type ||
          StockMovementType.PURCHASE) as StockMovementType;
        const quantityDelta =
          typeof dto.quantityDelta === 'number' ? dto.quantityDelta : dto.quantity || 0;
        const newBalance =
          typeof dto.balanceAfter === 'number' ? dto.balanceAfter : dto.newBalance || 0;
        const previousBalance =
          typeof dto.previousBalance === 'number'
            ? dto.previousBalance
            : newBalance - quantityDelta;

        return {
          id: dto.id,
          itemId: dto.inventoryItemId || dto.itemId || id,
          type,
          quantity: Math.abs(quantityDelta),
          previousBalance,
          newBalance,
          unitCost: dto.unitCostAmount
            ? { amount: dto.unitCostAmount, currency: dto.unitCostCurrency || 'USD' }
            : dto.unitCost || null,
          sellingPrice: dto.sellingPrice || null,
          referenceNumber: dto.referenceId || dto.referenceNumber || null,
          reason: dto.reason || '',
          actorId: dto.recordedByUserId || dto.actorId || 'system',
          occurredAt: dto.recordedAt || dto.occurredAt || new Date().toISOString(),
        };
      }),
      total: response.total ?? 0,
      page: response.page ?? 1,
      limit: response.limit ?? 20,
      totalPages: response.totalPages ?? 1,
    };
  },

  /**
   * Registers a new consumable product in the catalog
   */
  async createItem(payload: CreateProductInputVM): Promise<InventoryProductVM> {
    return httpClient.post<InventoryProductVM>('/api/v1/resources/inventory', payload);
  },

  /**
   * Updates non-stock product metadata and pricing
   */
  async updateItem(id: string, payload: UpdateProductInputVM): Promise<InventoryProductVM> {
    return httpClient.patch<InventoryProductVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}`,
      payload,
    );
  },

  /**
   * Archives a product
   */
  async archiveItem(id: string): Promise<InventoryProductVM> {
    return httpClient.post<InventoryProductVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/archive`,
    );
  },

  /**
   * Reactivates an archived product
   */
  async activateItem(id: string): Promise<InventoryProductVM> {
    return httpClient.post<InventoryProductVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/activate`,
    );
  },

  /**
   * Deactivates an active product (temporary suspension)
   */
  async deactivateItem(id: string): Promise<InventoryProductVM> {
    return httpClient.post<InventoryProductVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/deactivate`,
    );
  },

  /**
   * Records receipt of purchased stock
   */
  async receiveStock(id: string, payload: ReceiveStockInputVM): Promise<StockMutationResultVM> {
    const raw = await httpClient.post<RawStockMutationResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/receive`,
      payload,
    );
    return mapStockMutationResult(raw, id);
  },

  /**
   * Records retail sale of stock
   */
  async sellStock(id: string, payload: SellStockInputVM): Promise<StockMutationResultVM> {
    const raw = await httpClient.post<RawStockMutationResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/sell`,
      payload,
    );
    return mapStockMutationResult(raw, id);
  },

  /**
   * Records consumption of stock in clinical or gym treatment
   */
  async consumeStock(id: string, payload: ConsumeStockInputVM): Promise<StockMutationResultVM> {
    const raw = await httpClient.post<RawStockMutationResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/consume`,
      payload,
    );
    return mapStockMutationResult(raw, id);
  },

  /**
   * Records disposal of damaged or expired stock
   */
  async scrapStock(id: string, payload: ScrapStockInputVM): Promise<StockMutationResultVM> {
    const raw = await httpClient.post<RawStockMutationResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/scrap`,
      payload,
    );
    return mapStockMutationResult(raw, id);
  },

  /**
   * Records physical inventory count audit adjustment
   */
  async adjustStock(id: string, payload: AdjustStockInputVM): Promise<StockMutationResultVM> {
    const raw = await httpClient.post<RawStockMutationResponse>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/adjust`,
      payload,
    );
    return mapStockMutationResult(raw, id);
  },
};
