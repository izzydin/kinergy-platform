import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AiDocumentController } from '../ai-document.controller';
import { SecureDocumentUploadService } from '../../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../../services/document-content-validator.service';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  DocumentVersion,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
} from '@kinergy-platform/core';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  SECURE_DOCUMENT_UPLOAD_SERVICE,
  DOCUMENT_CONTENT_VALIDATOR,
  AI_CONFIG_TOKEN,
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

describe('AI-03.4 — Knowledge Document Management HTTP APIs (Integration)', () => {
  let app: INestApplication;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
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
  const therapistAlpha = 'usr_therapist_alpha';

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
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
          limit?: number;
          offset?: number;
        },
      ) => {
        let docs = Array.from(docStore.values()).filter(
          (d) => d.tenantId === tenantId && !d.isDeleted(),
        );
        if (filter?.search) {
          docs = docs.filter((d) => d.title.toLowerCase().includes(filter.search!.toLowerCase()));
        }
        if (filter?.visibilityScope) {
          docs = docs.filter((d) => d.visibilityScope === filter.visibilityScope);
        }
        const offset = filter?.offset ?? 0;
        const limit = filter?.limit ?? 20;
        return docs.slice(offset, offset + limit);
      },
      count: async (
        tenantId: string,
        filter?: { search?: string; visibilityScope?: VisibilityScope },
      ) => {
        let docs = Array.from(docStore.values()).filter(
          (d) => d.tenantId === tenantId && !d.isDeleted(),
        );
        if (filter?.search) {
          docs = docs.filter((d) => d.title.toLowerCase().includes(filter.search!.toLowerCase()));
        }
        if (filter?.visibilityScope) {
          docs = docs.filter((d) => d.visibilityScope === filter.visibilityScope);
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

    mockStoragePort = {
      upload: jest
        .fn()
        .mockImplementation(async (tenantId, domainFolder, filename, buffer, mimeType) => ({
          key: `tenants/${tenantId}/${domainFolder}/2026/11/uuid-${filename}`,
          tenantId,
          domainFolder,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          createdAt: new Date(),
          lastModified: new Date(),
        })),
      download: jest.fn().mockImplementation(async (_tenantId, key) => ({
        data: Buffer.from(`Payload for ${key}`),
        metadata: {
          key,
          tenantId: tenantAlpha,
          domainFolder: 'knowledge_base',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 25,
          createdAt: new Date(),
          lastModified: new Date(),
        },
      })),
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
          provide: OBJECT_STORAGE_PORT,
          useValue: mockStoragePort,
        },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUserContext) {
            throw new UnauthorizedException('Authentication token required.');
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    currentUserContext = {
      userId: therapistAlpha,
      email: 'therapist@alpha.com',
      status: UserStatus.ACTIVE,
      roles: ['THERAPIST'],
      permissions: ['ai:documents:manage'],
      tenantId: tenantAlpha,
    };
  });

  describe('1. Security & Authentication Boundaries', () => {
    it('rejects anonymous access with 401 Unauthorized', async () => {
      currentUserContext = null;

      await request(app.getHttpServer()).get('/api/v1/ai/knowledge/documents').expect(401);
    });

    it('rejects users without tenantId with 403 Forbidden', async () => {
      currentUserContext = {
        userId: 'unassigned_user',
        email: 'user@nowhere.com',
        status: UserStatus.ACTIVE,
        roles: ['GUEST'],
        permissions: [],
        tenantId: null,
      };

      await request(app.getHttpServer()).get('/api/v1/ai/knowledge/documents').expect(403);
    });
  });

  describe('2. Document Lifecycle Journey (Upload -> List -> Detail -> Patch -> Version -> Delete)', () => {
    let createdDocId: string;
    let initialVersionId: string;

    it('POST /api/v1/ai/knowledge/documents uploads new document', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Cervical Spine Protocol')
        .field('description', 'Standard evaluation')
        .field('visibilityScope', VisibilityScope.CLINICAL_STAFF)
        .attach('file', validPdfBuffer, 'spine-protocol.pdf')
        .expect(201);

      expect(res.body.documentId).toBeDefined();
      expect(res.body.title).toBe('Cervical Spine Protocol');
      expect(res.body.versionNumber).toBe(1);
      expect(res.body.ingestionStatus).toBe(IngestionStatus.UPLOADED);
      expect(res.body.storageKey).toBeUndefined();

      createdDocId = res.body.documentId;
      initialVersionId = res.body.versionId;
    });

    it('GET /api/v1/ai/knowledge/documents/capabilities returns authoritative configuration', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents/capabilities')
        .expect(200);

      expect(res.body.maxFileSizeBytes).toBe(10 * 1024 * 1024);
      expect(res.body.maxFileSizeMb).toBe(10);
      expect(res.body.allowedMimeTypes).toContain('application/pdf');
      expect(res.body.allowedExtensions).toContain('.pdf');
      expect(res.body.supportedVisibilityScopes).toContain(VisibilityScope.ALL_STAFF);
    });

    it('POST /api/v1/ai/knowledge/documents rejects duplicate active document content with 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Duplicate Cervical Spine Protocol')
        .attach('file', validPdfBuffer, 'duplicate-spine-protocol.pdf')
        .expect(409);

      expect(res.body.message).toContain('A document with identical content already exists');
    });

    it('GET /api/v1/ai/knowledge/documents lists documents with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/knowledge/documents?search=Cervical&page=1&limit=10')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(createdDocId);
      expect(res.body.items[0].fileExtension).toBe('pdf');
      expect(res.body.items[0].originalFileName).toBe('spine-protocol.pdf');
      expect(res.body.items[0].status).toBe('ACTIVE');
      expect(res.body.items[0].isDeleted).toBe(false);
      expect(res.body.items[0].storageReference).toBeDefined();
      expect(res.body.items[0].versions[0].storageKey).toBeUndefined();
    });

    it('GET /api/v1/ai/knowledge/documents/:id retrieves document details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}`)
        .expect(200);

      expect(res.body.id).toBe(createdDocId);
      expect(res.body.title).toBe('Cervical Spine Protocol');
      expect(res.body.versions).toHaveLength(1);
      expect(res.body.versions[0].id).toBe(initialVersionId);
    });

    it('PATCH /api/v1/ai/knowledge/documents/:id updates mutable metadata', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ai/knowledge/documents/${createdDocId}`)
        .send({
          title: 'Updated Spine Protocol 2026',
          description: 'Includes updated mobilization techniques',
          visibilityScope: VisibilityScope.ALL_STAFF,
        })
        .expect(200);

      expect(res.body.title).toBe('Updated Spine Protocol 2026');
      expect(res.body.visibilityScope).toBe(VisibilityScope.ALL_STAFF);
    });

    it('GET /api/v1/ai/knowledge/documents/:id/versions lists versions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}/versions`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].versionNumber).toBe(1);
      expect(res.body[0].storageKey).toBeUndefined();
    });

    it('GET /api/v1/ai/knowledge/documents/:id/versions/:versionId retrieves version details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}/versions/${initialVersionId}`)
        .expect(200);

      expect(res.body.id).toBe(initialVersionId);
      expect(res.body.versionNumber).toBe(1);
      expect(res.body.storageKey).toBeUndefined();
    });

    it('GET /api/v1/ai/knowledge/documents/:id/content downloads document content with security headers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}/content`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['etag']).toBeDefined();
    });

    it('GET /api/v1/ai/knowledge/documents/:id/ingestion lists ingestion jobs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}/ingestion`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].documentVersionId).toBe(initialVersionId);
      expect(res.body[0].status).toBe(IngestionStatus.UPLOADED);
    });

    it('POST /api/v1/ai/knowledge/documents/:id/ingestion/cancel cancels active ingestion', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/knowledge/documents/${createdDocId}/ingestion/cancel`)
        .send({ reason: 'Manual cancellation by supervisor' })
        .expect(200);

      expect(res.body.status).toBe(IngestionStatus.CANCELLED);
    });

    it('DELETE /api/v1/ai/knowledge/documents/:id soft-deletes document', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/ai/knowledge/documents/${createdDocId}`)
        .expect(204);

      // Verify subsequent GET returns 404
      await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${createdDocId}`)
        .expect(404);
    });
  });

  describe('3. Cross-Tenant Isolation Enforcement', () => {
    let alphaDocId: string;

    beforeEach(async () => {
      currentUserContext = {
        userId: therapistAlpha,
        email: 'therapist@alpha.com',
        status: UserStatus.ACTIVE,
        roles: ['THERAPIST'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantAlpha,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/knowledge/documents')
        .field('title', 'Confidential Alpha Document')
        .attach('file', validPdfBuffer, 'confidential.pdf');

      alphaDocId = res.body.documentId;
    });

    it('prevents tenantBeta from retrieving tenantAlpha document (returns 404 to block ID enumeration)', async () => {
      currentUserContext = {
        userId: 'usr_beta_therapist',
        email: 'therapist@beta.com',
        status: UserStatus.ACTIVE,
        roles: ['THERAPIST'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantBeta,
      };

      await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${alphaDocId}`)
        .expect(404);
    });

    it('prevents tenantBeta from updating tenantAlpha document', async () => {
      currentUserContext = {
        userId: 'usr_beta_therapist',
        email: 'therapist@beta.com',
        status: UserStatus.ACTIVE,
        roles: ['THERAPIST'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantBeta,
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/ai/knowledge/documents/${alphaDocId}`)
        .send({ title: 'Hacked Title' })
        .expect(404);
    });

    it('prevents tenantBeta from downloading tenantAlpha document content', async () => {
      currentUserContext = {
        userId: 'usr_beta_therapist',
        email: 'therapist@beta.com',
        status: UserStatus.ACTIVE,
        roles: ['THERAPIST'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantBeta,
      };

      await request(app.getHttpServer())
        .get(`/api/v1/ai/knowledge/documents/${alphaDocId}/content`)
        .expect(404);
    });

    it('prevents tenantBeta from deleting tenantAlpha document', async () => {
      currentUserContext = {
        userId: 'usr_beta_therapist',
        email: 'therapist@beta.com',
        status: UserStatus.ACTIVE,
        roles: ['THERAPIST'],
        permissions: ['ai:documents:manage'],
        tenantId: tenantBeta,
      };

      await request(app.getHttpServer())
        .delete(`/api/v1/ai/knowledge/documents/${alphaDocId}`)
        .expect(404);
    });
  });
});
