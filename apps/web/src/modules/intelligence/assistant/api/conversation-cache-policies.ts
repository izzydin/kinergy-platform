import type { QueryClient } from '@tanstack/react-query';
import { conversationQueryKeys, type ConversationQueryScope } from './conversation-query-keys';
import type {
  ConversationDetailResponse,
  ConversationListResponse,
  MessageFeedbackResponse,
} from '../types/conversation-contract.types';

/**
 * Standard TanStack Query caching and garbage-collection configuration for conversations.
 */
export const CONVERSATION_CACHE_CONFIG = {
  /** Conversations list cache stale time: 30 seconds */
  listStaleTimeMs: 30_000,
  /** Conversation detail cache stale time: 15 seconds */
  detailStaleTimeMs: 15_000,
  /** Conversation message history cache stale time: 10 seconds */
  messagesStaleTimeMs: 10_000,
  /** Message feedback cache stale time: 30 seconds */
  feedbackStaleTimeMs: 30_000,
  /** Garbage collection time (cache retention): 10 minutes */
  gcTimeMs: 10 * 60 * 1000,
} as const;

/**
 * Reusable cache primitives and mutation policies for the conversation subsystem.
 */
export const conversationCachePolicies = {
  /**
   * Invalidates all conversation lists for the scoped user/tenant.
   * Called upon conversation creation, deletion, or title rename.
   */
  async invalidateConversationLists(
    queryClient: QueryClient,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: conversationQueryKeys.lists(scope),
    });
  },

  /**
   * Invalidates the aggregate detail of a specific conversation.
   */
  async invalidateConversationDetail(
    queryClient: QueryClient,
    conversationId: string,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: conversationQueryKeys.detail(conversationId, scope),
    });
  },

  /**
   * Invalidates all message queries for a specific conversation.
   */
  async invalidateConversationMessages(
    queryClient: QueryClient,
    conversationId: string,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: conversationQueryKeys.messages(conversationId, scope),
    });
  },

  /**
   * Invalidates both detail and message history for a conversation.
   */
  async invalidateEntireConversation(
    queryClient: QueryClient,
    conversationId: string,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    await Promise.all([
      this.invalidateConversationDetail(queryClient, conversationId, scope),
      this.invalidateConversationMessages(queryClient, conversationId, scope),
    ]);
  },

  /**
   * Updates conversation title in cache directly (optimistic or response-driven),
   * updates cached conversation list summaries, and invalidates lists to maintain consistency.
   */
  updateConversationTitleInCache(
    queryClient: QueryClient,
    conversationId: string,
    newTitle: string,
    scope?: ConversationQueryScope,
    updatedAt?: string,
  ): void {
    const timestamp = updatedAt ?? new Date().toISOString();

    // 1. Update detail cache if present
    queryClient.setQueryData<ConversationDetailResponse>(
      conversationQueryKeys.detail(conversationId, scope),
      (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          title: newTitle,
          updatedAt: timestamp,
        };
      },
    );

    // 2. Optimistically update list caches
    queryClient.setQueriesData<ConversationListResponse>(
      { queryKey: conversationQueryKeys.lists(scope) },
      (previous) => {
        if (!previous?.items) return previous;
        return {
          ...previous,
          items: previous.items.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  title: newTitle,
                  lastActivityAt: timestamp,
                }
              : item,
          ),
        };
      },
    );

    // 3. Invalidate lists so sidebar and queries stay canonical
    void this.invalidateConversationLists(queryClient, scope);
  },

  /**
   * Removes a conversation and its messages from the cache upon deletion/archive.
   * Cancels in-flight requests, purges detail/message caches, optimistically updates
   * list caches, and invalidates list queries to maintain canonical consistency.
   */
  removeConversationFromCache(
    queryClient: QueryClient,
    conversationId: string,
    scope?: ConversationQueryScope,
  ): void {
    // 1. Cancel in-flight queries so they do not re-populate the cache
    void queryClient.cancelQueries({
      queryKey: conversationQueryKeys.detail(conversationId, scope),
    });
    void queryClient.cancelQueries({
      queryKey: conversationQueryKeys.messages(conversationId, scope),
    });

    // 2. Remove detail and message queries from active cache
    queryClient.removeQueries({
      queryKey: conversationQueryKeys.detail(conversationId, scope),
    });
    queryClient.removeQueries({
      queryKey: conversationQueryKeys.messages(conversationId, scope),
    });

    // 3. Optimistically filter conversation out of list caches
    queryClient.setQueriesData<ConversationListResponse>(
      { queryKey: conversationQueryKeys.lists(scope) },
      (previous) => {
        if (!previous?.items) return previous;
        return {
          ...previous,
          items: previous.items.filter((item) => item.id !== conversationId),
        };
      },
    );

    // 4. Invalidate list queries so the removed conversation disappears canonically
    void this.invalidateConversationLists(queryClient, scope);
  },

  /**
   * Safely clears all cached conversation data for a user upon authentication change or logout.
   * Cancels in-flight queries and removes cache entries to prevent cross-user data leakage.
   */
  clearUserConversationCache(queryClient: QueryClient, scope?: ConversationQueryScope): void {
    const targetKey =
      scope?.tenantId && scope?.userId
        ? conversationQueryKeys.userScope(scope)
        : conversationQueryKeys.all;

    void queryClient.cancelQueries({ queryKey: targetKey });
    queryClient.removeQueries({ queryKey: targetKey });
  },

  /**
   * Primes the detail cache with a newly created conversation aggregate.
   */
  primeCreatedConversationCache(
    queryClient: QueryClient,
    conversation: ConversationDetailResponse,
    scope?: ConversationQueryScope,
  ): void {
    queryClient.setQueryData<ConversationDetailResponse>(
      conversationQueryKeys.detail(conversation.id, scope),
      conversation,
    );
    void this.invalidateConversationLists(queryClient, scope);
  },

  /**
   * Invalidates citation queries for a specific message or entire conversation.
   */
  async invalidateCitations(
    queryClient: QueryClient,
    conversationId: string,
    messageId?: string,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    const queryKey = messageId
      ? conversationQueryKeys.messageCitations(conversationId, messageId, scope)
      : conversationQueryKeys.citationsRoot(conversationId, scope);

    await queryClient.invalidateQueries({ queryKey });
  },

  /**
   * Clears preview and citation caches for a conversation to purge memory and sensitive preview tokens.
   */
  clearCitationPreviewCache(
    queryClient: QueryClient,
    conversationId: string,
    scope?: ConversationQueryScope,
  ): void {
    const rootKey = conversationQueryKeys.citationsRoot(conversationId, scope);
    void queryClient.cancelQueries({ queryKey: rootKey });
    queryClient.removeQueries({ queryKey: rootKey });
  },

  /**
   * Invalidates feedback query for a specific message or entire conversation.
   */
  async invalidateMessageFeedback(
    queryClient: QueryClient,
    conversationId: string,
    messageId?: string,
    scope?: ConversationQueryScope,
  ): Promise<void> {
    const queryKey = messageId
      ? conversationQueryKeys.feedback(conversationId, messageId, scope)
      : conversationQueryKeys.feedbackRoot(conversationId, scope);

    await queryClient.invalidateQueries({ queryKey });
  },

  /**
   * Optimistically sets or updates feedback in query cache.
   */
  setOptimisticFeedback(
    queryClient: QueryClient,
    conversationId: string,
    messageId: string,
    feedback: MessageFeedbackResponse | null,
    scope?: ConversationQueryScope,
  ): void {
    const queryKey = conversationQueryKeys.feedback(conversationId, messageId, scope);
    queryClient.setQueryData<MessageFeedbackResponse | null>(queryKey, feedback);
  },

  /**
   * Removes feedback query from cache for a message.
   */
  removeMessageFeedback(
    queryClient: QueryClient,
    conversationId: string,
    messageId: string,
    scope?: ConversationQueryScope,
  ): void {
    const queryKey = conversationQueryKeys.feedback(conversationId, messageId, scope);
    queryClient.removeQueries({ queryKey });
  },
};
