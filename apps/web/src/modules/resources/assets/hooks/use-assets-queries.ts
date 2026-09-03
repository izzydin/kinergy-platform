import { useQuery } from '@tanstack/react-query';
import { assetsApi, assetsQueryKeys } from '../api';
import type {
  ListFixedAssetsFilterParams,
  GetAssetHistoryFilterParams,
  GetMaintenanceHistoryFilterParams,
} from '../types';

/**
 * Retrieves static asset category taxonomy metadata for form dropdowns and inspection rules
 */
export function useAssetCategories() {
  return useQuery({
    queryKey: assetsQueryKeys.categories(),
    queryFn: () => assetsApi.getCategories(),
    staleTime: 60 * 60 * 1000, // 1 hour (static code-defined taxonomy)
  });
}

/**
 * Retrieves paginated fixed asset catalog items with multi-criteria filters
 */
export function useAssetsList(params?: ListFixedAssetsFilterParams) {
  return useQuery({
    queryKey: assetsQueryKeys.list(params),
    queryFn: () => assetsApi.listAssets(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Retrieves single asset details by ID
 */
export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: assetsQueryKeys.detail(id ?? ''),
    queryFn: () => assetsApi.getAsset(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

/**
 * Resolves physical hardware barcode or RFID tag to asset record
 */
export function useAssetByTag(tag: string | undefined) {
  return useQuery({
    queryKey: assetsQueryKeys.tag(tag ?? ''),
    queryFn: () => assetsApi.getAssetByTag(tag!),
    enabled: Boolean(tag?.trim()),
    staleTime: 30 * 1000,
  });
}

/**
 * Retrieves chronological immutable lifecycle audit event history for an asset
 */
export function useAssetHistory(id: string | undefined, params?: GetAssetHistoryFilterParams) {
  return useQuery({
    queryKey: assetsQueryKeys.history(id ?? '', params),
    queryFn: () => assetsApi.getAssetHistory(id!, params),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

/**
 * Retrieves servicing work orders and maintenance history for an asset
 */
export function useAssetMaintenanceHistory(
  id: string | undefined,
  params?: GetMaintenanceHistoryFilterParams,
) {
  return useQuery({
    queryKey: assetsQueryKeys.maintenance(id ?? '', params),
    queryFn: () => assetsApi.getMaintenanceHistory(id!, params),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

/**
 * Retrieves confidential purchase acquisition value and current estimated fair value
 * (Dual-Permission Protected: requires assets.read + billing.read)
 */
export function useAssetValuation(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: assetsQueryKeys.valuation(id ?? ''),
    queryFn: () => assetsApi.getAssetValuation(id!),
    enabled: Boolean(id) && (options?.enabled ?? true),
    staleTime: 60 * 1000,
  });
}

/**
 * Retrieves estate capital equipment carrying and purchase valuation summary
 * (Dual-Permission Protected: requires assets.read + billing.read)
 */
export function useAssetValuationSummary(
  params?: { category?: string; includeDecommissioned?: boolean },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: assetsQueryKeys.valuationSummary(params),
    queryFn: () => assetsApi.getValuationSummary(params),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}
