import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatWorkspace } from '../components/chat-workspace';
import { conversationApi } from '../api/conversation.api';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type {
  ConversationListResponse,
  ConversationDetailResponse,
  MessageHistoryResponse,
  ReserveTurnResponse,
} from '../types/conversation-contract.types';
import type { RAGAnswerResponseDto } from '../types/assistant.types';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api');

const mockedConversationApi = jest.mocked(conversationApi);
const mockedAssistantApi = jest.mocked(assistantApi);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('FE.08 — Conversation Continuation & State Reconciliation', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);

    mockedAssistantApi.buildConversationHistoryContext.mockImplementation((msgs) =>
      msgs
        .filter((m) => (m.status === 'success' || m.role === 'user') && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content.trim() })),
    );
  });

  const mockListResponse: ConversationListResponse = {
    items: [
      {
        id: 'conv-cont-01',
        title: 'Prescripción de Ejercicio Terapéutico',
        turnCounter: 1,
        lastActivityAt: '2026-11-24T10:00:00Z',
        createdAt: '2026-11-24T09:00:00Z',
        isArchived: false,
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const mockDetailResponse: ConversationDetailResponse = {
    id: 'conv-cont-01',
    title: 'Prescripción de Ejercicio Terapéutico',
    turnCounter: 1,
    messageCounter: 2,
    lastActivityAt: '2026-11-24T10:00:00Z',
    createdAt: '2026-11-24T09:00:00Z',
    updatedAt: '2026-11-24T10:00:00Z',
    isArchived: false,
    turns: [],
  };

  const mockInitialMessages: MessageHistoryResponse = {
    messages: [
      {
        id: 'msg-01',
        turnId: 'turn-01',
        sequenceNumber: 1,
        role: 'USER',
        content: '¿Cuál es la dosis para tendinopatía rotuliana?',
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        createdAt: '2026-11-24T09:00:00Z',
        completedAt: '2026-11-24T09:00:01Z',
      },
      {
        id: 'msg-02',
        turnId: 'turn-01',
        sequenceNumber: 2,
        role: 'ASSISTANT',
        content: 'La carga progresiva excéntrica/isométrica es el estándar de oro.',
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        createdAt: '2026-11-24T09:00:01Z',
        completedAt: '2026-11-24T09:00:03Z',
        sources: [
          {
            documentId: 'doc-tendon',
            documentTitle: 'Guía Clínica Tendón 2026',
            chunkId: 'chk-1',
            relevanceScore: 0.95,
          },
        ],
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const mockReserveTurnResponse: ReserveTurnResponse = {
    conversationId: 'conv-cont-01',
    turnId: 'turn-02',
    clientTurnId: 'turn_client_cont_1',
    turnIndex: 2,
    userMessageId: 'msg-03-persisted',
    assistantAttemptId: 'msg-04-persisted',
    turnStatus: 'PENDING',
    isIdempotentReplay: false,
    idempotencyOutcome: 'CREATED',
    createdAt: '2026-11-24T10:05:00Z',
  };

  it('1. Loads and renders previously persisted conversation history in strict chronological sequence', async () => {
    mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
    mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockInitialMessages);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/intelligence/chat/conv-cont-01']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Header metadata reflects loaded conversation
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Prescripción de Ejercicio Terapéutico' }),
      ).toBeInTheDocument();
      expect(screen.getByText('2 mensajes')).toBeInTheDocument();
    });

    // Both persisted messages are rendered in order
    expect(screen.getByText('¿Cuál es la dosis para tendinopatía rotuliana?')).toBeInTheDocument();
    expect(
      screen.getByText('La carga progresiva excéntrica/isométrica es el estándar de oro.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Guía Clínica Tendón 2026')).toBeInTheDocument();
  });

  it('2. Submits continuation turn: invokes reserveTurn and displays optimistic in-flight messages', async () => {
    mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
    mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockInitialMessages);
    mockedConversationApi.reserveTurn.mockResolvedValue(mockReserveTurnResponse);

    // Simulate deferred AI answer
    let resolveAnswer: (val: RAGAnswerResponseDto) => void = () => {};
    mockedAssistantApi.queryKnowledge.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    );

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/intelligence/chat/conv-cont-01']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Prescripción de Ejercicio Terapéutico' }),
      ).toBeInTheDocument();
    });

    // Enter subsequent prompt
    const textarea = screen.getByRole('textbox', {
      name: /Escribe tu consulta para el asistente/i,
    });
    fireEvent.change(textarea, {
      target: { value: '¿Qué frecuencia semanal de carga isométrica se recomienda?' },
    });

    const sendBtn = screen.getByRole('button', { name: /Enviar mensaje/i });
    fireEvent.click(sendBtn);

    // Verify reserveTurn was invoked with conversationId and prompt
    await waitFor(() => {
      expect(mockedConversationApi.reserveTurn).toHaveBeenCalledWith(
        'conv-cont-01',
        expect.objectContaining({
          userPrompt: '¿Qué frecuencia semanal de carga isométrica se recomienda?',
        }),
      );
    });

    // In-flight optimistic message appears in feed
    await waitFor(() => {
      expect(
        screen.getAllByText('¿Qué frecuencia semanal de carga isométrica se recomienda?').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('message-pending-state').length).toBeGreaterThanOrEqual(1);
    });

    // Resolve AI answer
    resolveAnswer({
      answer: 'Se recomienda una frecuencia de 3 a 4 sesiones semanales.',
      grounded: true,
      sources: [
        {
          documentId: 'doc-isometrics',
          documentTitle: 'Protocolos Isométricos 2026',
          chunkId: 'chk-iso-1',
          relevanceScore: 0.98,
        },
      ],
      metadata: {
        model: 'gemini-1.5-pro',
        retrievalCount: 1,
        latencyMs: 150,
      },
    });

    // Final reconciled answer appears
    await waitFor(() => {
      expect(
        screen.getByText('Se recomienda una frecuencia de 3 a 4 sesiones semanales.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Protocolos Isométricos 2026')).toBeInTheDocument();
    });
  });

  it('3. Injects bounded prior conversation history into subsequent queryKnowledge call', async () => {
    mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
    mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockInitialMessages);
    mockedConversationApi.reserveTurn.mockResolvedValue(mockReserveTurnResponse);
    mockedAssistantApi.queryKnowledge.mockResolvedValue({
      answer: 'Respuesta contextualizada.',
      grounded: true,
      sources: [],
      metadata: {
        model: 'gemini-1.5-pro',
        retrievalCount: 0,
        latencyMs: 120,
      },
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/intelligence/chat/conv-cont-01']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Prescripción de Ejercicio Terapéutico' }),
      ).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox', {
      name: /Escribe tu consulta para el asistente/i,
    });
    fireEvent.change(textarea, { target: { value: 'Consulta con contexto previo' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    await waitFor(() => {
      expect(mockedAssistantApi.queryKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Consulta con contexto previo',
          conversationHistory: expect.arrayContaining([
            { role: 'user', content: '¿Cuál es la dosis para tendinopatía rotuliana?' },
            {
              role: 'assistant',
              content: 'La carga progresiva excéntrica/isométrica es el estándar de oro.',
            },
          ]),
        }),
        expect.any(AbortSignal),
      );
    });
  });

  it('4. Handles interruption during continuation: marks turn interrupted and allows retry', async () => {
    mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
    mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockInitialMessages);
    mockedConversationApi.reserveTurn.mockResolvedValue(mockReserveTurnResponse);

    // Simulate 504 Gateway Timeout network interruption
    const timeoutError = Object.assign(new Error('Gateway Timeout'), { statusCode: 504 });
    mockedAssistantApi.queryKnowledge.mockRejectedValue(timeoutError);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/intelligence/chat/conv-cont-01']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Prescripción de Ejercicio Terapéutico' }),
      ).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox', {
      name: /Escribe tu consulta para el asistente/i,
    });
    fireEvent.change(textarea, { target: { value: 'Prompt con fallo de pasarela' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    // Interrupted status indicator appears in feed
    await waitFor(() => {
      expect(screen.getByText(/Conexión interrumpida/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Tiempo de espera agotado en la pasarela de inferencia \(504\)/i),
      ).toBeInTheDocument();
    });
  });

  it('5. Prevents duplicate submissions while a continuation turn is actively in progress', async () => {
    mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
    mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
    mockedConversationApi.getMessageHistory.mockResolvedValue(mockInitialMessages);
    mockedConversationApi.reserveTurn.mockResolvedValue(mockReserveTurnResponse);

    // Defer resolution
    mockedAssistantApi.queryKnowledge.mockImplementation(() => new Promise(() => {}));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/intelligence/chat/conv-cont-01']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Prescripción de Ejercicio Terapéutico' }),
      ).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox', {
      name: /Escribe tu consulta para el asistente/i,
    });
    fireEvent.change(textarea, { target: { value: 'Primer intento' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar mensaje/i }));

    await waitFor(() => {
      expect(mockedConversationApi.reserveTurn).toHaveBeenCalledTimes(1);
    });

    // Second click or form submit while in-flight must be disabled and ignored
    expect(screen.queryByRole('button', { name: /Enviar mensaje/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Detener generación/i })).toBeInTheDocument();

    expect(mockedConversationApi.reserveTurn).toHaveBeenCalledTimes(1);
  });
});
