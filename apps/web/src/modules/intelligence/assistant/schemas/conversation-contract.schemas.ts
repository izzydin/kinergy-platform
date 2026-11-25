import { z } from 'zod';
import type {
  BackendTurnStatus,
  BackendGenerationStatus,
  BackendConversationRole,
  IdempotencyOutcome,
  CreateConversationRequest,
  ReserveTurnRequest,
  UpdateConversationTitleRequest,
  CancelTurnRequest,
  ConversationSummaryResponse,
  ListConversationsResponse,
  TurnSummaryResponse,
  ConversationDetailResponse,
  CreateConversationResponse,
  ReserveTurnResponse,
  CancelTurnResponse,
  ConversationSourceCitation,
  MessageResponse,
  MessageHistoryResponse,
  UpdateTitleResponse,
  ArchiveConversationResponse,
  AiConversationErrorResponse,
  CitationDetailResponse,
  ListMessageCitationsResponse,
} from '../types/conversation-contract.types';

// ==========================================
// 1. Enums and Status Schemas
// ==========================================

export const backendTurnStatusSchema: z.ZodType<BackendTurnStatus> = z.enum([
  'PENDING',
  'STREAMING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);

export const backendGenerationStatusSchema: z.ZodType<BackendGenerationStatus> = z.enum([
  'PENDING',
  'STREAMING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);

export const backendConversationRoleSchema: z.ZodType<BackendConversationRole> = z.enum([
  'USER',
  'ASSISTANT',
  'SYSTEM',
]);

export const idempotencyOutcomeSchema: z.ZodType<IdempotencyOutcome> = z.enum([
  'CREATED',
  'EXISTING_RECOVERED',
]);

// ==========================================
// 2. Request Schemas
// ==========================================

export const createConversationRequestSchema: z.ZodType<CreateConversationRequest> = z.object({
  clientTurnId: z
    .string()
    .trim()
    .min(1, 'clientTurnId cannot be empty.')
    .max(64, 'clientTurnId cannot exceed 64 characters.'),
  userPrompt: z
    .string()
    .trim()
    .min(1, 'userPrompt cannot be empty.')
    .max(4000, 'userPrompt cannot exceed 4000 characters.'),
  title: z
    .string()
    .trim()
    .min(1, 'title cannot be empty.')
    .max(255, 'title cannot exceed 255 characters.')
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const reserveTurnRequestSchema: z.ZodType<ReserveTurnRequest> = z.object({
  clientTurnId: z
    .string()
    .trim()
    .min(1, 'clientTurnId cannot be empty.')
    .max(64, 'clientTurnId cannot exceed 64 characters.'),
  userPrompt: z
    .string()
    .trim()
    .min(1, 'userPrompt cannot be empty.')
    .max(4000, 'userPrompt cannot exceed 4000 characters.'),
  metadata: z.record(z.unknown()).optional(),
});

export const updateConversationTitleRequestSchema: z.ZodType<UpdateConversationTitleRequest> =
  z.object({
    title: z
      .string()
      .trim()
      .min(1, 'title cannot be empty.')
      .max(255, 'title cannot exceed 255 characters.'),
  });

export const cancelTurnRequestSchema: z.ZodType<CancelTurnRequest> = z.object({
  reason: z.string().trim().max(500, 'reason cannot exceed 500 characters.').optional(),
});

// ==========================================
// 3. Response Schemas
// ==========================================

export const citationPreviewStatusSchema = z.enum([
  'DOCUMENT_AVAILABLE',
  'DOCUMENT_SOFT_DELETED',
  'DOCUMENT_RESTRICTED',
  'EXCERPT_ONLY',
]);

export const conversationSourceCitationSchema: z.ZodType<ConversationSourceCitation> = z.object({
  citationId: z.string().nullable().optional(),
  documentId: z.string().min(1, 'documentId is required.'),
  documentTitle: z.string().min(1, 'documentTitle is required.'),
  chunkId: z.string().min(1, 'chunkId is required.'),
  excerpt: z.string().nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
  headingPath: z.array(z.string()).nullable().optional(),
  relevanceScore: z.number().min(0).max(1),
  retrievalRank: z.number().int().nonnegative().nullable().optional(),
  sourceStrategy: z.string().nullable().optional(),
  documentVersionId: z.string().nullable().optional(),
  documentVersionNumber: z.number().int().positive().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
  documentStatus: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  previewStatus: citationPreviewStatusSchema.nullable().optional(),
  canPreview: z.boolean().nullable().optional(),
});

export const citationDetailResponseSchema: z.ZodType<CitationDetailResponse> = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  turnId: z.string().min(1),
  conversationId: z.string().min(1),
  documentId: z.string().min(1),
  documentTitleSnapshot: z.string().min(1),
  documentTitle: z.string().min(1),
  originalFileName: z.string().nullable().optional(),
  documentStatus: z.string().nullable().optional(),
  documentVersionId: z.string().nullable().optional(),
  documentVersionNumber: z.number().int().positive().nullable().optional(),
  chunkId: z.string().nullable().optional(),
  citationPosition: z.number().int().positive(),
  excerpt: z.string(),
  pageNumber: z.number().int().positive().nullable().optional(),
  headingPath: z.array(z.string()).optional(),
  relevanceScore: z.number().min(0).max(1).nullable().optional(),
  retrievalRank: z.number().int().positive().nullable().optional(),
  sourceStrategy: z.string().nullable().optional(),
  previewStatus: citationPreviewStatusSchema,
  canPreview: z.boolean(),
  previewUnavailableReason: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string().optional(),
});

export const listMessageCitationsResponseSchema: z.ZodType<ListMessageCitationsResponse> = z.object(
  {
    citations: z.array(citationDetailResponseSchema),
  },
);

export const messageResponseSchema: z.ZodType<MessageResponse> = z.object({
  id: z.string().min(1, 'Message id is required.'),
  turnId: z.string().min(1, 'turnId is required.'),
  role: backendConversationRoleSchema,
  sequenceNumber: z.number().int().positive('sequenceNumber must be a positive integer.'),
  attemptNumber: z.number().int().positive('attemptNumber must be a positive integer.'),
  isCanonical: z.boolean(),
  status: backendGenerationStatusSchema,
  content: z.string(),
  sources: z.array(conversationSourceCitationSchema).nullable().optional(),
  createdAt: z.string().min(1, 'createdAt timestamp is required.'),
  completedAt: z.string().nullable(),
});

export const messageHistoryResponseSchema: z.ZodType<MessageHistoryResponse> = z.object({
  messages: z.array(messageResponseSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const turnSummaryResponseSchema: z.ZodType<TurnSummaryResponse> = z.object({
  id: z.string().min(1, 'Turn id is required.'),
  turnIndex: z.number().int().positive('turnIndex must be a positive integer.'),
  status: backendTurnStatusSchema,
  clientTurnId: z.string().min(1).max(64),
  activeAttemptId: z.string().nullable(),
  activeAttemptNumber: z.number().int().positive(),
  createdAt: z.string().min(1),
  completedAt: z.string().nullable(),
});

export const conversationSummaryResponseSchema: z.ZodType<ConversationSummaryResponse> = z.object({
  id: z.string().min(1, 'Conversation id is required.'),
  title: z.string().min(1, 'title is required.'),
  turnCounter: z.number().int().nonnegative(),
  lastActivityAt: z.string().min(1),
  createdAt: z.string().min(1),
  isArchived: z.boolean(),
});

export const listConversationsResponseSchema: z.ZodType<ListConversationsResponse> = z.object({
  items: z.array(conversationSummaryResponseSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const conversationDetailResponseSchema: z.ZodType<ConversationDetailResponse> = z.object({
  id: z.string().min(1, 'Conversation id is required.'),
  title: z.string().min(1),
  turnCounter: z.number().int().nonnegative(),
  messageCounter: z.number().int().nonnegative(),
  lastActivityAt: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  isArchived: z.boolean(),
  activeTurnId: z.string().nullable().optional(),
  turns: z.array(turnSummaryResponseSchema).optional(),
});

export const createConversationResponseSchema: z.ZodType<CreateConversationResponse> = z.object({
  conversationId: z.string().min(1),
  turnId: z.string().min(1),
  clientTurnId: z.string().min(1).max(64),
  turnIndex: z.number().int().positive(),
  userMessageId: z.string().min(1),
  assistantAttemptId: z.string().min(1),
  title: z.string().min(1),
  turnStatus: backendTurnStatusSchema,
  isIdempotentReplay: z.boolean(),
  idempotencyOutcome: idempotencyOutcomeSchema,
  createdAt: z.string().min(1),
});

export const reserveTurnResponseSchema: z.ZodType<ReserveTurnResponse> = z.object({
  conversationId: z.string().min(1),
  turnId: z.string().min(1),
  clientTurnId: z.string().min(1).max(64),
  turnIndex: z.number().int().positive(),
  userMessageId: z.string().min(1),
  assistantAttemptId: z.string().min(1),
  turnStatus: backendTurnStatusSchema,
  isIdempotentReplay: z.boolean(),
  idempotencyOutcome: idempotencyOutcomeSchema,
  createdAt: z.string().min(1),
});

export const cancelTurnResponseSchema: z.ZodType<CancelTurnResponse> = z.object({
  conversationId: z.string().min(1),
  turnId: z.string().min(1),
  turnStatus: z.literal('CANCELLED'),
  assistantMessageId: z.string().min(1),
  isAlreadyCancelled: z.boolean(),
  cancelledAt: z.string().min(1),
});

export const updateTitleResponseSchema: z.ZodType<UpdateTitleResponse> = z.object({
  conversationId: z.string().min(1),
  title: z.string().min(1).max(255),
  updatedAt: z.string().min(1),
});

export const archiveConversationResponseSchema: z.ZodType<ArchiveConversationResponse> = z.object({
  conversationId: z.string().min(1),
  isArchived: z.boolean(),
  archivedAt: z.string().min(1),
});

export const aiConversationErrorResponseSchema: z.ZodType<AiConversationErrorResponse> = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  code: z.string(),
  message: z.string(),
  path: z.string(),
  timestamp: z.string(),
});

// ==========================================
// 4. Validation & Safe Parsing Helpers
// ==========================================

export function parseCreateConversationResponse(data: unknown): CreateConversationResponse {
  return createConversationResponseSchema.parse(data);
}

export function parseReserveTurnResponse(data: unknown): ReserveTurnResponse {
  return reserveTurnResponseSchema.parse(data);
}

export function parseCancelTurnResponse(data: unknown): CancelTurnResponse {
  return cancelTurnResponseSchema.parse(data);
}

export function parseMessageHistoryResponse(data: unknown): MessageHistoryResponse {
  return messageHistoryResponseSchema.parse(data);
}

export function parseConversationDetailResponse(data: unknown): ConversationDetailResponse {
  return conversationDetailResponseSchema.parse(data);
}

export function parseListConversationsResponse(data: unknown): ListConversationsResponse {
  return listConversationsResponseSchema.parse(data);
}

export function parseUpdateTitleResponse(data: unknown): UpdateTitleResponse {
  return updateTitleResponseSchema.parse(data);
}

export function parseArchiveConversationResponse(data: unknown): ArchiveConversationResponse {
  return archiveConversationResponseSchema.parse(data);
}

export function validateCreateConversationRequest(data: unknown): CreateConversationRequest {
  return createConversationRequestSchema.parse(data);
}

export function validateReserveTurnRequest(data: unknown): ReserveTurnRequest {
  return reserveTurnRequestSchema.parse(data);
}

export function validateUpdateConversationTitleRequest(
  data: unknown,
): UpdateConversationTitleRequest {
  return updateConversationTitleRequestSchema.parse(data);
}

export function validateCancelTurnRequest(data: unknown): CancelTurnRequest {
  return cancelTurnRequestSchema.parse(data);
}

export function parseCitationDetailResponse(data: unknown): CitationDetailResponse {
  return citationDetailResponseSchema.parse(data);
}

export function parseListMessageCitationsResponse(data: unknown): ListMessageCitationsResponse {
  return listMessageCitationsResponseSchema.parse(data);
}
