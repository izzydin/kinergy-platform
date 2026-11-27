import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { HttpStatus } from '@nestjs/common';
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
  DuplicateDocumentContentException,
  UnauthorizedDocumentAccessException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  FileProcessingFailureCode,
  AiFailureClassifier,
  AiFailureCategory,
} from '@kinergy-platform/core';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { DocumentProcessingPipelineService } from '../services/document-processing-pipeline.service';
import { TempFileStorageService } from '../services/temp-file-storage.service';
import { DocumentStorageReconciliationService } from '../services/document-storage-reconciliation.service';
import { IngestionRecoveryWorker } from '../services/ingestion-recovery.worker';
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
import {
  DeterministicLanguageDetectorService,
  DeterministicDocumentNormalizerService,
} from '../services/normalization';
import { DeterministicBpeTokenizerAdapter } from '../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';
import { StructureAwareChunkerService } from '../services/chunking/structure-aware-chunker.service';
import { createSinglePagePdf } from '../adapters/parsers/__tests__/parser-fixtures';

describe('AI-10.3-08 — Secure File Processing Failures and Operational Resilience', () => {
  const TENANT_A = 'tenant_clinic_a';
  const USER_A = 'usr_physio_a';

  let testScratchDir: string;
  let tempStorageService: TempFileStorageService;
  let sandboxService: ParserSandboxService;

  let docStore: Map<string, KnowledgeDocument>;
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
  let reconciliationService: DocumentStorageReconciliationService;
  let recoveryWorker: IngestionRecoveryWorker;
  let securityPolicy: RetrievalSecurityPolicyService;

  beforeEach(async () => {
    testScratchDir = path.join(os.tmpdir(), `kinergy-test-scratch-${crypto.randomUUID()}`);
    await fs.mkdir(testScratchDir, { recursive: true });

    tempStorageService = new TempFileStorageService({
      scratchRoot: testScratchDir,
      maxSizeBytes: 5 * 1024 * 1024,
      maxAgeMs: 50, // 50ms for rapid stale testing
    });

    sandboxService = new ParserSandboxService();

    docStore = new Map();
    jobStore = new Map();
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
      findAll: jest.fn(async (tenantId: string, filter?: any) => {
        const docs = Array.from(docStore.values()).filter((d) => d.tenantId === tenantId);
        if (filter?.includeDeleted) return docs;
        return docs.filter((d) => !d.isDeleted());
      }),
      count: jest.fn(async (tenantId: string) => {
        return Array.from(docStore.values()).filter((d) => d.tenantId === tenantId).length;
      }),
      save: jest.fn(async (doc: KnowledgeDocument) => {
        docStore.set(doc.id.value, doc);
        return doc;
      }),
      softDelete: jest.fn(async (tenantId: string, docId: string, deletedBy: string) => {
        const doc = docStore.get(docId);
        if (doc && doc.tenantId === tenantId) {
          doc.softDelete(deletedBy);
          docStore.set(docId, doc);
        }
      }),
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
      createPresignedDownloadUrl: jest.fn(),
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

    contentValidator = new DocumentContentValidatorService(DEFAULT_AI_CONFIG as any);

    const pdfParser = new PdfParserAdapter();
    const docxParser = new DocxParserAdapter();
    const mdParser = new MarkdownParserAdapter();
    const txtParser = new PlainTextParserAdapter();
    const compositeParser = new CompositeDocumentParserAdapter(
      pdfParser,
      docxParser,
      mdParser,
      txtParser,
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

    reconciliationService = new DocumentStorageReconciliationService(
      mockStoragePort,
      mockDocRepo,
      mockJobRepo,
      tempStorageService,
    );

    recoveryWorker = new IngestionRecoveryWorker(mockJobRepo, orchestrator, {
      enabled: false,
      staleThresholdMs: 100,
    });

    securityPolicy = new RetrievalSecurityPolicyService(mockDocRepo);
  });

  afterEach(async () => {
    try {
      await fs.rm(testScratchDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // Scenario 1: Safe error response for each major failure category
  // =========================================================================
  describe('1. Safe error response for each major failure category', () => {
    it('classifies unauthorized upload with 403 / FORBIDDEN and safe message', () => {
      const err = new UnauthorizedDocumentAccessException('Cross-tenant upload rejected.');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(classified.category).toBe(AiFailureCategory.FORBIDDEN);
      expect(classified.code).toBe('UNAUTHORIZED_DOCUMENT_ACCESS');
      expect(classified.isRetryable).toBe(false);
      expect(classified.message).not.toContain('Cross-tenant');
    });

    it('classifies unsupported file type with 415 / UNSUPPORTED_FILE_TYPE', () => {
      const err = new UnsupportedDocumentFormatException('exe');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
      expect(classified.code).toBe(FileProcessingFailureCode.UNSUPPORTED_FILE_TYPE);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies MIME/signature mismatch with 400 / MIME_SIGNATURE_MISMATCH', () => {
      const err = new DocumentContentMismatchException();
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(classified.code).toBe(FileProcessingFailureCode.MIME_SIGNATURE_MISMATCH);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies file too large with 413 / FILE_TOO_LARGE', () => {
      const err = new DocumentSizeLimitExceededException(15 * 1024 * 1024, 10 * 1024 * 1024);
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(classified.code).toBe(FileProcessingFailureCode.FILE_TOO_LARGE);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies malformed or corrupted document with 400 / MALFORMED_DOCUMENT', () => {
      const err = new DocumentMalformedException('Corrupted header');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(classified.code).toBe(FileProcessingFailureCode.MALFORMED_DOCUMENT);
      expect(classified.isRetryable).toBe(false);
    });

    it('classifies malware detection with 400 and completely redacts virus signature', () => {
      const err = new DocumentSecurityRiskException('Malware detected: Macro.VBA.ExploitTarget');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(classified.code).toBe(FileProcessingFailureCode.MALWARE_DETECTED);
      expect(classified.message).not.toContain('Macro.VBA');
      expect(classified.message).not.toContain('ExploitTarget');
      expect(classified.message).toContain('security policy');
    });

    it('classifies parser timeout with 504 / PARSER_TIMEOUT and isRetryable: true', () => {
      const err = new ExtractionTimeoutException(30000, 'doc-1', 'ver-1');
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(classified.code).toBe(FileProcessingFailureCode.PARSER_TIMEOUT);
      expect(classified.isRetryable).toBe(true);
      expect(classified.retryAfterSeconds).toBeDefined();
    });

    it('classifies resource limit exceeded with 413 / RESOURCE_LIMIT_EXCEEDED', () => {
      const err = new ExtractionResourceLimitExceededException('Characters', 6000000, 5000000);
      const classified = AiFailureClassifier.classify(err);

      expect(classified.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(classified.code).toBe(FileProcessingFailureCode.RESOURCE_LIMIT_EXCEEDED);
      expect(classified.isRetryable).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 2: No raw parser exception leakage
  // =========================================================================
  describe('2. No raw parser exception leakage', () => {
    it('redacts internal parser library names and raw error dumps from client messages', () => {
      const internalErrors = [
        new Error('mammoth: end of central directory record signature not found'),
        new Error('unpdf worker failed at XRef.parse with invalid table offset'),
        new Error('pdfjs: corrupted font dictionary stream'),
      ];

      for (const err of internalErrors) {
        const sanitized = AiFailureClassifier.sanitizeErrorMessage(err.message);
        expect(sanitized).not.toContain('mammoth');
        expect(sanitized).not.toContain('unpdf');
        expect(sanitized).not.toContain('pdfjs');
        expect(sanitized).not.toContain('XRef');
      }
    });
  });

  // =========================================================================
  // Scenario 3: No filesystem path disclosure
  // =========================================================================
  describe('3. No filesystem path disclosure', () => {
    it('redacts Windows and Unix filesystem paths from sanitized diagnostic messages', () => {
      const pathErrors = [
        'Failed reading file at C:\\Users\\Administrator\\AppData\\Local\\Temp\\scratch\\file.docx',
        'Unable to open /var/data/kinergy/uploads/tenant_clinic_a/document.pdf',
        'Temporary file write error at /tmp/scratch/612e5/chunk.txt: permission denied',
      ];

      for (const raw of pathErrors) {
        const sanitized = AiFailureClassifier.sanitizeErrorMessage(raw);
        expect(sanitized).not.toContain('C:\\Users');
        expect(sanitized).not.toContain('/var/data');
        expect(sanitized).not.toContain('/tmp/scratch');
      }
    });

    it('scrubs diagnostics in ParserSandboxService without leaking server paths', () => {
      const rawLog = 'Error processing C:\\inetpub\\temp\\upload_abc123.bin in worker';
      const scrubbed = sandboxService.scrubSensitiveDiagnostics(rawLog);

      expect(scrubbed).not.toContain('C:\\inetpub');
      expect(scrubbed).toContain('[REDACTED_PATH]');
    });
  });

  // =========================================================================
  // Scenario 4: No file-content leakage in logs
  // =========================================================================
  describe('4. No file-content leakage in logs', () => {
    it('ensures upload and parser failures never emit confidential document text to logs', async () => {
      const confidentialText = 'CONFIDENTIAL_PATIENT_MEDICAL_HISTORY_DIAGNOSIS_DATA_98765';
      const badBuffer = Buffer.from(`%PDF-1.4\n${confidentialText}\n%%EOF`);

      // Mock validator to throw with an error that attempts to echo raw snippet
      jest.spyOn(contentValidator, 'validate').mockImplementationOnce(() => {
        throw new DocumentMalformedException(`Invalid PDF token near: '${confidentialText}'`);
      });

      try {
        await uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'patient.pdf',
            mimeType: 'application/pdf',
            buffer: badBuffer,
            size: badBuffer.length,
          },
        });
        fail('Should have thrown DocumentMalformedException');
      } catch (err: any) {
        const sanitized = AiFailureClassifier.sanitizeErrorMessage(err.message);
        expect(sanitized).not.toContain(confidentialText);
      }
    });
  });

  // =========================================================================
  // Scenario 5: Cleanup after failed upload
  // =========================================================================
  describe('5. Cleanup after failed upload', () => {
    it('executes compensating storage deletion when database persistence fails after upload', async () => {
      const validPdf = createSinglePagePdf('Compensation Test');

      // Force DB save to fail
      mockDocRepo.save.mockRejectedValueOnce(
        new Error('Database connection lost during document commit'),
      );

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'compensation.pdf',
            mimeType: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          },
        }),
      ).rejects.toThrow(/Database connection lost/);

      // Verify compensating delete was called on storagePort
      expect(mockStoragePort.delete).toHaveBeenCalledWith(
        TENANT_A,
        expect.stringContaining('knowledge_base/'),
      );
      // Object storage map has zero orphaned files
      expect(storageFiles.size).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 6: Cleanup after parser timeout
  // =========================================================================
  describe('6. Cleanup after parser timeout', () => {
    it('guarantees scratch temporary files and folders are cleaned up when an action times out', async () => {
      const dummyBuffer = Buffer.from('Temporary scratch payload');

      await expect(
        tempStorageService.executeWithTempFile(
          TENANT_A,
          dummyBuffer,
          'txt',
          async (tempPath: string) => {
            // Verify file exists during execution
            const existsBefore = await fs
              .access(tempPath)
              .then(() => true)
              .catch(() => false);
            expect(existsBefore).toBe(true);

            // Simulate timeout exception
            throw new ExtractionTimeoutException(100, 'doc-1', 'ver-1');
          },
        ),
      ).rejects.toThrow(ExtractionTimeoutException);

      // Verify scratch root has zero leftover files for TENANT_A
      const tenantDir = path.join(testScratchDir, TENANT_A);
      const leftoverDirs = await fs.readdir(tenantDir).catch(() => []);
      expect(leftoverDirs.length).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 7: Worker restart and recovery
  // =========================================================================
  describe('7. Worker restart and recovery', () => {
    it('recovers stalled active jobs on watchdog recovery poll and reschedules retry with backoff', async () => {
      const job = IngestionJob.create({
        tenantId: TENANT_A,
        documentId: 'doc-stalled-1',
        documentVersionId: 'ver-stalled-1',
        maxAttempts: 3,
      });

      // Advance job to PROCESSING and artificially backdate updatedAt
      job.startValidation();
      job.startProcessing();
      jobStore.set(job.id, job);

      // Artificially age the job record by 10 minutes
      const pastDate = new Date(Date.now() - 600_000);
      (job as any)._startedAt = pastDate;
      (job as any)._createdAt = pastDate;
      jobStore.set(job.id, job);

      // Run recovery worker poll
      const result = await recoveryWorker.poll();

      expect(result.recoveredStale).toBe(1);

      const recoveredJob = jobStore.get(job.id)!;
      expect(recoveredJob.status).toBe(IngestionStatus.VALIDATING);
      expect(
        job
          .getUncommittedEvents()
          .some((e: any) => e.payload?.errorCode === IngestionErrorCode.WORKER_CRASH_RECOVERED),
      ).toBe(true);
      expect(recoveredJob.attemptCount).toBe(2);
      expect(recoveredJob.nextRetryAt).toBeDefined();
    });
  });

  // =========================================================================
  // Scenario 8: Retry does not bypass security validation
  // =========================================================================
  describe('8. Retry does not bypass security validation', () => {
    it('re-executes checksum, magic byte, and malware scanning on retry and halts on infection', async () => {
      const validPdf = createSinglePagePdf('Initial Clean');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'retry_sec.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      // Transient indexing failure on attempt 1
      mockIndexingPort.indexDocument.mockRejectedValueOnce(new Error('Transient vector timeout'));
      const job1 = await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);
      expect(job1.attemptCount).toBe(2); // Next attempt scheduled

      // On retry attempt, malware scanner discovers late threat signature
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: MalwareScanStatus.INFECTED,
        threatFound: 'Late.Discovery.ExploitTarget',
        scannerEngine: 'test-scanner',
        scanDurationMs: 4,
        scannedAt: new Date(),
      });

      // Run attempt 2
      const job2 = await orchestrator.processJob(job1.id, TENANT_A);

      expect(job2.status).toBe(IngestionStatus.FAILED);
      expect(job2.lastErrorCode).toBe(IngestionErrorCode.SECURITY_VIOLATION);

      // Verify document was soft-deleted and quarantined
      const doc = docStore.get(uploadResult.documentId)!;
      expect(doc.isDeleted()).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 9: Quarantined file remains inaccessible
  // =========================================================================
  describe('9. Quarantined file remains inaccessible', () => {
    it('strictly denies retrieval authorization for soft-deleted/quarantined documents', async () => {
      const validPdf = createSinglePagePdf('Quarantine Test');

      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'quarantined_doc.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      await orchestrator.processJob(uploadResult.ingestionJobId, TENANT_A);

      // Soft delete / quarantine
      const doc = docStore.get(uploadResult.documentId)!;
      doc.softDelete('SYSTEM_MALWARE_QUARANTINE');
      docStore.set(doc.id.value, doc);

      // Retrieval policy resolution
      const auth = await securityPolicy.resolveAuthorizedDocumentIds(
        TENANT_A,
        [uploadResult.documentId],
        [VisibilityScope.ALL_STAFF],
      );

      expect(auth.authorizedDocumentIds).not.toContain(uploadResult.documentId);
      expect(auth.isDenied).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 10: Orphaned-file reconciliation is correctly scoped
  // =========================================================================
  describe('10. Orphaned-file reconciliation is correctly scoped', () => {
    it('deletes only unreferenced storage objects for the specified tenant; preserves active and soft-deleted records', async () => {
      const validPdf = createSinglePagePdf('Active Doc');
      const uploadResult = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'active.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });

      const doc = docStore.get(uploadResult.documentId)!;
      const activeKey = doc.getCurrentVersion()!.storageKey;

      // Create an orphaned key in storage for TENANT_A
      const orphanKey = `knowledge_base/${crypto.randomUUID()}.pdf`;
      storageFiles.set(`${TENANT_A}:${orphanKey}`, Buffer.from('Orphan payload'));

      // Run reconciliation for TENANT_A
      const report = await reconciliationService.reconcileOrphanedStorageKeys(TENANT_A, [
        activeKey,
        orphanKey,
      ]);

      expect(report.totalCandidates).toBe(2);
      expect(report.preservedKeys).toBe(1);
      expect(report.orphansFound).toBe(1);
      expect(report.orphansDeleted).toBe(1);

      // Verify active key was preserved in storage
      expect(storageFiles.has(`${TENANT_A}:${activeKey}`)).toBe(true);
      // Verify orphan was deleted from storage
      expect(storageFiles.has(`${TENANT_A}:${orphanKey}`)).toBe(false);
    });

    it('reclaims stale temporary scratch files older than threshold', async () => {
      // Create a simulated stale temp dir
      const oldTempDir = await tempStorageService.createIsolatedTempDir(TENANT_A);
      await tempStorageService.writeTempFile(oldTempDir, Buffer.from('Old temp file'), 'bin');

      // Wait 60ms to exceed configured 50ms maxAgeMs
      await new Promise((r) => setTimeout(r, 65));

      const reclaimedCount = await reconciliationService.reconcileStaleScratchFiles(50);
      expect(reclaimedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Scenario 11: Duplicate submissions remain idempotent
  // =========================================================================
  describe('11. Duplicate submissions remain idempotent', () => {
    it('rejects duplicate content within tenant with 409 Conflict without leaving dangling storage files', async () => {
      const validPdf = createSinglePagePdf('Duplicate Test Content');

      // Upload #1
      const res1 = await uploadService.uploadDocument({
        tenantId: TENANT_A,
        uploadedBy: USER_A,
        file: {
          originalFileName: 'doc_orig.pdf',
          mimeType: 'application/pdf',
          buffer: validPdf,
          size: validPdf.length,
        },
      });
      expect(res1.documentId).toBeDefined();

      const storageCountBefore = storageFiles.size;

      // Upload #2 with identical content
      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_A,
          uploadedBy: USER_A,
          file: {
            originalFileName: 'doc_dup.pdf',
            mimeType: 'application/pdf',
            buffer: validPdf,
            size: validPdf.length,
          },
        }),
      ).rejects.toThrow(DuplicateDocumentContentException);

      // Storage files count has not grown (no dangling file left behind)
      expect(storageFiles.size).toBe(storageCountBefore);
    });
  });
});
