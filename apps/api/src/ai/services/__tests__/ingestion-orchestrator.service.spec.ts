import { IngestionOrchestratorService } from '../ingestion-orchestrator.service';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  IDocumentIndexingPort,
  VisibilityScope,
  ExtractionTimeoutException,
  CorruptDocumentExtractionException,
} from '@kinergy-platform/core';
import { ObjectStoragePort } from '../../../platform/storage/ports/object-storage.port';
import { IngestionErrorCode } from '../ingestion-retry.policy';
import { DocumentProcessingPipelineService } from '../document-processing-pipeline.service';

describe('IngestionOrchestratorService', () => {
  let service: IngestionOrchestratorService;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let mockIndexingPort: jest.Mocked<IDocumentIndexingPort>;

  const tenantId = 'tenant-test-123';
  const documentId = 'doc-12345';
  const versionId = 'ver-67890';
  const storageKey = `tenants/${tenantId}/knowledge_base/2026/11/doc.pdf`;

  let document: KnowledgeDocument;
  let job: IngestionJob;

  beforeEach(() => {
    document = KnowledgeDocument.create({
      id: documentId,
      tenantId,
      title: 'Operating Policy Manual',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: 'user-001',
      initialVersion: {
        id: versionId,
        originalFileName: 'policy.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        storageKey,
        uploadedBy: 'user-001',
      },
    });

    job = IngestionJob.create({
      documentId,
      documentVersionId: versionId,
      tenantId,
      maxAttempts: 3,
    });

    mockDocRepo = {
      save: jest.fn().mockImplementation(async (d: KnowledgeDocument) => d),
      findById: jest.fn().mockResolvedValue(document),
      findByChecksum: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([document]),
      count: jest.fn().mockResolvedValue(1),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };

    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j: IngestionJob) => j),
      findById: jest.fn().mockImplementation(async (_t, id) => (id === job.id ? job : null)),
      findByVersionId: jest.fn().mockResolvedValue([job]),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(job),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    };

    mockStoragePort = {
      upload: jest.fn(),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 test document content'),
        metadata: { mimeType: 'application/pdf', sizeBytes: 1024 },
      }),
      delete: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    mockIndexingPort = {
      indexDocument: jest.fn().mockResolvedValue({
        indexed: true,
        chunkCount: 3,
        notes: 'Handshake completed',
      }),
    };

    service = new IngestionOrchestratorService(
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      mockIndexingPort,
    );
  });

  describe('Happy Path Ingestion Progression', () => {
    it('should advance job through UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY', async () => {
      const result = await service.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.READY);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          documentId,
          versionId,
          storageKey,
        }),
      );
      // State was saved during each transition
      expect(mockJobRepo.save).toHaveBeenCalled();
    });

    it('should complete successfully even when indexingPort is omitted (boundary contract fallback)', async () => {
      const serviceNoIndex = new IngestionOrchestratorService(
        mockDocRepo,
        mockJobRepo,
        mockStoragePort,
        undefined,
      );

      const result = await serviceNoIndex.processJob(job.id, tenantId);
      expect(result.status).toBe(IngestionStatus.READY);
    });
  });

  describe('Transient Failure & Retry Management', () => {
    it('should schedule retry with backoff when a transient storage timeout occurs', async () => {
      mockStoragePort.download.mockRejectedValueOnce(
        new Error('Connection ETIMEDOUT contacting storage'),
      );

      const result = await service.processJob(job.id, tenantId);

      // In the domain model, retry() transitions FAILED -> VALIDATING and sets nextRetryAt
      expect(result.status).toBe(IngestionStatus.VALIDATING);
      expect(result.attemptCount).toBe(2);
      expect(result.nextRetryAt).toBeInstanceOf(Date);
      expect(result.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark job permanently FAILED with MAX_ATTEMPTS_EXCEEDED when retry budget is exhausted', async () => {
      // Simulate that job has already used 3 of 3 attempts
      const exhaustedJob = IngestionJob.reconstitute({
        id: 'job-exhausted',
        documentId,
        documentVersionId: versionId,
        tenantId,
        status: IngestionStatus.UPLOADED,
        attemptCount: 3,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: 3,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        nextRetryAt: null,
        cancelledAt: null,
        cancellationReason: null,
      });

      mockJobRepo.findById.mockResolvedValue(exhaustedJob);
      mockStoragePort.download.mockRejectedValue(new Error('Connection ETIMEDOUT'));

      const result = await service.processJob('job-exhausted', tenantId);

      expect(result.status).toBe(IngestionStatus.FAILED);
      expect(result.lastErrorCode).toBe(IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED);
      expect(result.lastErrorMessage).toContain('Exceeded maximum retry attempts');

      // SOURCE DOCUMENT INDEPENDENCE VERIFICATION:
      // Ingestion failure must NEVER delete or mutate the document!
      expect(mockDocRepo.save).not.toHaveBeenCalled();
      expect(mockDocRepo.softDelete).not.toHaveBeenCalled();
      expect(mockStoragePort.delete).not.toHaveBeenCalled();
    });
  });

  describe('Permanent / Non-Retryable Failure Handling', () => {
    it('should immediately fail without retry if source document is missing in DB', async () => {
      mockDocRepo.findById.mockResolvedValueOnce(null);

      const result = await service.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.FAILED);
      expect(result.lastErrorCode).toBe(IngestionErrorCode.DOCUMENT_NOT_FOUND);
      expect(result.attemptCount).toBe(1); // Did not retry
      expect(result.nextRetryAt).toBeNull();
    });

    it('should immediately fail without retry if file is missing in storage repository', async () => {
      mockStoragePort.exists.mockResolvedValueOnce(false);

      const result = await service.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.FAILED);
      expect(result.lastErrorCode).toBe(IngestionErrorCode.STORAGE_OBJECT_MISSING);
      expect(result.attemptCount).toBe(1);
    });

    it('should preserve source document intact even after permanent ingestion failure', async () => {
      mockStoragePort.exists.mockResolvedValueOnce(false);

      await service.processJob(job.id, tenantId);

      // Verify source document was not deleted or altered
      expect(mockDocRepo.softDelete).not.toHaveBeenCalled();
      expect(document.isDeleted()).toBe(false);
    });
  });

  describe('Cancellation Semantics & Race Handling', () => {
    it('should respect cooperative cancellation during step transitions', async () => {
      // Simulate cancellation happening in DB while processing
      mockJobRepo.findById.mockImplementation(async (_t, id) => {
        const cancelledJob = IngestionJob.reconstitute({
          id,
          documentId,
          documentVersionId: versionId,
          tenantId,
          status: IngestionStatus.CANCELLED,
          attemptCount: 1,
          maxAttempts: 3,
          lastErrorCode: null,
          lastErrorMessage: null,
          version: 2,
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
          nextRetryAt: null,
          cancelledAt: new Date(),
          cancellationReason: 'Cancelled by administrator',
        });
        return cancelledJob;
      });

      const result = await service.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.CANCELLED);
      // Indexing must NOT have been called
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });

    it('should not overwrite CANCELLED status with FAILED if an error happens during cancellation', async () => {
      // Start in uploaded
      let callCount = 0;
      mockJobRepo.findById.mockImplementation(async (_t, id) => {
        callCount++;
        if (callCount > 1) {
          // On subsequent refreshes, job is cancelled
          return IngestionJob.reconstitute({
            id,
            documentId,
            documentVersionId: versionId,
            tenantId,
            status: IngestionStatus.CANCELLED,
            attemptCount: 1,
            maxAttempts: 3,
            lastErrorCode: null,
            lastErrorMessage: null,
            version: 2,
            createdAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
            nextRetryAt: null,
            cancelledAt: new Date(),
            cancellationReason: 'User requested abort',
          });
        }
        return job;
      });

      // Storage throws an error during download
      mockStoragePort.download.mockRejectedValue(new Error('Network reset'));

      const result = await service.processJob(job.id, tenantId);

      // Must preserve CANCELLED, not FAILED
      expect(result.status).toBe(IngestionStatus.CANCELLED);
    });
  });

  describe('Idempotency & Concurrent Executions', () => {
    it('should safely return immediately if job is already in READY terminal state', async () => {
      const readyJob = IngestionJob.reconstitute({
        id: 'job-ready',
        documentId,
        documentVersionId: versionId,
        tenantId,
        status: IngestionStatus.READY,
        attemptCount: 1,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: 4,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        nextRetryAt: null,
        cancelledAt: null,
        cancellationReason: null,
      });

      mockJobRepo.findById.mockResolvedValue(readyJob);

      const result = await service.processJob('job-ready', tenantId);

      expect(result.status).toBe(IngestionStatus.READY);
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });

    it('should skip duplicate processing when the job is already active in-memory', async () => {
      // Slow down storage exists to test in-flight set
      let resolveExists: (v: boolean) => void;
      mockStoragePort.exists.mockReturnValue(
        new Promise((res) => {
          resolveExists = res;
        }),
      );

      const p1 = service.processJob(job.id, tenantId);
      // Immediately invoke a second time while p1 is in-flight
      const p2 = service.processJob(job.id, tenantId);

      resolveExists!(true);
      await Promise.all([p1, p2]);

      // Indexing should only have executed once
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('Document Processing Pipeline Integration (AI-04.5)', () => {
    let mockPipeline: jest.Mocked<DocumentProcessingPipelineService>;
    let serviceWithPipeline: IngestionOrchestratorService;

    beforeEach(() => {
      mockPipeline = {
        processDocument: jest.fn().mockResolvedValue({
          documentId,
          versionId,
          chunkCount: 8,
          totalTokens: 3200,
          processingFingerprint: 'a'.repeat(64),
          durationMs: 150,
          detectedLanguage: 'es',
        }),
      } as unknown as jest.Mocked<DocumentProcessingPipelineService>;

      serviceWithPipeline = new IngestionOrchestratorService(
        mockDocRepo,
        mockJobRepo,
        mockStoragePort,
        mockIndexingPort,
        mockPipeline,
      );
    });

    it('should invoke pipeline during PROCESSING stage and advance job to READY', async () => {
      const result = await serviceWithPipeline.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.READY);
      expect(mockPipeline.processDocument).toHaveBeenCalledTimes(1);
      expect(mockPipeline.processDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          documentId,
          versionId,
          mimeType: 'application/pdf',
          buffer: expect.any(Buffer),
          isCancelled: expect.any(Function),
        }),
      );
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledTimes(1);
    });

    it('should schedule retry with backoff when pipeline throws retryable ExtractionTimeoutException', async () => {
      mockPipeline.processDocument.mockRejectedValueOnce(
        new ExtractionTimeoutException(30000, documentId, versionId),
      );

      const result = await serviceWithPipeline.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.VALIDATING);
      expect(result.attemptCount).toBe(2);
      expect(result.nextRetryAt).toBeInstanceOf(Date);
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });

    it('should permanently fail without retry when pipeline throws non-retryable CorruptDocumentExtractionException', async () => {
      mockPipeline.processDocument.mockRejectedValueOnce(
        new CorruptDocumentExtractionException('Corrupt PDF trailer', documentId, versionId),
      );

      const result = await serviceWithPipeline.processJob(job.id, tenantId);

      expect(result.status).toBe(IngestionStatus.FAILED);
      expect(result.lastErrorCode).toBe(IngestionErrorCode.MALFORMED_CONTENT);
      expect(result.attemptCount).toBe(1);
      expect(result.nextRetryAt).toBeNull();
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });
});
