import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  IngestionJob,
  IngestionStatus,
  IngestionStageId,
  IngestionStageStatus,
  IngestionFailureCategory,
  IIngestionJobRepositoryPort,
  IKnowledgeDocumentRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IIndexGenerationRepositoryPort,
  IVectorStorePort,
  KnowledgeDocument,
  VisibilityScope,
  IndexGeneration,
  IndexGenerationId,
  DocumentEmbedding,
} from '@kinergy-platform/core';
import { IngestionObservabilityService } from '../ingestion-observability.service';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';
import { IngestionErrorCode } from '../ingestion-retry.policy';

describe('IngestionObservabilityService (Unit & Invariants)', () => {
  let service: IngestionObservabilityService;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockGenRepo: jest.Mocked<IIndexGenerationRepositoryPort>;
  let mockVectorStore: jest.Mocked<IVectorStorePort>;

  const tenantId = 'tenant_clinic_01';
  const docId = 'doc_c1a2b3c4d5e6';
  const versionId = 'ver_01';

  const adminUser: AuthenticatedUserPayload = {
    id: 'usr_admin',
    email: 'admin@clinic.com',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['ai:documents:manage'],
    tenantId,
  };

  const viewerUser: AuthenticatedUserPayload = {
    id: 'usr_viewer',
    email: 'viewer@clinic.com',
    status: 'ACTIVE',
    roles: ['VIEWER'],
    permissions: ['ai:documents:read'],
    tenantId,
  };

  const createMockDocument = (isDeleted = false): KnowledgeDocument => {
    const doc = KnowledgeDocument.create({
      tenantId,
      uploadedBy: 'usr_therapist_01',
      title: 'Clinical Protocol',
      visibilityScope: VisibilityScope.CLINICAL_STAFF,
      initialVersion: {
        originalFileName: 'protocol.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        checksum: 'a'.repeat(64),
        storageKey: 'storage/doc/ver_01',
      },
    });
    if (isDeleted) {
      doc.softDelete('usr_admin');
    }
    return doc;
  };

  beforeEach(() => {
    mockJobRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findByDocumentId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findActiveJobByVersionId: jest.fn(),
      findPendingRetries: jest.fn(),
      findPendingUploads: jest.fn(),
      findStaleActiveJobs: jest.fn(),
    };

    mockDocRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByChecksum: jest.fn(),
      findAll: jest.fn(),
      count: jest.fn(),
      softDelete: jest.fn(),
    };

    mockChunkRepo = {
      saveChunks: jest.fn(),
      findByVersionId: jest.fn().mockResolvedValue([]),
      deleteByVersionId: jest.fn(),
      countByVersionId: jest.fn().mockResolvedValue(10),
    };

    const mockActiveGen = {
      id: IndexGenerationId.create('gen_active_01'),
      status: 'ACTIVE',
    } as unknown as IndexGeneration;

    mockGenRepo = {
      findById: jest.fn(),
      findActiveByTenantId: jest.fn().mockResolvedValue(mockActiveGen),
      findLatestGenerationNumber: jest.fn(),
      listByTenantId: jest.fn(),
      save: jest.fn(),
      promoteGeneration: jest.fn(),
    };

    mockVectorStore = {
      save: jest.fn(),
      saveBatch: jest.fn(),
      findByChunkId: jest.fn(),
      findByDocumentVersionId: jest
        .fn()
        .mockResolvedValue(new Array(10).fill({} as unknown as DocumentEmbedding)),
      search: jest.fn(),
      deleteByGenerationId: jest.fn(),
    } as unknown as jest.Mocked<IVectorStorePort>;

    service = new IngestionObservabilityService(
      mockJobRepo,
      mockDocRepo,
      mockChunkRepo,
      mockGenRepo,
      mockVectorStore,
    );
  });

  describe('Processing Stage Observability & Lifecycle Progression', () => {
    it('exposes authentic stages when job is UPLOADED', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.UPLOADED);
      expect(enriched.currentStage).toBe('UPLOADED');
      expect(enriched.isTerminal).toBe(false);
      expect(enriched.canRetry).toBe(false);

      expect(enriched.stages).toHaveLength(3);
      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.stage).toBe(IngestionStageId.VALIDATING);
      expect(stage1?.status).toBe(IngestionStageStatus.PENDING);
      expect(stage2?.stage).toBe(IngestionStageId.PROCESSING);
      expect(stage2?.status).toBe(IngestionStageStatus.PENDING);
      expect(stage3?.stage).toBe(IngestionStageId.INDEXING);
      expect(stage3?.status).toBe(IngestionStageStatus.PENDING);
    });

    it('exposes VALIDATING in progress with started timestamp', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.VALIDATING);
      expect(enriched.currentStage).toBe(IngestionStageId.VALIDATING);
      expect(enriched.startedAt).toBeDefined();

      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.IN_PROGRESS);
      expect(stage1?.startedAt).toBe(enriched.startedAt);
      expect(stage2?.status).toBe(IngestionStageStatus.PENDING);
      expect(stage3?.status).toBe(IngestionStageStatus.PENDING);
    });

    it('exposes PROCESSING with validation completed and text extraction in progress', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.startProcessing();

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.PROCESSING);
      expect(enriched.currentStage).toBe(IngestionStageId.PROCESSING);
      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage2?.status).toBe(IngestionStageStatus.IN_PROGRESS);
      expect(stage3?.status).toBe(IngestionStageStatus.PENDING);
    });

    it('exposes INDEXING with validation and chunking completed', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.startProcessing();
      job.startIndexing();

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.INDEXING);
      expect(enriched.currentStage).toBe(IngestionStageId.INDEXING);
      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage2?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage3?.status).toBe(IngestionStageStatus.IN_PROGRESS);
    });

    it('exposes READY with all stages COMPLETED, duration calculated, and terminal state', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.startProcessing();
      job.startIndexing();
      job.markReady();

      const doc = createMockDocument();
      const enriched = await service.enrichJobDto(tenantId, job, doc);

      expect(enriched.status).toBe(IngestionStatus.READY);
      expect(enriched.currentStage).toBe('READY');
      expect(enriched.isTerminal).toBe(true);
      expect(enriched.canRetry).toBe(false);
      expect(enriched.completedAt).toBeDefined();
      expect(enriched.durationMs).toBeGreaterThanOrEqual(0);

      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage2?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage3?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage3?.completedAt).toBe(enriched.completedAt);
    });
  });

  describe('Failure Information & Security Sanitization', () => {
    it('classifies validation failure and skips subsequent processing stages', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.fail(
        IngestionErrorCode.UNSUPPORTED_FORMAT,
        'MIME type application/octet-stream not supported.',
      );

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.FAILED);
      expect(enriched.failureInfo).toBeDefined();
      expect(enriched.failureInfo?.category).toBe(IngestionFailureCategory.VALIDATION);
      expect(enriched.failureInfo?.failedStage).toBe(IngestionStageId.VALIDATING);
      expect(enriched.failureInfo?.isRetryable).toBe(false);

      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.FAILED);
      expect(stage2?.status).toBe(IngestionStageStatus.SKIPPED);
      expect(stage3?.status).toBe(IngestionStageStatus.SKIPPED);
    });

    it('classifies transient storage timeout as retryable with canRetry = true', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
        maxAttempts: 3,
      });
      job.startValidation();
      job.startProcessing();
      job.fail(IngestionErrorCode.STORAGE_TIMEOUT, 'Connection timed out to storage service.');

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.FAILED);
      expect(enriched.failureInfo?.category).toBe(IngestionFailureCategory.STORAGE);
      expect(enriched.failureInfo?.isRetryable).toBe(true);
      expect(enriched.canRetry).toBe(true);
      expect(enriched.isTerminal).toBe(false);

      const [stage1, stage2, stage3] = enriched.stages;
      expect(stage1?.status).toBe(IngestionStageStatus.COMPLETED);
      expect(stage2?.status).toBe(IngestionStageStatus.FAILED);
      expect(stage3?.status).toBe(IngestionStageStatus.SKIPPED);
    });

    it('sanitizes stack traces, filesystem paths, and database connection strings', async () => {
      const sensitiveRawError =
        'Error at Object.<anonymous> (C:\\Projects\\kinergy\\secret.ts:15:20) connecting to postgres://admin:superSecret@db.internal:5432/kinergy';

      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.fail(IngestionErrorCode.DATABASE_TRANSIENT_ERROR, sensitiveRawError);

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.failureInfo?.message).not.toContain('C:\\Projects');
      expect(enriched.failureInfo?.message).not.toContain('secret.ts');
      expect(enriched.failureInfo?.message).not.toContain('superSecret');
      expect(enriched.failureInfo?.message).not.toContain('postgres://');
    });

    it('represents CANCELLED jobs as terminal without retry capability', async () => {
      const job = IngestionJob.create({
        tenantId,
        documentId: docId,
        documentVersionId: versionId,
      });
      job.startValidation();
      job.cancel('Operator requested cancellation');

      const enriched = await service.enrichJobDto(tenantId, job);

      expect(enriched.status).toBe(IngestionStatus.CANCELLED);
      expect(enriched.currentStage).toBe('CANCELLED');
      expect(enriched.isTerminal).toBe(true);
      expect(enriched.canRetry).toBe(false);
      expect(enriched.cancelledAt).toBeDefined();
      expect(enriched.cancellationReason).toBe('Operator requested cancellation');
    });
  });

  describe('Authoritative Retrieval Readiness Invariants', () => {
    it('confirms retrieval readiness when all 5 conditions are satisfied', async () => {
      const doc = createMockDocument();
      mockDocRepo.findById.mockResolvedValue(doc);

      const job = IngestionJob.create({
        tenantId,
        documentId: doc.id.toString(),
        documentVersionId: doc.currentVersionId!,
      });
      job.startValidation();
      job.startProcessing();
      job.startIndexing();
      job.markReady();

      mockJobRepo.findByVersionId.mockResolvedValue([job]);
      mockChunkRepo.countByVersionId.mockResolvedValue(12);
      mockVectorStore.findByDocumentVersionId.mockResolvedValue(
        new Array(12).fill({} as unknown as DocumentEmbedding),
      );

      const readiness = await service.evaluateRetrievalReadiness(
        tenantId,
        doc.id.toString(),
        doc.currentVersionId!,
      );

      expect(readiness.isReadyForRetrieval).toBe(true);
      expect(readiness.activeGenerationId).toBe('gen_active_01');
      expect(readiness.totalChunks).toBe(12);
      expect(readiness.embeddingsCount).toBe(12);
      expect(readiness.reason).toContain('fully indexed and available for semantic retrieval');
    });

    it('rejects retrieval readiness when document is soft deleted', async () => {
      const doc = createMockDocument(true); // Soft-deleted
      mockDocRepo.findById.mockResolvedValue(doc);

      const readiness = await service.evaluateRetrievalReadiness(tenantId, doc.id.toString());

      expect(readiness.isReadyForRetrieval).toBe(false);
      expect(readiness.reason).toContain('soft-deleted');
    });

    it('rejects retrieval readiness when tenant has no active IndexGeneration', async () => {
      const doc = createMockDocument();
      mockDocRepo.findById.mockResolvedValue(doc);
      mockGenRepo.findActiveByTenantId.mockResolvedValue(null); // No active generation

      const readiness = await service.evaluateRetrievalReadiness(tenantId, doc.id.toString());

      expect(readiness.isReadyForRetrieval).toBe(false);
      expect(readiness.reason).toContain('No ACTIVE index generation');
    });

    it('rejects retrieval readiness when chunks count is zero', async () => {
      const doc = createMockDocument();
      mockDocRepo.findById.mockResolvedValue(doc);

      const job = IngestionJob.create({
        tenantId,
        documentId: doc.id.toString(),
        documentVersionId: doc.currentVersionId!,
      });
      job.startValidation();
      job.startProcessing();
      job.startIndexing();
      job.markReady();

      mockJobRepo.findByVersionId.mockResolvedValue([job]);
      mockChunkRepo.countByVersionId.mockResolvedValue(0); // Zero chunks

      const readiness = await service.evaluateRetrievalReadiness(tenantId, doc.id.toString());

      expect(readiness.isReadyForRetrieval).toBe(false);
      expect(readiness.reason).toContain('0 parsed chunks');
    });

    it('rejects retrieval readiness when embeddings count is zero in active generation', async () => {
      const doc = createMockDocument();
      mockDocRepo.findById.mockResolvedValue(doc);

      const job = IngestionJob.create({
        tenantId,
        documentId: doc.id.toString(),
        documentVersionId: doc.currentVersionId!,
      });
      job.startValidation();
      job.startProcessing();
      job.startIndexing();
      job.markReady();

      mockJobRepo.findByVersionId.mockResolvedValue([job]);
      mockChunkRepo.countByVersionId.mockResolvedValue(10);
      mockVectorStore.findByDocumentVersionId.mockResolvedValue([]); // Zero embeddings committed

      const readiness = await service.evaluateRetrievalReadiness(tenantId, doc.id.toString());

      expect(readiness.isReadyForRetrieval).toBe(false);
      expect(readiness.reason).toContain('No vector embeddings found in active generation');
    });

    it('rejects retrieval readiness when latest ingestion job is still in progress', async () => {
      const doc = createMockDocument();
      mockDocRepo.findById.mockResolvedValue(doc);

      const job = IngestionJob.create({
        tenantId,
        documentId: doc.id.toString(),
        documentVersionId: doc.currentVersionId!,
      });
      job.startValidation();
      job.startProcessing(); // In PROCESSING state

      mockJobRepo.findByVersionId.mockResolvedValue([job]);

      const readiness = await service.evaluateRetrievalReadiness(tenantId, doc.id.toString());

      expect(readiness.isReadyForRetrieval).toBe(false);
      expect(readiness.reason).toContain('PROCESSING');
    });
  });

  describe('Administrative Monitoring & Access Control', () => {
    it('allows administrative roles to query tenant-wide ingestion queue', async () => {
      const job1 = IngestionJob.create({ tenantId, documentId: 'doc_1', documentVersionId: 'v1' });
      mockJobRepo.findAll.mockResolvedValue({
        items: [job1],
        total: 1,
      });

      const result = await service.listTenantIngestionJobs(
        tenantId,
        { limit: 10, offset: 0 },
        adminUser,
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('rejects non-administrative users from accessing tenant-wide ingestion monitoring', async () => {
      await expect(
        service.listTenantIngestionJobs(tenantId, { limit: 10, offset: 0 }, viewerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when querying ingestion for non-existent document', async () => {
      mockDocRepo.findById.mockResolvedValue(null);

      await expect(
        service.getDocumentIngestionHistory(tenantId, 'non_existent_doc', adminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('IM.08 — Diagnostic Sanitization Hardening', () => {
    it('redacts database URIs, credentials, and passwords', () => {
      const raw =
        'Failed to connect to postgresql://dbuser:superSecretPass@127.0.0.1:5432/kinergy_db?ssl=true';
      const clean = service.sanitizeErrorMessage(raw, IngestionErrorCode.DATABASE_TRANSIENT_ERROR);

      expect(clean).not.toContain('superSecretPass');
      expect(clean).not.toContain('127.0.0.1');
      expect(clean).toContain('[redacted_uri]');
    });

    it('redacts API keys (OpenAI, Google, Anthropic, AWS) and Bearer/JWT tokens', () => {
      const raw =
        'LLM Embedding failed: sk-123456789012345678901234567890 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis';
      const clean = service.sanitizeErrorMessage(raw, IngestionErrorCode.NETWORK_TRANSIENT_ERROR);

      expect(clean).not.toContain('sk-123456789012345678901234567890');
      expect(clean).not.toContain('doNotLeakThis');
      expect(clean).toContain('[redacted_api_key]');
      expect(clean).toContain('[redacted_token]');
    });

    it('redacts internal IPv4 addresses and filesystem paths', () => {
      const raw =
        'Failed to read file at C:\\app\\storage\\tenants\\tenant_01\\secret_protocol.pdf from worker 10.0.0.45:8080';
      const clean = service.sanitizeErrorMessage(raw, IngestionErrorCode.STORAGE_UNAVAILABLE);

      expect(clean).not.toContain('C:\\app\\storage');
      expect(clean).not.toContain('10.0.0.45');
      expect(clean).toContain('[redacted_path]');
      expect(clean).toContain('[redacted_host]');
    });

    it('redacts raw document content dumps and truncates oversized messages', () => {
      const raw = `Extraction error for chunk content: "This is sensitive patient health diagnosis information that must never be leaked across the wire into logs or UI" extra details`;
      const clean = service.sanitizeErrorMessage(raw, IngestionErrorCode.MALFORMED_CONTENT);

      expect(clean).not.toContain('patient health diagnosis');
      expect(clean).toContain('[redacted_content]');
      expect(clean.length).toBeLessThanOrEqual(300);
    });

    it('redacts private key blocks', () => {
      const raw =
        'TLS Handshake error: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----';
      const clean = service.sanitizeErrorMessage(raw, IngestionErrorCode.NETWORK_TRANSIENT_ERROR);

      expect(clean).not.toContain('MIIEowIBAAKCAQEA0');
      expect(clean).toContain('[redacted_private_key]');
    });
  });
});
