import { httpClient } from '../../../../shared/api/http-client';
import type {
  AssetCategoryMetadataVM,
  FixedAssetVM,
  FixedAssetValuationVM,
  FixedAssetValuationSummaryVM,
  PaginatedAssetsVM,
  PaginatedAssetHistoryVM,
  PaginatedMaintenanceVM,
  AssetMaintenanceRecordVM,
  ListFixedAssetsFilterParams,
  GetAssetHistoryFilterParams,
  GetMaintenanceHistoryFilterParams,
  CreateFixedAssetInputVM,
  UpdateFixedAssetDetailsInputVM,
  TransferFixedAssetLocationInputVM,
  ChangeFixedAssetStatusInputVM,
  UpdateFixedAssetConditionInputVM,
  RecordAssetMaintenanceInputVM,
  UpdateFixedAssetValuationInputVM,
} from '../types';

/**
 * Authoritative HTTP API Client for Fixed Assets
 * Consumes NestJS FixedAssetsController (/api/v1/resources/assets)
 */
export const assetsApi = {
  /**
   * Retrieves static equipment category taxonomy metadata
   */
  async getCategories(): Promise<AssetCategoryMetadataVM[]> {
    return httpClient.get<AssetCategoryMetadataVM[]>('/api/v1/resources/assets/categories');
  },

  /**
   * Resolves physical hardware barcode or RFID tag to asset record
   */
  async getAssetByTag(tag: string): Promise<FixedAssetVM> {
    return httpClient.get<FixedAssetVM>(
      `/api/v1/resources/assets/tag/${encodeURIComponent(tag.trim())}`,
    );
  },

  /**
   * Queries paginated asset catalog with multi-facet filters and sorting
   */
  async listAssets(params?: ListFixedAssetsFilterParams): Promise<PaginatedAssetsVM> {
    const cleanParams: Record<string, string | number | boolean | undefined> = {};

    if (params?.search?.trim()) cleanParams.search = params.search.trim();
    if (params?.category) cleanParams.category = params.category;
    if (params?.status) cleanParams.status = params.status;
    if (params?.condition) cleanParams.condition = params.condition;
    if (params?.facilityId?.trim()) cleanParams.facilityId = params.facilityId.trim();
    if (params?.roomId?.trim()) cleanParams.roomId = params.roomId.trim();
    if (params?.includeDecommissioned !== undefined) {
      cleanParams.includeDecommissioned = params.includeDecommissioned;
    }
    if (params?.page) cleanParams.page = params.page;
    if (params?.limit) cleanParams.limit = params.limit;
    if (params?.sortBy) cleanParams.sortBy = params.sortBy;
    if (params?.sortOrder) cleanParams.sortOrder = params.sortOrder;

    return httpClient.get<PaginatedAssetsVM>('/api/v1/resources/assets', {
      params: cleanParams,
    });
  },

  /**
   * Retrieves single asset details by ID
   */
  async getAsset(id: string): Promise<FixedAssetVM> {
    return httpClient.get<FixedAssetVM>(`/api/v1/resources/assets/${encodeURIComponent(id)}`);
  },

  /**
   * Retrieves chronological immutable lifecycle audit event history
   */
  async getAssetHistory(
    id: string,
    params?: GetAssetHistoryFilterParams,
  ): Promise<PaginatedAssetHistoryVM> {
    const cleanParams: Record<string, string | number | undefined> = {};
    if (params?.eventType) cleanParams.eventType = params.eventType;
    if (params?.recordedByUserId?.trim()) cleanParams.recordedByUserId = params.recordedByUserId;
    if (params?.fromDate) cleanParams.fromDate = params.fromDate;
    if (params?.toDate) cleanParams.toDate = params.toDate;
    if (params?.page) cleanParams.page = params.page;
    if (params?.limit) cleanParams.limit = params.limit;
    if (params?.sortOrder) cleanParams.sortOrder = params.sortOrder;

    return httpClient.get<PaginatedAssetHistoryVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/history`,
      { params: cleanParams },
    );
  },

  /**
   * Retrieves servicing work orders and maintenance history
   */
  async getMaintenanceHistory(
    id: string,
    params?: GetMaintenanceHistoryFilterParams,
  ): Promise<PaginatedMaintenanceVM> {
    const cleanParams: Record<string, string | number | undefined> = {};
    if (params?.performedBy?.trim()) cleanParams.performedBy = params.performedBy;
    if (params?.fromDate) cleanParams.fromDate = params.fromDate;
    if (params?.toDate) cleanParams.toDate = params.toDate;
    if (params?.page) cleanParams.page = params.page;
    if (params?.limit) cleanParams.limit = params.limit;
    if (params?.sortOrder) cleanParams.sortOrder = params.sortOrder;

    return httpClient.get<PaginatedMaintenanceVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/maintenance`,
      { params: cleanParams },
    );
  },

  /**
   * Retrieves estate capital equipment carrying and CAPEX purchase valuation summary
   * (Dual-Permission Protected: assets.read + billing.read)
   */
  async getValuationSummary(params?: {
    category?: string;
    includeDecommissioned?: boolean;
  }): Promise<FixedAssetValuationSummaryVM> {
    return httpClient.get<FixedAssetValuationSummaryVM>(
      '/api/v1/resources/assets/valuation/summary',
      { params },
    );
  },

  /**
   * Retrieves confidential purchase acquisition value and current estimated fair value
   * (Dual-Permission Protected: assets.read + billing.read)
   */
  async getAssetValuation(id: string): Promise<FixedAssetValuationVM> {
    return httpClient.get<FixedAssetValuationVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/valuation`,
    );
  },

  /**
   * Commissions and registers a new fixed asset
   */
  async createAsset(payload: CreateFixedAssetInputVM): Promise<FixedAssetVM> {
    return httpClient.post<FixedAssetVM>('/api/v1/resources/assets', payload);
  },

  /**
   * Updates descriptive metadata (name, description, notes, reason)
   * (Strictly prohibits status, condition, location, or value changes per ADR-0099)
   */
  async updateDetails(id: string, payload: UpdateFixedAssetDetailsInputVM): Promise<FixedAssetVM> {
    return httpClient.patch<FixedAssetVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}`,
      payload,
    );
  },

  /**
   * Relocates physical equipment between facilities, rooms, or zones
   */
  async transferLocation(
    id: string,
    payload: TransferFixedAssetLocationInputVM,
  ): Promise<FixedAssetVM> {
    return httpClient.post<FixedAssetVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/transfer`,
      payload,
    );
  },

  /**
   * Transitions lifecycle state via domain state machine
   */
  async changeStatus(id: string, payload: ChangeFixedAssetStatusInputVM): Promise<FixedAssetVM> {
    return httpClient.post<FixedAssetVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/status`,
      payload,
    );
  },

  /**
   * Re-rates physical operational condition (Rank 1 to 5)
   */
  async updateCondition(
    id: string,
    payload: UpdateFixedAssetConditionInputVM,
  ): Promise<FixedAssetVM> {
    return httpClient.post<FixedAssetVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/condition`,
      payload,
    );
  },

  /**
   * Records servicing or maintenance work order and conditionally auto-recovers to ACTIVE
   */
  async recordMaintenance(
    id: string,
    payload: RecordAssetMaintenanceInputVM,
  ): Promise<AssetMaintenanceRecordVM> {
    return httpClient.post<AssetMaintenanceRecordVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/maintenance`,
      payload,
    );
  },

  /**
   * Updates current estimated book/market fair value
   * (Dual-Permission Protected: assets.write + billing.read)
   */
  async updateValuation(
    id: string,
    payload: UpdateFixedAssetValuationInputVM,
  ): Promise<FixedAssetVM> {
    return httpClient.post<FixedAssetVM>(
      `/api/v1/resources/assets/${encodeURIComponent(id)}/valuation`,
      payload,
    );
  },
};
