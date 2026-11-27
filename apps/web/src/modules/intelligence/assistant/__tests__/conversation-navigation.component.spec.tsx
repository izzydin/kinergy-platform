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

describe('AI-09.10-IT.03 — Conversation Navigation Component Specification', () => {
  const tenantId = 'tenant_nav_test';
  const userId = 'usr_nav_test';

  const onSelectConversationMock = jest.fn();
  const onNewConversationMock = jest.fn();
  const onCloseMobileMock = jest.fn();

  const fixedRefDate = new Date(2026, 10, 26, 12, 0, 0);
  const todayIso = new Date(2026, 10, 26, 10, 0, 0).toISOString();
  const yesterdayIso = new Date(2026, 10, 25, 15, 0, 0).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    assistantStorageService.clearConversations(tenantId, userId);
  });

  describe('1. Active Selection & Event Dispatch', () => {
    it('highlights the active conversation and triggers onSelectConversation on click', async () => {
      const mockResponse: ListConversationsResponse = {
        items: [
          {
            id: 'conv_active_01',
            title: 'Protocolo Artrosis de Rodilla',
            turnCounter: 4,
            isArchived: false,
            createdAt: todayIso,
            lastActivityAt: todayIso,
          },
          {
            id: 'conv_other_02',
            title: 'Ejercicios Lumbares Isométricos',
            turnCounter: 2,
            isArchived: false,
            createdAt: yesterdayIso,
            lastActivityAt: yesterdayIso,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue(mockResponse);

      renderWithProviders(
        <ConversationSidebar
          activeConversationId="conv_active_01"
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      // Wait for conversation items to render
      await waitFor(() => {
        expect(screen.getByTestId('conversation-item-conv_active_01')).toBeInTheDocument();
      });

      // Active item check
      const activeItem = screen.getByTestId('conversation-item-conv_active_01');
      expect(activeItem).toHaveAttribute('aria-current', 'true');

      // Click second item
      const secondItem = screen.getByTestId('conversation-item-conv_other_02');
      expect(secondItem).not.toHaveAttribute('aria-current');

      fireEvent.click(secondItem);
      expect(onSelectConversationMock).toHaveBeenCalledWith('conv_other_02');
    });

    it('triggers onNewConversation when clicking the new conversation button', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      const newConvBtn = screen.getByRole('button', { name: /nueva conversación/i });
      fireEvent.click(newConvBtn);

      expect(onNewConversationMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. In-Place Search Filtering', () => {
    it('filters visible conversations in place by search term', async () => {
      const mockResponse: ListConversationsResponse = {
        items: [
          {
            id: 'conv_1',
            title: 'Tendinitis de Aquiles',
            turnCounter: 3,
            isArchived: false,
            createdAt: todayIso,
            lastActivityAt: todayIso,
          },
          {
            id: 'conv_2',
            title: 'Rehabilitación Manguito Rotador',
            turnCounter: 5,
            isArchived: false,
            createdAt: todayIso,
            lastActivityAt: todayIso,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations.mockResolvedValue(mockResponse);

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('conversation-item-conv_1')).toBeInTheDocument();
        expect(screen.getByTestId('conversation-item-conv_2')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('sidebar-search-input');
      fireEvent.change(searchInput, { target: { value: 'Aquiles' } });

      // Only matching item should be visible
      expect(screen.getByTestId('conversation-item-conv_1')).toBeInTheDocument();
      expect(screen.queryByTestId('conversation-item-conv_2')).not.toBeInTheDocument();
    });

    it('shows dedicated empty search state when query matches no conversation', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [
          {
            id: 'conv_1',
            title: 'Tendinitis de Aquiles',
            turnCounter: 1,
            isArchived: false,
            createdAt: todayIso,
            lastActivityAt: todayIso,
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('conversation-item-conv_1')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('sidebar-search-input');
      fireEvent.change(searchInput, { target: { value: 'Inexistente' } });

      expect(screen.getByTestId('sidebar-no-search-results')).toBeInTheDocument();
      expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    });
  });

  describe('3. Empty History vs API Failure States', () => {
    it('distinguishes clean empty history from error failure states', async () => {
      mockedConversationApi.listConversations.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText('Sin conversaciones')).toBeInTheDocument();
      // Should not show error alert
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders accessible error alert with retry button when history fetch fails', async () => {
      mockedConversationApi.listConversations.mockRejectedValue(new Error('Internal Server Error'));

      renderWithProviders(
        <ConversationSidebar
          isOpenOnMobile={false}
          onCloseMobile={onCloseMobileMock}
          onSelectConversation={onSelectConversationMock}
          onNewConversation={onNewConversationMock}
          tenantId={tenantId}
          userId={userId}
          referenceDate={fixedRefDate}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Error al cargar historial')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      expect(retryBtn).toBeInTheDocument();
    });
  });
});
