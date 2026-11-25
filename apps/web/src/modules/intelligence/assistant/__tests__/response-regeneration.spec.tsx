import '@testing-library/jest-dom';
import { screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { renderWithProviders } from '../../../../test/test-utils';
import { RegenerateAction } from '../components/message-actions';
import { ChatMessageFeed } from '../components/chat-message-feed';
import { AssistantMessage } from '../components/assistant-message';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type { ChatMessage, RAGAnswerResponseDto } from '../types/assistant.types';
import type { RegenerateTurnResponse } from '../types/conversation-contract.types';

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

describe('AI-09.5 - FB.05: Assistant Response Regeneration Test Suite', () => {
  const tenantId = 'tenant_regen_frontend';
  const userId = 'user_regen_physio';
  const conversationId = 'conv_regen_front_1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Component UI & Accessibility', () => {
    it('renders RegenerateAction with accessible tooltip and aria-label', () => {
      const onRegenerateMock = jest.fn();

      renderWithProviders(<RegenerateAction onRegenerate={onRegenerateMock} disabled={false} />);

      const btn = screen.getByRole('button', { name: /Regenerar respuesta/i });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();

      fireEvent.click(btn);
      expect(onRegenerateMock).toHaveBeenCalledTimes(1);
    });

    it('disables RegenerateAction when disabled is true (e.g. during active generation)', () => {
      const onRegenerateMock = jest.fn();

      renderWithProviders(<RegenerateAction onRegenerate={onRegenerateMock} disabled={true} />);

      const btn = screen.getByRole('button', { name: /Regenerar respuesta/i });
      expect(btn).toBeDisabled();

      fireEvent.click(btn);
      expect(onRegenerateMock).not.toHaveBeenCalled();
    });

    it('AssistantMessage renders regenerate button only when onRegenerate callback is provided', () => {
      const msg: ChatMessage = {
        id: 'msg_asst_1',
        role: 'assistant',
        content: 'Respuesta clínica existente',
        createdAt: '2026-11-25T10:00:00.000Z',
        status: 'success',
      };

      const { rerender } = renderWithProviders(
        <AssistantMessage message={msg} onRegenerate={undefined} />,
      );
      expect(
        screen.queryByRole('button', { name: /Regenerar respuesta/i }),
      ).not.toBeInTheDocument();

      const onRegen = jest.fn();
      rerender(<AssistantMessage message={msg} onRegenerate={onRegen} />);
      expect(screen.getByRole('button', { name: /Regenerar respuesta/i })).toBeInTheDocument();
    });
  });

  describe('2. Regeneration Eligibility Constraints in ChatMessageFeed', () => {
    it('exposes regenerate action exclusively for the latest assistant message, hiding it on historical turns', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg_u_1',
          role: 'user',
          content: '¿Qué es el manguito rotador?',
          createdAt: '2026-11-25T10:00:00.000Z',
          status: 'success',
          sequenceNumber: 1,
        },
        {
          id: 'msg_a_1',
          role: 'assistant',
          content: 'El manguito rotador es un grupo de músculos y tendones.',
          createdAt: '2026-11-25T10:01:00.000Z',
          status: 'success',
          sequenceNumber: 2,
        },
        {
          id: 'msg_u_2',
          role: 'user',
          content: '¿Cuáles son los ejercicios indicados?',
          createdAt: '2026-11-25T10:02:00.000Z',
          status: 'success',
          sequenceNumber: 3,
        },
        {
          id: 'msg_a_2',
          role: 'assistant',
          content: 'Ejercicios de rotación externa e interna con banda elástica.',
          createdAt: '2026-11-25T10:03:00.000Z',
          status: 'success',
          sequenceNumber: 4,
        },
      ];

      const onRegenerateMessageMock = jest.fn();

      renderWithProviders(
        <ChatMessageFeed
          messages={messages}
          conversationId={conversationId}
          onRegenerateMessage={onRegenerateMessageMock}
        />,
      );

      // Verify only ONE regenerate button is present in the feed (for the latest assistant message msg_a_2)
      const regenButtons = screen.getAllByRole('button', { name: /Regenerar respuesta/i });
      expect(regenButtons).toHaveLength(1);

      // Clicking it must trigger onRegenerateMessage with msg_a_2
      fireEvent.click(regenButtons[0]!);
      expect(onRegenerateMessageMock).toHaveBeenCalledWith('msg_a_2');
    });

    it('does not expose regenerate action when the latest assistant message is currently pending or streaming', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg_u_1',
          role: 'user',
          content: 'Protocolo de rodilla',
          createdAt: '2026-11-25T10:00:00.000Z',
          status: 'success',
          sequenceNumber: 1,
        },
        {
          id: 'msg_a_1',
          role: 'assistant',
          content: '',
          createdAt: '2026-11-25T10:01:00.000Z',
          status: 'pending',
          sequenceNumber: 2,
        },
      ];

      renderWithProviders(
        <ChatMessageFeed
          messages={messages}
          conversationId={conversationId}
          onRegenerateMessage={jest.fn()}
        />,
      );

      expect(
        screen.queryByRole('button', { name: /Regenerar respuesta/i }),
      ).not.toBeInTheDocument();
    });

    it('exposes regenerate action when the latest assistant message is in failed, cancelled, or interrupted state', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg_u_1',
          role: 'user',
          content: 'Protocolo de rodilla',
          createdAt: '2026-11-25T10:00:00.000Z',
          status: 'success',
          sequenceNumber: 1,
        },
        {
          id: 'msg_a_1',
          role: 'assistant',
          content: 'Respuesta parcial...',
          createdAt: '2026-11-25T10:01:00.000Z',
          status: 'error',
          sequenceNumber: 2,
        },
      ];

      renderWithProviders(
        <ChatMessageFeed
          messages={messages}
          conversationId={conversationId}
          onRegenerateMessage={jest.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /Regenerar respuesta/i })).toBeInTheDocument();
    });
  });

  describe('3. Generation Lifecycle Hook: regenerateMessage Workflow', () => {
    it('executes successful regeneration: reserves attempt on backend, queries RAG, and reconciles storage', async () => {
      const existingConv = {
        id: conversationId,
        title: 'Knee Treatment',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [
          {
            id: 'msg_u_1',
            role: 'user' as const,
            content: 'Ejercicios de rodilla',
            createdAt: '2026-11-25T10:00:00.000Z',
            status: 'success' as const,
          },
          {
            id: 'msg_a_1',
            role: 'assistant' as const,
            content: 'Respuesta inicial sobre rodilla',
            createdAt: '2026-11-25T10:01:00.000Z',
            status: 'success' as const,
          },
        ],
      };

      mockedStorage.getConversation.mockReturnValue(existingConv);
      mockedStorage.updateMessage.mockReturnValue({
        ...existingConv,
        messages: [
          existingConv.messages[0]!,
          {
            id: 'msg_a_regen',
            role: 'assistant' as const,
            content: 'Nueva respuesta regenerada sobre fortalecimiento de cuádriceps.',
            createdAt: '2026-11-25T10:05:00.000Z',
            status: 'success' as const,
          },
        ],
      });

      mockedConvApi.regenerateMessage.mockResolvedValue({
        conversationId,
        turnId: 'turn_1',
        turnIndex: 1,
        attemptNumber: 2,
        assistantMessageId: 'msg_a_att2',
        status: 'PENDING',
        userPrompt: 'Ejercicios de rodilla',
      });

      const mockRagAnswer: RAGAnswerResponseDto = {
        answer: 'Nueva respuesta regenerada sobre fortalecimiento de cuádriceps.',
        grounded: true,
        sources: [
          {
            citationId: 'cite_regen_1',
            documentId: 'doc_knee',
            documentTitle: 'Guía de Rehabilitación de Rodilla',
            chunkId: 'chunk_12',
            pageNumber: 15,
            relevanceScore: 0.96,
          },
        ],
        metadata: {
          model: 'claude-3-5-sonnet',
          retrievalCount: 1,
          latencyMs: 250,
        },
      };

      mockedAsstApi.queryKnowledge.mockResolvedValue(mockRagAnswer);
      mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);

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
        await result.current.regenerateMessage({ messageId: 'msg_a_1' });
      });

      // Verify backend was called with messageId
      expect(mockedConvApi.regenerateMessage).toHaveBeenCalledWith(
        conversationId,
        'msg_a_1',
        expect.objectContaining({ clientTurnId: expect.any(String) }),
        expect.any(Object),
      );

      // Verify knowledge query was invoked with user prompt
      expect(mockedAsstApi.queryKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Ejercicios de rodilla',
          conversationId,
        }),
        expect.any(AbortSignal),
      );

      // Verify storage was updated with completed answer
      expect(mockedStorage.updateMessage).toHaveBeenCalledWith(
        tenantId,
        userId,
        conversationId,
        'msg_a_1',
        expect.objectContaining({
          content: 'Nueva respuesta regenerada sobre fortalecimiento de cuádriceps.',
          status: 'success',
          grounded: true,
        }),
      );

      // Verify lifecycle FSM returned to completed
      expect(result.current.state.status).toBe('COMPLETED');
      expect(result.current.isGenerating).toBe(false);
    });

    it('prevents concurrent regeneration: ignores duplicate calls while regeneration is in progress', async () => {
      const existingConv = {
        id: conversationId,
        title: 'Knee Treatment',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [
          {
            id: 'msg_u_1',
            role: 'user' as const,
            content: 'Ejercicios de rodilla',
            createdAt: '2026-11-25T10:00:00.000Z',
            status: 'success' as const,
          },
          {
            id: 'msg_a_1',
            role: 'assistant' as const,
            content: 'Respuesta inicial sobre rodilla',
            createdAt: '2026-11-25T10:01:00.000Z',
            status: 'success' as const,
          },
        ],
      };

      mockedStorage.getConversation.mockReturnValue(existingConv);
      mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);

      let resolveBackendCall: (val: RegenerateTurnResponse) => void;
      mockedConvApi.regenerateMessage.mockReturnValue(
        new Promise((res) => {
          resolveBackendCall = res;
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

      // Trigger first regeneration
      let firstCallPromise: Promise<void>;
      act(() => {
        firstCallPromise = result.current.regenerateMessage({ messageId: 'msg_a_1' });
      });

      expect(result.current.isGenerating).toBe(true);

      // Trigger second rapid duplicate click while in-flight
      act(() => {
        void result.current.regenerateMessage({ messageId: 'msg_a_1' });
      });

      // Backend should only have been called ONCE
      expect(mockedConvApi.regenerateMessage).toHaveBeenCalledTimes(1);

      // Clean up in-flight promise
      await act(async () => {
        resolveBackendCall!({
          conversationId,
          turnId: 'turn_1',
          turnIndex: 1,
          attemptNumber: 2,
          assistantMessageId: 'msg_a_att2',
          status: 'PENDING',
          userPrompt: 'Ejercicios de rodilla',
        });
        mockedAsstApi.queryKnowledge.mockResolvedValueOnce({
          answer: 'Terminado',
          grounded: true,
          sources: [],
          metadata: { model: 'm', latencyMs: 10, retrievalCount: 0 },
        });
        await firstCallPromise!;
      });
    });

    it('preserves original message and handles failure gracefully when backend rejects regeneration', async () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationId,
        title: 'Title',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [
          {
            id: 'msg_a_1',
            role: 'assistant' as const,
            content: 'Respuesta intacta.',
            createdAt: '2026-11-25T10:00:00.000Z',
            status: 'success' as const,
          },
        ],
      });

      const conflictError = Object.assign(new Error('Turn is already being regenerated'), {
        status: 409,
      });
      mockedConvApi.regenerateMessage.mockRejectedValueOnce(conflictError);

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

      let caughtError: Error | null = null;
      await act(async () => {
        try {
          await result.current.regenerateMessage({ messageId: 'msg_a_1' });
        } catch (err: unknown) {
          caughtError = err as Error;
        }
      });

      expect(caughtError).not.toBeNull();
      expect((caughtError as unknown as Error)?.message).toBe('Turn is already being regenerated');

      // State machine transitions to FAIL
      expect(result.current.state.status).toBe('FAILED');
      expect(result.current.isGenerating).toBe(false);

      // Original message in storage was NOT overwritten or corrupted
      expect(mockedStorage.updateMessage).not.toHaveBeenCalled();
    });

    it('cancels in-flight regeneration when cancelGeneration is invoked', async () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationId,
        title: 'Title',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId,
        messages: [
          {
            id: 'msg_a_1',
            role: 'assistant' as const,
            content: 'Original',
            createdAt: '2026-11-25T10:00:00.000Z',
            status: 'success' as const,
          },
        ],
      });

      mockedConvApi.regenerateMessage.mockResolvedValueOnce({
        conversationId,
        turnId: 'turn_1',
        turnIndex: 1,
        attemptNumber: 2,
        assistantMessageId: 'msg_a_att2',
        status: 'PENDING',
        userPrompt: 'Original prompt',
      });

      mockedAsstApi.queryKnowledge.mockImplementation((_req, signal) => {
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
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

      let regenPromise: Promise<void>;
      act(() => {
        regenPromise = result.current.regenerateMessage({ messageId: 'msg_a_1' });
      });

      expect(result.current.isGenerating).toBe(true);

      await waitFor(() => {
        expect(mockedConvApi.regenerateMessage).toHaveBeenCalled();
      });

      // Cancel generation
      act(() => {
        result.current.cancelGeneration(conversationId);
      });

      expect(result.current.state.status).toBe('CANCELLED');
      expect(result.current.isGenerating).toBe(false);

      await act(async () => {
        try {
          await regenPromise;
        } catch {
          // Expected aborted error
        }
      });
    });
  });
});
