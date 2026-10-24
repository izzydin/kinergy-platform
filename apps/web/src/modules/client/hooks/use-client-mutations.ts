import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../api/client-api';
import { clientQueryKeys } from '../api/client-query-keys';
import { useNotification } from '../../../app/providers/notification-provider';
import type {
  ClientModel,
  RegisterClientInputDTO,
  RegisterClientResponseDTO,
  UpdateClientInputDTO,
} from '../types/client.types';

export function useRegisterClientMutation() {
  const queryClient = useQueryClient();

  return useMutation<RegisterClientResponseDTO, Error, RegisterClientInputDTO>({
    mutationFn: (payload: RegisterClientInputDTO) => clientApi.registerClient(payload),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.lists() });
      queryClient.setQueryData(clientQueryKeys.detail(newClient.id), newClient);
    },
  });
}

export function useUpdateClientMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<ClientModel, Error, { id: string; payload: UpdateClientInputDTO }>({
    mutationFn: ({ id, payload }) => clientApi.updateClient(id, payload),
    onSuccess: (updatedClient, { id }) => {
      // 1. Immediately reconcile single-client cache
      queryClient.setQueryData(clientQueryKeys.detail(id), updatedClient);

      // 2. Invalidate directory search queries so list views reflect changed attributes
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.lists() });

      // 3. Invalidate timeline queries to reflect auto-projected CLIENT_UPDATED audit events
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.timeline(id) });

      notification.success(
        'Client Updated',
        'Client profile details have been saved successfully.',
      );
    },
  });
}

export function useArchiveClientMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<ClientModel, Error, { id: string; expectedVersion?: number }>({
    mutationFn: ({ id, expectedVersion }) => clientApi.archiveClient(id, expectedVersion),
    onSuccess: (archivedClient, { id }) => {
      // 1. Immediately reconcile single-client cache with ARCHIVED status and new version
      queryClient.setQueryData(clientQueryKeys.detail(id), archivedClient);

      // 2. Invalidate directory queries so active/archived filters stay coherent
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.lists() });

      // 3. Invalidate timeline queries to reflect auto-projected CLIENT_ARCHIVED event
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.timeline(id) });

      notification.success('Client Archived', 'Client record has been safely archived.');
    },
  });
}

export function useRestoreClientMutation() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation<ClientModel, Error, { id: string; expectedVersion?: number }>({
    mutationFn: ({ id, expectedVersion }) => clientApi.restoreClient(id, expectedVersion),
    onSuccess: (restoredClient, { id }) => {
      // 1. Immediately reconcile single-client cache with ACTIVE status and new version
      queryClient.setQueryData(clientQueryKeys.detail(id), restoredClient);

      // 2. Invalidate directory queries
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.lists() });

      // 3. Invalidate timeline queries to reflect auto-projected CLIENT_RESTORED event
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.timeline(id) });

      notification.success('Client Restored', 'Client record has been restored to active status.');
    },
  });
}
