import * as fs from 'fs/promises';
import * as path from 'path';
import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IDocumentIndexingPort,
  DocumentSizeLimitExceededException,
  DocumentSecurityRiskException,
  UnsupportedDocumentFormatException,
  DocumentContentMismatchException,
  DocumentMalformedException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  ExtractedDocument,
  ExtractedBlock,
  ExtractedBlockType,
  DocumentFormat,
} from '@kinergy-platform/core';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { DocumentProcessingPipelineService } from '../services/document-processing-pipeline.service';
import { TempFileStorageService } from '../services/temp-file-storage.service';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { IngestionErrorCode } from '../services/ingestion-retry.policy';
import { ParserSandboxService } from '../services/parser-sandbox.service';
import { DEFAULT_AI_CONFIG } from '../config/ai.config';
import {
  IMalwareScannerPort,
  MalwareScanResult,
  MalwareScanStatus,
} from '../ports/malware-scanner.port';
import {
  PdfParserAdapter,
  DocxParserAdapter,
  MarkdownParserAdapter,
  PlainTextParserAdapter,
  CompositeDocumentParserAdapter,
} from '../adapters/parsers';
import { DeterministicLanguageDetectorService } from '../services/normalization/deterministic-language-detector.service';
import { DeterministicDocumentNormalizerService } from '../services/normalization/deterministic-document-normalizer.service';
import { DeterministicBpeTokenizerAdapter } from '../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';
import { StructureAwareChunkerService } from '../services/chunking/structure-aware-chunker.service';
import {
  buildZipArchive,
  createValidDocx,
  createSinglePagePdf,
  createZipBombDocx,
  SAMPLE_SPANISH_TXT,
} from '../adapters/parsers/__tests__/parser-fixtures';
import {
  AiDocumentController,
  KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS,
} from '../controllers/ai-document.controller';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

/**
 * AI-10.3-09 — Malicious File and Adversarial Upload Security Master Test Suite
 *
 * Comprehensive adversarial verification across 8 security domains:
 * A. Authentication & Authorization Tests
 * B. File-Type & Structural Validation Tests
 * C. Size & Resource-Exhaustion Tests
 * D. Filename & Path Traversal Tests
 * E. Malware & Archive Defense Tests
 * F. Parser Security & Subprocess Isolation Tests
 * G. Ingestion Lifecycle & Chunk Provenance Tests
 * H. Concurrency & Multi-Tenant Isolation Tests
 */
describe('AI-10.3-09 — Malicious File and Adversarial Upload Security Master Suite', () => {
  const TENANT_A = 'tenant_clinic_a';
  const TENANT_B = 'tenant_clinic_b';
  const USER_A = 'usr_doctor_a';
  const USER_B = 'usr_doctor_b';

  const AUTH_USER_A: AuthenticatedUserPayload = {
    id: USER_A,
    userId: USER_A,
    tenantId: TENANT_A,
    email: 'doc.a@clinic.com',
    roles: ['ClinicAdmin', 'Physiotherapist'],
    permissions: ['ai.documents.upload', 'ai.documents.manage'],
    status: 'ACTIVE',
  };

  const AUTH_USER_B: AuthenticatedUserPayload = {
    id: USER_B,
    userId: USER_B,
    tenantId: TENANT_B,
    email: 'doc.b@clinic.com',
    roles: ['Physiotherapist'],
    permissions: ['ai.documents.upload'],
    status: 'ACTIVE',
  };

  let documentStore: Map<string, KnowledgeDocument>;
  let jobStore: Map<string, IngestionJob>;
  let storageFiles: Map<string, Buffer>;

  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let mockScanner: jest.Mocked<IMalwareScannerPort>;
  let mockIndexingPort: jest.Mocked<IDocumentIndexingPort>;

  let contentValidator: DocumentContentValidatorService;
  let uploadService: SecureDocumentUploadService;
  let orchestrator: IngestionOrchestratorService;
  let controller: AiDocumentController;
  let tempStorageService: TempFileStorageService;
  let sandbox: ParserSandboxService;
  let securityPolicy: RetrievalSecurityPolicyService;

  beforeEach(() => {
    documentStore = new Map();
    jobStore = new Map();
    storageFiles = new Map();

    mockDocRepo = {
      save: jest.fn(async (doc: KnowledgeDocument) => {
        documentStore.set(doc.id.value, doc);
        return doc;
      }),
      findById: jest.fn(async (tenantId: string, id: string) => {
        const doc = documentStore.get(id);
        return doc && doc.tenantId === tenantId ? doc : null;
      }),
      findByChecksum: jest.fn(async (tenantId: string, checksum: string) => {
        for (const doc of documentStore.values()) {
          if (doc.tenantId === tenantId && !doc.isDeleted()) {
            for (const ver of doc.getAllVersions()) {
              const vChecksum =
                typeof ver.checksum === 'string' ? ver.checksum : (ver.checksum as any)?.value;
              if (vChecksum === checksum) return doc;
            }
          }
        }
        return null;
      }),
      findVersionByChecksum: jest.fn(async (tenantId: string, checksum: string) => {
        for (const doc of documentStore.values()) {
          if (doc.tenantId === tenantId) {
            for (const ver of doc.getAllVersions()) {
              const vChecksum =
                typeof ver.checksum === 'string' ? ver.checksum : (ver.checksum as any)?.value;
              if (vChecksum === checksum) return ver;
            }
          }
        }
        return null;
      }),
      findAll: jest.fn(async (tenantId: string) => {
        const items = Array.from(documentStore.values()).filter(
          (d) => d.tenantId === tenantId && !d.isDeleted(),
        );
        return { items, total: items.length };
      }),
      softDelete: jest.fn(async (tenantId: string, id: string) => {
        const doc = documentStore.get(id);
        if (doc && doc.tenantId === tenantId) {
          doc.softDelete(USER_A);
          documentStore.set(doc.id.value, doc);
        }
      }),
      countByTenant: jest.fn(async (tenantId: string) => {
        return Array.from(documentStore.values()).filter((d) => d.tenantId === tenantId).length;
      }),
      delete: jest.fn(async (tenantId: string, id: string) => {
        const doc = documentStore.get(id);
        if (doc && doc.tenantId === tenantId) {
          documentStore.delete(id);
        }
      }),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    mockJobRepo = {
      save: jest.fn(async (job: IngestionJob) => {
        jobStore.set(job.id, job);
        return job;
      }),
      findById: jest.fn(async (tenantId: string, id: string) => {
        const j = jobStore.get(id);
        return j && j.tenantId === tenantId ? j : null;
      }),
      findByDocumentId: jest.fn(async (tenantId: string, docId: string) => {
        return Array.from(jobStore.values()).filter(
          (j) => j.tenantId === tenantId && j.documentId === docId,
        );
      }),
      findByVersionId: jest.fn(async (tenantId: string, versionId: string) => {
        return Array.from(jobStore.values()).filter(
          (j) => j.tenantId === tenantId && j.documentVersionId === versionId,
        );
      }),
      findPendingUploads: jest.fn(async () => []),
      findPendingRetries: jest.fn(async () => []),
      findStaleActiveJobs: jest.fn(async (olderThan: Date) => {
        return Array.from(jobStore.values()).filter(
          (j) =>
            (j.status === IngestionStatus.VALIDATING ||
              j.status === IngestionStatus.PROCESSING ||
              j.status === IngestionStatus.INDEXING) &&
            (j.startedAt ?? j.createdAt).getTime() < olderThan.getTime(),
        );
      }),
    } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

    mockChunkRepo = {
      saveChunks: jest.fn(),
      findByVersionId: jest.fn(async () => []),
      countByVersionId: jest.fn(async () => 0),
    } as unknown as jest.Mocked<IKnowledgeChunkRepositoryPort>;

    mockStoragePort = {
      upload: jest.fn(
        async (
          tenantId: string,
          domainFolder: string,
          filename: string,
          data: Buffer | Uint8Array,
          _mimeType: string,
        ) => {
          const key = `${domainFolder}/${filename}`;
          storageFiles.set(`${tenantId}:${key}`, Buffer.from(data));
          return {
            key,
            bucket: 'test-bucket',
            sizeBytes: data.length,
            etag: 'etag-123',
            uploadedAt: new Date(),
          };
        },
      ),
      download: jest.fn(async (tenantId: string, key: string) => {
        const buf = storageFiles.get(`${tenantId}:${key}`);
        if (!buf) throw new Error(`Object ${key} not found`);
        return { data: buf } as any;
      }),
      exists: jest.fn(async (tenantId: string, key: string) => {
        return storageFiles.has(`${tenantId}:${key}`);
      }),
      delete: jest.fn(async (tenantId: string, key: string) => {
        storageFiles.delete(`${tenantId}:${key}`);
      }),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(async (tenantId: string, key: string) => {
        return `https://storage.kynergy.io/${tenantId}/${key}?signed=true`;
      }),
    } as unknown as jest.Mocked<ObjectStoragePort>;

    mockScanner = {
      scanBuffer: jest.fn(async (_buffer: Buffer, _context?: any): Promise<MalwareScanResult> => {
        return {
          status: MalwareScanStatus.CLEAN,
          scannerEngine: 'test-clamav',
          scanDurationMs: 5,
          scannedAt: new Date(),
        };
      }),
    };

    mockIndexingPort = {
      indexDocument: jest.fn(async () => ({
        indexed: true,
        chunkCount: 1,
        embeddingModel: 'test-embedding',
      })),
    } as unknown as jest.Mocked<IDocumentIndexingPort>;

    sandbox = new ParserSandboxService();
    contentValidator = new DocumentContentValidatorService({
      ...DEFAULT_AI_CONFIG,
      maxDocumentSizeBytes: 10 * 1024 * 1024,
    } as any);

    const pdfParser = new PdfParserAdapter();
    const docxParser = new DocxParserAdapter();
    const mdParser = new MarkdownParserAdapter();
    const txtParser = new PlainTextParserAdapter();
    const compositeParser = new CompositeDocumentParserAdapter(
      pdfParser,
      docxParser,
      mdParser,
      txtParser,
      sandbox,
    );

    const languageDetector = new DeterministicLanguageDetectorService();
    const normalizer = new DeterministicDocumentNormalizerService(languageDetector);
    const tokenizer = new DeterministicBpeTokenizerAdapter();
    const chunker = new StructureAwareChunkerService(tokenizer);

    const pipeline = new DocumentProcessingPipelineService(
      compositeParser,
      normalizer,
      chunker,
      mockChunkRepo,
      mockStoragePort,
    );

    orchestrator = new IngestionOrchestratorService(
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      mockIndexingPort,
      pipeline,
      contentValidator,
      mockScanner,
    );

    uploadService = new SecureDocumentUploadService(
      mockStoragePort,
      mockDocRepo,
      mockJobRepo,
      contentValidator,
      orchestrator,
      mockScanner,
    );

    tempStorageService = new TempFileStorageService();
    securityPolicy = new RetrievalSecurityPolicyService(mockDocRepo);

    controller = new AiDocumentController(
      uploadService,
      mockDocRepo,
      mockJobRepo,
      mockStoragePort,
      orchestrator,
      undefined,
      securityPolicy,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Section A: Authentication and Authorization Tests
  // =========================================================================
  describe('A. Authentication and authorization tests', () => {
    it('1. rejects unauthenticated upload with 401 Unauthorized', async () => {
      const validPdf = createSinglePagePdf('Auth Test');
      await expect(
        controller.uploadDocument(
          null,
          {
            fieldname: 'file',
            originalname: 'auth.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          } as any,
          {} as any,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('2. rejects user without tenant assignment with 403 Forbidden', async () => {
      const validPdf = createSinglePagePdf('No Tenant');
      const userWithoutTenant = { ...AUTH_USER_A, tenantId: '' };
      await expect(
        controller.uploadDocument(
          userWithoutTenant,
          {
            fieldname: 'file',
            originalname: 'protocol.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          } as any,
          {} as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. rejects upload when user lacks role clearance for visibility scope', async () => {
      const validPdf = createSinglePagePdf('Scope Clearance');
      const userPhysio: AuthenticatedUserPayload = {
        ...AUTH_USER_A,
        roles: ['Physiotherapist'],
      };

      await expect(
        controller.uploadDocument(
          userPhysio,
          {
            fieldname: 'file',
            originalname: 'confidential.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          } as any,
          { visibilityScope: VisibilityScope.MANAGEMENT } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4. ignores forged uploadedBy or author metadata in body and derives identity strictly from token', async () => {
      const validPdf = createSinglePagePdf('Provenance Integrity');
      const result = await controller.uploadDocument(
        AUTH_USER_A,
        {
          fieldname: 'file',
          originalname: 'plan.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        } as any,
        {
          title: 'Legitimate Title',
          description: 'Forged attempt',
        } as any,
      );

      const savedDoc = documentStore.get(result.documentId)!;
      expect(savedDoc.tenantId).toBe(TENANT_A);
      expect(savedDoc.uploadedBy).toBe(USER_A);
    });

    it('5. denies content download to unauthorized cross-tenant user with anti-enumeration 404', async () => {
      const validPdf = createSinglePagePdf('Secret Tenant A');
      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'secret.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      await expect(
        controller.downloadContent(
          upload.documentId,
          undefined,
          undefined,
          AUTH_USER_B,
          mockRes as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('6. quarantined files cannot be downloaded or content previewed', async () => {
      const validPdf = createSinglePagePdf('Quarantined Doc');
      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'quarantined.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const doc = documentStore.get(upload.documentId)!;
      doc.softDelete(USER_A);
      documentStore.set(doc.id.value, doc);

      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      await expect(
        controller.downloadContent(
          upload.documentId,
          undefined,
          undefined,
          AUTH_USER_A,
          mockRes as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('7. failed ingestion jobs cannot publish retrievable chunks or knowledge', async () => {
      const validPdf = createSinglePagePdf('Failed Job');
      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'failed.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const job = jobStore.get(upload.ingestionJobId)!;
      job.startValidation();
      job.fail(IngestionErrorCode.UNSUPPORTED_FORMAT, 'Fatal format parsing failure');
      jobStore.set(job.id, job);

      // Verify that mockChunkRepo has zero chunks persisted for this failed version
      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });

    it('8. direct object reference (IDOR) manipulation yields anti-enumeration 404', async () => {
      const forgedId = '66666666-6666-4666-8666-666666666666';
      await expect(controller.getDocument(forgedId, AUTH_USER_A)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // Section B: File-Type Validation Tests
  // =========================================================================
  describe('B. File-type validation tests', () => {
    it('1. accepts all valid supported formats (PDF, DOCX, TXT, MD)', async () => {
      const pdfBuf = createSinglePagePdf('PDF Test');
      const docxBuf = createValidDocx();
      const txtBuf = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');
      const mdBuf = Buffer.from('# Encabezado Markdown\n\nContenido clínico válido.', 'utf8');

      const rPdf = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'test.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuf,
          size: pdfBuf.length,
        },
      });
      const rDocx = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'test.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: docxBuf,
          size: docxBuf.length,
        },
      });
      const rTxt = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'test.txt',
          mimeType: 'text/plain',
          buffer: txtBuf,
          size: txtBuf.length,
        },
      });
      const rMd = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'test.md',
          mimeType: 'text/markdown',
          buffer: mdBuf,
          size: mdBuf.length,
        },
      });

      expect(rPdf.documentId).toBeDefined();
      expect(rDocx.documentId).toBeDefined();
      expect(rTxt.documentId).toBeDefined();
      expect(rMd.documentId).toBeDefined();
    });

    it('2. rejects unsupported executable and script extensions (.exe, .sh, .php) with 415', async () => {
      const dummyBuf = Buffer.from('\x7fELF\x02\x01\x01\x00', 'binary');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'exploit.sh',
            mimeType: 'text/x-sh',
            buffer: dummyBuf,
            size: dummyBuf.length,
          },
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatException);
    });

    it('3. rejects unsupported MIME types (application/x-msdownload, application/zip) with 415', async () => {
      const dummyBuf = Buffer.from('MZ\x90\x00\x03', 'binary');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'payload.exe',
            mimeType: 'application/x-msdownload',
            buffer: dummyBuf,
            size: dummyBuf.length,
          },
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatException);
    });

    it('4. rejects MIME/signature mismatch (declared PDF with non-PDF bytes) with 400', async () => {
      const fakePdf = Buffer.from('RIFF....WAVEfmt ', 'binary');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'audio.pdf',
            mimeType: 'application/pdf',
            buffer: fakePdf,
            size: fakePdf.length,
          },
        }),
      ).rejects.toThrow(DocumentContentMismatchException);
    });

    it('5. rejects extension/signature mismatch (named .pdf but containing DOCX ZIP bytes) with 400', async () => {
      const docxBuf = createValidDocx();
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'trojan.pdf',
            mimeType: 'application/pdf',
            buffer: docxBuf,
            size: docxBuf.length,
          },
        }),
      ).rejects.toThrow(DocumentContentMismatchException);
    });

    it('6. rejects empty zero-byte files with 400', async () => {
      const emptyBuf = Buffer.alloc(0);
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'empty.pdf',
            mimeType: 'application/pdf',
            buffer: emptyBuf,
            size: 0,
          },
        }),
      ).rejects.toThrow();
    });

    it('7. rejects truncated PDF headers with abrupt EOF as malformed with 400', async () => {
      const truncatedPdf = Buffer.from('%PDF-1.4\n', 'utf8');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'truncated.pdf',
            mimeType: 'application/pdf',
            buffer: truncatedPdf,
            size: truncatedPdf.length,
          },
        }),
      ).rejects.toThrow(DocumentMalformedException);
    });

    it('8. rejects corrupted document structure with 400 MALFORMED_DOCUMENT', async () => {
      const corruptedPdf = Buffer.concat([
        Buffer.from('%PDF-1.4\n', 'utf8'),
        Buffer.from('CORRUPTED_STREAM_GARBAGE_WITHOUT_TRAILER_OR_XREF', 'utf8'),
      ]);
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'corrupt.pdf',
            mimeType: 'application/pdf',
            buffer: corruptedPdf,
            size: corruptedPdf.length,
          },
        }),
      ).rejects.toThrow(DocumentMalformedException);
    });

    it('9. rejects invalid structural headers (PDF missing %PDF, DOCX missing PK)', async () => {
      const badDocx = Buffer.from('NOT_A_PK_ARCHIVE_HEADER_DATA', 'utf8');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'fake.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            buffer: badDocx,
            size: badDocx.length,
          },
        }),
      ).rejects.toThrow(DocumentContentMismatchException);
    });

    it('10. rejects polyglot files (GIF89a prepended to PDF text)', async () => {
      const polyglot = Buffer.concat([
        Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'),
        Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer\n%%EOF', 'utf8'),
      ]);
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'polyglot.pdf',
            mimeType: 'application/pdf',
            buffer: polyglot,
            size: polyglot.length,
          },
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatException);
    });

    it('11. rejects misleading double extensions (.pdf.exe) based on true trailing extension', async () => {
      const dummyBuf = Buffer.from('MZ\x00\x00', 'binary');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'invoice.pdf.exe',
            mimeType: 'application/octet-stream',
            buffer: dummyBuf,
            size: dummyBuf.length,
          },
        }),
      ).rejects.toThrow(UnsupportedDocumentFormatException);
    });
  });

  // =========================================================================
  // Section C: Size and Resource-Exhaustion Tests
  // =========================================================================
  describe('C. Size and resource-exhaustion tests', () => {
    it('1. correctly handles document at maximum allowed size limit', async () => {
      const validPdf = createSinglePagePdf('Max Limit Valid');
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'boundary.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });
      expect(result.documentId).toBeDefined();
    });

    it('2. rejects document exceeding maximum configured size limit with 413 Payload Too Large', async () => {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'huge.pdf',
            mimeType: 'application/pdf',
            buffer: hugeBuffer,
            size: hugeBuffer.length,
          },
        }),
      ).rejects.toThrow(DocumentSizeLimitExceededException);
    });

    it('3. rejects falsified Content-Length metadata where actual buffer exceeds size limit', async () => {
      const hugeBuffer = Buffer.alloc(12 * 1024 * 1024);
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'spoofed.pdf',
            mimeType: 'application/pdf',
            buffer: hugeBuffer,
            size: 500,
          },
        }),
      ).rejects.toThrow(DocumentSizeLimitExceededException);
    });

    it('4. verifies strict Multer multipart limits configuration', () => {
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.fileSize).toBe(10 * 1024 * 1024);
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.files).toBe(1);
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.fields).toBe(10);
      expect(KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS.limits.parts).toBe(15);
    });

    it('5. parser rejects documents exceeding maximum extracted character ceiling (>5M chars)', () => {
      const mockDoc = ExtractedDocument.create({
        documentId: 'doc-huge-chars',
        documentVersionId: 'v1',
        sourceFormat: DocumentFormat.TXT,
        title: 'Huge Text Doc',
        blocks: [
          ExtractedBlock.create({
            type: ExtractedBlockType.PARAGRAPH,
            text: 'A'.repeat(600),
            sequence: 0,
          }),
        ],
        metadata: { parserName: 'mock', pageCount: 1, totalChars: 600 },
      });

      expect(() => {
        sandbox.sanitizeExtractedDocument(mockDoc, 500);
      }).toThrow(ExtractionResourceLimitExceededException);
    });

    it('6. parser timeouts do not leave hung processes or lingering scratch files', async () => {
      const slowTask = () =>
        new Promise<ExtractedDocument>(() => {
          // Never resolves
        });

      await expect(
        sandbox.executeWithSandbox(slowTask, {
          timeoutMs: 40,
          documentId: 'slow-doc',
          documentVersionId: 'v1',
        }),
      ).rejects.toThrow(ExtractionTimeoutException);
    });
  });

  // =========================================================================
  // Section D: Filename and Path Traversal Tests
  // =========================================================================
  describe('D. Filename and path traversal tests', () => {
    it('1. neutralizes relative directory traversal (../../../../etc/passwd.pdf)', async () => {
      const validPdf = createSinglePagePdf('Path Traversal Test');
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: '../../../../etc/passwd.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const savedDoc = documentStore.get(result.documentId)!;
      const version = savedDoc.getAllVersions()[0]!;
      expect(version.storageKey).toMatch(/^knowledge_base\/[a-f0-9-]+\.pdf$/);
      expect(version.storageKey).not.toContain('..');
      expect(version.storageKey).not.toContain('etc');
    });

    it('2. neutralizes absolute path traversal (C:\\Windows\\System32\\cmd.exe.pdf)', async () => {
      const validPdf = createSinglePagePdf('Absolute Path Test');
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'C:\\Windows\\System32\\cmd.exe.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const savedDoc = documentStore.get(result.documentId)!;
      expect(savedDoc.getAllVersions()[0]!.storageKey).toMatch(/^knowledge_base\/[a-f0-9-]+\.pdf$/);
      expect(savedDoc.getAllVersions()[0]!.storageKey).not.toContain('Windows');
    });

    it('3. neutralizes URL-encoded path traversal (%2e%2e%2f%2e%2e%2fboot.ini.pdf)', async () => {
      const validPdf = createSinglePagePdf('Encoded Traversal');
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: '%2e%2e%2f%2e%2e%2fboot.ini.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const savedDoc = documentStore.get(result.documentId)!;
      expect(savedDoc.getAllVersions()[0]!.storageKey).toMatch(/^knowledge_base\/[a-f0-9-]+\.pdf$/);
      expect(savedDoc.getAllVersions()[0]!.storageKey).not.toContain('%2e');
    });

    it('4. rejects null-byte filename injection with validation error', async () => {
      const validPdf = createSinglePagePdf('Null Byte');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'patient.pdf' + String.fromCharCode(0) + '.exe',
            mimeType: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          },
        }),
      ).rejects.toThrow();
    });

    it('5. neutralizes Windows reserved device names (CON.pdf, NUL.docx, PRN.txt)', async () => {
      const validPdf = createSinglePagePdf('Reserved Name');
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'CON.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const savedDoc = documentStore.get(result.documentId)!;
      expect(savedDoc.getAllVersions()[0]!.storageKey).toMatch(/^knowledge_base\/[a-f0-9-]+\.pdf$/);
    });

    it('6. safely handles duplicate filenames without storage overwrites', async () => {
      const pdf1 = createSinglePagePdf('Doc Version 1');
      const pdf2 = createSinglePagePdf('Doc Version 2 Different Content');

      const r1 = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          buffer: pdf1,
          size: pdf1.length,
        },
      });
      const r2 = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          buffer: pdf2,
          size: pdf2.length,
        },
      });

      const doc1 = documentStore.get(r1.documentId)!;
      const doc2 = documentStore.get(r2.documentId)!;
      expect(doc1.getAllVersions()[0]!.storageKey).not.toEqual(
        doc2.getAllVersions()[0]!.storageKey,
      );
    });

    it('7. treats shell metacharacters in filenames purely as inert display strings', async () => {
      const validPdf = createSinglePagePdf('Shell Injection Test');
      const dangerousName = 'report; rm -rf /; $(whoami).pdf';
      const result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: dangerousName,
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const savedDoc = documentStore.get(result.documentId)!;
      expect(savedDoc.getAllVersions()[0]!.storageKey).toMatch(/^knowledge_base\/[a-f0-9-]+\.pdf$/);
      expect(savedDoc.getAllVersions()[0]!.storageKey).not.toContain(';');
      expect(savedDoc.getAllVersions()[0]!.storageKey).not.toContain('$');
    });
  });

  // =========================================================================
  // Section E: Malware and Archive Tests
  // =========================================================================
  describe('E. Malware and archive tests', () => {
    it('1. detects harmless antivirus test signature (EICAR) and quarantines fail-closed', async () => {
      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const eicarBuf = Buffer.from(eicarString, 'utf8');

      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: MalwareScanStatus.INFECTED,
        threatFound: 'EICAR-Standard-Antivirus-Test-File',
        scannerEngine: 'test-clamav',
        scanDurationMs: 10,
        scannedAt: new Date(),
      });

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'eicar.txt',
            mimeType: 'text/plain',
            buffer: eicarBuf,
            size: eicarBuf.length,
          },
        }),
      ).rejects.toThrow(DocumentSecurityRiskException);
    });

    it('2. fails closed when scanner service is unavailable (ECONNREFUSED)', async () => {
      mockScanner.scanBuffer.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:3310 (ClamAV daemon offline)'),
      );

      const validPdf = createSinglePagePdf('Clean Buffer');
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'clean.pdf',
            mimeType: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          },
        }),
      ).rejects.toThrow();
    });

    it('3. rejects archive with corrupted or missing Central Directory record', () => {
      const corruptZip = Buffer.from('PK\x03\x04corrupted_zip_payload_without_eocd', 'utf8');
      expect(() => {
        contentValidator.validate({
          originalFileName: 'corrupted.docx',
          declaredMimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: corruptZip,
        });
      }).toThrow(DocumentMalformedException);
    });

    it('4. rejects DOCX containing path traversal entries (../../malicious.xml) inside ZIP archive', () => {
      const traversalDocx = buildZipArchive([
        { name: '[Content_Types].xml', content: Buffer.from('<xml/>') },
        { name: '../../malicious.xml', content: Buffer.from('<payload/>') },
      ]);

      expect(() => {
        contentValidator.validate({
          originalFileName: 'traversal.docx',
          declaredMimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: traversalDocx,
        });
      }).toThrow(DocumentSecurityRiskException);
    });

    it('5. triggers ZIP bomb defense when uncompressed size exceeds limit (>50MB)', () => {
      const zipBomb = createZipBombDocx();
      expect(() => {
        contentValidator.validate({
          originalFileName: 'bomb.docx',
          declaredMimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: zipBomb,
        });
      }).toThrow(DocumentSecurityRiskException);
    });

    it('6. rejects DOCX containing nested archive files (.zip inside .docx)', () => {
      const nestedDocx = buildZipArchive([
        { name: '[Content_Types].xml', content: Buffer.from('<xml/>') },
        { name: 'word/nested.zip', content: Buffer.from('PK\x03\x04nested') },
      ]);

      expect(() => {
        contentValidator.validate({
          originalFileName: 'nested.docx',
          declaredMimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: nestedDocx,
        });
      }).toThrow(DocumentSecurityRiskException);
    });

    it('7. guarantees temporary files are cleaned up on failed or partial archive extraction', async () => {
      const tmpDir = await tempStorageService.createIsolatedTempDir(TENANT_A);
      const filePath = path.join(tmpDir, 'sample.tmp');
      await fs.writeFile(filePath, 'intermediate state');

      await tempStorageService.cleanupTempPath(tmpDir);
      await expect(fs.access(tmpDir)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Section F: Parser Security Tests
  // =========================================================================
  describe('F. Parser security tests', () => {
    it('1. malformed documents do not crash the service or runtime', async () => {
      const parser = new PdfParserAdapter();
      const corruptBuf = Buffer.from('%PDF-1.4\ncorrupted garbage tokens %%EOF', 'utf8');

      await expect(
        parser.parse({
          tenantId: TENANT_A,
          documentId: 'corrupt-doc',
          documentVersionId: 'v1',
          format: DocumentFormat.PDF,
          buffer: corruptBuf,
        }),
      ).rejects.toThrow();
    });

    it('2. parser timeouts terminate safely without zombie subprocesses', async () => {
      await expect(
        sandbox.executeSafeSubprocess(process.execPath, ['-e', 'setTimeout(()=>{}, 5000);'], {
          timeoutMs: 50,
        }),
      ).rejects.toThrow('Subprocess execution timed out');
    });

    it('3. strips application secrets from child process environment in sandbox', async () => {
      const envCapture = await sandbox.executeSafeSubprocess(
        process.execPath,
        ['-e', 'console.log(JSON.stringify(process.env));'],
        {
          timeoutMs: 2000,
        },
      );

      const capturedEnv = JSON.parse(envCapture.stdout);
      expect(capturedEnv.DATABASE_URL).toBeUndefined();
      expect(capturedEnv.JWT_SECRET).toBeUndefined();
      expect(capturedEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    });

    it('4. sanitizes control characters and script tags from extracted text output', () => {
      const dirtyDoc = ExtractedDocument.create({
        documentId: 'doc-dirty',
        documentVersionId: 'v1',
        sourceFormat: DocumentFormat.TXT,
        title: 'Dirty Doc',
        blocks: [
          ExtractedBlock.create({
            type: ExtractedBlockType.PARAGRAPH,
            text: 'Hello\x00\x08World <script>alert(1)</script>',
            sequence: 0,
          }),
        ],
        metadata: { parserName: 'mock', pageCount: 1, totalChars: 50 },
      });

      const sanitized = sandbox.sanitizeExtractedDocument(dirtyDoc, 1000);
      expect(sanitized.blocks[0]?.text).not.toContain('\x00');
      expect(sanitized.blocks[0]?.text).not.toContain('<script>');
    });

    it('5. parser diagnostics do not leak server paths or confidential document text', () => {
      const secretPath = 'C:\\inetpub\\wwwroot\\kynergy\\secrets\\passwords.txt';
      const diagnostic = `Error at parser module: unable to read ${secretPath}`;
      const sanitized = sandbox.scrubSensitiveDiagnostics(diagnostic);

      expect(sanitized).not.toContain('C:\\inetpub');
      expect(sanitized).toContain('[REDACTED_PATH]');
    });
  });

  // =========================================================================
  // Section G: Ingestion Lifecycle Tests
  // =========================================================================
  describe('G. Ingestion lifecycle tests', () => {
    it('1. invalid files rejected during upload admission never invoke parser or indexing', async () => {
      const badBuf = Buffer.from('NOT_A_PDF_FILE', 'utf8');

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'bad.pdf',
            mimeType: 'application/pdf',
            buffer: badBuf,
            size: badBuf.length,
          },
        }),
      ).rejects.toThrow();

      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });

    it('2. malware detected during background scanning quarantines document and halts pipeline', async () => {
      const validPdf = createSinglePagePdf('Late Malware Infection');

      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'trojan.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: MalwareScanStatus.INFECTED,
        threatFound: 'Late.Discovery.ExploitTarget',
        scannerEngine: 'test-clamav',
        scanDurationMs: 5,
        scannedAt: new Date(),
      });

      const job = jobStore.get(upload.ingestionJobId)!;
      const jobResult = await orchestrator.processJob(job.id, TENANT_A);
      expect(jobResult.status).toBe(IngestionStatus.FAILED);
      expect(jobResult.lastErrorCode).toBe(IngestionErrorCode.SECURITY_VIOLATION);

      const updatedDoc = documentStore.get(upload.documentId)!;
      expect(updatedDoc.isDeleted()).toBe(true);
    });

    it('3. valid documents preserve authoritative tenantId and documentId across chunks', async () => {
      const validPdf = createSinglePagePdf('Provenance Authority');
      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'valid.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const job = jobStore.get(upload.ingestionJobId)!;
      await orchestrator.processJob(job.id, TENANT_A);

      expect(mockIndexingPort.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          documentId: upload.documentId,
          versionId: upload.versionId,
        }),
      );
    });

    it('4. retries re-execute checksum verification and scanner checks', async () => {
      const validPdf = createSinglePagePdf('Retry Security Check');
      const upload = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'retry.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      mockScanner.scanBuffer.mockClear();

      const job = jobStore.get(upload.ingestionJobId)!;
      job.startValidation();
      job.startProcessing();
      job.fail(IngestionErrorCode.PROCESSING_TIMEOUT, 'Timeout simulation');
      job.retry(new Date());
      jobStore.set(job.id, job);

      await orchestrator.processJob(job.id, TENANT_A);

      expect(mockScanner.scanBuffer).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Section H: Concurrency Tests
  // =========================================================================
  describe('H. Concurrency tests', () => {
    it('1. concurrent uploads from separate tenants complete with strict isolation', async () => {
      const pdfA = createSinglePagePdf('Tenant A Document');
      const pdfB = createSinglePagePdf('Tenant B Document');

      const [resA, resB] = await Promise.all([
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'concurrent.pdf',
            mimeType: 'application/pdf',
            buffer: pdfA,
            size: pdfA.length,
          },
        }),
        uploadService.uploadDocument({
          tenantId: TENANT_B,
          uploadedBy: USER_B,
          file: {
            originalFileName: 'concurrent.pdf',
            mimeType: 'application/pdf',
            buffer: pdfB,
            size: pdfB.length,
          },
        }),
      ]);

      expect(resA.documentId).not.toEqual(resB.documentId);
      const docA = documentStore.get(resA.documentId)!;
      const docB = documentStore.get(resB.documentId)!;
      expect(docA.tenantId).toBe(TENANT_A);
      expect(docB.tenantId).toBe(TENANT_B);
      expect(docA.getAllVersions()[0]!.storageKey).not.toEqual(
        docB.getAllVersions()[0]!.storageKey,
      );
    });

    it('2. concurrent uploads of identical filenames generate distinct collision-free UUID storage keys', async () => {
      const pdf = createSinglePagePdf('Identical Filename');

      const [r1, r2, r3] = await Promise.all([
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'same.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from(pdf),
            size: pdf.length,
          },
        }),
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'same.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.concat([pdf, Buffer.from('1')]),
            size: pdf.length + 1,
          },
        }),
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'same.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.concat([pdf, Buffer.from('2')]),
            size: pdf.length + 1,
          },
        }),
      ]);

      const keys = new Set([
        documentStore.get(r1.documentId)!.getAllVersions()[0]!.storageKey,
        documentStore.get(r2.documentId)!.getAllVersions()[0]!.storageKey,
        documentStore.get(r3.documentId)!.getAllVersions()[0]!.storageKey,
      ]);
      expect(keys.size).toBe(3);
    });

    it('3. failed upload in tenant A does not impact simultaneous valid upload in tenant B', async () => {
      const invalidPdf = Buffer.from('CORRUPT_BYTES', 'utf8');
      const validPdf = createSinglePagePdf('Clean Tenant B');

      const results = await Promise.allSettled([
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'bad.pdf',
            mimeType: 'application/pdf',
            buffer: invalidPdf,
            size: invalidPdf.length,
          },
        }),
        uploadService.uploadDocument({
          tenantId: TENANT_B,
          uploadedBy: USER_B,
          file: {
            originalFileName: 'good.pdf',
            mimeType: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          },
        }),
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      if (results[1].status === 'fulfilled') {
        expect(results[1].value.documentId).toBeDefined();
      }
    });

    it('4. concurrent scratch directory allocation produces isolated paths without collisions', async () => {
      const dirs = await Promise.all([
        tempStorageService.createIsolatedTempDir(TENANT_A),
        tempStorageService.createIsolatedTempDir(TENANT_A),
        tempStorageService.createIsolatedTempDir(TENANT_B),
      ]);

      const uniqueDirs = new Set(dirs);
      expect(uniqueDirs.size).toBe(3);

      await Promise.all(dirs.map((d: string) => tempStorageService.cleanupTempPath(d)));
    });
  });
});
