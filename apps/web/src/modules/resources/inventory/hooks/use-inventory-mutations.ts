import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import { inventoryApi, inventoryQueryKeys } from '../api';
import type {
  CreateProductInputVM,
  UpdateProductInputVM,
  ReceiveStockInputVM,
  SellStockInputVM,
  ConsumeStockInputVM,
  ScrapStockInputVM,
  AdjustStockInputVM,
} from '../types';

/**
 * Hook to register a new consumable product in the catalog
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (payload: CreateProductInputVM) => inventoryApi.createItem(payload),
    onSuccess: (newItem) => {
      notification.success(`Product "${newItem.name}" registered successfully`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to register product');
    },
  });
}

/**
 * Hook to update product metadata and pricing
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductInputVM }) =>
      inventoryApi.updateItem(id, payload),
    onSuccess: (updatedItem) => {
      notification.success(`Product "${updatedItem.name}" updated successfully`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(updatedItem.id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to update product details');
    },
  });
}

/**
 * Hook to archive a product
 */
export function useArchiveProduct() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (id: string) => inventoryApi.archiveItem(id),
    onSuccess: (item) => {
      notification.success(`Product "${item.name}" has been archived`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(item.id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to archive product');
    },
  });
}

/**
 * Hook to reactivate an archived product
 */
export function useActivateProduct() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (id: string) => inventoryApi.activateItem(id),
    onSuccess: (item) => {
      notification.success(`Product "${item.name}" is now active`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(item.id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to activate product');
    },
  });
}

/**
 * Hook to deactivate an active product (suspend)
 */
export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (id: string) => inventoryApi.deactivateItem(id),
    onSuccess: (item) => {
      notification.success(`Product "${item.name}" deactivated`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(item.id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to deactivate product');
    },
  });
}

/**
 * Hook to record purchase receipt of stock
 */
export function useReceiveStock() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReceiveStockInputVM }) =>
      inventoryApi.receiveStock(id, payload),
    onSuccess: (_, { id, payload }) => {
      notification.success(`Received ${payload.quantity} units into inventory`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.movementsLists(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record stock purchase');
    },
  });
}

/**
 * Hook to record retail sale of stock
 */
export function useSellStock() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SellStockInputVM }) =>
      inventoryApi.sellStock(id, payload),
    onSuccess: (_, { id, payload }) => {
      notification.success(`Recorded sale of ${payload.quantity} units`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.movementsLists(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record sale');
    },
  });
}

/**
 * Hook to record stock consumption in clinical or gym session
 */
export function useConsumeStock() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ConsumeStockInputVM }) =>
      inventoryApi.consumeStock(id, payload),
    onSuccess: (_, { id, payload }) => {
      notification.success(`Recorded consumption of ${payload.quantity} units`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.movementsLists(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record consumption');
    },
  });
}

/**
 * Hook to record disposal of damaged or expired stock
 */
export function useScrapStock() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ScrapStockInputVM }) =>
      inventoryApi.scrapStock(id, payload),
    onSuccess: (_, { id, payload }) => {
      notification.success(`Disposed ${payload.quantity} scrapped units`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.movementsLists(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to scrap stock');
    },
  });
}

/**
 * Hook to record audit physical count adjustment
 */
export function useAdjustStock() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdjustStockInputVM }) =>
      inventoryApi.adjustStock(id, payload),
    onSuccess: (_, { id, payload }) => {
      const direction =
        payload.deltaQuantity > 0 ? `+${payload.deltaQuantity}` : `${payload.deltaQuantity}`;
      notification.success(`Physical count adjusted by ${direction} units`);
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.movementsLists(id) });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.valuation() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to adjust stock count');
    },
  });
}
