import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreatePersistentConversationMutation,
  useRenameConversationMutation,
  useArchiveConversationMutation,
  useReserveTurnMutation,
} from '../hooks/use-conversation-mutations';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import type {
  CreateConversationResponse,
  UpdateTitleResponse,
  ArchiveConversationResponse,
  ReserveTurnResponse,
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

describe('use-conversation-mutations hooks', () => {
  const scope = { tenantId: 'tenant-test', userId: 'user-test' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreatePersistentConversationMutation', () => {
    const mockCreateResponse: CreateConversationResponse = {
      conversationId: 'conv-new-123',
      turnId: 'turn-1',
      clientTurnId: 'client-turn-uuid-1',
      turnIndex: 1,
      userMessageId: 'msg-u-1',
      assistantAttemptId: 'att-1',
      title: 'Initial Consultation',
      turnStatus: 'PENDING',
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-24T12:00:00.000Z',
    };

    it('should create conversation and invalidate list queries', async () => {
      mockedConversationApi.createConversation.mockResolvedValueOnce(mockCreateResponse);
      const invalidateSpy = jest.spyOn(conversationCachePolicies, 'invalidateConversationLists');
      const onSuccessSpy = jest.fn();

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useCreatePersistentConversationMutation({ scope, onSuccess: onSuccessSpy }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.mutateAsync({
          clientTurnId: 'client-turn-uuid-1',
          userPrompt: 'Hello Dr.',
        });
      });

      expect(mockedConversationApi.createConversation).toHaveBeenCalledWith({
        clientTurnId: 'client-turn-uuid-1',
        userPrompt: 'Hello Dr.',
      });
      expect(invalidateSpy).toHaveBeenCalledWith(expect.any(Object), scope);
      expect(onSuccessSpy).toHaveBeenCalledWith(mockCreateResponse, {
        clientTurnId: 'client-turn-uuid-1',
        userPrompt: 'Hello Dr.',
      });
    });

    it('should trigger onError when mutation fails', async () => {
      const error = new Error('Creation rejected');
      mockedConversationApi.createConversation.mockRejectedValueOnce(error);
      const onErrorSpy = jest.fn();

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useCreatePersistentConversationMutation({ scope, onError: onErrorSpy }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        try {
          await result.current.mutateAsync({
            clientTurnId: 'client-turn-uuid-1',
            userPrompt: 'Hello Dr.',
          });
        } catch {
          // Expected rejection
        }
      });

      expect(onErrorSpy).toHaveBeenCalledWith(error, expect.any(Object));
    });
  });

  describe('useRenameConversationMutation', () => {
    const mockRenameResponse: UpdateTitleResponse = {
      conversationId: 'conv-rename-1',
      title: 'Updated Consultation Title',
      updatedAt: '2026-11-24T12:05:00.000Z',
    };

    it('should rename conversation and invoke cache policy', async () => {
      mockedConversationApi.updateTitle.mockResolvedValueOnce(mockRenameResponse);
      const updateCacheSpy = jest.spyOn(
        conversationCachePolicies,
        'updateConversationTitleInCache',
      );
      const onSuccessSpy = jest.fn();

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useRenameConversationMutation({ scope, onSuccess: onSuccessSpy }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-rename-1',
          request: { title: 'Updated Consultation Title' },
        });
      });

      expect(mockedConversationApi.updateTitle).toHaveBeenCalledWith('conv-rename-1', {
        title: 'Updated Consultation Title',
      });
      expect(updateCacheSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'conv-rename-1',
        'Updated Consultation Title',
        scope,
        '2026-11-24T12:05:00.000Z',
      );
      expect(onSuccessSpy).toHaveBeenCalledWith(mockRenameResponse, {
        conversationId: 'conv-rename-1',
        request: { title: 'Updated Consultation Title' },
      });
    });
  });

  describe('useArchiveConversationMutation', () => {
    const mockArchiveResponse: ArchiveConversationResponse = {
      conversationId: 'conv-archive-1',
      isArchived: true,
      archivedAt: '2026-11-24T12:10:00.000Z',
    };

    it('should archive conversation and clean cache', async () => {
      mockedConversationApi.archiveConversation.mockResolvedValueOnce(mockArchiveResponse);
      const removeCacheSpy = jest.spyOn(conversationCachePolicies, 'removeConversationFromCache');
      const onSuccessSpy = jest.fn();

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useArchiveConversationMutation({ scope, onSuccess: onSuccessSpy }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.mutateAsync('conv-archive-1');
      });

      expect(mockedConversationApi.archiveConversation).toHaveBeenCalledWith('conv-archive-1');
      expect(removeCacheSpy).toHaveBeenCalledWith(expect.any(Object), 'conv-archive-1', scope);
      expect(onSuccessSpy).toHaveBeenCalledWith(mockArchiveResponse, 'conv-archive-1');
    });
  });

  describe('useReserveTurnMutation', () => {
    const mockReserveResponse: ReserveTurnResponse = {
      conversationId: 'conv-res-1',
      turnId: 'turn-2',
      clientTurnId: 'turn-uuid-2',
      turnIndex: 2,
      userMessageId: 'msg-u-2',
      assistantAttemptId: 'att-2',
      turnStatus: 'PENDING',
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-24T12:15:00.000Z',
    };

    it('should reserve turn and invalidate entire conversation cache', async () => {
      mockedConversationApi.reserveTurn.mockResolvedValueOnce(mockReserveResponse);
      const invalidateEntireSpy = jest.spyOn(
        conversationCachePolicies,
        'invalidateEntireConversation',
      );
      const onSuccessSpy = jest.fn();

      const { Wrapper } = createWrapper();

      const { result } = renderHook(
        () => useReserveTurnMutation({ scope, onSuccess: onSuccessSpy }),
        { wrapper: Wrapper },
      );

      await act(async () => {
        await result.current.mutateAsync({
          conversationId: 'conv-res-1',
          request: { clientTurnId: 'turn-uuid-2', userPrompt: 'Follow-up question' },
        });
      });

      expect(mockedConversationApi.reserveTurn).toHaveBeenCalledWith('conv-res-1', {
        clientTurnId: 'turn-uuid-2',
        userPrompt: 'Follow-up question',
      });
      expect(invalidateEntireSpy).toHaveBeenCalledWith(expect.any(Object), 'conv-res-1', scope);
      expect(onSuccessSpy).toHaveBeenCalledWith(mockReserveResponse, {
        conversationId: 'conv-res-1',
        request: { clientTurnId: 'turn-uuid-2', userPrompt: 'Follow-up question' },
      });
    });
  });
});
