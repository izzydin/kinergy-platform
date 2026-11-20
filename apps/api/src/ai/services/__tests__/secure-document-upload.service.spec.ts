import { SecureDocumentUploadService, UploadDocumentDto } from '../secure-document-upload.service';
import { DocumentContentValidatorService } from '../document-content-validator.service';
import { ObjectStoragePort } from '../../../platform/storage/ports/object-storage.port';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  DocumentNotFoundException,
  DuplicateDocumentVersionException,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../../config/ai.config';

describe('SecureDocumentUploadService (Unit & Consistency)', () => {
  let uploadService: SecureDocumentUploadService;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockIngestionRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let validator: DocumentContentValidatorService;

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  );

  const tenantA = 'tenant_clinic_01';
  const therapistUser = 'usr_therapist_42';

  beforeEach(() => {
    mockStoragePort = {
      upload: jest
        .fn()
        .mockImplementation(async (tenantId, domainFolder, filename, buffer, mimeType) => ({
          key: `tenants/${tenantId}/${domainFolder}/2026/11/mock-uuid-${filename}`,
          tenantId,
          domainFolder,
          filename,
          mimeType,
          sizeBytes: buffer.length,
          createdAt: new Date(),
          lastModified: new Date(),
        })),
      download: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

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

    validator = new DocumentContentValidatorService({
      ...DEFAULT_AI_CONFIG,
      maxDocumentSizeBytes: 10 * 1024 * 1024,
    });

    uploadService = new SecureDocumentUploadService(
      mockStoragePort,
      mockDocRepo,
      mockIngestionRepo,
      validator,
    );
  });

  describe('Scenario 1: Initial Knowledge Document Upload', () => {
    it('successfully uploads document, persists version and creates IngestionJob in UPLOADED status', async () => {
      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'cervical-spine-protocol.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
        title: 'Cervical Spine Protocol',
        description: 'Standard protocol for evaluation',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      };

      const result = await uploadService.uploadDocument(input);

      // Verify Object Storage interaction
      expect(mockStoragePort.upload).toHaveBeenCalledTimes(1);
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        tenantA,
        'knowledge_base',
        'cervical-spine-protocol.pdf',
        validPdfBuffer,
        'application/pdf',
      );

      // Verify Document Persistence
      expect(mockDocRepo.save).toHaveBeenCalledTimes(1);
      const savedDoc = mockDocRepo.save.mock.calls[0]![0];
      expect(savedDoc.tenantId).toBe(tenantA);
      expect(savedDoc.title).toBe('Cervical Spine Protocol');
      expect(savedDoc.visibilityScope).toBe(VisibilityScope.CLINICAL_STAFF);
      expect(savedDoc.getAllVersions()).toHaveLength(1);
      expect(savedDoc.getAllVersions()[0]!.versionNumber).toBe(1);

      // Verify IngestionJob persistence
      expect(mockIngestionRepo.save).toHaveBeenCalledTimes(1);
      const savedJob = mockIngestionRepo.save.mock.calls[0]![0];
      expect(savedJob.status).toBe(IngestionStatus.UPLOADED);
      expect(savedJob.documentVersionId).toBe(savedDoc.getAllVersions()[0]!.id);

      // Verify Returned DTO excludes internal storage keys
      expect(result.documentId).toBe(savedDoc.id.toString());
      expect(result.versionNumber).toBe(1);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.ingestionStatus).toBe(IngestionStatus.UPLOADED);
      expect((result as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    });
  });

  describe('Scenario 2: Subsequent Version Upload', () => {
    it('creates version 2 on an existing document while preserving version 1', async () => {
      // Create existing document with v1
      const existingDoc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Exercise Guidelines',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'guidelines-v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          checksum: '1111111111111111111111111111111111111111111111111111111111111111',
          storageKey: 'tenants/tenantA/knowledge_base/v1.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(existingDoc);

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        documentId: existingDoc.id.toString(),
        file: {
          originalFileName: 'guidelines-v2.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      const result = await uploadService.uploadDocument(input);

      expect(result.versionNumber).toBe(2);
      expect(existingDoc.getAllVersions()).toHaveLength(2);
      expect(existingDoc.getAllVersions()[0]!.versionNumber).toBe(1);
      expect(existingDoc.getAllVersions()[1]!.versionNumber).toBe(2);
      expect(mockDocRepo.save).toHaveBeenCalledWith(existingDoc);
    });
  });

  describe('Scenario 13: Duplicate Checksum Detection', () => {
    it('rejects version upload when identical content checksum already exists in the document', async () => {
      const v1Checksum = validator.validate({
        buffer: validPdfBuffer,
        originalFileName: 'test.pdf',
      }).checksum;

      const existingDoc = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Manual',
        uploadedBy: therapistUser,
        initialVersion: {
          originalFileName: 'manual-v1.pdf',
          mimeType: 'application/pdf',
          fileSize: validPdfBuffer.length,
          checksum: v1Checksum,
          storageKey: 'tenants/tenantA/knowledge_base/v1.pdf',
          uploadedBy: therapistUser,
        },
      });

      mockDocRepo.findById.mockResolvedValueOnce(existingDoc);

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        documentId: existingDoc.id.toString(),
        file: {
          originalFileName: 'manual-identical.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        DuplicateDocumentVersionException,
      );

      // Verify storage was never touched
      expect(mockStoragePort.upload).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 14: Compensating Storage Deletion on Persistence Failure', () => {
    it('deletes uploaded storage file when database document save fails', async () => {
      const generatedStorageKey = 'tenants/tenant_clinic_01/knowledge_base/2026/11/abc-doc.pdf';
      mockStoragePort.upload.mockResolvedValueOnce({
        key: generatedStorageKey,
        tenantId: tenantA,
        domainFolder: 'knowledge_base',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: validPdfBuffer.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });

      // Simulate database crash during document save
      mockDocRepo.save.mockRejectedValueOnce(
        new Error('PostgreSQL connection terminated unexpectedly (deadlock)'),
      );

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        'PostgreSQL connection terminated unexpectedly (deadlock)',
      );

      // Verify compensating delete was triggered immediately with the exact key
      expect(mockStoragePort.delete).toHaveBeenCalledTimes(1);
      expect(mockStoragePort.delete).toHaveBeenCalledWith(tenantA, generatedStorageKey);
    });

    it('deletes uploaded storage file when IngestionJob save fails', async () => {
      const generatedStorageKey = 'tenants/tenant_clinic_01/knowledge_base/2026/11/abc-doc2.pdf';
      mockStoragePort.upload.mockResolvedValueOnce({
        key: generatedStorageKey,
        tenantId: tenantA,
        domainFolder: 'knowledge_base',
        filename: 'doc2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: validPdfBuffer.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });

      // Document save succeeds, but IngestionJob save fails
      mockIngestionRepo.save.mockRejectedValueOnce(new Error('Ingestion table unique violation'));

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'doc2.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        'Ingestion table unique violation',
      );

      expect(mockStoragePort.delete).toHaveBeenCalledTimes(1);
      expect(mockStoragePort.delete).toHaveBeenCalledWith(tenantA, generatedStorageKey);
    });
  });

  describe('Storage Failure Handling', () => {
    it('does not touch database when object storage upload fails', async () => {
      mockStoragePort.upload.mockRejectedValueOnce(
        new Error('S3 503 SlowDown / Service Unavailable'),
      );

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        'S3 503 SlowDown / Service Unavailable',
      );

      expect(mockDocRepo.save).not.toHaveBeenCalled();
      expect(mockIngestionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Identity & Tenant Boundary Enforcement', () => {
    it('rejects upload when tenantId is missing', async () => {
      const input: UploadDocumentDto = {
        tenantId: '',
        uploadedBy: therapistUser,
        file: {
          originalFileName: 'doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        UnauthorizedDocumentAccessException,
      );
    });

    it('rejects upload when uploadedBy is missing', async () => {
      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: '',
        file: {
          originalFileName: 'doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(
        UnauthorizedDocumentAccessException,
      );
    });

    it('throws DocumentNotFoundException when documentId does not exist in tenant', async () => {
      mockDocRepo.findById.mockResolvedValueOnce(null);

      const input: UploadDocumentDto = {
        tenantId: tenantA,
        uploadedBy: therapistUser,
        documentId: 'non_existent_doc',
        file: {
          originalFileName: 'doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBuffer,
          size: validPdfBuffer.length,
        },
      };

      await expect(uploadService.uploadDocument(input)).rejects.toThrow(DocumentNotFoundException);
    });
  });
});
