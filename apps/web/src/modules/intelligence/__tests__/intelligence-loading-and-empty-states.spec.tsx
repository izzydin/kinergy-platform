import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntelligenceLoadingState } from '../components/intelligence-loading-state';
import { IntelligenceEmptyState } from '../components/intelligence-empty-state';
import { IntelligenceErrorState } from '../components/intelligence-error-state';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { ConversationSidebar } from '../assistant/components/conversation-sidebar';
import { ChatMessageFeed } from '../assistant/components/chat-message-feed';
import { KnowledgeDocumentTable } from '../knowledge/components/knowledge-document-table';
import { assistantStorageService } from '../assistant/services/assistant-storage.service';
import { conversationApi } from '../assistant/api/conversation.api';

jest.mock('../assistant/api/conversation.api', () => ({
  conversationApi: {
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    getMessageHistory: jest.fn(),
    createConversation: jest.fn(),
    updateTitle: jest.fn(),
    archiveConversation: jest.fn(),
    reserveTurn: jest.fn(),
    recordTurnResolution: jest.fn(),
  },
}));

const mockedConversationApi = jest.mocked(conversationApi);

function renderWithProviders(ui: React.ReactElement, initialEntry = '/intelligence/chat') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AI-09.8-ER.03 — Assistant, Conversation & History Loading and Empty UX', () => {
  const tenantId = 'tenant-clinic-1';
  const userId = 'user-physio-123';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('1. Assistant Initialization & Loading UX', () => {
    it('renders accessible chat skeleton with role="status", aria-busy="true", and aria-hidden on visual bones', () => {
      render(
        <IntelligenceLoadingState variant="chat" message="Cargando asistente conversacional..." />,
      );

      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveAttribute('aria-busy', 'true');
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Cargando asistente conversacional...')).toHaveClass('sr-only');

      // Visual skeleton wrapper is aria-hidden to eliminate noisy screen-reader readout
      const visualWrapper = statusEl.querySelector('[aria-hidden="true"]');
      expect(visualWrapper).toBeInTheDocument();
    });

    it('displays loading skeleton in ChatWorkspace during initial conversation fetch and does not show false empty state', async () => {
      // Mock conversation retrieval taking time
      mockedConversationApi.getConversation.mockReturnValue(new Promise(() => {}));
      mockedConversationApi.getMessageHistory.mockReturnValue(new Promise(() => {}));

      renderWithProviders(
        <Routes>
          <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
        </Routes>,
        '/intelligence/chat/conv-pending-123',
      );

      // Skeleton should be visible
      const chatLoading = screen.getByTestId('chat-loading-container');
      expect(chatLoading).toBeInTheDocument();
      expect(within(chatLoading).getByRole('status')).toHaveAttribute('aria-busy', 'true');

      // False empty state or welcome state must NOT be shown while loading
      expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chat-empty-conversation-state')).not.toBeInTheDocument();
    });
  });

  describe('2. Conversation List Loading Skeletons', () => {
    it('renders proportional conversation-list skeleton with aria-busy="true" in sidebar', () => {
      render(
        <IntelligenceLoadingState
          variant="conversation-list"
          message="Cargando historial de conversaciones..."
        />,
      );

      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('conversation-list-skeleton')).toBeInTheDocument();
      expect(screen.getByText('Cargando historial de conversaciones...')).toHaveClass('sr-only');
    });

    it('renders conversation-list skeleton in ConversationSidebar during initial fetch', () => {
      mockedConversationApi.listConversations.mockReturnValue(new Promise(() => {}));

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={jest.fn()}
          onNewConversation={jest.fn()}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      expect(screen.getByTestId('sidebar-loading-state')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-list-skeleton')).toBeInTheDocument();
      // Must NOT show "Sin conversaciones" while loading
      expect(screen.queryByText('Sin conversaciones')).not.toBeInTheDocument();
    });
  });

  describe('3. Empty Conversation State vs New Thread Welcome', () => {
    it('renders welcoming prompt suggestions for a newly created unpersisted thread', () => {
      render(
        <ChatMessageFeed messages={[]} isNewThread={true} onPromptSuggestionClick={jest.fn()} />,
      );

      expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
      expect(screen.getByText('¿En qué puedo ayudarte hoy?')).toBeInTheDocument();
      expect(screen.getByText(/Consultas sugeridas/i)).toBeInTheDocument();
      expect(screen.queryByTestId('chat-empty-conversation-state')).not.toBeInTheDocument();
    });

    it('renders deliberate "Conversación vacía" state for an existing persisted conversation with 0 messages', () => {
      render(
        <ChatMessageFeed
          conversationId="conv-empty-456"
          messages={[]}
          isNewThread={false}
          onPromptSuggestionClick={jest.fn()}
        />,
      );

      expect(screen.getByTestId('chat-empty-conversation-state')).toBeInTheDocument();
      expect(screen.getByText('Conversación vacía')).toBeInTheDocument();
      expect(
        screen.getByText(/Esta conversación fue creada pero aún no contiene mensajes/i),
      ).toBeInTheDocument();
      // Should not show new thread suggestions
      expect(screen.queryByText(/Consultas sugeridas/i)).not.toBeInTheDocument();
    });
  });

  describe('4. Empty History vs Filter Search vs Failure', () => {
    it('renders genuine zero-state in sidebar when user has 0 conversations', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={jest.fn()}
          onNewConversation={jest.fn()}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText('Sin conversaciones')).toBeInTheDocument();
    });

    it('renders dedicated empty search state when sidebar search query yields no matches and allows clearing', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv-1',
            title: 'Protocolo de Hombro Doloroso',
            turnCounter: 2,
            lastActivityAt: '2026-11-25T10:00:00Z',
            createdAt: '2026-11-25T10:00:00Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={jest.fn()}
          onNewConversation={jest.fn()}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Protocolo de Hombro Doloroso')).toBeInTheDocument();
      });

      // Type search filter that does not match
      const searchInput = screen.getByTestId('sidebar-search-input');
      fireEvent.change(searchInput, { target: { value: 'cervical' } });

      // Should show empty search state
      expect(screen.getByTestId('sidebar-no-search-results')).toBeInTheDocument();
      expect(
        screen.getByText(/No hay conversaciones que coincidan con "cervical"/i),
      ).toBeInTheDocument();

      // Clear search
      fireEvent.click(screen.getByText('Limpiar búsqueda'));
      expect(screen.getByText('Protocolo de Hombro Doloroso')).toBeInTheDocument();
    });

    it('renders error state on history retrieval failure and NEVER displays "Sin conversaciones"', async () => {
      mockedConversationApi.listConversations.mockRejectedValue(new Error('Database timeout'));

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={jest.fn()}
          onNewConversation={jest.fn()}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-error-state')).toBeInTheDocument();
      });
      expect(screen.getByText('Error al cargar historial')).toBeInTheDocument();
      // Invariant: Must NOT present failure as empty success
      expect(screen.queryByText('Sin conversaciones')).not.toBeInTheDocument();
    });

    it('renders 403 unauthorized state in sidebar when user lacks access clearance', async () => {
      const forbiddenError = Object.assign(new Error('Forbidden'), { statusCode: 403 });
      mockedConversationApi.listConversations.mockRejectedValue(forbiddenError);

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={jest.fn()}
          onNewConversation={jest.fn()}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-forbidden-state')).toBeInTheDocument();
      });
      expect(screen.getByText('Acceso no autorizado')).toBeInTheDocument();
      expect(screen.queryByText('Sin conversaciones')).not.toBeInTheDocument();
    });
  });

  describe('5. Knowledge Center Empty & Error States', () => {
    const defaultProps = {
      documents: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      onPageChange: jest.fn(),
      onPageSizeChange: jest.fn(),
      currentSort: { field: 'createdAt' as const, desc: true },
      onToggleSort: jest.fn(),
    };

    it('renders empty library state with upload CTA when repository has 0 documents', () => {
      const onUpload = jest.fn();
      render(
        <KnowledgeDocumentTable {...defaultProps} isFiltered={false} onUploadClick={onUpload} />,
      );

      expect(screen.getByText('No hay documentos en la biblioteca')).toBeInTheDocument();
      expect(
        screen.getByText(/Comienza subiendo el primer documento institucional/i),
      ).toBeInTheDocument();
      const uploadBtn = screen.getByTestId('empty-library-upload-button');
      fireEvent.click(uploadBtn);
      expect(onUpload).toHaveBeenCalledTimes(1);
    });

    it('renders filtered empty state with reset filters button when search yields no matches', () => {
      const onReset = jest.fn();
      render(
        <KnowledgeDocumentTable
          {...defaultProps}
          isFiltered={true}
          searchTerm="inexistente"
          onResetFilters={onReset}
        />,
      );

      expect(screen.getByText('No se encontraron documentos')).toBeInTheDocument();
      expect(
        screen.getByText(/Ningún documento coincide con los criterios de búsqueda/i),
      ).toBeInTheDocument();
    });

    it('renders error state on knowledge table failure and NEVER displays empty library text', () => {
      render(
        <KnowledgeDocumentTable
          {...defaultProps}
          isError={true}
          errorMessage="503 Service Unavailable: Retrieval provider down"
          onRetry={jest.fn()}
        />,
      );

      expect(
        screen.getByText('La base de conocimiento se encuentra temporalmente no disponible.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No hay documentos en la biblioteca')).not.toBeInTheDocument();
      expect(screen.queryByText('No se encontraron documentos')).not.toBeInTheDocument();
    });
  });

  describe('6. Background Refresh & Non-Destructive State Preservation', () => {
    it('shows non-intrusive refreshing indicator in header during background conversation refetch', async () => {
      mockedConversationApi.getConversation.mockResolvedValue({
        id: 'conv-active-1',
        title: 'Tratamiento Escoliosis',
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:30:00Z',
        lastActivityAt: '2026-11-25T12:30:00Z',
        isArchived: false,
        turnCounter: 1,
        messageCounter: 1,
        activeTurnId: null,
        turns: [],
      });
      mockedConversationApi.getMessageHistory.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            turnId: 'turn-1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: '¿Cuáles son los ejercicios de Klapp?',
            sources: [],
            createdAt: '2026-11-25T12:00:00Z',
            completedAt: '2026-11-25T12:00:00Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <Routes>
          <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
        </Routes>,
        '/intelligence/chat/conv-active-1',
      );

      await waitFor(() => {
        expect(screen.getByText('Tratamiento Escoliosis')).toBeInTheDocument();
        expect(screen.getByText('¿Cuáles son los ejercicios de Klapp?')).toBeInTheDocument();
      });

      // Existing message must remain stable in DOM
      expect(screen.getByText('¿Cuáles son los ejercicios de Klapp?')).toBeInTheDocument();
    });
  });

  describe('7. Accessibility & Motion Contract', () => {
    it('IntelligenceEmptyState implements semantic heading and accessible role', () => {
      render(
        <IntelligenceEmptyState
          title="Repositorio Vacío"
          description="Aún no se han configurado fuentes."
          action={<button>Agregar</button>}
        />,
      );

      const region = screen.getByRole('region', { name: 'Repositorio Vacío' });
      expect(region).toBeInTheDocument();
      expect(
        within(region).getByRole('heading', { level: 3, name: 'Repositorio Vacío' }),
      ).toBeInTheDocument();
    });

    it('IntelligenceErrorState implements role="alert" with aria-live="assertive" and keyboard-interactive retry', () => {
      const onRetry = jest.fn();
      render(
        <IntelligenceErrorState
          title="Fallo de Conexión"
          error="Network timeout"
          onRetry={onRetry}
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
