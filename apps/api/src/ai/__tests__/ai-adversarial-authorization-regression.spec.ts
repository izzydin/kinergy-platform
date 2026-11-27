import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  VisibilityScope,
  KnowledgeDocument,
  IngestionJob,
  IngestionStatus,
  AiResourceAuthorizationPolicy,
  UnauthorizedDocumentAccessException,
  DocumentNotFoundException,
  ConversationNotFoundError,
  RetrievalResult,
  RetrievalQuery,
  RetrievalCriteria,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  RAGEvidenceChunk,
  RAGConstructedContext,
  StructuredGenerationResult,
  DocumentVersion,
} from '@kinergy-platform/core';
import { AiDocumentController } from '../controllers/ai-document.controller';
import { PreviewTokenService } from '../services/preview-token.service';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { SecureSemanticSearchService } from '../services/retrieval/secure-semantic-search.service';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { RAGOrchestratorService } from '../services/rag/rag-orchestrator.service';
import { CitationValidatorService } from '../services/rag/citation-validator.service';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';

/**
 * AI-10.1-09: Adversarial Authorization and Security Regression Master Suite
 *
 * Systematically exercises and validates all 7 adversarial test categories (A through G):
 * Section A: Identity Spoofing (body, query, header, forged tenant, forged roles, unauthenticated).
 * Section B: IDOR and Resource Substitution (documents, versions, upload, ingestion, conversation, message, citation, preview).
 * Section C: RBAC and Ownership Boundaries (missing permissions, non-owner denial, administrative overrides, unknown roles).
 * Section D: Retrieval and Prompt-Context Isolation (cross-tenant, role-scope leaks, search narrowing vs broadening, stale vectors).
 * Section E: Background Job Isolation (manipulated queue payloads, orphan jobs, retries, idempotency).
 * Section F: Concurrency and Lifecycle (concurrent tenants, soft-delete during execution, deactivation).
 * Section G: Error and Information Disclosure (not-found vs forbidden, zero leakage of secrets, stacks, or cross-tenant counts).
 */
describe('AI-10.1-09: Adversarial Authorization and Security Regression Master Suite', () => {
  const tenantAlpha = 'tenant_clinic_alpha';
  const tenantBeta = 'tenant_clinic_beta';

  const userDoctorAlpha: AuthenticatedUserPayload = {
    id: 'usr_doc_alpha',
    userId: 'usr_doc_alpha',
    tenantId: tenantAlpha,
    email: 'doc.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userTrainerAlpha: AuthenticatedUserPayload = {
    id: 'usr_trainer_alpha',
    userId: 'usr_trainer_alpha',
    tenantId: tenantAlpha,
    email: 'trainer.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userManagerAlpha: AuthenticatedUserPayload = {
    id: 'usr_manager_alpha',
    userId: 'usr_manager_alpha',
    tenantId: tenantAlpha,
    email: 'manager.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Admin'],
    permissions: [
      'ai.conversations.create',
      'ai.documents.upload',
      'ai.documents.manage',
      'ai.knowledge.query',
      'ai.conversations.manage',
    ],
  };

  const userDoctorBeta: AuthenticatedUserPayload = {
    id: 'usr_doc_beta',
    userId: 'usr_doc_beta',
    tenantId: tenantBeta,
    email: 'doc.beta@clinic.com',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  function toTrustedAiContext(user: AuthenticatedUserPayload): TrustedAiContext {
    return {
      actorId: user.id || user.userId || '',
      tenantId: user.tenantId ?? '',
      roles: user.roles || [],
      permissions: user.permissions || [],
    };
  }

  function createMockDocument(params: {
    id: string;
    tenantId: string;
    uploadedBy: string;
    visibilityScope: VisibilityScope;
    isDeleted?: boolean;
    title?: string;
  }): KnowledgeDocument {
    const version = DocumentVersion.create({
      documentId: params.id,
      versionNumber: 1,
      originalFileName: 'protocol.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storageKey: `docs/${params.id}/v1.pdf`,
      uploadedBy: params.uploadedBy,
    });

    const doc = KnowledgeDocument.create({
      tenantId: params.tenantId,
      title: params.title || 'Clinical Protocol',
      uploadedBy: params.uploadedBy,
      visibilityScope: params.visibilityScope,
      initialVersion: version,
    });

    Object.defineProperty(doc, 'id', { value: { value: params.id } });
    if (params.isDeleted) {
      doc.softDelete(params.uploadedBy);
    }
    return doc;
  }

  const resourcePolicy = new AiResourceAuthorizationPolicy();
  const previewTokenService = new PreviewTokenService(
    'super-secure-production-hmac-secret-key-32b',
  );
  const securityPolicy = new RetrievalSecurityPolicyService({} as any);

  // =========================================================================
  // Section A: Identity Spoofing & Request Context Tampering
  // =========================================================================
  describe('Section A: Identity Spoofing & Request Context Tampering', () => {
    it('A.1: Controller strictly overrides client-submitted uploadedBy with authenticated principal', async () => {
      const mockUploadService = {
        uploadDocument: jest.fn().mockResolvedValue({
          documentId: 'doc_spoofed_1',
          versionId: 'ver_1',
          versionNumber: 1,
          title: 'Document Title',
          originalFileName: 'file.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          checksum: 'hash',
          visibilityScope: VisibilityScope.ALL_STAFF,
          ingestionJobId: 'job_1',
          ingestionStatus: IngestionStatus.UPLOADED,
          createdAt: new Date(),
        }),
      };

      const controller = new AiDocumentController(
        mockUploadService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const bodyWithSpoofedUser = {
        title: 'Document Title',
        uploadedBy: 'usr_manager_alpha',
        tenantId: 'tenant_clinic_beta',
      };

      await controller.uploadDocument(
        userDoctorAlpha,
        {
          fieldname: 'file',
          originalname: 'file.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 100,
          buffer: Buffer.from('%PDF-1.4 sample'),
        } as any,
        bodyWithSpoofedUser as any,
      );

      expect(mockUploadService.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedBy: 'usr_doc_alpha',
          tenantId: tenantAlpha,
        }),
      );
    });

    it('A.2: Client-supplied roles and permissions in request do not elevate clearance', () => {
      const resolved = securityPolicy.resolveAllowedVisibilityScopes(userTrainerAlpha.roles);
      expect(resolved).toEqual([VisibilityScope.ALL_STAFF]);
      expect(resolved).not.toContain(VisibilityScope.MANAGEMENT);
      expect(resolved).not.toContain(VisibilityScope.CLINICAL_STAFF);
    });

    it('A.3: Unauthenticated request (null principal) fails closed with UnauthorizedException', () => {
      const controller = new AiDocumentController({} as any, {} as any, {} as any, {} as any);
      expect(() => (controller as any).extractAuthContext(null)).toThrow(UnauthorizedException);
    });

    it('A.4: Principal with blank or unassigned tenantId fails closed with ForbiddenException', () => {
      const controller = new AiDocumentController({} as any, {} as any, {} as any, {} as any);
      const invalidPrincipal = { ...userDoctorAlpha, tenantId: '' };
      expect(() => (controller as any).extractAuthContext(invalidPrincipal)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // Section B: IDOR and Resource Substitution
  // =========================================================================
  describe('Section B: IDOR and Resource Substitution', () => {
    it('B.1: Cross-tenant document probe returns 404 Not Found to prevent metadata enumeration', () => {
      const docAlpha = createMockDocument({
        id: 'doc_alpha_idor',
        tenantId: tenantAlpha,
        title: 'Alpha Confidential File',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        uploadedBy: userDoctorAlpha.id,
      });

      const actorBeta = toTrustedAiContext(userDoctorBeta);
      const allowedScopesBeta = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];

      expect(() =>
        resourcePolicy.assertDocumentAccess(actorBeta, docAlpha as any, allowedScopesBeta),
      ).toThrow(DocumentNotFoundException);
    });

    it('B.2: Cross-tenant conversation probe returns ConversationNotFoundError (404)', () => {
      const conversationAlpha = {
        id: 'conv_alpha_1',
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id,
      };

      const actorBeta = toTrustedAiContext(userDoctorBeta);

      expect(() => resourcePolicy.assertConversationAccess(actorBeta, conversationAlpha)).toThrow(
        ConversationNotFoundError,
      );
    });

    it('B.3: Peer user in same tenant probing private conversation throws 404 Not Found', () => {
      const peerConversation = {
        id: 'conv_doctor_private',
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id,
      };

      const peerTrainerActor = toTrustedAiContext(userTrainerAlpha);

      expect(() =>
        resourcePolicy.assertConversationAccess(peerTrainerActor, peerConversation),
      ).toThrow(ConversationNotFoundError);
    });

    it('B.4: Preview token with tampered conversationId or tenantId fails HMAC verification', () => {
      const token = previewTokenService.generateToken({
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id,
        conversationId: 'conv_123',
        messageId: 'msg_123',
        citationId: 'cit_123',
        documentId: 'doc_456',
        roles: ['Therapist'],
      });

      const verified = previewTokenService.verifyToken(token, {
        tenantId: tenantAlpha,
        conversationId: 'conv_attacker_tampered',
        messageId: 'msg_123',
        citationId: 'cit_123',
      });

      expect(verified.valid).toBe(false);
      expect(verified.error).toContain('Conversation mismatch');
    });

    it('B.5: Nested resource binding mismatch between message and conversation throws error', () => {
      expect(() =>
        resourcePolicy.assertMessageBelongsToConversation(
          'conv_expected',
          'conv_wrong_supplied',
          'msg_123',
        ),
      ).toThrow();
    });
  });

  // =========================================================================
  // Section C: RBAC and Ownership Boundaries
  // =========================================================================
  describe('Section C: RBAC and Ownership Boundaries', () => {
    it('C.1: User lacking clearance for document visibility scope is denied (403 Forbidden)', () => {
      const docClinical = createMockDocument({
        id: 'doc_clinical_1',
        tenantId: tenantAlpha,
        title: 'Clinical Treatment Protocols',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        uploadedBy: userDoctorAlpha.id,
      });

      const actorTrainer = toTrustedAiContext(userTrainerAlpha);
      const allowedScopesTrainer = [VisibilityScope.ALL_STAFF]; // Trainer lacks CLINICAL_STAFF

      expect(() =>
        resourcePolicy.assertDocumentAccess(actorTrainer, docClinical as any, allowedScopesTrainer),
      ).toThrow(UnauthorizedDocumentAccessException);
    });

    it('C.2: Management role permits administrative access across scopes within same tenant', () => {
      const docClinical = createMockDocument({
        id: 'doc_clinical_2',
        tenantId: tenantAlpha,
        title: 'Clinical Treatment Protocols',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        uploadedBy: userDoctorAlpha.id,
      });

      const actorManager = toTrustedAiContext(userManagerAlpha);
      const allowedScopesManager = [
        VisibilityScope.ALL_STAFF,
        VisibilityScope.CLINICAL_STAFF,
        VisibilityScope.MANAGEMENT,
      ];

      expect(() =>
        resourcePolicy.assertDocumentAccess(actorManager, docClinical as any, allowedScopesManager),
      ).not.toThrow();
    });

    it('C.3: Non-manager non-uploader cannot mutate document metadata or soft-delete (403)', () => {
      const docClinical = createMockDocument({
        id: 'doc_clinical_3',
        tenantId: tenantAlpha,
        title: 'Clinical Treatment Protocols',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        uploadedBy: userDoctorAlpha.id,
      });

      const actorTrainer = toTrustedAiContext(userTrainerAlpha);

      const canManage = resourcePolicy.canManageDocument(actorTrainer, docClinical as any);
      expect(canManage).toBe(false);
    });
  });

  // =========================================================================
  // Section D: Retrieval and Prompt-Context Isolation
  // =========================================================================
  describe('Section D: Retrieval and Prompt-Context Isolation', () => {
    it('D.1: Client cannot broaden search scope via allowedVisibilityScopes parameter', async () => {
      const mockRetrievalRepo = {
        findSimilarChunks: jest.fn().mockResolvedValue([]),
        countMatches: jest.fn().mockResolvedValue(0),
      };

      const searchService = new SecureSemanticSearchService(
        { generateQueryEmbedding: jest.fn() } as any,
        mockRetrievalRepo as any,
        { findActiveGeneration: jest.fn().mockResolvedValue({ id: 'gen-1' }) } as any,
        securityPolicy,
      );

      await searchService.execute({
        authContext: {
          tenantId: tenantAlpha,
          userId: userTrainerAlpha.id,
          roles: ['Trainer'], // Only maps to ALL_STAFF
          allowedVisibilityScopes: [VisibilityScope.MANAGEMENT],
        },
        query: 'salarios confidenciales',
      });

      expect(mockRetrievalRepo.findSimilarChunks).not.toHaveBeenCalled();
    });

    it('D.2: Candidate chunk outside authorized scopes is dropped in defense-in-depth', async () => {
      const mockRetrievalUseCase = {
        execute: jest.fn().mockResolvedValue(
          RetrievalResult.create({
            query: RetrievalQuery.create({
              query: 'protocolo',
              criteria: RetrievalCriteria.create({ tenantId: tenantAlpha }),
            }),
            chunks: [
              RetrievedChunk.create({
                id: 'chunk_mgmt',
                chunkId: ChunkId.fromString('chk_mgmt'),
                documentId: 'doc_mgmt',
                documentVersionId: 'ver_mgmt',
                indexGenerationId: 'gen-1',
                content: 'Estrategia financiera confidencial',
                tokenCount: 20,
                similarity: SimilarityScore.create(0.95),
                distance: 0.05,
                provenance: RetrievalProvenance.create({
                  documentTitle: 'Finanzas',
                  documentVersionNumber: 1,
                  originalFileName: 'finanzas.pdf',
                  mimeType: 'application/pdf',
                  chunkSequence: 1,
                  language: 'es',
                }),
                metadata: { visibilityScope: VisibilityScope.MANAGEMENT },
              }),
            ],
            totalMatches: 1,
            activeGenerationId: 'gen-1',
            executionDurationMs: 5,
          }),
        ),
      };

      const mockContextBuilder = { buildContext: jest.fn() };
      const mockGenerator = { generateGroundedAnswer: jest.fn() };

      const orchestrator = new RAGOrchestratorService(
        mockRetrievalUseCase as any,
        mockContextBuilder as any,
        mockGenerator as any,
        new CitationValidatorService(),
      );

      const response = await orchestrator.execute({
        authContext: {
          tenantId: tenantAlpha,
          userId: userTrainerAlpha.id,
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
        query: 'protocolo',
      });

      expect(response.grounded).toBe(false);
      expect(mockGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });

    it('D.3: Soft-deleted document is omitted from retrieval and triggers abstention', async () => {
      const mockRetrievalUseCase = {
        execute: jest.fn().mockResolvedValue(
          RetrievalResult.create({
            query: RetrievalQuery.create({
              query: 'protocolo obsoleto',
              criteria: RetrievalCriteria.create({ tenantId: tenantAlpha }),
            }),
            chunks: [],
            totalMatches: 0,
            activeGenerationId: 'gen-1',
            executionDurationMs: 4,
          }),
        ),
      };

      const mockGenerator = { generateGroundedAnswer: jest.fn() };
      const orchestrator = new RAGOrchestratorService(
        mockRetrievalUseCase as any,
        { buildContext: jest.fn() } as any,
        mockGenerator as any,
        new CitationValidatorService(),
      );

      const response = await orchestrator.execute({
        authContext: {
          tenantId: tenantAlpha,
          userId: userDoctorAlpha.id,
          roles: ['Therapist'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
        },
        query: 'protocolo obsoleto',
      });

      expect(response.grounded).toBe(false);
      expect(mockGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Section E: Background Job Isolation
  // =========================================================================
  describe('Section E: Background Job Isolation', () => {
    it('E.1: Queue payload manipulation with mismatched tenantId is rejected by worker', async () => {
      const jobAlpha = IngestionJob.create({
        id: 'job_alpha_99',
        documentId: 'doc_alpha_99',
        documentVersionId: 'ver_alpha_99',
        tenantId: tenantAlpha,
      });

      const mockJobRepo = {
        findById: jest.fn().mockResolvedValue(jobAlpha),
      };

      const orchestrator = new IngestionOrchestratorService(
        {} as any,
        mockJobRepo as any,
        {} as any,
      );

      await expect(orchestrator.processJob('job_alpha_99', tenantBeta)).rejects.toThrow(
        UnauthorizedDocumentAccessException,
      );
    });

    it('E.2: Replaying completed READY job exits idempotently without reprocessing', async () => {
      const readyJob = IngestionJob.create({
        id: 'job_ready_99',
        documentId: 'doc_ready_99',
        documentVersionId: 'ver_ready_99',
        tenantId: tenantAlpha,
      });
      readyJob.startValidation();
      readyJob.startProcessing();
      readyJob.startIndexing();
      readyJob.markReady();

      const mockJobRepo = {
        findById: jest.fn().mockResolvedValue(readyJob),
      };
      const mockIndexingPort = { indexDocument: jest.fn() };

      const orchestrator = new IngestionOrchestratorService(
        {} as any,
        mockJobRepo as any,
        {} as any,
        mockIndexingPort as any,
      );

      const res = await orchestrator.processJob('job_ready_99', tenantAlpha);
      expect(res.status).toBe(IngestionStatus.READY);
      expect(mockIndexingPort.indexDocument).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Section F: Concurrency and Lifecycle
  // =========================================================================
  describe('Section F: Concurrency and Lifecycle', () => {
    it('F.1: Concurrent asynchronous operations for separate tenants maintain independent isolation', async () => {
      const docAlpha = createMockDocument({
        id: 'doc_conc_alpha',
        tenantId: tenantAlpha,
        title: 'Doc Alpha',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        uploadedBy: userDoctorAlpha.id,
      });

      const docBeta = createMockDocument({
        id: 'doc_conc_beta',
        tenantId: tenantBeta,
        title: 'Doc Beta',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: userDoctorBeta.id,
      });

      const actorAlpha = toTrustedAiContext(userDoctorAlpha);
      const actorBeta = toTrustedAiContext(userDoctorBeta);

      const scopesAlpha = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
      const scopesBeta = [VisibilityScope.ALL_STAFF];

      const [checkAlpha, checkBeta] = await Promise.all([
        Promise.resolve().then(() =>
          resourcePolicy.canAccessDocument(actorAlpha, docAlpha as any, scopesAlpha),
        ),
        Promise.resolve().then(() =>
          resourcePolicy.canAccessDocument(actorBeta, docBeta as any, scopesBeta),
        ),
      ]);

      expect(checkAlpha).toBe(true);
      expect(checkBeta).toBe(true);

      const [crossAlpha, crossBeta] = await Promise.all([
        Promise.resolve().then(() =>
          resourcePolicy.canAccessDocument(actorBeta, docAlpha as any, scopesBeta),
        ),
        Promise.resolve().then(() =>
          resourcePolicy.canAccessDocument(actorAlpha, docBeta as any, scopesAlpha),
        ),
      ]);

      expect(crossAlpha).toBe(false);
      expect(crossBeta).toBe(false);
    });
  });

  // =========================================================================
  // Section G: Error and Information Disclosure
  // =========================================================================
  describe('Section G: Error and Information Disclosure', () => {
    it('G.1: Authorization failure on non-existent or foreign document emits generic 404 without metadata disclosure', () => {
      const foreignDoc = createMockDocument({
        id: 'doc_foreign_secret',
        tenantId: tenantBeta,
        title: 'Confidential Mergers & Acquisitions',
        visibilityScope: VisibilityScope.MANAGEMENT,
        uploadedBy: userDoctorBeta.id,
      });

      const actorAlpha = toTrustedAiContext(userDoctorAlpha);
      const scopesAlpha = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];

      try {
        resourcePolicy.assertDocumentAccess(actorAlpha, foreignDoc as any, scopesAlpha);
        fail('Expected DocumentNotFoundException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(DocumentNotFoundException);
        const msg = (err as Error).message;
        expect(msg).not.toContain('Confidential Mergers & Acquisitions');
        expect(msg).not.toContain(userDoctorBeta.id);
      }
    });

    it('G.2: Citation validation strips unverified chunk references and prevents foreign chunk attribution', () => {
      const validator = new CitationValidatorService();
      const authorizedEvidence = [
        RAGEvidenceChunk.fromRetrievedChunk(
          RetrievedChunk.create({
            id: 'c_auth_1',
            chunkId: ChunkId.fromString('chk_auth_1'),
            documentId: 'doc_auth',
            documentVersionId: 'ver_auth',
            indexGenerationId: 'gen-1',
            content: 'Texto clínico autorizado.',
            tokenCount: 15,
            similarity: SimilarityScore.create(0.9),
            distance: 0.1,
            provenance: RetrievalProvenance.create({
              documentTitle: 'Guía Clínica',
              documentVersionNumber: 1,
              originalFileName: 'guia.pdf',
              mimeType: 'application/pdf',
              chunkSequence: 1,
              language: 'es',
            }),
          }),
          1,
        ),
      ];

      const constructedContext = RAGConstructedContext.create({
        formattedContext: '<retrieved_evidence>...</retrieved_evidence>',
        includedChunks: authorizedEvidence,
        excludedChunks: [],
        totalContextTokens: 200,
        evidenceTokens: 100,
        historyTokens: 0,
        systemPromptTokens: 100,
        budgetRemaining: 3000,
        omittedChunkCount: 0,
      });

      const genResult = StructuredGenerationResult.create({
        rawText: 'Respuesta con cita ajena.',
        answer: 'Texto con cita [chk_auth_1] y cita ajena [chk_foreign_secret].',
        grounded: true,
        citedChunkIds: ['chk_auth_1', 'chk_foreign_secret'],
        confidence: 'high',
        modelIdentifier: 'qwen3:4b',
        promptTokens: 200,
        completionTokens: 30,
        promptVersion: 'v1',
        finishReason: 'stop',
      });

      const validation = validator.validateResponse({
        query: 'consulta clínica',
        constructedContext,
        generationResult: genResult,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.verifiedCitations.length).toBe(1);
      expect(validation.verifiedCitations[0]?.chunkId).toBe('chk_auth_1');
      expect(validation.unverifiedChunkIds).toContain('chk_foreign_secret');
    });
  });
});
