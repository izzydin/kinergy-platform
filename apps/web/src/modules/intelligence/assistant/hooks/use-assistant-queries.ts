import { useQuery } from '@tanstack/react-query';
import { aiAssistantKeys } from '../api/assistant-query-keys';
import { assistantStorageService } from '../services/assistant-storage.service';
import type { Conversation, ConversationSummary } from '../types/assistant.types';

/**
 * Custom TanStack Query Hook: Retrieves all conversation summaries for the active tenant & user partition.
 */
export function useConversationList(
  tenantId: string | undefined,
  userId: string | undefined,
  options?: { enabled?: boolean },
) {
  const safeTenant = tenantId || '';
  const safeUser = userId || '';
  const isEnabled = Boolean(safeTenant && safeUser) && (options?.enabled ?? true);

  return useQuery<ConversationSummary[]>({
    queryKey: aiAssistantKeys.conversations(safeTenant, safeUser),
    queryFn: () => assistantStorageService.listSummaries(safeTenant, safeUser),
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

/**
 * Custom TanStack Query Hook: Retrieves a single conversation thread by ID with full message history.
 */
export function useConversationDetail(
  tenantId: string | undefined,
  userId: string | undefined,
  conversationId: string | undefined,
  options?: { enabled?: boolean },
) {
  const safeTenant = tenantId || '';
  const safeUser = userId || '';
  const safeConvId = conversationId || '';
  const isEnabled = Boolean(safeTenant && safeUser && safeConvId) && (options?.enabled ?? true);

  return useQuery<Conversation | null>({
    queryKey: aiAssistantKeys.conversation(safeTenant, safeUser, safeConvId),
    queryFn: () => assistantStorageService.getConversation(safeTenant, safeUser, safeConvId),
    enabled: isEnabled,
    staleTime: 15_000,
  });
}
