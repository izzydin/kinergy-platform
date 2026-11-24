import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { MessageHistoryCursor } from '../../domain/value-objects/message-history-cursor.vo';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';

export const AI_CONVERSATION_MESSAGE_REPOSITORY_PORT = Symbol(
  'IAiConversationMessageRepositoryPort',
);

/**
 * Options for querying canonical conversation message history.
 * Uses immutable sequence-based keyset pagination.
 */
export interface ListCanonicalHistoryOptions {
  readonly cursor?: MessageHistoryCursor | string | null;
  readonly limit?: number; // Defaults to 20, max 100
  readonly direction?: 'forward' | 'backward';
}

/**
 * Result of paginating canonical conversation message history.
 */
export interface CanonicalHistoryResult {
  readonly messages: readonly AiConversationMessage[];
  readonly nextCursor: MessageHistoryCursor | null;
  readonly hasMore?: boolean;
}

/**
 * Explicit update contract for mutating generation attempt status and output.
 * Prevents modifying immutable relation keys (tenantId, conversationId, turnId, role).
 */
export interface UpdateMessageStatusDto {
  readonly status: GenerationStatus;
  readonly content?: string;
  readonly isCanonical?: boolean;
  readonly completedAt?: Date | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly sources?: ReadonlyArray<Record<string, unknown>> | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

/**
 * Contract for acquiring or extending an exclusive worker lease on an assistant generation attempt.
 */
export interface AcquireMessageLeaseDto {
  readonly leaseToken: string;
  readonly leaseOwnerInstanceId: string;
  readonly leaseExpiresAt: Date;
}

/**
 * Outbound port for persistent storage and keyset pagination of conversation messages.
 *
 * Enforces tenant, conversation, and turn ownership boundaries on all operations.
 * Relational integrity is authoritatively backed by PostgreSQL composite foreign keys.
 *
 * **Pagination & Consistency Guarantee:**
 * Message history uses strictly immutable sequence numbers (`sequenceNumber ASC, id ASC`).
 * Unlike activity-based pagination, immutable sequence keyset pagination guarantees strict snapshot consistency.
 *
 * **Transaction Compatibility:**
 * Repository ports do not expose database-specific transaction primitives (such as Prisma.TransactionClient).
 * Generation attempt updates compose cleanly within application-managed units of work.
 */
export interface IAiConversationMessageRepositoryPort {
  /**
   * Persists a conversation message or assistant generation attempt.
   */
  save(message: AiConversationMessage): Promise<AiConversationMessage>;

  /**
   * Retrieves a message using tenant, conversation, and message ID.
   */
  findById(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<AiConversationMessage | null>;

  /**
   * Retrieves a message by its monotonic sequence number within a conversation.
   */
  findBySequenceNumber(
    tenantId: string,
    conversationId: ConversationId | string,
    sequenceNumber: number,
  ): Promise<AiConversationMessage | null>;

  /**
   * Retrieves the canonical assistant output message for a specific turn, if finalized.
   */
  findCanonicalAssistantMessage?(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationMessage | null>;

  /**
   * Lists all messages (user prompts, canonical answers, and historical attempts) for a single turn.
   */
  listByTurn(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationMessage[]>;

  /**
   * Keyset paginates the canonical history of a conversation using immutable sequence numbers.
   */
  listCanonicalHistory(
    tenantId: string,
    conversationId: ConversationId | string,
    options?: ListCanonicalHistoryOptions,
  ): Promise<CanonicalHistoryResult>;

  /**
   * Updates message generation status and content using an explicit update contract.
   */
  updateStatus?(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    update: UpdateMessageStatusDto,
  ): Promise<AiConversationMessage>;

  /**
   * Acquires or extends an exclusive generation lease for a background worker.
   */
  acquireLease?(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    lease: AcquireMessageLeaseDto,
  ): Promise<AiConversationMessage>;
}
