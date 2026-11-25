import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useConversations,
  useInfiniteConversations,
  useConversation,
  useConversationMessages,
  useInfiniteConversationMessages,
} from '../hooks/use-conversation-queries';
import { conversationApi } from '../api/conversation.api';
import type {
  ListConversationsResponse,
  ConversationDetailResponse,
  MessageHistoryResponse,
} from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockedConversationApi = jest.mocked(conversationApi);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, queryClient };
}

describe('use-conversation-queries hooks', () => {
  const scope = { tenantId: 'tenant-test', userId: 'user-test' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useConversations', () => {
    const mockListResponse: ListConversationsResponse = {
      items: [
        {
          id: 'conv-1',
          title: 'First Chat',
          turnCounter: 2,
          lastActivityAt: '2026-11-24T12:00:00.000Z',
          createdAt: '2026-11-24T10:00:00.000Z',
          isArchived: false,
        },
      ],
      nextCursor: 'cursor_page_2',
      hasMore: true,
    };

    it('should successfully fetch conversations list and support parameter passing', async () => {
      mockedConversationApi.listConversations.mockResolvedValueOnce(mockListResponse);
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversations({ limit: 10 }, { scope }), {
        wrapper: Wrapper,
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockListResponse);
      expect(mockedConversationApi.listConversations).toHaveBeenCalledWith(
        { limit: 10 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should handle fetch errors cleanly', async () => {
      mockedConversationApi.listConversations.mockRejectedValueOnce(
        new Error('Failed to fetch conversation list'),
      );
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversations(undefined, { scope }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Failed to fetch conversation list');
    });

    it('should respect enabled: false condition', async () => {
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversations(undefined, { scope, enabled: false }), {
        wrapper: Wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockedConversationApi.listConversations).not.toHaveBeenCalled();
    });
  });

  describe('useInfiniteConversations', () => {
    it('should support pagination via fetchNextPage', async () => {
      const page1: ListConversationsResponse = {
        items: [
          {
            id: 'conv-1',
            title: 'Chat 1',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T12:00:00.000Z',
            createdAt: '2026-11-24T10:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'cursor_2',
        hasMore: true,
      };

      const page2: ListConversationsResponse = {
        items: [
          {
            id: 'conv-2',
            title: 'Chat 2',
            turnCounter: 1,
            lastActivityAt: '2026-11-24T11:00:00.000Z',
            createdAt: '2026-11-24T09:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.listConversations
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useInfiniteConversations({ limit: 1 }, { scope }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.pages).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);

      // Fetch next page
      await result.current.fetchNextPage();

      await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

      expect(result.current.hasNextPage).toBe(false);
      expect(mockedConversationApi.listConversations).toHaveBeenLastCalledWith(
        { limit: 1, cursor: 'cursor_2' },
        expect.any(Object),
      );
    });
  });

  describe('useConversation detail', () => {
    const mockDetail: ConversationDetailResponse = {
      id: 'conv-detail-1',
      title: 'Detailed Consultation',
      turnCounter: 3,
      messageCounter: 6,
      lastActivityAt: '2026-11-24T12:00:00.000Z',
      createdAt: '2026-11-24T10:00:00.000Z',
      updatedAt: '2026-11-24T12:00:00.000Z',
      isArchived: false,
    };

    it('should fetch conversation detail by ID', async () => {
      mockedConversationApi.getConversation.mockResolvedValueOnce(mockDetail);
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversation('conv-detail-1', { scope }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockDetail);
      expect(mockedConversationApi.getConversation).toHaveBeenCalledWith(
        'conv-detail-1',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should remain idle when conversationId is undefined or empty', async () => {
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversation(undefined, { scope }), {
        wrapper: Wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockedConversationApi.getConversation).not.toHaveBeenCalled();
    });
  });

  describe('useConversationMessages', () => {
    const mockMessages: MessageHistoryResponse = {
      messages: [
        {
          id: 'msg-1',
          turnId: 'turn-1',
          role: 'USER',
          sequenceNumber: 1,
          attemptNumber: 1,
          isCanonical: true,
          status: 'SUCCESS',
          content: 'Hello assistant',
          createdAt: '2026-11-24T10:00:00.000Z',
          completedAt: '2026-11-24T10:00:01.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    it('should fetch message history for conversation', async () => {
      mockedConversationApi.getMessageHistory.mockResolvedValueOnce(mockMessages);
      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useConversationMessages('conv-1', { limit: 20 }, { scope }),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockMessages);
      expect(mockedConversationApi.getMessageHistory).toHaveBeenCalledWith(
        'conv-1',
        { limit: 20 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should remain idle when conversationId is empty', async () => {
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useConversationMessages('', undefined, { scope }), {
        wrapper: Wrapper,
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockedConversationApi.getMessageHistory).not.toHaveBeenCalled();
    });
  });

  describe('useInfiniteConversationMessages', () => {
    it('should support message history pagination', async () => {
      const msgPage1: MessageHistoryResponse = {
        messages: [
          {
            id: 'm1',
            turnId: 't1',
            role: 'USER',
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Msg 1',
            createdAt: '2026-11-24T10:00:00.000Z',
            completedAt: null,
          },
        ],
        nextCursor: 'msg_cursor_2',
        hasMore: true,
      };

      const msgPage2: MessageHistoryResponse = {
        messages: [
          {
            id: 'm2',
            turnId: 't1',
            role: 'ASSISTANT',
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: 'SUCCESS',
            content: 'Msg 2',
            createdAt: '2026-11-24T10:00:05.000Z',
            completedAt: '2026-11-24T10:00:06.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      };

      mockedConversationApi.getMessageHistory
        .mockResolvedValueOnce(msgPage1)
        .mockResolvedValueOnce(msgPage2);

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useInfiniteConversationMessages('conv-inf', 1, { scope }),
        { wrapper: Wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages).toHaveLength(1);

      await result.current.fetchNextPage();

      await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
      expect(result.current.hasNextPage).toBe(false);
    });
  });
});
