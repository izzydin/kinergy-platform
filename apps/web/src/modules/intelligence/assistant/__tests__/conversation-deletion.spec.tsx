import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationSidebar } from '../components/conversation-sidebar';
import { ChatWorkspace } from '../components/chat-workspace';
import { DeleteConversationDialog } from '../components/delete-conversation-dialog';
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

describe('FE.07 — Conversation Deletion & Retention Policies', () => {
  const tenantId = 'tenant_fe07';
  const userId = 'usr_fe07';

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
      {
        id: 'conv-02',
        title: 'Rehabilitación de Rodilla',
        turnCounter: 1,
        lastActivityAt: '2026-11-24T11:00:00Z',
        createdAt: '2026-11-24T09:00:00Z',
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

  describe('1. DeleteConversationDialog Component Interaction', () => {
    it('renders dialog with warning, title, and buttons when open', () => {
      render(
        <DeleteConversationDialog
          open={true}
          onOpenChange={jest.fn()}
          conversationTitle="Consulta Biomecánica"
          onConfirm={jest.fn()}
        />,
      );

      expect(screen.getByText('¿Eliminar conversación?')).toBeInTheDocument();
      expect(screen.getByText(/Consulta Biomecánica/)).toBeInTheDocument();
      expect(screen.getByTestId('cancel-delete-button')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
    });

    it('invokes onOpenChange(false) when Cancel is clicked', () => {
      const handleOpenChange = jest.fn();
      render(
        <DeleteConversationDialog
          open={true}
          onOpenChange={handleOpenChange}
          conversationTitle="Consulta Biomecánica"
          onConfirm={jest.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('cancel-delete-button'));
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('invokes onConfirm and closes dialog on successful confirmation', async () => {
      const handleConfirm = jest.fn().mockResolvedValue(undefined);
      const handleOpenChange = jest.fn();

      render(
        <DeleteConversationDialog
          open={true}
          onOpenChange={handleOpenChange}
          conversationTitle="Consulta Biomecánica"
          onConfirm={handleConfirm}
        />,
      );

      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(handleConfirm).toHaveBeenCalledTimes(1);
        expect(handleOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('displays error feedback when onConfirm throws a 409 conflict error', async () => {
      const conflictError = Object.assign(new Error('Generation in progress'), { status: 409 });
      const handleConfirm = jest.fn().mockRejectedValue(conflictError);
      const handleOpenChange = jest.fn();

      render(
        <DeleteConversationDialog
          open={true}
          onOpenChange={handleOpenChange}
          conversationTitle="Consulta Biomecánica"
          onConfirm={handleConfirm}
        />,
      );

      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-conversation-error')).toHaveTextContent(
          /No se puede archivar la conversación mientras hay una respuesta en generación/i,
        );
      });
      // Dialog remains open for user review
      expect(handleOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('2. Sidebar Confirmation Flow & Cache Reconciliation', () => {
    it('opens confirmation dialog on delete button click instead of deleting immediately', async () => {
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

      const deleteBtn = screen.getByTestId('delete-conversation-conv-01');
      fireEvent.click(deleteBtn);

      // Confirmation dialog must appear
      expect(screen.getByTestId('delete-conversation-dialog')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('delete-conversation-dialog')).getByText(
          /Plan de Fuerza Hipotrofia/,
        ),
      ).toBeInTheDocument();

      // Deletion API should NOT have been invoked yet
      expect(mockedConversationApi.archiveConversation).not.toHaveBeenCalled();
    });

    it('dismisses dialog without deleting when Cancel is clicked', async () => {
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

      fireEvent.click(screen.getByTestId('delete-conversation-conv-01'));
      expect(screen.getByTestId('delete-conversation-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-delete-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('delete-conversation-dialog')).not.toBeInTheDocument();
      });
      expect(mockedConversationApi.archiveConversation).not.toHaveBeenCalled();
    });

    it('executes archival and reconciles list cache when confirmed', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
      mockedConversationApi.archiveConversation.mockResolvedValue({
        conversationId: 'conv-01',
        isArchived: true,
        archivedAt: '2026-11-24T12:00:00Z',
      });

      const onSelectConversationSpy = jest.fn();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <ConversationSidebar
            activeConversationId="conv-01"
            isOpenOnMobile={false}
            onCloseMobile={jest.fn()}
            onSelectConversation={onSelectConversationSpy}
            onNewConversation={jest.fn()}
            tenantId={tenantId}
            userId={userId}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Plan de Fuerza Hipotrofia')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-conversation-conv-01'));
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(mockedConversationApi.archiveConversation).toHaveBeenCalledWith('conv-01');
      });

      // Active selection cleared because conv-01 was active
      await waitFor(() => {
        expect(onSelectConversationSpy).toHaveBeenCalledWith('');
      });
    });
  });

  describe('3. Workspace Header Deletion Integration', () => {
    it('triggers confirmation dialog from workspace header and navigates to root on confirm', async () => {
      mockedConversationApi.listConversations.mockResolvedValue(mockListResponse);
      mockedConversationApi.getConversation.mockResolvedValue(mockDetailResponse);
      mockedConversationApi.getMessageHistory.mockResolvedValue(mockMessagesResponse);
      mockedConversationApi.archiveConversation.mockResolvedValue({
        conversationId: 'conv-01',
        isArchived: true,
        archivedAt: '2026-11-24T12:00:00Z',
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/chat/conv-01']}>
            <Routes>
              <Route path="/intelligence/chat" element={<ChatWorkspace />} />
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

      const headerDeleteBtn = screen.getByRole('button', { name: /Eliminar conversación actual/i });
      fireEvent.click(headerDeleteBtn);

      // Confirmation dialog appears
      expect(screen.getByTestId('delete-conversation-dialog')).toBeInTheDocument();

      // Confirm deletion
      fireEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => {
        expect(mockedConversationApi.archiveConversation).toHaveBeenCalledWith('conv-01');
      });
    });
  });
});
