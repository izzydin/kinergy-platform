import type { ListInventoryFilterParams, ListStockMovementsFilterParams } from '../types';

/**
 * Authoritative TanStack Query Key Factory for Consumable Inventory
 */
export const inventoryQueryKeys = {
  all: ['resources', 'inventory'] as const,

  // Category Taxonomy Metadata
  categories: () => [...inventoryQueryKeys.all, 'categories'] as const,

  // Low Stock Alert Collection
  lowStock: () => [...inventoryQueryKeys.all, 'low-stock'] as const,

  // Working Capital Valuation
  valuation: () => ['resources', 'valuation', 'inventory'] as const,

  // Catalog Lists
  lists: () => [...inventoryQueryKeys.all, 'list'] as const,
  list: (params?: ListInventoryFilterParams) =>
    [...inventoryQueryKeys.lists(), params ?? {}] as const,

  // Single Item Hierarchy
  details: () => [...inventoryQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...inventoryQueryKeys.details(), id] as const,
  stock: (id: string) => [...inventoryQueryKeys.detail(id), 'stock'] as const,

  // Stock Movement Ledger
  movementsLists: (id: string) => [...inventoryQueryKeys.detail(id), 'movements'] as const,
  movements: (id: string, params?: ListStockMovementsFilterParams) =>
    [...inventoryQueryKeys.movementsLists(id), params ?? {}] as const,
};
