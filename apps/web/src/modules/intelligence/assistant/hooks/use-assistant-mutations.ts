import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiAssistantKeys } from '../api/assistant-query-keys';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type {
  ChatMessage,
  Conversation,
  RAGAnswerResponseDto,
  RetrievalSearchMode,
} from '../types/assistant.types';
import { normalizeApiError } from '../../../../shared/api/api-error';

export interface SubmitMessageVariables {
  readonly prompt: string;
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
  readonly signal?: AbortSignal;
}

export interface SubmitMessageResult {
  readonly userMessage: ChatMessage;
  readonly assistantMessage: ChatMessage;
  readonly response: RAGAnswerResponseDto;
}

/**
 * Custom TanStack Query Hook: Submits a new prompt turn to the RAG assistant.
 * Handles optimistic message commitment, background history construction,
 * backend API call, and canonical response reconciliation.
 */
export function useSubmitMessageMutation(tenantId: string, userId: string, conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation<SubmitMessageResult, Error, SubmitMessageVariables>({
    mutationFn: async ({ prompt, searchMode, topK, signal }) => {
      const now = new Date().toISOString();
      const userMessageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `msg_u_${Date.now()}`;
      const assistantMessageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `msg_a_${Date.now()}`;

      // 1. Commit user message to storage
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: prompt.trim(),
        createdAt: now,
        status: 'success',
      };
      assistantStorageService.appendMessage(tenantId, userId, conversationId, userMessage);

      // 2. Commit pending assistant placeholder to storage
      const pendingAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      const updatedConv = assistantStorageService.appendMessage(
        tenantId,
        userId,
        conversationId,
        pendingAssistantMessage,
      );

      // 3. Immediately reflect pending turn in cache
      queryClient.setQueryData(
        aiAssistantKeys.conversation(tenantId, userId, conversationId),
        updatedConv,
      );
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );

      // 4. Construct bounded conversation history (omitting the pending turn)
      const historyContext = assistantApi.buildConversationHistoryContext(
        updatedConv.messages.filter((m) => m.id !== assistantMessageId),
      );

      try {
        // 5. Submit to backend RAG API (conversationId omitted per ADR-AI-09-01)
        const response = await assistantApi.queryKnowledge(
          {
            query: prompt.trim(),
            searchMode,
            topK,
            conversationHistory: historyContext.length > 0 ? historyContext : undefined,
          },
          signal,
        );

        // 6. Reconcile storage with final canonical response
        const completedAssistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: response.answer,
          createdAt: new Date().toISOString(),
          status: 'success',
          grounded: response.grounded,
          sources: response.sources,
          metadata: response.metadata,
        };

        const finalizedConv = assistantStorageService.updateMessage(
          tenantId,
          userId,
          conversationId,
          assistantMessageId,
          completedAssistantMessage,
        );

        // 7. Update caches
        if (finalizedConv) {
          queryClient.setQueryData(
            aiAssistantKeys.conversation(tenantId, userId, conversationId),
            finalizedConv,
          );
        }
        queryClient.setQueryData(
          aiAssistantKeys.conversations(tenantId, userId),
          assistantStorageService.listSummaries(tenantId, userId),
        );

        return {
          userMessage,
          assistantMessage: completedAssistantMessage,
          response,
        };
      } catch (rawError) {
        const error = normalizeApiError(rawError);

        // Reconcile storage with failed state
        const failedAssistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          status: 'error',
          error: error.message,
        };

        const failedConv = assistantStorageService.updateMessage(
          tenantId,
          userId,
          conversationId,
          assistantMessageId,
          failedAssistantMessage,
        );

        if (failedConv) {
          queryClient.setQueryData(
            aiAssistantKeys.conversation(tenantId, userId, conversationId),
            failedConv,
          );
        }

        throw error;
      }
    },
  });
}

/**
 * Custom TanStack Query Hook: Creates a new conversation thread.
 */
export function useCreateConversationMutation(tenantId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation<Conversation, Error, { title?: string; conversationId?: string }>({
    mutationFn: async ({ title, conversationId }) => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        title,
        conversationId,
      );
      return conv;
    },
    onSuccess: (newConv) => {
      queryClient.setQueryData(aiAssistantKeys.conversation(tenantId, userId, newConv.id), newConv);
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );
    },
  });
}

/**
 * Custom TanStack Query Hook: Deletes a conversation thread.
 */
export function useDeleteConversationMutation(tenantId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { conversationId: string }>({
    mutationFn: async ({ conversationId }) => {
      return assistantStorageService.deleteConversation(tenantId, userId, conversationId);
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.removeQueries({
        queryKey: aiAssistantKeys.conversation(tenantId, userId, conversationId),
      });
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );
    },
  });
}

/**
 * Custom TanStack Query Hook: Clears all conversations for the tenant and user.
 */
export function useClearConversationsMutation(tenantId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      assistantStorageService.clearConversations(tenantId, userId);
    },
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: aiAssistantKeys.all,
      });
      queryClient.setQueryData(aiAssistantKeys.conversations(tenantId, userId), []);
    },
  });
}
