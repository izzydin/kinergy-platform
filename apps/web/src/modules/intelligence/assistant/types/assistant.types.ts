import type { ApiError } from '../../../../shared/api/api-error';

/**
 * Message author role in conversation turns.
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Local delivery and processing status of a conversation message.
 */
export type MessageStatus =
  'pending' | 'generating' | 'cancelling' | 'success' | 'error' | 'cancelled' | 'interrupted';

/**
 * Search mode options for knowledge retrieval.
 * Matches backend RetrievalSearchMode enum from @kinergy-platform/core.
 */
export type RetrievalSearchMode = 'SEMANTIC' | 'KEYWORD' | 'HYBRID';

export const RetrievalSearchMode = {
  SEMANTIC: 'SEMANTIC' as const,
  KEYWORD: 'KEYWORD' as const,
  HYBRID: 'HYBRID' as const,
};

/**
 * Prior conversation turn payload matching backend ChatMessageDto.
 */
export interface ChatMessageDto {
  readonly role: MessageRole;
  readonly content: string;
}

/**
 * Request payload for knowledge query matching backend QueryKnowledgeRequestDto.
 */
export interface QueryKnowledgeRequestDto {
  readonly query: string;
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
  readonly conversationHistory?: readonly ChatMessageDto[];
  readonly conversationId?: string;
}

/**
 * Verifiable source citation matching backend RAGSourceCitationDto.
 */
export interface RAGSourceCitationDto {
  readonly citationId?: string | null;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly chunkId: string;
  readonly excerpt?: string;
  readonly pageNumber?: number;
  readonly headingPath?: readonly string[];
  readonly relevanceScore: number;
  readonly retrievalRank?: number;
  readonly sourceStrategy?: string;
  readonly documentVersionId?: string;
  readonly documentVersionNumber?: number;
  readonly originalFileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly documentStatus?: string | null;
  readonly previewStatus?:
    'DOCUMENT_AVAILABLE' | 'DOCUMENT_SOFT_DELETED' | 'DOCUMENT_RESTRICTED' | 'EXCERPT_ONLY';
  readonly canPreview?: boolean;
  readonly previewUnavailableReason?: string | null;
}

/**
 * Generation execution telemetry matching backend RAGMetadataDto.
 */
export interface RAGMetadataDto {
  readonly model: string;
  readonly retrievalCount: number;
  readonly latencyMs: number;
  readonly finishReason?: string;
}

/**
 * Backend RAG query response payload matching backend RAGAnswerResponseDto.
 */
export interface RAGAnswerResponseDto {
  readonly answer: string;
  readonly grounded: boolean;
  readonly sources: readonly RAGSourceCitationDto[];
  readonly metadata: RAGMetadataDto;
}

// Aliases for domain readability requested by enterprise conventions
export type AnswerGenerationRequest = QueryKnowledgeRequestDto;
export type AnswerGenerationResponse = RAGAnswerResponseDto;
export type CitationMetadata = RAGSourceCitationDto;
export type GenerationMetadata = RAGMetadataDto;

/**
 * Standard pagination query parameters.
 */
export interface PaginationParams {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Standard paginated response envelope.
 */
export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

/**
 * Domain ChatMessage entity stored on the client.
 */
export interface ChatMessage {
  readonly id: string;
  readonly turnId?: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: string;
  readonly status: MessageStatus;
  readonly grounded?: boolean;
  readonly sources?: readonly RAGSourceCitationDto[];
  readonly metadata?: RAGMetadataDto;
  readonly error?: string;
  readonly sequenceNumber?: number;
}

/**
 * Full conversation entity stored in client-side partitioned storage.
 */
export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly ChatMessage[];
  readonly tenantId: string;
  readonly userId: string;
}

/**
 * Lightweight conversation summary for thread list / sidebar rendering.
 */
export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
  readonly lastMessagePreview?: string;
}

/**
 * Assistant UI View State machine values.
 */
export type AssistantViewState = 'idle' | 'conversing' | 'generating' | 'error';

/**
 * Active conversational context for current view.
 */
export interface AssistantActiveContext {
  readonly conversationId?: string;
  readonly isNewThread: boolean;
  readonly viewState: AssistantViewState;
}

/**
 * Assistant prompt composer input state.
 */
export interface AssistantComposerState {
  readonly draft: string;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
}

/**
 * Normalized API error alias.
 */
export type AssistantApiError = ApiError;
