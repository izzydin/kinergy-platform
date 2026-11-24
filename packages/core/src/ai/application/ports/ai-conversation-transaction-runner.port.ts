import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationAuditRepositoryPort } from '../../ports/outbound/ai-conversation-audit-repository.port';

export const AI_CONVERSATION_TRANSACTION_RUNNER = Symbol('IAiConversationTransactionRunner');

/**
 * Encapsulates the set of conversation repositories bound to a single active transaction.
 * Guarantees that all repositories in an application workflow participate in the same atomic transaction.
 */
export interface ConversationTransactionalRepositories {
  readonly conversationRepo: IAiConversationRepositoryPort;
  readonly turnRepo: IAiConversationTurnRepositoryPort;
  readonly messageRepo: IAiConversationMessageRepositoryPort;
  readonly auditRepo: IAiConversationAuditRepositoryPort;
}

/**
 * Options configuring transaction execution boundaries, timeouts, and transient retry policy.
 */
export interface TransactionOptions {
  /** Maximum number of retry attempts for transient database conflicts (defaults to 2, i.e. 3 total attempts) */
  readonly maxRetries?: number;
  /** Maximum time in milliseconds to wait for transaction completion (defaults to 10000ms) */
  readonly timeoutMs?: number;
  /** Maximum time in milliseconds to wait to acquire a database connection from the pool (defaults to 5000ms) */
  readonly maxWaitMs?: number;
  /** Database transaction isolation level */
  readonly isolationLevel?: 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
}

/**
 * Application-facing transaction execution abstraction.
 * Allows application use cases to define atomic transaction boundaries without depending
 * on Prisma, database clients, or infrastructure transaction primitives.
 */
export interface IAiConversationTransactionRunner {
  /**
   * Executes the provided work atomically within a transaction.
   * If work succeeds, all operations commit. If work throws or rejects, all operations roll back.
   *
   * @param work Callback receiving repositories bound to the active transaction context
   * @param options Optional configuration for transient retries, timeout, and isolation level
   * @returns The result of the work callback
   */
  runInTransaction<T>(
    work: (repos: ConversationTransactionalRepositories) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}
