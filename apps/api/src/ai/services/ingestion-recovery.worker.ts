import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { IIngestionJobRepositoryPort } from '@kinergy-platform/core';
import { INGESTION_JOB_REPOSITORY } from '../ai.tokens';
import { IngestionOrchestratorService } from './ingestion-orchestrator.service';
import { IngestionErrorCode, IngestionRetryPolicy } from './ingestion-retry.policy';

export interface RecoveryWorkerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  staleThresholdMs?: number;
  batchSize?: number;
}

export const DEFAULT_RECOVERY_WORKER_OPTIONS: Required<RecoveryWorkerOptions> = {
  enabled: true,
  pollIntervalMs: 15_000, // 15 seconds
  staleThresholdMs: 300_000, // 5 minutes
  batchSize: 10,
};

/**
 * Background recovery and polling worker.
 * Periodically polls for:
 * 1. Newly uploaded documents awaiting processing (UPLOADED).
 * 2. Scheduled retries whose backoff delay has elapsed (FAILED + nextRetryAt <= now).
 * 3. Stalled active jobs indicative of a worker crash or unexpected termination.
 */
@Injectable()
export class IngestionRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionRecoveryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private readonly options: Required<RecoveryWorkerOptions>;

  constructor(
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly jobRepo: IIngestionJobRepositoryPort,
    private readonly orchestrator: IngestionOrchestratorService,
    @Optional() options?: RecoveryWorkerOptions,
  ) {
    this.options = {
      ...DEFAULT_RECOVERY_WORKER_OPTIONS,
      ...options,
    };
  }

  public onModuleInit(): void {
    if (!this.options.enabled) {
      this.logger.log('IngestionRecoveryWorker background polling is disabled.');
      return;
    }

    this.logger.log(
      `IngestionRecoveryWorker initialized with pollInterval=${this.options.pollIntervalMs}ms, staleThreshold=${this.options.staleThresholdMs}ms.`,
    );

    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        this.logger.error(`Unhandled error during ingestion recovery cycle: ${err}`);
      });
    }, this.options.pollIntervalMs);

    // Ensure timer does not block process exit in test or CLI scripts
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('IngestionRecoveryWorker shutdown cleanly.');
    }
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Single polling execution cycle. Can be called manually in unit tests or CLI commands.
   */
  public async poll(): Promise<{
    processedUploads: number;
    processedRetries: number;
    recoveredStale: number;
  }> {
    if (this.isPolling) {
      this.logger.debug('Previous polling cycle still running. Skipping iteration.');
      return { processedUploads: 0, processedRetries: 0, recoveredStale: 0 };
    }

    this.isPolling = true;

    try {
      const processedUploads = await this.processPendingUploads();
      const processedRetries = await this.processPendingRetries();
      const recoveredStale = await this.recoverStaleActiveJobs();

      return { processedUploads, processedRetries, recoveredStale };
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Picks up newly uploaded jobs and starts their validation/processing.
   */
  private async processPendingUploads(): Promise<number> {
    const pending = await this.jobRepo.findPendingUploads(this.options.batchSize);
    if (pending.length === 0) return 0;

    this.logger.log(`Found ${pending.length} pending uploads to process.`);

    for (const job of pending) {
      this.orchestrator.processJob(job.id, job.tenantId).catch((err) => {
        this.logger.error(`Error processing pending upload job '${job.id}': ${err}`);
      });
    }

    return pending.length;
  }

  /**
   * Picks up failed jobs whose retry backoff timestamp has elapsed.
   */
  private async processPendingRetries(): Promise<number> {
    const retries = await this.jobRepo.findPendingRetries(this.options.batchSize);
    if (retries.length === 0) return 0;

    this.logger.log(`Found ${retries.length} pending retries ready for re-execution.`);

    for (const job of retries) {
      this.orchestrator.processJob(job.id, job.tenantId).catch((err) => {
        this.logger.error(`Error executing retried job '${job.id}': ${err}`);
      });
    }

    return retries.length;
  }

  /**
   * Recovers jobs stuck in active states (VALIDATING, PROCESSING, INDEXING)
   * whose execution stalled past the configured timeout threshold.
   */
  private async recoverStaleActiveJobs(): Promise<number> {
    const olderThan = new Date(Date.now() - this.options.staleThresholdMs);
    const staleJobs = await this.jobRepo.findStaleActiveJobs(olderThan, this.options.batchSize);

    if (staleJobs.length === 0) return 0;

    this.logger.warn(`Found ${staleJobs.length} stale active jobs. Initiating crash recovery.`);

    for (const job of staleJobs) {
      try {
        if (job.attemptCount < job.maxAttempts) {
          const nextRetryAt = IngestionRetryPolicy.computeNextRetryAt(job.attemptCount);
          job.fail(
            IngestionErrorCode.WORKER_CRASH_RECOVERED,
            'Job stalled due to worker crash or disruption. Recovered by watchdog worker.',
          );
          job.retry(nextRetryAt);

          await this.jobRepo.save(job);
          this.logger.warn(
            `Recovered stalled job '${job.id}'. Scheduled retry ${job.attemptCount}/${job.maxAttempts} for ${nextRetryAt.toISOString()}.`,
          );
        } else {
          job.fail(
            IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED,
            `Job stalled due to worker disruption and exceeded maximum retry attempts (${job.maxAttempts}).`,
          );
          await this.jobRepo.save(job);
          this.logger.error(
            `Stalled job '${job.id}' exceeded max attempts. Marked permanently FAILED. Source document preserved.`,
          );
        }
      } catch (err: unknown) {
        this.logger.error(`Failed to recover stalled job '${job.id}': ${err}`);
      }
    }

    return staleJobs.length;
  }
}
