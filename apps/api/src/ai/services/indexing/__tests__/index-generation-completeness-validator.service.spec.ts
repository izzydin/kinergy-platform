import { IndexGenerationCompletenessValidatorService } from '../index-generation-completeness-validator.service';
import {
  IIndexGenerationRepositoryPort,
  IVectorStorePort,
  IVectorIndexingJobRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  EmbeddingProfile,
  VectorIndexingJob,
  VectorIndexingScope,
  VectorIndexingJobStatus,
  IncompleteIndexGenerationException,
  IndexGenerationNotFoundException,
} from '@kinergy-platform/core';
import { PrismaService } from '../../../../platform/persistence/prisma/prisma.service';

describe('IndexGenerationCompletenessValidatorService', () => {
  let validator: IndexGenerationCompletenessValidatorService;
  let mockGenRepo: jest.Mocked<IIndexGenerationRepositoryPort>;
  let mockVectorStore: jest.Mocked<IVectorStorePort>;
  let mockJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;
  interface MockPrismaValidator {
    $queryRawUnsafe: jest.Mock;
  }
  let mockPrisma: MockPrismaValidator;

  const tenantId = 'tenant-clinic-101';
  const generationId = 'idx-gen-val-001';
  let profile: EmbeddingProfile;

  beforeEach(() => {
    profile = EmbeddingProfile.bgeM3DenseDefault();

    mockGenRepo = {
      findById: jest.fn(),
      findActiveByTenantId: jest.fn(),
      findLatestGenerationNumber: jest.fn(),
      listByTenantId: jest.fn(),
      save: jest.fn(),
      promoteGeneration: jest.fn(),
    };

    mockVectorStore = {
      save: jest.fn(),
      saveBatch: jest.fn(),
      findByChunkId: jest.fn(),
      findByDocumentVersionId: jest.fn(),
      similaritySearch: jest.fn(),
      deleteByDocumentId: jest.fn(),
      deleteByDocumentVersionId: jest.fn(),
      deleteByGenerationId: jest.fn(),
      countByGenerationId: jest.fn(),
    };

    mockJobRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findActiveByScope: jest.fn(),
      claimJob: jest.fn(),
      listStaleJobs: jest.fn(),
      listByGenerationId: jest.fn(),
      cancelJobsForDocument: jest.fn(),
      cancelJobsForVersion: jest.fn(),
    };

    mockPrisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ invalid_count: 0 }]),
    };

    validator = new IndexGenerationCompletenessValidatorService(
      mockGenRepo,
      mockVectorStore,
      mockJobRepo,
      mockPrisma as unknown as PrismaService,
    );
  });

  function createValidBuildingGeneration(
    overrides: Partial<Parameters<typeof IndexGeneration.reconstitute>[0]> = {},
  ): IndexGeneration {
    return IndexGeneration.reconstitute({
      id: generationId,
      tenantId,
      generationNumber: 1,
      profile,
      status: IndexGenerationStatus.BUILDING,
      targetChunkCount: 10,
      indexedChunkCount: 10,
      failedChunkCount: 0,
      version: 2,
      createdAt: new Date(),
      startedAt: new Date(),
      validatedAt: null,
      activatedAt: null,
      retiredAt: null,
      failedAt: null,
      cancelledAt: null,
      errorCode: null,
      failureReason: null,
      cancellationReason: null,
      ...overrides,
    });
  }

  describe('Completeness Verification Success', () => {
    it('returns isValid: true when all chunks are indexed, persisted counts match, and no jobs are outstanding', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
      });

      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ invalid_count: 0 }]);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);

      expect(result.isValid).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.actualPersistedCount).toBe(10);
      expect(result.indexedChunkCount).toBe(10);
    });

    it('assertComplete resolves cleanly when valid', async () => {
      const gen = createValidBuildingGeneration();
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      await expect(validator.assertComplete(generationId)).resolves.toBeDefined();
    });
  });

  describe('Rejection of Incomplete Generations', () => {
    it('throws IndexGenerationNotFoundException if generation does not exist', async () => {
      mockGenRepo.findById.mockResolvedValue(null);

      await expect(validator.validate('non-existent')).rejects.toThrow(
        IndexGenerationNotFoundException,
      );
    });

    it('flags discrepancy if generation is in FAILED or CANCELLED status', async () => {
      const gen = createValidBuildingGeneration({
        status: IndexGenerationStatus.FAILED,
        errorCode: 'TIMEOUT',
        failureReason: 'Provider timeout',
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('invalid status'))).toBe(true);
    });

    it('flags discrepancy if targetChunkCount <= 0', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 0,
        indexedChunkCount: 0,
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(0);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(
        result.discrepancies.some((d) => d.includes('Target chunk count must be greater than 0')),
      ).toBe(true);
    });

    it('flags discrepancy if accounted chunks are less than targetChunkCount (missing chunks)', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 15,
        indexedChunkCount: 10,
        failedChunkCount: 0, // only 10 accounted for out of 15
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('Missing 5 chunks'))).toBe(true);
    });

    it('flags discrepancy if there are unresolved failed chunks', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 9,
        failedChunkCount: 1, // 1 unresolved failed chunk
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(9);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('unresolved failed chunks'))).toBe(true);
    });

    it('flags discrepancy if actual database vector row count does not match indexedChunkCount', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 10,
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      // DB only has 8 rows instead of 10
      mockVectorStore.countByGenerationId.mockResolvedValue(8);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(
        result.discrepancies.some((d) =>
          d.includes('Persisted vector rows in database (8) do not match'),
        ),
      ).toBe(true);
    });

    it('flags discrepancy if stored vectors violate profile dimensions or fingerprint', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 10,
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);
      // Raw audit found 2 invalid vectors (e.g., dimension mismatch or corrupted fingerprint)
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ invalid_count: 2 }]);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('violate profile specifications'))).toBe(
        true,
      );
    });

    it('flags discrepancy if any indexing job is still in PENDING or RUNNING status', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 10,
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(10);

      const runningJob = VectorIndexingJob.reconstitute({
        id: 'job-run-1',
        tenantId,
        scope: VectorIndexingScope.DOCUMENT_VERSION,
        scopeId: 'ver-1',
        generationId,
        profileId: profile.profileId,
        status: VectorIndexingJobStatus.RUNNING,
        batchSize: 16,
        totalChunks: 10,
        processedChunks: 5,
        failedChunks: 0,
        currentBatchNumber: 1,
        attemptCount: 1,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
      });

      mockJobRepo.listByGenerationId.mockResolvedValue([runningJob]);

      const result = await validator.validate(generationId);
      expect(result.isValid).toBe(false);
      expect(
        result.discrepancies.some((d) => d.includes('still in PENDING or RUNNING status')),
      ).toBe(true);
    });

    it('assertComplete throws IncompleteIndexGenerationException when validation fails', async () => {
      const gen = createValidBuildingGeneration({
        targetChunkCount: 10,
        indexedChunkCount: 5, // incomplete
      });
      mockGenRepo.findById.mockResolvedValue(gen);
      mockVectorStore.countByGenerationId.mockResolvedValue(5);
      mockJobRepo.listByGenerationId.mockResolvedValue([]);

      await expect(validator.assertComplete(generationId)).rejects.toThrow(
        IncompleteIndexGenerationException,
      );
    });
  });
});
