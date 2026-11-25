import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationCreation } from '../hooks/use-conversation-creation';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type {
  CreateConversationResponse,
  CreateConversationRequest,
} from '../types/conversation-contract.types';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api', () => ({
  assistantApi: {
    queryKnowledge: jest.fn(),
    buildConversationHistoryContext: jest.fn().mockReturnValue([]),
  },
}));

const mockedConversationApi = jest.mocked(conversationApi);
const mockedAssistantApi = jest.mocked(assistantApi);

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, Wrapper };
}

describe('FE.03 — Conversation Creation Subsystem', () => {
  const tenantId = 'tenant_fe03';
  const userId = 'usr_fe03_owner';
  const scope = { tenantId, userId };

  const mockServerResponse: CreateConversationResponse = {
    conversationId: 'conv-server-auth-uuid-999',
    turnId: 'turn-server-1',
    clientTurnId: 'client-turn-stable-123',
    turnIndex: 1,
    userMessageId: 'msg-u-100',
    assistantAttemptId: 'att-a-200',
    title: 'Protocolo de Rehabilitación Lumbar',
    turnStatus: 'PENDING',
    isIdempotentReplay: false,
    idempotencyOutcome: 'CREATED',
    createdAt: '2026-11-24T12:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('1. useConversationCreation Hook', () => {
    it('creates persistent conversation, receives authoritative server ID, and invalidates list caches', async () => {
      mockedConversationApi.createConversation.mockResolvedValueOnce(mockServerResponse);
      const invalidateSpy = jest.spyOn(conversationCachePolicies, 'invalidateConversationLists');
      const onSuccessSpy = jest.fn();

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () => useConversationCreation({ scope, onSuccess: onSuccessSpy }),
        { wrapper: Wrapper },
      );

      expect(result.current.status).toBe('idle');
      expect(result.current.isCreating).toBe(false);

      let response: CreateConversationResponse | undefined;
      await act(async () => {
        response = await result.current.createConversation({
          prompt: 'Consulta sobre lumbalgia aguda',
          title: 'Protocolo de Rehabilitación Lumbar',
          clientTurnId: 'client-turn-stable-123',
        });
      });

      // Authoritative verification
      expect(response).toEqual(mockServerResponse);
      expect(result.current.createdConversation).toEqual(mockServerResponse);
      expect(result.current.status).toBe('success');
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isCreating).toBe(false);

      // Verify request payload dispatch
      expect(mockedConversationApi.createConversation).toHaveBeenCalledWith({
        clientTurnId: 'client-turn-stable-123',
        userPrompt: 'Consulta sobre lumbalgia aguda',
        title: 'Protocolo de Rehabilitación Lumbar',
        metadata: undefined,
      });

      // Verify cache invalidation
      expect(invalidateSpy).toHaveBeenCalledWith(expect.any(Object), scope);
      expect(onSuccessSpy).toHaveBeenCalledWith(mockServerResponse);
    });

    it('rejects empty or whitespace-only prompt without calling backend', async () => {
      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(() => useConversationCreation({ scope }), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.createConversation({ prompt: '   ' });
        } catch (err) {
          expect((err as Error).message).toBe('El prompt de usuario no puede estar vacío.');
        }
      });

      expect(mockedConversationApi.createConversation).not.toHaveBeenCalled();
      expect(result.current.status).toBe('error');
      expect(result.current.isError).toBe(true);
    });

    it('enforces single-flight mutex lock preventing concurrent duplicate submissions', async () => {
      let resolveFirstCall: (res: CreateConversationResponse) => void;
      const delayedCreationPromise = new Promise<CreateConversationResponse>((resolve) => {
        resolveFirstCall = resolve;
      });

      mockedConversationApi.createConversation.mockReturnValueOnce(delayedCreationPromise);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(() => useConversationCreation({ scope }), {
        wrapper: Wrapper,
      });

      // Trigger first creation
      let firstPromise: Promise<CreateConversationResponse>;
      act(() => {
        firstPromise = result.current.createConversation({
          prompt: 'Primera consulta inicial',
        });
      });

      expect(result.current.isCreating).toBe(true);

      // Trigger second creation immediately while first is in-flight
      await expect(
        result.current.createConversation({
          prompt: 'Segunda consulta duplicada en vuelo',
        }),
      ).rejects.toThrow('Ya existe una creación de conversación en curso.');

      expect(mockedConversationApi.createConversation).toHaveBeenCalledTimes(1);

      // Resolve first call
      await act(async () => {
        resolveFirstCall!(mockServerResponse);
        await firstPromise;
      });

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.createdConversation).toEqual(mockServerResponse);
    });

    it('handles creation failure gracefully and allows retry with stable clientTurnId', async () => {
      const networkError = new Error('Network error during conversation creation');
      mockedConversationApi.createConversation
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockServerResponse);

      const onErrorSpy = jest.fn();
      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(() => useConversationCreation({ scope, onError: onErrorSpy }), {
        wrapper: Wrapper,
      });

      // Initial failed attempt
      await act(async () => {
        try {
          await result.current.createConversation({
            prompt: 'Consulta que falla inicialmente',
            clientTurnId: 'retry-turn-key-456',
          });
        } catch {
          // Expected
        }
      });

      expect(result.current.status).toBe('error');
      expect(result.current.isError).toBe(true);
      expect(onErrorSpy).toHaveBeenCalled();
      expect(mockedConversationApi.createConversation).toHaveBeenCalledTimes(1);

      // Retry attempt
      let retryResponse: CreateConversationResponse | null = null;
      await act(async () => {
        retryResponse = await result.current.retry();
      });

      expect(retryResponse).toEqual(mockServerResponse);
      expect(result.current.status).toBe('success');
      expect(mockedConversationApi.createConversation).toHaveBeenCalledTimes(2);

      // Verify that retry preserved the exact clientTurnId
      const firstCall = mockedConversationApi.createConversation.mock.calls[0];
      const secondCall = mockedConversationApi.createConversation.mock.calls[1];
      expect(firstCall).toBeDefined();
      expect(secondCall).toBeDefined();
      expect((firstCall![0] as CreateConversationRequest).clientTurnId).toBe('retry-turn-key-456');
      expect((secondCall![0] as CreateConversationRequest).clientTurnId).toBe('retry-turn-key-456');
    });

    it('resets state cleanly when reset() is called', async () => {
      mockedConversationApi.createConversation.mockResolvedValueOnce(mockServerResponse);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(() => useConversationCreation({ scope }), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createConversation({ prompt: 'Consulta inicial' });
      });

      expect(result.current.isSuccess).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.createdConversation).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('2. Initial Message & Lifecycle Integration', () => {
    it('creates persistent conversation on first message submission and transitions route', async () => {
      mockedConversationApi.createConversation.mockResolvedValueOnce(mockServerResponse);

      const mockAnswer: RAGAnswerResponseDto = {
        answer: 'Respuesta generada para la primera consulta.',
        grounded: true,
        sources: [
          {
            documentId: 'doc_1',
            documentTitle: 'Guía Clínica',
            chunkId: 'chk_1',
            pageNumber: 3,
            relevanceScore: 0.92,
          },
        ],
        metadata: {
          model: 'claude-3-5-sonnet',
          retrievalCount: 1,
          latencyMs: 140,
        },
      };

      mockedAssistantApi.queryKnowledge.mockResolvedValueOnce(mockAnswer);

      const onConversationCreatedSpy = jest.fn();
      const { Wrapper } = createTestWrapper();

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: undefined, // Empty workspace / fresh draft
            onConversationCreated: onConversationCreatedSpy,
          }),
        { wrapper: Wrapper },
      );

      expect(result.current.isGenerating).toBe(false);

      await act(async () => {
        await result.current.submitMessage({
          prompt: 'Consulta de inicio de conversación',
        });
      });

      // Verify authoritative backend creation was called
      expect(mockedConversationApi.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: 'Consulta de inicio de conversación',
        }),
      );

      // Verify onConversationCreated was called with authoritative conversation ID from backend
      expect(onConversationCreatedSpy).toHaveBeenCalledWith('conv-server-auth-uuid-999');

      // Verify generation completes successfully
      expect(result.current.state.status).toBe('COMPLETED');
      expect(result.current.isGenerating).toBe(false);

      // Verify assistantStorageService is synced with the authoritative conversation
      const stored = assistantStorageService.getConversation(
        tenantId,
        userId,
        'conv-server-auth-uuid-999',
      );
      expect(stored).toBeDefined();
      expect(stored?.id).toBe('conv-server-auth-uuid-999');
      const messages = stored?.messages ?? [];
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('user');
      expect(messages[1]?.role).toBe('assistant');
      expect(messages[1]?.content).toBe('Respuesta generada para la primera consulta.');
    });
  });
});
