import '@testing-library/jest-dom';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useGenerationLifecycle } from '../assistant/hooks/use-generation-lifecycle';
import { MessageStatusIndicator } from '../assistant/components/message-status-indicator';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import { conversationApi } from '../assistant/api/conversation.api';
import { assistantApi } from '../assistant/api/assistant.api';
import {
  isValidGenerationTransition,
  generationStateReducer,
  INITIAL_GENERATION_STATE,
} from '../assistant/types/generation.types';
import type { RAGAnswerResponseDto } from '../assistant/types/assistant.types';

jest.mock('../assistant/api/conversation.api');
jest.mock('../assistant/api/assistant.api');

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
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/intelligence/chat/conv-er04-1']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return { queryClient, Wrapper };
}

describe('AI-09.8-ER.04 — Assistant Generation & Streaming Resilience Suite', () => {
  const tenantId = 'tenant_er04_clinic';
  const userId = 'user_er04_physio';
  const conversationId = 'conv-er04-1';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
    mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);
  });

  describe('1. Generation Lifecycle State Machine & Transition Invariants', () => {
    it('validates forward progression through UNKNOWN state without illegal transitions', () => {
      expect(isValidGenerationTransition('PENDING', 'UNKNOWN')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'UNKNOWN')).toBe(true);
      expect(isValidGenerationTransition('UNKNOWN', 'COMPLETED')).toBe(true);
      expect(isValidGenerationTransition('UNKNOWN', 'FAILED')).toBe(true);
      expect(isValidGenerationTransition('UNKNOWN', 'CANCELLED')).toBe(true);
      expect(isValidGenerationTransition('UNKNOWN', 'IDLE')).toBe(true);

      // Illegal transitions
      expect(isValidGenerationTransition('IDLE', 'UNKNOWN')).toBe(false);
      expect(isValidGenerationTransition('COMPLETED', 'UNKNOWN')).toBe(false);
      expect(isValidGenerationTransition('FAILED', 'UNKNOWN')).toBe(false);
    });

    it('reducer handles MARK_UNKNOWN event preserving active attempt and turn correlation', () => {
      let state = INITIAL_GENERATION_STATE;
      state = generationStateReducer(state, {
        type: 'SUBMIT',
        conversationId,
        turnId: 'turn-999',
        userMessageId: 'msg-u-1',
        assistantMessageId: 'msg-a-1',
        userPrompt: 'Protocolo manguito rotador',
      });
      expect(state.status).toBe('PENDING');
      expect(state.turnId).toBe('turn-999');

      state = generationStateReducer(state, {
        type: 'MARK_UNKNOWN',
        error: new Error('Client timeout reached'),
      });
      expect(state.status).toBe('UNKNOWN');
      expect(state.turnId).toBe('turn-999');
      expect(state.error?.message).toBe('Client timeout reached');
    });
  });

  describe('2. Loading & Truthful Generation Feedback', () => {
    it('renders dedicated submitting and retrieving indicators when observable', () => {
      const { rerender } = render(<MessageStatusIndicator status="submitting" />);
      expect(screen.getByTestId('message-submitting-state')).toHaveTextContent(
        'Enviando consulta al asistente...',
      );

      rerender(<MessageStatusIndicator status="retrieving" />);
      expect(screen.getByTestId('message-retrieving-state')).toHaveTextContent(
        'Consultando base de conocimiento clínica...',
      );

      rerender(<MessageStatusIndicator status="pending" />);
      expect(screen.getByTestId('message-pending-state')).toHaveTextContent(
        'Sintetizando respuesta fundamentada...',
      );
    });

    it('renders unknown outcome state with server reconciliation button', () => {
      const onReconcile = jest.fn();
      const onRetry = jest.fn();

      render(
        <MessageStatusIndicator
          status="unknown"
          error="Tiempo de espera del cliente agotado."
          onReconcile={onReconcile}
          onRetry={onRetry}
        />,
      );

      expect(screen.getByTestId('message-unknown-state')).toBeInTheDocument();
      expect(screen.getByText('Tiempo de espera del cliente agotado.')).toBeInTheDocument();

      const verifyBtn = screen.getByRole('button', { name: /verificar con servidor/i });
      fireEvent.click(verifyBtn);
      expect(onReconcile).toHaveBeenCalledTimes(1);

      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Partial Response Preservation & No Silently Discarded Content', () => {
    it('preserves accumulated partial content when generation is interrupted by unmount', () => {
      // Simulate existing conversation with in-flight message that accumulated partial content
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Test Thread',
        conversationId,
      );
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'msg-partial-1',
        role: 'assistant',
        content: 'Los ejercicios indicados son: 1. Movilización pasiva ',
        createdAt: new Date().toISOString(),
        status: 'generating',
      });

      const { Wrapper } = createTestWrapper();
      const { unmount } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId,
          }),
        { wrapper: Wrapper },
      );

      unmount();

      const updated = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const msg = updated?.messages.find((m) => m.id === 'msg-partial-1');
      expect(msg).toBeDefined();
      expect(msg?.status).toBe('generating');
      expect(msg?.content).toBe('Los ejercicios indicados son: 1. Movilización pasiva ');
    });

    it('preserves partial text when user cancels in-flight generation', async () => {
      mockedConvApi.reserveTurn.mockResolvedValue({
        turnId: 'turn-cancel-1',
        conversationId,
        clientTurnId: 'client-1',
        turnIndex: 1,
        userMessageId: 'user-msg-cancel-1',
        assistantAttemptId: 'asst-cancel-1',
        turnStatus: 'STREAMING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });
      mockedConvApi.cancelTurn.mockResolvedValue({
        turnId: 'turn-cancel-1',
        conversationId,
        turnStatus: 'CANCELLED',
        assistantMessageId: 'asst-cancel-1',
        isAlreadyCancelled: false,
        cancelledAt: new Date().toISOString(),
      });

      // Long-running query that will be cancelled
      mockedAsstApi.queryKnowledge.mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            setTimeout(() => reject(err), 50);
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

      // Submit message
      let submitError: unknown = null;
      act(() => {
        result.current.submitMessage({ prompt: 'Consulta de prueba' }).catch((err) => {
          submitError = err;
        });
      });

      // User hits cancel
      await act(async () => {
        await result.current.cancelGeneration(conversationId);
      });

      expect(submitError).toBeDefined();
      expect(result.current.state.status).toBe('CANCELLED');

      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg).toBeDefined();
      expect(asstMsg?.status).toBe('cancelled');
      // Content must NOT be corrupted to undefined or null
      expect(asstMsg?.content).toBeDefined();
    });
  });

  describe('4. Timeout Classification & Unknown Outcome Handling', () => {
    it('classifies client timeout as UNKNOWN outcome when backend turn was reserved and offers reconciliation', async () => {
      mockedConvApi.reserveTurn.mockResolvedValue({
        turnId: 'turn-timeout-1',
        conversationId,
        clientTurnId: 'client-timeout-1',
        turnIndex: 1,
        userMessageId: 'user-msg-timeout-1',
        assistantAttemptId: 'asst-timeout-1',
        turnStatus: 'STREAMING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      const clientTimeoutError = new Error('Client timeout reached');
      clientTimeoutError.name = 'TimeoutError';
      mockedAsstApi.queryKnowledge.mockRejectedValue(clientTimeoutError);

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

      await act(async () => {
        try {
          await result.current.submitMessage({ prompt: 'Consulta con timeout' });
        } catch {
          // Expected throw
        }
      });

      expect(result.current.state.status).toBe('UNKNOWN');
      expect(result.current.isUnknownOutcome).toBe(true);

      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg?.status).toBe('unknown');
      expect(asstMsg?.error).toContain('Tiempo de espera del cliente agotado');

      // Now verify reconciliation: backend actually finished the response
      mockedConvApi.getMessageHistory.mockResolvedValue({
        messages: [
          {
            id: 'msg-u-1',
            turnId: 'turn-timeout-1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Consulta con timeout',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          {
            id: 'asst-timeout-1',
            turnId: 'turn-timeout-1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Respuesta completada por el servidor mientras el cliente esperaba.',
            sources: [],
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      let reconciled = false;
      await act(async () => {
        reconciled = await result.current.reconcileGeneration(conversationId);
      });

      expect(reconciled).toBe(true);
      expect(result.current.state.status).toBe('COMPLETED');

      const reconciledConv = assistantStorageService.getConversation(
        tenantId,
        userId,
        conversationId,
      );
      const reconciledMsg = reconciledConv?.messages.find(
        (m) => m.role === 'assistant' || m.id === 'asst-timeout-1',
      );
      expect(reconciledMsg?.status).toBe('success');
      expect(reconciledMsg?.content).toBe(
        'Respuesta completada por el servidor mientras el cliente esperaba.',
      );
    });

    it('distinguishes provider 504 gateway timeout as INTERRUPTED', async () => {
      mockedConvApi.reserveTurn.mockResolvedValue({
        turnId: 'turn-504-1',
        conversationId,
        clientTurnId: 'client-504',
        turnIndex: 1,
        userMessageId: 'user-msg-504',
        assistantAttemptId: 'asst-504',
        turnStatus: 'STREAMING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      const gatewayTimeoutError = Object.assign(new Error('Gateway Timeout'), {
        statusCode: 504,
        code: 'PROVIDER_TIMEOUT',
      });
      mockedAsstApi.queryKnowledge.mockRejectedValue(gatewayTimeoutError);

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

      await act(async () => {
        try {
          await result.current.submitMessage({ prompt: 'Consulta pesada' });
        } catch {
          // Expected throw
        }
      });

      expect(result.current.state.status).toBe('INTERRUPTED');
      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg?.status).toBe('interrupted');
      expect(asstMsg?.error).toContain('Tiempo de espera agotado en la pasarela de inferencia');
    });
  });

  describe('5. Provider & Retrieval Failure Handling (No Silent Fallback)', () => {
    it('propagates retrieval failure as explicit FAILED status without empty hallucinations', async () => {
      mockedConvApi.reserveTurn.mockResolvedValue({
        turnId: 'turn-ret-fail',
        conversationId,
        clientTurnId: 'client-ret-fail',
        turnIndex: 1,
        userMessageId: 'user-msg-ret-fail',
        assistantAttemptId: 'asst-ret-fail',
        turnStatus: 'STREAMING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      const retrievalError = Object.assign(new Error('Retrieval index unavailable'), {
        statusCode: 500,
        code: 'RETRIEVAL_FAILED',
      });
      mockedAsstApi.queryKnowledge.mockRejectedValue(retrievalError);

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

      await act(async () => {
        try {
          await result.current.submitMessage({ prompt: 'Consulta fallo recuperación' });
        } catch {
          // Expected throw
        }
      });

      expect(result.current.state.status).toBe('FAILED');
      const conv = assistantStorageService.getConversation(tenantId, userId, conversationId);
      const asstMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(asstMsg?.status).toBe('error');
      // Never attach groundings or false source citations
      expect(asstMsg?.sources).toBeUndefined();
      expect(asstMsg?.grounded).toBeUndefined();
    });

    it('handles 503 provider unavailable gracefully without freezing loading indicators', async () => {
      mockedConvApi.reserveTurn.mockResolvedValue({
        turnId: 'turn-503',
        conversationId,
        clientTurnId: 'client-503',
        turnIndex: 1,
        userMessageId: 'user-msg-503',
        assistantAttemptId: 'asst-503',
        turnStatus: 'STREAMING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      const providerError = Object.assign(new Error('LLM provider offline'), {
        statusCode: 503,
        code: 'PROVIDER_UNAVAILABLE',
      });
      mockedAsstApi.queryKnowledge.mockRejectedValue(providerError);

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

      await act(async () => {
        try {
          await result.current.submitMessage({ prompt: 'Consulta 503' });
        } catch {
          // Expected throw
        }
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.state.status).toBe('FAILED');
    });
  });

  describe('6. Stale Response Protection & Thread Switch Isolation', () => {
    it('ignores or isolates completed response if user switched active conversation during generation', async () => {
      let resolveQuery: (res: RAGAnswerResponseDto) => void;
      mockedAsstApi.queryKnowledge.mockReturnValue(
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
      );

      const { Wrapper } = createTestWrapper();
      const { result, rerender } = renderHook(
        (props: { convId: string }) =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: props.convId,
          }),
        {
          wrapper: Wrapper,
          initialProps: { convId: 'conv-thread-A' },
        },
      );

      // Submit in thread A
      act(() => {
        void result.current.submitMessage({ prompt: 'Pregunta en Hilo A' });
      });

      expect(result.current.state.conversationId).toBe('conv-thread-A');

      // User switches to thread B before query resolves
      rerender({ convId: 'conv-thread-B' });

      // Late response arrives for thread A
      await act(async () => {
        resolveQuery!({
          answer: 'Respuesta para Hilo A',
          grounded: true,
          sources: [],
          metadata: { model: 'qwen', retrievalCount: 1, latencyMs: 200 },
        });
      });

      // Storage for Thread A receives the answer safely
      const convA = assistantStorageService.getConversation(tenantId, userId, 'conv-thread-A');
      const msgA = convA?.messages.find((m) => m.role === 'assistant');
      expect(msgA?.content).toBe('Respuesta para Hilo A');

      // Thread B is untouched and not corrupted with Thread A content
      const convB = assistantStorageService.getConversation(tenantId, userId, 'conv-thread-B');
      expect(convB).toBeNull();
    });
  });
});
