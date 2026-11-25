import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationSidebar } from '../components/conversation-sidebar';
import { conversationApi } from '../api/conversation.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import type { ListConversationsResponse } from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockedConversationApi = jest.mocked(conversationApi);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('FE.04 — Conversation Listing & History Navigation', () => {
  const tenantId = 'tenant_fe04';
  const userId = 'usr_fe04';

  const onSelectConversationMock = jest.fn();
  const onNewConversationMock = jest.fn();
  const onCloseMobileMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  const now = new Date();
  const todayIso = new Date(now.getTime() - 1000 * 60 * 30).toISOString(); // 30 mins ago
  const yesterdayIso = new Date(now.getTime() - 1000 * 60 * 60 * 26).toISOString(); // 26 hrs ago
  const fiveDaysAgoIso = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(); // 5 days ago

  const mockConversationsList: ListConversationsResponse = {
    items: [
      {
        id: 'conv-today-1',
        title: 'Evaluación Postural Lumbar',
        turnCounter: 3,
        lastActivityAt: todayIso,
        createdAt: todayIso,
        isArchived: false,
      },
      {
        id: 'conv-yesterday-1',
        title:
          'Rehabilitación de Tendón de Aquiles con Ejercicios Excéntricos Extensos y Muy Detallados',
        turnCounter: 5,
        lastActivityAt: yesterdayIso,
        createdAt: yesterdayIso,
        isArchived: false,
      },
      {
        id: 'conv-older-1',
        title: 'Guía Clínica Cervical',
        turnCounter: 1,
        lastActivityAt: fiveDaysAgoIso,
        createdAt: fiveDaysAgoIso,
        isArchived: false,
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  describe('1. Conversation History Listing & Date Grouping', () => {
    it('renders conversations grouped by Hoy, Ayer, and Últimos 7 días with metadata', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv-today-1"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      // Verify date group headers exist
      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Ayer')).toBeInTheDocument();
      expect(screen.getByText('Últimos 7 días')).toBeInTheDocument();

      // Verify conversation items and turn metadata
      expect(screen.getByText('Evaluación Postural Lumbar')).toBeInTheDocument();
      expect(screen.getByText(/3 turnos/i)).toBeInTheDocument();

      expect(
        screen.getByText(
          'Rehabilitación de Tendón de Aquiles con Ejercicios Excéntricos Extensos y Muy Detallados',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/5 turnos/i)).toBeInTheDocument();

      expect(screen.getByText('Guía Clínica Cervical')).toBeInTheDocument();
      expect(screen.getByText(/1 turno/i)).toBeInTheDocument();
    });

    it('indicates the active conversation with aria-current="true" and distinctive styling', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv-today-1"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Evaluación Postural Lumbar')).toBeInTheDocument();
      });

      const activeItem = screen.getByTestId('conversation-item-conv-today-1');
      expect(activeItem).toHaveAttribute('aria-current', 'true');
      expect(activeItem.className).toContain('border-primary');

      const inactiveItem = screen.getByTestId('conversation-item-conv-older-1');
      expect(inactiveItem).not.toHaveAttribute('aria-current');
    });

    it('gracefully handles and truncates long titles with accessible tooltip title attribute', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv-today-1"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const longTitleText =
        'Rehabilitación de Tendón de Aquiles con Ejercicios Excéntricos Extensos y Muy Detallados';
      await waitFor(() => {
        expect(screen.getByText(longTitleText)).toBeInTheDocument();
      });

      const spanElement = screen.getByText(longTitleText);
      expect(spanElement.className).toContain('truncate');
      expect(spanElement).toHaveAttribute('title', longTitleText);
    });
  });

  describe('2. Navigation & Selection Behavior', () => {
    it('triggers onSelectConversation when an item is clicked', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv-today-1"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Guía Clínica Cervical')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Guía Clínica Cervical'));

      expect(onSelectConversationMock).toHaveBeenCalledWith('conv-older-1');
      expect(onCloseMobileMock).toHaveBeenCalled();
    });

    it('supports keyboard navigation via Enter and Space keys', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv-today-1"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Guía Clínica Cervical')).toBeInTheDocument();
      });

      const button = screen.getByTestId('conversation-item-conv-older-1');

      // Enter key
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(onSelectConversationMock).toHaveBeenCalledWith('conv-older-1');

      // Space key
      fireEvent.keyDown(button, { key: ' ' });
      expect(onSelectConversationMock).toHaveBeenCalledTimes(2);
    });

    it('triggers onNewConversation when New Conversation button is clicked', () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      const newBtn = screen.getAllByRole('button', { name: /Nueva Conversación/i })[0];
      fireEvent.click(newBtn!);

      expect(onNewConversationMock).toHaveBeenCalled();
      expect(onCloseMobileMock).toHaveBeenCalled();
    });
  });

  describe('3. Loading, Empty, and Error States', () => {
    it('displays empty state with call-to-action when user has zero conversations', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Sin conversaciones')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Inicia un nuevo chat para consultar protocolos y manuales clínicos/i),
      ).toBeInTheDocument();
    });

    it('displays error state and allows retry when query fails', async () => {
      mockedConversationApi.listConversations
        .mockRejectedValueOnce(new Error('Network connectivity issue'))
        .mockResolvedValueOnce(mockConversationsList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Error al cargar historial')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Evaluación Postural Lumbar')).toBeInTheDocument();
      });
    });
  });
});
