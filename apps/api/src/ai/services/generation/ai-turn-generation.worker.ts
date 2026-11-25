import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import {
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  AI_CONVERSATION_REPOSITORY_PORT,
  IAiConversationTurnRepositoryPort,
  IAiConversationRepositoryPort,
  TurnStatus,
  AiTurnErrorClassifier,
} from '@kinergy-platform/core';
import { AiTurnDispatcherService } from './ai-turn-dispatcher.service';

export interface TurnGenerationWorkerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  staleThresholdMs?: number;
  batchSize?: number;
  shutdownTimeoutMs?: number;
}

export const DEFAULT_TURN_GENERATION_WORKER_OPTIONS: Required<TurnGenerationWorkerOptions> = {
  enabled: true,
  pollIntervalMs: 15_000, // 15 seconds
  staleThresholdMs: 300_000, // 5 minutes
  batchSize: 10,
  shutdownTimeoutMs: 5_000, // 5 seconds
};

/**
 * Background recovery and polling worker for AI generation turns.
 *
 * Guarantees:
 * 1. Crash recovery: Turns committed in PENDING status prior to worker crash are picked up and dispatched.
 * 2. Stalled lease recovery: Turns in STREAMING status with expired leases are recovered.
 * 3. Graceful shutdown: Cleanly finishes or aborts in-flight turns within shutdown timeout budget.
 * 4. Deduplication: Skips turns that are already actively executing on this worker.
 */
@Injectable()
export class AiTurnGenerationWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiTurnGenerationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private isShuttingDown = false;
  private readonly options: Required<TurnGenerationWorkerOptions>;

  constructor(
    @Inject(AI_CONVERSATION_TURN_REPOSITORY_PORT)
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    @Inject(AI_CONVERSATION_REPOSITORY_PORT)
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly dispatcher: AiTurnDispatcherService,
    @Optional() options?: TurnGenerationWorkerOptions,
  ) {
    this.options = {
      ...DEFAULT_TURN_GENERATION_WORKER_OPTIONS,
      ...options,
    };
  }

  public onModuleInit(): void {
    if (!this.options.enabled) {
      this.logger.log('AiTurnGenerationWorker background polling is disabled.');
      return;
    }

    this.logger.log(
      `AiTurnGenerationWorker initialized with pollInterval=${this.options.pollIntervalMs}ms, staleThreshold=${this.options.staleThresholdMs}ms.`,
    );

    this.timer = setInterval(() => {
      this.poll().catch((err: unknown) => {
        const classified = AiTurnErrorClassifier.classify(err);
        this.logger.error(
          `Unhandled error during AI turn generation recovery cycle [${classified.category}/${classified.errorCode}]: ${classified.sanitizedErrorMessage}`,
        );
      });
    }, this.options.pollIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public async onApplicationShutdown(signal?: string): Promise<void> {
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const activeCount = this.dispatcher.getActiveCount();
    if (activeCount > 0) {
      this.logger.warn(
        `AiTurnGenerationWorker received shutdown signal '${signal}'. Waiting for ${activeCount} active turns (up to ${this.options.shutdownTimeoutMs}ms)...`,
      );

      const start = Date.now();
      while (
        this.dispatcher.getActiveCount() > 0 &&
        Date.now() - start < this.options.shutdownTimeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (this.dispatcher.getActiveCount() > 0) {
        this.logger.warn(
          `Shutdown budget expired with ${this.dispatcher.getActiveCount()} active turns remaining. Aborting in-flight turns with WORKER_SHUTDOWN.`,
        );
        this.dispatcher.abortAllActive('WORKER_SHUTDOWN');
      }
    }

    this.logger.log('AiTurnGenerationWorker shutdown cleanly.');
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Single polling execution cycle. Can be triggered manually in tests.
   */
  public async poll(): Promise<{
    recoveredPending: number;
    recoveredStalled: number;
  }> {
    if (this.isPolling || this.isShuttingDown) {
      return { recoveredPending: 0, recoveredStalled: 0 };
    }

    this.isPolling = true;

    try {
      if (!this.turnRepo.findPendingOrStalledTurns) {
        return { recoveredPending: 0, recoveredStalled: 0 };
      }

      const leaseExpiredBefore = new Date(Date.now() - this.options.staleThresholdMs);
      const candidates = await this.turnRepo.findPendingOrStalledTurns({
        leaseExpiredBefore,
        limit: this.options.batchSize,
      });

      if (candidates.length === 0) {
        return { recoveredPending: 0, recoveredStalled: 0 };
      }

      let recoveredPending = 0;
      let recoveredStalled = 0;

      for (const turn of candidates) {
        if (this.isShuttingDown) break;

        const tenantId = turn.tenantId;
        const convId = turn.conversationId.value;
        const turnId = turn.id.value;

        // Skip if already active in dispatcher
        if (this.dispatcher.isTurnActive(tenantId, convId, turnId)) {
          continue;
        }

        // Fetch conversation to determine userId
        const conv = await this.convRepo.findById(tenantId, turn.conversationId);
        if (!conv) {
          this.logger.warn(
            `Orphan turn '${turnId}' found without parent conversation '${convId}'.`,
          );
          continue;
        }

        const dispatchResult = await this.dispatcher.dispatchTurn({
          tenantId,
          userId: conv.userId,
          conversationId: convId,
          turnId,
          attemptId: turn.activeAttemptId?.value ?? '',
          attemptNumber: turn.activeAttemptNumber ?? 1,
          actorContext: {
            roles: [],
            permissions: [],
          },
        });

        if (dispatchResult.dispatched) {
          if (turn.status === TurnStatus.PENDING) {
            recoveredPending++;
          } else {
            recoveredStalled++;
          }
        }
      }

      if (recoveredPending > 0 || recoveredStalled > 0) {
        this.logger.log(
          `Recovery cycle completed: ${recoveredPending} pending and ${recoveredStalled} stalled turns dispatched.`,
        );
      }

      return { recoveredPending, recoveredStalled };
    } finally {
      this.isPolling = false;
    }
  }
}
