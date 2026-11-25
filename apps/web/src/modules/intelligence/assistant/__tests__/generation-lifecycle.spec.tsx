import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  isValidGenerationTransition,
  generationStateReducer,
  INITIAL_GENERATION_STATE,
} from '../types/generation.types';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/conversation.api', () => ({
  conversationApi: {
    createConversation: jest
      .fn()
      .mockImplementation(async ({ clientTurnId, userPrompt, title }) => ({
        conversationId: `conv_${Date.now()}`,
        turnId: `turn_${Date.now()}`,
        clientTurnId,
        turnIndex: 1,
        userMessageId: `msg_u_${Date.now()}`,
        assistantAttemptId: `msg_a_${Date.now()}`,
        title: title || userPrompt.slice(0, 45),
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      })),
    reserveTurn: jest.fn().mockImplementation(async (conversationId, { clientTurnId }) => ({
      conversationId,
      turnId: `turn_${Date.now()}`,
      clientTurnId,
      turnIndex: 2,
      userMessageId: `msg_u_${Date.now()}`,
      assistantAttemptId: `msg_a_${Date.now()}`,
      turnStatus: 'PENDING',
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: new Date().toISOString(),
    })),
    cancelTurn: jest.fn().mockResolvedValue({}),
  },
}));

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

describe('Message Submission & Generation Lifecycle (AI-09.2.04)', () => {
  const tenantId = 'tenant_test';
  const userId = 'usr_test_1';

  beforeEach(() => {
    assistantStorageService.clearConversations(tenantId, userId);
    jest.clearAllMocks();
  });

  describe('1. State Machine Validity & Transition Rules', () => {
    it('accepts valid state transitions', () => {
      expect(isValidGenerationTransition('IDLE', 'PENDING')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'COMPLETED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'FAILED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'INTERRUPTED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'STREAMING')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'COMPLETED')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'INTERRUPTED')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'CANCELLED')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'FAILED')).toBe(true);
      expect(isValidGenerationTransition('COMPLETED', 'IDLE')).toBe(true);
      expect(isValidGenerationTransition('FAILED', 'IDLE')).toBe(true);
      expect(isValidGenerationTransition('CANCELLED', 'IDLE')).toBe(true);
      expect(isValidGenerationTransition('INTERRUPTED', 'IDLE')).toBe(true);
    });

    it('rejects invalid or premature state transitions', () => {
      expect(isValidGenerationTransition('IDLE', 'COMPLETED')).toBe(false);
      expect(isValidGenerationTransition('IDLE', 'STREAMING')).toBe(false);
      expect(isValidGenerationTransition('COMPLETED', 'STREAMING')).toBe(false);
      expect(isValidGenerationTransition('FAILED', 'STREAMING')).toBe(false);
      expect(isValidGenerationTransition('CANCELLED', 'COMPLETED')).toBe(false);
    });

    it('governs state mutations through pure reducer without silent overwrites', () => {
      let state = INITIAL_GENERATION_STATE;
      expect(state.status).toBe('IDLE');

      // Illegal transition should not mutate state
      state = generationStateReducer(state, { type: 'COMPLETE' });
      expect(state.status).toBe('IDLE');

      // Valid transition to PENDING
      state = generationStateReducer(state, {
        type: 'SUBMIT',
        conversationId: 'c1',
        userMessageId: 'u1',
        assistantMessageId: 'a1',
      });
      expect(state.status).toBe('PENDING');
      expect(state.conversationId).toBe('c1');
      expect(state.userMessageId).toBe('u1');

      // Transition to COMPLETED
      state = generationStateReducer(state, { type: 'COMPLETE' });
      expect(state.status).toBe('COMPLETED');
      expect(state.completedAt).toBeDefined();

      // Reset back to IDLE
      state = generationStateReducer(state, { type: 'RESET' });
      expect(state).toEqual(INITIAL_GENERATION_STATE);
    });
  });

  describe('2. Message Submission Lifecycle & Reconciliation', () => {
    it('executes successful prompt submission and reconciles authoritative server state', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Test Conversation',
      );
      const mockResponse: RAGAnswerResponseDto = {
        answer: 'Respuesta clínica oficial fundamentada.',
        grounded: true,
        sources: [
          {
            documentId: 'doc_1',
            documentTitle: 'Guía Clínica',
            chunkId: 'chk_1',
            pageNumber: 5,
            relevanceScore: 0.95,
          },
        ],
        metadata: {
          model: 'claude-3-5-sonnet',
          retrievalCount: 1,
          latencyMs: 180,
        },
      };

      jest.spyOn(assistantApi, 'queryKnowledge').mockResolvedValueOnce(mockResponse);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.state.status).toBe('IDLE');

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submitMessage({
          prompt: '¿Cuáles son los ejercicios indicados?',
        });
      });

      // While in-flight: pending state
      expect(result.current.isGenerating).toBe(true);
      expect(result.current.isPending).toBe(true);
      expect(result.current.state.status).toBe('PENDING');

      // Wait for completion
      await act(async () => {
        await submitPromise;
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.state.status).toBe('COMPLETED');

      // Verify persisted turns in storage
      const stored = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(stored?.messages).toHaveLength(2);

      const userMsg = stored?.messages[0];
      const asstMsg = stored?.messages[1];
      expect(userMsg?.role).toBe('user');
      expect(userMsg?.content).toBe('¿Cuáles son los ejercicios indicados?');
      expect(asstMsg?.role).toBe('assistant');
      expect(asstMsg?.content).toBe('Respuesta clínica oficial fundamentada.');
      expect(asstMsg?.status).toBe('success');
      expect(asstMsg?.grounded).toBe(true);
      expect(asstMsg?.sources).toHaveLength(1);
    });

    it('auto-provisions a new conversation when submitting from an uninitialized session', async () => {
      const onConversationCreated = jest.fn();
      const mockResponse: RAGAnswerResponseDto = {
        answer: 'Sesión iniciada correctamente.',
        grounded: false,
        sources: [],
        metadata: {
          model: 'mistral:latest',
          retrievalCount: 0,
          latencyMs: 120,
        },
      };

      jest.spyOn(assistantApi, 'queryKnowledge').mockResolvedValueOnce(mockResponse);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: undefined,
            onConversationCreated,
          }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.submitMessage({
          prompt: 'Nueva consulta sobre protocolos clínicos',
        });
      });

      expect(onConversationCreated).toHaveBeenCalledTimes(1);
      const newId = onConversationCreated.mock.calls[0][0];
      expect(typeof newId).toBe('string');

      const saved = assistantStorageService.getConversation(tenantId, userId, newId);
      expect(saved).toBeDefined();
      expect(saved?.messages).toHaveLength(2);
    });
  });

  describe('3. Duplicate Submission Prevention (Mutex Lock)', () => {
    it('blocks rapid duplicate submissions while a request is in flight', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Mutex Test');

      let resolveQuery: (res: RAGAnswerResponseDto) => void;
      const delayedPromise = new Promise<RAGAnswerResponseDto>((resolve) => {
        resolveQuery = resolve;
      });

      const queryKnowledgeSpy = jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockReturnValueOnce(delayedPromise);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      // First submit
      let firstPromise: Promise<void>;
      act(() => {
        firstPromise = result.current.submitMessage({ prompt: 'Primera consulta' });
      });

      // Second immediate submit (must be discarded by mutex)
      let secondPromise: Promise<void>;
      act(() => {
        secondPromise = result.current.submitMessage({ prompt: 'Segunda consulta duplicada' });
      });

      await waitFor(() => {
        expect(queryKnowledgeSpy).toHaveBeenCalledTimes(1);
      });

      // Resolve first query
      await act(async () => {
        resolveQuery!({
          answer: 'Respuesta única.',
          grounded: true,
          sources: [],
          metadata: { model: 'mistral:latest', retrievalCount: 0, latencyMs: 100 },
        });
        await firstPromise;
        await secondPromise;
      });

      const stored = assistantStorageService.getConversation(tenantId, userId, conv.id);
      // Only 2 messages (1 user, 1 assistant)
      expect(stored?.messages).toHaveLength(2);
      expect(stored?.messages[0]?.content).toBe('Primera consulta');
    });
  });

  describe('4. Draft Validation & Error Handling with Draft Preservation', () => {
    it('rejects prompts with length below minimum character limit', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Val Test');
      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await expect(result.current.submitMessage({ prompt: 'ab' })).rejects.toThrow(
          /entre 3 y 1000 caracteres/i,
        );
      });

      expect(result.current.state.status).toBe('IDLE');
    });

    it('preserves user draft by re-throwing backend API failures and reconciles error turn', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Error Test');

      jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockRejectedValueOnce(new Error('Fallo del servicio de inferencia local'));

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      let caughtError: Error | null = null;
      await act(async () => {
        try {
          await result.current.submitMessage({
            prompt: 'Pregunta que fallará en backend',
          });
        } catch (err: unknown) {
          caughtError = err as Error;
        }
      });

      expect(caughtError).not.toBeNull();
      expect((caughtError as unknown as Error).message).toBe(
        'Fallo del servicio de inferencia local',
      );
      expect(result.current.state.status).toBe('FAILED');

      // Verify the failed assistant turn is persisted in storage with status='error'
      const stored = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(stored?.messages).toHaveLength(2);
      const asstMsg = stored?.messages[1];
      expect(asstMsg?.status).toBe('error');
      expect(asstMsg?.error).toBe('Fallo del servicio de inferencia local');
    });
  });

  describe('5. Cancellation Support via AbortController', () => {
    it('aborts active generation when cancelGeneration is invoked', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Cancel Test');

      jest.spyOn(assistantApi, 'queryKnowledge').mockImplementationOnce((_req, signal) => {
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
            return;
          }
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      });

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submitMessage({
          prompt: 'Consulta que será cancelada',
        });
      });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(assistantApi.queryKnowledge).toHaveBeenCalled();
      });

      // Trigger user cancel
      act(() => {
        result.current.cancelGeneration();
      });

      expect(result.current.state.status).toBe('CANCELLED');
      expect(result.current.isGenerating).toBe(false);

      await act(async () => {
        try {
          await submitPromise;
        } catch {
          // Expected AbortError
        }
      });

      const stored = assistantStorageService.getConversation(tenantId, userId, conv.id);
      const asstMsg = stored?.messages[1];
      expect(asstMsg?.status).toBe('cancelled');
      expect(asstMsg?.error).toContain('Generación detenida en el cliente');
    });
  });

  describe('6. Stale Response Protection & Context Building', () => {
    it('constructs multi-turn conversation history omitting pending placeholder', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Context Test');
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'prev-u',
        role: 'user',
        content: 'Turno previo 1',
        createdAt: '2026-11-21T09:00:00Z',
        status: 'success',
      });
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'prev-a',
        role: 'assistant',
        content: 'Respuesta previa 1',
        createdAt: '2026-11-21T09:00:05Z',
        status: 'success',
      });

      const querySpy = jest.spyOn(assistantApi, 'queryKnowledge').mockResolvedValueOnce({
        answer: 'Respuesta turno 2',
        grounded: true,
        sources: [],
        metadata: { model: 'mistral:latest', retrievalCount: 1, latencyMs: 150 },
      });

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.submitMessage({ prompt: 'Turno nuevo 2' });
      });

      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Turno nuevo 2',
          conversationHistory: [
            { role: 'user', content: 'Turno previo 1' },
            { role: 'assistant', content: 'Respuesta previa 1' },
            { role: 'user', content: 'Turno nuevo 2' },
          ],
        }),
        expect.any(AbortSignal),
      );
    });
  });
});
