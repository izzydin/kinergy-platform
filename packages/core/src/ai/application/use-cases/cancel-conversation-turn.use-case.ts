import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiTurnDispatcherPort } from '../../ports/inbound/ai-turn-dispatcher.port';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';

export interface CancelConversationTurnInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId?: string;
  readonly messageId?: string;
  readonly reason?: string;
}

export interface CancelConversationTurnResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnStatus: TurnStatus;
  readonly assistantMessageId: string;
  readonly isAlreadyCancelled: boolean;
  readonly cancelledAt: string;
}

/**
 * Canonical use case for safely cancelling an active or pending conversation turn generation.
 *
 * Guarantees:
 * 1. Cancellation is strictly idempotent: repeatedly cancelling an already CANCELLED turn returns success without side-effects.
 * 2. Terminal integrity: Cannot cancel an already COMPLETED turn.
 * 3. Atomic state mutation: Transitions turn status and generation attempt placeholder to CANCELLED atomically in PostgreSQL.
 * 4. In-flight execution signaling: Signals active worker via IAiTurnDispatcherPort to stop in-flight retrieval/inference.
 * 5. Racing finalization protection: Guaranteed by transaction runner fencing in ExecuteConversationTurnUseCase.
 */
export class CancelConversationTurnUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly txRunner?: IAiConversationTransactionRunner,
    private readonly turnDispatcher?: IAiTurnDispatcherPort,
  ) {}

  public async execute(input: CancelConversationTurnInput): Promise<CancelConversationTurnResult> {
    if (!input) {
      throw new InvalidTurnInputError('input', 'Cancellation input cannot be null or undefined.');
    }
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }
    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }
    const userId = input.userId?.trim();
    if (!userId) {
      throw new InvalidTurnInputError('userId', 'User ID is required.');
    }

    // 1. Verify Conversation & Ownership
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }
    if (conversation.tenantId !== tenantId || conversation.userId !== userId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    // 2. Resolve Turn ID (from turnId, messageId, or active in-flight turn)
    let resolvedTurnId = input.turnId?.trim();
    if (!resolvedTurnId && input.messageId?.trim()) {
      const msg = await this.messageRepo.findById(tenantId, conversationId, input.messageId.trim());
      if (!msg) {
        throw new MessageNotFoundError(input.messageId.trim(), conversationId, tenantId);
      }
      resolvedTurnId = msg.turnId.value;
    }
    if (!resolvedTurnId) {
      const activeTurn = this.turnRepo.findActiveTurn
        ? await this.turnRepo.findActiveTurn(tenantId, conversationId)
        : null;
      if (!activeTurn) {
        throw new InvalidTurnInputError(
          'turnId',
          'Either turnId or messageId must be provided, or an active turn must exist in the conversation.',
        );
      }
      resolvedTurnId = activeTurn.id.value;
    }

    const turnId = resolvedTurnId;

    // 3. Verify Turn
    const turn = await this.turnRepo.findById(tenantId, conversationId, turnId);
    if (!turn) {
      throw new TurnNotFoundError(turnId, conversationId, tenantId);
    }

    // 3. Fast-path Idempotency Check
    if (turn.status === TurnStatus.CANCELLED) {
      return {
        conversationId,
        turnId,
        turnStatus: TurnStatus.CANCELLED,
        assistantMessageId: turn.activeAttemptId?.value ?? '',
        isAlreadyCancelled: true,
        cancelledAt: turn.completedAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    // 4. Terminal Guard: Cannot cancel completed turn
    if (turn.status === TurnStatus.COMPLETED) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Cannot cancel turn '${turnId}' because it has already COMPLETED.`,
      );
    }

    // 5. Signal In-flight Execution Mechanism (AbortController)
    if (this.turnDispatcher?.cancelTurn) {
      try {
        await this.turnDispatcher.cancelTurn(tenantId, conversationId, turnId, input.reason);
      } catch {
        // Continue to persist terminal cancellation regardless of dispatcher notification status
      }
    }

    // 6. Atomic Cancellation Transaction
    const executeCancellationWork = async (repos: {
      conversationRepo: IAiConversationRepositoryPort;
      turnRepo: IAiConversationTurnRepositoryPort;
      messageRepo: IAiConversationMessageRepositoryPort;
    }) => {
      const inTxTurn = await repos.turnRepo.findById(tenantId, conversationId, turnId);
      if (!inTxTurn) {
        throw new TurnNotFoundError(turnId, conversationId, tenantId);
      }

      if (inTxTurn.status === TurnStatus.CANCELLED) {
        return {
          turnStatus: TurnStatus.CANCELLED,
          isAlreadyCancelled: true,
          cancelledAt: inTxTurn.completedAt ?? new Date(),
        };
      }

      if (inTxTurn.status === TurnStatus.COMPLETED) {
        throw new InvalidConversationLifecycleError(
          conversationId,
          `Cannot cancel turn '${turnId}' because it has already COMPLETED.`,
        );
      }

      const now = new Date();

      // Mutate active assistant attempt placeholder
      if (inTxTurn.activeAttemptId && repos.messageRepo.updateStatus) {
        await repos.messageRepo.updateStatus(
          tenantId,
          conversationId,
          inTxTurn.activeAttemptId.value,
          {
            status: GenerationStatus.CANCELLED,
            isCanonical: false,
            completedAt: now,
            errorCode: 'GENERATION_CANCELLED',
            errorMessage: input.reason ?? 'Turn generation was cancelled by user.',
          },
        );
      }

      // Mutate Turn
      if (repos.turnRepo.updateStatus) {
        await repos.turnRepo.updateStatus(tenantId, conversationId, turnId, {
          status: TurnStatus.CANCELLED,
          completedAt: now,
        });
      }

      // Touch Conversation Activity Timestamp
      if (repos.conversationRepo.updateMetadata) {
        await repos.conversationRepo.updateMetadata(tenantId, conversationId, {
          lastActivityAt: now,
        });
      }

      return {
        turnStatus: TurnStatus.CANCELLED,
        isAlreadyCancelled: false,
        cancelledAt: now,
      };
    };

    const txResult = this.txRunner
      ? await this.txRunner.runInTransaction(async (repos: ConversationTransactionalRepositories) =>
          executeCancellationWork(repos),
        )
      : await executeCancellationWork({
          conversationRepo: this.convRepo,
          turnRepo: this.turnRepo,
          messageRepo: this.messageRepo,
        });

    return {
      conversationId,
      turnId,
      turnStatus: txResult.turnStatus,
      assistantMessageId: turn.activeAttemptId?.value ?? '',
      isAlreadyCancelled: txResult.isAlreadyCancelled,
      cancelledAt: txResult.cancelledAt.toISOString(),
    };
  }
}
