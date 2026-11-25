import { QueryClient } from '@tanstack/react-query';
import {
  conversationCachePolicies,
  CONVERSATION_CACHE_CONFIG,
} from '../api/conversation-cache-policies';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import type { ConversationDetailResponse } from '../types/conversation-contract.types';

describe('conversationCachePolicies', () => {
  let queryClient: QueryClient;
  const scope = { tenantId: 'tenant-test', userId: 'user-test' };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('CONVERSATION_CACHE_CONFIG', () => {
    it('should enforce verified stale and gc time policies', () => {
      expect(CONVERSATION_CACHE_CONFIG.listStaleTimeMs).toBe(30_000);
      expect(CONVERSATION_CACHE_CONFIG.detailStaleTimeMs).toBe(15_000);
      expect(CONVERSATION_CACHE_CONFIG.messagesStaleTimeMs).toBe(10_000);
      expect(CONVERSATION_CACHE_CONFIG.gcTimeMs).toBe(600_000);
    });
  });

  describe('invalidation policies', () => {
    it('invalidateConversationLists should invalidate scoped lists', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      await conversationCachePolicies.invalidateConversationLists(queryClient, scope);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.lists(scope),
      });
    });

    it('invalidateConversationDetail should invalidate specific conversation detail', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      await conversationCachePolicies.invalidateConversationDetail(queryClient, 'conv-123', scope);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.detail('conv-123', scope),
      });
    });

    it('invalidateConversationMessages should invalidate specific conversation messages', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      await conversationCachePolicies.invalidateConversationMessages(
        queryClient,
        'conv-123',
        scope,
      );

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.messages('conv-123', scope),
      });
    });

    it('invalidateEntireConversation should invalidate both detail and messages', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      await conversationCachePolicies.invalidateEntireConversation(queryClient, 'conv-123', scope);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.detail('conv-123', scope),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.messages('conv-123', scope),
      });
    });
  });

  describe('cache mutations', () => {
    it('updateConversationTitleInCache should update detail query data and invalidate lists', () => {
      const existingConv: ConversationDetailResponse = {
        id: 'conv-123',
        title: 'Original Title',
        turnCounter: 2,
        messageCounter: 4,
        lastActivityAt: '2026-11-24T12:00:00.000Z',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T10:00:00.000Z',
        isArchived: false,
      };

      queryClient.setQueryData(conversationQueryKeys.detail('conv-123', scope), existingConv);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      conversationCachePolicies.updateConversationTitleInCache(
        queryClient,
        'conv-123',
        'Renamed Title',
        scope,
      );

      const cached = queryClient.getQueryData<ConversationDetailResponse>(
        conversationQueryKeys.detail('conv-123', scope),
      );

      expect(cached?.title).toBe('Renamed Title');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.lists(scope),
      });
    });

    it('removeConversationFromCache should remove detail/messages and invalidate lists', () => {
      const removeSpy = jest.spyOn(queryClient, 'removeQueries');
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      conversationCachePolicies.removeConversationFromCache(queryClient, 'conv-123', scope);

      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.detail('conv-123', scope),
      });
      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.messages('conv-123', scope),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.lists(scope),
      });
    });

    it('clearUserConversationCache should cancel and remove user-scoped queries upon logout', () => {
      const cancelSpy = jest.spyOn(queryClient, 'cancelQueries');
      const removeSpy = jest.spyOn(queryClient, 'removeQueries');

      conversationCachePolicies.clearUserConversationCache(queryClient, scope);

      expect(cancelSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.userScope(scope),
      });
      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.userScope(scope),
      });
    });

    it('primeCreatedConversationCache should set detail data and invalidate lists', () => {
      const newConv: ConversationDetailResponse = {
        id: 'conv-new-1',
        title: 'New Conversation',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-24T12:00:00.000Z',
        createdAt: '2026-11-24T12:00:00.000Z',
        updatedAt: '2026-11-24T12:00:00.000Z',
        isArchived: false,
      };

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      conversationCachePolicies.primeCreatedConversationCache(queryClient, newConv, scope);

      const cached = queryClient.getQueryData<ConversationDetailResponse>(
        conversationQueryKeys.detail('conv-new-1', scope),
      );

      expect(cached).toEqual(newConv);
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: conversationQueryKeys.lists(scope),
      });
    });
  });
});
