import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AiDocumentController } from '../ai-document.controller';
import { SecureDocumentUploadService } from '../../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../../services/document-content-validator.service';
import { IngestionOrchestratorService } from '../../services/ingestion-orchestrator.service';
import { IngestionObservabilityService } from '../../services/ingestion-observability.service';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IIndexGenerationRepositoryPort,
  IVectorStorePort,
  IDocumentIndexingPort,
  KnowledgeDocument,
  DocumentVersion,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  IndexGeneration,
  DocumentEmbedding,
  INDEX_GENERATION_REPOSITORY_PORT,
  VECTOR_STORE_PORT,
  DOCUMENT_INDEXING_PORT,
} from '@kinergy-platform/core';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  KNOWLEDGE_CHUNK_REPOSITORY,
  SECURE_DOCUMENT_UPLOAD_SERVICE,
  DOCUMENT_CONTENT_VALIDATOR,
  AI_CONFIG_TOKEN,
  INGESTION_OBSERVABILITY_SERVICE,
  RETRIEVAL_SECURITY_POLICY_SERVICE,
} from '../../ai.tokens';
import {
  OBJECT_STORAGE_PORT,
  ObjectStoragePort,
} from '../../../platform/storage/ports/object-storage.port';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserContext } from '../../../platform/identity/context/authenticated-user-context';
import { UserStatus } from '../../../platform/identity/domain';
import { DEFAULT_AI_CONFIG } from '../../config/ai.config';
import { IngestionErrorCode } from '../../services/ingestion-retry.policy';

/**
 * AI-09.10 — IT.06: Knowledge Center, Upload, and Ingestion Tests (Backend Integration)
 *
 * Verifies the complete document management lifecycle:
 * 1. Authoritative capabilities and strict upload validation (MIME, magic bytes, size, duplicates).
 * 2. Ingestion state machine transitions (UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY).
 * 3. Cooperative cancellation and failure recovery.
 * 4. Resilient retry semantics without duplicate version creation.
 * 5. Retrieval readiness evaluation and vector index verification.
 * 6. Document preview, content streaming, and multi-tenant IDOR protection.
 */
describe('AI-09.10 — IT.06: Knowledge Center, Upload, and Ingestion (Backend Integration)', () => {
  let app: INestApplication;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let orchestrator: IngestionOrchestratorService;
  let docStore: Map<string, KnowledgeDocument>;
  let jobStore: Map<string, IngestionJob>;

  let currentUserContext: {
    userId: string;
    email: string;
    status: UserStatus;
    roles: string[];
    permissions: string[];
    tenantId: string | null;
  } | null = null;

  const tenantAlpha = 'tenant_clinic_alpha';
  const tenantBeta = 'tenant_clinic_beta';
  const adminAlpha = 'usr_admin_alpha';

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  );

  const validMarkdownBuffer = Buffer.from(
    '# Protocolo Clínico de Rehabilitación 2026\n\nDirectrices oficiales para ejercicios en cadena cerrada.',
  );

  beforeAll(async () => {
    docStore = new Map<string, KnowledgeDocument>();
    jobStore = new Map<string, IngestionJob>();

    const mockDocRepo: IKnowledgeDocumentRepositoryPort = {
      save: async (doc: KnowledgeDocument) => {
        docStore.set(doc.id.toString(), doc);
        return doc;
      },
      findById: async (tenantId: string, id: string) => {
        const found = docStore.get(typeof id === 'string' ? id : (id as { value: string }).value);
        if (!found || found.tenantId !== tenantId) return null;
        return found;
      },
      findByChecksum: async (tenantId: string, checksum: string) => {
        for (const doc of docStore.values()) {
          if (doc.tenantId === tenantId && !doc.isDeleted()) {
            if (doc.getAllVersions().some((v: DocumentVersion) => v.checksum === checksum)) {
              return doc;
            }
          }
        }
        return null;
      },
      findAll: async (
        tenantId: string,
        filter?: {
          search?: string;
          visibilityScope?: VisibilityScope;
          mimeType?: string;
          includeDeleted?: boolean;
          limit?: number;
          offset?: number;
        },
      ) => {
        let docs = Array.from(docStore.values()).filter((d) => d.tenantId === tenantId);
        if (!filter?.includeDeleted) {
          docs = docs.filter((d) => !d.isDeleted());
        }
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          docs = docs.filter((d) => d.title.toLowerCase().includes(q));
        }
        if (filter?.visibilityScope) {
          docs = docs.filter((d) => d.visibilityScope === filter.visibilityScope);
        }
        if (filter?.mimeType) {
          docs = docs.filter((d) => {
            const v = d.getCurrentVersion();
            return v && v.mimeType === filter.mimeType;
          });
        }
        const offset = filter?.offset ?? 0;
        const limit = filter?.limit ?? 20;
        return docs.slice(offset, offset + limit);
      },
      count: async (
        tenantId: string,
        filter?: {
          search?: string;
          visibilityScope?: VisibilityScope;
          mimeType?: string;
          includeDeleted?: boolean;
        },
      ) => {
        let docs = Array.from(docStore.values()).filter((d) => d.tenantId === tenantId);
        if (!filter?.includeDeleted) {
          docs = docs.filter((d) => !d.isDeleted());
        }
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          docs = docs.filter((d) => d.title.toLowerCase().includes(q));
        }
        if (filter?.visibilityScope) {
          docs = docs.filter((d) => d.visibilityScope === filter.visibilityScope);
        }
        if (filter?.mimeType) {
          docs = docs.filter((d) => {
            const v = d.getCurrentVersion();
            return v && v.mimeType === filter.mimeType;
          });
        }
        return docs.length;
      },
      softDelete: async (tenantId: string, id: string, deletedBy: string) => {
        const doc = await mockDocRepo.findById(tenantId, id);
        if (doc) {
          doc.softDelete(deletedBy);
          docStore.set(doc.id.toString(), doc);
        }
      },
    };

    const mockIngestionRepo: IIngestionJobRepositoryPort = {
      save: async (job: IngestionJob) => {
        jobStore.set(job.id, job);
        return job;
      },
      findById: async (tenantId: string, id: string) => {
        const j = jobStore.get(id);
        return j && j.tenantId === tenantId ? j : null;
      },
      findByVersionId: async (tenantId: string, versionId: string) => {
        return Array.from(jobStore.values()).filter(
          (j) => j.tenantId === tenantId && j.documentVersionId === versionId,
        );
      },
      findByDocumentId: async (tenantId: string, documentId: string) => {
        return Array.from(jobStore.values()).filter(
          (j) => j.tenantId === tenantId && j.documentId === documentId,
        );
      },
      findAll: async (tenantId: string) => {
        const items = Array.from(jobStore.values()).filter((j) => j.tenantId === tenantId);
        return { items, total: items.length };
      },
      findActiveJobByVersionId: async (tenantId: string, versionId: string) => {
        const jobs = Array.from(jobStore.values()).filter(
          (j) => j.tenantId === tenantId && j.documentVersionId === versionId,
        );
        return (
          jobs.find(
            (j) => j.status !== IngestionStatus.READY && j.status !== IngestionStatus.CANCELLED,
          ) ?? null
        );
      },
      findPendingRetries: async () => [],
      findPendingUploads: async () => [],
      findStaleActiveJobs: async () => [],
    };

    const mockChunkRepo: IKnowledgeChunkRepositoryPort = {
      saveChunks: async () => {},
      findByVersionId: async () => [],
      findById: async () => null,
      countByVersionId: async () => 8,
      deleteByVersionId: async () => 0,
    };

    const mockActiveGen = {
      id: { value: 'gen_active_01' },
      tenantId: tenantAlpha,
      generationNumber: 1,
      status: 'ACTIVE',
    };

    const mockGenerationRepo: IIndexGenerationRepositoryPort = {
      findById: async () => mockActiveGen as unknown as IndexGeneration,
      findActiveByTenantId: async (tId: string) =>
        tId === tenantAlpha ? (mockActiveGen as unknown as IndexGeneration) : null,
      findLatestGenerationNumber: async () => 1,
      listByTenantId: async () => [mockActiveGen as unknown as IndexGeneration],
      save: async () => {},
      promoteGeneration: async () => {},
    };

    const mockVectorStore: IVectorStorePort = {
      save: async () => {},
      saveBatch: async () => {},
      findByChunkId: async () => null,
      findByDocumentVersionId: async () => [
        {
          id: 'emb1',
          chunkId: 'c1',
          documentId: 'd1',
          documentVersionId: 'v1',
        } as unknown as DocumentEmbedding,
      ],
      similaritySearch: async () => [],
      deleteByDocumentId: async () => 0,
      deleteByDocumentVersionId: async () => 0,
      deleteByGenerationId: async () => 0,
      countByGenerationId: async () => 8,
    };

    const mockIndexingPort: IDocumentIndexingPort = {
      indexDocument: jest.fn().mockResolvedValue({
        indexedChunks: 8,
        vectorIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
      }),
    };

    const storageStore = new Map<string, { buffer: Buffer; mimeType: string }>();

    mockStoragePort = {
      upload: jest
        .fn()
        .mockImplementation(async (tenantId, domainFolder, filename, buffer, mimeType) => {
          const key = `tenants/${tenantId}/${domainFolder}/2026/11/uuid-${filename}`;
          storageStore.set(key, { buffer, mimeType });
          return {
            key,
            tenantId,
            domainFolder,
            filename,
            mimeType,
            sizeBytes: buffer.length,
            createdAt: new Date(),
            lastModified: new Date(),
          };
        }),
      download: jest.fn().mockImplementation(async (_tenantId, key) => {
        const stored = storageStore.get(key);
        const data = stored?.buffer ?? Buffer.from(`Payload for ${key}`);
        return {
          data,
          metadata: {
            key,
            tenantId: tenantAlpha,
            domainFolder: 'knowledge_base',
            filename: 'document.pdf',
            mimeType: stored?.mimeType ?? 'application/pdf',
            sizeBytes: data.length,
            createdAt: new Date(),
            lastModified: new Date(),
          },
        };
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AiDocumentController],
      providers: [
        {
          provide: AI_CONFIG_TOKEN,
          useValue: { ...DEFAULT_AI_CONFIG, maxDocumentSizeBytes: 10 * 1024 * 1024 },
        },
        {
          provide: DOCUMENT_CONTENT_VALIDATOR,
          useClass: DocumentContentValidatorService,
        },
        DocumentContentValidatorService,
        {
          provide: SECURE_DOCUMENT_UPLOAD_SERVICE,
          useClass: SecureDocumentUploadService,
        },
        SecureDocumentUploadService,
        {
          provide: KNOWLEDGE_DOCUMENT_REPOSITORY,
          useValue: mockDocRepo,
        },
        {
          provide: INGESTION_JOB_REPOSITORY,
          useValue: mockIngestionRepo,
        },
        {
          provide: KNOWLEDGE_CHUNK_REPOSITORY,
          useValue: mockChunkRepo,
        },
        {
          provide: INDEX_GENERATION_REPOSITORY_PORT,
          useValue: mockGenerationRepo,
        },
        {
          provide: VECTOR_STORE_PORT,
          useValue: mockVectorStore,
        },
        {
          provide: DOCUMENT_INDEXING_PORT,
          useValue: mockIndexingPort,
        },
        {
          provide: OBJECT_STORAGE_PORT,
          useValue: mockStoragePort,
        },
        IngestionOrchestratorService,
        IngestionObservabilityService,
        {
          provide: INGESTION_OBSERVABILITY_SERVICE,
          useClass: IngestionObservabilityService,
        },
        {
          provide: RETRIEVAL_SECURITY_POLICY_SERVICE,
          useValue: {
            resolveAllowedVisibilityScopes: jest
              .fn()
              .mockReturnValue([
                VisibilityScope.ALL_STAFF,
                VisibilityScope.CLINICAL_STAFF,
                VisibilityScope.MANAGEMENT,
              ]),
          },
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUserContext) {
            throw new UnauthorizedException('Authentication token required.');
          }
          if (!currentUserContext.tenantId) {
            throw new ForbiddenException('Tenant scope missing.');
          }
          const req = context.switchToHttp().getRequest();
          req.user = new AuthenticatedUserContext({
            userId: currentUserContext.userId,
            email: currentUserContext.email,
            status: currentUserContext.status,
            roles: currentUserContext.roles,
            permissions: currentUserContext.permissions,
            tenantId: currentUserContext.tenantId,
          });
          return true;
        },
      })
      .overrideGuard(AuthorizationGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    orchestrator = moduleRef.get(IngestionOrchestratorService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    docStore.clear();
    jobStore.clear();
    jest.clearAllMocks();

    currentUserContext = {
      userId: adminAlpha,
      email: 'admin@alpha.com',
      status: UserStatus.ACTIVE,
      roles: ['ADMIN'],
      permissions: ['ai:documents:manage'],
      tenantId: tenantAlpha,
    };
  });

  // =========================================================================
  // 1. Authoritative Capabilities & Upload Validation Boundaries
  // =========================================================================
  describe('1. Authoritative Capabilities & Upload Validation Boundaries', () => {
    it('returns authoritative capabilities contract with 10MB limit and allowed types', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents/capabilities')
        .expect(200);

      expect(res.body.maxFileSizeBytes).toBe(10 * 1024 * 1024);
      expect(res.body.maxFileSizeMb).toBe(10);
      expect(res.body.allowedMimeTypes).toContain('application/pdf');
      expect(res.body.allowedMimeTypes).toContain('text/markdown');
      expect(res.body.allowedExtensions).toContain('.pdf');
      expect(res.body.supportedVisibilityScopes).toContain(VisibilityScope.ALL_STAFF);
    });

    it('accepts valid PDF within size bounds and creates document and initial job', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Guía Clínica de Ligamento Cruzado Anterior')
        .field('visibilityScope', VisibilityScope.CLINICAL_STAFF)
        .attach('file', validPdfBuffer, 'guia-acl.pdf')
        .expect(201);

      expect(res.body.documentId).toBeDefined();
      expect(res.body.versionId).toBeDefined();
      expect(res.body.title).toBe('Guía Clínica de Ligamento Cruzado Anterior');
      expect(res.body.visibilityScope).toBe(VisibilityScope.CLINICAL_STAFF);
      expect(res.body.ingestionStatus).toBe(IngestionStatus.UPLOADED);

      // Verify job was persisted in store
      expect(jobStore.size).toBe(1);
      const job = Array.from(jobStore.values())[0];
      expect(job).toBeDefined();
      expect([IngestionStatus.UPLOADED, IngestionStatus.READY]).toContain(job!.status);
      expect(job!.documentId).toBe(res.body.documentId);
    });

    it('accepts valid Markdown document upload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Protocolo Cadena Cerrada')
        .attach('file', validMarkdownBuffer, 'protocolo.md')
        .expect(201);

      expect(res.body.title).toBe('Protocolo Cadena Cerrada');
      expect([IngestionStatus.UPLOADED, IngestionStatus.READY]).toContain(res.body.ingestionStatus);
    });

    it('rejects unsupported file type (.exe) with 415 Unsupported Media Type', async () => {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Malware Test')
        .attach('file', exeBuffer, 'payload.exe')
        .expect(415);

      expect(res.body.message).toMatch(
        /not supported|unsupported document format|not allowed|validation/i,
      );
    });

    it('rejects file claiming to be .pdf but failing magic byte validation', async () => {
      const fakePdfBuffer = Buffer.from('This is completely plain text with zero PDF markers.');
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Fake PDF')
        .attach('file', fakePdfBuffer, 'fake.pdf')
        .expect(400);

      expect(res.body.message).toMatch(
        /does not match detected|magic numbers|indicated format|corrupted|validation/i,
      );
    });

    it('rejects file exceeding 10MB size limit with 413 Payload Too Large', async () => {
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, '%PDF-1.4\n...');
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Oversized Document')
        .attach('file', oversizedBuffer, 'oversized.pdf')
        .expect(413);

      expect(res.body.message).toMatch(/File too large|exceeds maximum (allowed|permitted) size/i);
    });

    it('rejects duplicate content upload with 409 Conflict', async () => {
      // 1. Initial upload
      await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Original Document')
        .attach('file', validPdfBuffer, 'original.pdf')
        .expect(201);

      // 2. Duplicate upload with same exact binary contents
      const duplicateRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Duplicate Attempt')
        .attach('file', validPdfBuffer, 'duplicate.pdf')
        .expect(409);

      expect(duplicateRes.body.message).toMatch(/Duplicate document version|already exists/i);
    });
  });

  // =========================================================================
  // 2. Knowledge Center Listing, Pagination & Filtering
  // =========================================================================
  describe('2. Knowledge Center Listing, Pagination & Filtering', () => {
    it('returns empty list when no documents exist for the tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents')
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });

    it('supports search, visibility scope filtering, and server pagination', async () => {
      // Seed 3 documents with different properties
      await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Tendinopatía Rotuliana Pautas')
        .field('visibilityScope', VisibilityScope.ALL_STAFF)
        .attach('file', Buffer.from('%PDF-1.4\nrotuliana\n%%EOF'), 'rotuliana.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Tendinopatía Aquiles Quirúrgica')
        .field('visibilityScope', VisibilityScope.MANAGEMENT)
        .attach('file', Buffer.from('%PDF-1.4\naquiles\n%%EOF'), 'aquiles.pdf')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Rehabilitación Manguito Rotador')
        .field('visibilityScope', VisibilityScope.CLINICAL_STAFF)
        .attach('file', Buffer.from('%PDF-1.4\nmanguito\n%%EOF'), 'manguito.pdf')
        .expect(201);

      // Search filter: 'Tendinopatía' (should match 2)
      const searchRes = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents?search=Tendinopatía')
        .expect(200);
      expect(searchRes.body.total).toBe(2);

      // Scope filter: MANAGEMENT (should match 1)
      const scopeRes = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents?visibilityScope=MANAGEMENT')
        .expect(200);
      expect(scopeRes.body.total).toBe(1);
      expect(scopeRes.body.items[0].title).toBe('Tendinopatía Aquiles Quirúrgica');

      // Pagination: limit=1, page=2
      const pageRes = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents?limit=1&page=2')
        .expect(200);
      expect(pageRes.body.items.length).toBe(1);
      expect(pageRes.body.page).toBe(2);
      expect(pageRes.body.total).toBe(3);
      expect(pageRes.body.totalPages).toBe(3);
      expect(pageRes.body.hasNextPage).toBe(true);
      expect(pageRes.body.hasPreviousPage).toBe(true);

      // No results search
      const noResultsRes = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents?search=TerminoInexistente')
        .expect(200);
      expect(noResultsRes.body.total).toBe(0);
      expect(noResultsRes.body.items).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Ingestion State Machine Transitions (UPLOADED -> READY)
  // =========================================================================
  describe('3. Ingestion State Machine Transitions', () => {
    it('progresses through UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Guía de Biomecánica Articular')
        .attach('file', validPdfBuffer, 'biomecanica.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;
      const job = Array.from(jobStore.values()).find((j) => j.documentId === docId);
      expect(job).toBeDefined();
      expect([IngestionStatus.UPLOADED, IngestionStatus.READY]).toContain(job!.status);

      // Execute orchestrator pipeline
      const finishedJob = await orchestrator.processJob(job!.id, tenantAlpha);

      expect(finishedJob.status).toBe(IngestionStatus.READY);
      expect(finishedJob.isTerminal()).toBe(true);
      expect(finishedJob.attemptCount).toBe(1);
      expect(finishedJob.completedAt).toBeDefined();

      // Query ingestion status via API endpoint
      const statusRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}/ingestion`)
        .expect(200);

      expect(statusRes.body.length).toBe(1);
      expect(statusRes.body[0].status).toBe(IngestionStatus.READY);
      expect(statusRes.body[0].attemptCount).toBe(1);
    });

    it('cancels active ingestion cooperatively without deleting document version', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Documento Para Cancelar')
        .attach('file', validPdfBuffer, 'cancel.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;
      const versionId = uploadRes.body.versionId;

      // Ensure active job is in VALIDATING state so cancel endpoint can transition it
      const activeJob = IngestionJob.create({
        tenantId: tenantAlpha,
        documentId: docId,
        documentVersionId: versionId,
        maxAttempts: 3,
      });
      activeJob.startValidation();
      await jobStore.set(activeJob.id, activeJob);

      // Cancel ingestion via API
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/knowledge/documents/${docId}/ingestion/cancel`)
        .send({ reason: 'Subida errónea por el usuario' })
        .expect(200);

      expect(cancelRes.body.status).toBe(IngestionStatus.CANCELLED);

      // Verify orchestrator respects cancelled state and aborts cooperatively
      const reProcessed = await orchestrator.processJob(activeJob.id, tenantAlpha);
      expect(reProcessed.status).toBe(IngestionStatus.CANCELLED);

      // Verify document and version remain preserved
      const docRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}`)
        .expect(200);
      expect(docRes.body.id).toBe(docId);
      expect(docRes.body.versions.length).toBe(1);
    });
  });

  // =========================================================================
  // 4. Retry and Recovery Semantics
  // =========================================================================
  describe('4. Retry and Recovery Semantics', () => {
    it('retries a failed ingestion job, increments attempts, and does NOT duplicate document version', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Documento para Simulación de Fallo')
        .attach('file', validPdfBuffer, 'sim_fallo.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;
      const versionId = uploadRes.body.versionId;

      // Seed a FAILED job for this version
      const failedJob = IngestionJob.create({
        tenantId: tenantAlpha,
        documentId: docId,
        documentVersionId: versionId,
        maxAttempts: 3,
      });
      failedJob.startValidation();
      failedJob.fail(IngestionErrorCode.PROCESSING_TIMEOUT, 'Parser memory pressure timeout');
      await jobStore.set(failedJob.id, failedJob);

      // Verify retry endpoint succeeds
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/knowledge/documents/${docId}/ingestion/retry`)
        .expect(200);

      expect(retryRes.body.status).toBe(IngestionStatus.VALIDATING);
      expect(retryRes.body.attemptCount).toBe(2);

      // Verify version count is strictly preserved (no duplicate version created)
      const docRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}`)
        .expect(200);
      expect(docRes.body.versions.length).toBe(1);

      // Now orchestrator processes the retry to completion
      const completedJob = await orchestrator.processJob(failedJob.id, tenantAlpha);
      expect(completedJob.status).toBe(IngestionStatus.READY);
    });

    it('rejects retry on a completed READY job with 400 Bad Request', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Documento Ya Listo')
        .attach('file', validPdfBuffer, 'listo.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;
      const job = Array.from(jobStore.values()).find((j) => j.documentId === docId)!;
      await orchestrator.processJob(job.id, tenantAlpha);

      // Attempting to retry a READY job violates state machine invariants
      await request(app.getHttpServer())
        .post(`/api/v1/ai/knowledge/documents/${docId}/ingestion/retry`)
        .expect(400);
    });
  });

  // =========================================================================
  // 5. Document Details, Retrieval Readiness & Content Streaming
  // =========================================================================
  describe('5. Document Details, Retrieval Readiness & Content Streaming', () => {
    it('evaluates retrieval readiness via IngestionObservabilityService', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Documento de Observabilidad')
        .attach('file', validPdfBuffer, 'obs.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;
      const job = Array.from(jobStore.values()).find((j) => j.documentId === docId)!;
      await orchestrator.processJob(job.id, tenantAlpha);

      const retrievalRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}/retrieval-status`)
        .expect(200);

      expect(retrievalRes.body.isReadyForRetrieval).toBe(true);
      expect(retrievalRes.body.totalChunks).toBe(8);
      expect(retrievalRes.body.indexedChunks).toBe(1);
    });

    it('streams binary content with security headers and handles soft-deletion lifecycle', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Documento para Descarga y Borrado')
        .attach('file', validPdfBuffer, 'descarga.pdf')
        .expect(201);

      const docId = uploadRes.body.documentId;

      // 1. Download content
      const contentRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}/content`)
        .expect(200);

      expect(contentRes.header['content-disposition']).toMatch(/inline|attachment/);
      expect(contentRes.header['x-content-type-options']).toBe('nosniff');

      // 2. Soft-delete document
      await request(app.getHttpServer())
        .delete(`/api/v1/ai/knowledge/documents/${docId}`)
        .expect(204);

      // 3. Regular retrieval returns 404
      await request(app.getHttpServer()).get(`/api/v1/ai/knowledge/documents/${docId}`).expect(404);

      // 4. Admin query with includeDeleted=true succeeds
      const deletedRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}?includeDeleted=true`)
        .expect(200);
      expect(deletedRes.body.isDeleted).toBe(true);
      expect(deletedRes.body.deletedAt).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Multi-Tenant IDOR Protection
  // =========================================================================
  describe('6. Multi-Tenant IDOR Protection', () => {
    it('strictly isolates Tenant Beta from accessing Tenant Alpha documents and ingestion jobs', async () => {
      // 1. Tenant Alpha uploads sensitive clinical protocol
      const alphaRes = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Protocolo Confidencial Alpha')
        .attach('file', validPdfBuffer, 'alpha.pdf')
        .expect(201);

      const docId = alphaRes.body.documentId;

      // 2. Switch context to Tenant Beta intruder
      currentUserContext = {
        userId: 'usr_intruder_beta',
        email: 'intruder@beta.com',
        status: UserStatus.ACTIVE,
        roles: ['ADMIN'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantBeta,
      };

      // Tenant Beta listing yields 0 items
      const betaList = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents')
        .expect(200);
      expect(betaList.body.items).toEqual([]);

      // Direct IDOR access returns 404 (preventing ID enumeration)
      await request(app.getHttpServer()).get(`/api/v1/ai/knowledge/documents/${docId}`).expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${docId}/content`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/v1/ai/knowledge/documents/${docId}/ingestion/cancel`)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/ai/knowledge/documents/${docId}`)
        .expect(404);
    });
  });
});
