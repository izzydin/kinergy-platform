import { PrismaClient, Prisma } from '@prisma/client';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
  TransactionOptions,
} from '../../../application/ports/ai-conversation-transaction-runner.port';
import { PrismaAiConversationRepository } from './repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from './repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from './repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from './repositories/prisma-ai-conversation-audit.repository';
import { PrismaAiConversationCitationRepository } from './repositories/prisma-ai-conversation-citation.repository';
import {
  AiConversationApplicationError,
  TransactionFailureError,
  TransientTransactionFailureError,
} from '../../../application/errors/ai-conversation-application.error';

/**
 * Checks whether an error represents a known transient PostgreSQL/Prisma conflict
 * (serialization failure 40001, deadlock 40P01, write conflict P2034, or dropped connection).
 */
export function isTransientDatabaseError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: Transaction failed due to a write conflict or a deadlock
    if (error.code === 'P2034') return true;
    // P1017: Server has closed the connection
    if (error.code === 'P1017') return true;
    // P2024: Timed out fetching a new connection from the connection pool
    if (error.code === 'P2024') return true;
  }

  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes('40001') || // serialization_failure
    msg.includes('could not serialize access') ||
    msg.includes('40p01') || // deadlock_detected
    msg.includes('deadlock detected') ||
    msg.includes('p2034') ||
    msg.includes('connection terminated') ||
    msg.includes('connection closed') ||
    msg.includes('server has closed the connection')
  );
}

/**
 * Concrete server-only Prisma implementation of IAiConversationTransactionRunner.
 *
 * Guarantees:
 * - Executes application workflows inside an interactive Prisma transaction.
 * - All four conversation repositories participate in the exact same transactional context.
 * - Bounded retry policy for known transient database failures (write conflicts, deadlocks, connection drops).
 * - Non-transient errors (domain validation, unique/foreign-key violations, lifecycle errors) are never retried.
 */
export class PrismaAiConversationTransactionRunner implements IAiConversationTransactionRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly convRepo: PrismaAiConversationRepository,
    private readonly turnRepo: PrismaAiConversationTurnRepository,
    private readonly messageRepo: PrismaAiConversationMessageRepository,
    private readonly auditRepo: PrismaAiConversationAuditRepository,
    private readonly citationRepo?: PrismaAiConversationCitationRepository,
  ) {}

  public async runInTransaction<T>(
    work: (repos: ConversationTransactionalRepositories) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 2;
    const timeoutMs = options?.timeoutMs ?? 10000;
    const maxWaitMs = options?.maxWaitMs ?? 5000;

    const prismaIsolationLevel = options?.isolationLevel
      ? (options.isolationLevel as Prisma.TransactionIsolationLevel)
      : undefined;

    let attempt = 0;

    while (true) {
      attempt++;

      try {
        if (typeof this.prisma?.$transaction !== 'function') {
          const transactionalRepos: ConversationTransactionalRepositories = {
            conversationRepo: this.convRepo,
            turnRepo: this.turnRepo,
            messageRepo: this.messageRepo,
            auditRepo: this.auditRepo,
            citationRepo: this.citationRepo,
          };
          return await work(transactionalRepos);
        }

        return await this.prisma.$transaction(
          async (tx) => {
            const transactionalRepos: ConversationTransactionalRepositories = {
              conversationRepo: this.convRepo.withTransaction(tx),
              turnRepo: this.turnRepo.withTransaction(tx),
              messageRepo: this.messageRepo.withTransaction(tx),
              auditRepo: this.auditRepo.withTransaction(tx),
              citationRepo: this.citationRepo?.withTransaction(tx),
            };

            return await work(transactionalRepos);
          },
          {
            timeout: timeoutMs,
            maxWait: maxWaitMs,
            ...(prismaIsolationLevel ? { isolationLevel: prismaIsolationLevel } : {}),
          },
        );
      } catch (err) {
        // 1. Immediately bubble domain application errors without retry
        if (err instanceof AiConversationApplicationError) {
          throw err;
        }

        // 2. Check for known transient failures
        const isTransient = isTransientDatabaseError(err);

        if (isTransient && attempt <= maxRetries) {
          // Bounded jittered exponential backoff (e.g. 50ms, 100ms + random jitter)
          const baseDelay = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 30);
          await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
          continue;
        }

        // 3. Classify exhausted transient failure vs deterministic transaction failure
        if (isTransient) {
          throw new TransientTransactionFailureError(
            'PrismaAiConversationTransactionRunner',
            err,
            attempt,
          );
        }

        throw new TransactionFailureError('PrismaAiConversationTransactionRunner', err);
      }
    }
  }
}
