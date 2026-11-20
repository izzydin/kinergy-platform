import { IngestionRecoveryWorker } from '../ingestion-recovery.worker';
import { IngestionOrchestratorService } from '../ingestion-orchestrator.service';
import { IIngestionJobRepositoryPort, IngestionJob, IngestionStatus } from '@kinergy-platform/core';
import { IngestionErrorCode } from '../ingestion-retry.policy';

describe('IngestionRecoveryWorker', () => {
  let worker: IngestionRecoveryWorker;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockOrchestrator: jest.Mocked<IngestionOrchestratorService>;

  const tenantId = 'tenant-watchdog-001';
  const documentId = 'doc-watchdog-001';
  const versionId = 'ver-watchdog-001';

  beforeEach(() => {
    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j: IngestionJob) => j),
      findById: jest.fn().mockResolvedValue(null),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(null),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    };

    mockOrchestrator = {
      processJob: jest.fn().mockResolvedValue({} as IngestionJob),
      retryJob: jest.fn().mockResolvedValue({} as IngestionJob),
      cancelJob: jest.fn().mockResolvedValue({} as IngestionJob),
    } as unknown as jest.Mocked<IngestionOrchestratorService>;

    worker = new IngestionRecoveryWorker(mockJobRepo, mockOrchestrator, {
      enabled: false, // Don't run automatic intervals in tests
      pollIntervalMs: 1000,
      staleThresholdMs: 300_000,
      batchSize: 5,
    });
  });

  afterEach(() => {
    worker.onModuleDestroy();
  });

  describe('Pending Upload Processing', () => {
    it('should find pending uploads and dispatch to orchestrator', async () => {
      const uploadJob = IngestionJob.create({
        id: 'job-pending-upload-1',
        documentId,
        documentVersionId: versionId,
        tenantId,
      });

      mockJobRepo.findPendingUploads.mockResolvedValueOnce([uploadJob]);

      const result = await worker.poll();

      expect(result.processedUploads).toBe(1);
      expect(mockOrchestrator.processJob).toHaveBeenCalledWith('job-pending-upload-1', tenantId);
    });
  });

  describe('Pending Retry Processing', () => {
    it('should find scheduled retries and dispatch to orchestrator', async () => {
      const retryJob = IngestionJob.reconstitute({
        id: 'job-pending-retry-1',
        documentId,
        documentVersionId: versionId,
        tenantId,
        status: IngestionStatus.FAILED,
        attemptCount: 1,
        maxAttempts: 3,
        lastErrorCode: 'STORAGE_TIMEOUT',
        lastErrorMessage: 'Timeout',
        version: 2,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        nextRetryAt: new Date(Date.now() - 1000), // in the past
        cancelledAt: null,
        cancellationReason: null,
      });

      mockJobRepo.findPendingRetries.mockResolvedValueOnce([retryJob]);

      const result = await worker.poll();

      expect(result.processedRetries).toBe(1);
      expect(mockOrchestrator.processJob).toHaveBeenCalledWith('job-pending-retry-1', tenantId);
    });
  });

  describe('Stale Active Job Recovery (Worker Crash Recovery)', () => {
    it('should recover a stalled active job by scheduling a retry when attempts remain', async () => {
      const stalledJob = IngestionJob.reconstitute({
        id: 'job-crashed-worker-1',
        documentId,
        documentVersionId: versionId,
        tenantId,
        status: IngestionStatus.PROCESSING,
        attemptCount: 1,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: 2,
        createdAt: new Date(Date.now() - 600_000),
        startedAt: new Date(Date.now() - 600_000), // 10 minutes ago
        completedAt: null,
        nextRetryAt: null,
        cancelledAt: null,
        cancellationReason: null,
      });

      mockJobRepo.findStaleActiveJobs.mockResolvedValueOnce([stalledJob]);

      const result = await worker.poll();

      expect(result.recoveredStale).toBe(1);
      expect(mockJobRepo.save).toHaveBeenCalled();

      // In the domain model, retry() transitions FAILED -> VALIDATING and increments attemptCount to 2
      expect(stalledJob.status).toBe(IngestionStatus.VALIDATING);
      expect(stalledJob.attemptCount).toBe(2);
      expect(stalledJob.nextRetryAt).toBeInstanceOf(Date);
    });

    it('should mark stalled job permanently FAILED when maximum attempts are exceeded', async () => {
      const stalledMaxAttemptsJob = IngestionJob.reconstitute({
        id: 'job-crashed-worker-max',
        documentId,
        documentVersionId: versionId,
        tenantId,
        status: IngestionStatus.PROCESSING,
        attemptCount: 3,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: 4,
        createdAt: new Date(Date.now() - 600_000),
        startedAt: new Date(Date.now() - 600_000),
        completedAt: null,
        nextRetryAt: null,
        cancelledAt: null,
        cancellationReason: null,
      });

      mockJobRepo.findStaleActiveJobs.mockResolvedValueOnce([stalledMaxAttemptsJob]);

      const result = await worker.poll();

      expect(result.recoveredStale).toBe(1);
      expect(stalledMaxAttemptsJob.status).toBe(IngestionStatus.FAILED);
      expect(stalledMaxAttemptsJob.lastErrorCode).toBe(IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED);
      expect(mockJobRepo.save).toHaveBeenCalledWith(stalledMaxAttemptsJob);
    });
  });

  describe('Worker Lifecycle & Concurrency Guard', () => {
    it('should skip polling iteration if previous poll cycle is still in-flight', async () => {
      let resolveUploads: (v: IngestionJob[]) => void;
      mockJobRepo.findPendingUploads.mockReturnValue(
        new Promise((res) => {
          resolveUploads = res;
        }),
      );

      const p1 = worker.poll();
      const p2 = worker.poll(); // Second concurrent poll call

      resolveUploads!([]);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1.processedUploads).toBe(0);
      expect(r2.processedUploads).toBe(0);
      expect(mockJobRepo.findPendingUploads).toHaveBeenCalledTimes(1);
    });

    it('should initialize and destroy cleanly without leaking timers', () => {
      const activeWorker = new IngestionRecoveryWorker(mockJobRepo, mockOrchestrator, {
        enabled: true,
        pollIntervalMs: 50,
      });

      activeWorker.onModuleInit();
      expect(activeWorker.isRunning()).toBe(true);

      activeWorker.onModuleDestroy();
      expect(activeWorker.isRunning()).toBe(false);
    });
  });
});
