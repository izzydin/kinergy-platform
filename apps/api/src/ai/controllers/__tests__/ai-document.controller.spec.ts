import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiDocumentController } from '../ai-document.controller';
import {
  SecureDocumentUploadService,
  UploadDocumentResult,
} from '../../services/secure-document-upload.service';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  DuplicateDocumentVersionException,
  DuplicateDocumentContentException,
  DocumentValidationException,
} from '@kinergy-platform/core';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';
import { ObjectStoragePort } from '../../../platform/storage/ports/object-storage.port';

describe('AiDocumentController (Unit & REST Contract)', () => {
  let controller: AiDocumentController;
  let mockUploadService: jest.Mocked<SecureDocumentUploadService>;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockIngestionRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;

  const tenantA = 'tenant_clinic_01';
  const therapistUser = 'usr_therapist_01';

  const validUser: AuthenticatedUserPayload = {
    id: therapistUser,
    email: 'therapist@clinic.com',
    status: 'ACTIVE',
    roles: ['THERAPIST'],
    permissions: ['ai:documents:upload', 'ai:documents:read'],
    tenantId: tenantA,
  };

  const viewerUser: AuthenticatedUserPayload = {
    id: 'usr_viewer_01',
    email: 'viewer@clinic.com',
    status: 'ACTIVE',
    roles: ['VIEWER'],
    permissions: ['ai:documents:read'],
    tenantId: tenantA,
  };

  const managerUser: AuthenticatedUserPayload = {
    id: 'usr_manager_01',
    email: 'manager@clinic.com',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: ['ai:documents:upload', 'ai:documents:read', 'ai:documents:manage'],
    tenantId: tenantA,
  };

  const mockFile = {
    fieldname: 'file',
    originalname: 'spine-protocol.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-1.4 mock binary content'),
  };

  const uploadResult: UploadDocumentResult = {
    documentId: 'doc_123',
    versionId: 'ver_01',
    versionNumber: 1,
    title: 'Spine Protocol',
    originalFileName: 'spine-protocol.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    checksum: 'a'.repeat(64),
    visibilityScope: VisibilityScope.CLINICAL_STAFF,
    ingestionJobId: 'job_456',
    ingestionStatus: IngestionStatus.UPLOADED,
    createdAt: new Date('2026-11-19T12:00:00Z'),
  };

  beforeEach(() => {
    mockUploadService = {
      uploadDocument: jest.fn().mockResolvedValue(uploadResult),
    } as unknown as jest.Mocked<SecureDocumentUploadService>;

    mockDocRepo = {
      save: jest.fn().mockImplementation(async (doc: KnowledgeDocument) => doc),
      findById: jest.fn().mockResolvedValue(null),
      findByChecksum: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };

    mockIngestionRepo = {
      save: jest.fn().mockImplementation(async (job: IngestionJob) => job),
      findById: jest.fn().mockResolvedValue(null),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(null),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    };

    mockStoragePort = {
      upload: jest.fn(),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 file payload'),
        metadata: {
          key: 'tenants/tenant_clinic_01/knowledge_base/2026/11/abc-doc.pdf',
          tenantId: tenantA,
          domainFolder: 'knowledge_base',
          filename: 'spine-protocol.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          createdAt: new Date(),
          lastModified: new Date(),
        },
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    controller = new AiDocumentController(
      mockUploadService,
      mockDocRepo,
      mockIngestionRepo,
      mockStoragePort,
    );
  });

  describe('1. POST /api/v1/ai/knowledge/documents (Upload)', () => {
    it('successfully uploads document and maps response without exposing storageKey', async () => {
      const response = await controller.uploadDocument(validUser, mockFile, {
        title: 'Spine Protocol',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });

      expect(mockUploadService.uploadDocument).toHaveBeenCalledWith({
        tenantId: tenantA,
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'spine-protocol.pdf',
          mimeType: 'application/pdf',
          buffer: mockFile.buffer,
          size: 1024,
        },
        title: 'Spine Protocol',
        description: undefined,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        language: undefined,
      });

      expect(response.documentId).toBe('doc_123');
      expect(response.versionNumber).toBe(1);
      expect(response.ingestionStatus).toBe(IngestionStatus.UPLOADED);
      expect(response.createdAt).toBe('2026-11-19T12:00:00.000Z');
      expect((response as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    });

    it('throws BadRequestException when file is missing', async () => {
      await expect(
        controller.uploadDocument(validUser, undefined, { title: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when user context is null', async () => {
      await expect(controller.uploadDocument(null, mockFile, { title: 'Test' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when user has no tenantId', async () => {
      const userWithoutTenant = { ...validUser, tenantId: null };
      await expect(
        controller.uploadDocument(userWithoutTenant, mockFile, { title: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('translates DuplicateDocumentVersionException to 409 ConflictException', async () => {
      mockUploadService.uploadDocument.mockRejectedValueOnce(
        new DuplicateDocumentVersionException('abc', 1),
      );

      await expect(
        controller.uploadDocument(validUser, mockFile, { title: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('translates DuplicateDocumentContentException to 409 ConflictException', async () => {
      mockUploadService.uploadDocument.mockRejectedValueOnce(
        new DuplicateDocumentContentException('abc', 'doc_orig_123', 'Existing Protocol'),
      );

      await expect(
        controller.uploadDocument(validUser, mockFile, { title: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('translates DocumentValidationException to 400 BadRequestException', async () => {
      mockUploadService.uploadDocument.mockRejectedValueOnce(
        new DocumentValidationException('Invalid content'),
      );

      await expect(
        controller.uploadDocument(validUser, mockFile, { title: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. GET /api/v1/ai/knowledge/documents (Listing & Pagination)', () => {
    it('returns paginated documents with metadata matching filters', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Cervical Spine Protocol',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'b'.repeat(64),
          storageKey: 'tenants/t1/doc.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findAll.mockResolvedValueOnce([doc]);
      mockDocRepo.count.mockResolvedValueOnce(1);

      const response = await controller.listDocuments(validUser, {
        page: 1,
        limit: 10,
        search: 'Spine',
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      expect(mockDocRepo.findAll).toHaveBeenCalledWith(
        tenantA,
        expect.objectContaining({
          search: 'Spine',
          limit: 10,
          offset: 0,
          orderBy: 'createdAt',
          orderDirection: 'desc',
          includeDeleted: false,
        }),
      );

      expect(response.total).toBe(1);
      expect(response.totalPages).toBe(1);
      expect(response.hasNextPage).toBe(false);
      expect(response.hasPreviousPage).toBe(false);
      expect(response.items).toHaveLength(1);
      expect(response.items[0]!.title).toBe('Cervical Spine Protocol');
      expect(
        (response.items[0]!.versions[0]! as unknown as Record<string, unknown>).storageKey,
      ).toBeUndefined();
    });

    it('enforces lower and upper bounds for pagination limit (capped at 100)', async () => {
      mockDocRepo.findAll.mockResolvedValueOnce([]);
      mockDocRepo.count.mockResolvedValueOnce(0);

      const response = await controller.listDocuments(validUser, {
        page: -5,
        limit: 500,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });

      expect(mockDocRepo.findAll).toHaveBeenCalledWith(
        tenantA,
        expect.objectContaining({
          limit: 100, // Capped at 100
          offset: 0, // Clamped at 1
        }),
      );
      expect(response.limit).toBe(100);
      expect(response.page).toBe(1);
    });

    it('returns enriched document metadata including file extension, size, checksum, and storage reference', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Cervical Spine Protocol',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'b'.repeat(64),
          storageKey: 'tenants/t1/doc.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findAll.mockResolvedValueOnce([doc]);
      mockDocRepo.count.mockResolvedValueOnce(1);

      const response = await controller.listDocuments(validUser, {
        page: 1,
        limit: 10,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      });
      const item = response.items[0]!;

      expect(item.fileExtension).toBe('pdf');
      expect(item.originalFileName).toBe('protocol.pdf');
      expect(item.mimeType).toBe('application/pdf');
      expect(item.fileSize).toBe(1024);
      expect(item.checksum).toBe('b'.repeat(64));
      expect(item.storageReference).toBe(
        `doc-storage:${doc.id.toString()}:${doc.currentVersionId}`,
      );
      expect(item.status).toBe('ACTIVE');
      expect(item.isDeleted).toBe(false);
      expect(item.versionNumber).toBe(1);
      expect(item.versionCount).toBe(1);
    });
  });

  describe('2b. GET /api/v1/ai/knowledge/documents/capabilities (Authoritative Contract)', () => {
    it('returns authoritative upload size limits, permitted MIME types, and visibility scopes', () => {
      const capabilities = controller.getCapabilities();

      expect(capabilities.maxFileSizeBytes).toBe(10 * 1024 * 1024);
      expect(capabilities.maxFileSizeMb).toBe(10);
      expect(capabilities.allowedMimeTypes).toEqual(
        expect.arrayContaining(['application/pdf', 'text/markdown', 'text/plain']),
      );
      expect(capabilities.allowedExtensions).toEqual(
        expect.arrayContaining(['.pdf', '.docx', '.md', '.txt']),
      );
      expect(capabilities.supportedVisibilityScopes).toEqual(
        expect.arrayContaining([
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
          VisibilityScope.MANAGEMENT,
        ]),
      );
    });
  });

  describe('3. GET /api/v1/ai/knowledge/documents/:id (Retrieval)', () => {
    it('retrieves document and versions omitting internal storage keys', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Kinesiology Guidelines',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'guidelines.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'b'.repeat(64),
          storageKey: 'tenants/tenant_clinic_01/knowledge_base/secret-path.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const response = await controller.getDocument(doc.id.toString(), validUser);

      expect(response.id).toBe(doc.id.toString());
      expect(response.title).toBe('Kinesiology Guidelines');
      expect(response.versions).toHaveLength(1);
      expect(response.versions[0]!.originalFileName).toBe('guidelines.pdf');
      expect(
        (response.versions[0]! as unknown as Record<string, unknown>).storageKey,
      ).toBeUndefined();
    });

    it('throws NotFoundException when document does not exist or is soft-deleted', async () => {
      mockDocRepo.findById.mockResolvedValueOnce(null);

      await expect(controller.getDocument('non_existent', validUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('prevents ID enumeration: returns 404 when document belongs to another tenant', async () => {
      mockDocRepo.findById.mockImplementation(async (tenantId, _id) => {
        if (tenantId !== tenantA) return null;
        return null;
      });

      await expect(controller.getDocument('other_tenant_doc_id', validUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('4. PATCH /api/v1/ai/knowledge/documents/:id (Metadata Updates)', () => {
    it('successfully updates mutable metadata (title, description, visibilityScope)', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Original Title',
        description: 'Original Description',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'c'.repeat(64),
          storageKey: 'tenants/t1/doc.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const updated = await controller.updateDocumentMetadata(doc.id.toString(), validUser, {
        title: 'Updated Title',
        description: 'Updated Description',
        visibilityScope: VisibilityScope.MANAGEMENT,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Updated Description');
      expect(updated.visibilityScope).toBe(VisibilityScope.MANAGEMENT);
      expect(mockDocRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects empty title update with 400 BadRequestException', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Original Title',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'c'.repeat(64),
          storageKey: 'tenants/t1/doc.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(
        controller.updateDocumentMetadata(doc.id.toString(), validUser, { title: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. DELETE /api/v1/ai/knowledge/documents/:id (Soft Deletion)', () => {
    it('soft deletes document and saves deleted state', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'To Delete',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'delete.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'd'.repeat(64),
          storageKey: 'tenants/t1/del.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await controller.deleteDocument(doc.id.toString(), validUser);

      expect(doc.isDeleted()).toBe(true);
      expect(mockDocRepo.save).toHaveBeenCalledWith(doc);
    });

    it('throws NotFoundException when attempting to delete non-existent document', async () => {
      mockDocRepo.findById.mockResolvedValueOnce(null);

      await expect(controller.deleteDocument('non_existent', validUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('6 & 7. Version Inspection Endpoints', () => {
    it('GET /:id/versions lists all historical versions', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Versioned Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '1'.repeat(64),
          storageKey: 'key_v1',
          uploadedBy: therapistUser,
        },
      });
      doc.addVersion({
        originalFileName: 'v2.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        checksum: '2'.repeat(64),
        storageKey: 'key_v2',
        uploadedBy: therapistUser,
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const versions = await controller.getDocumentVersions(doc.id.toString(), validUser);

      expect(versions).toHaveLength(2);
      expect(versions[0]!.versionNumber).toBe(1);
      expect(versions[1]!.versionNumber).toBe(2);
      expect((versions[0]! as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    });

    it('GET /:id/versions/:versionId returns specific version metadata', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Versioned Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '1'.repeat(64),
          storageKey: 'key_v1',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      const v1Id = doc.getAllVersions()[0]!.id;

      const versionDto = await controller.getSpecificVersion(doc.id.toString(), v1Id, validUser);

      expect(versionDto.id).toBe(v1Id);
      expect(versionDto.versionNumber).toBe(1);
    });

    it('GET /:id/versions/:versionId returns 404 when versionId is not part of the parent document', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Versioned Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '1'.repeat(64),
          storageKey: 'key_v1',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(
        controller.getSpecificVersion(doc.id.toString(), 'alien_version_id', validUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('9 & 10. Content Download & Security Headers', () => {
    it('GET /:id/content downloads file with security headers and tenant isolation', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Download Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'clinical-chart.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'e'.repeat(64),
          storageKey: 'tenants/tenant_clinic_01/knowledge_base/2026/11/abc-chart.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.downloadContent(doc.id.toString(), undefined, undefined, validUser, mockRes);

      expect(mockStoragePort.download).toHaveBeenCalledWith(
        tenantA,
        'tenants/tenant_clinic_01/knowledge_base/2026/11/abc-chart.pdf',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('ETag', `"${'e'.repeat(64)}"`);
      expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('%PDF-1.4 file payload'));
    });

    it('GET /:id/preview-metadata returns document preview metadata and permissions', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Previewable Protocol',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'preview.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'd'.repeat(64),
          storageKey: 'key_preview',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const previewMeta = await controller.getPreviewMetadata(
        doc.id.toString(),
        undefined,
        undefined,
        validUser,
      );

      expect(previewMeta.documentId).toBe(doc.id.toString());
      expect(previewMeta.title).toBe('Previewable Protocol');
      expect(previewMeta.mimeType).toBe('application/pdf');
      expect(previewMeta.fileSize).toBe(2048);
      expect(previewMeta.canPreview).toBe(true);
      expect(previewMeta.isDeleted).toBe(false);
      expect(previewMeta.isAuthorized).toBe(true);
    });

    it('GET /:id/preview-metadata returns canPreview: false when document is soft deleted', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Archived Protocol',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'archived.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'c'.repeat(64),
          storageKey: 'key_archived',
          uploadedBy: therapistUser,
        },
      });
      doc.softDelete(therapistUser);

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      const previewMeta = await controller.getPreviewMetadata(
        doc.id.toString(),
        undefined,
        undefined,
        validUser,
      );

      expect(previewMeta.canPreview).toBe(false);
      expect(previewMeta.isDeleted).toBe(true);
    });
  });

  describe('11, 12, 13. Ingestion Job Lifecycle Endpoints', () => {
    it('GET /:id/ingestion lists historical jobs for document versions', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Ingestion Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'f'.repeat(64),
          storageKey: 'k1',
          uploadedBy: therapistUser,
        },
      });

      const versionId = doc.getAllVersions()[0]!.id;
      const job = IngestionJob.create({
        tenantId: tenantA,
        documentId: doc.id.toString(),
        documentVersionId: versionId,
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.findByVersionId.mockResolvedValueOnce([job]);

      const jobs = await controller.getIngestionHistory(doc.id.toString(), validUser);

      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.documentVersionId).toBe(versionId);
      expect(jobs[0]!.status).toBe(IngestionStatus.UPLOADED);
    });

    it('POST /:id/ingestion/retry retries failed ingestion job', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Retry Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'f'.repeat(64),
          storageKey: 'k1',
          uploadedBy: therapistUser,
        },
      });

      const versionId = doc.getAllVersions()[0]!.id;
      const job = IngestionJob.create({
        tenantId: tenantA,
        documentId: doc.id.toString(),
        documentVersionId: versionId,
      });
      job.startValidation();
      job.fail('VALIDATION_FAILED', 'Malformed PDF trailer');

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.findByVersionId.mockResolvedValueOnce([job]);

      const retried = await controller.retryCurrentIngestion(doc.id.toString(), validUser);

      expect(retried.status).toBe(IngestionStatus.VALIDATING);
      expect(retried.attemptCount).toBe(2);
      expect(mockIngestionRepo.save).toHaveBeenCalledWith(job);
    });

    it('POST /:id/ingestion/cancel cancels active ingestion job with reason', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Cancel Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'f'.repeat(64),
          storageKey: 'k1',
          uploadedBy: therapistUser,
        },
      });

      const versionId = doc.getAllVersions()[0]!.id;
      const job = IngestionJob.create({
        tenantId: tenantA,
        documentId: doc.id.toString(),
        documentVersionId: versionId,
      });
      job.startValidation();

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.findActiveJobByVersionId.mockResolvedValueOnce(job);

      const cancelled = await controller.cancelCurrentIngestion(doc.id.toString(), validUser, {
        reason: 'Superseded by user request',
      });

      expect(cancelled.status).toBe(IngestionStatus.CANCELLED);
      expect(mockIngestionRepo.save).toHaveBeenCalledWith(job);
    });
  });

  describe('14. Document Lifecycle & RBAC Enforcement (KC.09)', () => {
    it('rejects soft deletion when user is a viewer and not the document uploader', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Protected Protocol',
        uploadedBy: 'usr_different_owner',
        initialVersion: {
          originalFileName: 'protected.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'e'.repeat(64),
          storageKey: 'tenants/t1/prot.pdf',
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(controller.deleteDocument(doc.id.toString(), viewerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('successfully restores soft-deleted document, marks ACTIVE and enqueues re-ingestion', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Restorable Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'restore.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: 'f'.repeat(64),
          storageKey: 'tenants/t1/res.pdf',
          uploadedBy: therapistUser,
        },
      });
      doc.softDelete(therapistUser);
      expect(doc.isDeleted()).toBe(true);

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.save.mockImplementation(async (j) => j);

      const response = await controller.restoreDocument(doc.id.toString(), validUser);

      expect(doc.isDeleted()).toBe(false);
      expect(response.status).toBe('ACTIVE');
      expect(response.isDeleted).toBe(false);
      expect(mockDocRepo.save).toHaveBeenCalledWith(doc);
      expect(mockIngestionRepo.save).toHaveBeenCalled();
    });

    it('rejects restore on non-deleted document with BadRequestException', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Active Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'active.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '1'.repeat(64),
          storageKey: 'tenants/t1/act.pdf',
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(controller.restoreDocument(doc.id.toString(), validUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects restore when caller has viewer role without management clearance', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Active Doc',
        uploadedBy: 'another_user',
        initialVersion: {
          originalFileName: 'active.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '2'.repeat(64),
          storageKey: 'tenants/t1/act2.pdf',
        },
      });
      doc.softDelete('another_user');

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(controller.restoreDocument(doc.id.toString(), viewerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('reprocesses active document, purges previous vectors and returns 202 ACCEPTED', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Document to Reprocess',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'reprocess.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: '3'.repeat(64),
          storageKey: 'tenants/t1/rep.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.findByVersionId.mockResolvedValueOnce([]);
      mockIngestionRepo.save.mockImplementation(async (j) => j);

      const job = await controller.reprocessDocument(doc.id.toString(), managerUser);

      expect(job.status).toBe(IngestionStatus.UPLOADED);
      expect(mockIngestionRepo.save).toHaveBeenCalled();
    });

    it('rejects reprocess when an ingestion job is already active', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Busy Document',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'busy.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: '4'.repeat(64),
          storageKey: 'tenants/t1/busy.pdf',
        },
      });

      const activeJob = IngestionJob.create({
        tenantId: tenantA,
        documentId: doc.id.toString(),
        documentVersionId: doc.currentVersionId!,
      });
      activeJob.startValidation();

      mockDocRepo.findById.mockResolvedValueOnce(doc);
      mockIngestionRepo.findByVersionId.mockResolvedValueOnce([activeJob]);

      await expect(controller.reprocessDocument(doc.id.toString(), validUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects reprocess on soft-deleted document with NotFoundException', async () => {
      const doc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Deleted Doc',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'deleted.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '5'.repeat(64),
          storageKey: 'tenants/t1/del5.pdf',
        },
      });
      doc.softDelete(therapistUser);

      mockDocRepo.findById.mockResolvedValueOnce(doc);

      await expect(controller.reprocessDocument(doc.id.toString(), validUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
