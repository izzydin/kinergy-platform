import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { ChatComposer } from '../assistant/components/chat-composer';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import { assistantApi } from '../assistant/api/assistant.api';
import { conversationApi } from '../assistant/api/conversation.api';

// Mocks
jest.mock('../assistant/api/assistant.api');
jest.mock('../assistant/api/conversation.api', () => ({
  conversationApi: {
    listConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    getConversation: jest.fn().mockResolvedValue(null),
    getMessageHistory: jest
      .fn()
      .mockResolvedValue({ messages: [], nextCursor: null, hasMore: false }),
    createConversation: jest.fn(),
    reserveTurn: jest.fn(),
    regenerateMessage: jest.fn(),
    cancelTurn: jest.fn(),
    updateTitle: jest.fn(),
    archiveConversation: jest.fn(),
  },
}));

const mockedAssistantApi = jest.mocked(assistantApi);
const mockedConversationApi = jest.mocked(conversationApi);

describe('ER.05 — Message Submission Safety & Persistence Resilience', () => {
  const tenantId = 'global';
  const userId = 'anonymous';
  let queryClient: QueryClient;

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockedConversationApi.listConversations.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    mockedConversationApi.getConversation.mockImplementation(async (_id: string) => {
      const err = new Error('Not found on server - using local fallback');
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    });
    mockedConversationApi.getMessageHistory.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    assistantStorageService.clearConversations(tenantId, userId);
    assistantStorageService.clearDraft(tenantId, userId, 'new');
    assistantStorageService.clearDraft(tenantId, userId, 'conv-alpha');
    assistantStorageService.clearDraft(tenantId, userId, 'conv-beta');
    assistantStorageService.clearDraft(tenantId, userId, 'conv-lumbar');
    assistantStorageService.clearDraft(tenantId, userId, 'conv-cervical');
    jest.clearAllMocks();
  });

  describe('1. Duplicate Submission Prevention & Mutex', () => {
    it('prevents rapid double-clicks and rapid Enter presses from sending duplicate messages', async () => {
      let sendCount = 0;
      let resolvePromise: () => void = () => {};
      const delayedSend = jest.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            sendCount++;
            resolvePromise = resolve;
          }),
      );

      const { unmount } = render(
        <ChatComposer
          onSend={delayedSend}
          conversationId="conv-mutex"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textarea = screen.getByLabelText('Escribe tu consulta para el asistente');
      fireEvent.change(textarea, { target: { value: 'Consulta clínica de prueba' } });

      // Fast successive submits: Enter key + submit button click
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      const submitBtn = screen.getByRole('button', { name: /enviar mensaje/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(delayedSend).toHaveBeenCalledTimes(1);
      });
      expect(sendCount).toBe(1);

      // Finish pending promise before unmounting
      resolvePromise();
      unmount();
    });
  });

  describe('2. Draft Preservation & Isolation Across Conversations', () => {
    it('preserves user draft when submission throws an error', async () => {
      const failingSend = jest.fn().mockRejectedValue(new Error('Network disconnected'));

      const { unmount } = render(
        <ChatComposer
          onSend={failingSend}
          conversationId="conv-preservation"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textarea = screen.getByLabelText(
        'Escribe tu consulta para el asistente',
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Mi consulta que debe preservarse' } });

      const submitBtn = screen.getByRole('button', { name: /enviar mensaje/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(failingSend).toHaveBeenCalledTimes(1);
      });

      // Draft must NOT be cleared on failure
      expect(textarea.value).toBe('Mi consulta que debe preservarse');
      expect(assistantStorageService.getDraft(tenantId, userId, 'conv-preservation')).toBe(
        'Mi consulta que debe preservarse',
      );
      unmount();
    });

    it('clears draft only upon successful submission acceptance', async () => {
      const successfulSend = jest.fn().mockResolvedValue(undefined);

      const { unmount } = render(
        <ChatComposer
          onSend={successfulSend}
          conversationId="conv-success"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textarea = screen.getByLabelText(
        'Escribe tu consulta para el asistente',
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Consulta exitosa' } });

      const submitBtn = screen.getByRole('button', { name: /enviar mensaje/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(successfulSend).toHaveBeenCalledTimes(1);
      });

      expect(textarea.value).toBe('');
      expect(assistantStorageService.getDraft(tenantId, userId, 'conv-success')).toBe('');
      unmount();
    });

    it('isolates drafts between different conversations and restores them on return', () => {
      // 1. User writes draft in Thread Alpha
      const { unmount } = render(
        <ChatComposer
          onSend={jest.fn()}
          conversationId="conv-alpha"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textareaAlpha = screen.getByLabelText(
        'Escribe tu consulta para el asistente',
      ) as HTMLTextAreaElement;
      fireEvent.change(textareaAlpha, { target: { value: 'Borrador para el Hombro' } });
      expect(assistantStorageService.getDraft(tenantId, userId, 'conv-alpha')).toBe(
        'Borrador para el Hombro',
      );
      unmount();

      // 2. User navigates to Thread Beta -> must see empty draft or Beta draft, NOT Alpha draft
      const { unmount: unmountBeta } = render(
        <ChatComposer
          onSend={jest.fn()}
          conversationId="conv-beta"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textareaBeta = screen.getByLabelText(
        'Escribe tu consulta para el asistente',
      ) as HTMLTextAreaElement;
      expect(textareaBeta.value).toBe('');
      fireEvent.change(textareaBeta, { target: { value: 'Borrador para la Rodilla' } });
      expect(assistantStorageService.getDraft(tenantId, userId, 'conv-beta')).toBe(
        'Borrador para la Rodilla',
      );
      unmountBeta();

      // 3. User navigates back to Thread Alpha -> Alpha draft must be restored!
      render(
        <ChatComposer
          onSend={jest.fn()}
          conversationId="conv-alpha"
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const textareaAlphaRestored = screen.getByLabelText(
        'Escribe tu consulta para el asistente',
      ) as HTMLTextAreaElement;
      expect(textareaAlphaRestored.value).toBe('Borrador para el Hombro');
    });
  });

  describe('3. User Message Persistence Survival on Assistant Failure', () => {
    it('preserves the persisted user message in storage and history even when assistant generation fails', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Sesión Dolor Lumbar',
        'conv-lumbar',
      );

      mockedConversationApi.reserveTurn.mockResolvedValueOnce({
        conversationId: conv.id,
        turnId: 'turn-lumbar-1',
        clientTurnId: 'client-turn-1',
        turnIndex: 1,
        userMessageId: 'user-msg-1',
        assistantAttemptId: 'asst-msg-1',
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      });

      // Assistant API fails with 504 Gateway Timeout
      const gatewayTimeoutErr = new Error('504 Gateway Timeout');
      (gatewayTimeoutErr as unknown as { statusCode: number }).statusCode = 504;
      mockedAssistantApi.queryKnowledge.mockRejectedValueOnce(gatewayTimeoutErr);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv-lumbar']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const textarea = await screen.findByLabelText('Escribe tu consulta para el asistente');
      fireEvent.change(textarea, { target: { value: '¿Cuál es el protocolo para lumbalgia?' } });
      const submitBtn = screen.getByRole('button', { name: /enviar mensaje/i });
      fireEvent.click(submitBtn);

      // Wait for error state to appear
      await screen.findByText(/Tiempo de espera agotado en la pasarela de inferencia/i);

      // Verify that the user message survives in storage with status success
      const updatedConv = assistantStorageService.getConversation(tenantId, userId, 'conv-lumbar');
      expect(updatedConv).not.toBeNull();
      const userMessage = updatedConv?.messages.find(
        (m) => m.content === '¿Cuál es el protocolo para lumbalgia?',
      );
      expect(userMessage).toBeDefined();
      expect(userMessage?.role).toBe('user');
      expect(userMessage?.status).toBe('success');

      // Verify assistant message is marked interrupted/error, NOT user message
      const assistantMessage = updatedConv?.messages.find((m) => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.status).toBe('interrupted');
    });

    it('retrying an interrupted assistant message triggers regeneration without inserting a duplicate user message', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Sesión Lumbalgia',
        'conv-lumbar',
      );

      // Seed conversation with user message (success) and assistant message (interrupted)
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'user-lumbar-1',
        role: 'user',
        content: 'Protocolo de calor o frío',
        createdAt: new Date().toISOString(),
        status: 'success',
      });
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'asst-lumbar-1',
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        status: 'interrupted',
        error: 'Conexión de red interrumpida',
      });

      mockedConversationApi.regenerateMessage.mockResolvedValueOnce({
        conversationId: conv.id,
        turnId: 'turn-lumbar-1',
        turnIndex: 1,
        attemptNumber: 2,
        assistantMessageId: 'asst-lumbar-attempt-2',
        status: 'PENDING',
        userPrompt: 'Protocolo de calor o frío',
      });

      mockedAssistantApi.queryKnowledge.mockResolvedValueOnce({
        answer: 'En fases agudas se recomienda crioterapia.',
        grounded: true,
        sources: [],
        metadata: {
          model: 'gemini-1.5-pro',
          retrievalCount: 2,
          latencyMs: 120,
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv-lumbar']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Find retry button on assistant message
      const retryBtn = await screen.findByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);

      await screen.findByText('En fases agudas se recomienda crioterapia.');

      // Check conversation message count: must have exactly 1 user message and 1 assistant message (no duplicates)
      const finalConv = assistantStorageService.getConversation(tenantId, userId, 'conv-lumbar');
      const userMessages = finalConv?.messages.filter((m) => m.role === 'user') ?? [];
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0]?.content).toBe('Protocolo de calor o frío');

      const asstMessages = finalConv?.messages.filter((m) => m.role === 'assistant') ?? [];
      expect(asstMessages).toHaveLength(1);
      expect(asstMessages[0]?.content).toBe('En fases agudas se recomienda crioterapia.');
      expect(asstMessages[0]?.status).toBe('success');
    });
  });

  describe('4. Unknown Outcome & Server Reconciliation', () => {
    it('reconciles an unknown outcome with the server without creating a duplicate turn', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Sesión Cervical',
        'conv-cervical',
      );

      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'user-cerv-1',
        role: 'user',
        content: 'Ejercicios de retracción cervical',
        createdAt: new Date().toISOString(),
        status: 'success',
      });
      assistantStorageService.appendMessage(tenantId, userId, conv.id, {
        id: 'asst-cerv-1',
        turnId: 'turn-cerv-1',
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        status: 'unknown',
        error: 'Tiempo de espera agotado. Verificando con el servidor...',
      });

      // 1st call on workspace mount returns empty so local fallback message with status unknown is displayed
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      // 2nd call upon clicking reconcile returns the backend's finalized SUCCESS message
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [
          {
            id: 'asst-cerv-1',
            turnId: 'turn-cerv-1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            content: 'Los ejercicios de McKenzie son efectivos para dolor cervical.',
            status: 'SUCCESS',
            sources: [],
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv-cervical']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify "Verificar con servidor" button is rendered for unknown status
      const reconcileBtn = await screen.findByRole('button', {
        name: /verificar con servidor/i,
      });
      fireEvent.click(reconcileBtn);

      await screen.findByText('Los ejercicios de McKenzie son efectivos para dolor cervical.');

      // Check conversation message count: exactly 1 user message and 1 assistant message
      const finalConv = assistantStorageService.getConversation(tenantId, userId, 'conv-cervical');
      const userMessages = finalConv?.messages.filter((m) => m.role === 'user') ?? [];
      expect(userMessages).toHaveLength(1);

      const asstMessages = finalConv?.messages.filter((m) => m.role === 'assistant') ?? [];
      expect(asstMessages).toHaveLength(1);
      expect(asstMessages[0]?.status).toBe('success');
      expect(asstMessages[0]?.content).toBe(
        'Los ejercicios de McKenzie son efectivos para dolor cervical.',
      );
    });
  });
});
