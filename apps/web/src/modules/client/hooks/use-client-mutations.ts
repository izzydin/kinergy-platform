import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../api/client-api';
import { clientQueryKeys } from '../api/client-query-keys';
import type { RegisterClientInputDTO, RegisterClientResponseDTO } from '../types/client.types';

export function useRegisterClientMutation() {
  const queryClient = useQueryClient();

  return useMutation<RegisterClientResponseDTO, Error, RegisterClientInputDTO>({
    mutationFn: (payload: RegisterClientInputDTO) => clientApi.registerClient(payload),
    onSuccess: (newClient) => {
      // Invalidate list queries so the new client shows up in directory searches
      queryClient.invalidateQueries({ queryKey: clientQueryKeys.lists() });
      // Pre-seed the detail cache with the new client response
      queryClient.setQueryData(clientQueryKeys.detail(newClient.id), newClient);
    },
  });
}
