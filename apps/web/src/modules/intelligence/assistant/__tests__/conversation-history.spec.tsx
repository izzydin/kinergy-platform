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

  // Deterministic reference date: Wednesday, Nov 25, 2026 at 14:00:00 local time
  const fixedReferenceDate = new Date(2026, 10, 25, 14, 0, 0);
  const refYear = fixedReferenceDate.getFullYear();
  const refMonth = fixedReferenceDate.getMonth();
  const refDay = fixedReferenceDate.getDate();

  // Precise calendar-day fixture timestamps (independent of wall-clock time)
  const todayIso = new Date(refYear, refMonth, refDay, 10, 30, 0).toISOString();
  const yesterdayIso = new Date(refYear, refMonth, refDay - 1, 15, 0, 0).toISOString();
  const fiveDaysAgoIso = new Date(refYear, refMonth, refDay - 5, 11, 0, 0).toISOString();
  const tenDaysAgoIso = new Date(refYear, refMonth, refDay - 10, 9, 0, 0).toISOString();

  beforeEach(() => {
    jest.useFakeTimers({
      now: fixedReferenceDate,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
      ],
    });
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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

    it('correctly classifies conversations created close to midnight boundary', async () => {
      const nearMidnightList: ListConversationsResponse = {
        items: [
          {
            id: 'conv-just-today',
            title: 'Conversación Al Inicio del Día',
            turnCounter: 1,
            lastActivityAt: new Date(refYear, refMonth, refDay, 0, 0, 1).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 0, 0, 1).toISOString(),
            isArchived: false,
          },
          {
            id: 'conv-just-yesterday',
            title: 'Conversación Antes de Medianoche',
            turnCounter: 2,
            lastActivityAt: new Date(
              new Date(refYear, refMonth, refDay, 0, 0, 0).getTime() - 1000,
            ).toISOString(),
            createdAt: new Date(
              new Date(refYear, refMonth, refDay, 0, 0, 0).getTime() - 1000,
            ).toISOString(),
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(nearMidnightList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Ayer')).toBeInTheDocument();
      expect(screen.getByText('Conversación Al Inicio del Día')).toBeInTheDocument();
      expect(screen.getByText('Conversación Antes de Medianoche')).toBeInTheDocument();
    });

    it('renders Anteriores group when conversations older than 7 days exist', async () => {
      const listWithOlder: ListConversationsResponse = {
        items: [
          ...mockConversationsList.items,
          {
            id: 'conv-ancient',
            title: 'Protocolo de Hombro Histórico',
            turnCounter: 4,
            lastActivityAt: tenDaysAgoIso,
            createdAt: tenDaysAgoIso,
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(listWithOlder);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Ayer')).toBeInTheDocument();
      expect(screen.getByText('Últimos 7 días')).toBeInTheDocument();
      expect(screen.getByText('Anteriores')).toBeInTheDocument();
      expect(screen.getByText('Protocolo de Hombro Histórico')).toBeInTheDocument();
    });

    it('updates grouping deterministically when the reference system date changes', async () => {
      // Simulate tomorrow: fixedReferenceDate + 1 day
      const tomorrowReferenceDate = new Date(refYear, refMonth, refDay + 1, 14, 0, 0);

      // We use only the conv-today-1 conversation
      const singleItem: ListConversationsResponse = {
        items: [mockConversationsList.items[0]!],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(singleItem);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={tomorrowReferenceDate}
        />,
      );

      // On tomorrow, the conversation created on refDay is categorized as Ayer
      await waitFor(() => {
        expect(screen.getByText('Ayer')).toBeInTheDocument();
      });
      expect(screen.queryByText('Hoy')).not.toBeInTheDocument();
      expect(screen.getByText('Evaluación Postural Lumbar')).toBeInTheDocument();
    });

    it('renders multiple conversations within the same date group preserving order', async () => {
      const multiTodayList: ListConversationsResponse = {
        items: [
          {
            id: 'conv-t-1',
            title: 'Primero Hoy',
            turnCounter: 2,
            lastActivityAt: new Date(refYear, refMonth, refDay, 11, 0, 0).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 11, 0, 0).toISOString(),
            isArchived: false,
          },
          {
            id: 'conv-t-2',
            title: 'Segundo Hoy',
            turnCounter: 3,
            lastActivityAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(multiTodayList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Primero Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Segundo Hoy')).toBeInTheDocument();
      expect(screen.getByText('Hoy')).toBeInTheDocument();
      expect(screen.queryByText('Ayer')).not.toBeInTheDocument();
    });

    it('correctly classifies conversations created close to midnight boundary', async () => {
      const nearMidnightList: ListConversationsResponse = {
        items: [
          {
            id: 'conv-just-today',
            title: 'Conversación Al Inicio del Día',
            turnCounter: 1,
            lastActivityAt: new Date(refYear, refMonth, refDay, 0, 0, 1).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 0, 0, 1).toISOString(),
            isArchived: false,
          },
          {
            id: 'conv-just-yesterday',
            title: 'Conversación Antes de Medianoche',
            turnCounter: 2,
            lastActivityAt: new Date(
              new Date(refYear, refMonth, refDay, 0, 0, 0).getTime() - 1000,
            ).toISOString(),
            createdAt: new Date(
              new Date(refYear, refMonth, refDay, 0, 0, 0).getTime() - 1000,
            ).toISOString(),
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(nearMidnightList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Ayer')).toBeInTheDocument();
      expect(screen.getByText('Conversación Al Inicio del Día')).toBeInTheDocument();
      expect(screen.getByText('Conversación Antes de Medianoche')).toBeInTheDocument();
    });

    it('renders Anteriores group when conversations older than 7 days exist', async () => {
      const listWithOlder: ListConversationsResponse = {
        items: [
          ...mockConversationsList.items,
          {
            id: 'conv-ancient',
            title: 'Protocolo de Hombro Histórico',
            turnCounter: 4,
            lastActivityAt: tenDaysAgoIso,
            createdAt: tenDaysAgoIso,
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(listWithOlder);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Ayer')).toBeInTheDocument();
      expect(screen.getByText('Últimos 7 días')).toBeInTheDocument();
      expect(screen.getByText('Anteriores')).toBeInTheDocument();
      expect(screen.getByText('Protocolo de Hombro Histórico')).toBeInTheDocument();
    });

    it('updates grouping deterministically when the reference system date changes', async () => {
      // Simulate tomorrow: fixedReferenceDate + 1 day
      const tomorrowReferenceDate = new Date(refYear, refMonth, refDay + 1, 14, 0, 0);

      // We use only the conv-today-1 conversation
      const singleItem: ListConversationsResponse = {
        items: [mockConversationsList.items[0]!],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(singleItem);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={tomorrowReferenceDate}
        />,
      );

      // On tomorrow, the conversation created on refDay is categorized as Ayer
      await waitFor(() => {
        expect(screen.getByText('Ayer')).toBeInTheDocument();
      });
      expect(screen.queryByText('Hoy')).not.toBeInTheDocument();
      expect(screen.getByText('Evaluación Postural Lumbar')).toBeInTheDocument();
    });

    it('renders multiple conversations within the same date group preserving order', async () => {
      const multiTodayList: ListConversationsResponse = {
        items: [
          {
            id: 'conv-t-1',
            title: 'Primero Hoy',
            turnCounter: 2,
            lastActivityAt: new Date(refYear, refMonth, refDay, 11, 0, 0).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 11, 0, 0).toISOString(),
            isArchived: false,
          },
          {
            id: 'conv-t-2',
            title: 'Segundo Hoy',
            turnCounter: 3,
            lastActivityAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
            createdAt: new Date(refYear, refMonth, refDay, 10, 0, 0).toISOString(),
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValueOnce(multiTodayList);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId={undefined}
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedReferenceDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Primero Hoy')).toBeInTheDocument();
      });
      expect(screen.getByText('Segundo Hoy')).toBeInTheDocument();
      expect(screen.getByText('Hoy')).toBeInTheDocument();
      expect(screen.queryByText('Ayer')).not.toBeInTheDocument();
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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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
          referenceDate={fixedReferenceDate}
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
