import '@testing-library/jest-dom';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { useConversationCreation } from '../hooks/use-conversation-creation';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import type {
  CreateConversationResponse,
  MessageHistoryResponse,
} from '../types/conversation-contract.types';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api');

const mockedConvApi = jest.mocked(conversationApi);
const mockedAsstApi = jest.mocked(assistantApi);

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

/**
 * AI-09.10 — IT.04: Conversation & Streaming Frontend Integration Tests
 *
 * Verifies frontend integration with conversation contracts, lifecycle state machine,
 * optimistic message reconciliation, streaming progression, interruption, and concurrency protection.
 */
describe('AI-09.10 — IT.04: Conversation & Streaming (Frontend Integration)', () => {
  const tenantId = 'tenant_fe_it04';
  const userId = 'usr_fe_it04_doc';
  const conversationId = 'conv_fe_it04_001';

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
    mockedAsstApi.buildConversationHistoryContext.mockImplementation((msgs) =>
      msgs.map((m) => ({ role: m.role, content: m.content })),
    );
  });

  // =========================================================================
  // 1. Conversation Creation & Authoritative State Reconciliation
  // =========================================================================
  describe('1. Conversation Creation & State Reconciliation', () => {
    it('creates conversation, reconciles authoritative ID, and syncs query cache', async () => {
      const createdConvId = 'conv_auth_rec_101';
      const mockCreateResponse: CreateConversationResponse = {
        conversationId: createdConvId,
        turnId: 'turn_auth_1',
        clientTurnId: 'client_turn_auth_1',
        turnIndex: 1,
        userMessageId: 'msg_u_auth_1',
        assistantAttemptId: 'msg_a_auth_1',
        title: 'Protocolo Tendinopatía Aquilea',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      };

      const mockAnswer: RAGAnswerResponseDto = {
        answer: 'Protocolo de carga excéntrica según Alfredson con progresión de 12 semanas.',
        grounded: true,
        sources: [
          {
            citationId: 'cit_alfredson_01',
            documentId: 'doc_aquiles_01',
            documentTitle: 'Guía Clínica de Tendinopatía Aquilea',
            chunkId: 'chunk_01',
            pageNumber: 5,
            relevanceScore: 0.98,
          },
        ],
        metadata: {
          model: 'qwen-2.5-coder',
          retrievalCount: 1,
          latencyMs: 180,
        },
      };

      mockedConvApi.createConversation.mockResolvedValue(mockCreateResponse);
      mockedAsstApi.queryKnowledge.mockResolvedValue(mockAnswer);

      const onCreatedMock = jest.fn();
      const { Wrapper } = createTestWrapper();

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            onConversationCreated: onCreatedMock,
          }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.submitMessage({
          prompt: 'Protocolo de carga excéntrica para tendinopatía aquilea',
        });
      });

      // Assert creation API called and callback fired with authoritative ID
      expect(mockedConvApi.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: 'Protocolo de carga excéntrica para tendinopatía aquilea',
        }),
      );
      expect(onCreatedMock).toHaveBeenCalledWith(createdConvId);

      // Verify lifecycle FSM transitioned to COMPLETED
      expect(result.current.state.status).toBe('COMPLETED');

      // Verify storage was populated with both user and assistant messages
      const storedConv = assistantStorageService.getConversation(tenantId, userId, createdConvId);
      expect(storedConv).toBeDefined();
      expect(storedConv?.messages).toHaveLength(2);
      expect(storedConv?.messages[0]?.role).toBe('user');
      expect(storedConv?.messages[1]?.role).toBe('assistant');
      expect(storedConv?.messages[1]?.content).toContain('Protocolo de carga excéntrica');
      expect(storedConv?.messages[1]?.status).toBe('success');
      expect(storedConv?.messages[1]?.grounded).toBe(true);
    });

    it('enforces single-flight mutex in useConversationCreation hook', async () => {
      let resolveCreation: (value: CreateConversationResponse) => void = () => {};
      mockedConvApi.createConversation.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreation = resolve;
          }),
      );

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () => useConversationCreation({ scope: { tenantId, userId } }),
        {
          wrapper: Wrapper,
        },
      );

      let promise1: Promise<CreateConversationResponse>;
      act(() => {
        promise1 = result.current.createConversation({
          prompt: 'Consulta de columna lumbar',
        });
      });

      expect(result.current.isCreating).toBe(true);

      // Attempt second creation concurrently while first is in-flight MUST fail with mutex error
      await expect(
        result.current.createConversation({
          prompt: 'Segunda consulta concurrente',
        }),
      ).rejects.toThrow('Ya existe una creación de conversación en curso.');

      // Resolve first creation
      act(() => {
        resolveCreation({
          conversationId: 'conv_mutex_ok',
          turnId: 'turn_mutex_1',
          clientTurnId: 'ct_mutex_1',
          turnIndex: 1,
          userMessageId: 'msg_u_1',
          assistantAttemptId: 'msg_a_1',
          title: 'Consulta de columna lumbar',
          turnStatus: 'PENDING',
          isIdempotentReplay: false,
          idempotencyOutcome: 'CREATED',
          createdAt: new Date().toISOString(),
        });
      });

      await act(async () => {
        await promise1;
      });

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.createdConversation?.conversationId).toBe('conv_mutex_ok');
    });
  });

  // =========================================================================
  // 2. Duplicate and Concurrent Submissions (Rapid Click Mutex)
  // =========================================================================
  describe('2. Concurrency & Mutex Protection in useGenerationLifecycle', () => {
    it('locks out rapid multi-clicks on send button preventing duplicate requests', async () => {
      assistantStorageService.createConversation(tenantId, userId, 'Test Conv', conversationId);

      let resolveQuery: (value: RAGAnswerResponseDto) => void = () => {};
      mockedConvApi.reserveTurn.mockResolvedValue({
        conversationId,
        turnId: 'turn_mutex_t2',
        clientTurnId: 'ct_mutex_t2',
        turnIndex: 2,
        userMessageId: 'msg_u_m2',
        assistantAttemptId: 'msg_a_m2',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveQuery = resolve;
          }),
      );

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId,
          }),
        { wrapper: Wrapper },
      );

      let firstSubmitPromise: Promise<void> | undefined;
      act(() => {
        firstSubmitPromise = result.current.submitMessage({
          prompt: '¿Cuáles son los ejercicios para síndrome piramidal?',
        });
      });

      expect(result.current.isGenerating).toBe(true);

      // Clinician double clicks rapidly
      let secondSubmitPromise: Promise<void> | undefined;
      act(() => {
        secondSubmitPromise = result.current.submitMessage({
          prompt: '¿Cuáles son los ejercicios para síndrome piramidal?',
        });
      });

      // Second call returned immediately without dispatching second turn
      await act(async () => {
        await secondSubmitPromise;
      });

      expect(mockedConvApi.reserveTurn).toHaveBeenCalledTimes(1);
      expect(mockedAsstApi.queryKnowledge).toHaveBeenCalledTimes(1);

      // Resolve query
      act(() => {
        resolveQuery({
          answer: 'Estiramientos del músculo piriforme y movilización neural ciática.',
          grounded: true,
          sources: [],
          metadata: { model: 'qwen', retrievalCount: 0, latencyMs: 120 },
        });
      });

      await act(async () => {
        await firstSubmitPromise;
      });

      expect(result.current.state.status).toBe('COMPLETED');
    });
  });

  // =========================================================================
  // 3. Multi-turn Continuation & Bounded Context
  // =========================================================================
  describe('3. Multi-Turn Continuation & Bounded Context Injection', () => {
    it('injects strictly canonical completed messages into RAG query context', async () => {
      assistantStorageService.createConversation(tenantId, userId, 'Sesión Hombro', conversationId);

      const initialHistory: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg_u1',
            turnId: 'turn_1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Turn 1 prompt: dolor subacromial',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          {
            id: 'msg_a1',
            turnId: 'turn_1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Turn 1 answer: prueba de Neer y Hawkins positivas.',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          // Non-canonical attempt (e.g. from prior regeneration) MUST be filtered out
          {
            id: 'msg_a1_old',
            turnId: 'turn_1',
            role: 'ASSISTANT',
            sequenceNumber: 3,
            attemptNumber: 0,
            isCanonical: false,
            status: 'SUCCESS',
            content: 'Turn 1 rejected answer attempt',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      const { queryClient, Wrapper } = createTestWrapper();

      // Seed query cache with history
      queryClient.setQueryData(
        conversationQueryKeys.paginatedMessages(conversationId, undefined, { tenantId, userId }),
        initialHistory,
      );

      mockedConvApi.reserveTurn.mockResolvedValue({
        conversationId,
        turnId: 'turn_2',
        clientTurnId: 'ct_turn_2',
        turnIndex: 2,
        userMessageId: 'msg_u2',
        assistantAttemptId: 'msg_a2',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockResolvedValue({
        answer: 'Fase 2: fortalecimiento de manguito rotador en rotación interna y externa.',
        grounded: true,
        sources: [],
        metadata: { model: 'qwen', retrievalCount: 0, latencyMs: 140 },
      });

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId,
          }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.submitMessage({
          prompt: '¿Qué ejercicios siguen en la fase 2?',
        });
      });

      // Verify buildConversationHistoryContext received only canonical messages
      expect(mockedAsstApi.buildConversationHistoryContext).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Turn 1 prompt: dolor subacromial' }),
          expect.objectContaining({
            content: 'Turn 1 answer: prueba de Neer y Hawkins positivas.',
          }),
        ]),
      );

      // Verify the non-canonical message was excluded
      const passedMessages = mockedAsstApi.buildConversationHistoryContext.mock.calls[0]?.[0] ?? [];
      const hasNonCanonical = passedMessages.some((m) =>
        m.content.includes('Turn 1 rejected answer attempt'),
      );
      expect(hasNonCanonical).toBe(false);
    });
  });

  // =========================================================================
  // 4. In-Flight Cancellation & Interruption
  // =========================================================================
  describe('4. In-Flight Cancellation via AbortController', () => {
    it('aborts active generation on client cancel, persists cancelled state, and notifies backend', async () => {
      assistantStorageService.createConversation(tenantId, userId, 'Sesión Cadera', conversationId);

      mockedConvApi.reserveTurn.mockResolvedValue({
        conversationId,
        turnId: 'turn_cancel_10',
        clientTurnId: 'ct_cancel_10',
        turnIndex: 2,
        userMessageId: 'msg_u10',
        assistantAttemptId: 'msg_a10',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      mockedConvApi.cancelTurn.mockResolvedValue({
        conversationId,
        turnId: 'turn_cancel_10',
        turnStatus: 'CANCELLED',
        assistantMessageId: 'msg_a10',
        isAlreadyCancelled: false,
        cancelledAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockImplementation(
        (_req, signal) =>
          new Promise((_, reject) => {
            signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      );

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId,
          }),
        { wrapper: Wrapper },
      );

      let submitPromise: Promise<void> | undefined;
      act(() => {
        submitPromise = result.current
          .submitMessage({
            prompt: 'Consulta prolongada para ser abortada',
          })
          .catch(() => {});
      });

      expect(result.current.isGenerating).toBe(true);

      await waitFor(() => {
        expect(mockedConvApi.reserveTurn).toHaveBeenCalled();
      });

      // User triggers cancel
      await act(async () => {
        await result.current.cancelGeneration(conversationId);
      });

      await act(async () => {
        await submitPromise;
      });

      // Backend was notified
      expect(mockedConvApi.cancelTurn).toHaveBeenCalledWith(
        conversationId,
        'turn_cancel_10',
        expect.objectContaining({
          reason: 'Generación cancelada por el usuario.',
        }),
      );

      // State transitioned to CANCELLED
      expect(result.current.state.status).toBe('CANCELLED');
      expect(result.current.isGenerating).toBe(false);

      // Stored message status updated to cancelled
      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg?.status).toBe('cancelled');
    });

    it('marks message interrupted in storage when unmounted during in-flight generation', async () => {
      assistantStorageService.createConversation(
        tenantId,
        userId,
        'Sesión Rodilla',
        conversationId,
      );

      mockedConvApi.reserveTurn.mockResolvedValue({
        conversationId,
        turnId: 'turn_unmount_1',
        clientTurnId: 'ct_unmount_1',
        turnIndex: 1,
        userMessageId: 'msg_u_unm',
        assistantAttemptId: 'msg_a_unm',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const { Wrapper } = createTestWrapper();
      const { result, unmount } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId,
          }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current.submitMessage({
          prompt: 'Consulta que será desmontada antes de terminar',
        });
      });

      await waitFor(() => {
        expect(mockedConvApi.reserveTurn).toHaveBeenCalled();
      });

      // Clinician navigates away (unmounts component)
      unmount();

      // Verify stored message reflects interrupted state
      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg?.status).toBe('interrupted');
      expect(asstMsg?.error).toContain('desmontaje');
    });
  });

  // =========================================================================
  // 5. Cross-Thread Safety (Preventing Leaks Between Conversations)
  // =========================================================================
  describe('5. Cross-Thread Isolation & Stale Response Protection', () => {
    it('does not leak or write response into newly selected conversation when thread is switched', async () => {
      const convA = 'conv_thread_A';
      const convB = 'conv_thread_B';

      assistantStorageService.createConversation(tenantId, userId, 'Sesión A', convA);
      assistantStorageService.createConversation(tenantId, userId, 'Sesión B', convB);

      let resolveQueryA: (value: RAGAnswerResponseDto) => void = () => {};
      mockedConvApi.reserveTurn.mockResolvedValue({
        conversationId: convA,
        turnId: 'turn_A_1',
        clientTurnId: 'ct_A_1',
        turnIndex: 1,
        userMessageId: 'msg_uA',
        assistantAttemptId: 'msg_aA',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveQueryA = resolve;
          }),
      );

      const { Wrapper } = createTestWrapper();

      // Render hook with Conversation A
      let activeConv = convA;
      const { result, rerender } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: activeConv,
          }),
        { wrapper: Wrapper },
      );

      // Start submission on Thread A
      let submitAPromise: Promise<void> | undefined;
      act(() => {
        submitAPromise = result.current.submitMessage({
          prompt: 'Consulta específica de hombro en conversación A',
        });
      });

      await waitFor(() => {
        expect(mockedConvApi.reserveTurn).toHaveBeenCalled();
      });

      // User switches view to Thread B
      activeConv = convB;
      rerender();

      // Generation for Thread A completes late
      act(() => {
        resolveQueryA({
          answer: 'Respuesta privada que pertenece exclusivamente a la conversación A.',
          grounded: true,
          sources: [],
          metadata: { model: 'qwen', retrievalCount: 0, latencyMs: 150 },
        });
      });

      await act(async () => {
        await submitAPromise;
      });

      // Verify Conversation B has ZERO messages from Conversation A
      const storedConvB = assistantStorageService.getConversation(tenantId, userId, convB);
      expect(storedConvB?.messages).toHaveLength(0);

      // Verify Conversation A received its answer properly
      const storedConvA = assistantStorageService.getConversation(tenantId, userId, convA);
      expect(storedConvA?.messages).toHaveLength(2);
      expect(storedConvA?.messages[1]?.content).toContain('conversación A');
    });
  });
});
