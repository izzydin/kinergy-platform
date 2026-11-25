import '@testing-library/jest-dom';
import { screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { renderWithProviders } from '../../../../test/test-utils';
import {
  isValidGenerationTransition,
  generationStateReducer,
  INITIAL_GENERATION_STATE,
} from '../types/generation.types';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { MessageStatusIndicator } from '../components/message-status-indicator';
import { ChatComposer } from '../components/chat-composer';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api');
jest.mock('../services/assistant-storage.service');

const mockedConvApi = jest.mocked(conversationApi);
const mockedAsstApi = jest.mocked(assistantApi);
const mockedStorage = jest.mocked(assistantStorageService);

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

describe('AI-09.5 - FB.06: Generation Lifecycle, Indicators & Cancellation Suite', () => {
  const tenantId = 'tenant_fb06_test';
  const userId = 'user_fb06_doc';
  const conversationId = 'conv_fb06_001';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);
  });

  describe('1. Explicit Generation State Model & Transitions', () => {
    it('enforces valid forward progression and valid cancellation transitions', () => {
      // Valid transitions
      expect(isValidGenerationTransition('IDLE', 'PENDING')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'STREAMING')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'COMPLETED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'CANCELLING')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'CANCELLING')).toBe(true);
      expect(isValidGenerationTransition('CANCELLING', 'CANCELLED')).toBe(true);
      expect(isValidGenerationTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(isValidGenerationTransition('STREAMING', 'FAILED')).toBe(true);
      expect(isValidGenerationTransition('COMPLETED', 'IDLE')).toBe(true);
      expect(isValidGenerationTransition('FAILED', 'IDLE')).toBe(true);
      expect(isValidGenerationTransition('CANCELLED', 'IDLE')).toBe(true);

      // Invalid transitions
      expect(isValidGenerationTransition('IDLE', 'STREAMING')).toBe(false);
      expect(isValidGenerationTransition('IDLE', 'COMPLETED')).toBe(false);
      expect(isValidGenerationTransition('IDLE', 'CANCELLED')).toBe(false);
      expect(isValidGenerationTransition('COMPLETED', 'STREAMING')).toBe(false);
      expect(isValidGenerationTransition('FAILED', 'COMPLETED')).toBe(false);
    });

    it('manages reducer state transitions including CANCELLING and turnId tracking', () => {
      let state = INITIAL_GENERATION_STATE;
      expect(state.status).toBe('IDLE');
      expect(state.turnId).toBeNull();

      // Submit
      state = generationStateReducer(state, {
        type: 'SUBMIT',
        conversationId,
        userMessageId: 'msg_u_1',
        assistantMessageId: 'msg_a_1',
        userPrompt: 'Protocolo de hombro',
      });
      expect(state.status).toBe('PENDING');
      expect(state.conversationId).toBe(conversationId);

      // Set turn ID
      state = generationStateReducer(state, {
        type: 'SET_TURN_ID',
        turnId: 'turn_backend_100',
      });
      expect(state.turnId).toBe('turn_backend_100');

      // Start cancel
      state = generationStateReducer(state, { type: 'START_CANCEL' });
      expect(state.status).toBe('CANCELLING');

      // Cancel completed
      state = generationStateReducer(state, { type: 'CANCEL' });
      expect(state.status).toBe('CANCELLED');
      expect(state.completedAt).not.toBeNull();
    });
  });

  describe('2. Visual Generation & Cancellation Indicators with Reduced-Motion Support', () => {
    it('renders pending indicator with accessible status and motion-safe animation classes', () => {
      const { container } = renderWithProviders(<MessageStatusIndicator status="pending" />);
      const indicator = screen.getByTestId('message-pending-state');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute('role', 'status');
      expect(screen.getByText(/Sintetizando respuesta fundamentada/i)).toBeInTheDocument();

      // Verify motion-safe classes are applied
      const animatedIcon = container.querySelector('.motion-safe\\:animate-spin');
      expect(animatedIcon).toBeInTheDocument();
    });

    it('renders generating indicator with motion-safe classes', () => {
      const { container } = renderWithProviders(<MessageStatusIndicator status="generating" />);
      const indicator = screen.getByTestId('message-generating-state');
      expect(indicator).toBeInTheDocument();
      expect(screen.getByText(/Generando respuesta/i)).toBeInTheDocument();

      const animatedIcon = container.querySelector('.motion-safe\\:animate-spin');
      expect(animatedIcon).toBeInTheDocument();
    });

    it('renders cancelling indicator with amber visual cue and motion-safe spin', () => {
      const { container } = renderWithProviders(<MessageStatusIndicator status="cancelling" />);
      const indicator = screen.getByTestId('message-cancelling-state');
      expect(indicator).toBeInTheDocument();
      expect(screen.getByText(/Deteniendo generación/i)).toBeInTheDocument();

      const animatedIcon = container.querySelector('.motion-safe\\:animate-spin');
      expect(animatedIcon).toBeInTheDocument();
    });

    it('renders cancelled indicator with explanatory note and retry button', () => {
      const onRetryMock = jest.fn();
      renderWithProviders(
        <MessageStatusIndicator
          status="cancelled"
          error="Generación detenida en el cliente."
          onRetry={onRetryMock}
        />,
      );

      expect(screen.getByTestId('message-cancelled-state')).toBeInTheDocument();
      expect(screen.getByText(/Generación detenida en el cliente/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('renders interrupted indicator distinct from cancellation (network error)', () => {
      renderWithProviders(
        <MessageStatusIndicator
          status="interrupted"
          error="Conexión de red interrumpida antes de recibir respuesta."
        />,
      );

      expect(screen.getByTestId('message-interrupted-state')).toBeInTheDocument();
      expect(screen.getByText(/Conexión de red interrumpida/i)).toBeInTheDocument();
    });
  });

  describe('3. ChatComposer Stop Generating Controls & Concurrency Protection', () => {
    it('displays stop generating button while request is in-flight and fires onCancel', () => {
      const onCancelMock = jest.fn();
      const onSendMock = jest.fn();

      renderWithProviders(
        <ChatComposer
          onSend={onSendMock}
          onCancel={onCancelMock}
          isSubmitting={true}
          isCancelling={false}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /Detener generación de respuesta/i });
      expect(stopBtn).toBeInTheDocument();
      expect(stopBtn).not.toBeDisabled();

      fireEvent.click(stopBtn);
      expect(onCancelMock).toHaveBeenCalledTimes(1);
      expect(onSendMock).not.toHaveBeenCalled();
    });

    it('disables stop button and displays spinning indicator while cancellation is processing (isCancelling)', () => {
      const onCancelMock = jest.fn();

      renderWithProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={onCancelMock}
          isSubmitting={true}
          isCancelling={true}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /Deteniendo generación de respuesta/i });
      expect(stopBtn).toBeInTheDocument();
      expect(stopBtn).toBeDisabled();

      fireEvent.click(stopBtn);
      expect(onCancelMock).not.toHaveBeenCalled();
    });

    it('aborts active generation when user presses Escape key in textarea', () => {
      const onCancelMock = jest.fn();

      renderWithProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={onCancelMock}
          isSubmitting={true}
          isCancelling={false}
        />,
      );

      const textarea = screen.getByLabelText(/Escribe tu consulta/i);
      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });

    it('ignores Escape key when already cancelling to prevent duplicate calls', () => {
      const onCancelMock = jest.fn();

      renderWithProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={onCancelMock}
          isSubmitting={true}
          isCancelling={true}
        />,
      );

      const textarea = screen.getByLabelText(/Escribe tu consulta/i);
      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(onCancelMock).not.toHaveBeenCalled();
    });
  });

  describe('4. Backend Cancellation Propagation & Lifecycle Synchronization', () => {
    it('propagates cancellation to backend API and updates local storage truthfully', async () => {
      const initialConv = {
        id: conversationId,
        title: 'Tratamiento Lumbar',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [],
      };

      mockedStorage.getConversation.mockReturnValue(initialConv);
      mockedStorage.appendMessage.mockReturnValue(initialConv);
      mockedStorage.updateMessage.mockReturnValue(initialConv);
      mockedConvApi.reserveTurn.mockResolvedValueOnce({
        conversationId,
        turnId: 'turn_backend_55',
        clientTurnId: 'turn_client_55',
        turnIndex: 1,
        userMessageId: 'msg_u_55',
        assistantAttemptId: 'msg_asst_55',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });
      mockedConvApi.cancelTurn.mockResolvedValueOnce({
        conversationId,
        turnId: 'turn_backend_55',
        turnStatus: 'CANCELLED',
        assistantMessageId: 'msg_asst_55',
        isAlreadyCancelled: false,
        cancelledAt: new Date().toISOString(),
      });

      // Knowledge query that hangs until aborted
      mockedAsstApi.queryKnowledge.mockImplementationOnce((_req, signal) => {
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

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
            prompt: 'Consulta de columna lumbar',
          })
          .catch(() => {});
      });

      expect(result.current.isGenerating).toBe(true);

      await waitFor(() => {
        expect(mockedConvApi.reserveTurn).toHaveBeenCalled();
        expect(result.current.state.turnId).toBe('turn_backend_55');
      });

      // Trigger user cancellation
      await act(async () => {
        await result.current.cancelGeneration(conversationId);
      });

      // Assert backend API was notified with turnId
      expect(mockedConvApi.cancelTurn).toHaveBeenCalledWith(
        conversationId,
        'turn_backend_55',
        expect.objectContaining({
          reason: expect.any(String),
        }),
      );

      // Verify lifecycle FSM transitioned to CANCELLED
      expect(result.current.state.status).toBe('CANCELLED');
      expect(result.current.isGenerating).toBe(false);

      // Verify storage was updated with cancelled status
      expect(mockedStorage.updateMessage).toHaveBeenCalledWith(
        tenantId,
        userId,
        conversationId,
        expect.any(String),
        expect.objectContaining({
          status: 'cancelled',
        }),
      );

      await act(async () => {
        try {
          await submitPromise;
        } catch {
          // Expected aborted rejection
        }
      });
    });

    it('safely handles unmount during in-flight generation by marking interrupted in storage', () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationId,
        title: 'Tratamiento',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [],
      });

      mockedAsstApi.queryKnowledge.mockImplementationOnce(() => new Promise(() => {}));

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
        void result.current
          .submitMessage({
            prompt: 'Consulta que se desmontará',
          })
          .catch(() => {});
      });

      expect(result.current.isGenerating).toBe(true);

      // Unmount component (e.g. user navigates away or closes tab)
      unmount();

      // Verify unmount effect marks message as interrupted
      expect(mockedStorage.updateMessage).toHaveBeenCalledWith(
        tenantId,
        userId,
        conversationId,
        expect.any(String),
        expect.objectContaining({
          status: 'interrupted',
          error: expect.stringContaining('desmontaje de componente o navegación'),
        }),
      );
    });
  });
});
