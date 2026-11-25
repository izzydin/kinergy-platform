/**
 * Strongly typed AI-09.3 conversation persistence, turn execution, and lifecycle contracts.
 *
 * Source of Truth: Implemented backend DTOs (apps/api/src/ai/conversation/dtos/ai-conversation.dtos.ts)
 * and FE.01.01 mapping (docs/ai/AI-09/AI-09.3-FE.01.01-backend-contract-mapping.md).
 *
 * Architecture Rules:
 * - Readonly and immutable interfaces.
 * - Exact alignment with backend serialization structures.
 * - Zero `any` or broad unsafe casts.
 * - Sensitive internal fields (lease tokens, tenant IDs in bodies) strictly excluded.
 */

// ==========================================
// 1. Status & Role Enums
// ==========================================

/**
 * Backend TurnStatus strictly mirroring PostgreSQL TurnStatus enum.
 */
export type BackendTurnStatus =
  'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export const BackendTurnStatus = {
  PENDING: 'PENDING' as const,
  STREAMING: 'STREAMING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
  INTERRUPTED: 'INTERRUPTED' as const,
};

/**
 * Backend GenerationStatus strictly mirroring PostgreSQL GenerationStatus enum for assistant attempts.
 */
export type BackendGenerationStatus =
  'PENDING' | 'STREAMING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export const BackendGenerationStatus = {
  PENDING: 'PENDING' as const,
  STREAMING: 'STREAMING' as const,
  SUCCESS: 'SUCCESS' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
  INTERRUPTED: 'INTERRUPTED' as const,
};

/**
 * Author role in conversation messages mirroring database ConversationRole enum.
 */
export type BackendConversationRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export const BackendConversationRole = {
  USER: 'USER' as const,
  ASSISTANT: 'ASSISTANT' as const,
  SYSTEM: 'SYSTEM' as const,
};

/**
 * Idempotency outcome returned by turn submission endpoints.
 */
export type IdempotencyOutcome = 'CREATED' | 'EXISTING_RECOVERED';

export const IdempotencyOutcome = {
  CREATED: 'CREATED' as const,
  EXISTING_RECOVERED: 'EXISTING_RECOVERED' as const,
};

// ==========================================
// 2. Request Contracts
// ==========================================

/**
 * Request body for creating a new conversation with an initial turn (POST /api/v1/ai/conversations).
 */
export interface CreateConversationRequest {
  /** Unique client-generated turn idempotency identifier (UUID or stable key, max 64 chars) */
  readonly clientTurnId: string;
  /** Initial prompt submitted by the user (1 to 4000 characters) */
  readonly userPrompt: string;
  /** Optional initial title (1 to 255 characters). If omitted, derived from prompt. */
  readonly title?: string;
  /** Optional client metadata associated with conversation */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Request body for reserving a subsequent turn (POST /api/v1/ai/conversations/:id/turns).
 */
export interface ReserveTurnRequest {
  /** Unique client-generated turn idempotency identifier (UUID or stable key, max 64 chars) */
  readonly clientTurnId: string;
  /** Subsequent user prompt (1 to 4000 characters) */
  readonly userPrompt: string;
  /** Optional turn-level metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Request body for updating conversation title (PATCH /api/v1/ai/conversations/:id/title).
 */
export interface UpdateConversationTitleRequest {
  /** New title for the active conversation (1 to 255 characters) */
  readonly title: string;
}

/**
 * Query parameters for listing user conversations (GET /api/v1/ai/conversations).
 */
export interface ListConversationsQueryParams {
  /** Keyset cursor from previous nextCursor */
  readonly cursor?: string;
  /** Page size limit (min 1, max 100, default 20) */
  readonly limit?: number;
  /** Whether to include archived/soft-deleted conversations */
  readonly includeArchived?: boolean;
}

/**
 * Query parameters for fetching canonical message history (GET /api/v1/ai/conversations/:id/messages).
 */
export interface GetMessageHistoryQueryParams {
  /** Sequence-based keyset cursor from previous nextCursor */
  readonly cursor?: string;
  /** Page size limit (min 1, max 100, default 20) */
  readonly limit?: number;
}

/**
 * Optional request body for cancelling a turn (POST /api/v1/ai/conversations/:id/turns/:turnId/cancel).
 */
export interface CancelTurnRequest {
  /** Optional human-readable cancellation reason (max 500 characters) */
  readonly reason?: string;
}

/**
 * Request body for privileged Owner inspection (POST /api/v1/ai/conversations/:id/audit-inspect).
 */
export interface AuditInspectConversationRequest {
  /** Mandatory supervisory/clinical justification (10 to 500 characters) */
  readonly reason: string;
}

// ==========================================
// 3. Response Contracts
// ==========================================

/**
 * Conversation summary representation returned in list queries.
 */
export interface ConversationSummaryResponse {
  readonly id: string;
  readonly title: string;
  readonly turnCounter: number;
  readonly lastActivityAt: string;
  readonly createdAt: string;
  readonly isArchived: boolean;
}

/**
 * Paginated list response for user conversations (GET /api/v1/ai/conversations).
 */
export interface ListConversationsResponse {
  readonly items: readonly ConversationSummaryResponse[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Turn summary representation embedded in conversation detail.
 */
export interface TurnSummaryResponse {
  readonly id: string;
  readonly turnIndex: number;
  readonly status: BackendTurnStatus;
  readonly clientTurnId: string;
  readonly activeAttemptId: string | null;
  readonly activeAttemptNumber: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * Conversation aggregate details (GET /api/v1/ai/conversations/:id).
 */
export interface ConversationDetailResponse {
  readonly id: string;
  readonly title: string;
  readonly turnCounter: number;
  readonly messageCounter: number;
  readonly lastActivityAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isArchived: boolean;
  readonly activeTurnId?: string | null;
  readonly turns?: readonly TurnSummaryResponse[];
}

/**
 * Response payload for conversation creation (POST /api/v1/ai/conversations).
 */
export interface CreateConversationResponse {
  readonly conversationId: string;
  readonly turnId: string;
  readonly clientTurnId: string;
  readonly turnIndex: number;
  readonly userMessageId: string;
  readonly assistantAttemptId: string;
  readonly title: string;
  readonly turnStatus: BackendTurnStatus;
  readonly isIdempotentReplay: boolean;
  readonly idempotencyOutcome: IdempotencyOutcome;
  readonly createdAt: string;
}

/**
 * Response payload for subsequent turn reservation (POST /api/v1/ai/conversations/:id/turns).
 */
export interface ReserveTurnResponse {
  readonly conversationId: string;
  readonly turnId: string;
  readonly clientTurnId: string;
  readonly turnIndex: number;
  readonly userMessageId: string;
  readonly assistantAttemptId: string;
  readonly turnStatus: BackendTurnStatus;
  readonly isIdempotentReplay: boolean;
  readonly idempotencyOutcome: IdempotencyOutcome;
  readonly createdAt: string;
}

/**
 * Response payload for turn cancellation (POST /api/v1/ai/conversations/:id/turns/:turnId/cancel).
 */
export interface CancelTurnResponse {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnStatus: 'CANCELLED';
  readonly assistantMessageId: string;
  readonly isAlreadyCancelled: boolean;
  readonly cancelledAt: string;
}

/**
 * Preview status of a source document for a citation.
 */
export type CitationPreviewStatus =
  'DOCUMENT_AVAILABLE' | 'DOCUMENT_SOFT_DELETED' | 'DOCUMENT_RESTRICTED' | 'EXCERPT_ONLY';

/**
 * Grounded source attribution citation persisted on canonical assistant messages.
 */
export interface ConversationSourceCitation {
  readonly citationId?: string | null;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly chunkId: string;
  readonly excerpt?: string | null;
  readonly pageNumber?: number | null;
  readonly headingPath?: readonly string[] | null;
  readonly relevanceScore: number;
  readonly retrievalRank?: number | null;
  readonly sourceStrategy?: string | null;
  readonly documentVersionId?: string | null;
  readonly documentVersionNumber?: number | null;
  readonly originalFileName?: string | null;
  readonly documentStatus?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly previewStatus?: CitationPreviewStatus | null;
  readonly canPreview?: boolean | null;
}

/**
 * Detailed citation representation returned by the dedicated citation detail endpoint.
 */
export interface CitationDetailResponse {
  readonly id: string;
  readonly messageId: string;
  readonly turnId: string;
  readonly conversationId: string;
  readonly documentId: string;
  readonly documentTitleSnapshot: string;
  readonly documentTitle: string;
  readonly originalFileName?: string | null;
  readonly documentStatus?: string | null;
  readonly documentVersionId?: string | null;
  readonly documentVersionNumber?: number | null;
  readonly chunkId?: string | null;
  readonly citationPosition: number;
  readonly excerpt: string;
  readonly pageNumber?: number | null;
  readonly headingPath?: readonly string[];
  readonly relevanceScore?: number | null;
  readonly retrievalRank?: number | null;
  readonly sourceStrategy?: string | null;
  readonly previewStatus: CitationPreviewStatus;
  readonly canPreview: boolean;
  readonly previewUnavailableReason?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly createdAt?: string;
}

/**
 * List response envelope for message citations.
 */
export interface ListMessageCitationsResponse {
  readonly citations: readonly CitationDetailResponse[];
}

/**
 * Full preview metadata and access authorization state for a citation.
 */
export interface CitationPreviewResponse {
  readonly documentId: string;
  readonly citationId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly documentTitleSnapshot: string;
  readonly documentTitle: string;
  readonly originalFileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly documentVersionId?: string | null;
  readonly documentVersionNumber?: number | null;
  readonly pageNumber?: number | null;
  readonly headingPath: readonly string[];
  readonly excerpt: string;
  readonly canPreview: boolean;
  readonly supportedFormat: boolean;
  readonly previewStatus: string;
  readonly previewUnavailableReason?: string | null;
  readonly downloadAllowed: boolean;
  readonly previewToken?: string | null;
  readonly previewUrl: string;
}

/**
 * Canonical message record in message history.
 */
export interface MessageResponse {
  readonly id: string;
  readonly turnId: string;
  readonly role: BackendConversationRole;
  readonly sequenceNumber: number;
  readonly attemptNumber: number;
  readonly isCanonical: boolean;
  readonly status: BackendGenerationStatus;
  readonly content: string;
  readonly sources?: readonly ConversationSourceCitation[] | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * Keyset-paginated message history response (GET /api/v1/ai/conversations/:id/messages).
 */
export interface MessageHistoryResponse {
  readonly messages: readonly MessageResponse[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Response payload for updating conversation title (PATCH /api/v1/ai/conversations/:id/title).
 */
export interface UpdateTitleResponse {
  readonly conversationId: string;
  readonly title: string;
  readonly updatedAt: string;
}

/**
 * Response payload for archiving a conversation (DELETE /api/v1/ai/conversations/:id).
 */
export interface ArchiveConversationResponse {
  readonly conversationId: string;
  readonly isArchived: boolean;
  readonly archivedAt: string;
}

/**
 * Response payload for privileged inspection (POST /api/v1/ai/conversations/:id/audit-inspect).
 */
export interface AuditInspectResponse {
  readonly auditLogId: string;
  readonly conversation: ConversationDetailResponse;
  readonly messages: readonly MessageResponse[];
  readonly inspectedAt: string;
}

/**
 * Standard normalized error response from AI conversation endpoints.
 */
export interface AiConversationErrorResponse {
  readonly statusCode: number;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly timestamp: string;
}

// ==========================================
// 4. Consolidated Persistent Domain Types
// ==========================================

/**
 * Full conversation persistent aggregate model.
 * Direct alias for ConversationDetailResponse.
 */
export type PersistentConversation = ConversationDetailResponse;

/**
 * Lightweight persistent conversation summary for lists and navigation.
 * Direct alias for ConversationSummaryResponse.
 */
export type PersistentConversationSummary = ConversationSummaryResponse;

/**
 * Canonical conversation message in persistent history.
 * Direct alias for MessageResponse.
 */
export type ConversationMessage = MessageResponse;

/**
 * Generic conversation metadata envelope.
 */
export type ConversationMetadata = Record<string, unknown>;

/**
 * Standard conversation list response envelope.
 * Direct alias for ListConversationsResponse.
 */
export type ConversationListResponse = ListConversationsResponse;

/**
 * Request payload for renaming a conversation.
 * Direct alias for UpdateConversationTitleRequest.
 */
export type RenameConversationRequest = UpdateConversationTitleRequest;

/**
 * Query pagination parameters for listing conversations.
 * Direct alias for ListConversationsQueryParams.
 */
export type ConversationPagination = ListConversationsQueryParams;

// ==========================================
// 5. Message Feedback Types (AI-09.5 - FB.02 / FB.03)
// ==========================================

/**
 * Feedback rating for assistant response evaluation.
 */
export type FeedbackRating = 'POSITIVE' | 'NEGATIVE';
export const FeedbackRating = {
  POSITIVE: 'POSITIVE' as const,
  NEGATIVE: 'NEGATIVE' as const,
};

/**
 * Request payload for submitting or updating response feedback.
 */
export interface SubmitFeedbackRequest {
  readonly rating: FeedbackRating;
  readonly explanation?: string;
  readonly category?: string;
}

/**
 * Persisted message feedback response envelope matching backend contract.
 */
export interface MessageFeedbackResponse {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly rating: FeedbackRating;
  readonly explanation?: string | null;
  readonly category?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Response payload for revoking feedback.
 */
export interface RevokeFeedbackResponse {
  readonly revoked: boolean;
  readonly messageId: string;
}

// ==========================================
// 6. Response Regeneration Types (AI-09.5 - FB.05)
// ==========================================

export interface RegenerateTurnRequest {
  readonly clientTurnId?: string;
  readonly messageId?: string;
}

export interface RegenerateTurnResponse {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnIndex: number;
  readonly attemptNumber: number;
  readonly assistantMessageId: string;
  readonly status: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  readonly userPrompt: string;
}
