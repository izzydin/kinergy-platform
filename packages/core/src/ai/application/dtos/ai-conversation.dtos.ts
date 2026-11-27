import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { FeedbackRating } from '../../domain/enums/feedback-rating.enum';

// ==========================================
// 1. Create Conversation With Initial Turn
// ==========================================

export interface CreateConversationWithInitialTurnInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly clientTurnId: string;
  readonly userPrompt: string;
  readonly idempotencyKey?: string;
  readonly idempotencyPayloadHash?: string;
  readonly title?: string;
  readonly metadata?: Record<string, unknown>;
  readonly actorContext?: {
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface CreateConversationWithInitialTurnResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly clientTurnId: string;
  readonly turnIndex: number;
  readonly userMessageId: string;
  readonly assistantAttemptId: string;
  readonly title: string;
  readonly turnStatus: TurnStatus;
  readonly isIdempotentReplay: boolean;
  readonly idempotencyOutcome: 'CREATED' | 'EXISTING_RECOVERED';
  readonly createdAt: string;
}

// ==========================================
// 2. Reserve Subsequent Conversation Turn
// ==========================================

export interface ReserveConversationTurnInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly clientTurnId: string;
  readonly userPrompt: string;
  readonly metadata?: Record<string, unknown>;
  readonly idempotencyKey?: string;
  readonly idempotencyPayloadHash?: string;
  readonly actorContext?: {
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
  readonly requestId?: string;
  readonly correlationId?: string;
}

export type ReserveSubsequentTurnInput = ReserveConversationTurnInput;

export interface ReserveConversationTurnResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly clientTurnId: string;
  readonly turnIndex: number;
  readonly userMessageId: string;
  readonly assistantAttemptId: string;
  readonly turnStatus: TurnStatus;
  readonly isIdempotentReplay: boolean;
  readonly idempotencyOutcome: 'CREATED' | 'EXISTING_RECOVERED';
  readonly createdAt: string;
}

export type ReserveSubsequentTurnResult = ReserveConversationTurnResult;

// ==========================================
// 3. Get Conversation Details
// ==========================================

export interface GetConversationInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly includeTurns?: boolean;
}

export interface TurnSummaryDto {
  readonly id: string;
  readonly turnIndex: number;
  readonly status: TurnStatus;
  readonly clientTurnId: string;
  readonly activeAttemptId: string | null;
  readonly activeAttemptNumber: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface ConversationDetailDto {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly title: string;
  readonly turnCounter: number;
  readonly messageCounter: number;
  readonly lastActivityAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isArchived: boolean;
  readonly turns?: readonly TurnSummaryDto[];
  readonly activeTurnId?: string | null;
}

// ==========================================
// 4. List Conversations
// ==========================================

export interface ListConversationsInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly includeArchived?: boolean;
}

export interface ConversationSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly turnCounter: number;
  readonly lastActivityAt: string;
  readonly createdAt: string;
  readonly isArchived: boolean;
}

export interface ListConversationsResult {
  readonly items: readonly ConversationSummaryDto[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

// ==========================================
// 5. Retrieve Message History
// ==========================================

export interface GetMessageHistoryInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly cursor?: string | null;
  readonly limit?: number;
}

export interface MessageDto {
  readonly id: string;
  readonly turnId: string;
  readonly role: ConversationRole;
  readonly sequenceNumber: number;
  readonly attemptNumber: number;
  readonly isCanonical: boolean;
  readonly status: GenerationStatus;
  readonly content: string;
  readonly sources?: readonly Record<string, unknown>[] | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface MessageHistoryResultDto {
  readonly messages: readonly MessageDto[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

// ==========================================
// 6. Update Conversation Title
// ==========================================

export interface UpdateConversationTitleInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly title: string;
  readonly userId?: string;
}

export interface UpdateConversationTitleResult {
  readonly conversationId: string;
  readonly title: string;
  readonly updatedAt: string;
}

// ==========================================
// 7. Archive Conversation
// ==========================================

export interface ArchiveConversationInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly allowAdminOverride?: boolean;
}

export interface ArchiveConversationResult {
  readonly conversationId: string;
  readonly isArchived: boolean;
  readonly archivedAt: string;
}

// ==========================================
// 8. Persist Approved Message State Changes
// ==========================================

export interface PersistMessageStateInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly status: GenerationStatus;
  readonly content?: string;
  readonly isCanonical?: boolean;
  readonly completedAt?: Date | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly sources?: ReadonlyArray<Record<string, unknown>> | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface PersistMessageStateResult {
  readonly messageId: string;
  readonly status: GenerationStatus;
  readonly isCanonical: boolean;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

// ==========================================
// 9. Citations & Source Document Inspection
// ==========================================

export type CitationPreviewStatus =
  | 'DOCUMENT_AVAILABLE'
  | 'DOCUMENT_SOFT_DELETED'
  | 'DOCUMENT_RESTRICTED'
  | 'EXCERPT_ONLY'
  | 'UNSUPPORTED_FORMAT';

export interface CitationDetailDto {
  readonly id: string;
  readonly messageId: string;
  readonly turnId: string;
  readonly conversationId: string;
  readonly documentId: string;
  readonly documentVersionId: string | null;
  readonly documentVersionNumber?: number | null;
  readonly chunkId: string | null;
  readonly citationPosition: number;
  readonly documentTitleSnapshot: string;
  readonly documentTitle: string;
  readonly originalFileName?: string | null;
  readonly documentStatus?: string | null;
  readonly excerpt: string;
  readonly pageNumber: number | null;
  readonly headingPath: readonly string[];
  readonly relevanceScore: number | null;
  readonly retrievalRank: number | null;
  readonly sourceStrategy: string | null;
  readonly previewStatus: CitationPreviewStatus;
  readonly canPreview: boolean;
  readonly previewUnavailableReason: string | null;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly createdAt: string;
}

export interface GetMessageCitationsInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly userId?: string;
  readonly userRoles?: readonly string[];
  readonly actorRoles?: readonly string[];
}

export interface GetMessageCitationsResult {
  readonly conversationId: string;
  readonly messageId: string;
  readonly citations: readonly CitationDetailDto[];
  readonly totalCitations: number;
}

export interface GetCitationDetailInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly citationId: string;
  readonly userId?: string;
  readonly userRoles?: readonly string[];
  readonly actorRoles?: readonly string[];
}

export interface GetCitationDetailResult {
  readonly citation: CitationDetailDto;
}

// ==========================================
// 10. CIT.06 Authorized Citation Preview & Streaming
// ==========================================

export interface CitationPreviewResultDto {
  readonly documentId: string;
  readonly citationId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly documentTitleSnapshot: string;
  readonly documentTitle: string;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly documentVersionId: string | null;
  readonly documentVersionNumber: number | null;
  readonly pageNumber: number | null;
  readonly headingPath: readonly string[];
  readonly excerpt: string;
  readonly canPreview: boolean;
  readonly supportedFormat: boolean;
  readonly previewStatus: CitationPreviewStatus;
  readonly previewUnavailableReason: string | null;
  readonly downloadAllowed: boolean;
}

export interface GetCitationPreviewInput {
  readonly tenantId: string;
  readonly userId?: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly citationId: string;
  readonly userRoles?: readonly string[];
  readonly actorRoles?: readonly string[];
}

export interface GetCitationPreviewResult {
  readonly preview: CitationPreviewResultDto;
}

export interface GetCitationDocumentStreamInput {
  readonly tenantId: string;
  readonly userId?: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly citationId: string;
  readonly userRoles?: readonly string[];
  readonly actorRoles?: readonly string[];
}

export interface GetCitationDocumentStreamResult {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly originalFileName: string;
  readonly checksum: string;
  readonly pageNumber: number | null;
  readonly headingPath: readonly string[];
}

// ==========================================
// 10. Message Feedback
// ==========================================

export interface MessageFeedbackDto {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly rating: FeedbackRating;
  readonly explanation: string | null;
  readonly category: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubmitMessageFeedbackInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly rating: FeedbackRating;
  readonly explanation?: string | null;
  readonly category?: string | null;
}

export interface SubmitMessageFeedbackResult {
  readonly feedback: MessageFeedbackDto;
  readonly isUpdate: boolean;
}

export interface GetMessageFeedbackInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
}

export interface GetMessageFeedbackResult {
  readonly feedback: MessageFeedbackDto | null;
}

export interface RevokeMessageFeedbackInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
}

export interface RevokeMessageFeedbackResult {
  readonly revoked: boolean;
  readonly messageId: string;
}

// ==========================================
// 12. Regenerate Conversation Turn
// ==========================================

export interface RegenerateConversationTurnInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId?: string;
  readonly messageId?: string;
  readonly clientTurnId?: string;
  readonly actorContext?: {
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
  readonly executionConfig?: Record<string, unknown>;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface RegenerateTurnResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnIndex: number;
  readonly attemptNumber: number;
  readonly assistantMessageId: string;
  readonly status: TurnStatus;
  readonly userPrompt: string;
}
