/**
 * Authoritative TanStack Query Key Factory for AI Assistant
 *
 * Guarantees precise cache targeting and deterministic invalidation across
 * conversation lists, thread details, and AI system health metrics.
 */
export const aiAssistantKeys = {
  all: ['ai-assistant'] as const,

  // All conversations under a tenant and user partition
  conversations: (tenantId: string, userId: string) =>
    [...aiAssistantKeys.all, 'conversations', tenantId, userId] as const,

  // Single conversation thread hierarchy
  conversation: (tenantId: string, userId: string, conversationId: string) =>
    [...aiAssistantKeys.all, 'conversation', tenantId, userId, conversationId] as const,

  // Live AI engine subsystem health
  health: () => [...aiAssistantKeys.all, 'health'] as const,
};
