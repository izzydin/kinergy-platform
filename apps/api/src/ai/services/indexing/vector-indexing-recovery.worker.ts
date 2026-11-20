import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import {
  IVectorIndexingJobRepositoryPort,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  VectorIndexingErrorCode,
} from '@kinergy-platform/core';

export interface VectorIndexingRecoveryOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  staleThresholdMs?: number;
  batchLimit?: number;
}

export const DEFAULT_VECTOR_RECOVERY_OPTIONS: Required<VectorIndexingRecoveryOptions> = {
  enabled: true,
  pollIntervalMs: 30_000, // 30 seconds
  staleThresholdMs: 300_000, // 5 minutes
  batchLimit: 20,
};

/**
 * Background worker that reconciles stalled or orphaned vector indexing jobs.
 * Handles process crashes, network partition timeouts, and worker interruptions.
 */
@Injectable()
export class VectorIndexingRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VectorIndexingRecoveryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isReconciling = false;
  private readonly options: Required<VectorIndexingRecoveryOptions>;

  constructor(
    @Inject(VECTOR_INDEXING_JOB_REPOSITORY_PORT)
    private readonly jobRepo: IVectorIndexingJobRepositoryPort,
    @Optional() options?: VectorIndexingRecoveryOptions,
  ) {
    this.options = {
      ...DEFAULT_VECTOR_RECOVERY_OPTIONS,
      ...options,
    };
  }

  public onModuleInit(): void {
    if (!this.options.enabled) {
      this.logger.log('VectorIndexingRecoveryWorker background polling is disabled.');
      return;
    }

    this.logger.log(
      `Starting VectorIndexingRecoveryWorker (interval: ${this.options.pollIntervalMs}ms, staleThreshold: ${this.options.staleThresholdMs}ms)...`,
    );

    this.timer = setInterval(() => {
      this.reconcileStaleJobs().catch((err) => {
        this.logger.error(`Error during vector indexing reconciliation cycle: ${err}`);
      });
    }, this.options.pollIntervalMs);
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Identifies and reconciles stale RUNNING jobs whose leases have expired.
   */
  public async reconcileStaleJobs(): Promise<number> {
    if (this.isReconciling) {
      return 0;
    }

    this.isReconciling = true;
    let reconciledCount = 0;

    try {
      const staleBefore = new Date(Date.now() - this.options.staleThresholdMs);
      const staleJobs = await this.jobRepo.listStaleJobs(staleBefore, this.options.batchLimit);

      if (staleJobs.length === 0) {
        return 0;
      }

      this.logger.warn(
        `Found ${staleJobs.length} stale RUNNING vector indexing jobs to reconcile.`,
      );

      for (const job of staleJobs) {
        try {
          const reset = job.resetForRetry();
          if (reset) {
            this.logger.log(
              `Job '${job.id}' lease expired (attempt ${job.attemptCount}/${job.maxAttempts}). Resetting to PENDING for recovery.`,
            );
          } else {
            this.logger.error(
              `Job '${job.id}' exceeded max attempts (${job.attemptCount}/${job.maxAttempts}). Transitioning to FAILED.`,
            );
            job.fail(
              VectorIndexingErrorCode.TIMEOUT,
              `Job exceeded maximum execution attempts (${job.maxAttempts}) without completion.`,
            );
          }

          await this.jobRepo.save(job);
          reconciledCount++;
        } catch (jobErr) {
          this.logger.error(`Failed to reconcile stale job '${job.id}': ${jobErr}`);
        }
      }
    } finally {
      this.isReconciling = false;
    }

    return reconciledCount;
  }
}
