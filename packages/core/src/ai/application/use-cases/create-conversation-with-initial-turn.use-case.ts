import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import {
  CreateConversationWithInitialTurnInput,
  CreateConversationWithInitialTurnResult,
} from '../dtos/ai-conversation.dtos';
import {
  AiConversationApplicationError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
  TransactionFailureError,
} from '../errors/ai-conversation-application.error';
import { AiPayloadHasher } from '../services/ai-payload-hasher';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { DuplicateEntityException } from '../../domain/exceptions/conversation.exceptions';
import { IAiConversationLoggerPort } from '../ports/ai-conversation-logger.port';
import { AiConversationRedactionService } from '../services/ai-conversation-redaction.service';
import { IAiTurnDispatcherPort } from '../../ports/inbound/ai-turn-dispatcher.port';

export class CreateConversationWithInitialTurnUseCase {
  constructor(
    private readonly txRunner: IAiConversationTransactionRunner,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly logger?: IAiConversationLoggerPort,
    private readonly turnDispatcher?: IAiTurnDispatcherPort,
  ) {}

  public async execute(
    input: CreateConversationWithInitialTurnInput,
  ): Promise<CreateConversationWithInitialTurnResult> {
    // 1. Validate Input
    this.validateInput(input);

    const tenantId = input.tenantId.trim();
    const userId = input.userId.trim();
    const clientTurnId = input.clientTurnId.trim();
    const prompt = input.userPrompt.trim();
    const idempotencyKey = input.idempotencyKey?.trim() || clientTurnId;

    // 2. Deterministic Payload Hashing
    const computedHash =
      input.idempotencyPayloadHash?.trim() ||
      AiPayloadHasher.hash({ prompt, metadata: input.metadata });

    // 3. Preliminary Idempotency Check (fast-path retry check outside transaction)
    const existingTurn = await this.turnRepo.findByClientTurnId(tenantId, clientTurnId);
    if (existingTurn) {
      return this.handleExistingTurn(existingTurn, computedHash, clientTurnId, tenantId);
    }

    // 4. Atomic Transaction Execution
    try {
      const finalResult = await this.txRunner.runInTransaction(async (repos) => {
        // Guard against concurrency race committed between preliminary check and tx start
        const inTxExistingTurn = await repos.turnRepo.findByClientTurnId(tenantId, clientTurnId);
        if (inTxExistingTurn) {
          return this.handleExistingTurn(
            inTxExistingTurn,
            computedHash,
            clientTurnId,
            tenantId,
            repos,
          );
        }

        // 4a. Derive Title & Create Conversation Aggregate
        const title = input.title
          ? ConversationTitle.create(input.title)
          : ConversationTitle.deriveFromPrompt(prompt);

        const conversation = AiConversation.create({
          tenantId,
          userId,
          title,
          idempotencyKey,
        });

        // 4b. Allocate Sequence Counters Monotonically
        const turnIndex = conversation.incrementTurnCounter(); // 1
        const userSeq = conversation.incrementMessageCounter(); // 1
        const assistantSeq = conversation.incrementMessageCounter(); // 2

        // 4c. Persist Conversation Aggregate
        await repos.conversationRepo.save(conversation);

        // 4d. Create Initial Turn (activeAttemptId is null initially to satisfy foreign key order)
        const turn = AiConversationTurn.create({
          conversationId: conversation.id,
          tenantId,
          turnIndex,
          status: TurnStatus.PENDING,
          clientTurnId,
          idempotencyKey,
          idempotencyPayloadHash: computedHash,
          activeAttemptId: null,
          activeAttemptNumber: 1,
        });
        await repos.turnRepo.save(turn);

        // 4e. Create Initial User Message
        const userMessage = AiConversationMessage.create({
          turnId: turn.id,
          conversationId: conversation.id,
          tenantId,
          role: ConversationRole.USER,
          sequenceNumber: userSeq,
          content: prompt,
          status: GenerationStatus.SUCCESS,
          isCanonical: false,
          attemptNumber: 1,
        });
        await repos.messageRepo.save(userMessage);

        // 4f. Create Initial Assistant Placeholder Message
        const assistantMessage = AiConversationMessage.create({
          turnId: turn.id,
          conversationId: conversation.id,
          tenantId,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: assistantSeq,
          content: '',
          status: GenerationStatus.PENDING,
          isCanonical: false,
          attemptNumber: 1,
        });
        await repos.messageRepo.save(assistantMessage);

        // 4g. Associate Active Attempt with Turn & Persist
        turn.associateActiveAttempt({
          id: assistantMessage.id,
          turnId: turn.id,
          conversationId: conversation.id,
          tenantId,
          role: ConversationRole.ASSISTANT,
          attemptNumber: 1,
        });
        await repos.turnRepo.save(turn);

        const result: CreateConversationWithInitialTurnResult = {
          conversationId: conversation.id.value,
          turnId: turn.id.value,
          clientTurnId,
          turnIndex: turn.turnIndex,
          userMessageId: userMessage.id.value,
          assistantAttemptId: assistantMessage.id.value,
          title: conversation.title.value,
          turnStatus: turn.status,
          isIdempotentReplay: false,
          idempotencyOutcome: 'CREATED',
          createdAt: turn.createdAt.toISOString(),
        };

        if (this.logger) {
          this.logger.info(
            'Initial AI conversation and turn created successfully',
            AiConversationRedactionService.sanitizeContext({
              operation: 'CreateConversationWithInitialTurn',
              tenantId,
              userId,
              conversationId: result.conversationId,
              turnId: result.turnId,
              clientTurnId,
              idempotencyOutcome: 'CREATED',
            }),
          );
        }

        return result;
      });

      if (!finalResult.isIdempotentReplay && this.turnDispatcher) {
        try {
          await this.turnDispatcher.dispatchTurn({
            tenantId,
            userId,
            conversationId: finalResult.conversationId,
            turnId: finalResult.turnId,
            attemptId: finalResult.assistantAttemptId,
            attemptNumber: 1,
            actorContext: input.actorContext ?? { roles: [], permissions: [] },
            requestId: input.requestId,
            correlationId: input.correlationId,
          });
        } catch (dispatchErr) {
          if (this.logger) {
            this.logger.warn(
              'Failed to immediately dispatch initial turn; background worker will recover it',
              AiConversationRedactionService.sanitizeContext({
                operation: 'CreateConversationWithInitialTurn',
                tenantId,
                turnId: finalResult.turnId,
                failureCategory:
                  dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
              }),
            );
          }
        }
      }

      return finalResult;
    } catch (error) {
      if (this.logger) {
        this.logger.warn(
          'Error or concurrency race encountered during initial turn creation',
          AiConversationRedactionService.sanitizeContext({
            operation: 'CreateConversationWithInitialTurn',
            tenantId,
            clientTurnId,
            failureCategory:
              error instanceof AiConversationApplicationError ? error.code : 'UNKNOWN',
          }),
        );
      }

      // 5. Unique-Constraint Concurrency Race Arbitration
      if (this.isIdempotencyConflict(error)) {
        // Wait for winning concurrent transaction to commit (up to 500ms in 25ms increments)
        for (let attempt = 0; attempt < 20; attempt++) {
          const committedTurn = await this.turnRepo.findByClientTurnId(tenantId, clientTurnId);
          if (committedTurn) {
            return this.handleExistingTurn(committedTurn, computedHash, clientTurnId, tenantId);
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      throw error;
    }
  }

  private validateInput(input: CreateConversationWithInitialTurnInput): void {
    if (!input) {
      throw new InvalidTurnInputError('input', 'Request input object cannot be null or undefined.');
    }
    if (
      !input.tenantId ||
      typeof input.tenantId !== 'string' ||
      input.tenantId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required and cannot be empty.');
    }
    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim().length === 0) {
      throw new InvalidTurnInputError('userId', 'User ID is required and cannot be empty.');
    }
    if (
      !input.clientTurnId ||
      typeof input.clientTurnId !== 'string' ||
      input.clientTurnId.trim().length === 0
    ) {
      throw new InvalidTurnInputError(
        'clientTurnId',
        'Client turn ID is required and cannot be empty.',
      );
    }
    if (
      !input.userPrompt ||
      typeof input.userPrompt !== 'string' ||
      input.userPrompt.trim().length === 0
    ) {
      throw new InvalidTurnInputError('userPrompt', 'User prompt cannot be empty or whitespace.');
    }
  }

  private async handleExistingTurn(
    turn: AiConversationTurn,
    computedHash: string,
    clientTurnId: string,
    tenantId: string,
    transactionalRepos?: ConversationTransactionalRepositories,
  ): Promise<CreateConversationWithInitialTurnResult> {
    if (turn.idempotencyPayloadHash !== computedHash) {
      throw new DuplicateClientTurnPayloadMismatchError(
        clientTurnId,
        turn.idempotencyPayloadHash,
        computedHash,
      );
    }

    const convRepo = transactionalRepos?.conversationRepo ?? this.convRepo;
    const msgRepo = transactionalRepos?.messageRepo ?? this.messageRepo;

    const conv = await convRepo.findById(tenantId, turn.conversationId);
    const messages = await msgRepo.listByTurn(tenantId, turn.conversationId, turn.id);
    const userMsg = messages.find((m) => m.role === ConversationRole.USER);
    const assistantMsg = messages.find((m) => m.role === ConversationRole.ASSISTANT);

    const result: CreateConversationWithInitialTurnResult = {
      conversationId: turn.conversationId.value,
      turnId: turn.id.value,
      clientTurnId,
      turnIndex: turn.turnIndex,
      userMessageId: userMsg?.id.value ?? '',
      assistantAttemptId: assistantMsg?.id.value ?? turn.activeAttemptId?.value ?? '',
      title: conv?.title.value ?? 'New Conversation',
      turnStatus: turn.status,
      isIdempotentReplay: true,
      idempotencyOutcome: 'EXISTING_RECOVERED',
      createdAt: turn.createdAt.toISOString(),
    };

    if (this.logger) {
      this.logger.info(
        'Initial AI conversation recovered via idempotency',
        AiConversationRedactionService.sanitizeContext({
          operation: 'CreateConversationWithInitialTurn',
          tenantId,
          conversationId: result.conversationId,
          turnId: result.turnId,
          clientTurnId,
          idempotencyOutcome: 'EXISTING_RECOVERED',
        }),
      );
    }

    return result;
  }

  private isIdempotencyConflict(error: unknown): boolean {
    if (error instanceof DuplicateEntityException) {
      return true;
    }
    if (error instanceof TransactionFailureError) {
      if (error.originalError && this.isIdempotencyConflict(error.originalError)) {
        return true;
      }
      return this.isIdempotencyConflict(error.details?.['rootCause'] ?? error.message);
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('unique constraint') ||
        msg.includes('duplicate') ||
        msg.includes('already exists') ||
        msg.includes('p2002') ||
        msg.includes('23505') ||
        msg.includes('uq_turn_tenant_client_turn_id') ||
        msg.includes('uq_conversation_user_idempotency')
      );
    }
    if (typeof error === 'string') {
      const msg = error.toLowerCase();
      return (
        msg.includes('unique constraint') ||
        msg.includes('duplicate') ||
        msg.includes('already exists') ||
        msg.includes('p2002') ||
        msg.includes('23505') ||
        msg.includes('uq_turn_tenant_client_turn_id') ||
        msg.includes('uq_conversation_user_idempotency')
      );
    }
    return false;
  }
}
