import { VectorCleanupService } from '../vector-cleanup.service';
import {
  IVectorStorePort,
  IVectorIndexingJobRepositoryPort,
  IIndexGenerationRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  EmbeddingProfile,
} from '@kinergy-platform/core';

describe('VectorCleanupService', () => {
  let service: VectorCleanupService;
  let mockVectorStore: jest.Mocked<IVectorStorePort>;
  let mockJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;
  let mockGenRepo: jest.Mocked<IIndexGenerationRepositoryPort>;

  const tenantId = 'tenant-clinic-101';
  let profile: EmbeddingProfile;

  beforeEach(() => {
    profile = EmbeddingProfile.bgeM3DenseDefault();

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

    mockGenRepo = {
      findById: jest.fn(),
      findActiveByTenantId: jest.fn(),
      findLatestGenerationNumber: jest.fn(),
      listByTenantId: jest.fn(),
      save: jest.fn(),
      promoteGeneration: jest.fn(),
    };

    service = new VectorCleanupService(mockVectorStore, mockJobRepo, mockGenRepo);
  });

  describe('Document and Version Cleanup', () => {
    it('cancels active jobs and deletes all vectors when document is deleted', async () => {
      mockJobRepo.cancelJobsForDocument.mockResolvedValue(2);
      mockVectorStore.deleteByDocumentId.mockResolvedValue(15);

      const result = await service.cleanupDocumentVectors(
        tenantId,
        'doc-123',
        'Document soft-deleted',
      );

      expect(result.tenantId).toBe(tenantId);
      expect(result.documentId).toBe('doc-123');
      expect(result.cancelledJobs).toBe(2);
      expect(result.deletedVectors).toBe(15);
      expect(mockJobRepo.cancelJobsForDocument).toHaveBeenCalledWith(
        'doc-123',
        'Document soft-deleted',
      );
      expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc-123');
    });

    it('cancels active jobs and deletes vectors when version is deleted', async () => {
      mockJobRepo.cancelJobsForVersion.mockResolvedValue(1);
      mockVectorStore.deleteByDocumentVersionId.mockResolvedValue(8);

      const result = await service.cleanupVersionVectors(tenantId, 'ver-v1', 'Version superseded');

      expect(result.tenantId).toBe(tenantId);
      expect(result.versionId).toBe('ver-v1');
      expect(result.cancelledJobs).toBe(1);
      expect(result.deletedVectors).toBe(8);
      expect(mockJobRepo.cancelJobsForVersion).toHaveBeenCalledWith('ver-v1', 'Version superseded');
      expect(mockVectorStore.deleteByDocumentVersionId).toHaveBeenCalledWith('ver-v1');
    });
  });

  describe('Expired Generation Cleanup & Retention Policy', () => {
    function createGen(
      id: string,
      genNumber: number,
      status: IndexGenerationStatus,
      retiredAt: Date | null = null,
    ): IndexGeneration {
      return IndexGeneration.reconstitute({
        id,
        tenantId,
        generationNumber: genNumber,
        profile,
        status,
        targetChunkCount: 10,
        indexedChunkCount: 10,
        failedChunkCount: 0,
        version: 1,
        createdAt: new Date(),
        startedAt: new Date(),
        validatedAt: new Date(),
        activatedAt: status === IndexGenerationStatus.ACTIVE ? new Date() : null,
        retiredAt,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        failureReason: null,
        cancellationReason: null,
      });
    }

    it('protects ACTIVE and recent RETIRED generations while purging older retired generations', async () => {
      const activeGen = createGen('gen-active-3', 3, IndexGenerationStatus.ACTIVE);
      const buildingGen = createGen('gen-building-4', 4, IndexGenerationStatus.BUILDING);
      const retiredNewer = createGen(
        'gen-retired-2',
        2,
        IndexGenerationStatus.RETIRED,
        new Date(Date.now() - 100_000),
      );
      const retiredOld = createGen(
        'gen-retired-1',
        1,
        IndexGenerationStatus.RETIRED,
        new Date(Date.now() - 500_000),
      );
      const retiredAncient = createGen(
        'gen-retired-0',
        0,
        IndexGenerationStatus.RETIRED,
        new Date(Date.now() - 10_000_000),
      );

      mockGenRepo.listByTenantId.mockResolvedValue([
        buildingGen,
        activeGen,
        retiredNewer,
        retiredOld,
        retiredAncient,
      ]);

      mockVectorStore.deleteByGenerationId.mockResolvedValue(10);

      // keepLatestRetired = 2 -> protects retiredNewer (gen-2) and retiredOld (gen-1)
      // cleans up retiredAncient (gen-0)
      const result = await service.cleanupExpiredGenerations(tenantId, { keepLatestRetired: 2 });

      expect(result.protectedGenerations).toContain('gen-active-3');
      expect(result.protectedGenerations).toContain('gen-building-4');
      expect(result.protectedGenerations).toContain('gen-retired-2');
      expect(result.protectedGenerations).toContain('gen-retired-1');

      expect(result.cleanedGenerations).toEqual(['gen-retired-0']);
      expect(result.deletedVectorCount).toBe(10);
      expect(mockVectorStore.deleteByGenerationId).toHaveBeenCalledTimes(1);
      expect(mockVectorStore.deleteByGenerationId).toHaveBeenCalledWith('gen-retired-0');
    });

    it('never purges active generation even if keepLatestRetired is 0', async () => {
      const activeGen = createGen('gen-active-1', 1, IndexGenerationStatus.ACTIVE);
      mockGenRepo.listByTenantId.mockResolvedValue([activeGen]);

      const result = await service.cleanupExpiredGenerations(tenantId, { keepLatestRetired: 0 });

      expect(result.protectedGenerations).toContain('gen-active-1');
      expect(result.cleanedGenerations).toHaveLength(0);
      expect(mockVectorStore.deleteByGenerationId).not.toHaveBeenCalled();
    });
  });
});
