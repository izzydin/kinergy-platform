import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { ConversationListCursor } from '../../domain/value-objects/conversation-list-cursor.vo';

export const AI_CONVERSATION_REPOSITORY_PORT = Symbol('IAiConversationRepositoryPort');

/**
 * Filter options for requesting related conversation data.
 */
export interface ConversationIncludeOptions {
  readonly includeTurns?: boolean;
  readonly includeLatestTurnOnly?: boolean;
}

/**
 * Conversation entity bundled with explicitly requested related aggregates.
 */
export interface ConversationWithDetails {
  readonly conversation: AiConversation;
  readonly turns?: readonly AiConversationTurn[];
  readonly activeTurn?: AiConversationTurn | null;
}

/**
 * Explicit update contract for mutable conversation metadata.
 * Prohibits passing unvalidated arbitrary objects or mutating immutable relational IDs.
 */
export interface UpdateConversationMetadataDto {
  readonly title?: ConversationTitle | string;
  readonly lastActivityAt?: Date;
  readonly isArchived?: boolean;
}

/**
 * Keyset-based pagination request for conversation listing.
 *
 * **Consistency Notice:**
 * Ordered deterministically by `(lastActivityAt DESC, id DESC)`.
 * Because `lastActivityAt` is updated upon every new turn or message,
 * this pagination does NOT guarantee snapshot consistency. If concurrent writes
 * occur, conversations may shift positions across pages.
 */
export interface ConversationPaginationRequest {
  readonly cursor?: ConversationListCursor | string | null;
  readonly limit?: number; // Defaults to 20, max 100
  readonly offset?: number; // Optional offset fallback for legacy pagination
  readonly includeArchived?: boolean;
}

/**
 * Typed result of a paginated conversation listing.
 */
export interface ConversationPaginationResult {
  readonly items: readonly AiConversation[];
  readonly nextCursor: ConversationListCursor | null;
  readonly hasMore: boolean;
  readonly totalCount?: number;
}

/**
 * Legacy offset options retained for backward compatibility with existing test harnesses.
 */
export interface ListAiConversationsOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly includeArchived?: boolean;
}

/**
 * Outbound port for persistent storage and retrieval of AI Conversation aggregate roots.
 *
 * All operations strictly enforce tenant isolation by requiring `tenantId` as the first parameter.
 * Relational integrity is authoritatively backed by PostgreSQL composite foreign keys.
 *
 * **Transaction Compatibility:**
 * Repository ports do not expose database-specific transaction primitives (such as Prisma.TransactionClient).
 * Transaction orchestration is managed by application-level unit-of-work abstractions in later milestones.
 */
export interface IAiConversationRepositoryPort {
  /**
   * Persists a conversation aggregate root.
   */
  save(conversation: AiConversation): Promise<AiConversation>;

  /**
   * Retrieves a conversation by its unique ID within a tenant boundary.
   */
  findById(tenantId: string, id: ConversationId | string): Promise<AiConversation | null>;

  /**
   * Retrieves a conversation with explicitly requested related turns or active state.
   */
  findByIdWithDetails?(
    tenantId: string,
    id: ConversationId | string,
    include?: ConversationIncludeOptions,
  ): Promise<ConversationWithDetails | null>;

  /**
   * Retrieves a conversation by tenant, user, and idempotency key for retry safety.
   */
  findByIdempotencyKey(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<AiConversation | null>;

  /**
   * Updates mutable conversation metadata using an explicit update contract.
   */
  updateMetadata?(
    tenantId: string,
    id: ConversationId | string,
    update: UpdateConversationMetadataDto,
  ): Promise<AiConversation>;

  /**
   * Lists conversations for a user within a tenant.
   */
  listByUser(
    tenantId: string,
    userId: string,
    options?: ListAiConversationsOptions,
  ): Promise<AiConversation[]>;

  /**
   * Lists conversations for a user using deterministic keyset pagination.
   */
  listByUserPaginated?(
    tenantId: string,
    userId: string,
    request?: ConversationPaginationRequest,
  ): Promise<ConversationPaginationResult>;

  /**
   * Lists conversations for administrative clinical inspection/audit.
   */
  listForAudit(tenantId: string, options?: ListAiConversationsOptions): Promise<AiConversation[]>;

  /**
   * Lists conversations for audit using deterministic keyset pagination.
   */
  listForAuditPaginated?(
    tenantId: string,
    request?: ConversationPaginationRequest,
  ): Promise<ConversationPaginationResult>;

  /**
   * Soft-deletes (archives) a conversation within a tenant boundary.
   */
  softDelete(tenantId: string, id: ConversationId | string): Promise<void>;

  /**
   * Hard-deletes a conversation and cascaded turns/messages through an explicitly authorized operation.
   * Note: Audit logs survive conversation hard-deletion.
   */
  hardDelete?(tenantId: string, id: ConversationId | string): Promise<void>;
}
