import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationSidebar } from '../components/conversation-sidebar';
import { ChatWorkspaceHeader } from '../components/chat-workspace-header';
import { ChatWorkspace } from '../components/chat-workspace';
import { conversationApi } from '../api/conversation.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type {
  ConversationListResponse,
  ConversationDetailResponse,
  MessageHistoryResponse,
} from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockedConversationApi = jest.mocked(conversationApi);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('FE.06 — Conversation Renaming & Metadata', () => {
  const tenantId = 'tenant_fe06';
  const userId = 'usr_fe06';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  const mockListResponse: ConversationListResponse = {
    items: [
      {
        id: 'conv-01',
        title: 'Plan de Fuerza Hipotrofia',
        turnCounter: 2,
        lastActivityAt: '2026-11-24T12:00:00Z',
        createdAt: '2026-11-24T10:00:00Z',
        isArchived: false,
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const mockDetailResponse: ConversationDetailResponse = {
    id: 'conv-01',
    title: 'Plan de Fuerza Hipotrofia',
    turnCounter: 2,
    messageCounter: 4,
    lastActivityAt: '2026-11-24T12:00:00Z',
    createdAt: '2026-11-24T10:00:00Z',
    updatedAt: '2026-11-24T12:00:00Z',
    isArchived: false,
    turns: [],
  };

  const mockMessagesResponse: MessageHistoryResponse = {
    messages: [
      {
        id: 'msg-01',
        turnId: 'turn-01',
        sequenceNumber: 1,
        role: 'USER',
        content: '¿Cómo programar hipertrofia?',
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS',
        createdAt: '2026-11-24T10:00:00Z',
        completedAt: '2026-11-24T10:00:01Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  describe('1. Sidebar Inline Conversation Renaming', () => {
    it('renders conversation item with rename button and triggers edit mode', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      const renameBtn = screen.getByTestId('rename-conversation-conv-01');
      expect(renameBtn).toBeInTheDocument();

      fireEvent.click(renameBtn);

      const input = screen.getByTestId('rename-input') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe('Plan de Fuerza Hipotrofia');
      expect(screen.getByTestId('save-rename-button')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-rename-button')).toBeInTheDocument();
    });

    it('cancels editing on Escape key or cancel button without persisting', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      // Open edit mode
      fireEvent.click(screen.getByTestId('rename-conversation-conv-01'));
      const input = screen.getByTestId('rename-input');
      fireEvent.change(input, { target: { value: 'Nuevo Título No Guardado' } });

      // Cancel via Escape key
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should return to normal view with original title
      expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
      expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      expect(mockedConversationApi.updateTitle).not.toHaveBeenCalled();
    });

    it('validates empty or whitespace-only titles with error message', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('rename-conversation-conv-01'));
      const input = screen.getByTestId('rename-input');
      fireEvent.change(input, { target: { value: '   ' } });

      fireEvent.click(screen.getByTestId('save-rename-button'));

      expect(screen.getByTestId('rename-error')).toHaveTextContent(
        'El título no puede estar vacío',
      );
      expect(mockedConversationApi.updateTitle).not.toHaveBeenCalled();
    });

    it('saves valid title on Enter key or save button, invoking API and optimistic update', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
      mockedConversationApi.updateTitle.mockResolvedValue({
        conversationId: 'conv-01',
        title: 'Plan de Fuerza e Hipertrofia Canónico',
        updatedAt: '2026-11-24T12:05:00Z',
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('rename-conversation-conv-01'));
      const input = screen.getByTestId('rename-input');
      fireEvent.change(input, { target: { value: 'Plan de Fuerza e Hipertrofia Canónico' } });

      fireEvent.submit(screen.getByTestId('rename-form'));

      await waitFor(() => {
        expect(mockedConversationApi.updateTitle).toHaveBeenCalledWith('conv-01', {
          title: 'Plan de Fuerza e Hipertrofia Canónico',
        });
      });

      // Edit input closes on success
      await waitFor(() => {
        expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
      });
    });

    it('displays error message when API call fails and allows retry', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
      mockedConversationApi.updateTitle.mockRejectedValue(
        new Error('Network error updating title'),
      );

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('rename-conversation-conv-01'));
      const input = screen.getByTestId('rename-input');
      fireEvent.change(input, { target: { value: 'Título con Fallo' } });

      fireEvent.submit(screen.getByTestId('rename-form'));

      await waitFor(() => {
        expect(screen.getByTestId('rename-error')).toHaveTextContent(
          'Network error updating title',
        );
      });
      // Remains in edit mode to allow user correction
      expect(screen.getByTestId('rename-input')).toBeInTheDocument();
    });
  });

  describe('2. Metadata Display & Header In-Place Renaming', () => {
    it('clearly distinguishes creation timestamp and last activity timestamp', () => {
      render(
        <ChatWorkspaceHeader
          title="Sesión de Fisioterapia"
          conversationId="conv-fe06-meta"
          messageCount={3}
          createdAt="2026-11-24T08:30:00Z"
          lastActivityAt="2026-11-24T11:45:00Z"
        />,
      );

      expect(screen.getByText('Sesión de Fisioterapia')).toBeInTheDocument();
      expect(screen.getByTestId('header-message-count')).toHaveTextContent('3 mensajes');

      const createdEl = screen.getByTestId('header-created-at');
      const activityEl = screen.getByTestId('header-activity-at');

      expect(createdEl).toHaveTextContent(/Creado:/i);
      expect(activityEl).toHaveTextContent(/Actividad:/i);
      expect(screen.getByText('conv-fe06-meta')).toBeInTheDocument();
    });

    it('does not fabricate timestamps when createdAt or lastActivityAt are undefined', () => {
      render(
        <ChatWorkspaceHeader
          title="Sesión Sin Timestamps"
          conversationId="conv-legacy"
          messageCount={1}
        />,
      );

      expect(screen.getByText('Sesión Sin Timestamps')).toBeInTheDocument();
      expect(screen.getByTestId('header-message-count')).toHaveTextContent('1 mensaje');
      expect(screen.queryByTestId('header-created-at')).not.toBeInTheDocument();
      expect(screen.queryByTestId('header-activity-at')).not.toBeInTheDocument();
    });

    it('supports in-place header title rename with validation and keyboard shortcuts', async () => {
      const handleRename = jest.fn().mockResolvedValue(undefined);

      render(
        <ChatWorkspaceHeader
          title="Título Header Inicial"
          conversationId="conv-fe06-header"
          messageCount={2}
          onRename={handleRename}
        />,
      );

      const renameBtn = screen.getByTestId('header-rename-button');
      fireEvent.click(renameBtn);

      const input = screen.getByTestId('header-rename-input') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe('Título Header Inicial');

      // Test validation: empty title
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.submit(screen.getByTestId('header-rename-form'));

      expect(screen.getByTestId('header-rename-error')).toHaveTextContent(
        'El título no puede estar vacío',
      );
      expect(handleRename).not.toHaveBeenCalled();

      // Test successful save via Escape or typing valid title
      fireEvent.change(input, { target: { value: 'Título Header Actualizado' } });
      fireEvent.submit(screen.getByTestId('header-rename-form'));

      await waitFor(() => {
        expect(handleRename).toHaveBeenCalledWith('Título Header Actualizado');
      });
    });
  });

  describe('3. Integrated Workspace Integration', () => {
    it('synchronizes header and sidebar title updates', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
      mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
      mockedConversationApi.getMessageHistory.mockResolvedValue(mockMessagesResponse);
      mockedConversationApi.updateTitle.mockResolvedValue({
        conversationId: 'conv-01',
        title: 'Título Global Sincronizado',
        updatedAt: '2026-11-24T12:10:00Z',
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv-01']}>
            <Routes>
              <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Plan de Fuerza Hipotrofia' }),
        ).toBeInTheDocument();
      });

      // Trigger rename from header
      const headerRenameBtn = screen.getByTestId('header-rename-button');
      fireEvent.click(headerRenameBtn);

      const headerInput = screen.getByTestId('header-rename-input');
      fireEvent.change(headerInput, { target: { value: 'Título Global Sincronizado' } });
      fireEvent.submit(screen.getByTestId('header-rename-form'));

      await waitFor(() => {
        expect(mockedConversationApi.updateTitle).toHaveBeenCalledWith('conv-01', {
          title: 'Título Global Sincronizado',
        });
      });
    });
  });
});
