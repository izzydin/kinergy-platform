import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { ClientTurnId } from '../../domain/value-objects/client-turn-id.vo';
import { TurnStatus } from '../../domain/enums/turn-status.enum';

export const AI_CONVERSATION_TURN_REPOSITORY_PORT = Symbol('IAiConversationTurnRepositoryPort');

/**
 * Filter options for querying turns belonging to a conversation.
 */
export interface FindTurnsFilter {
  readonly status?: TurnStatus;
  readonly fromTurnIndex?: number;
  readonly toTurnIndex?: number;
  readonly limit?: number;
}

/**
 * Explicit update contract for mutating turn lifecycle state.
 * Strictly controls status transitions and prevents arbitrary field overwrites.
 */
export interface UpdateTurnStatusDto {
  readonly status: TurnStatus;
  readonly completedAt?: Date | null;
  readonly activeAttemptId?: MessageId | string | null;
  readonly activeAttemptNumber?: number;
}

/**
 * Filter options for discovering pending or stalled turns awaiting execution or recovery.
 */
export interface FindPendingOrStalledTurnsFilter {
  readonly limit?: number;
  readonly leaseExpiredBefore?: Date;
}

/**
 * Outbound port for persistent storage and retrieval of AI Conversation Turns.
 *
 * Enforces tenant-isolated operations and unique turn/client idempotency constraints.
 * Relational integrity is authoritatively backed by PostgreSQL composite foreign keys.
 *
 * **Transaction Compatibility:**
 * Repository ports do not expose database-specific transaction primitives (such as Prisma.TransactionClient).
 * Turn operations compose cleanly within application-managed units of work.
 */
export interface IAiConversationTurnRepositoryPort {
  /**
   * Persists a turn within its parent conversation.
   */
  save(turn: AiConversationTurn): Promise<AiConversationTurn>;

  /**
   * Retrieves a turn using complete composite ownership: tenant, conversation, and turn ID.
   */
  findById(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationTurn | null>;

  /**
   * Retrieves a turn by its client-provided idempotency key (`clientTurnId`) within a tenant.
   */
  findByClientTurnId(
    tenantId: string,
    clientTurnId: ClientTurnId | string,
  ): Promise<AiConversationTurn | null>;

  /**
   * Retrieves a turn by conversation and turn-level idempotency key.
   */
  findByIdempotencyKey(
    tenantId: string,
    conversationId: ConversationId | string,
    idempotencyKey: string,
  ): Promise<AiConversationTurn | null>;

  /**
   * Retrieves a turn by its sequential turn index (1-based) within a conversation.
   */
  findByTurnIndex(
    tenantId: string,
    conversationId: ConversationId | string,
    turnIndex: number,
  ): Promise<AiConversationTurn | null>;

  /**
   * Looks up the currently active turn (status PENDING or STREAMING) for a conversation, if one exists.
   */
  findActiveTurn?(
    tenantId: string,
    conversationId: ConversationId | string,
  ): Promise<AiConversationTurn | null>;

  /**
   * Lists turns belonging to a conversation, ordered deterministically by `turnIndex ASC`.
   */
  listByConversation(
    tenantId: string,
    conversationId: ConversationId | string,
    filter?: FindTurnsFilter,
  ): Promise<AiConversationTurn[]>;

  /**
   * Updates turn lifecycle status and active attempt references using an explicit update contract.
   */
  updateStatus?(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
    update: UpdateTurnStatusDto,
  ): Promise<AiConversationTurn>;

  /**
   * Discovers pending turns awaiting execution or stalled turns whose active lease has expired.
   */
  findPendingOrStalledTurns?(
    filter?: FindPendingOrStalledTurnsFilter,
  ): Promise<AiConversationTurn[]>;
}
