import { IndexReindexingService } from '../index-reindexing.service';
import {
  IIndexGenerationRepositoryPort,
  IVectorIndexingJobRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IKnowledgeDocumentRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  EmbeddingProfile,
  DocumentChunk,
  ChunkProvenance,
  DocumentEmbedding,
  VectorIndexingJob,
  VectorIndexingScope,
  GenerationCancelledException,
  InvalidIndexGenerationTransitionException,
} from '@kinergy-platform/core';
import { EmbeddingGenerationPipelineService } from '../../embedding-generation-pipeline.service';
import { IndexGenerationCompletenessValidatorService } from '../index-generation-completeness-validator.service';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../../config/ai.config';
import { PrismaService } from '../../../../platform/persistence/prisma/prisma.service';

describe('IndexReindexingService', () => {
  let reindexingService: IndexReindexingService;
  let mockGenRepo: jest.Mocked<IIndexGenerationRepositoryPort>;
  let mockJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockPipelineService: jest.Mocked<EmbeddingGenerationPipelineService>;
  let mockCompletenessValidator: jest.Mocked<IndexGenerationCompletenessValidatorService>;
  let mockPrisma: unknown;
  let config: AiConfiguration;
  let profile: EmbeddingProfile;

  const tenantId = 'tenant-clinic-101';
  const validSha256 = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';
  const sampleVector1024 = new Array(1024).fill(0.03125);

  function createChunk(docId: string, verId: string, seq: number): DocumentChunk {
    const provenance = ChunkProvenance.create({
      documentId: docId,
      documentVersionId: verId,
      chunkIndex: seq,
      pageNumber: 1,
      sectionHierarchy: ['Protocolo'],
      sourceBlockIds: [`blk-${seq}`],
      language: 'es',
      checksum: validSha256,
      configurationVersion: 'v1',
    });

    return DocumentChunk.create({
      id: `chk-${docId}-${seq}`,
      documentId: docId,
      documentVersionId: verId,
      sequence: seq,
      content: `Contenido de sección ${seq}`,
      tokenCount: 40,
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
      promoteGeneration: jest.fn().mockResolvedValue(undefined),
    };

    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j) => j),
      findById: jest.fn(),
      findActiveByScope: jest.fn(),
      claimJob: jest.fn().mockImplementation(async (id) => {
        const j = VectorIndexingJob.create({
          id,
          tenantId,
          scope: VectorIndexingScope.INDEX_GENERATION,
          scopeId: 'gen-new',
          generationId: 'gen-new',
          profileId: profile.profileId,
        });
        j.start();
        return j;
      }),
      listStaleJobs: jest.fn(),
      listByGenerationId: jest.fn(),
      cancelJobsForDocument: jest.fn(),
      cancelJobsForVersion: jest.fn(),
    };

    mockChunkRepo = {
      saveChunks: jest.fn(),
      findByVersionId: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      deleteByVersionId: jest.fn(),
      countByVersionId: jest.fn(),
    };

    mockDocRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByChecksum: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };

    mockPipelineService = {
      generateEmbeddings: jest.fn(),
      calculateProcessingFingerprint: jest.fn().mockReturnValue('mock-fp'),
    } as unknown as jest.Mocked<EmbeddingGenerationPipelineService>;

    mockCompletenessValidator = {
      validate: jest.fn().mockResolvedValue({
        isValid: true,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        persistedVectorCount: 10,
        discrepancies: [],
      }),
      assertComplete: jest.fn().mockResolvedValue({
        isValid: true,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        persistedVectorCount: 10,
        discrepancies: [],
      }),
    } as unknown as jest.Mocked<IndexGenerationCompletenessValidatorService>;

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        const tx = {
          $executeRawUnsafe: jest.fn().mockResolvedValue(1),
          indexGeneration: { update: jest.fn().mockResolvedValue({}) },
          vectorIndexingJob: { update: jest.fn().mockResolvedValue({}) },
        };
        return await callback(tx);
      }),
    };

    reindexingService = new IndexReindexingService(
      mockGenRepo,
      mockJobRepo,
      mockChunkRepo,
      mockDocRepo,
      mockPipelineService,
      mockCompletenessValidator,
      config,
      mockPrisma as PrismaService,
    );
  });

  describe('Tenant Re-Indexing & Atomic Activation', () => {
    it('executes full tenant re-indexing and atomically activates new generation', async () => {
      const activeGen = IndexGeneration.reconstitute({
        id: 'gen-active-1',
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.ACTIVE,
        targetChunkCount: 2,
        indexedChunkCount: 2,
        failedChunkCount: 0,
        version: 5,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: new Date(),
        activatedAt: new Date(),
        retiredAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });

      mockGenRepo.findActiveByTenantId.mockResolvedValue(activeGen);
      mockGenRepo.findLatestGenerationNumber.mockResolvedValue(1);

      // Mock 1 active document with 2 chunks
      const mockDoc = {
        id: { value: 'doc-1' },
        isDeleted: () => false,
        currentVersionId: 'ver-1',
      } as unknown as import('@kinergy-platform/core').KnowledgeDocument;
      mockDocRepo.findAll.mockResolvedValue([mockDoc]);

      const chk0 = createChunk('doc-1', 'ver-1', 0);
      const chk1 = createChunk('doc-1', 'ver-1', 1);
      mockChunkRepo.findByVersionId.mockResolvedValue([chk0, chk1]);

      const emb0 = DocumentEmbedding.create({
        chunkId: chk0.id,
        documentId: 'doc-1',
        documentVersionId: 'ver-1',
        indexGenerationId: 'gen-new',
        profile,
        vector: sampleVector1024,
        contentFingerprint: 'fp-0',
      });
      const emb1 = DocumentEmbedding.create({
        chunkId: chk1.id,
        documentId: 'doc-1',
        documentVersionId: 'ver-1',
        indexGenerationId: 'gen-new',
        profile,
        vector: sampleVector1024,
        contentFingerprint: 'fp-1',
      });

      mockPipelineService.generateEmbeddings.mockResolvedValue({
        documentId: 'doc-1',
        documentVersionId: 'ver-1',
        generationId: 'gen-new',
        profileId: profile.profileId,
        totalChunksRequested: 2,
        successfulEmbeddings: [emb0, emb1],
        failedChunks: [],
        batchCount: 1,
        totalDurationMs: 30,
        totalTokensProcessed: 80,
        retryCount: 0,
      });

      const result = await reindexingService.reindexTenant({
        tenantId,
        reason: 'Model upgrade to BGE-M3 v2',
        autoActivate: true,
      });

      expect(result.tenantId).toBe(tenantId);
      expect(result.previousGenerationId).toBe('gen-active-1');
      expect(result.totalChunksIndexed).toBe(2);
      expect(result.activated).toBe(true);

      // Completeness asserted before activation
      expect(mockCompletenessValidator.assertComplete).toHaveBeenCalledTimes(1);

      // promoteGeneration called atomically
      expect(mockGenRepo.promoteGeneration).toHaveBeenCalledWith(result.newGenerationId, tenantId);
    });

    it('handles tenant with 0 chunks cleanly without errors', async () => {
      mockGenRepo.findActiveByTenantId.mockResolvedValue(null);
      mockGenRepo.findLatestGenerationNumber.mockResolvedValue(0);
      mockDocRepo.findAll.mockResolvedValue([]);

      const result = await reindexingService.reindexTenant({
        tenantId,
      });

      expect(result.totalChunksAccounted).toBe(0);
      expect(result.totalChunksIndexed).toBe(0);
      expect(result.activated).toBe(false);
      expect(mockPipelineService.generateEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('Zero-Downtime Rollback', () => {
    it('executes atomic rollback to previously RETIRED generation without regenerating embeddings', async () => {
      const retiredGen = IndexGeneration.reconstitute({
        id: 'gen-retired-prev',
        tenantId,
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.RETIRED,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        version: 5,
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

      await reindexingService.rollback(
        tenantId,
        'gen-retired-prev',
        'Rollback due to precision regression',
      );

      // Completeness verified before rollback
      expect(mockCompletenessValidator.assertComplete).toHaveBeenCalledWith('gen-retired-prev');

      // Atomic promotion swap
      expect(mockGenRepo.promoteGeneration).toHaveBeenCalledWith('gen-retired-prev', tenantId);

      // Zero embeddings were regenerated!
      expect(mockPipelineService.generateEmbeddings).not.toHaveBeenCalled();
    });

    it('rejects rollback if target generation belongs to another tenant', async () => {
      const otherTenantGen = IndexGeneration.reconstitute({
        id: 'gen-foreign',
        tenantId: 'other-tenant-999', // Different tenant
        generationNumber: 1,
        profile,
        status: IndexGenerationStatus.RETIRED,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        version: 5,
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

      mockGenRepo.findById.mockResolvedValue(otherTenantGen);

      await expect(reindexingService.rollback(tenantId, 'gen-foreign')).rejects.toThrow(
        InvalidIndexGenerationTransitionException,
      );

      expect(mockGenRepo.promoteGeneration).not.toHaveBeenCalled();
    });

    it('rejects rollback if target generation is not in RETIRED status', async () => {
      const failedGen = IndexGeneration.reconstitute({
        id: 'gen-failed',
        tenantId,
        generationNumber: 2,
        profile,
        status: IndexGenerationStatus.FAILED, // Invalid status for rollback
        targetChunkCount: 10,
        indexedChunkCount: 5,
        failedChunkCount: 5,
        version: 2,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: null,
        activatedAt: null,
        retiredAt: null,
        failedAt: new Date(),
        cancelledAt: null,
        errorCode: 'TIMEOUT',
        failureReason: 'Timeout',
        cancellationReason: null,
      });

      mockGenRepo.findById.mockResolvedValue(failedGen);

      await expect(reindexingService.rollback(tenantId, 'gen-failed')).rejects.toThrow(
        InvalidIndexGenerationTransitionException,
      );

      expect(mockGenRepo.promoteGeneration).not.toHaveBeenCalled();
    });
  });

  describe('Cooperative Cancellation', () => {
    it('throws GenerationCancelledException if signal is aborted during re-indexing', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        reindexingService.reindexTenant({
          tenantId,
          signal: abortController.signal,
        }),
      ).rejects.toThrow(GenerationCancelledException);
    });
  });
});
