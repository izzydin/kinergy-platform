import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';

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
