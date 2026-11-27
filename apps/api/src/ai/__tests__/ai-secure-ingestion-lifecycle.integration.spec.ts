import {
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  VisibilityScope,
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IDocumentIndexingPort,
  DocumentChunk,
  DocumentIndexingRequest,
  DocumentIndexingResult,
  DocumentSecurityRiskException,
} from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../config/ai.config';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { DocumentProcessingPipelineService } from '../services/document-processing-pipeline.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import {
  IMalwareScannerPort,
  MalwareScanStatus,
  MalwareScanResult,
} from '../ports/malware-scanner.port';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { CompositeDocumentParserAdapter } from '../adapters/parsers/composite-document-parser.adapter';
import { DocxParserAdapter } from '../adapters/parsers/docx-parser.adapter';
import { PdfParserAdapter } from '../adapters/parsers/pdf-parser.adapter';
import { MarkdownParserAdapter } from '../adapters/parsers/markdown-parser.adapter';
import { PlainTextParserAdapter } from '../adapters/parsers/plain-text-parser.adapter';
import { DeterministicDocumentNormalizerService } from '../services/normalization/deterministic-document-normalizer.service';
import { StructureAwareChunkerService } from '../services/chunking/structure-aware-chunker.service';
import { DeterministicLanguageDetectorService } from '../services/normalization/deterministic-language-detector.service';
import { DeterministicBpeTokenizerAdapter } from '../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { IngestionErrorCode } from '../services/ingestion-retry.policy';
import {
  createValidDocx,
  createSinglePagePdf,
} from '../adapters/parsers/__tests__/parser-fixtures';

describe('AI-10.3-07 — Secure Extraction and RAG Ingestion Lifecycle Integration', () => {
  const TENANT_A = 'tenant_clinic_a';
  const TENANT_B = 'tenant_clinic_b';
  const USER_A = 'usr_physio_a';

  let docStore: Map<string, KnowledgeDocument>;
  let jobStore: Map<string, IngestionJob>;
  let chunkStore: Map<string, DocumentChunk[]>;
  let storageFiles: Map<string, Buffer>;

  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;
  let mockIndexingPort: jest.Mocked<IDocumentIndexingPort>;
  let mockScanner: jest.Mocked<IMalwareScannerPort>;

  let contentValidator: DocumentContentValidatorService;
  let compositeParser: CompositeDocumentParserAdapter;
  let pipeline: DocumentProcessingPipelineService;
  let orchestrator: IngestionOrchestratorService;
  let uploadService: SecureDocumentUploadService;
  let securityPolicy: RetrievalSecurityPolicyService;

  beforeEach(() => {
    docStore = new Map();
    jobStore = new Map();
    chunkStore = new Map();
    storageFiles = new Map();

    mockDocRepo = {
      findById: jest.fn(async (tenantId: string, docId: string) => {
        const doc = docStore.get(docId);
        if (doc && doc.tenantId === tenantId) return doc;
        return null;
      }),
      findByChecksum: jest.fn(async (tenantId: string, checksum: string) => {
        for (const doc of docStore.values()) {
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
      save: jest.fn(async (doc: KnowledgeDocument) => {
        docStore.set(doc.id.value, doc);
        return doc;
      }),
      softDelete: jest.fn(),
      findVersionsByDocumentId: jest.fn(),
      findVersionById: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    mockJobRepo = {
      findById: jest.fn(async (tenantId: string, jobId: string) => {
        const job = jobStore.get(jobId);
        if (job && job.tenantId === tenantId) return job;
        return null;
      }),
      save: jest.fn(async (job: IngestionJob) => {
        jobStore.set(job.id, job);
        return job;
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
      findStaleProcessingJobs: jest.fn(async () => []),
    } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

    mockChunkRepo = {
      saveChunks: jest.fn(
        async (
          tenantId: string,
          documentId: string,
          versionId: string,
          chunks: readonly DocumentChunk[],
        ) => {
          chunkStore.set(`${tenantId}:${documentId}:${versionId}`, [...chunks]);
        },
      ),
      findByVersionId: jest.fn(async (tenantId: string, versionId: string) => {
        for (const [key, chunks] of chunkStore.entries()) {
          if (key.startsWith(`${tenantId}:`) && key.endsWith(`:${versionId}`)) {
            return chunks;
          }
        }
        return [];
      }),
      findById: jest.fn(),
      deleteByVersionId: jest.fn(),
      countByVersionId: jest.fn(),
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
      createPresignedDownloadUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStoragePort>;

    mockIndexingPort = {
      indexDocument: jest.fn(
        async (_req: DocumentIndexingRequest): Promise<DocumentIndexingResult> => {
          return {
            indexed: true,
            chunkCount: 1,
            embeddingModel: 'test-model',
          };
        },
      ),
    } as unknown as jest.Mocked<IDocumentIndexingPort>;

    mockScanner = {
      scanBuffer: jest.fn(async (_buffer: Buffer, _context?: any): Promise<MalwareScanResult> => {
        return {
          status: MalwareScanStatus.CLEAN,
          scannerEngine: 'test-scanner',
          scanDurationMs: 5,
          scannedAt: new Date(),
        };
      }),
    };

    contentValidator = new DocumentContentValidatorService(DEFAULT_AI_CONFIG as any);

    const pdfParser = new PdfParserAdapter();
    const docxParser = new DocxParserAdapter();
    const mdParser = new MarkdownParserAdapter();
    const txtParser = new PlainTextParserAdapter();
    compositeParser = new CompositeDocumentParserAdapter(
      pdfParser,
      docxParser,
      mdParser,
      txtParser,
    );

    const languageDetector = new DeterministicLanguageDetectorService();
    const normalizer = new DeterministicDocumentNormalizerService(languageDetector);
    const tokenizer = new DeterministicBpeTokenizerAdapter();
    const chunker = new StructureAwareChunkerService(tokenizer);

    pipeline = new DocumentProcessingPipelineService(
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

    securityPolicy = new RetrievalSecurityPolicyService(mockDocRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Scenario 1: Valid file reaches extraction
  // =========================================================================
  describe('1. Valid file reaches extraction', () => {
    it('successfully validates, scans, extracts, chunks, and completes ingestion to READY', async () => {
      const pdfBuffer = createSinglePagePdf('Kinesiologia Clinica');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'guia.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
          size: pdfBuffer.length,
        },
        title: 'Guia Clinica PDF',
      });

      expect(uploadResult.documentId).toBeDefined();
      expect(mockScanner.scanBuffer).toHaveBeenCalled();

      // Process job through orchestrator
      const finishedJob = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(finishedJob.status).toBe(IngestionStatus.READY);
      expect(mockIndexingPort.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          documentId: uploadResult.documentId,
          versionId: uploadResult.versionId,
        }),
      );

      // Verify chunks were created and saved in chunk repository
      const savedChunks = await mockChunkRepo.findByVersionId(TENANT_A, uploadResult.versionId);
      expect(savedChunks.length).toBeGreaterThan(0);
      expect(savedChunks[0]?.content).toContain('Kinesiologia Clinica');
    });
  });

  // =========================================================================
  // Scenario 2: Invalid file never reaches the parser
  // =========================================================================
  describe('2. Invalid file never reaches the parser', () => {
    it('rejects file with corrupted magic bytes during upload admission; parser is never invoked', async () => {
      const fakePdfCorrupt = Buffer.from('NOT_A_PDF_CORRUPTED_BYTES');

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'fake.pdf',
            mimeType: 'application/pdf',
            buffer: fakePdfCorrupt,
            size: fakePdfCorrupt.length,
          },
        }),
      ).rejects.toThrow(/PDF/i);

      // Verify no storage upload or job creation occurred
      expect(mockStoragePort.upload).not.toHaveBeenCalled();
      expect(jobStore.size).toBe(0);
    });

    it('rejects job in orchestrator if stored file checksum mismatches version checksum', async () => {
      const validPdf = createSinglePagePdf('Original Safe Content');
      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'tampered.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      // Tamper with the storage file behind the scenes
      const tamperedBuffer = Buffer.from('%PDF-1.4\nTAMPERED_MALICIOUS_BYTES\n%%EOF');
      const doc = docStore.get(uploadResult.documentId)!;
      const version = doc.getCurrentVersion()!;
      storageFiles.set(`${TENANT_A}:${version.storageKey}`, tamperedBuffer);

      // Orchestrator processing should catch checksum mismatch before parsing
      const job = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(job.status).toBe(IngestionStatus.FAILED);
      expect(job.lastErrorCode).toBe(IngestionErrorCode.CHECKSUM_MISMATCH);

      // Zero chunks created
      const chunks = await mockChunkRepo.findByVersionId(TENANT_A, uploadResult.versionId);
      expect(chunks.length).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 3: Quarantined file never reaches chunk generation
  // =========================================================================
  describe('3. Quarantined file never reaches chunk generation', () => {
    it('quarantines infected document on scan detection; chunk generation is never invoked', async () => {
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: MalwareScanStatus.INFECTED,
        threatFound: 'Trojan.Heuristic.TestSignature',
        scannerEngine: 'test-scanner',
        scanDurationMs: 5,
        scannedAt: new Date(),
      });

      const pdfBuffer = createSinglePagePdf('Infected PDF Document');

      // Upload service catches malware and fails closed
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'malware.pdf',
            mimeType: 'application/pdf',
            buffer: pdfBuffer,
            size: pdfBuffer.length,
          },
        }),
      ).rejects.toThrow(DocumentSecurityRiskException);

      // Zero chunks ever created
      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });

    it('orchestrator quarantines document and halts pipeline if malware is discovered during background scanning', async () => {
      const docxBuffer = createValidDocx();

      // Clean during initial upload
      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'suspect.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: docxBuffer,
          size: docxBuffer.length,
        },
      });

      // But scanner discovers infection during orchestrator processing
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: MalwareScanStatus.INFECTED,
        threatFound: 'Macro.VBA.ExploitTarget',
        scannerEngine: 'test-scanner',
        scanDurationMs: 5,
        scannedAt: new Date(),
      });

      const job = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(job.status).toBe(IngestionStatus.FAILED);
      expect(job.lastErrorCode).toBe(IngestionErrorCode.SECURITY_VIOLATION);

      // Document is soft-deleted / quarantined
      const doc = docStore.get(uploadResult.documentId)!;
      expect(doc.isDeleted()).toBe(true);

      // Zero chunks created
      expect(chunkStore.size).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 4: Parser failure produces no retrievable content
  // =========================================================================
  describe('4. Parser failure produces no retrievable content', () => {
    it('aborts pipeline when parser fails and persists zero retrievable chunks', async () => {
      const validTxtBuffer = Buffer.from('Valid text header for parser error testing.');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'corrupt.txt',
          mimeType: 'text/plain',
          buffer: validTxtBuffer,
          size: validTxtBuffer.length,
        },
      });

      jest
        .spyOn(compositeParser, 'parse')
        .mockRejectedValueOnce(
          new Error('Malformed content: corrupted document stream cannot be decompressed'),
        );

      const job = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(job.status).toBe(IngestionStatus.FAILED);
      expect(job.lastErrorCode).toBe(IngestionErrorCode.MALFORMED_CONTENT);

      // No chunks persisted
      const chunks = await mockChunkRepo.findByVersionId(TENANT_A, uploadResult.versionId);
      expect(chunks.length).toBe(0);
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 5: Partial extraction cannot be marked successful
  // =========================================================================
  describe('5. Partial extraction cannot be marked successful', () => {
    it('fails job when chunk persistence fails; never transitions to READY', async () => {
      const validTxt = Buffer.from('Valid paragraph for processing pipeline failure test');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'partial.txt',
          mimeType: 'text/plain',
          buffer: validTxt,
          size: validTxt.length,
        },
      });

      // Mock database error during chunk save
      mockChunkRepo.saveChunks.mockRejectedValueOnce(
        new Error('Simulated DB deadlock during chunk persistence'),
      );

      const job = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(job.status).not.toBe(IngestionStatus.READY);
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 6: Reprocessing repeats mandatory security checks
  // =========================================================================
  describe('6. Reprocessing repeats mandatory security checks', () => {
    it('re-executes checksum verification, content validation, and malware scanning on retry', async () => {
      const validMd = Buffer.from('# Protocolo de Recuperacion\n\nTexto clinico seguro.');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'retry_test.md',
          mimeType: 'text/markdown',
          buffer: validMd,
          size: validMd.length,
        },
      });

      // Simulate transient vector storage failure on attempt 1
      mockIndexingPort.indexDocument.mockRejectedValueOnce(
        new Error('Transient storage timeout during vector indexing'),
      );

      const jobAttempt1 = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);
      expect(jobAttempt1.attemptCount).toBe(2);

      mockScanner.scanBuffer.mockClear();

      // Reprocess job on retry attempt 2
      const finishedJob = await orchestrator.processJob(jobAttempt1.id, TENANT_A);
      expect(finishedJob.status).toBe(IngestionStatus.READY);

      // Verify security scan and validation were repeated on retry
      expect(mockScanner.scanBuffer).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Scenario 7: Chunk metadata preserves authoritative provenance
  // =========================================================================
  describe('7. Chunk metadata preserves authoritative provenance', () => {
    it('ensures every persisted chunk strictly binds to authoritative documentId and versionId', async () => {
      const docxBuffer = createValidDocx();

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'provenance.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: docxBuffer,
          size: docxBuffer.length,
        },
      });

      await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      const savedChunks = await mockChunkRepo.findByVersionId(TENANT_A, uploadResult.versionId);
      expect(savedChunks.length).toBeGreaterThan(0);

      for (const chunk of savedChunks) {
        expect(chunk.documentId).toBe(uploadResult.documentId);
        expect(chunk.documentVersionId).toBe(uploadResult.versionId);
        expect(chunk.sequence).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // Scenario 8: Forged extracted metadata cannot alter ownership
  // =========================================================================
  describe('8. Forged extracted metadata cannot alter ownership', () => {
    it('ignores deceptive cross-tenant claims in document text and preserves backend tenant context', async () => {
      const deceptiveText = `
# Documento Clinico Falsificado
{"tenantId": "${TENANT_B}", "ownerId": "hacker", "visibility": "MANAGEMENT"}
Este contenido intenta secuestrar la titularidad hacia ${TENANT_B}.`;

      const deceptiveBuffer = Buffer.from(deceptiveText, 'utf8');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'spoof.md',
          mimeType: 'text/markdown',
          buffer: deceptiveBuffer,
          size: deceptiveBuffer.length,
        },
      });

      await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      // Verify chunks were saved under TENANT_A and NOT TENANT_B
      expect(mockChunkRepo.saveChunks).toHaveBeenCalledWith(
        TENANT_A,
        uploadResult.documentId,
        uploadResult.versionId,
        expect.anything(),
      );

      const crossTenantChunks = await mockChunkRepo.findByVersionId(
        TENANT_B,
        uploadResult.versionId,
      );
      expect(crossTenantChunks.length).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 9: Failed vector persistence does not create false indexing success
  // =========================================================================
  describe('9. Failed vector persistence does not create false indexing success', () => {
    it('aborts with FAILED status when downstream vector indexing fails; does not mark READY', async () => {
      mockIndexingPort.indexDocument.mockRejectedValueOnce(
        new Error('Vector store connection timeout during embedding persistence'),
      );

      const validPdf = createSinglePagePdf('Fisioterapia Respiratoria');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'respiratoria.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const job = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      expect(job.status).not.toBe(IngestionStatus.READY);
    });
  });

  // =========================================================================
  // Scenario 10: Document replacement repeats validation
  // =========================================================================
  describe('10. Document replacement repeats validation', () => {
    it('running replacement / version 2 repeats full content validation and scanning', async () => {
      const v1Buffer = Buffer.from('Version 1 texto clinico');
      const v2Buffer = Buffer.from('Version 2 texto clinico actualizado');

      // Upload v1
      const v1Result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'historia.txt',
          mimeType: 'text/plain',
          buffer: v1Buffer,
          size: v1Buffer.length,
        },
      });

      expect(mockScanner.scanBuffer).toHaveBeenCalledTimes(1);

      // Upload replacement v2 for same documentId
      const v2Result = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        documentId: v1Result.documentId,
        file: {
          originalFileName: 'historia_v2.txt',
          mimeType: 'text/plain',
          buffer: v2Buffer,
          size: v2Buffer.length,
        },
      });

      expect(v2Result.versionNumber).toBe(2);
      expect(v2Result.documentId).toBe(v1Result.documentId);
      // Confirmed scanner called afresh for v2
      expect(mockScanner.scanBuffer).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Scenario 11: Deletion or quarantine removes retrieval eligibility
  // =========================================================================
  describe('11. Deletion or quarantine removes retrieval eligibility', () => {
    it('immediately excludes soft-deleted or quarantined documents from retrieval candidate pools', async () => {
      const validPdf = createSinglePagePdf('Documento Activo Inicial');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'activo.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      // Initially eligible for retrieval
      const initialAuth = await securityPolicy.resolveAuthorizedDocumentIds(
        TENANT_A,
        [uploadResult.documentId],
        [VisibilityScope.ALL_STAFF],
      );
      expect(initialAuth.authorizedDocumentIds).toContain(uploadResult.documentId);

      // Soft delete / quarantine the document
      const doc = docStore.get(uploadResult.documentId)!;
      doc.softDelete(USER_A);
      docStore.set(doc.id.value, doc);

      // Post-deletion retrieval resolution: immediately dropped
      const postDeleteAuth = await securityPolicy.resolveAuthorizedDocumentIds(
        TENANT_A,
        [uploadResult.documentId],
        [VisibilityScope.ALL_STAFF],
      );
      expect(postDeleteAuth.authorizedDocumentIds).not.toContain(uploadResult.documentId);
      expect(postDeleteAuth.isDenied).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 12: Existing valid ingestion and retrieval journeys remain operational
  // =========================================================================
  describe('12. Existing valid ingestion and retrieval journeys remain operational', () => {
    it('completes end-to-end journey from upload to READY state and validates retrieval clearance', async () => {
      const mdBuffer = Buffer.from(
        '# Evaluacion Muscular 2026\n\nProtocolo de medicion dinamica y rango articular.',
      );

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'evaluacion_muscular.md',
          mimeType: 'text/markdown',
          buffer: mdBuffer,
          size: mdBuffer.length,
        },
        title: 'Evaluacion Muscular',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });

      const finishedJob = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);
      expect(finishedJob.status).toBe(IngestionStatus.READY);

      // Retrieval authorization evaluation
      const clinicalClearance = securityPolicy.resolveAuthorizedDocumentIds(
        TENANT_A,
        [uploadResult.documentId],
        [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
      );
      await expect(clinicalClearance).resolves.toEqual({
        authorizedDocumentIds: [uploadResult.documentId],
        isDenied: false,
      });

      // Role without CLINICAL_STAFF clearance fails closed
      const staffClearance = securityPolicy.resolveAuthorizedDocumentIds(
        TENANT_A,
        [uploadResult.documentId],
        [VisibilityScope.ALL_STAFF],
      );
      await expect(staffClearance).resolves.toEqual({
        authorizedDocumentIds: [],
        isDenied: true,
      });
    });
  });
});
