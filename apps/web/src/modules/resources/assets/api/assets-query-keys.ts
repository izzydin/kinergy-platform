import type {
  ListFixedAssetsFilterParams,
  GetAssetHistoryFilterParams,
  GetMaintenanceHistoryFilterParams,
} from '../types';

/**
 * Authoritative TanStack Query Key Factory for Fixed Assets
 */
export const assetsQueryKeys = {
  all: ['resources', 'assets'] as const,

  // Categories Taxonomy Metadata
  categories: () => [...assetsQueryKeys.all, 'categories'] as const,

  // Hardware Scanner Barcode / RFID Tag Lookup
  tag: (tag: string) => [...assetsQueryKeys.all, 'tag', tag] as const,

  // Estate Valuation Summary (Dual Permission: assets.read + billing.read)
  valuationSummary: (params?: { category?: string; includeDecommissioned?: boolean }) =>
    ['resources', 'valuation', 'assets', 'summary', params ?? {}] as const,

  // Catalog Lists
  lists: () => [...assetsQueryKeys.all, 'list'] as const,
  list: (params?: ListFixedAssetsFilterParams) =>
    [...assetsQueryKeys.lists(), params ?? {}] as const,

  // Single Asset Details Hierarchy
  details: () => [...assetsQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetsQueryKeys.details(), id] as const,

  // Financial Valuation Details (Dual Permission: assets.read + billing.read)
  valuation: (id: string) => [...assetsQueryKeys.detail(id), 'valuation'] as const,

  // Lifecycle Event Audit History Ledger
  historyLists: (id: string) => [...assetsQueryKeys.detail(id), 'history'] as const,
  history: (id: string, params?: GetAssetHistoryFilterParams) =>
    [...assetsQueryKeys.historyLists(id), params ?? {}] as const,

  // Servicing & Maintenance Work Order Ledger
  maintenanceLists: (id: string) => [...assetsQueryKeys.detail(id), 'maintenance'] as const,
  maintenance: (id: string, params?: GetMaintenanceHistoryFilterParams) =>
    [...assetsQueryKeys.maintenanceLists(id), params ?? {}] as const,
};
