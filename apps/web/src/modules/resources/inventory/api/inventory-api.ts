import { httpClient } from '../../../../shared/api/http-client';
import type {
  CategoryMetadataVM,
  InventoryProductVM,
  PaginatedInventoryVM,
  StockLevelMetricsVM,
  PaginatedStockMovementsVM,
  InventoryValuationVM,
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
    return httpClient.get<PaginatedInventoryVM>('/api/v1/resources/inventory', {
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
  },

  /**
   * Lists all products where stock on hand is below or at reorder threshold
   */
  async getLowStock(): Promise<InventoryProductVM[]> {
    return httpClient.get<InventoryProductVM[]>('/api/v1/resources/inventory/low-stock');
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
    return httpClient.get<InventoryProductVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}`,
    );
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
    return httpClient.get<PaginatedStockMovementsVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/movements`,
      {
        params: {
          page: params?.page,
          limit: params?.limit,
        },
      },
    );
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
    return httpClient.post<StockMutationResultVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/receive`,
      payload,
    );
  },

  /**
   * Records retail sale of stock
   */
  async sellStock(id: string, payload: SellStockInputVM): Promise<StockMutationResultVM> {
    return httpClient.post<StockMutationResultVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/sell`,
      payload,
    );
  },

  /**
   * Records consumption of stock in clinical or gym treatment
   */
  async consumeStock(id: string, payload: ConsumeStockInputVM): Promise<StockMutationResultVM> {
    return httpClient.post<StockMutationResultVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/consume`,
      payload,
    );
  },

  /**
   * Records disposal of damaged or expired stock
   */
  async scrapStock(id: string, payload: ScrapStockInputVM): Promise<StockMutationResultVM> {
    return httpClient.post<StockMutationResultVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/scrap`,
      payload,
    );
  },

  /**
   * Records physical inventory count audit adjustment
   */
  async adjustStock(id: string, payload: AdjustStockInputVM): Promise<StockMutationResultVM> {
    return httpClient.post<StockMutationResultVM>(
      `/api/v1/resources/inventory/${encodeURIComponent(id)}/adjust`,
      payload,
    );
  },
};
