import {
  useQuery,
  useInfiniteQuery,
  keepPreviousData,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import { conversationQueryKeys, type ConversationQueryScope } from '../api/conversation-query-keys';
import { CONVERSATION_CACHE_CONFIG } from '../api/conversation-cache-policies';
import type {
  ConversationDetailResponse,
  ListConversationsQueryParams,
  ListConversationsResponse,
  GetMessageHistoryQueryParams,
  MessageHistoryResponse,
  CitationDetailResponse,
  ListMessageCitationsResponse,
} from '../types/conversation-contract.types';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';

/**
 * Options for scoping query cache identity by tenant and user.
 */
export interface QueryScopeOptions {
  /** Optional explicit tenant and user scope override. Defaults to current auth session. */
  readonly scope?: ConversationQueryScope;
}

/**
 * Options for configuring useConversations query hook.
 */
export interface UseConversationsOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
  readonly refetchOnWindowFocus?: boolean;
}

/**
 * Options for configuring useConversation detail query hook.
 */
export interface UseConversationOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Options for configuring useConversationMessages query hook.
 */
export interface UseConversationMessagesOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Options for configuring useInfiniteConversations infinite query hook.
 */
export interface UseInfiniteConversationsOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Options for configuring useInfiniteConversationMessages infinite query hook.
 */
export interface UseInfiniteConversationMessagesOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Options for configuring useMessageCitations query hook.
 */
export interface UseMessageCitationsOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Options for configuring useCitationDetail query hook.
 */
export interface UseCitationDetailOptions extends QueryScopeOptions {
  readonly enabled?: boolean;
  readonly staleTime?: number;
  readonly gcTime?: number;
}

/**
 * Resolves current user and tenant scope from AuthProvider, allowing explicit caller overrides.
 */
export function useResolvedConversationScope(
  explicitScope?: ConversationQueryScope,
): ConversationQueryScope {
  const auth = useOptionalAuth();

  return {
    tenantId: explicitScope?.tenantId ?? auth?.currentUser?.tenantId ?? 'default_tenant',
    userId: explicitScope?.userId ?? auth?.currentUser?.id ?? 'anonymous',
  };
}

/**
 * Custom TanStack Query Hook: Fetches a single page of keyset-paginated conversations.
 *
 * Guarantees:
 * - Scoped to the authenticated user/tenant partition to prevent cross-user cache leakage.
 * - Uses `keepPreviousData` for flicker-free pagination.
 * - Passes `AbortSignal` for request cancellation when query parameters change or component unmounts.
 * - Default stale-time of 30 seconds.
 */
export function useConversations(
  params?: ListConversationsQueryParams,
  options?: UseConversationsOptions,
): UseQueryResult<ListConversationsResponse, Error> {
  const scope = useResolvedConversationScope(options?.scope);

  return useQuery({
    queryKey: conversationQueryKeys.list(params, scope),
    queryFn: ({ signal }) => conversationApi.listConversations(params, { signal }),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.listStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
  });
}

/**
 * Custom TanStack Query Hook: Fetches keyset-paginated conversations with infinite scrolling support.
 *
 * Automatically consumes `nextCursor` from backend `ListConversationsResponse` to fetch subsequent pages.
 */
export function useInfiniteConversations(
  params?: Omit<ListConversationsQueryParams, 'cursor'>,
  options?: UseInfiniteConversationsOptions,
): UseInfiniteQueryResult<InfiniteData<ListConversationsResponse, string | undefined>, Error> {
  const scope = useResolvedConversationScope(options?.scope);

  return useInfiniteQuery({
    queryKey: conversationQueryKeys.list(params as ListConversationsQueryParams | undefined, scope),
    queryFn: ({ pageParam, signal }) =>
      conversationApi.listConversations({ ...params, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.listStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}

/**
 * Custom TanStack Query Hook: Fetches full aggregate details of a single conversation.
 *
 * Guarantees:
 * - Only enabled when `conversationId` is non-empty.
 * - Partitioned by tenant and user cache identity.
 * - Stale-time of 15 seconds.
 */
export function useConversation(
  conversationId: string | undefined,
  options?: UseConversationOptions,
): UseQueryResult<ConversationDetailResponse, Error> {
  const scope = useResolvedConversationScope(options?.scope);
  const isValidId = Boolean(conversationId && conversationId.trim().length > 0);

  return useQuery({
    queryKey: conversationQueryKeys.detail(conversationId ?? '', scope),
    queryFn: ({ signal }) => conversationApi.getConversation(conversationId!, { signal }),
    enabled: isValidId && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.detailStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}

/**
 * Custom TanStack Query Hook: Fetches canonical message history for a conversation.
 *
 * Guarantees:
 * - Only enabled when `conversationId` is non-empty.
 * - Messages ordered strictly by sequence number.
 * - Stale-time of 10 seconds.
 */
export function useConversationMessages(
  conversationId: string | undefined,
  params?: GetMessageHistoryQueryParams,
  options?: UseConversationMessagesOptions,
): UseQueryResult<MessageHistoryResponse, Error> {
  const scope = useResolvedConversationScope(options?.scope);
  const isValidId = Boolean(conversationId && conversationId.trim().length > 0);

  return useQuery({
    queryKey: conversationQueryKeys.paginatedMessages(conversationId ?? '', params, scope),
    queryFn: ({ signal }) => conversationApi.getMessageHistory(conversationId!, params, { signal }),
    enabled: isValidId && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.messagesStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}

/**
 * Custom TanStack Query Hook: Fetches message history with sequence-based infinite scrolling.
 */
export function useInfiniteConversationMessages(
  conversationId: string | undefined,
  limit?: number,
  options?: UseInfiniteConversationMessagesOptions,
): UseInfiniteQueryResult<InfiniteData<MessageHistoryResponse, string | undefined>, Error> {
  const scope = useResolvedConversationScope(options?.scope);
  const isValidId = Boolean(conversationId && conversationId.trim().length > 0);

  return useInfiniteQuery({
    queryKey: conversationQueryKeys.paginatedMessages(conversationId ?? '', { limit }, scope),
    queryFn: ({ pageParam, signal }) =>
      conversationApi.getMessageHistory(conversationId!, { cursor: pageParam, limit }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: isValidId && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.messagesStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}

/**
 * Query hook to fetch all verified citations for an assistant message.
 */
export function useMessageCitations(
  conversationId: string | undefined,
  messageId: string | undefined,
  options?: UseMessageCitationsOptions,
): UseQueryResult<ListMessageCitationsResponse, Error> {
  const scope = useResolvedConversationScope(options?.scope);
  const isValid = Boolean(
    conversationId && conversationId.trim().length > 0 && messageId && messageId.trim().length > 0,
  );

  return useQuery({
    queryKey: conversationQueryKeys.messageCitations(conversationId ?? '', messageId ?? '', scope),
    queryFn: ({ signal }) =>
      conversationApi.getMessageCitations(conversationId!, messageId!, { signal }),
    enabled: isValid && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.messagesStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}

/**
 * Query hook to fetch single citation detail including full excerpt and preview availability.
 */
export function useCitationDetail(
  conversationId: string | undefined,
  messageId: string | undefined,
  citationId: string | undefined,
  options?: UseCitationDetailOptions,
): UseQueryResult<CitationDetailResponse, Error> {
  const scope = useResolvedConversationScope(options?.scope);
  const isValid = Boolean(
    conversationId &&
    conversationId.trim().length > 0 &&
    messageId &&
    messageId.trim().length > 0 &&
    citationId &&
    citationId.trim().length > 0,
  );

  return useQuery({
    queryKey: conversationQueryKeys.citationDetail(
      conversationId ?? '',
      messageId ?? '',
      citationId ?? '',
      scope,
    ),
    queryFn: ({ signal }) =>
      conversationApi.getCitationDetail(conversationId!, messageId!, citationId!, { signal }),
    enabled: isValid && (options?.enabled ?? true),
    staleTime: options?.staleTime ?? CONVERSATION_CACHE_CONFIG.messagesStaleTimeMs,
    gcTime: options?.gcTime ?? CONVERSATION_CACHE_CONFIG.gcTimeMs,
  });
}
