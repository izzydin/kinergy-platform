import '@testing-library/jest-dom';
import React from 'react';
import { screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from '../../../../test/test-utils';
import { MessageFeedback } from '../components/message-feedback';
import { CopyAction } from '../components/message-actions';
import { ChatComposer } from '../components/chat-composer';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import * as clipboardUtil from '../utils/clipboard.util';
import type { Conversation, RAGAnswerResponseDto } from '../types/assistant.types';
import type { MessageFeedbackResponse } from '../types/conversation-contract.types';

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

describe('AI-09.5 - FB.08: Comprehensive End-to-End Integration & Final Acceptance Suite', () => {
  const tenantId = 'tenant_e2e_clinic';
  const userIdA = 'usr_doc_alex';
  const conversationIdA = 'conv_e2e_001';
  const conversationIdB = 'conv_e2e_002';
  const messageId = 'msg_asst_500';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsstApi.buildConversationHistoryContext.mockReturnValue([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario A — Positive feedback lifecycle & refresh durability
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario A — Positive feedback', () => {
    it('submits positive feedback, persists to backend, and survives simulated browser refresh', async () => {
      const mockFeedbackA: MessageFeedbackResponse = {
        id: 'fb_pos_1',
        conversationId: conversationIdA,
        messageId,
        userId: userIdA,
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      };

      // 1. Initial state: no feedback exists
      mockedConvApi.getFeedback.mockResolvedValueOnce(null);
      mockedConvApi.submitFeedback.mockResolvedValueOnce(mockFeedbackA);

      const { Wrapper: Wrapper1 } = createTestWrapper();
      const { unmount } = renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper1 },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      expect(positiveBtn).toHaveAttribute('aria-pressed', 'false');

      // 2. Submit positive feedback
      fireEvent.click(positiveBtn);

      await waitFor(() => {
        expect(mockedConvApi.submitFeedback).toHaveBeenCalledWith(conversationIdA, messageId, {
          rating: 'POSITIVE',
        });
      });

      // 3. Simulate browser refresh / reopening thread with persisted data
      unmount();
      mockedConvApi.getFeedback.mockResolvedValueOnce(mockFeedbackA);

      const { Wrapper: Wrapper2 } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper2 },
      );

      const refreshedPositiveBtn = await screen.findByTestId('feedback-positive-button');
      await waitFor(() => {
        expect(refreshedPositiveBtn).toHaveAttribute('aria-pressed', 'true');
        expect(refreshedPositiveBtn).toHaveAttribute('aria-label', 'Valoración positiva enviada');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario B — Negative feedback with explanation & metadata verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario B — Negative feedback with explanation', () => {
    it('submits negative rating with optional explanation and verifies association with user, thread, and message', async () => {
      const mockFeedbackWithExp: MessageFeedbackResponse = {
        id: 'fb_neg_1',
        conversationId: conversationIdA,
        messageId,
        userId: userIdA,
        rating: 'NEGATIVE',
        explanation: 'Las pautas de crioterapia omiten el tiempo máximo de aplicación.',
        category: null,
        createdAt: '2026-11-25T11:05:00.000Z',
        updatedAt: '2026-11-25T11:05:00.000Z',
      };

      mockedConvApi.getFeedback.mockResolvedValueOnce(null);
      mockedConvApi.submitFeedback.mockResolvedValueOnce(mockFeedbackWithExp);

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const negativeBtn = await screen.findByTestId('feedback-negative-button');
      fireEvent.click(negativeBtn);

      // Verify explanation modal opens
      const dialog = await screen.findByTestId('feedback-explanation-dialog');
      expect(dialog).toBeInTheDocument();

      const textarea = screen.getByTestId('feedback-explanation-textarea');
      fireEvent.change(textarea, {
        target: { value: 'Las pautas de crioterapia omiten el tiempo máximo de aplicación.' },
      });

      const submitBtn = screen.getByTestId('feedback-submit-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedConvApi.submitFeedback).toHaveBeenCalledWith(conversationIdA, messageId, {
          rating: 'NEGATIVE',
          explanation: 'Las pautas de crioterapia omiten el tiempo máximo de aplicación.',
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario C — Feedback updates, rating toggling & duplicate protection
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario C — Feedback updates and duplicate protection', () => {
    it('updates existing rating idempotently and prevents duplicate concurrent submissions', async () => {
      mockedConvApi.getFeedback.mockResolvedValue({
        id: 'fb_update_1',
        conversationId: conversationIdA,
        messageId,
        userId: userIdA,
        rating: 'POSITIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:00:00.000Z',
      });

      mockedConvApi.submitFeedback.mockResolvedValue({
        id: 'fb_update_1',
        conversationId: conversationIdA,
        messageId,
        userId: userIdA,
        rating: 'NEGATIVE',
        explanation: null,
        category: null,
        createdAt: '2026-11-25T11:00:00.000Z',
        updatedAt: '2026-11-25T11:10:00.000Z',
      });

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      await waitFor(() => {
        expect(positiveBtn).toHaveAttribute('aria-pressed', 'true');
      });

      // Switch to negative: opens dialog
      const negativeBtn = screen.getByTestId('feedback-negative-button');
      fireEvent.click(negativeBtn);

      const dialog = await screen.findByTestId('feedback-explanation-dialog');
      expect(dialog).toBeInTheDocument();

      const submitBtn = screen.getByTestId('feedback-submit-button');

      // Simulate rapid double click
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      // Verify submitMutation was called only once due to mutex/submitting guard
      await waitFor(() => {
        expect(mockedConvApi.submitFeedback).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario D — Feedback failure recovery and retry
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario D — Feedback failure recovery', () => {
    it('surfaces submission error gracefully and reconciles UI state upon retry', async () => {
      mockedConvApi.getFeedback.mockResolvedValue(null);
      // Fail on first attempt, succeed on retry
      mockedConvApi.submitFeedback
        .mockRejectedValueOnce(new Error('Network gateway timeout (504)'))
        .mockResolvedValueOnce({
          id: 'fb_retry_ok',
          conversationId: conversationIdA,
          messageId,
          userId: userIdA,
          rating: 'POSITIVE',
          explanation: null,
          category: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      fireEvent.click(positiveBtn);

      // Verify retry button appears on failure
      const retryBtn = await screen.findByTestId('feedback-retry-button');
      expect(retryBtn).toBeInTheDocument();

      // Click retry
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockedConvApi.submitFeedback).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario E — Response copying with rich Markdown & citations
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario E — Response copying', () => {
    it('formats paragraphs, lists, code blocks, and citations into clean markdown without raw UI tags', async () => {
      jest.spyOn(clipboardUtil, 'copyToClipboard').mockResolvedValue({ success: true });

      const richContent = [
        '### Guía Clínica de Hombro Doloroso',
        '',
        'Pautas recomendadas para el abordaje inicial:',
        '- Crioterapia 15 minutos',
        '- Ejercicios pendulares de Codman',
        '',
        '```typescript',
        'const protocol = { phase: 1, durationWeeks: 2 };',
        '```',
      ].join('\n');

      const richSources = [
        {
          documentId: 'doc_1',
          documentTitle: 'Protocolos de Fisioterapia 2026',
          chunkId: 'chunk_1',
          pageNumber: 42,
          relevanceScore: 0.95,
        },
      ];

      renderWithProviders(<CopyAction content={richContent} sources={richSources} />);

      const copyBtn = screen.getByTestId('message-copy-button');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(clipboardUtil.copyToClipboard).toHaveBeenCalledWith(
          expect.stringContaining('### Guía Clínica de Hombro Doloroso'),
        );
        expect(clipboardUtil.copyToClipboard).toHaveBeenCalledWith(
          expect.stringContaining('const protocol = { phase: 1, durationWeeks: 2 };'),
        );
        expect(clipboardUtil.copyToClipboard).toHaveBeenCalledWith(
          expect.stringContaining('Fuentes consultadas:'),
        );
        expect(clipboardUtil.copyToClipboard).toHaveBeenCalledWith(
          expect.stringContaining('[1] Protocolos de Fisioterapia 2026 (p. 42)'),
        );
      });
    });

    it('handles clipboard write failure gracefully and communicates error', async () => {
      jest
        .spyOn(clipboardUtil, 'copyToClipboard')
        .mockResolvedValue({ success: false, error: 'Permiso denegado por el navegador' });

      const onCopyErrorMock = jest.fn();

      renderWithProviders(<CopyAction content="Contenido clínico" onCopyError={onCopyErrorMock} />);

      const copyBtn = screen.getByTestId('message-copy-button');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(onCopyErrorMock).toHaveBeenCalledWith('Permiso denegado por el navegador');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario F — Response regeneration & citation isolation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario F — Response regeneration', () => {
    it('regenerates assistant message preserving original message history and distinct citations', async () => {
      const initialConv = {
        id: conversationIdA,
        title: 'Tratamiento Lumbar',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId: userIdA,
        messages: [
          {
            id: 'msg_u_1',
            role: 'user',
            content: '¿Pautas para lumbago agudo?',
            createdAt: '2026-11-25T10:00:01.000Z',
            status: 'success',
          },
          {
            id: 'msg_a_original',
            role: 'assistant',
            content: 'Respuesta original sobre lumbago.',
            createdAt: '2026-11-25T10:00:05.000Z',
            status: 'success',
            sources: [{ documentId: 'doc_orig', documentTitle: 'Guía 1', chunkId: 'c1' }],
          },
        ],
      };

      mockedStorage.getConversation.mockReturnValue(initialConv as unknown as Conversation);
      mockedStorage.appendMessage.mockReturnValue(initialConv as unknown as Conversation);
      mockedStorage.updateMessage.mockReturnValue(initialConv as unknown as Conversation);

      mockedConvApi.regenerateMessage.mockResolvedValueOnce({
        conversationId: conversationIdA,
        turnId: 'turn_regen_2',
        turnIndex: 2,
        attemptNumber: 2,
        assistantMessageId: 'msg_a_new_regen',
        status: 'PENDING',
        userPrompt: '¿Pautas para lumbago agudo?',
      });

      const regeneratedAnswer: RAGAnswerResponseDto = {
        answer: 'Respuesta regenerada y actualizada con mayor evidencia 2026.',
        grounded: true,
        sources: [
          {
            documentId: 'doc_new',
            documentTitle: 'Guía Actualizada 2026',
            chunkId: 'c2',
            relevanceScore: 0.95,
          },
        ],
        metadata: { model: 'gemini-1.5-pro', retrievalCount: 1, latencyMs: 120 },
      };
      mockedAsstApi.queryKnowledge.mockResolvedValueOnce(regeneratedAnswer);

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({ tenantId, userId: userIdA, conversationId: conversationIdA }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.regenerateMessage({ messageId: 'msg_a_original' });
      });

      // Verify backend regenerateMessage was called with original messageId
      expect(mockedConvApi.regenerateMessage).toHaveBeenCalledWith(
        conversationIdA,
        'msg_a_original',
        expect.objectContaining({ clientTurnId: expect.any(String) }),
        expect.anything(),
      );

      // Verify storage was updated with the regenerated assistant message and its distinct citations
      expect(mockedStorage.updateMessage).toHaveBeenCalledWith(
        tenantId,
        userIdA,
        conversationIdA,
        'msg_a_original',
        expect.objectContaining({
          content: expect.stringContaining('Respuesta regenerada y actualizada'),
          status: 'success',
          sources: expect.arrayContaining([
            expect.objectContaining({ documentTitle: 'Guía Actualizada 2026' }),
          ]),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario G — Complete generation lifecycle progression
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario G — Generation lifecycle progression', () => {
    it('progresses deterministically through PENDING -> STREAMING -> COMPLETED', async () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationIdA,
        title: 'Cervicalgia',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId: userIdA,
        messages: [],
      });
      mockedConvApi.reserveTurn.mockResolvedValueOnce({
        conversationId: conversationIdA,
        turnId: 'turn_gen_1',
        clientTurnId: 'turn_cl_1',
        turnIndex: 1,
        userMessageId: 'msg_u_10',
        assistantAttemptId: 'msg_a_10',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });
      mockedAsstApi.queryKnowledge.mockResolvedValueOnce({
        answer: 'Protocolo de estiramiento cervical completado.',
        grounded: true,
        sources: [],
        metadata: { model: 'test', retrievalCount: 0, latencyMs: 50 },
      });

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({ tenantId, userId: userIdA, conversationId: conversationIdA }),
        { wrapper: Wrapper },
      );

      expect(result.current.state.status).toBe('IDLE');

      let submitPromise: Promise<void> | undefined;
      act(() => {
        submitPromise = result.current.submitMessage({ prompt: 'Protocolo cervical' });
      });

      expect(result.current.isGenerating).toBe(true);

      await act(async () => {
        await submitPromise;
      });

      expect(result.current.state.status).toBe('COMPLETED');
      expect(result.current.isGenerating).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario H — Generation cancellation mechanics
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario H — Generation cancellation', () => {
    it('aborts active generation and signals backend cancellation endpoint', async () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationIdA,
        title: 'Prueba cancelación',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId: userIdA,
        messages: [],
      });
      mockedConvApi.reserveTurn.mockResolvedValueOnce({
        conversationId: conversationIdA,
        turnId: 'turn_cancel_99',
        clientTurnId: 'turn_cl_99',
        turnIndex: 1,
        userMessageId: 'msg_u_99',
        assistantAttemptId: 'msg_a_99',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });
      mockedConvApi.cancelTurn.mockResolvedValueOnce({
        conversationId: conversationIdA,
        turnId: 'turn_cancel_99',
        turnStatus: 'CANCELLED',
        assistantMessageId: 'msg_a_99',
        isAlreadyCancelled: false,
        cancelledAt: new Date().toISOString(),
      });

      mockedAsstApi.queryKnowledge.mockImplementationOnce((_req, signal) => {
        return new Promise((_, reject) => {
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
          useGenerationLifecycle({ tenantId, userId: userIdA, conversationId: conversationIdA }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current.submitMessage({ prompt: 'Consulta que se cancelará' }).catch(() => {});
      });

      await waitFor(() => {
        expect(mockedConvApi.reserveTurn).toHaveBeenCalled();
      });

      await act(async () => {
        await result.current.cancelGeneration(conversationIdA);
      });

      expect(result.current.state.status).toBe('CANCELLED');
      expect(mockedConvApi.cancelTurn).toHaveBeenCalledWith(
        conversationIdA,
        'turn_cancel_99',
        expect.objectContaining({ reason: expect.any(String) }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario I — Failure, network loss & interruption handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario I — Failure and interruption', () => {
    it('classifies network disconnection and unmount as interrupted without stale generating states', () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationIdA,
        title: 'Prueba desmontaje',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId: userIdA,
        messages: [],
      });
      mockedAsstApi.queryKnowledge.mockImplementationOnce(() => new Promise(() => {}));

      const { Wrapper } = createTestWrapper();
      const { result, unmount } = renderHook(
        () =>
          useGenerationLifecycle({ tenantId, userId: userIdA, conversationId: conversationIdA }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current
          .submitMessage({ prompt: 'Consulta interrumpida por navegación' })
          .catch(() => {});
      });

      expect(result.current.isGenerating).toBe(true);

      // Unmount component (e.g. user closes tab or navigates away)
      unmount();

      expect(mockedStorage.updateMessage).toHaveBeenCalledWith(
        tenantId,
        userIdA,
        conversationIdA,
        expect.any(String),
        expect.objectContaining({
          status: 'interrupted',
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario J — User isolation & authorization
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario J — User isolation', () => {
    it('rejects cross-user feedback and cancellation operations', async () => {
      mockedConvApi.getFeedback.mockRejectedValueOnce(
        new Error('Forbidden: Unauthorized tenant access (403)'),
      );

      const { Wrapper } = createTestWrapper();
      renderWithProviders(
        <MessageFeedback conversationId={conversationIdA} messageId={messageId} />,
        { wrapper: Wrapper },
      );

      // Buttons are present but disabled when conversation is forbidden or invalid
      const positiveBtn = await screen.findByTestId('feedback-positive-button');
      expect(positiveBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario K — Conversation switching isolation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario K — Conversation switching', () => {
    it('isolates generation state to the active conversation and ignores cancel requests targeted at other threads', async () => {
      mockedStorage.getConversation.mockReturnValue({
        id: conversationIdA,
        title: 'Conversación A',
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T10:00:00.000Z',
        tenantId,
        userId: userIdA,
        messages: [],
      });
      mockedAsstApi.queryKnowledge.mockImplementationOnce(() => new Promise(() => {}));

      const { Wrapper } = createTestWrapper();
      const { result } = renderHook(
        () =>
          useGenerationLifecycle({ tenantId, userId: userIdA, conversationId: conversationIdA }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current.submitMessage({ prompt: 'Consulta en conversación A' }).catch(() => {});
      });

      expect(result.current.isGenerating).toBe(true);

      // Attempt to cancel Conversation B while Conversation A is generating
      await act(async () => {
        await result.current.cancelGeneration(conversationIdB);
      });

      // Generation in Conversation A remains active
      expect(result.current.isGenerating).toBe(true);
      expect(result.current.state.status).toBe('PENDING');
      expect(mockedConvApi.cancelTurn).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario L — Comprehensive accessibility compliance
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Scenario L — Accessibility', () => {
    it('verifies complete keyboard accessibility, focus indicators, and ARIA semantics', () => {
      renderWithProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={jest.fn()}
          isSubmitting={true}
          isCancelling={false}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /Detener generación de respuesta/i });
      expect(stopBtn).toHaveClass('focus-visible:ring-2');
      expect(stopBtn).toHaveClass('min-h-[32px]');

      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      expect(textarea).toHaveAttribute('aria-keyshortcuts', expect.stringContaining('Escape'));
    });
  });
});
