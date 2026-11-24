import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatWorkspace } from '../components/chat-workspace';
import { ChatMessageFeed } from '../components/chat-message-feed';
import { assistantStorageService } from '../services/assistant-storage.service';
import type { ChatMessage } from '../types/assistant.types';

function renderWithProviders(initialEntry = '/intelligence/chat') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/intelligence/chat" element={<ChatWorkspace />} />
          <Route path="/intelligence/chat/:conversationId" element={<ChatWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AI Assistant Chat Workspace (AI-09.2.02)', () => {
  const tenantId = 'global';
  const userId = 'anonymous';

  beforeAll(() => {
    HTMLElement.prototype.scrollTo = jest.fn();
  });

  beforeEach(() => {
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('Empty & Initial States', () => {
    it('renders chat workspace with empty state and prompt suggestions at /intelligence/chat', () => {
      renderWithProviders('/intelligence/chat');

      expect(screen.getByTestId('chat-workspace')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('chat-workspace-header')).toBeInTheDocument();
      expect(screen.getByTestId('chat-composer')).toBeInTheDocument();
      expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();

      // Verify clinical suggestion buttons exist
      expect(
        screen.getByText(
          /¿Cuáles son las contraindicaciones absolutas del vendaje neuromuscular\?/i,
        ),
      ).toBeInTheDocument();
    });

    it('displays empty history state in sidebar when no conversations exist', async () => {
      renderWithProviders('/intelligence/chat');
      const sidebar = screen.getByTestId('conversation-sidebar');
      await waitFor(() => {
        expect(within(sidebar).getByText('Sin conversaciones')).toBeInTheDocument();
      });
    });
  });

  describe('Route-Driven Loading & Selection', () => {
    it('loads and renders persisted conversation based on URL route parameter', async () => {
      const conv = assistantStorageService.createConversation(
        tenantId,
        userId,
        'Consulta Cervical',
      );

      const userMsg: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: '¿Cuál es el protocolo cervical?',
        createdAt: '2026-11-21T10:00:00Z',
        status: 'success',
      };
      const assistantMsg: ChatMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: 'El protocolo incluye movilizaciones pasivas y calor local.',
        createdAt: '2026-11-21T10:00:05Z',
        status: 'success',
        grounded: true,
        sources: [
          {
            documentId: 'doc-1',
            documentTitle: 'Guía Clínica Cervical',
            chunkId: 'chk-1',
            pageNumber: 8,
            relevanceScore: 0.94,
          },
        ],
        metadata: {
          model: 'mistral:latest',
          retrievalCount: 2,
          latencyMs: 230,
        },
      };

      assistantStorageService.appendMessage(tenantId, userId, conv.id, userMsg);
      assistantStorageService.appendMessage(tenantId, userId, conv.id, assistantMsg);

      renderWithProviders(`/intelligence/chat/${conv.id}`);

      // Verify header reflects thread title
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Consulta Cervical');
      });

      // Verify messages rendered
      expect(screen.getByText('¿Cuál es el protocolo cervical?')).toBeInTheDocument();
      expect(
        screen.getByText('El protocolo incluye movilizaciones pasivas y calor local.'),
      ).toBeInTheDocument();

      // Verify citation and telemetry rendered
      expect(screen.getByTestId('message-citations')).toBeInTheDocument();
      expect(screen.getByText('Guía Clínica Cervical')).toBeInTheDocument();
      expect(screen.getByText('mistral:latest')).toBeInTheDocument();
      expect(screen.getByText('230ms')).toBeInTheDocument();
    });

    it('renders conversation not found error state when given an invalid ID', async () => {
      renderWithProviders('/intelligence/chat/non-existent-conv-id');

      await waitFor(() => {
        expect(screen.getByText('Conversación no encontrada')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/La sesión solicitada no existe o fue eliminada/i),
      ).toBeInTheDocument();
      expect(screen.getByText('Iniciar nueva conversación')).toBeInTheDocument();
    });
  });

  describe('Message Ordering & Duplicate Prevention', () => {
    it('orders messages chronologically by createdAt ascending and prevents duplicate rendering', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-second',
          role: 'assistant',
          content: 'Second message in time',
          createdAt: '2026-11-21T12:00:00Z',
          status: 'success',
        },
        {
          id: 'msg-first',
          role: 'user',
          content: 'First message in time',
          createdAt: '2026-11-21T11:00:00Z',
          status: 'success',
        },
        {
          id: 'msg-first', // Duplicate ID
          role: 'user',
          content: 'Duplicate first message',
          createdAt: '2026-11-21T11:00:00Z',
          status: 'success',
        },
      ];

      render(<ChatMessageFeed messages={messages} />);

      const articles = screen.getAllByRole('article');
      expect(articles.length).toBe(2); // Duplicate discarded
      expect(articles[0]).toHaveTextContent('First message in time');
      expect(articles[1]).toHaveTextContent('Second message in time');
    });
  });

  describe('Sidebar Interaction & Mobile Drawer', () => {
    it('lists conversations in sidebar and allows deleting a thread', async () => {
      const conv = assistantStorageService.createConversation(tenantId, userId, 'Thread to delete');

      renderWithProviders(`/intelligence/chat/${conv.id}`);

      const sidebar = screen.getByTestId('conversation-sidebar');
      await waitFor(() => {
        expect(within(sidebar).getByText('Thread to delete')).toBeInTheDocument();
      });

      const deleteBtn = within(sidebar).getByLabelText('Eliminar conversación Thread to delete');
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(assistantStorageService.getConversations(tenantId, userId).length).toBe(0);
      });
    });

    it('toggles mobile drawer when mobile menu button is clicked', () => {
      renderWithProviders('/intelligence/chat');

      const menuBtn = screen.getByLabelText('Abrir panel de conversaciones');
      fireEvent.click(menuBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const closeBtn = within(dialog).getByLabelText('Cerrar panel de conversaciones');
      fireEvent.click(closeBtn);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
