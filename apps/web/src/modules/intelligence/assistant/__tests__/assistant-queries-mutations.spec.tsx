import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationList, useConversationDetail } from '../hooks/use-assistant-queries';
import {
  useSubmitMessageMutation,
  useCreateConversationMutation,
  useDeleteConversationMutation,
} from '../hooks/use-assistant-mutations';
import { assistantStorageService } from '../services/assistant-storage.service';
import { assistantApi } from '../api/assistant.api';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/assistant.api', () => ({
  assistantApi: {
    queryKnowledge: jest.fn(),
    buildConversationHistoryContext: jest.fn().mockReturnValue([]),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

describe('AI Assistant TanStack Query & Mutation Integration', () => {
  const tenantId = 'tenant-test-1';
  const userId = 'user-test-1';

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('Queries', () => {
    it('retrieves conversation summaries for active tenant & user', async () => {
      assistantStorageService.createConversation(tenantId, userId, 'Test Conversation');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversationList(tenantId, userId), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.length).toBe(1);
      expect(result.current.data?.[0]?.title).toBe('Test Conversation');
    });

    it('retrieves single conversation detail by ID', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Detail Conv');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversationDetail(tenantId, userId, conv.id), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.id).toBe(conv.id);
      expect(result.current.data?.title).toBe('Detail Conv');
    });
  });

  describe('Mutations', () => {
    it('creates a new conversation and invalidates conversation lists', async () => {
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useCreateConversationMutation(tenantId, userId), {
        wrapper: Wrapper,
      });

      await result.current.mutateAsync({ title: 'Nueva Terapia' });

      const conversations = assistantStorageService.getConversations(tenantId, userId);
      expect(conversations.length).toBe(1);
      expect(conversations[0]?.title).toBe('Nueva Terapia');
    });

    it('deletes a conversation thread', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Delete Me');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useDeleteConversationMutation(tenantId, userId), {
        wrapper: Wrapper,
      });

      await result.current.mutateAsync({ conversationId: conv.id });

      const conversations = assistantStorageService.getConversations(tenantId, userId);
      expect(conversations.length).toBe(0);
    });

    it('submits a prompt, updates storage optimistically, and reconciles canonical answer', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Chat Session');
      const mockResponse: RAGAnswerResponseDto = {
        answer: 'Respuesta clínica fundamentada.',
        grounded: true,
        sources: [
          {
            documentId: 'doc-1',
            documentTitle: 'Protocolo',
            chunkId: 'chk-1',
            relevanceScore: 0.95,
          },
        ],
        metadata: {
          model: 'mistral:latest',
          retrievalCount: 2,
          latencyMs: 180,
        },
      };

      (assistantApi.queryKnowledge as jest.Mock).mockResolvedValueOnce(mockResponse);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useSubmitMessageMutation(tenantId, userId, conv.id), {
        wrapper: Wrapper,
      });

      const mutationResult = await result.current.mutateAsync({
        prompt: '¿Cómo aplicar frío en tendinitis?',
      });

      expect(mutationResult.response.answer).toBe('Respuesta clínica fundamentada.');
      expect(mutationResult.userMessage.content).toBe('¿Cómo aplicar frío en tendinitis?');
      expect(mutationResult.assistantMessage.status).toBe('success');

      // Verify persisted state in storage
      const updated = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(updated?.messages.length).toBe(2);
      expect(updated?.messages[0]?.role).toBe('user');
      expect(updated?.messages[1]?.role).toBe('assistant');
      expect(updated?.messages[1]?.content).toBe('Respuesta clínica fundamentada.');
      expect(updated?.messages[1]?.status).toBe('success');
      expect(updated?.messages[1]?.grounded).toBe(true);
    });

    it('marks pending assistant turn as error when API call fails', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Error Session');
      (assistantApi.queryKnowledge as jest.Mock).mockRejectedValueOnce(
        new Error('Network connection failed'),
      );

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useSubmitMessageMutation(tenantId, userId, conv.id), {
        wrapper: Wrapper,
      });

      await expect(result.current.mutateAsync({ prompt: 'Test failure prompt' })).rejects.toThrow();

      // Verify persisted state marked as error
      const updated = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(updated?.messages.length).toBe(2);
      expect(updated?.messages[0]?.role).toBe('user');
      expect(updated?.messages[1]?.role).toBe('assistant');
      expect(updated?.messages[1]?.status).toBe('error');
    });
  });
});
