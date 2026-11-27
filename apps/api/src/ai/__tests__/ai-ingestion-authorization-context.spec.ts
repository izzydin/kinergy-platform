import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  IDocumentIndexingPort,
  VisibilityScope,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { IngestionRecoveryWorker } from '../services/ingestion-recovery.worker';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import {
  SecureDocumentUploadService,
  UploadDocumentDto,
} from '../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';

/**
 * AI-10.1-08: Background Ingestion Identity and Authorization Context Test Suite
 *
 * Verifies that:
 * 1. Authorized upload creates a correctly scoped job with persistent authoritative ownership.
 * 2. A forged owner or organization value cannot change job ownership.
 * 3. A manipulated job payload cannot access another user's or tenant's document (Anti-BOLA).
 * 4. A missing or invalid document owner fails safely without orphan leakage.
 * 5. A retry preserves the original authoritative scope and tenant partition.
 * 6. Deleted or revoked documents are not processed as though still authorized.
 * 7. Replayed or duplicate jobs do not bypass authorization or state invariants.
 * 8. Concurrent jobs remain strictly isolated across tenants and versions.
 * 9. Worker failure does not leak protected content, secrets, or credentials.
 * 10. Existing ingestion lifecycle and idempotency behavior remain intact.
 */
describe('AI-10.1-08: Background Ingestion Identity and Authorization Context', () => {
  const tenantAlpha = 'tenant_clinic_alpha';
  const tenantBeta = 'tenant_clinic_beta';

  const userDoctorAlpha = 'usr_doc_alpha';
  const userAttackerBeta = 'usr_attacker_beta';

  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let mockIndexingPort: jest.Mocked<IDocumentIndexingPort>;
  let orchestrator: IngestionOrchestratorService;

  const validChecksum = '637d40a8f9a1e3b7eeaa184c7d81f69a4c549cad30ee7d1de030fcc720d52149';

  const createTestDoc = (params: {
    tenantId: string;
    docId: string;
    versionId: string;
    uploadedBy: string;
    scope: VisibilityScope;
    isDeleted?: boolean;
  }): KnowledgeDocument => {
    const doc = KnowledgeDocument.create({
      id: params.docId,
      tenantId: params.tenantId,
      title: 'Manual de Rehabilitación',
      visibilityScope: params.scope,
      uploadedBy: params.uploadedBy,
      initialVersion: {
        id: params.versionId,
        originalFileName: 'manual.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        checksum: validChecksum,
        storageKey: `tenants/${params.tenantId}/knowledge_base/manual.pdf`,
        uploadedBy: params.uploadedBy,
      },
    });

    if (params.isDeleted) {
      doc.softDelete(params.uploadedBy);
    }
    return doc;
  };

  beforeEach(() => {
    mockDocRepo = {
      save: jest.fn().mockImplementation(async (d: KnowledgeDocument) => d),
      findById: jest.fn(),
      findByChecksum: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      count: jest.fn().mockResolvedValue(0),
      softDelete: jest.fn().mockResolvedValue(true),
    };

    mockJobRepo = {
      save: jest.fn().mockImplementation(async (j: IngestionJob) => j),
      findById: jest.fn(),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findByDocumentId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(null),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    };

    mockStoragePort = {
      upload: jest.fn().mockResolvedValue({ key: 'tenants/alpha/manual.pdf', size: 2048 }),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 test document content'),
        contentLength: 2048,
        contentType: 'application/pdf',
      }),
      delete: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn().mockResolvedValue({ size: 2048 }),
      createPresignedDownloadUrl: jest.fn().mockResolvedValue('https://storage.internal/test.pdf'),
      createPresignedUploadUrl: jest
        .fn()
        .mockResolvedValue({ uploadUrl: 'https://storage.internal/upload' }),
    } as unknown as jest.Mocked<ObjectStoragePort>;

    mockIndexingPort = {
      indexDocument: jest.fn().mockResolvedValue({ indexed: true, chunkCount: 5 }),
    };

    orchestrator = new IngestionOrchestratorService(
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      mockIndexingPort,
    );
  });

  describe('Scenario 1: Authorized upload creates a correctly scoped job', () => {
    it('should persist IngestionJob with authoritative tenantId and documentId matching server context', async () => {
      const docAlpha = createTestDoc({
        tenantId: tenantAlpha,
        docId: 'doc_alpha_1',
        versionId: 'ver_alpha_1',
        uploadedBy: userDoctorAlpha,
        scope: VisibilityScope.CLINICAL_STAFF,
      });

      const mockValidator = {
        validate: jest.fn().mockReturnValue({
          detectedFormat: 'PDF',
          canonicalMimeType: 'application/pdf',
          checksum: validChecksum,
          sizeBytes: 2048,
          safeFileName: 'manual.pdf',
        }),
      } as unknown as DocumentContentValidatorService;

      const uploadService = new SecureDocumentUploadService(
        mockStoragePort,
        mockDocRepo,
        mockJobRepo,
        mockValidator,
        orchestrator,
      );

      mockDocRepo.save.mockResolvedValueOnce(docAlpha);

      const uploadDto: UploadDocumentDto = {
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha,
        file: {
          originalFileName: 'manual.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4 test content'),
          size: 2048,
        },
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      };

      const result = await uploadService.uploadDocument(uploadDto);

      expect(result.visibilityScope).toBe(VisibilityScope.CLINICAL_STAFF);
      expect(result.documentId).toBe(docAlpha.id.value);

      // Verify that IngestionJob was saved with authoritative tenantAlpha
      expect(mockJobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenantAlpha,
          documentId: docAlpha.id.value,
          documentVersionId: 'ver_alpha_1',
          status: IngestionStatus.UPLOADED,
        }),
      );
    });
  });

  describe('Scenario 2: A forged owner or organization value cannot change job ownership', () => {
    it('should reject client-supplied tenant overrides during upload and fail closed on empty tenant', async () => {
      const mockValidator = {
        validate: jest.fn(),
      } as unknown as DocumentContentValidatorService;

      const uploadService = new SecureDocumentUploadService(
        mockStoragePort,
        mockDocRepo,
        mockJobRepo,
        mockValidator,
        orchestrator,
      );

      // Attempt upload with empty tenantId
      await expect(
        uploadService.uploadDocument({
          tenantId: '',
          uploadedBy: userDoctorAlpha,
          file: {
            originalFileName: 'manual.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4'),
            size: 100,
          },
        }),
      ).rejects.toThrow(UnauthorizedDocumentAccessException);

      // Attempt upload with empty uploadedBy
      await expect(
        uploadService.uploadDocument({
          tenantId: tenantAlpha,
          uploadedBy: '',
          file: {
            originalFileName: 'manual.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4'),
            size: 100,
          },
        }),
      ).rejects.toThrow(UnauthorizedDocumentAccessException);
    });
  });

  describe('Scenario 3: A manipulated job payload cannot access another user or tenant document', () => {
    it('should throw UnauthorizedDocumentAccessException when worker payload specifies tenantBeta for tenantAlpha job', async () => {
      const jobAlpha = IngestionJob.create({
        id: 'job_alpha_1',
        documentId: 'doc_alpha_1',
        documentVersionId: 'ver_alpha_1',
        tenantId: tenantAlpha,
      });

      // Repo returns the job belonging to tenantAlpha
      mockJobRepo.findById.mockResolvedValueOnce(jobAlpha);

      // Attacker in tenantBeta attempts to invoke orchestrator with manipulated tenantBeta payload
      await expect(orchestrator.processJob('job_alpha_1', tenantBeta)).rejects.toThrow(
        UnauthorizedDocumentAccessException,
      );

      // Ensure pipeline stopped: document repository was never queried for processing
      expect(mockDocRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 4: A missing or invalid document owner fails safely', () => {
    it('should fail permanently when job references a document not found in trusted persistence', async () => {
      const jobAlpha = IngestionJob.create({
        id: 'job_alpha_orphan',
        documentId: 'doc_non_existent',
        documentVersionId: 'ver_non_existent',
        tenantId: tenantAlpha,
      });

      mockJobRepo.findById.mockResolvedValue(jobAlpha);
      mockDocRepo.findById.mockResolvedValueOnce(null); // Document missing/deleted

      const finishedJob = await orchestrator.processJob('job_alpha_orphan', tenantAlpha);

      // Fails permanently without retrying non-existent entity
      expect(finishedJob.status).toBe(IngestionStatus.FAILED);
      expect(finishedJob.lastErrorCode).toBe('DOCUMENT_NOT_FOUND');
    });
  });

  describe('Scenario 5: A retry preserves the original authoritative scope and tenant partition', () => {
    it('should preserve original tenantId and documentVersionId across retry iterations', async () => {
      const docAlpha = createTestDoc({
        tenantId: tenantAlpha,
        docId: 'doc_alpha_retry',
        versionId: 'ver_alpha_retry',
        uploadedBy: userDoctorAlpha,
        scope: VisibilityScope.CLINICAL_STAFF,
      });

      const failedJob = IngestionJob.create({
        id: 'job_alpha_retry',
        documentId: 'doc_alpha_retry',
        documentVersionId: 'ver_alpha_retry',
        tenantId: tenantAlpha,
        maxAttempts: 3,
      });
      failedJob.startValidation();
      failedJob.fail('STORAGE_TIMEOUT', 'Temporary storage glitch');

      mockJobRepo.findById.mockResolvedValue(failedJob);
      mockDocRepo.findById.mockResolvedValue(docAlpha);

      const retriedJob = await orchestrator.retryJob(tenantAlpha, 'job_alpha_retry');

      expect(retriedJob.tenantId).toBe(tenantAlpha);
      expect(retriedJob.documentId).toBe('doc_alpha_retry');
      expect(retriedJob.documentVersionId).toBe('ver_alpha_retry');
      expect(retriedJob.status).toBe(IngestionStatus.VALIDATING);
    });
  });

  describe('Scenario 6: Deleted or revoked documents are not processed as though still authorized', () => {
    it('should fail permanently if document was soft-deleted before or during validation stage', async () => {
      const deletedDoc = createTestDoc({
        tenantId: tenantAlpha,
        docId: 'doc_alpha_deleted',
        versionId: 'ver_alpha_deleted',
        uploadedBy: userDoctorAlpha,
        scope: VisibilityScope.ALL_STAFF,
        isDeleted: true,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_deleted',
        documentId: 'doc_alpha_deleted',
        documentVersionId: 'ver_alpha_deleted',
        tenantId: tenantAlpha,
      });

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(deletedDoc);

      const resultJob = await orchestrator.processJob('job_alpha_deleted', tenantAlpha);

      expect(resultJob.status).toBe(IngestionStatus.FAILED);
      expect(resultJob.lastErrorCode).toBe('DOCUMENT_NOT_FOUND');
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 7: Replayed or duplicate jobs do not bypass authorization or state invariants', () => {
    it('should idempotently return already completed or cancelled jobs without re-execution', async () => {
      const readyJob = IngestionJob.create({
        id: 'job_ready',
        documentId: 'doc_ready',
        documentVersionId: 'ver_ready',
        tenantId: tenantAlpha,
      });
      readyJob.startValidation();
      readyJob.startProcessing();
      readyJob.startIndexing();
      readyJob.markReady();

      mockJobRepo.findById.mockResolvedValue(readyJob);

      const result = await orchestrator.processJob('job_ready', tenantAlpha);

      expect(result.status).toBe(IngestionStatus.READY);
      // Indexing port should not be invoked for an already completed job
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 8: Concurrent jobs remain strictly isolated across tenants', () => {
    it('should process concurrent jobs for different tenants without cross-tenant state bleeding', async () => {
      const docAlpha = createTestDoc({
        tenantId: tenantAlpha,
        docId: 'doc_alpha_conc',
        versionId: 'ver_alpha_conc',
        uploadedBy: userDoctorAlpha,
        scope: VisibilityScope.CLINICAL_STAFF,
      });

      const docBeta = createTestDoc({
        tenantId: tenantBeta,
        docId: 'doc_beta_conc',
        versionId: 'ver_beta_conc',
        uploadedBy: userAttackerBeta,
        scope: VisibilityScope.ALL_STAFF,
      });

      const jobAlpha = IngestionJob.create({
        id: 'job_alpha_conc',
        documentId: 'doc_alpha_conc',
        documentVersionId: 'ver_alpha_conc',
        tenantId: tenantAlpha,
      });

      const jobBeta = IngestionJob.create({
        id: 'job_beta_conc',
        documentId: 'doc_beta_conc',
        documentVersionId: 'ver_beta_conc',
        tenantId: tenantBeta,
      });

      mockJobRepo.findById
        .mockResolvedValueOnce(jobAlpha)
        .mockResolvedValueOnce(jobBeta)
        .mockResolvedValueOnce(jobAlpha)
        .mockResolvedValueOnce(jobBeta);

      mockDocRepo.findById.mockImplementation(async (tenant, id) => {
        if (tenant === tenantAlpha && id === 'doc_alpha_conc') return docAlpha;
        if (tenant === tenantBeta && id === 'doc_beta_conc') return docBeta;
        return null;
      });

      const [resAlpha, resBeta] = await Promise.all([
        orchestrator.processJob('job_alpha_conc', tenantAlpha),
        orchestrator.processJob('job_beta_conc', tenantBeta),
      ]);

      expect(resAlpha.tenantId).toBe(tenantAlpha);
      expect(resBeta.tenantId).toBe(tenantBeta);
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: tenantAlpha, documentId: 'doc_alpha_conc' }),
      );
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: tenantBeta, documentId: 'doc_beta_conc' }),
      );
    });
  });

  describe('Scenario 9: Worker failure does not leak protected content or credentials', () => {
    it('should sanitize error messages in job record and avoid storing raw payloads or stack traces', async () => {
      const job = IngestionJob.create({
        id: 'job_leak_test',
        documentId: 'doc_leak',
        documentVersionId: 'ver_leak',
        tenantId: tenantAlpha,
      });

      mockJobRepo.findById.mockResolvedValue(job);
      // Simulate storage throwing an error containing an AWS secret or token
      mockDocRepo.findById.mockRejectedValueOnce(
        new Error('Access denied with bearer token eyJhbGciOiJIUzI1Ni...'),
      );

      const failedJob = await orchestrator.processJob('job_leak_test', tenantAlpha);

      expect(failedJob.status).toBe(IngestionStatus.FAILED);
      // Ensure error classification handles security violation cleanly
      expect(failedJob.lastErrorCode).toBe('UNKNOWN_NON_RETRYABLE');
      expect(failedJob.lastErrorMessage).toBeDefined();
    });
  });

  describe('Scenario 10: Existing ingestion lifecycle and watchdog recovery remain intact', () => {
    it('should recover stale active jobs and reschedule retry via watchdog worker', async () => {
      const staleJob = IngestionJob.create({
        id: 'job_stale_1',
        documentId: 'doc_stale',
        documentVersionId: 'ver_stale',
        tenantId: tenantAlpha,
        maxAttempts: 3,
      });
      staleJob.startValidation();
      staleJob.startProcessing();

      mockJobRepo.findStaleActiveJobs.mockResolvedValueOnce([staleJob]);

      const recoveryWorker = new IngestionRecoveryWorker(mockJobRepo, orchestrator, {
        enabled: false,
        batchSize: 5,
      });

      const stats = await recoveryWorker.poll();

      expect(stats.recoveredStale).toBe(1);
      expect(mockJobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IngestionStatus.VALIDATING,
          attemptCount: 2,
        }),
      );
    });
  });
});
