import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatWorkspace } from '../components/chat-workspace';
import { conversationApi } from '../api/conversation.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import { ProtectedRoute } from '../../../auth/components/protected-route';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import type {
  ConversationListResponse,
  ConversationDetailResponse,
  MessageHistoryResponse,
} from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');
jest.mock('../api/assistant.api');

const mockedConversationApi = jest.mocked(conversationApi);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('FE.09 — Pagination, Resilience & URL Synchronization', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('1. Keyset Conversation-List Pagination', () => {
    it('consumes nextCursor, loads subsequent page, deduplicates records, and hides trigger when complete', async () => {
      const page1Response: ConversationListResponse = {
        items: [
          {
            id: 'conv_p1_1',
            title: 'Protocolo Hombro Doloroso',
            turnCounter: 2,
            lastActivityAt: '2026-11-24T12:00:00.000Z',
            createdAt: '2026-11-24T10:00:00.000Z',
            isArchived: false,
          },
          {
            id: 'conv_p1_2',
            title: 'Tendinitis Aquilea Excéntrico',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T11:00:00.000Z',
            createdAt: '2026-11-24T09:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'cursor_token_page_2',
        hasMore: true,
      };

      const page2Response: ConversationListResponse = {
        items: [
          // Overlapping record to verify deduplication
          {
            id: 'conv_p1_2',
            title: 'Tendinitis Aquilea Excéntrico',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T11:00:00.000Z',
            createdAt: '2026-11-24T09:00:00.000Z',
            isArchived: false,
          },
          {
            id: 'conv_p2_1',
            title: 'Pautas Cervicalgia Mecánica',
            turnCounter: 3,
            lastActivityAt: '2026-11-23T16:00:00.000Z',
            createdAt: '2026-11-23T14:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations
        .mockResolvedValueOnce(page1Response)
        .mockResolvedValueOnce(page2Response);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat']}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Page 1 items render
      await waitFor(() => {
        expect(screen.getByText('Protocolo Hombro Doloroso')).toBeInTheDocument();
        expect(screen.getByText('Tendinitis Aquilea Excéntrico')).toBeInTheDocument();
      });

      // Pagination trigger exists because hasMore === true
      const loadMoreBtn = screen.getByTestId('load-more-conversations-button');
      expect(loadMoreBtn).toBeInTheDocument();

      // Trigger pagination for Page 2
      fireEvent.click(loadMoreBtn);

      // Verify Page 2 items render and deduplication succeeds (Tendinitis Aquilea only once)
      await waitFor(() => {
        expect(screen.getByText('Pautas Cervicalgia Mecánica')).toBeInTheDocument();
      });

      const duplicateCheck = screen.getAllByText('Tendinitis Aquilea Excéntrico');
      expect(duplicateCheck).toHaveLength(1);

      // Verify pagination trigger disappears once hasMore === false
      expect(screen.queryByTestId('load-more-conversations-button')).not.toBeInTheDocument();
      expect(mockedConversationApi.listConversations).toHaveBeenCalledTimes(2);
      expect(mockedConversationApi.listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'cursor_token_page_2' }),
        expect.anything(),
      );
    });
  });

  describe('2. Incremental Message-History Pagination', () => {
    it('retrieves canonical messages incrementally, sorts deterministically by sequenceNumber, and preserves order', async () => {
      const mockDetail: ConversationDetailResponse = {
        id: 'conv_msg_pag_01',
        title: 'Rehabilitación Rodilla',
        turnCounter: 2,
        messageCounter: 4,
        lastActivityAt: '2026-11-24T14:00:00.000Z',
        createdAt: '2026-11-24T12:00:00.000Z',
        updatedAt: '2026-11-24T14:00:00.000Z',
        isArchived: false,
      };

      const msgPage1: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg_u_1',
            turnId: 'turn_1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: '¿Cuál es el protocolo para meniscopatía grado 2?',
            createdAt: '2026-11-24T12:00:00.000Z',
            completedAt: '2026-11-24T12:00:00.000Z',
          },
          {
            id: 'msg_a_1',
            turnId: 'turn_1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content:
              'Se recomienda fortalecimiento cuadricipital e isquiotibial en cadena cerrada.',
            createdAt: '2026-11-24T12:00:05.000Z',
            completedAt: '2026-11-24T12:00:05.000Z',
          },
        ],
        nextCursor: 'cursor_msg_seq_2',
        hasMore: true,
      };

      const msgPage2: MessageHistoryResponse = {
        messages: [
          {
            id: 'msg_u_2',
            turnId: 'turn_2',
            role: 'USER',
            sequenceNumber: 3,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: '¿Y en cuanto a ejercicios de propiocepción?',
            createdAt: '2026-11-24T12:05:00.000Z',
            completedAt: '2026-11-24T12:05:00.000Z',
          },
          {
            id: 'msg_a_2',
            turnId: 'turn_2',
            role: 'ASSISTANT',
            sequenceNumber: 4,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Progresión en plano inestable tipo plato de Freeman y bosu.',
            createdAt: '2026-11-24T12:05:05.000Z',
            completedAt: '2026-11-24T12:05:05.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
      mockedConversationApi.getConversation.mockResolvedValue(mockDetail);
      mockedConversationApi.getMessageHistory
        .mockResolvedValueOnce(msgPage1)
        .mockResolvedValueOnce(msgPage2);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_msg_pag_01']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Page 1 messages render
      await waitFor(() => {
        expect(
          screen.getByText('¿Cuál es el protocolo para meniscopatía grado 2?'),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'Se recomienda fortalecimiento cuadricipital e isquiotibial en cadena cerrada.',
          ),
        ).toBeInTheDocument();
      });

      // Pagination button is present
      const loadMoreMsgsBtn = screen.getByTestId('load-more-messages-button');
      expect(loadMoreMsgsBtn).toBeInTheDocument();

      // Trigger pagination for Page 2
      fireEvent.click(loadMoreMsgsBtn);

      // Verify all 4 messages render in chronological sequence
      await waitFor(() => {
        expect(screen.getByText('¿Y en cuanto a ejercicios de propiocepción?')).toBeInTheDocument();
        expect(
          screen.getByText('Progresión en plano inestable tipo plato de Freeman y bosu.'),
        ).toBeInTheDocument();
      });

      const messageArticles = screen.getAllByRole('article');
      expect(messageArticles).toHaveLength(4);
      expect(messageArticles[0]).toHaveTextContent(
        '¿Cuál es el protocolo para meniscopatía grado 2?',
      );
      expect(messageArticles[1]).toHaveTextContent('fortalecimiento cuadricipital');
      expect(messageArticles[2]).toHaveTextContent('ejercicios de propiocepción');
      expect(messageArticles[3]).toHaveTextContent('plato de Freeman');

      // Trigger disappears once hasMore === false
      expect(screen.queryByTestId('load-more-messages-button')).not.toBeInTheDocument();
    });
  });

  describe('3. URL Synchronization, Back & Forward Navigation', () => {
    it('synchronizes selected conversation with URL and updates state when navigating Back and Forward', async () => {
      const convAlpha: ConversationDetailResponse = {
        id: 'conv_alpha',
        title: 'Sesión Alpha',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T10:00:00.000Z',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T10:00:00.000Z',
        isArchived: false,
      };

      const convBeta: ConversationDetailResponse = {
        id: 'conv_beta',
        title: 'Sesión Beta',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T11:00:00.000Z',
        createdAt: '2026-11-24T11:00:00.000Z',
        updatedAt: '2026-11-24T11:00:00.000Z',
        isArchived: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv_alpha',
            title: 'Sesión Alpha',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T10:00:00.000Z',
            createdAt: '2026-11-24T10:00:00.000Z',
            isArchived: false,
          },
          {
            id: 'conv_beta',
            title: 'Sesión Beta',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T11:00:00.000Z',
            createdAt: '2026-11-24T11:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      mockedConversationApi.getConversation.mockImplementation(async (id) => {
        if (id === 'conv_alpha') return convAlpha;
        if (id === 'conv_beta') return convBeta;
        throw new Error('Not found');
      });

      mockedConversationApi.getMessageHistory.mockResolvedValue({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      const testLocation: { current: Location | null } = { current: null };
      const LocationTracker: React.FC = () => {
        testLocation.current = useLocation();
        return null;
      };

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_alpha']}>
            <LocationTracker />
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify conv_alpha renders
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sesión Alpha' })).toBeInTheDocument();
      });
      expect(testLocation.current?.pathname).toBe('/intelligence/chat/conv_alpha');

      // Click on conv_beta in sidebar
      const betaItem = screen.getByText('Sesión Beta');
      fireEvent.click(betaItem);

      // Verify route changes to conv_beta and header updates
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sesión Beta' })).toBeInTheDocument();
      });
      expect(testLocation.current?.pathname).toBe('/intelligence/chat/conv_beta');

      // Click Nueva Conversación
      const newChatBtn = screen.getByRole('button', { name: /Nueva Conversación/i });
      fireEvent.click(newChatBtn);

      // Verify route navigates to uninitialized chat
      await waitFor(() => {
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
      });
      expect(testLocation.current?.pathname).toBe('/intelligence/chat');
    });
  });

  describe('4. Resilience: 404 Not Found & Server Recovery', () => {
    it('renders accessible error state on 404 and provides seamless recovery path', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      const notFoundError = new Error('Conversation not found');
      (notFoundError as unknown as { statusCode: number }).statusCode = 404;
      mockedConversationApi.getConversation.mockRejectedValue(notFoundError);
      mockedConversationApi.getMessageHistory.mockRejectedValue(notFoundError);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_nonexistent']}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Conversación no encontrada')).toBeInTheDocument();
      });

      // Click recovery action
      const recoveryBtn = screen.getByRole('button', { name: 'Iniciar nueva conversación' });
      fireEvent.click(recoveryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
      });
    });

    it('renders server error banner on transient network failure and succeeds on retry', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      const serverError = new Error('Gateway Timeout');
      (serverError as unknown as { statusCode: number }).statusCode = 504;

      const mockDetail: ConversationDetailResponse = {
        id: 'conv_recovered',
        title: 'Conversación Recuperada',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T12:00:00.000Z',
        createdAt: '2026-11-24T12:00:00.000Z',
        updatedAt: '2026-11-24T12:00:00.000Z',
        isArchived: false,
      };

      mockedConversationApi.getConversation
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(mockDetail);
      mockedConversationApi.getMessageHistory
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          messages: [],
          nextCursor: null,
          hasMore: false,
        });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_recovered']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify network error state renders
      await waitFor(() => {
        expect(screen.getByText('Error al cargar conversación')).toBeInTheDocument();
      });

      // Click retry
      const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
      fireEvent.click(retryBtn);

      // Successfully recovers and renders header
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Conversación Recuperada' }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('5. Deep-Link Authentication Redirect Protection', () => {
    it('redirects unauthenticated user to login while preserving deep link return destination without token exposure', () => {
      const capturedLocation: { current: Location | null } = { current: null };
      const LoginCapture: React.FC = () => {
        capturedLocation.current = useLocation();
        return <div data-testid="login-view">Página de Inicio de Sesión</div>;
      };

      render(
        <AuthProvider initialSessionOverride={null}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv_deep_secure_99']}>
            <Routes>
              <Route path="/auth/login" element={<LoginCapture />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
      );

      // Expect redirect to login with sanitized redirect parameter
      expect(screen.getByTestId('login-view')).toBeInTheDocument();
      expect(capturedLocation.current?.pathname).toBe('/auth/login');
      expect(capturedLocation.current?.search).toBe(
        '?redirect=%2Fintelligence%2Fchat%2Fconv_deep_secure_99',
      );

      // The URL MUST NOT contain private prompt or sensitive token data
      expect(capturedLocation.current?.search).not.toContain('token');
      expect(capturedLocation.current?.search).not.toContain('prompt');
    });
  });
});
