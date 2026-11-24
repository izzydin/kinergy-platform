import '@testing-library/jest-dom';
import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import { aiAssistantKeys } from '../api/assistant-query-keys';
import { ChatWorkspace } from '../components/chat-workspace';
import type { RAGAnswerResponseDto, QueryKnowledgeRequestDto } from '../types/assistant.types';

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, Wrapper };
}

describe('Generation Cancellation, Recovery & Canonical Reconciliation (AI-09.2.06)', () => {
  const tenantId = 'tenant_reconcile_test';
  const userId = 'usr_reconcile_1';

  beforeEach(() => {
    assistantStorageService.clearConversations(tenantId, userId);
    jest.clearAllMocks();
  });

  describe('1. Explicit Generation Cancellation & Truthful Semantics', () => {
    it('aborts transport signal and marks message as cancelled with truthful disclaimer', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Cancel Test');
      const { Wrapper } = createTestWrapper();

      let capturedSignal: AbortSignal | undefined;

      jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockImplementation((_req: QueryKnowledgeRequestDto, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<RAGAnswerResponseDto>((_resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                const abortErr = new Error('The user aborted a request.');
                abortErr.name = 'AbortError';
                reject(abortErr);
              });
            }
          });
        });

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      // Submit message
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submitMessage({
          prompt: 'Consulta clínica para cancelar',
        });
      });

      expect(result.current.isGenerating).toBe(true);
      expect(result.current.state.status).toBe('PENDING');
      expect(capturedSignal?.aborted).toBe(false);

      // Trigger explicit cancellation
      act(() => {
        result.current.cancelGeneration(conv.id);
      });

      expect(capturedSignal?.aborted).toBe(true);
      await act(async () => {
        try {
          await submitPromise;
        } catch {
          // Expected AbortError from aborted transport
        }
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.state.status).toBe('CANCELLED');

      // Check stored conversation state
      const updatedConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(updatedConv).toBeDefined();
      expect(updatedConv?.messages).toHaveLength(2);

      const userMsg = updatedConv?.messages[0];
      const asstMsg = updatedConv?.messages[1];

      // User message is strictly preserved
      expect(userMsg?.role).toBe('user');
      expect(userMsg?.content).toBe('Consulta clínica para cancelar');

      // Assistant message is marked cancelled with truthful client-side explanation
      expect(asstMsg?.role).toBe('assistant');
      expect(asstMsg?.status).toBe('cancelled');
      expect(asstMsg?.error).toContain('Generación detenida en el cliente');
    });

    it('ignores cancellation requests targeting a different conversation', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Target Check');
      const { Wrapper } = createTestWrapper();

      let capturedSignal: AbortSignal | undefined;
      jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockImplementation((_req: QueryKnowledgeRequestDto, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<RAGAnswerResponseDto>(() => {});
        });

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current.submitMessage({
          prompt: 'Protección cross-conversation',
        });
      });

      expect(result.current.isGenerating).toBe(true);

      // Attempt to cancel a different conversation ID
      act(() => {
        result.current.cancelGeneration('different-conv-id');
      });

      // Signal must NOT be aborted because IDs don't match
      expect(capturedSignal?.aborted).toBe(false);
      expect(result.current.isGenerating).toBe(true);
    });
  });

  describe('2. Connection Interruption Handling & State Preservation', () => {
    it('detects network disconnect and marks message interrupted without removing prompt', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Network Drop');
      const { Wrapper } = createTestWrapper();

      jest.spyOn(assistantApi, 'queryKnowledge').mockImplementation(() => {
        const netErr = new Error('Failed to fetch');
        return Promise.reject(netErr);
      });

      // Mock navigator.onLine as false
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

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
        try {
          await result.current.submitMessage({
            prompt: 'Pregunta durante caída de red',
          });
        } catch {
          // Expected network error
        }
      });

      // Restore navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        value: originalOnLine,
        configurable: true,
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.state.status).toBe('INTERRUPTED');

      const updatedConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(updatedConv?.messages).toHaveLength(2);
      expect(updatedConv?.messages[0]?.content).toBe('Pregunta durante caída de red');
      expect(updatedConv?.messages[1]?.status).toBe('interrupted');
      expect(updatedConv?.messages[1]?.error).toContain('Conexión de red interrumpida');
    });

    it('marks 504 Gateway Timeout as interrupted', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Gateway Timeout');
      const { Wrapper } = createTestWrapper();

      jest.spyOn(assistantApi, 'queryKnowledge').mockImplementation(() => {
        const err = { status: 504, message: 'Gateway Timeout' };
        return Promise.reject(err);
      });

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
        try {
          await result.current.submitMessage({
            prompt: 'Consulta pesada con 504',
          });
        } catch {
          // Expected timeout error
        }
      });

      expect(result.current.state.status).toBe('INTERRUPTED');
      const updatedConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(updatedConv?.messages[1]?.status).toBe('interrupted');
      expect(updatedConv?.messages[1]?.error).toContain('Tiempo de espera agotado');
    });
  });

  describe('3. Canonical Response Reconciliation & Timestamp Integrity', () => {
    it('authoritatively replaces pending turn, applies citations and preserves original timestamp', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Reconciliation Test',
      );
      const { Wrapper, queryClient } = createTestWrapper();

      const mockResponse: RAGAnswerResponseDto = {
        answer: 'Respuesta clínica con citas canónicas.',
        grounded: true,
        sources: [
          {
            documentId: 'doc_can_1',
            documentTitle: 'Guía Clínica de Fisioterapia 2026',
            chunkId: 'chk_can_1',
            pageNumber: 12,
            relevanceScore: 0.98,
          },
        ],
        metadata: {
          retrievalCount: 3,
          latencyMs: 140,
          model: 'gemini-1.5-pro',
        },
      };

      jest.spyOn(assistantApi, 'queryKnowledge').mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      let createdTimestampBefore: string | undefined;

      await act(async () => {
        const promise = result.current.submitMessage({
          prompt: '¿Cuáles son las pautas?',
        });

        // While pending, inspect the initial created timestamp
        const pendingConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
        createdTimestampBefore = pendingConv?.messages[1]?.createdAt;

        await promise;
      });

      expect(result.current.state.status).toBe('COMPLETED');

      // Verify stored message
      const completedConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(completedConv?.messages).toHaveLength(2);
      const asstMsg = completedConv?.messages[1];

      expect(asstMsg?.status).toBe('success');
      expect(asstMsg?.content).toBe(mockResponse.answer);
      expect(asstMsg?.sources).toEqual(mockResponse.sources);
      expect(asstMsg?.grounded).toBe(true);
      expect(asstMsg?.metadata).toEqual(mockResponse.metadata);

      // Preserves original chronological timestamp
      expect(asstMsg?.createdAt).toBe(createdTimestampBefore);

      // Verifies TanStack Query cache is kept in sync
      const cached = queryClient.getQueryData(
        aiAssistantKeys.conversation(tenantId, userId, conv.id),
      );
      expect(cached).toEqual(completedConv);
    });
  });

  describe('4. Stale Response Protection & Unmount Cleanup', () => {
    it('aborts active request on component unmount and marks turn interrupted', () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Unmount Test');
      const { Wrapper } = createTestWrapper();

      let capturedSignal: AbortSignal | undefined;
      jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockImplementation((_req: QueryKnowledgeRequestDto, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<RAGAnswerResponseDto>(() => {});
        });

      const { result, unmount } = renderHook(
        () =>
          useGenerationLifecycle({
            tenantId,
            userId,
            conversationId: conv.id,
          }),
        { wrapper: Wrapper },
      );

      act(() => {
        void result.current.submitMessage({
          prompt: 'Prueba de unmount',
        });
      });

      expect(result.current.isGenerating).toBe(true);
      expect(capturedSignal?.aborted).toBe(false);

      // Unmount while generating
      unmount();

      // Signal must be aborted immediately
      expect(capturedSignal?.aborted).toBe(true);

      // Message in storage must be marked interrupted
      const storedConv = assistantStorageService.getConversation(tenantId, userId, conv.id);
      expect(storedConv?.messages[1]?.status).toBe('interrupted');
    });
  });

  describe('5. Chat Workspace Stop Button & Retry Interaction', () => {
    it('renders Stop button during generation and allows stopping', async () => {
      const { queryClient } = createTestWrapper();

      let capturedSignal: AbortSignal | undefined;
      jest
        .spyOn(assistantApi, 'queryKnowledge')
        .mockImplementation((_req: QueryKnowledgeRequestDto, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<RAGAnswerResponseDto>((_resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                const abortErr = new Error('AbortError');
                abortErr.name = 'AbortError';
                reject(abortErr);
              });
            }
          });
        });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat']}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Find composer textarea and submit button
      const textarea = screen.getByRole('textbox', {
        name: /Escribe tu consulta para el asistente/i,
      });
      fireEvent.change(textarea, { target: { value: 'Pregunta para detener en UI' } });

      const sendButton = screen.getByRole('button', { name: /Enviar mensaje/i });
      fireEvent.click(sendButton);

      // Should now show Stop button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Detener generación/i })).toBeInTheDocument();
      });

      // Click Stop button
      const stopButton = screen.getByRole('button', { name: /Detener generación/i });
      fireEvent.click(stopButton);

      // Transport aborted
      expect(capturedSignal?.aborted).toBe(true);

      // Verify composer returns to normal send button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Enviar mensaje/i })).toBeInTheDocument();
      });

      // Verify assistant message status shows cancelled indicator
      await waitFor(() => {
        expect(screen.getByText(/Generación detenida en el cliente/i)).toBeInTheDocument();
      });
    });
  });
});
