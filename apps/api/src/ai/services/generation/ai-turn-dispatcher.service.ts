import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  IAiTurnDispatcherPort,
  TurnDispatchCommand,
  TurnDispatchResult,
  AiTurnErrorClassifier,
  TurnStatus,
  IAiConversationTurnRepositoryPort,
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  ExecuteConversationTurnUseCase,
} from '@kinergy-platform/core';

export interface ActiveExecutionRecord {
  readonly abortController: AbortController;
  readonly startedAt: Date;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly turnId: string;
}

/**
 * Service orchestrating reliable turn generation dispatch and in-flight cancellation signaling.
 *
 * Guarantees:
 * 1. Asynchronous execution: Generation pipeline runs in background, never blocking HTTP responses.
 * 2. Deduplication: In-memory registry prevents duplicate concurrent execution of the same turn.
 * 3. Terminal safety: Rejects dispatch of COMPLETED or CANCELLED turns.
 * 4. Cancellation bridging: Signals in-flight execution via AbortController.
 * 5. Robust error classification: Maps errors to standard taxonomy without leaking secrets or stack traces.
 */
@Injectable()
export class AiTurnDispatcherService implements IAiTurnDispatcherPort {
  private readonly logger = new Logger(AiTurnDispatcherService.name);
  private readonly activeExecutions = new Map<string, ActiveExecutionRecord>();

  constructor(
    @Inject(AI_CONVERSATION_TURN_REPOSITORY_PORT)
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly executeTurnUseCase: ExecuteConversationTurnUseCase,
  ) {}

  public async dispatchTurn(command: TurnDispatchCommand): Promise<TurnDispatchResult> {
    const { tenantId, userId, conversationId, turnId } = command;
    const executionKey = this.buildKey(tenantId, conversationId, turnId);

    // 1. In-memory Active Duplicate Guard
    if (this.activeExecutions.has(executionKey)) {
      this.logger.debug(
        `Turn '${turnId}' is already actively executing on this worker instance. Skipping duplicate dispatch.`,
      );
      return {
        turnId,
        dispatched: false,
        status: 'ALREADY_ACTIVE',
        message: 'Turn generation is already actively executing.',
      };
    }

    // 2. Database State Pre-check
    const turn = await this.turnRepo.findById(tenantId, conversationId, turnId);
    if (!turn) {
      this.logger.warn(
        `Turn '${turnId}' not found for dispatch in conversation '${conversationId}'.`,
      );
      return {
        turnId,
        dispatched: false,
        status: 'FAILED',
        message: 'Turn not found.',
      };
    }

    if (turn.status === TurnStatus.COMPLETED) {
      this.logger.debug(`Turn '${turnId}' is already COMPLETED. Skipping redundant dispatch.`);
      return {
        turnId,
        dispatched: false,
        status: 'ALREADY_COMPLETED',
        message: 'Turn is already completed.',
      };
    }

    if (turn.status === TurnStatus.CANCELLED) {
      this.logger.debug(`Turn '${turnId}' is CANCELLED. Skipping dispatch.`);
      return {
        turnId,
        dispatched: false,
        status: 'SKIPPED',
        message: 'Turn generation was cancelled.',
      };
    }

    // 3. Register In-flight Execution Record
    const abortController = new AbortController();
    this.activeExecutions.set(executionKey, {
      abortController,
      startedAt: new Date(),
      tenantId,
      conversationId,
      turnId,
    });

    // 4. Detach Asynchronous Generation Execution
    setImmediate(async () => {
      try {
        await this.executeTurnUseCase.execute({
          tenantId,
          userId,
          conversationId,
          turnId,
          signal: abortController.signal,
          actorContext: command.actorContext,
          requestId: command.requestId,
          correlationId: command.correlationId,
        });
      } catch (err: unknown) {
        const classified = AiTurnErrorClassifier.classify(err);
        this.logger.error(
          `Background turn execution failed for turn '${turnId}' [${classified.category}/${classified.errorCode}]: ${classified.sanitizedErrorMessage}`,
        );
      } finally {
        this.activeExecutions.delete(executionKey);
      }
    });

    return {
      turnId,
      dispatched: true,
      status: 'DISPATCHED',
    };
  }

  public async cancelTurn(
    tenantId: string,
    conversationId: string,
    turnId: string,
    reason?: string,
  ): Promise<boolean> {
    const executionKey = this.buildKey(tenantId, conversationId, turnId);
    const active = this.activeExecutions.get(executionKey);
    if (active) {
      this.logger.log(
        `Signaling cancellation for in-flight turn '${turnId}' (reason: ${reason ?? 'none'})`,
      );
      active.abortController.abort(new Error(reason || 'GENERATION_CANCELLED'));
      return true;
    }
    return false;
  }

  public isTurnActive(tenantId: string, conversationId: string, turnId: string): boolean {
    const executionKey = this.buildKey(tenantId, conversationId, turnId);
    return this.activeExecutions.has(executionKey);
  }

  public getActiveCount(): number {
    return this.activeExecutions.size;
  }

  public abortAllActive(reason = 'WORKER_SHUTDOWN'): void {
    for (const [key, execution] of this.activeExecutions.entries()) {
      this.logger.warn(`Aborting active turn execution '${key}' due to: ${reason}`);
      execution.abortController.abort(new Error(reason));
    }
  }

  private buildKey(tenantId: string, conversationId: string, turnId: string): string {
    return `${tenantId}:${conversationId}:${turnId}`;
  }
}
