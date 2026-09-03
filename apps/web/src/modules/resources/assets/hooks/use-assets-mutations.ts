import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import { assetsApi, assetsQueryKeys } from '../api';
import type {
  CreateFixedAssetInputVM,
  UpdateFixedAssetDetailsInputVM,
  TransferFixedAssetLocationInputVM,
  ChangeFixedAssetStatusInputVM,
  UpdateFixedAssetConditionInputVM,
  RecordAssetMaintenanceInputVM,
  UpdateFixedAssetValuationInputVM,
} from '../types';

/**
 * Hook to commission and register a new fixed asset
 */
export function useCreateAsset() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (payload: CreateFixedAssetInputVM) => assetsApi.createAsset(payload),
    onSuccess: (newItem) => {
      notification.success(
        `Asset "${newItem.name}" (${newItem.assetTag}) commissioned successfully`,
      );
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['resources', 'valuation'] });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to commission fixed asset');
    },
  });
}

/**
 * Hook to update descriptive metadata (name, description, notes, reason)
 */
export function useUpdateAssetDetails() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateFixedAssetDetailsInputVM }) =>
      assetsApi.updateDetails(id, payload),
    onSuccess: (updatedItem, { id }) => {
      notification.success(`Asset "${updatedItem.name}" updated successfully`);
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to update asset details');
    },
  });
}

/**
 * Hook to relocate equipment to a new physical location
 */
export function useTransferAssetLocation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TransferFixedAssetLocationInputVM }) =>
      assetsApi.transferLocation(id, payload),
    onSuccess: (updatedItem, { id, payload }) => {
      notification.success(
        `Asset "${updatedItem.name}" relocated to facility ${payload.location.facilityId}`,
      );
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to transfer asset location');
    },
  });
}

/**
 * Hook to transition lifecycle state (ACTIVE, UNDER_MAINTENANCE, DAMAGED, RETIRED)
 */
export function useChangeAssetStatus() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ChangeFixedAssetStatusInputVM }) =>
      assetsApi.changeStatus(id, payload),
    onSuccess: (updatedItem, { id, payload }) => {
      notification.success(`Asset "${updatedItem.name}" status changed to ${payload.status}`);
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
      queryClient.invalidateQueries({ queryKey: ['resources', 'valuation'] });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to change asset status');
    },
  });
}

/**
 * Hook to re-rate physical operational condition (Rank 1 to 5)
 */
export function useUpdateAssetCondition() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateFixedAssetConditionInputVM }) =>
      assetsApi.updateCondition(id, payload),
    onSuccess: (updatedItem, { id, payload }) => {
      notification.success(`Asset "${updatedItem.name}" condition rated as ${payload.condition}`);
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to update asset condition');
    },
  });
}

/**
 * Hook to record servicing / maintenance work order (with auto-recovery to ACTIVE)
 */
export function useRecordAssetMaintenance() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecordAssetMaintenanceInputVM }) =>
      assetsApi.recordMaintenance(id, payload),
    onSuccess: (_, { id, payload }) => {
      notification.success(
        `Maintenance recorded ($${payload.costAmount.toFixed(2)} by ${payload.performedBy})`,
      );
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.maintenanceLists(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record asset maintenance');
    },
  });
}

/**
 * Hook to update current estimated fair carrying value (Dual Permission)
 */
export function useUpdateAssetValuation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateFixedAssetValuationInputVM }) =>
      assetsApi.updateValuation(id, payload),
    onSuccess: (updatedItem, { id, payload }) => {
      notification.success(
        `Asset "${updatedItem.name}" fair value updated to $${payload.estimatedValueAmount.toFixed(2)}`,
      );
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.valuation(id) });
      queryClient.invalidateQueries({ queryKey: assetsQueryKeys.historyLists(id) });
      queryClient.invalidateQueries({ queryKey: ['resources', 'valuation'] });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to update asset valuation');
    },
  });
}
