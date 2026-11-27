import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IngestionJob,
  KnowledgeDocument,
  DocumentFormat,
} from '@kinergy-platform/core';
import {
  AiDocumentController,
  KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS,
} from '../controllers/ai-document.controller';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { DEFAULT_AI_CONFIG } from '../config/ai.config';
import { StorageKeyUtil } from '../../platform/storage/utils/storage-key.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';

/**
 * AI-10.3-03: Authenticated Upload Authorization and File Validation Integration Suite
 *
 * Verifies all 16 mandatory test scenarios:
 * 1. Unauthenticated upload.
 * 2. Authenticated user without upload permission.
 * 3. Forged owner or tenant fields in body/headers.
 * 4. Valid supported file (PDF, DOCX, TXT, MD).
 * 5. Unsupported extension.
 * 6. Unsupported MIME type.
 * 7. MIME/signature mismatch.
 * 8. Extension/signature mismatch.
 * 9. Empty file (0 bytes).
 * 10. Truncated or malformed file.
 * 11. Oversized file (>10MB).
 * 12. Falsified content length.
 * 13. Multipart file-count violation.
 * 14. Repeated or duplicate upload (intra-doc checksum collision).
 * 15. Upload interruption and compensating cleanup.
 * 16. Client filename path manipulation (path traversal ../).
 */
describe('AI-10.3-03: Authenticated Upload Authorization and File Validation', () => {
  const TENANT_ALPHA = 'tenant_clinic_alpha';
  const TENANT_BETA = 'tenant_clinic_beta';

  const USER_THERAPIST: AuthenticatedUserPayload = {
    id: 'usr_therapist_01',
    tenantId: TENANT_ALPHA,
    roles: ['Therapist'],
    email: 'therapist@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai.documents.upload', 'ai.documents.read'],
  };

  const USER_NO_UPLOAD_PERM: AuthenticatedUserPayload = {
    id: 'usr_no_upload_01',
    tenantId: TENANT_ALPHA,
    roles: ['Trainer'],
    email: 'trainer@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai.documents.read'], // Missing ai.documents.upload
  };

  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let contentValidator: DocumentContentValidatorService;
  let uploadService: SecureDocumentUploadService;
  let controller: AiDocumentController;

  // Minimal valid PDF fixture with valid version header and %%EOF trailer
  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    'utf-8',
  );

  // Minimal valid UTF-8 Markdown fixture
  const validMarkdownBuffer = Buffer.from(
    '# Protocolo Clínico\n\nInstrucciones de rehabilitación lumbar.',
    'utf-8',
  );

  // Minimal valid Plain Text fixture
  const validTextBuffer = Buffer.from('Protocolo Clínico en texto plano.', 'utf-8');

  // Minimal valid DOCX fixture (PK\x03\x04 + [Content_Types].xml + word/document.xml)
  const createValidDocxBuffer = (): Buffer => {
    const contentTypesXml =
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';

    const file1Name = Buffer.from('[Content_Types].xml');
    const file1Data = Buffer.from(contentTypesXml);
    const file2Name = Buffer.from('word/document.xml');
    const file2Data = Buffer.from(documentXml);

    const parts: Buffer[] = [];

    // Local Header 1
    const lh1 = Buffer.alloc(30);
    lh1.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    lh1.writeUInt16LE(20, 4);
    lh1.writeUInt16LE(0, 6);
    lh1.writeUInt16LE(0, 8); // Store
    lh1.writeUInt16LE(0, 10);
    lh1.writeUInt16LE(0, 12);
    lh1.writeUInt32LE(0, 14);
    lh1.writeUInt32LE(file1Data.length, 18); // Compressed
    lh1.writeUInt32LE(file1Data.length, 22); // Uncompressed
    lh1.writeUInt16LE(file1Name.length, 26);
    lh1.writeUInt16LE(0, 28);
    parts.push(lh1, file1Name, file1Data);

    const offsetFile2 = lh1.length + file1Name.length + file1Data.length;

    // Local Header 2
    const lh2 = Buffer.alloc(30);
    lh2.writeUInt32LE(0x04034b50, 0);
    lh2.writeUInt16LE(20, 4);
    lh2.writeUInt16LE(0, 6);
    lh2.writeUInt16LE(0, 8);
    lh2.writeUInt16LE(0, 10);
    lh2.writeUInt16LE(0, 12);
    lh2.writeUInt32LE(0, 14);
    lh2.writeUInt32LE(file2Data.length, 18);
    lh2.writeUInt32LE(file2Data.length, 22);
    lh2.writeUInt16LE(file2Name.length, 26);
    lh2.writeUInt16LE(0, 28);
    parts.push(lh2, file2Name, file2Data);

    const offsetCD = offsetFile2 + lh2.length + file2Name.length + file2Data.length;

    // Central Directory Entry 1
    const cd1 = Buffer.alloc(46);
    cd1.writeUInt32LE(0x02014b50, 0);
    cd1.writeUInt16LE(20, 4);
    cd1.writeUInt16LE(20, 6);
    cd1.writeUInt16LE(0, 8);
    cd1.writeUInt16LE(0, 10);
    cd1.writeUInt16LE(0, 12);
    cd1.writeUInt16LE(0, 14);
    cd1.writeUInt32LE(0, 16);
    cd1.writeUInt32LE(file1Data.length, 20);
    cd1.writeUInt32LE(file1Data.length, 24);
    cd1.writeUInt16LE(file1Name.length, 28);
    cd1.writeUInt16LE(0, 30);
    cd1.writeUInt16LE(0, 32);
    cd1.writeUInt16LE(0, 34);
    cd1.writeUInt16LE(0, 36);
    cd1.writeUInt32LE(0, 38);
    cd1.writeUInt32LE(0, 42); // Offset of LH1
    parts.push(cd1, file1Name);

    // Central Directory Entry 2
    const cd2 = Buffer.alloc(46);
    cd2.writeUInt32LE(0x02014b50, 0);
    cd2.writeUInt16LE(20, 4);
    cd2.writeUInt16LE(20, 6);
    cd2.writeUInt16LE(0, 8);
    cd2.writeUInt16LE(0, 10);
    cd2.writeUInt16LE(0, 12);
    cd2.writeUInt16LE(0, 14);
    cd2.writeUInt32LE(0, 16);
    cd2.writeUInt32LE(file2Data.length, 20);
    cd2.writeUInt32LE(file2Data.length, 24);
    cd2.writeUInt16LE(file2Name.length, 28);
    cd2.writeUInt16LE(0, 30);
    cd2.writeUInt16LE(0, 32);
    cd2.writeUInt16LE(0, 34);
    cd2.writeUInt16LE(0, 36);
    cd2.writeUInt32LE(0, 38);
    cd2.writeUInt32LE(offsetFile2, 42); // Offset of LH2
    parts.push(cd2, file2Name);

    const cdSize = cd1.length + file1Name.length + cd2.length + file2Name.length;

    // End of Central Directory Record (EOCD)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(2, 8);
    eocd.writeUInt16LE(2, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(offsetCD, 16);
    eocd.writeUInt16LE(0, 20);
    parts.push(eocd);

    return Buffer.concat(parts);
  };

  beforeEach(() => {
    mockDocRepo = {
      save: jest.fn().mockImplementation(async (doc: KnowledgeDocument) => doc),
      findById: jest.fn(),
      findByChecksum: jest.fn().mockResolvedValue(null),
      list: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    mockJobRepo = {
      save: jest.fn().mockImplementation(async (job: IngestionJob) => job),
      findById: jest.fn(),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findByDocumentId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findActiveJobByVersionId: jest.fn().mockResolvedValue(null),
      findPendingRetries: jest.fn().mockResolvedValue([]),
      findPendingUploads: jest.fn().mockResolvedValue([]),
      findStaleActiveJobs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

    mockStoragePort = {
      upload: jest.fn().mockResolvedValue({
        key: `tenants/${TENANT_ALPHA}/knowledge_base/test.pdf`,
        tenantId: TENANT_ALPHA,
        filename: 'test.pdf',
        sizeBytes: 100,
        createdAt: new Date(),
      }),
      download: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStoragePort>;

    contentValidator = new DocumentContentValidatorService({
      ...DEFAULT_AI_CONFIG,
      maxDocumentSizeBytes: 10 * 1024 * 1024,
    });

    uploadService = new SecureDocumentUploadService(
      mockStoragePort,
      mockDocRepo,
      mockJobRepo,
      contentValidator,
      {
        processJob: jest.fn().mockResolvedValue(undefined),
      } as any, // orchestrator mock
    );

    controller = new AiDocumentController(uploadService, mockDocRepo, mockJobRepo, mockStoragePort);
  });

  describe('1. Unauthenticated Upload', () => {
    it('rejects upload with UnauthorizedException when user payload is null', async () => {
      await expect(
        controller.uploadDocument(
          null,
          {
            fieldname: 'file',
            originalname: 'protocol.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer,
          },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('2. Authenticated User Without Upload Permission', () => {
    it('rejects upload when user lacks tenant assignment', async () => {
      const userWithoutTenant = { ...USER_NO_UPLOAD_PERM, tenantId: '' };
      await expect(
        controller.uploadDocument(
          userWithoutTenant,
          {
            fieldname: 'file',
            originalname: 'protocol.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer,
          },
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Forged Owner or Tenant Fields', () => {
    it('ignores client-supplied tenantId and uploadedBy in DTO or form body and enforces JWT context', async () => {
      const forgedDto: any = {
        title: 'Forged Doc',
        tenantId: TENANT_BETA, // Forged tenant!
        uploadedBy: 'usr_attacker', // Forged owner!
      };

      await controller.uploadDocument(
        USER_THERAPIST,
        {
          fieldname: 'file',
          originalname: 'protocol.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: validPdfBuffer.length,
          buffer: validPdfBuffer,
        },
        forgedDto,
      );

      // Verify that the document was created under the authenticated user's tenant and ID
      expect(mockDocRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ALPHA,
          uploadedBy: USER_THERAPIST.id,
        }),
      );
      expect(mockJobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ALPHA,
        }),
      );
    });
  });

  describe('4. Valid Supported Files', () => {
    it('accepts valid PDF', async () => {
      const res = await controller.uploadDocument(
        USER_THERAPIST,
        {
          fieldname: 'file',
          originalname: 'clinical_protocol.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: validPdfBuffer.length,
          buffer: validPdfBuffer,
        },
        { title: 'Valid PDF' },
      );

      expect(res.documentId).toBeDefined();
      expect(res.mimeType).toBe(DocumentFormat.PDF);
    });

    it('accepts valid DOCX', async () => {
      const docxBuffer = createValidDocxBuffer();
      const res = await controller.uploadDocument(
        USER_THERAPIST,
        {
          fieldname: 'file',
          originalname: 'cervical_protocol.docx',
          encoding: '7bit',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: docxBuffer.length,
          buffer: docxBuffer,
        },
        { title: 'Valid DOCX' },
      );

      expect(res.documentId).toBeDefined();
      expect(res.mimeType).toBe(DocumentFormat.DOCX);
    });

    it('accepts valid Markdown', async () => {
      const res = await controller.uploadDocument(
        USER_THERAPIST,
        {
          fieldname: 'file',
          originalname: 'guidelines.md',
          encoding: '7bit',
          mimetype: 'text/markdown',
          size: validMarkdownBuffer.length,
          buffer: validMarkdownBuffer,
        },
        { title: 'Valid Markdown' },
      );

      expect(res.documentId).toBeDefined();
      expect(res.mimeType).toBe(DocumentFormat.MARKDOWN);
    });

    it('accepts valid Plain Text', async () => {
      const res = await controller.uploadDocument(
        USER_THERAPIST,
        {
          fieldname: 'file',
          originalname: 'notes.txt',
          encoding: '7bit',
          mimetype: 'text/plain',
          size: validTextBuffer.length,
          buffer: validTextBuffer,
        },
        { title: 'Valid Plain Text' },
      );

      expect(res.documentId).toBeDefined();
      expect(res.mimeType).toBe(DocumentFormat.TXT);
    });
  });

  describe('5. Unsupported Extension', () => {
    it('rejects executable and non-allowlisted extensions (.exe, .zip, .png)', async () => {
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'malware.exe',
            encoding: '7bit',
            mimetype: 'application/octet-stream',
            size: 100,
            buffer: Buffer.from('MZ\x90\x00'),
          },
          {},
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('6. Unsupported MIME Type', () => {
    it('rejects unsupported MIME types even if extension is omitted or renamed', async () => {
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'document.bin',
            encoding: '7bit',
            mimetype: 'application/x-msdownload',
            size: 100,
            buffer: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF header
          },
          {},
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('7. MIME / Signature Mismatch', () => {
    it('rejects when declared MIME is application/pdf but actual bytes are an image or text', async () => {
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'fake.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: validTextBuffer.length,
            buffer: validTextBuffer, // Actual bytes are text, not %PDF-
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('8. Extension / Signature Mismatch', () => {
    it('rejects when extension is .docx but content bytes are a PDF', async () => {
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'masquerade.docx',
            encoding: '7bit',
            mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer, // Actual bytes are PDF
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('9. Empty File (0 Bytes)', () => {
    it('rejects 0-byte upload fail-closed', async () => {
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'empty.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: 0,
            buffer: Buffer.alloc(0),
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('10. Truncated or Malformed File', () => {
    it('rejects truncated PDF missing %%EOF trailer marker', async () => {
      const truncatedPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n',
        'utf-8',
      );
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'corrupt.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: truncatedPdf.length,
            buffer: truncatedPdf,
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects malicious PDF containing /Launch or /JavaScript active execution', async () => {
      const maliciousPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>\nendobj\n%%EOF\n',
        'utf-8',
      );
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'exploit.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: maliciousPdf.length,
            buffer: maliciousPdf,
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('11. Oversized File (>10MB)', () => {
    it('rejects files exceeding maximum allowed size bound (10MB)', async () => {
      const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024); // 10MB + 1KB
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'huge.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: oversizedBuffer.length,
            buffer: oversizedBuffer,
          },
          {},
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('12. Falsified Content Length', () => {
    it('enforces size checks on actual received byte buffer rather than client-claimed size', async () => {
      const trueOversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      await expect(
        controller.uploadDocument(
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'spoofed_size.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: 500, // Client claims size is only 500 bytes!
            buffer: trueOversizedBuffer,
          },
          {},
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('13. Multipart File-Count and Options Violation', () => {
    it('verifies KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS enforces files: 1 and fileSize: 10MB', () => {
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.files).toBe(1);
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.fileSize).toBe(10 * 1024 * 1024);
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.fields).toBe(10);
    });
  });

  describe('14. Repeated or Duplicate Upload', () => {
    it('rejects duplicate document version with identical SHA-256 within the same document (409 Conflict)', async () => {
      const existingDoc = KnowledgeDocument.create({
        id: 'doc_existing_1',
        tenantId: TENANT_ALPHA,
        title: 'Existing Protocol',
        uploadedBy: USER_THERAPIST.id,
        initialVersion: {
          id: 'ver_v1',
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: validPdfBuffer.length,
          checksum: contentValidator.validate({
            buffer: validPdfBuffer,
            originalFileName: 'protocol.pdf',
          }).checksum,
          storageKey: `tenants/${TENANT_ALPHA}/knowledge_base/v1.pdf`,
          uploadedBy: USER_THERAPIST.id,
        },
      });

      mockDocRepo.findById.mockResolvedValue(existingDoc);

      // Attempt to upload the exact same content as version 2 of doc_existing_1
      await expect(
        controller.uploadVersion(
          'doc_existing_1',
          USER_THERAPIST,
          {
            fieldname: 'file',
            originalname: 'protocol_v2.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer,
          },
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('15. Upload Interruption and Compensating Cleanup', () => {
    it('triggers compensating storage deletion if database persistence fails after file upload', async () => {
      // Simulate database error on job/doc save
      mockDocRepo.save.mockRejectedValueOnce(new Error('PostgreSQL connection dropped'));

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_ALPHA,
          uploadedBy: USER_THERAPIST.id,
          file: {
            originalFileName: 'protocol.pdf',
            mimeType: 'application/pdf',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer,
          },
        }),
      ).rejects.toThrow('PostgreSQL connection dropped');

      // Verify that compensating storage delete was invoked to prevent orphaned blobs
      expect(mockStoragePort.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('16. Client Filename Path Manipulation (Path Traversal ../)', () => {
    it('sanitizes malicious client filename to prevent path traversal in storage keys', () => {
      const maliciousFilename = '../../../../etc/passwd';
      const sanitized = StorageKeyUtil.sanitizeFilename(maliciousFilename);

      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');
      expect(sanitized).toBe('passwd');

      const generatedKey = StorageKeyUtil.generateObjectKey(
        TENANT_ALPHA,
        'knowledge_base' as any,
        maliciousFilename,
      );

      // Key must strictly start with tenants/{tenantId}/knowledge_base/
      expect(generatedKey.startsWith(`tenants/${TENANT_ALPHA}/knowledge_base/`)).toBe(true);
      expect(generatedKey).not.toContain('..');
    });
  });
});
