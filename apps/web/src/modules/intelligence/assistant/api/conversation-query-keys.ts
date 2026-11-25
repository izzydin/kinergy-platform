import type {
  ListConversationsQueryParams,
  GetMessageHistoryQueryParams,
} from '../types/conversation-contract.types';

/**
 * Tenant and user scoping context for conversational cache partitioning.
 * Guarantees cross-tenant and cross-user cache isolation in TanStack Query.
 */
export interface ConversationQueryScope {
  readonly tenantId?: string;
  readonly userId?: string;
}

/**
 * Sanitizes and normalizes query parameter objects for deterministic query key serialization.
 * Strips undefined, null, or empty string values, and sorts keys alphabetically.
 */
export function sanitizeConversationQueryParams<T extends Record<string, unknown>>(
  params?: T,
): Record<string, unknown> {
  if (!params) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const keys = Object.keys(params).sort();

  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Centralized TanStack Query Key Factory for AI Conversations.
 *
 * Enforces hierarchical key structure:
 * - `all`: Base root for all conversation cache items.
 * - `userScope`: User/tenant isolated boundary preventing cross-tenant / cross-user data leakage.
 * - `lists`: Invalidation boundary for collection queries.
 * - `list`: Granular keyset-paginated query cache key.
 * - `details`: Invalidation boundary for conversation detail queries.
 * - `detail`: Granular single conversation aggregate cache key.
 * - `messagesRoot`: Invalidation boundary for all message histories.
 * - `messages`: Invalidation boundary for all message queries of a single conversation.
 * - `paginatedMessages`: Granular paginated message history cache key.
 */
export const conversationQueryKeys = {
  all: ['ai-conversations'] as const,

  // Tenant- and user-scoped root
  userScope: (scope?: ConversationQueryScope) =>
    [
      ...conversationQueryKeys.all,
      scope?.tenantId ?? 'default_tenant',
      scope?.userId ?? 'anonymous',
    ] as const,

  // Collections (lists)
  lists: (scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.userScope(scope), 'list'] as const,

  list: (params?: ListConversationsQueryParams, scope?: ConversationQueryScope) =>
    [
      ...conversationQueryKeys.lists(scope),
      params ? sanitizeConversationQueryParams(params as unknown as Record<string, unknown>) : {},
    ] as const,

  // Details
  details: (scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.userScope(scope), 'detail'] as const,

  detail: (conversationId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.details(scope), conversationId] as const,

  // Message Histories
  messagesRoot: (scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.userScope(scope), 'messages'] as const,

  messages: (conversationId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.messagesRoot(scope), conversationId] as const,

  paginatedMessages: (
    conversationId: string,
    params?: GetMessageHistoryQueryParams,
    scope?: ConversationQueryScope,
  ) =>
    [
      ...conversationQueryKeys.messages(conversationId, scope),
      params ? sanitizeConversationQueryParams(params as unknown as Record<string, unknown>) : {},
    ] as const,

  // Message Citations
  citationsRoot: (conversationId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.messages(conversationId, scope), 'citations'] as const,

  messageCitations: (conversationId: string, messageId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.citationsRoot(conversationId, scope), messageId] as const,

  citationDetail: (
    conversationId: string,
    messageId: string,
    citationId: string,
    scope?: ConversationQueryScope,
  ) =>
    [
      ...conversationQueryKeys.messageCitations(conversationId, messageId, scope),
      citationId,
    ] as const,

  citationPreview: (
    conversationId: string,
    messageId: string,
    citationId: string,
    scope?: ConversationQueryScope,
  ) =>
    [
      ...conversationQueryKeys.citationDetail(conversationId, messageId, citationId, scope),
      'preview',
    ] as const,

  // Message Feedback (AI-09.5 - FB.02 / FB.03)
  feedbackRoot: (conversationId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.messages(conversationId, scope), 'feedback'] as const,

  feedback: (conversationId: string, messageId: string, scope?: ConversationQueryScope) =>
    [...conversationQueryKeys.feedbackRoot(conversationId, scope), messageId] as const,
};

// Convenient alias matching monorepo conventions
export const conversationKeys = conversationQueryKeys;
