import { VectorIndexingRecoveryWorker } from '../vector-indexing-recovery.worker';
import {
  IVectorIndexingJobRepositoryPort,
  VectorIndexingJob,
  VectorIndexingScope,
  VectorIndexingJobStatus,
  VectorIndexingErrorCode,
} from '@kinergy-platform/core';

describe('VectorIndexingRecoveryWorker', () => {
  let worker: VectorIndexingRecoveryWorker;
  let mockJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;

  const tenantId = 'tenant-clinic-101';
  const generationId = 'idx-gen-rec-001';
  const profileId = 'prof_bge-m3_1024';

  function createStaleJob(id: string, attemptCount: number, maxAttempts = 3): VectorIndexingJob {
    return VectorIndexingJob.reconstitute({
      id,
      tenantId,
      scope: VectorIndexingScope.DOCUMENT_VERSION,
      scopeId: `ver-${id}`,
      generationId,
      profileId,
      status: VectorIndexingJobStatus.RUNNING,
      batchSize: 16,
      totalChunks: 10,
      processedChunks: 3,
      failedChunks: 0,
      currentBatchNumber: 1,
      attemptCount,
      maxAttempts,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 600_000), // 10 mins ago
      startedAt: new Date(Date.now() - 400_000), // Stale startedAt
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
    });
  }

  beforeEach(() => {
    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j) => j),
      findById: jest.fn(),
      findActiveByScope: jest.fn(),
      claimJob: jest.fn(),
      listStaleJobs: jest.fn(),
      listByGenerationId: jest.fn(),
      cancelJobsForDocument: jest.fn().mockResolvedValue(0),
      cancelJobsForVersion: jest.fn().mockResolvedValue(0),
    };

    worker = new VectorIndexingRecoveryWorker(mockJobRepo, {
      enabled: false, // disable background interval in tests
      staleThresholdMs: 300_000, // 5 minutes
      batchLimit: 10,
    });
  });

  afterEach(() => {
    worker.onModuleDestroy();
  });

  it('returns 0 when no stale jobs are found', async () => {
    mockJobRepo.listStaleJobs.mockResolvedValue([]);

    const reconciled = await worker.reconcileStaleJobs();
    expect(reconciled).toBe(0);
    expect(mockJobRepo.save).not.toHaveBeenCalled();
  });

  it('resets stale jobs with attemptCount < maxAttempts to PENDING for recovery', async () => {
    const job = createStaleJob('job-recoverable', 1, 3); // attempt 1/3
    mockJobRepo.listStaleJobs.mockResolvedValue([job]);

    const reconciled = await worker.reconcileStaleJobs();

    expect(reconciled).toBe(1);
    expect(mockJobRepo.save).toHaveBeenCalledTimes(1);

    const savedJob = mockJobRepo.save.mock.calls[0]![0];
    expect(savedJob.status).toBe(VectorIndexingJobStatus.PENDING);
    expect(savedJob.startedAt).toBeNull();
  });

  it('marks stale jobs with attemptCount >= maxAttempts as FAILED with TIMEOUT', async () => {
    const job = createStaleJob('job-exhausted', 3, 3); // attempt 3/3 exhausted
    mockJobRepo.listStaleJobs.mockResolvedValue([job]);

    const reconciled = await worker.reconcileStaleJobs();

    expect(reconciled).toBe(1);
    expect(mockJobRepo.save).toHaveBeenCalledTimes(1);

    const savedJob = mockJobRepo.save.mock.calls[0]![0];
    expect(savedJob.status).toBe(VectorIndexingJobStatus.FAILED);
    expect(savedJob.lastErrorCode).toBe(VectorIndexingErrorCode.TIMEOUT);
    expect(savedJob.failedAt).toBeDefined();
  });
});
