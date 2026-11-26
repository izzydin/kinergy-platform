import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatWorkspace } from '../components/chat-workspace';
import { conversationApi } from '../api/conversation.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import { NotFoundError, ServerError } from '../../../../shared/api/api-error';
import type {
  ConversationDetailResponse,
  MessageHistoryResponse,
} from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockedConversationApi = jest.mocked(conversationApi);

function renderWithProviders(initialEntry = '/intelligence/chat') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/intelligence/chat" element={<ChatWorkspace />} />
            <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('FE.05 — Conversation Retrieval & Message History', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);

    // Default sidebar listing returns empty by default
    mockedConversationApi.listConversations.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  const mockConversationDetail: ConversationDetailResponse = {
    id: 'conv-fe05-01',
    title: 'Evaluación de Tendinopatía Patelar',
    turnCounter: 1,
    messageCounter: 2,
    lastActivityAt: '2026-11-24T10:00:00Z',
    createdAt: '2026-11-24T09:00:00Z',
    updatedAt: '2026-11-24T10:00:00Z',
    isArchived: false,
    turns: [
      {
        id: 'turn-1',
        turnIndex: 1,
        status: 'COMPLETED',
        clientTurnId: 'turn-client-01',
        activeAttemptId: 'msg-asst-1',
        activeAttemptNumber: 1,
        createdAt: '2026-11-24T09:00:00Z',
        completedAt: '2026-11-24T09:00:05Z',
      },
    ],
    activeTurnId: null,
  };

  const mockMessageHistory: MessageHistoryResponse = {
    messages: [
      {
        id: 'msg-user-1',
        turnId: 'turn-1',
        role: 'USER',
        sequenceNumber: 1,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content: '¿Cuáles son los parámetros de carga para tendinopatía patelar?',
        sources: null,
        createdAt: '2026-11-24T09:00:00Z',
        completedAt: '2026-11-24T09:00:00Z',
      },
      {
        id: 'msg-asst-1',
        turnId: 'turn-1',
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        content:
          'Se recomienda iniciar con contracciones isométricas a 60° de flexión seguidas de carga excéntrica en plano declinado.',
        sources: [
          {
            documentId: 'doc-patella-01',
            documentTitle: 'Guía Clínica Tendinopatía 2026',
            chunkId: 'chk-1',
            pageNumber: 12,
            headingPath: ['Tratamiento', 'Carga Excéntrica'],
            relevanceScore: 0.96,
            sourceStrategy: 'HYBRID',
          },
        ],
        createdAt: '2026-11-24T09:00:01Z',
        completedAt: '2026-11-24T09:00:05Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  describe('1. Successful Retrieval & Message Reconstruction', () => {
    it('retrieves conversation details and reconstructs user and assistant messages with citations and telemetry', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce(mockConversationDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce(mockMessageHistory);

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      // Verify conversation header
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
          'Evaluación de Tendinopatía Patelar',
        );
      });

      // Verify user prompt rendered
      expect(
        screen.getByText('¿Cuáles son los parámetros de carga para tendinopatía patelar?'),
      ).toBeInTheDocument();

      // Verify assistant message content rendered
      expect(
        screen.getByText(/Se recomienda iniciar con contracciones isométricas a 60° de flexión/i),
      ).toBeInTheDocument();

      // Verify source citations tray rendered with document title and page
      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByText('Guía Clínica Tendinopatía 2026')).toBeInTheDocument();
      expect(screen.getByText(/p\.12/i)).toBeInTheDocument();

      // Verify telemetry metadata
      expect(screen.getByText('assistant')).toBeInTheDocument();
      expect(screen.getByText('Fundamentado')).toBeInTheDocument();
      expect(screen.getByText('4000ms')).toBeInTheDocument();
    });

    it('preserves deterministic chronological ordering even when messages are delivered out of order', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce(mockConversationDetail);
      // Pass messages inverted in array
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [mockMessageHistory.messages[1]!, mockMessageHistory.messages[0]!],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
          'Evaluación de Tendinopatía Patelar',
        );
      });

      const messageElements = screen.getAllByRole('article');
      expect(messageElements).toHaveLength(2);
      // First article is User message
      expect(messageElements[0]).toHaveAttribute('aria-label', 'Mensaje de usuario');
      // Second article is Assistant message
      expect(messageElements[1]).toHaveAttribute('aria-label', 'Mensaje de asistente');
    });
  });

  describe('2. Message Status Handling & Lifecycle Preservation', () => {
    it('handles interrupted assistant message state while preserving partial content', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce(mockConversationDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [
          mockMessageHistory.messages[0]!,
          {
            id: 'msg-asst-interrupted',
            turnId: 'turn-1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'INTERRUPTED',
            content: 'Texto parcial generado antes de la pérdida de conexión...',
            sources: null,
            createdAt: '2026-11-24T09:00:01Z',
            completedAt: null,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      await waitFor(() => {
        expect(
          screen.getByText('Texto parcial generado antes de la pérdida de conexión...'),
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('message-interrupted-state')).toBeInTheDocument();
      expect(
        screen.getByText(/interrumpió antes de recibir la respuesta completa/i),
      ).toBeInTheDocument();
    });

    it('handles failed assistant message state and displays retry action', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce(mockConversationDetail);
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [
          mockMessageHistory.messages[0]!,
          {
            id: 'msg-asst-failed',
            turnId: 'turn-1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'FAILED',
            content: '',
            sources: null,
            createdAt: '2026-11-24T09:00:01Z',
            completedAt: null,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      await waitFor(() => {
        expect(screen.getByTestId('message-error-state')).toBeInTheDocument();
      });

      expect(screen.getByText(/Error al generar respuesta/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    });
  });

  describe('3. Prevention of Stale-Message Leakage Across Conversation Switching', () => {
    it('shows loading state and prevents messages from previous conversation leaking while switching', async () => {
      const conv1Detail: ConversationDetailResponse = {
        ...mockConversationDetail,
        id: 'conv-1',
        title: 'Primera Conversación',
      };
      const conv1History: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg-conv1-1',
            turnId: 'turn-1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Mensaje exclusivo de la Conversación 1',
            sources: null,
            createdAt: '2026-11-24T09:00:00Z',
            completedAt: '2026-11-24T09:00:00Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      const conv2Detail: ConversationDetailResponse = {
        ...mockConversationDetail,
        id: 'conv-2',
        title: 'Segunda Conversación',
      };
      const conv2History: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg-conv2-1',
            turnId: 'turn-2',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Mensaje exclusivo de la Conversación 2',
            sources: null,
            createdAt: '2026-11-24T10:00:00Z',
            completedAt: '2026-11-24T10:00:00Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      // Mock sidebar with both conversations
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv-1',
            title: 'Primera Conversación',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T09:00:00Z',
            createdAt: '2026-11-24T09:00:00Z',
            isArchived: false,
          },
          {
            id: 'conv-2',
            title: 'Segunda Conversación',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T10:00:00Z',
            createdAt: '2026-11-24T10:00:00Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      // Handler for conv-1 and conv-2
      mockedConversationApi.getConversation.mockImplementation(async (id) => {
        if (id === 'conv-1') return conv1Detail;
        if (id === 'conv-2') return conv2Detail;
        throw new NotFoundError('Not found');
      });

      mockedConversationApi.getMessageHistory.mockImplementation(async (id) => {
        if (id === 'conv-1') return conv1History;
        if (id === 'conv-2') return conv2History;
        throw new NotFoundError('Not found');
      });

      renderWithProviders('/intelligence/chat/conv-1');

      // Verify Conv 1 loaded
      await waitFor(() => {
        expect(screen.getByText('Mensaje exclusivo de la Conversación 1')).toBeInTheDocument();
      });

      // Click on Conv 2 in sidebar
      const conv2Item = screen.getByTestId('conversation-item-conv-2');
      fireEvent.click(conv2Item);

      // Verify Conv 2 loaded and Conv 1 message is gone
      await waitFor(() => {
        expect(screen.getByText('Mensaje exclusivo de la Conversación 2')).toBeInTheDocument();
      });
      expect(screen.queryByText('Mensaje exclusivo de la Conversación 1')).not.toBeInTheDocument();
    });
  });

  describe('4. Empty and Unavailable Conversation Handling', () => {
    it('renders deliberate empty state when conversation exists but has zero messages', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce({
        ...mockConversationDetail,
        turnCounter: 0,
        messageCounter: 0,
        turns: [],
      });
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      await waitFor(() => {
        expect(screen.getByTestId('chat-empty-conversation-state')).toBeInTheDocument();
      });

      expect(screen.getByText('Conversación vacía')).toBeInTheDocument();
    });

    it('renders conversation not found error state for 404 (nonexistent or unauthorized)', async () => {
      mockedConversationApi.getConversation.mockRejectedValueOnce(
        new NotFoundError('Conversation not found in tenant'),
      );
      mockedConversationApi.getMessageHistory.mockRejectedValueOnce(
        new NotFoundError('Conversation not found in tenant'),
      );

      renderWithProviders('/intelligence/chat/conv-nonexistent');

      await waitFor(() => {
        expect(screen.getByText('Conversación no encontrada')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/La sesión solicitada no existe o fue eliminada/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Iniciar nueva conversación/i }),
      ).toBeInTheDocument();
    });

    it('renders network error state with retry button on server failure and recovers on retry', async () => {
      mockedConversationApi.getConversation
        .mockRejectedValueOnce(new ServerError('Database unavailable', 500))
        .mockResolvedValueOnce(mockConversationDetail);

      mockedConversationApi.getMessageHistory
        .mockRejectedValueOnce(new ServerError('Database unavailable', 500))
        .mockResolvedValueOnce(mockMessageHistory);

      renderWithProviders('/intelligence/chat/conv-fe05-01');

      await waitFor(() => {
        expect(screen.getByText('Error al cargar conversación')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.getByText('¿Cuáles son los parámetros de carga para tendinopatía patelar?'),
        ).toBeInTheDocument();
      });
    });
  });
});
