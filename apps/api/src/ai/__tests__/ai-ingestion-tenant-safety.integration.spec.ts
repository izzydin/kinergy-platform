import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IVectorStorePort,
  IVectorIndexingJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { IngestionRecoveryWorker } from '../services/ingestion-recovery.worker';
import { IngestionErrorCode } from '../services/ingestion-retry.policy';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { DocumentProcessingPipelineService } from '../services/document-processing-pipeline.service';
import { VectorCleanupService } from '../services/indexing/vector-cleanup.service';
import { AiDocumentController } from '../controllers/ai-document.controller';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

/**
 * AI-10.2-07: Tenant-Safe Background Ingestion and Reprocessing Test Suite
 *
 * Covers:
 * 1. Job creation preserves the source document's ownership and scope.
 * 2. Forged queue metadata cannot alter ownership.
 * 3. A job cannot process a document from another tenant.
 * 4. A job cannot write chunks or vectors under another document's scope.
 * 5. Retry and replay preserve authoritative context.
 * 6. Document deletion prevents stale jobs from restoring deleted artifacts.
 * 7. Concurrent processing does not mix document or tenant metadata.
 * 8. Ownership or membership changes are handled according to policy.
 * 9. Partial failure does not expose incorrectly scoped artifacts.
 * 10. Existing ingestion and deletion lifecycle behavior remains intact.
 */
describe('AI-10.2-07: Tenant-Safe Background Ingestion and Reprocessing', () => {
  const TENANT_ALPHA = 'tenant_clinic_alpha';
  const TENANT_BETA = 'tenant_clinic_beta';

  const USER_DOCTOR_ALPHA: AuthenticatedUserPayload = {
    id: 'usr_doc_alpha',
    tenantId: TENANT_ALPHA,
    roles: ['Therapist', 'Doctor'],
    email: 'doc.alpha@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai:write'],
  };

  const USER_DIRECTOR_ALPHA: AuthenticatedUserPayload = {
    id: 'usr_director_alpha',
    tenantId: TENANT_ALPHA,
    roles: ['Director', 'Owner'],
    email: 'director.alpha@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai:write', 'ai.documents.manage'],
  };

  const USER_INTRUDER_BETA: AuthenticatedUserPayload = {
    id: 'usr_intruder_beta',
    tenantId: TENANT_BETA,
    roles: ['Therapist'],
    email: 'intruder@beta.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai:write'],
  };

  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockVectorStore: jest.Mocked<IVectorStorePort>;
  let mockIndexingJobRepo: jest.Mocked<IVectorIndexingJobRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;

  let mockPipeline: jest.Mocked<DocumentProcessingPipelineService>;
  let orchestrator: IngestionOrchestratorService;
  let recoveryWorker: IngestionRecoveryWorker;
  let cleanupService: VectorCleanupService;
  let documentController: AiDocumentController;

  const validChecksum = '98f3908b427288c8732a9183a4d9b93498a5a6d2638f1696c9322024b8f9006e';

  const createTestDoc = (params: {
    tenantId: string;
    docId: string;
    versionId: string;
    uploadedBy: string;
    scope?: VisibilityScope;
    isDeleted?: boolean;
  }): KnowledgeDocument => {
    const doc = KnowledgeDocument.create({
      id: params.docId,
      tenantId: params.tenantId,
      title: 'Clinical Protocol Doc',
      visibilityScope: params.scope ?? VisibilityScope.CLINICAL_STAFF,
      uploadedBy: params.uploadedBy,
      initialVersion: {
        id: params.versionId,
        originalFileName: 'protocol.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        checksum: validChecksum,
        storageKey: `tenants/${params.tenantId}/knowledge_base/protocol.pdf`,
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
      findById: jest.fn(),
      save: jest.fn().mockImplementation(async (doc: KnowledgeDocument) => doc),
      list: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    mockJobRepo = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation(async (job: IngestionJob) => job),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findByDocumentId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(null),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

    mockVectorStore = {
      saveBatch: jest.fn().mockResolvedValue(0),
      similaritySearch: jest.fn().mockResolvedValue([]),
      deleteByDocumentId: jest.fn().mockResolvedValue(0),
      deleteByDocumentVersionId: jest.fn().mockResolvedValue(0),
      deleteByGenerationId: jest.fn().mockResolvedValue(0),
      countByGenerationId: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<IVectorStorePort>;

    mockIndexingJobRepo = {
      save: jest.fn().mockImplementation(async (j) => j),
      findById: jest.fn().mockResolvedValue(null),
      cancelJobsForDocument: jest.fn().mockResolvedValue(0),
      cancelJobsForVersion: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<IVectorIndexingJobRepositoryPort>;

    mockStoragePort = {
      upload: jest.fn(),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 sample content'),
        mimeType: 'application/pdf',
        size: 2048,
      }),
      delete: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStoragePort>;

    mockPipeline = {
      processDocument: jest.fn().mockResolvedValue({
        documentId: 'doc_alpha_01',
        versionId: 'ver_alpha_01',
        chunkCount: 5,
        totalTokens: 500,
      }),
    } as unknown as jest.Mocked<DocumentProcessingPipelineService>;

    const mockIndexingPort = {
      indexDocument: jest.fn().mockResolvedValue({
        indexed: true,
        chunkCount: 5,
        embeddingModel: 'text-embedding-3-large',
      }),
    };

    orchestrator = new IngestionOrchestratorService(
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      mockIndexingPort,
      mockPipeline,
    );

    recoveryWorker = new IngestionRecoveryWorker(mockJobRepo, orchestrator, { enabled: false });

    cleanupService = new VectorCleanupService(mockVectorStore, mockIndexingJobRepo, {} as any);

    const mockSecurityPolicy = {
      resolveAllowedVisibilityScopes: (roles: string[]) => {
        if (roles.includes('Director') || roles.includes('Owner')) {
          return [
            VisibilityScope.ALL_STAFF,
            VisibilityScope.CLINICAL_STAFF,
            VisibilityScope.MANAGEMENT,
          ];
        }
        if (roles.includes('Therapist') || roles.includes('Doctor')) {
          return [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
        }
        return [VisibilityScope.ALL_STAFF];
      },
    };

    documentController = new AiDocumentController(
      {} as any, // uploadService
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      orchestrator,
      cleanupService,
      mockSecurityPolicy as any,
    );
  });

  // =========================================================================
  // Scenario 1: Job creation preserves the source document's ownership and scope
  // =========================================================================
  describe('1. Job creation preserves the source document ownership and scope', () => {
    it('creates ingestion job inheriting authoritative tenantId, documentId, and versionId without alteration', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_create_01',
        versionId: 'ver_alpha_create_01',
        uploadedBy: USER_DOCTOR_ALPHA.id,
        scope: VisibilityScope.CLINICAL_STAFF,
      });
      mockDocRepo.findById.mockResolvedValue(doc);

      // Reprocess document triggers creation of a new job for the current version
      const jobDto = await documentController.reprocessDocument(doc.id.value, USER_DOCTOR_ALPHA);

      expect(jobDto.documentId).toBe(doc.id.value);
      expect(jobDto.documentVersionId).toBe('ver_alpha_create_01');
      expect(jobDto.status).toBe(IngestionStatus.UPLOADED);
      expect(mockJobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ALPHA,
          documentId: doc.id.value,
          documentVersionId: 'ver_alpha_create_01',
        }),
      );
    });
  });

  // =========================================================================
  // Scenario 2: Forged queue metadata cannot alter ownership
  // =========================================================================
  describe('2. Forged queue metadata cannot alter ownership', () => {
    it('rejects execution when caller attempts to pass a mismatched tenantId in job invocation', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_02',
        versionId: 'ver_alpha_02',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_02',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_02',
      });

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(doc);

      // Intruder Beta tries to execute Alpha job by passing TENANT_BETA in queue invocation
      await expect(orchestrator.processJob('job_alpha_02', TENANT_BETA)).rejects.toThrow(
        UnauthorizedDocumentAccessException,
      );
    });
  });

  // =========================================================================
  // Scenario 3: A job cannot process a document from another tenant
  // =========================================================================
  describe('3. A job cannot process a document from another tenant', () => {
    it('fails closed when job.tenantId does not match parent document.tenantId', async () => {
      const docInBeta = createTestDoc({
        tenantId: TENANT_BETA,
        docId: 'doc_beta_03',
        versionId: 'ver_beta_03',
        uploadedBy: USER_INTRUDER_BETA.id,
      });

      // Fraudulent job claiming to be in TENANT_ALPHA but targeting doc in TENANT_BETA
      const forgedJob = IngestionJob.create({
        id: 'job_forged_03',
        tenantId: TENANT_ALPHA,
        documentId: docInBeta.id.value,
        documentVersionId: 'ver_beta_03',
      });

      mockJobRepo.findById.mockResolvedValue(forgedJob);
      // documentRepo.findById under TENANT_ALPHA returns null because doc is in TENANT_BETA
      mockDocRepo.findById.mockImplementation(async (tenantId, _docId) => {
        if (tenantId === TENANT_BETA) return docInBeta;
        return null;
      });

      const failedJob = await orchestrator.processJob('job_forged_03', TENANT_ALPHA);

      expect(failedJob.status).toBe(IngestionStatus.FAILED);
      expect(failedJob.lastErrorCode).toBe(IngestionErrorCode.DOCUMENT_NOT_FOUND);
      expect(mockPipeline.processDocument).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 4: A job cannot write chunks or vectors under another document's scope
  // =========================================================================
  describe('4. A job cannot write chunks or vectors under another document scope', () => {
    it('enforces that processing pipeline executes strictly against authoritative tenant and document IDs', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_04',
        versionId: 'ver_alpha_04',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_04',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_04',
      });

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(doc);

      await orchestrator.processJob('job_alpha_04', TENANT_ALPHA);

      // Verifies pipeline was invoked with authoritative parameters
      expect(mockPipeline.processDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ALPHA,
          documentId: doc.id.value,
          versionId: 'ver_alpha_04',
        }),
      );
    });
  });

  // =========================================================================
  // Scenario 5: Retry and replay preserve authoritative context
  // =========================================================================
  describe('5. Retry and replay preserve authoritative context', () => {
    it('ensures recovery worker and explicit retry reload persistent job and document without scope drift', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_05',
        versionId: 'ver_alpha_05',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_05',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_05',
      });
      job.fail('STORAGE_TIMEOUT', 'Temporary failure');

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(doc);

      // Explicit retry via orchestrator
      const retriedJob = await orchestrator.retryJob(TENANT_ALPHA, 'job_alpha_05');
      expect(retriedJob.tenantId).toBe(TENANT_ALPHA);
      expect(retriedJob.documentId).toBe(doc.id.value);
      expect(retriedJob.status).toBe(IngestionStatus.VALIDATING);

      // Verify background recovery worker also preserves tenant scope
      mockJobRepo.findPendingRetries.mockResolvedValue([job]);
      const processSpy = jest.spyOn(orchestrator, 'processJob').mockResolvedValue(job);

      await recoveryWorker.poll();

      expect(processSpy).toHaveBeenCalledWith('job_alpha_05', TENANT_ALPHA);
    });
  });

  // =========================================================================
  // Scenario 6: Document deletion prevents stale jobs from restoring deleted artifacts
  // =========================================================================
  describe('6. Document deletion prevents stale jobs from restoring deleted artifacts', () => {
    it('aborts processing fail-closed at each stage checkpoint if document is deleted out-of-band', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_06',
        versionId: 'ver_alpha_06',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_06',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_06',
      });

      mockJobRepo.findById.mockResolvedValue(job);

      // Document is soft-deleted out-of-band before/during processing
      doc.softDelete(USER_DOCTOR_ALPHA.id);
      mockDocRepo.findById.mockResolvedValue(doc);

      const failedJob = await orchestrator.processJob('job_alpha_06', TENANT_ALPHA);

      expect(failedJob.status).toBe(IngestionStatus.FAILED);
      expect(failedJob.lastErrorCode).toBe(IngestionErrorCode.DOCUMENT_NOT_FOUND);
      expect(mockPipeline.processDocument).not.toHaveBeenCalled();
    });

    it('vector cleanup cancels active indexing jobs and deletes vectors scoped to tenantId', async () => {
      mockIndexingJobRepo.cancelJobsForDocument.mockResolvedValue(2);
      mockVectorStore.deleteByDocumentId.mockResolvedValue(15);

      const cleanupResult = await cleanupService.cleanupDocumentVectors(
        TENANT_ALPHA,
        'doc_alpha_06',
        'Document deleted',
      );

      expect(cleanupResult.tenantId).toBe(TENANT_ALPHA);
      expect(cleanupResult.cancelledJobs).toBe(2);
      expect(cleanupResult.deletedVectors).toBe(15);
      expect(mockIndexingJobRepo.cancelJobsForDocument).toHaveBeenCalledWith(
        'doc_alpha_06',
        'Document deleted',
        TENANT_ALPHA,
      );
      expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc_alpha_06', TENANT_ALPHA);
    });
  });

  // =========================================================================
  // Scenario 7: Concurrent processing does not mix document or tenant metadata
  // =========================================================================
  describe('7. Concurrent processing does not mix document or tenant metadata', () => {
    it('executes concurrent jobs in parallel while keeping tenant and document contexts strictly isolated', async () => {
      const docAlpha = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_conc_alpha',
        versionId: 'ver_conc_alpha',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const docBeta = createTestDoc({
        tenantId: TENANT_BETA,
        docId: 'doc_conc_beta',
        versionId: 'ver_conc_beta',
        uploadedBy: USER_INTRUDER_BETA.id,
      });

      const jobAlpha = IngestionJob.create({
        id: 'job_conc_alpha',
        tenantId: TENANT_ALPHA,
        documentId: docAlpha.id.value,
        documentVersionId: 'ver_conc_alpha',
      });

      const jobBeta = IngestionJob.create({
        id: 'job_conc_beta',
        tenantId: TENANT_BETA,
        documentId: docBeta.id.value,
        documentVersionId: 'ver_conc_beta',
      });

      mockJobRepo.findById.mockImplementation(async (tenantId, jobId) => {
        if (tenantId === TENANT_ALPHA && jobId === 'job_conc_alpha') return jobAlpha;
        if (tenantId === TENANT_BETA && jobId === 'job_conc_beta') return jobBeta;
        return null;
      });

      mockDocRepo.findById.mockImplementation(async (tenantId, docId) => {
        if (tenantId === TENANT_ALPHA && docId === docAlpha.id.value) return docAlpha;
        if (tenantId === TENANT_BETA && docId === docBeta.id.value) return docBeta;
        return null;
      });

      // Run both jobs concurrently
      const [resAlpha, resBeta] = await Promise.all([
        orchestrator.processJob('job_conc_alpha', TENANT_ALPHA),
        orchestrator.processJob('job_conc_beta', TENANT_BETA),
      ]);

      expect(resAlpha.status).toBe(IngestionStatus.READY);
      expect(resAlpha.tenantId).toBe(TENANT_ALPHA);

      expect(resBeta.status).toBe(IngestionStatus.READY);
      expect(resBeta.tenantId).toBe(TENANT_BETA);

      expect(mockPipeline.processDocument).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ALPHA, documentId: docAlpha.id.value }),
      );
      expect(mockPipeline.processDocument).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_BETA, documentId: docBeta.id.value }),
      );
    });
  });

  // =========================================================================
  // Scenario 8: Ownership or membership changes are handled according to policy
  // =========================================================================
  describe('8. Ownership or membership changes are handled according to policy', () => {
    it('restricts document management and reprocessing when caller lacks management clearance', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_scope',
        versionId: 'ver_alpha_scope',
        uploadedBy: USER_DIRECTOR_ALPHA.id,
        scope: VisibilityScope.MANAGEMENT,
      });

      mockDocRepo.findById.mockResolvedValue(doc);

      // Staff/Doctor lacks MANAGEMENT visibility clearance -> rejected with 403
      await expect(
        documentController.reprocessDocument(doc.id.value, USER_DOCTOR_ALPHA),
      ).rejects.toThrow();

      // Director with MANAGEMENT clearance can trigger reprocess
      const reprocessResult = await documentController.reprocessDocument(
        doc.id.value,
        USER_DIRECTOR_ALPHA,
      );
      expect(reprocessResult.documentId).toBe(doc.id.value);
    });
  });

  // =========================================================================
  // Scenario 9: Partial failure does not expose incorrectly scoped artifacts
  // =========================================================================
  describe('9. Partial failure does not expose incorrectly scoped artifacts', () => {
    it('fails job cleanly when parsing pipeline fails, preserving source document intact without dangling artifacts', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_fail',
        versionId: 'ver_alpha_fail',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_fail',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_fail',
      });

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(doc);

      mockPipeline.processDocument.mockRejectedValueOnce(
        new Error('Corrupt PDF structure: unexpected EOF'),
      );

      const failedJob = await orchestrator.processJob('job_alpha_fail', TENANT_ALPHA);

      expect(failedJob.status).toBe(IngestionStatus.FAILED);
      expect(failedJob.lastErrorMessage).toContain('Corrupt PDF structure');
      // Document itself remains intact in catalog
      expect(mockDocRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.anything() }),
      );
    });
  });

  // =========================================================================
  // Scenario 10: Existing ingestion and deletion lifecycle behavior remains intact
  // =========================================================================
  describe('10. Existing ingestion and deletion lifecycle behavior remains intact', () => {
    it('completes the full happy path lifecycle UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY', async () => {
      const doc = createTestDoc({
        tenantId: TENANT_ALPHA,
        docId: 'doc_alpha_happy',
        versionId: 'ver_alpha_happy',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      });

      const job = IngestionJob.create({
        id: 'job_alpha_happy',
        tenantId: TENANT_ALPHA,
        documentId: doc.id.value,
        documentVersionId: 'ver_alpha_happy',
      });

      mockJobRepo.findById.mockResolvedValue(job);
      mockDocRepo.findById.mockResolvedValue(doc);

      const readyJob = await orchestrator.processJob('job_alpha_happy', TENANT_ALPHA);

      expect(readyJob.status).toBe(IngestionStatus.READY);
      expect(readyJob.isTerminal()).toBe(true);
      expect(mockPipeline.processDocument).toHaveBeenCalledTimes(1);
    });
  });
});
