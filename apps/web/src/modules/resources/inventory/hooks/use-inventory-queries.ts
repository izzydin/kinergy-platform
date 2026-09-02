import { useQuery } from '@tanstack/react-query';
import { inventoryApi, inventoryQueryKeys } from '../api';
import type { ListInventoryFilterParams, ListStockMovementsFilterParams } from '../types';

/**
 * Retrieves static category taxonomy metadata for dropdowns
 */
export function useInventoryCategories() {
  return useQuery({
    queryKey: inventoryQueryKeys.categories(),
    queryFn: () => inventoryApi.getCategories(),
    staleTime: 60 * 60 * 1000, // 1 hour (static taxonomy)
  });
}

/**
 * Retrieves paginated consumable inventory catalog items with multi-criteria filters
 */
export function useInventoryList(params?: ListInventoryFilterParams) {
  return useQuery({
    queryKey: inventoryQueryKeys.list(params),
    queryFn: () => inventoryApi.listItems(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Retrieves active products currently at or below reorder threshold
 */
export function useLowStockItems() {
  return useQuery({
    queryKey: inventoryQueryKeys.lowStock(),
    queryFn: () => inventoryApi.getLowStock(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Retrieves working capital valuation metrics for consumable stock
 */
export function useInventoryValuation() {
  return useQuery({
    queryKey: inventoryQueryKeys.valuation(),
    queryFn: () => inventoryApi.getValuation(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Retrieves detailed metadata and stock status for a single product
 */
export function useInventoryProduct(id: string | undefined) {
  return useQuery({
    queryKey: inventoryQueryKeys.detail(id ?? ''),
    queryFn: () => inventoryApi.getItemById(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

/**
 * Retrieves real-time stock balance on hand for a single product
 */
export function useStockLevel(id: string | undefined) {
  return useQuery({
    queryKey: inventoryQueryKeys.stock(id ?? ''),
    queryFn: () => inventoryApi.getStockLevel(id!),
    enabled: Boolean(id),
    staleTime: 15 * 1000,
  });
}

/**
 * Retrieves chronological stock movement ledger audit entries for a product
 */
export function useStockMovements(id: string | undefined, params?: ListStockMovementsFilterParams) {
  return useQuery({
    queryKey: inventoryQueryKeys.movements(id ?? '', params),
    queryFn: () => inventoryApi.getMovements(id!, params),
    enabled: Boolean(id),
    staleTime: 15 * 1000,
  });
}
