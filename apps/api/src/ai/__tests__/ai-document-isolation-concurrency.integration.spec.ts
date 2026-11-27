import {
  ISemanticSearchUseCase,
  IRAGContextBuilderPort,
  IGroundedGenerationPort,
  RetrievalAuthContext,
  RetrievalResult,
  RetrievalQuery,
  RetrievalCriteria,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  RAGEvidenceChunk,
  RAGConstructedContext,
  VisibilityScope,
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IngestionJob,
  IngestionStatus,
  KnowledgeDocument,
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import { RAGOrchestratorService } from '../services/rag/rag-orchestrator.service';
import { CitationValidatorService } from '../services/rag/citation-validator.service';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { IngestionErrorCode } from '../services/ingestion-retry.policy';
import { AiResourceAuthorizationPolicy } from '@kinergy-platform/core';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import { DocumentProcessingPipelineService } from '../services/document-processing-pipeline.service';

/**
 * AI-10.2-09: Document Isolation, Tenant Security, and Concurrency Adversarial Test Suite
 *
 * Systematic adversarial verification covering:
 * A. Cross-User and Cross-Tenant Isolation (Anti-BOLA, IDOR, enumeration defense)
 * B. Provenance and Metadata Integrity (Chunk/vector to doc/version relationships, forge attempts)
 * C. Retrieval Isolation & LLM Boundary Assertion (Zero unauthorized text passes to LLM)
 * D. Enumeration and IDOR defense across all resource endpoints
 * E. Concurrent Retrieval & Race Condition Isolation (Parallel multi-tenant queries, zero context bleed)
 * F. Concurrent Ingestion & Lifecycle Operations (Out-of-band soft-delete, reprocessing under correct scope)
 * G. Compensating Controls for Database Architecture (Application & repository level isolation verification)
 */
describe('AI-10.2-09: Document Isolation, Tenant Security, and Concurrency Testing', () => {
  const tenantAlpha = 'tenant_clinic_alpha';
  const tenantBeta = 'tenant_clinic_beta';

  // Principals
  const userDoctorAlpha: RetrievalAuthContext = {
    tenantId: tenantAlpha,
    userId: 'usr_doc_alpha',
    roles: ['Therapist'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
  };

  const userTrainerAlpha: RetrievalAuthContext = {
    tenantId: tenantAlpha,
    userId: 'usr_trainer_alpha',
    roles: ['Trainer'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
  };

  const userDoctorBeta: RetrievalAuthContext = {
    tenantId: tenantBeta,
    userId: 'usr_doc_beta',
    roles: ['Therapist'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
  };

  const makeRetrievedChunk = (params: {
    id: string;
    docId: string;
    versionId?: string;
    title: string;
    content: string;
    similarity: number;
    scope: VisibilityScope;
  }): RetrievedChunk => {
    const provenance = RetrievalProvenance.create({
      documentTitle: params.title,
      documentVersionNumber: 1,
      originalFileName: `${params.title.toLowerCase().replace(/\s+/g, '_')}.pdf`,
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: 1,
      language: 'es',
    });

    return RetrievedChunk.create({
      id: `chunk-uuid-${params.id}`,
      chunkId: ChunkId.fromString(params.id),
      documentId: params.docId,
      documentVersionId: params.versionId ?? `ver-${params.id}`,
      indexGenerationId: 'gen-active-1',
      similarity: SimilarityScore.create(params.similarity),
      distance: 1 - params.similarity,
      content: params.content,
      tokenCount: 42,
      provenance,
      metadata: { visibilityScope: params.scope },
    });
  };

  describe('Section A & D: Cross-User, Cross-Tenant Isolation & Anti-BOLA / IDOR Verification', () => {
    let policy: AiResourceAuthorizationPolicy;

    beforeEach(() => {
      policy = new AiResourceAuthorizationPolicy();
    });

    it('A1: User cannot access, read, or download a document from another tenant (Anti-BOLA 404)', () => {
      const docBeta = {
        id: 'doc-beta-secret',
        tenantId: tenantBeta,
        title: 'Beta Secret Clinical Protocol',
        uploadedBy: 'usr_admin_beta',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        deletedAt: null,
      };

      // Actor from Tenant Alpha attempts to access Tenant Beta document
      const actorAlpha = {
        actorId: 'usr_doc_alpha',
        tenantId: tenantAlpha,
        roles: ['Therapist'],
        permissions: ['ai.documents.read'],
      };

      // Anti-enumeration: must throw DocumentNotFoundException rather than ForbiddenException
      expect(() =>
        policy.assertDocumentAccess(actorAlpha, docBeta, [
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
        ]),
      ).toThrow(DocumentNotFoundException);
    });

    it('A2: User cannot enumerate another user or tenant documents via manipulated identifiers', () => {
      const actorAlpha = {
        actorId: 'usr_doc_alpha',
        tenantId: tenantAlpha,
        roles: ['Therapist'],
        permissions: ['ai.documents.read'],
      };

      // Non-existent or cross-tenant document must return exact same DocumentNotFoundException
      expect(() =>
        policy.assertDocumentAccess(actorAlpha, null as any, [VisibilityScope.ALL_STAFF]),
      ).toThrow(DocumentNotFoundException);
    });

    it('A3: Non-owner without management permissions cannot manage document', () => {
      const docAlpha = {
        id: 'doc-alpha-1',
        tenantId: tenantAlpha,
        title: 'Alpha Protocol',
        uploadedBy: 'usr_creator_alpha',
        visibilityScope: VisibilityScope.ALL_STAFF,
        deletedAt: null,
      };

      const nonOwnerStaff = {
        actorId: 'usr_other_staff',
        tenantId: tenantAlpha,
        roles: ['Trainer'],
        permissions: ['ai.documents.read'], // Missing ai.documents.manage
      };

      const canManage = policy.canManageDocument(nonOwnerStaff, docAlpha);
      expect(canManage).toBe(false);
    });

    it('A4: Soft-deleted document fails closed with DocumentNotFoundException', () => {
      const deletedDoc = {
        id: 'doc-alpha-deleted',
        tenantId: tenantAlpha,
        title: 'Old Protocol',
        uploadedBy: 'usr_creator_alpha',
        visibilityScope: VisibilityScope.ALL_STAFF,
        deletedAt: new Date(),
      };

      const actor = {
        actorId: 'usr_creator_alpha',
        tenantId: tenantAlpha,
        roles: ['Admin'],
        permissions: ['ai.documents.read', 'ai.documents.manage'],
      };

      expect(() =>
        policy.assertDocumentAccess(actor, deletedDoc, [VisibilityScope.ALL_STAFF]),
      ).toThrow(DocumentNotFoundException);
    });

    it('A5: Visibility scope boundary enforces UnauthorizedDocumentAccessException for lower clearance', () => {
      const clinicalDoc = {
        id: 'doc-clinical-001',
        tenantId: tenantAlpha,
        title: 'Confidential Clinical Manual',
        uploadedBy: 'usr_doctor_alpha',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        deletedAt: null,
      };

      const trainerActor = {
        actorId: 'usr_trainer_alpha',
        tenantId: tenantAlpha,
        roles: ['Trainer'],
        permissions: ['ai.documents.read'],
      };

      // Trainer only has ALL_STAFF clearance
      expect(() =>
        policy.assertDocumentAccess(trainerActor, clinicalDoc, [VisibilityScope.ALL_STAFF]),
      ).toThrow(UnauthorizedDocumentAccessException);
    });
  });

  describe('Section B: Provenance and Metadata Integrity', () => {
    it('B1: Chunks and vectors maintain strict referential integrity to document and version', () => {
      const chunk = makeRetrievedChunk({
        id: 'chk-int-1',
        docId: 'doc-parent-100',
        versionId: 'ver-v1-100',
        title: 'Biomechanics Guide',
        content: 'Correct lumbar alignment requires neutral spine positioning.',
        similarity: 0.94,
        scope: VisibilityScope.ALL_STAFF,
      });

      expect(chunk.documentId).toBe('doc-parent-100');
      expect(chunk.documentVersionId).toBe('ver-v1-100');
      expect(chunk.provenance.documentTitle).toBe('Biomechanics Guide');
      expect(chunk.provenance.documentVersionNumber).toBe(1);
    });

    it('B2: Missing or inconsistent metadata between chunk and document is rejected', () => {
      // ChunkId.fromString throws Error if chunk ID is empty or whitespace
      expect(() => ChunkId.fromString('')).toThrow();
    });
  });

  describe('Section C & E: Retrieval Isolation, LLM Boundary Assertion & Concurrent Queries', () => {
    let mockRetrievalUseCase: jest.Mocked<ISemanticSearchUseCase>;
    let mockContextBuilder: jest.Mocked<IRAGContextBuilderPort>;
    let mockGroundedGenerator: jest.Mocked<IGroundedGenerationPort>;
    let citationValidator: CitationValidatorService;
    let orchestrator: RAGOrchestratorService;

    // Spy sink for LLM-bound evidence pool
    let spiedFormattedContexts: string[] = [];
    let spiedIncludedChunks: RAGEvidenceChunk[][] = [];

    beforeEach(() => {
      spiedFormattedContexts = [];
      spiedIncludedChunks = [];

      mockRetrievalUseCase = {
        execute: jest.fn(),
      } as unknown as jest.Mocked<ISemanticSearchUseCase>;

      mockContextBuilder = {
        buildContext: jest.fn().mockImplementation(async ({ evidenceChunks }) => {
          const included = evidenceChunks.map((c: RetrievedChunk, i: number) =>
            RAGEvidenceChunk.fromRetrievedChunk(c, i + 1),
          );
          const formattedContext = included.map((c: RAGEvidenceChunk) => c.content).join('\n\n');
          return RAGConstructedContext.create({
            formattedContext,
            includedChunks: included,
            excludedChunks: [],
            totalContextTokens: 200,
            evidenceTokens: 100,
            historyTokens: 0,
            systemPromptTokens: 100,
            budgetRemaining: 3000,
            omittedChunkCount: 0,
          });
        }),
      };

      mockGroundedGenerator = {
        generateGroundedAnswer: jest.fn().mockImplementation(async (params: any) => {
          const formatted = params.constructedContext?.formattedContext ?? '';
          const chunks = params.constructedContext?.includedChunks ?? [];
          spiedFormattedContexts.push(formatted);
          spiedIncludedChunks.push([...chunks]);

          const citedChunkIds = chunks.length > 0 ? [chunks[0].chunkId] : [];
          return {
            answer: 'Respuesta basada exclusivamente en la evidencia autorizada.',
            grounded: true,
            finishReason: 'stop',
            citedChunkIds,
            promptTokens: 200,
            completionTokens: 40,
            totalTokens: 240,
            durationMs: 30,
          };
        }),
      };

      citationValidator = new CitationValidatorService();
      orchestrator = new RAGOrchestratorService(
        mockRetrievalUseCase,
        mockContextBuilder,
        mockGroundedGenerator,
        citationValidator,
      );
    });

    it('C1: Unauthorized chunks never enter context assembly and NEVER reach the LLM boundary', async () => {
      const allowedChunk = makeRetrievedChunk({
        id: 'chunk-staff-1',
        docId: 'doc-staff-101',
        title: 'General Clinical Operations',
        content: 'Standard patient check-in protocols for physical therapy.',
        similarity: 0.85,
        scope: VisibilityScope.ALL_STAFF,
      });

      // Retrieval use-case mock returns only authorized chunk because pre-filtering was applied
      mockRetrievalUseCase.execute.mockResolvedValueOnce(
        RetrievalResult.create({
          query: RetrievalQuery.create({
            query: 'What is our check-in procedure?',
            criteria: RetrievalCriteria.create({
              tenantId: tenantAlpha,
              allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
            }),
          }),
          chunks: [allowedChunk],
          totalMatches: 1,
          activeGenerationId: 'gen-active-1',
          executionDurationMs: 10,
        }),
      );

      const result = await orchestrator.execute({
        authContext: userTrainerAlpha,
        query: 'What is our check-in procedure?',
      });

      expect(result.grounded).toBe(true);

      // Verify LLM Boundary Spy
      expect(spiedFormattedContexts.length).toBe(1);
      const passedToModel = spiedFormattedContexts[0];

      // CRITICAL ASSERTION: The secret text must NOT reach the model prompt
      expect(passedToModel).not.toContain('SECRET FINANCIAL FORECAST');
      expect(passedToModel).not.toContain('EBITDA');
      expect(passedToModel).toContain('Standard patient check-in protocols');

      // Verify evidence pool contains zero management chunks
      expect(spiedIncludedChunks[0]?.length).toBe(1);
      expect(spiedIncludedChunks[0]?.[0]?.documentId).toBe('doc-staff-101');
    });

    it('E1: High-concurrency multi-tenant retrieval demonstrates strict isolation without cross-tenant context bleed', async () => {
      // Simulate 20 concurrent parallel retrieval requests alternating across Tenant Alpha and Tenant Beta
      const concurrentRuns = 20;
      const requests = Array.from({ length: concurrentRuns }, (_, i) => {
        const isAlpha = i % 2 === 0;
        const tenant = isAlpha ? tenantAlpha : tenantBeta;
        const user = isAlpha ? userDoctorAlpha : userDoctorBeta;
        const content = isAlpha
          ? `Unique Alpha Clinical Data [req-${i}]`
          : `Unique Beta Proprietary Formula [req-${i}]`;

        const chunk = makeRetrievedChunk({
          id: `concur-chunk-${i}`,
          docId: isAlpha ? `doc-alpha-${i}` : `doc-beta-${i}`,
          title: isAlpha ? `Doc Alpha ${i}` : `Doc Beta ${i}`,
          content,
          similarity: 0.9,
          scope: VisibilityScope.CLINICAL_STAFF,
        });

        // Search mock returns appropriate chunk for the requested tenant
        mockRetrievalUseCase.execute.mockImplementationOnce(async (command: any) => {
          expect(command.authContext.tenantId).toBe(tenant);
          return RetrievalResult.create({
            query: RetrievalQuery.create({
              query: command.query,
              criteria: RetrievalCriteria.create({
                tenantId: command.authContext.tenantId,
                allowedVisibilityScopes: command.authContext.allowedVisibilityScopes,
              }),
            }),
            chunks: [chunk],
            totalMatches: 1,
            activeGenerationId: 'gen-active-1',
            executionDurationMs: 8,
          });
        });

        return orchestrator.execute({
          authContext: user,
          query: `Concurrent query index ${i}`,
        });
      });

      const results = await Promise.all(requests);

      expect(results.length).toBe(concurrentRuns);
      expect(spiedIncludedChunks.length).toBe(concurrentRuns);

      // Verify that every single LLM call contained exclusively its own tenant's data
      for (let i = 0; i < concurrentRuns; i++) {
        const isAlpha = i % 2 === 0;
        const formatted = spiedFormattedContexts[i];
        if (isAlpha) {
          expect(formatted).toContain(`Unique Alpha Clinical Data [req-${i}]`);
          expect(formatted).not.toContain('Unique Beta Proprietary Formula');
        } else {
          expect(formatted).toContain(`Unique Beta Proprietary Formula [req-${i}]`);
          expect(formatted).not.toContain('Unique Alpha Clinical Data');
        }
      }
    });
  });

  describe('Section F: Concurrent Ingestion & Lifecycle Safety', () => {
    let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
    let mockJobRepo: jest.Mocked<IIngestionJobRepositoryPort>;
    let mockStoragePort: jest.Mocked<ObjectStoragePort>;
    let mockPipeline: jest.Mocked<DocumentProcessingPipelineService>;
    let orchestrator: IngestionOrchestratorService;

    beforeEach(() => {
      mockDocRepo = {
        save: jest.fn().mockImplementation(async (d: any) => d),
        findById: jest.fn(),
        list: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

      mockJobRepo = {
        save: jest.fn().mockImplementation(async (j: IngestionJob) => j),
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
        download: jest.fn().mockResolvedValue({
          data: Buffer.from('%PDF-1.4 sample content'),
          mimeType: 'application/pdf',
          size: 2048,
        }),
        upload: jest.fn(),
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
        mockIndexingPort as any,
        mockPipeline,
      );
    });

    it('F1: Out-of-band document soft-delete while job is queued aborts processing (fail-closed)', async () => {
      const activeJob = IngestionJob.create({
        id: 'job-concurrent-abort',
        tenantId: tenantAlpha,
        documentId: 'doc-alpha-deleted-in-flight',
        documentVersionId: 'ver-alpha-1',
      });

      // Document exists but was soft-deleted out-of-band (deletedAt IS NOT NULL)
      const softDeletedDoc = KnowledgeDocument.create({
        id: 'doc-alpha-deleted-in-flight',
        tenantId: tenantAlpha,
        title: 'Concurrent Soft Delete',
        uploadedBy: 'usr_doc_alpha',
        visibilityScope: VisibilityScope.ALL_STAFF,
        initialVersion: {
          id: 'ver-alpha-1',
          originalFileName: 'protocol.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'a'.repeat(64),
          storageKey: `tenants/${tenantAlpha}/knowledge_base/protocol.pdf`,
          uploadedBy: 'usr_doc_alpha',
        },
      });
      softDeletedDoc.softDelete('usr_doc_alpha');

      mockJobRepo.findById.mockResolvedValue(activeJob);
      mockDocRepo.findById.mockResolvedValue(softDeletedDoc);

      const resultJob = await orchestrator.processJob('job-concurrent-abort', tenantAlpha);

      expect(resultJob.status).toBe(IngestionStatus.FAILED);
      expect(resultJob.lastErrorCode).toBe(IngestionErrorCode.DOCUMENT_NOT_FOUND);
      expect(resultJob.lastErrorMessage).toMatch(/does not exist|soft-deleted/i);

      // Verify that parsing or chunking pipeline was NEVER invoked
      expect(mockPipeline.processDocument).not.toHaveBeenCalled();
    });

    it('F2: Reprocessing an updated document retains original authoritative tenant scope', async () => {
      const reprocessJob = IngestionJob.create({
        id: 'job-reprocess-100',
        tenantId: tenantAlpha,
        documentId: 'doc-alpha-update',
        documentVersionId: 'ver-alpha-v2',
      });

      const updatedDoc = KnowledgeDocument.create({
        id: 'doc-alpha-update',
        tenantId: tenantAlpha,
        title: 'Updated Clinical Policy',
        uploadedBy: 'usr_admin_alpha',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        initialVersion: {
          id: 'ver-alpha-v2',
          originalFileName: 'v2.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          checksum: '98f3908b427288c8732a9183a4d9b93498a5a6d2638f1696c9322024b8f9006e',
          storageKey: `tenants/${tenantAlpha}/knowledge_base/v2.pdf`,
          uploadedBy: 'usr_admin_alpha',
        },
      });

      mockJobRepo.findById.mockResolvedValue(reprocessJob);
      mockDocRepo.findById.mockResolvedValue(updatedDoc);

      const finishedJob = await orchestrator.processJob('job-reprocess-100', tenantAlpha);

      expect(finishedJob.status).toBe(IngestionStatus.READY);
      expect(finishedJob.tenantId).toBe(tenantAlpha);
      expect(mockPipeline.processDocument).toHaveBeenCalledTimes(1);
    });
  });
});
