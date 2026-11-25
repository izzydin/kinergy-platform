import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiTurnDispatcherPort } from '../../ports/inbound/ai-turn-dispatcher.port';
import {
  RegenerateConversationTurnInput,
  RegenerateTurnResult,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
  TurnAlreadyInProgressError,
  InvalidMessageOperationError,
} from '../errors/ai-conversation-application.error';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';

/**
 * Use case to prepare and trigger the regeneration of an eligible assistant response.
 *
 * Guarantees (FB.05):
 * 1. Validates authenticated user ownership and tenant boundaries.
 * 2. Enforces single active generation: rejects regeneration if any turn is currently in-flight.
 * 3. Enforces eligibility: only completed, failed, cancelled, or interrupted assistant messages can be regenerated.
 * 4. Preserves chronological and causal history: only the latest assistant response in a conversation can be regenerated.
 * 5. Reuses existing multi-attempt architecture: creates a new attempt (attemptNumber = current + 1) with isCanonical: false.
 * 6. Preserves the original assistant response, its citations, and its feedback completely intact.
 * 7. Transitions the turn to PENDING and dispatches to the established AI-08 / BE.06 generation pipeline.
 */
export class RegenerateConversationTurnUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly txRunner?: IAiConversationTransactionRunner,
    private readonly dispatcher?: IAiTurnDispatcherPort,
  ) {}

  public async execute(input: RegenerateConversationTurnInput): Promise<RegenerateTurnResult> {
    // 1. Input Validation
    if (!input) {
      throw new InvalidTurnInputError('input', 'Input cannot be null or undefined.');
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    const userId = input.userId?.trim();
    if (!userId) {
      throw new InvalidTurnInputError('userId', 'User ID is required.');
    }

    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }

    const turnId = input.turnId?.trim();
    const messageId = input.messageId?.trim();

    if (!turnId && !messageId) {
      throw new InvalidTurnInputError(
        'turnId',
        'Either turnId or messageId must be provided to regenerate.',
      );
    }

    // 2. Pre-flight Validation: Conversation Existence, Ownership & Lifecycle
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    if (conversation.tenantId !== tenantId || conversation.userId !== userId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    if (conversation.isArchived()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Cannot regenerate an assistant response in an archived or deleted conversation.',
      );
    }

    // 3. Enforce Single Active Generation Invariant
    const activeTurn = this.turnRepo.findActiveTurn
      ? await this.turnRepo.findActiveTurn(tenantId, conversationId)
      : null;

    if (activeTurn) {
      throw new TurnAlreadyInProgressError(conversationId, activeTurn.id.value);
    }

    // 4. Resolve Target Turn & Message
    let resolvedTurnId = turnId;

    if (messageId) {
      const targetMessage = await this.messageRepo.findById(tenantId, conversationId, messageId);
      if (!targetMessage) {
        throw new MessageNotFoundError(messageId, undefined, conversationId);
      }

      if (targetMessage.role !== ConversationRole.ASSISTANT) {
        throw new InvalidMessageOperationError(
          messageId,
          'Only assistant messages can be regenerated.',
        );
      }

      if (turnId && targetMessage.turnId.value !== turnId) {
        throw new InvalidMessageOperationError(
          messageId,
          `Message '${messageId}' does not belong to turn '${turnId}'.`,
        );
      }

      resolvedTurnId = targetMessage.turnId.value;
    }

    const targetTurn = await this.turnRepo.findById(tenantId, conversationId, resolvedTurnId!);
    if (!targetTurn) {
      throw new TurnNotFoundError(resolvedTurnId!, conversationId, tenantId);
    }

    if (targetTurn.conversationId.value !== conversationId) {
      throw new TurnNotFoundError(resolvedTurnId!, conversationId, tenantId);
    }

    // 5. Eligibility Validation
    // 5a. Reject in-flight turn states
    if (targetTurn.status === TurnStatus.PENDING || targetTurn.status === TurnStatus.STREAMING) {
      throw new TurnAlreadyInProgressError(conversationId, targetTurn.id.value);
    }

    // 5b. Enforce Linear Conversation Invariant (Latest Turn Only)
    // Historical messages with subsequent completed turns cannot be regenerated without conversation branching
    const allTurns = await this.turnRepo.listByConversation(tenantId, conversationId);
    const hasSubsequentTurn = allTurns.some((t) => t.turnIndex > targetTurn.turnIndex);

    if (hasSubsequentTurn) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Only the latest assistant response in a conversation can be regenerated.',
      );
    }

    // 6. Transactional Preparation for Regeneration
    const performRegenerationWork = async (repos: ConversationTransactionalRepositories) => {
      // Re-read conversation and lock sequence counter
      const inTxConv = await repos.conversationRepo.findById(tenantId, conversationId);
      if (!inTxConv) {
        throw new ConversationNotFoundError(conversationId, tenantId);
      }

      // Re-read turn
      const inTxTurn = await repos.turnRepo.findById(tenantId, conversationId, targetTurn.id.value);
      if (!inTxTurn) {
        throw new TurnNotFoundError(targetTurn.id.value, conversationId, tenantId);
      }

      // Concurrency check inside transaction
      if (inTxTurn.status === TurnStatus.PENDING || inTxTurn.status === TurnStatus.STREAMING) {
        throw new TurnAlreadyInProgressError(conversationId, inTxTurn.id.value);
      }

      // Find user prompt for this turn
      const turnMessages = await repos.messageRepo.listByTurn(
        tenantId,
        conversationId,
        inTxTurn.id,
      );
      const userMessage = turnMessages.find((m) => m.role === ConversationRole.USER);
      if (!userMessage) {
        throw new InvalidConversationLifecycleError(
          conversationId,
          `Turn '${inTxTurn.id.value}' lacks a user prompt message.`,
        );
      }

      // Allocate unique sequence number for the new attempt
      const newSeq = inTxConv.incrementMessageCounter();
      inTxConv.recordActivity();
      await repos.conversationRepo.save(inTxConv);

      // Allocate next attempt sequence
      const nextAttemptNumber = inTxTurn.activeAttemptNumber + 1;
      const newAssistantAttempt = AiConversationMessage.create({
        turnId: inTxTurn.id,
        conversationId: inTxConv.id,
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: newSeq,
        attemptNumber: nextAttemptNumber,
        isCanonical: false, // remains non-canonical until execution completes successfully
        status: GenerationStatus.PENDING,
        content: '',
      });
      await repos.messageRepo.save(newAssistantAttempt);

      // Transition turn to PENDING with new active attempt allocated
      inTxTurn.prepareForRegeneration(newAssistantAttempt.id, nextAttemptNumber);
      await repos.turnRepo.save(inTxTurn);

      return {
        turn: inTxTurn,
        assistantAttempt: newAssistantAttempt,
        userPrompt: userMessage.content,
      };
    };

    let preparedState: {
      turn: typeof targetTurn;
      assistantAttempt: AiConversationMessage;
      userPrompt: string;
    };

    if (this.txRunner) {
      preparedState = await this.txRunner.runInTransaction(performRegenerationWork);
    } else {
      preparedState = await performRegenerationWork({
        conversationRepo: this.convRepo,
        turnRepo: this.turnRepo,
        messageRepo: this.messageRepo,
      });
    }

    // 7. Dispatch the Turn to Background Generation Pipeline
    if (this.dispatcher) {
      await this.dispatcher.dispatchTurn({
        tenantId,
        userId,
        conversationId,
        turnId: preparedState.turn.id.value,
        attemptId: preparedState.assistantAttempt.id.value,
        attemptNumber: preparedState.assistantAttempt.attemptNumber,
        actorContext: {
          roles: input.actorContext?.roles ?? [],
          permissions: input.actorContext?.permissions ?? [],
        },
        requestId: input.requestId,
        correlationId: input.correlationId,
      });
    }

    // 8. Return Updated State
    return {
      conversationId,
      turnId: preparedState.turn.id.value,
      turnIndex: preparedState.turn.turnIndex,
      attemptNumber: preparedState.assistantAttempt.attemptNumber,
      assistantMessageId: preparedState.assistantAttempt.id.value,
      status: TurnStatus.PENDING,
      userPrompt: preparedState.userPrompt,
    };
  }
}
