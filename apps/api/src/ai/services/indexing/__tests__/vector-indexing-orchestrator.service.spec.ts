import { VectorIndexingOrchestratorService } from '../vector-indexing-orchestrator.service';
import {
  IIndexGenerationRepositoryPort,
  IVectorStorePort,
  IVectorIndexingJobRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  VectorIndexingJob,
  VectorIndexingScope,
  VectorIndexingJobStatus,
  EmbeddingProfile,
  DocumentChunk,
  ChunkProvenance,
  DocumentEmbedding,
  GenerationCancelledException,
  IndexGenerationIneligibleException,
} from '@kinergy-platform/core';
import { EmbeddingGenerationPipelineService } from '../../embedding-generation-pipeline.service';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../../config/ai.config';
import { PrismaService } from '../../../../platform/persistence/prisma/prisma.service';

describe('VectorIndexingOrchestratorService', () => {
  let orchestrator: VectorIndexingOrchestratorService;
  let mockGenRepo: jest.Mocked<IIndexGenerationRepositoryPort>;
  let mockVectorStore: jest.Mocked<IVectorStorePort>;
  let mockJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockPipelineService: jest.Mocked<EmbeddingGenerationPipelineService>;
  interface MockPrismaOrchestrator {
    $transaction: jest.Mock;
  }
  let mockPrisma: MockPrismaOrchestrator;
  let config: AiConfiguration;
  let profile: EmbeddingProfile;

  const tenantId = 'tenant-clinic-101';
  const documentId = 'doc-clinical-001';
  const versionId = 'ver-clinical-001-v1';
  const generationId = 'idx-gen-orch-001';
  const validSha256 = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';
  const sampleVector1024 = new Array(1024).fill(0.03125);

  function createChunk(sequence: number, content = `Texto sección ${sequence}`): DocumentChunk {
    const provenance = ChunkProvenance.create({
      documentId,
      documentVersionId: versionId,
      chunkIndex: sequence,
      pageNumber: 1,
      sectionHierarchy: ['Protocolo'],
      sourceBlockIds: [`blk-${sequence}`],
      language: 'es',
      checksum: validSha256,
      configurationVersion: 'v1',
    });

    return DocumentChunk.create({
      id: `chunk-${sequence}`,
      documentId,
      documentVersionId: versionId,
      sequence,
      content,
      tokenCount: 50,
      language: 'es',
      provenance,
    });
  }

  beforeEach(() => {
    profile = EmbeddingProfile.bgeM3DenseDefault();
    config = {
      ...DEFAULT_AI_CONFIG,
      embeddingBatchSize: 16,
    };

    mockGenRepo = {
      findById: jest.fn(),
      findActiveByTenantId: jest.fn(),
      findLatestGenerationNumber: jest.fn().mockResolvedValue(1),
      listByTenantId: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      promoteGeneration: jest.fn(),
    };

    mockVectorStore = {
      save: jest.fn(),
      saveBatch: jest.fn(),
      findByChunkId: jest.fn(),
      findByDocumentVersionId: jest.fn().mockResolvedValue([]),
      similaritySearch: jest.fn(),
      deleteByDocumentId: jest.fn(),
      deleteByDocumentVersionId: jest.fn().mockResolvedValue(0),
      deleteByGenerationId: jest.fn(),
      countByGenerationId: jest.fn(),
    };

    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j) => j),
      findById: jest.fn(),
      findActiveByScope: jest.fn().mockResolvedValue(null),
      claimJob: jest.fn().mockImplementation(async (id) => {
        const job = VectorIndexingJob.create({
          id,
          tenantId,
          scope: VectorIndexingScope.DOCUMENT_VERSION,
          scopeId: versionId,
          generationId,
          profileId: profile.profileId,
        });
        job.start();
        return job;
      }),
      listStaleJobs: jest.fn(),
      listByGenerationId: jest.fn(),
      cancelJobsForDocument: jest.fn().mockResolvedValue(0),
      cancelJobsForVersion: jest.fn().mockResolvedValue(0),
    };

    mockChunkRepo = {
      saveChunks: jest.fn(),
      findByVersionId: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      deleteByVersionId: jest.fn(),
      countByVersionId: jest.fn(),
    };

    mockPipelineService = {
      generateEmbeddings: jest.fn(),
      calculateProcessingFingerprint: jest
        .fn()
        .mockImplementation((chunk) => `fp-${chunk.id.value}`),
    } as unknown as jest.Mocked<EmbeddingGenerationPipelineService>;

    mockPrisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRawUnsafe: jest.fn().mockResolvedValue(1),
            indexGeneration: { update: jest.fn().mockResolvedValue({}) },
            vectorIndexingJob: { update: jest.fn().mockResolvedValue({}) },
          };
          return await callback(tx);
        }),
    };

    orchestrator = new VectorIndexingOrchestratorService(
      mockGenRepo,
      mockVectorStore,
      mockJobRepo,
      mockChunkRepo,
      mockPipelineService,
      config,
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('Full Document Version Indexing Workflow', () => {
    it('executes end-to-end indexing workflow when chunks are unindexed', async () => {
      const activeGen = IndexGeneration.reconstitute({
        id: generationId,
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.ACTIVE,
        targetChunkCount: 2,
        indexedChunkCount: 0,
        failedChunkCount: 0,
        version: 1,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: null,
        activatedAt: new Date(),
        retiredAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findActiveByTenantId.mockResolvedValue(activeGen);

      const chunk0 = createChunk(0);
      const chunk1 = createChunk(1);
      mockChunkRepo.findByVersionId.mockResolvedValue([chunk0, chunk1]);

      // No existing embeddings in vector store
      mockVectorStore.findByDocumentVersionId.mockResolvedValue([]);

      const mockEmbedding0 = DocumentEmbedding.create({
        chunkId: chunk0.id,
        documentId,
        documentVersionId: versionId,
        indexGenerationId: generationId,
        profile,
        vector: sampleVector1024,
        contentFingerprint: 'fp-chunk-0',
      });
      const mockEmbedding1 = DocumentEmbedding.create({
        chunkId: chunk1.id,
        documentId,
        documentVersionId: versionId,
        indexGenerationId: generationId,
        profile,
        vector: sampleVector1024,
        contentFingerprint: 'fp-chunk-1',
      });

      mockPipelineService.generateEmbeddings.mockResolvedValue({
        documentId,
        documentVersionId: versionId,
        generationId,
        profileId: profile.profileId,
        totalChunksRequested: 2,
        successfulEmbeddings: [mockEmbedding0, mockEmbedding1],
        failedChunks: [],
        batchCount: 1,
        totalDurationMs: 45,
        totalTokensProcessed: 100,
        retryCount: 0,
      });

      const result = await orchestrator.indexDocumentVersion({
        tenantId,
        documentId,
        versionId,
      });

      expect(result.indexed).toBe(true);
      expect(result.chunkCount).toBe(2);
      expect(mockPipelineService.generateEmbeddings).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('generates embeddings strictly OUTSIDE the database transaction', async () => {
      const activeGen = IndexGeneration.reconstitute({
        id: generationId,
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.ACTIVE,
        targetChunkCount: 1,
        indexedChunkCount: 0,
        failedChunkCount: 0,
        version: 1,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: null,
        activatedAt: new Date(),
        retiredAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findActiveByTenantId.mockResolvedValue(activeGen);
      mockChunkRepo.findByVersionId.mockResolvedValue([createChunk(0)]);

      const callOrder: string[] = [];
      mockPipelineService.generateEmbeddings.mockImplementation(async () => {
        callOrder.push('pipeline_generateEmbeddings');
        return {
          documentId,
          documentVersionId: versionId,
          generationId,
          profileId: profile.profileId,
          totalChunksRequested: 1,
          successfulEmbeddings: [],
          failedChunks: [],
          batchCount: 1,
          totalDurationMs: 10,
          totalTokensProcessed: 50,
          retryCount: 0,
        };
      });

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          callOrder.push('prisma_transaction_start');
          const tx = {
            $executeRawUnsafe: jest.fn().mockResolvedValue(1),
            indexGeneration: { update: jest.fn().mockResolvedValue({}) },
            vectorIndexingJob: { update: jest.fn().mockResolvedValue({}) },
          };
          return await callback(tx);
        },
      );

      await orchestrator.indexDocumentVersion({
        tenantId,
        documentId,
        versionId,
      });

      // Pipeline MUST be called BEFORE database transaction
      expect(callOrder).toEqual(['pipeline_generateEmbeddings', 'prisma_transaction_start']);
    });
  });

  describe('Idempotency & Fingerprint Deduplication', () => {
    it('skips embedding generation when all chunks already have matching fingerprints in DB', async () => {
      const activeGen = IndexGeneration.reconstitute({
        id: generationId,
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.ACTIVE,
        targetChunkCount: 1,
        indexedChunkCount: 1,
        failedChunkCount: 0,
        version: 1,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: null,
        activatedAt: new Date(),
        retiredAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findActiveByTenantId.mockResolvedValue(activeGen);
      const chunk = createChunk(0);
      mockChunkRepo.findByVersionId.mockResolvedValue([chunk]);

      // Existing embedding in DB has exact same fingerprint 'fp-chunk-0'
      const existingEmb = DocumentEmbedding.create({
        chunkId: chunk.id,
        documentId,
        documentVersionId: versionId,
        indexGenerationId: generationId,
        profile,
        vector: sampleVector1024,
        contentFingerprint: 'fp-chunk-0',
      });
      mockVectorStore.findByDocumentVersionId.mockResolvedValue([existingEmb]);

      const result = await orchestrator.indexDocumentVersion({
        tenantId,
        documentId,
        versionId,
      });

      expect(result.indexed).toBe(true);
      expect(result.chunkCount).toBe(1);
      // Ollama pipeline was NEVER called because all fingerprints matched
      expect(mockPipelineService.generateEmbeddings).not.toHaveBeenCalled();
      // No database write transaction was needed
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency & Claiming', () => {
    it('skips duplicate execution if job is already RUNNING by another worker', async () => {
      const activeGen = IndexGeneration.reconstitute({
        id: generationId,
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.ACTIVE,
        targetChunkCount: 1,
        indexedChunkCount: 0,
        failedChunkCount: 0,
        version: 1,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: null,
        activatedAt: new Date(),
        retiredAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findActiveByTenantId.mockResolvedValue(activeGen);

      // Active job is already RUNNING
      const runningJob = VectorIndexingJob.reconstitute({
        id: 'job-already-running',
        tenantId,
        scope: VectorIndexingScope.DOCUMENT_VERSION,
        scopeId: versionId,
        generationId,
        profileId: profile.profileId,
        status: VectorIndexingJobStatus.RUNNING,
        batchSize: 16,
        totalChunks: 5,
        processedChunks: 2,
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

      mockJobRepo.findActiveByScope.mockResolvedValue(runningJob);

      const result = await orchestrator.indexDocumentVersion({
        tenantId,
        documentId,
        versionId,
      });

      expect(result.notes).toContain('already claimed or in progress');
      expect(mockChunkRepo.findByVersionId).not.toHaveBeenCalled();
      expect(mockPipelineService.generateEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('Generation Eligibility & Protection', () => {
    it('provisions new generation in BUILDING status if no generation exists', async () => {
      mockGenRepo.findActiveByTenantId.mockResolvedValue(null);
      mockGenRepo.listByTenantId.mockResolvedValue([]);
      mockGenRepo.findLatestGenerationNumber.mockResolvedValue(0);

      mockChunkRepo.findByVersionId.mockResolvedValue([]);

      await orchestrator.indexDocumentVersion({
        tenantId,
        documentId,
        versionId,
      });

      expect(mockGenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IndexGenerationStatus.BUILDING,
          generationNumber: 1,
        }),
      );
    });

    it('rejects receiving vectors if requested generation is in RETIRED status', async () => {
      const retiredGen = IndexGeneration.reconstitute({
        id: 'gen-retired-001',
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.RETIRED,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        version: 3,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: new Date(),
        activatedAt: new Date(),
        retiredAt: new Date(),
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findById.mockResolvedValue(retiredGen);

      await expect(
        orchestrator.indexDocumentVersion({
          tenantId,
          documentId,
          versionId,
          generationId: 'gen-retired-001',
        }),
      ).rejects.toThrow(IndexGenerationIneligibleException);
    });
  });

  describe('Cooperative Cancellation', () => {
    it('throws GenerationCancelledException before execution if signal is aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        orchestrator.indexDocumentVersion({
          tenantId,
          documentId,
          versionId,
          signal: abortController.signal,
        }),
      ).rejects.toThrow(GenerationCancelledException);

      expect(mockChunkRepo.findByVersionId).not.toHaveBeenCalled();
    });

    it('throws GenerationCancelledException if isCancelled returns true', async () => {
      await expect(
        orchestrator.indexDocumentVersion({
          tenantId,
          documentId,
          versionId,
          isCancelled: async () => true,
        }),
      ).rejects.toThrow(GenerationCancelledException);
    });
  });
});
