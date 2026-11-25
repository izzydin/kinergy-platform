import type { GenerationStatus } from '../types/generation.types';
import type {
  BackendTurnStatus,
  BackendGenerationStatus,
  MessageResponse,
} from '../types/conversation-contract.types';
import type { ChatMessage, MessageRole, MessageStatus } from '../types/assistant.types';

/**
 * Pure adapter functions mapping backend AI-09.3 persistence statuses to the frontend generation FSM.
 *
 * Guarantees:
 * - Preserves all seven frontend FSM states ('IDLE', 'PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED').
 * - Preserves distinct backend terminal outcomes without silent collapse.
 * - Explicitly rejects and avoids 'RECOVERING'.
 * - Persisted 'PENDING' never equates to 'STREAMING'.
 * - Accepted turn reservation ('PENDING') is never considered 'COMPLETED'.
 * - Pure and 100% deterministic.
 */

/**
 * Maps a backend TurnStatus to the corresponding frontend GenerationStatus FSM state.
 */
export function mapBackendTurnStatusToFsm(turnStatus: BackendTurnStatus): GenerationStatus {
  switch (turnStatus) {
    case 'PENDING':
      return 'PENDING';
    case 'STREAMING':
      return 'STREAMING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'INTERRUPTED':
      return 'INTERRUPTED';
  }
}

/**
 * Maps a backend GenerationStatus (persisted on assistant attempt messages)
 * to the frontend GenerationStatus FSM state.
 *
 * Notice: Backend message status 'SUCCESS' maps to frontend FSM 'COMPLETED'.
 */
export function mapBackendMessageStatusToFsm(
  generationStatus: BackendGenerationStatus,
): GenerationStatus {
  switch (generationStatus) {
    case 'PENDING':
      return 'PENDING';
    case 'STREAMING':
      return 'STREAMING';
    case 'SUCCESS':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'INTERRUPTED':
      return 'INTERRUPTED';
  }
}

/**
 * Maps a backend GenerationStatus to the legacy AI-09.2 message delivery status.
 */
export function mapBackendMessageStatusToLegacy(
  generationStatus: BackendGenerationStatus,
): MessageStatus {
  switch (generationStatus) {
    case 'PENDING':
    case 'STREAMING':
      return 'pending';
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'error';
    case 'CANCELLED':
      return 'cancelled';
    case 'INTERRUPTED':
      return 'interrupted';
  }
}

/**
 * Maps a backend role ('USER' | 'ASSISTANT' | 'SYSTEM') to legacy frontend MessageRole.
 */
export function mapBackendRoleToLegacy(role: 'USER' | 'ASSISTANT' | 'SYSTEM'): MessageRole {
  switch (role) {
    case 'USER':
      return 'user';
    case 'ASSISTANT':
      return 'assistant';
    case 'SYSTEM':
      return 'system';
  }
}

/**
 * Pure adapter converting a canonical backend MessageResponse into a domain ChatMessage
 * consumable by existing UI rendering components (ChatMessageFeed, ChatMessageItem).
 */
export function toDomainChatMessage(msg: MessageResponse): ChatMessage {
  const legacyRole = mapBackendRoleToLegacy(msg.role);
  const legacyStatus = mapBackendMessageStatusToLegacy(msg.status);

  return {
    id: msg.id,
    turnId: msg.turnId,
    role: legacyRole,
    content: msg.content,
    createdAt: msg.createdAt,
    sequenceNumber: msg.sequenceNumber,
    status: legacyStatus,
    grounded: Boolean(msg.sources && msg.sources.length > 0),
    sources: msg.sources?.map((s) => ({
      citationId: s.citationId ?? undefined,
      documentId: s.documentId,
      documentTitle: s.documentTitle,
      chunkId: s.chunkId,
      excerpt: s.excerpt ?? undefined,
      documentVersionId: s.documentVersionId ?? undefined,
      documentVersionNumber: s.documentVersionNumber ?? undefined,
      pageNumber: s.pageNumber ?? undefined,
      headingPath: s.headingPath ?? undefined,
      relevanceScore: s.relevanceScore,
      retrievalRank: s.retrievalRank ?? undefined,
      sourceStrategy: s.sourceStrategy ?? undefined,
      previewStatus: s.previewStatus ?? undefined,
      canPreview: s.canPreview ?? undefined,
    })),
    metadata:
      legacyRole === 'assistant'
        ? {
            model: 'assistant',
            retrievalCount: msg.sources?.length ?? 0,
            latencyMs:
              msg.completedAt && msg.createdAt
                ? Math.max(
                    0,
                    new Date(msg.completedAt).getTime() - new Date(msg.createdAt).getTime(),
                  )
                : 0,
          }
        : undefined,
    error: legacyStatus === 'error' ? 'Error al generar la respuesta.' : undefined,
  };
}

/**
 * Reconciles the active generation view state during page load, reconnect, or refresh.
 *
 * @param activeTurnId ID of active turn on conversation aggregate (or null/undefined)
 * @param activeTurnStatus Status of the active turn if present
 * @param isSubmitting Whether the local UI is currently submitting a network request
 */
export function reconcileConversationViewState(params: {
  activeTurnId?: string | null;
  activeTurnStatus?: BackendTurnStatus | null;
  isSubmitting?: boolean;
}): GenerationStatus {
  const { activeTurnId, activeTurnStatus, isSubmitting } = params;

  if (isSubmitting) {
    return 'PENDING';
  }

  if (!activeTurnId || !activeTurnStatus) {
    return 'IDLE';
  }

  switch (activeTurnStatus) {
    case 'PENDING':
      return 'PENDING';
    case 'STREAMING':
      return 'STREAMING';
    case 'COMPLETED':
    case 'FAILED':
    case 'CANCELLED':
    case 'INTERRUPTED':
      // Terminal turns mean the conversation is quiescent and ready for the next prompt
      return 'IDLE';
  }
}
