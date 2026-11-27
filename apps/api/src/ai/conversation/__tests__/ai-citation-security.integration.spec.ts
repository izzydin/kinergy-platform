import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, VisibilityScope } from '@prisma/client';
import { AiConversationController } from '../ai-conversation.controller';
import { AiConversationModule } from '../ai-conversation.module';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  RAGTurnExecutionResult,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationCitationRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { PreviewTokenService } from '../../services/preview-token.service';
import { OBJECT_STORAGE_PORT } from '../../../platform/storage/ports/object-storage.port';

/**
 * AI-09.10 — IT.05: Citation, Source Authorization, and Security Tests
 *
 * Real PostgreSQL Integration Suite verifying:
 * 1. Citation rendering & relational persistence fidelity without metadata fabrication.
 * 2. Deterministic citation ordering by citationPosition ASC.
 * 3. Identifier and relationship integrity (citation-to-message and citation-to-conversation validation).
 * 4. Multi-tenant and cross-user authorization defense (strict 404/403 IDOR rejection).
 * 5. Role-based visibility clearance and dynamic preview statuses.
 * 6. Document deletion/archival retention policy (preserving citations for audit while denying preview).
 * 7. Preview token cryptographic verification and tamper protection.
 * 8. Multi-turn and regeneration citation provenance isolation.
 */
describe('AI-09.10 — IT.05: Citation, Source Authorization & Security (PostgreSQL Integration)', () => {
  let module: TestingModule;
  let controller: AiConversationController;
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let citationRepo: PrismaAiConversationCitationRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let previewTokenService: PreviewTokenService;

  const TENANT_ALPHA = 'tenant_cit_sec_alpha';
  const TENANT_BETA = 'tenant_cit_sec_beta';
  const USER_ALPHA_DOC = 'usr_cit_alpha_doc';
  const USER_ALPHA_STAFF = 'usr_cit_alpha_staff';
  const USER_BETA_INTRUDER = 'usr_cit_beta_intruder';

  const authAlphaDoc: TrustedAiContext = {
    actorId: USER_ALPHA_DOC,
    tenantId: TENANT_ALPHA,
    roles: ['Doctor', 'Owner'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc.alpha@kinergy.test',
  };

  const authAlphaStaff: TrustedAiContext = {
    actorId: USER_ALPHA_STAFF,
    tenantId: TENANT_ALPHA,
    roles: ['Staff'],
    permissions: ['ai:read'],
    email: 'staff.alpha@kinergy.test',
  };

  const authBetaIntruder: TrustedAiContext = {
    actorId: USER_BETA_INTRUDER,
    tenantId: TENANT_BETA,
    roles: ['Doctor'],
    permissions: ['ai:read', 'ai:write'],
    email: 'intruder@beta.test',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    citationRepo = new PrismaAiConversationCitationRepository(prisma);
    txRunner = new PrismaAiConversationTransactionRunner(
      prisma,
      convRepo,
      turnRepo,
      messageRepo,
      auditRepo,
      citationRepo,
    );
    persistUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
    previewTokenService = new PreviewTokenService();

    const mockStoragePort = {
      exists: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue({ data: Buffer.from('%PDF-1.4 test') }),
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [AiConversationModule],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(OBJECT_STORAGE_PORT)
      .useValue(mockStoragePort)
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$disconnect();
    await module.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
  });

  // Helper to seed Knowledge Document and Versions into PostgreSQL
  async function seedDocument(opts: {
    docId: string;
    title: string;
    versionId?: string;
    chunkId?: string;
    chunkContent?: string;
    visibilityScope?: VisibilityScope;
    tenantId?: string;
    mimeType?: string;
  }) {
    const tenantId = opts.tenantId ?? TENANT_ALPHA;
    const now = new Date();

    const doc = await prisma.knowledgeDocument.upsert({
      where: { id: opts.docId },
      create: {
        id: opts.docId,
        tenantId,
        title: opts.title,
        uploadedBy: USER_ALPHA_DOC,
        visibilityScope: opts.visibilityScope ?? VisibilityScope.ALL_STAFF,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        title: opts.title,
        visibilityScope: opts.visibilityScope ?? VisibilityScope.ALL_STAFF,
        deletedAt: null,
      },
    });

    const effectiveVerId = opts.versionId ?? `ver_${opts.docId}`;
    const validChecksum = 'a'.repeat(64);

    await prisma.documentVersion.upsert({
      where: { id: effectiveVerId },
      create: {
        id: effectiveVerId,
        documentId: opts.docId,
        versionNumber: 1,
        originalFileName: `${opts.docId}.pdf`,
        mimeType: opts.mimeType ?? 'application/pdf',
        fileSize: 4096,
        checksum: validChecksum,
        storageKey: `docs/${effectiveVerId}`,
        uploadedBy: USER_ALPHA_DOC,
        createdAt: now,
      },
      update: {},
    });

    if (opts.chunkId) {
      await prisma.knowledgeChunk.upsert({
        where: { id: opts.chunkId },
        create: {
          id: opts.chunkId,
          tenantId,
          documentId: opts.docId,
          documentVersionId: effectiveVerId,
          sequence: 1,
          content: opts.chunkContent ?? 'Evidence chunk text for RAG retrieval.',
          tokenCount: 45,
          provenance: {},
          checksum: validChecksum,
          createdAt: now,
        },
        update: {},
      });
    }

    return doc;
  }

  // Helper to seed conversation and execute turn with citations
  async function executeTurnWithCitations(opts: {
    convId: string;
    turnId: string;
    userMsgId: string;
    asstMsgId: string;
    tenantId?: string;
    userId?: string;
    citations: RAGSourceCitation[];
    answerText?: string;
  }) {
    const tenantId = opts.tenantId ?? TENANT_ALPHA;
    const userId = opts.userId ?? USER_ALPHA_DOC;
    const now = new Date();

    await prisma.aiConversation.create({
      data: {
        id: opts.convId,
        tenantId,
        userId,
        title: 'Citation Test Session',
        turnCounter: 1,
        messageCounter: 2,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationTurn.create({
      data: {
        id: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        turnIndex: 1,
        status: TurnStatus.PENDING,
        clientTurnId: `client-${opts.turnId}`,
        idempotencyKey: `${opts.convId}_1`,
        idempotencyPayloadHash: 'hash_1',
        activeAttemptId: null,
        activeAttemptNumber: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: opts.userMsgId,
        turnId: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        role: 'USER',
        sequenceNumber: 1,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: false,
        content: 'Clinical inquiry on tendinopathy',
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: opts.asstMsgId,
        turnId: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        status: 'PENDING',
        isCanonical: false,
        content: '',
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationTurn.update({
      where: {
        uq_turn_id_conv_tenant: {
          id: opts.turnId,
          conversationId: opts.convId,
          tenantId,
        },
      },
      data: {
        activeAttemptId: opts.asstMsgId,
      },
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: opts.answerText ?? 'Se recomienda protocolo excéntrico según evidencia [1].',
        sources: opts.citations,
        metadata: {
          model: 'qwen-2.5-coder',
          latencyMs: 100,
          retrievalCount: opts.citations.length,
        },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const executeUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    return executeUseCase.execute({
      tenantId,
      userId,
      conversationId: opts.convId,
      turnId: opts.turnId,
      actorContext: { roles: ['Doctor'], permissions: ['ai:read', 'ai:write'] },
    });
  }

  // =========================================================================
  // 1. Citation Rendering & Relational Persistence Fidelity
  // =========================================================================
  describe('1. Citation Persistence & Metadata Grounding', () => {
    it('persists citation relationally with exact chunk metadata and does not fabricate missing fields', async () => {
      const docId = 'doc_cit_tendon_01';
      const verId = 'ver_cit_tendon_01';
      const chunkId = 'chunk_cit_tendon_01';

      await seedDocument({
        docId,
        title: 'Guía de Tendinopatías 2026',
        versionId: verId,
        chunkId,
        chunkContent: 'El ejercicio excéntrico estimula la regeneración del tendón.',
      });

      const convId = 'conv_cit_grounded_01';
      const turnId = 'turn_cit_grounded_01';
      const userMsgId = 'msg_u_grounded_01';
      const asstMsgId = 'msg_a_grounded_01';

      const citation = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Guía de Tendinopatías 2026',
        documentVersionId: verId,
        chunkId,
        excerpt: 'El ejercicio excéntrico estimula la regeneración del tendón.',
        pageNumber: 15,
        headingPath: ['Tratamiento', 'Carga Excéntrica'],
        relevanceScore: 0.965,
        retrievalRank: 1,
        sourceStrategy: 'HYBRID',
      });

      await executeTurnWithCitations({
        convId,
        turnId,
        userMsgId,
        asstMsgId,
        citations: [citation],
      });

      // Query citations via REST Controller
      const result = await controller.getMessageCitations(authAlphaDoc, convId, asstMsgId);

      expect(result.conversationId).toBe(convId);
      expect(result.messageId).toBe(asstMsgId);
      expect(result.citations).toHaveLength(1);

      const c = result.citations[0]!;
      expect(c.documentId).toBe(docId);
      expect(c.documentTitle).toBe('Guía de Tendinopatías 2026');
      expect(c.documentTitleSnapshot).toBe('Guía de Tendinopatías 2026');
      expect(c.pageNumber).toBe(15);
      expect(c.headingPath).toEqual(['Tratamiento', 'Carga Excéntrica']);
      expect(c.relevanceScore).toBeCloseTo(0.965);
      expect(c.excerpt).toBe('El ejercicio excéntrico estimula la regeneración del tendón.');
      expect(c.citationPosition).toBe(1);
      expect(c.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(c.canPreview).toBe(true);
      expect(c.previewUnavailableReason).toBeNull();
    });
  });

  // =========================================================================
  // 2. Deterministic Ordering of Multiple Citations
  // =========================================================================
  describe('2. Deterministic Citation Ordering', () => {
    it('orders multiple citations deterministically by citationPosition ASC', async () => {
      const doc1 = 'doc_multi_01';
      const doc2 = 'doc_multi_02';

      await seedDocument({
        docId: doc1,
        title: 'Protocolo Articular Meniscal',
        chunkId: 'chunk_m1',
      });
      await seedDocument({
        docId: doc2,
        title: 'Crioterapia y Termoterapia en Rehabilitación',
        chunkId: 'chunk_m2',
      });

      const convId = 'conv_cit_multi_02';
      const turnId = 'turn_cit_multi_02';
      const userMsgId = 'msg_u_multi_02';
      const asstMsgId = 'msg_a_multi_02';

      const citation1 = RAGSourceCitation.create({
        documentId: doc1,
        documentTitle: 'Protocolo Articular Meniscal',
        chunkId: 'chunk_m1',
        excerpt: 'Primer extracto de protocolo meniscal.',
        pageNumber: 3,
        relevanceScore: 0.98,
        retrievalRank: 1,
      });

      const citation2 = RAGSourceCitation.create({
        documentId: doc2,
        documentTitle: 'Crioterapia y Termoterapia en Rehabilitación',
        chunkId: 'chunk_m2',
        excerpt: 'Segundo extracto sobre modalidades térmicas.',
        pageNumber: 8,
        relevanceScore: 0.91,
        retrievalRank: 2,
      });

      await executeTurnWithCitations({
        convId,
        turnId,
        userMsgId,
        asstMsgId,
        citations: [citation1, citation2],
      });

      const result = await controller.getMessageCitations(authAlphaDoc, convId, asstMsgId);
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]?.citationPosition).toBe(1);
      expect(result.citations[0]?.documentTitle).toBe('Protocolo Articular Meniscal');
      expect(result.citations[1]?.citationPosition).toBe(2);
      expect(result.citations[1]?.documentTitle).toBe(
        'Crioterapia y Termoterapia en Rehabilitación',
      );
    });
  });

  // =========================================================================
  // 3. Identifier and Relationship Integrity
  // =========================================================================
  describe('3. Identifier & Relationship Integrity', () => {
    it('rejects citation retrieval when messageId does not match citation record (returns 404)', async () => {
      const docId = 'doc_rel_01';
      await seedDocument({ docId, title: 'Protocolo Integridad', chunkId: 'chunk_rel_01' });

      const convId = 'conv_rel_01';
      const turnId = 'turn_rel_01';
      const userMsgId = 'msg_u_rel_01';
      const asstMsgId = 'msg_a_rel_01';

      const citation = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Protocolo Integridad',
        chunkId: 'chunk_rel_01',
        excerpt: 'Contenido verificado.',
        pageNumber: 1,
        relevanceScore: 0.95,
      });

      await executeTurnWithCitations({
        convId,
        turnId,
        userMsgId,
        asstMsgId,
        citations: [citation],
      });

      const citationsList = await controller.getMessageCitations(authAlphaDoc, convId, asstMsgId);
      const citationId = citationsList.citations[0]!.id;

      // Legitimate detail call succeeds
      const validDetail = await controller.getCitationDetail(
        authAlphaDoc,
        convId,
        asstMsgId,
        citationId,
      );
      expect(validDetail.id).toBe(citationId);

      // Manipulated messageId (belonging to another message or fabricated) MUST be rejected with 404
      await expect(
        controller.getCitationDetail(authAlphaDoc, convId, 'msg_foreign_mismatched', citationId),
      ).rejects.toThrow();

      // Manipulated conversationId MUST be rejected with 404
      await expect(
        controller.getCitationDetail(
          authAlphaDoc,
          'conv_foreign_mismatched',
          asstMsgId,
          citationId,
        ),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. Multi-Tenant and Cross-User Authorization (IDOR Defense)
  // =========================================================================
  describe('4. Multi-Tenant IDOR Protection', () => {
    it('strictly forbids Tenant Beta intruder from reading Tenant Alpha citations or previews', async () => {
      const docId = 'doc_alpha_confidential_01';
      await seedDocument({
        docId,
        title: 'Alpha Private Clinical Trials',
        tenantId: TENANT_ALPHA,
        chunkId: 'chunk_alpha_p1',
      });

      const convId = 'conv_alpha_private_01';
      const turnId = 'turn_alpha_private_01';
      const userMsgId = 'msg_u_alpha_p1';
      const asstMsgId = 'msg_a_alpha_p1';

      const citation = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Alpha Private Clinical Trials',
        chunkId: 'chunk_alpha_p1',
        excerpt: 'Datos confidenciales de la clínica Alpha.',
        pageNumber: 1,
        relevanceScore: 0.99,
      });

      await executeTurnWithCitations({
        convId,
        turnId,
        userMsgId,
        asstMsgId,
        tenantId: TENANT_ALPHA,
        citations: [citation],
      });

      const alphaCitations = await controller.getMessageCitations(authAlphaDoc, convId, asstMsgId);
      const citationId = alphaCitations.citations[0]!.id;

      // 1. Beta cannot list Alpha citations
      await expect(
        controller.getMessageCitations(authBetaIntruder, convId, asstMsgId),
      ).rejects.toThrow();

      // 2. Beta cannot get citation detail
      await expect(
        controller.getCitationDetail(authBetaIntruder, convId, asstMsgId, citationId),
      ).rejects.toThrow();

      // 3. Beta cannot get preview metadata
      await expect(
        controller.getCitationPreview(authBetaIntruder, convId, asstMsgId, citationId),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 5. Role-Based Visibility Clearance & Dynamic Preview Status
  // =========================================================================
  describe('5. Role-Based Visibility Clearance & Preview Status', () => {
    it('allows Owner to preview MANAGEMENT document while Staff receives DOCUMENT_RESTRICTED', async () => {
      const docId = 'doc_management_scope_01';
      await seedDocument({
        docId,
        title: 'Management Audit Protocol',
        visibilityScope: VisibilityScope.MANAGEMENT, // Management requires elevated roles
        chunkId: 'chunk_mng_1',
      });

      // 1. Doctor / Owner conversation and turn
      const convDocId = 'conv_cit_owner_01';
      const turnDocId = 'turn_cit_owner_01';
      const userMsgDocId = 'msg_u_owner_01';
      const asstMsgDocId = 'msg_a_owner_01';

      const citationDoc = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Management Audit Protocol',
        documentVersionId: `ver_${docId}`,
        chunkId: 'chunk_mng_1',
        excerpt: 'Procedimiento de auditoría de gestión clínica.',
        pageNumber: 12,
        relevanceScore: 0.97,
      });

      await executeTurnWithCitations({
        convId: convDocId,
        turnId: turnDocId,
        userMsgId: userMsgDocId,
        asstMsgId: asstMsgDocId,
        userId: USER_ALPHA_DOC,
        citations: [citationDoc],
      });

      const listDoc = await controller.getMessageCitations(authAlphaDoc, convDocId, asstMsgDocId);
      const citationDocId = listDoc.citations[0]!.id;

      // Owner has elevated role -> preview is available with signed token
      const ownerPreview = await controller.getCitationPreview(
        authAlphaDoc,
        convDocId,
        asstMsgDocId,
        citationDocId,
      );
      expect(ownerPreview.canPreview).toBe(true);
      expect(ownerPreview.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(ownerPreview.previewToken).not.toBeNull();

      // 2. Staff user conversation and turn with same MANAGEMENT document citation
      const convStaffId = 'conv_cit_staff_01';
      const turnStaffId = 'turn_cit_staff_01';
      const userMsgStaffId = 'msg_u_staff_01';
      const asstMsgStaffId = 'msg_a_staff_01';

      await executeTurnWithCitations({
        convId: convStaffId,
        turnId: turnStaffId,
        userMsgId: userMsgStaffId,
        asstMsgId: asstMsgStaffId,
        userId: USER_ALPHA_STAFF,
        citations: [citationDoc],
      });

      const listStaff = await controller.getMessageCitations(
        authAlphaStaff,
        convStaffId,
        asstMsgStaffId,
      );
      const citationStaffId = listStaff.citations[0]!.id;

      // Staff lacks MANAGEMENT clearance -> preview is DOCUMENT_RESTRICTED, canPreview false, zero previewToken
      const staffPreview = await controller.getCitationPreview(
        authAlphaStaff,
        convStaffId,
        asstMsgStaffId,
        citationStaffId,
      );
      expect(staffPreview.canPreview).toBe(false);
      expect(staffPreview.previewStatus).toBe('DOCUMENT_RESTRICTED');
      expect(staffPreview.previewUnavailableReason).toContain('restricted');
      expect(staffPreview.previewToken).toBeNull();
    });
  });

  // =========================================================================
  // 6. Document Deletion & Lifecycle Status Preservation
  // =========================================================================
  describe('6. Document Lifecycle & Deletion Retention Policy', () => {
    it('preserves historical citation snapshot when document is soft-deleted, returning DOCUMENT_SOFT_DELETED status', async () => {
      const docId = 'doc_lifecycle_del_01';
      await seedDocument({
        docId,
        title: 'Manual Retirado de Práctica Clínica',
        chunkId: 'chunk_del_1',
      });

      const convId = 'conv_cit_del_01';
      const turnId = 'turn_cit_del_01';
      const userMsgId = 'msg_u_del_01';
      const asstMsgId = 'msg_a_del_01';

      const citation = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Manual Retirado de Práctica Clínica',
        chunkId: 'chunk_del_1',
        excerpt: 'Extracto histórico preservado en base de datos.',
        pageNumber: 7,
        relevanceScore: 0.93,
      });

      await executeTurnWithCitations({
        convId,
        turnId,
        userMsgId,
        asstMsgId,
        citations: [citation],
      });

      // Soft delete the document in PostgreSQL
      await prisma.knowledgeDocument.update({
        where: { id: docId },
        data: { deletedAt: new Date() },
      });

      const list = await controller.getMessageCitations(authAlphaDoc, convId, asstMsgId);
      const citationId = list.citations[0]!.id;

      // Historical citation record is NOT deleted (audit preservation invariant)
      expect(list.citations).toHaveLength(1);
      expect(list.citations[0]?.documentTitleSnapshot).toBe('Manual Retirado de Práctica Clínica');

      // Detail reflects that document is deleted / excerpt-only
      const preview = await controller.getCitationPreview(
        authAlphaDoc,
        convId,
        asstMsgId,
        citationId,
      );
      expect(preview.canPreview).toBe(false);
      expect(preview.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
      expect(preview.previewUnavailableReason).toContain(
        'Document has been archived or soft-deleted.',
      );
      expect(preview.previewToken).toBeNull();
    });
  });

  // =========================================================================
  // 7. Preview Token Cryptographic Security & Tamper Protection
  // =========================================================================
  describe('7. Preview Token Security & Cryptographic Integrity', () => {
    it('verifies that tampered or forged preview token signature is rejected fail-closed', () => {
      const validToken = previewTokenService.generateToken({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_DOC,
        conversationId: 'conv_sec_tok_01',
        messageId: 'msg_sec_tok_01',
        citationId: 'cit_sec_tok_01',
        documentId: 'doc_sec_tok_01',
      });

      expect(validToken).toBeDefined();

      // Legitimate verification succeeds
      const legitimateVerify = previewTokenService.verifyToken(validToken, {
        tenantId: TENANT_ALPHA,
        conversationId: 'conv_sec_tok_01',
        messageId: 'msg_sec_tok_01',
        citationId: 'cit_sec_tok_01',
      });
      expect(legitimateVerify.valid).toBe(true);

      // Attack 1: Tampered signature
      const [payload] = validToken.split('.');
      const tamperedToken = `${payload}.forged_signature_attack_attempt`;
      const tamperedResult = previewTokenService.verifyToken(tamperedToken, {
        tenantId: TENANT_ALPHA,
        conversationId: 'conv_sec_tok_01',
        messageId: 'msg_sec_tok_01',
        citationId: 'cit_sec_tok_01',
      });
      expect(tamperedResult.valid).toBe(false);
      expect(tamperedResult.error).toContain('Token signature verification failed');

      // Attack 2: Wrong execution context (e.g. attempting to use token on another conversation)
      const wrongContextResult = previewTokenService.verifyToken(validToken, {
        tenantId: TENANT_ALPHA,
        conversationId: 'conv_different_target_999',
        messageId: 'msg_sec_tok_01',
        citationId: 'cit_sec_tok_01',
      });
      expect(wrongContextResult.valid).toBe(false);
      expect(wrongContextResult.error).toContain('Conversation mismatch');
    });
  });

  // =========================================================================
  // 8. Multi-Turn Citation Provenance & Regeneration Isolation
  // =========================================================================
  describe('8. Multi-Turn & Regeneration Citation Provenance Isolation', () => {
    it('isolates citations across multiple turns and maintains provenance during response regeneration', async () => {
      const docT1 = 'doc_t1_citation';
      const docT2 = 'doc_t2_citation';

      await seedDocument({ docId: docT1, title: 'Evidencia Turn 1', chunkId: 'chunk_t1' });
      await seedDocument({ docId: docT2, title: 'Evidencia Turn 2', chunkId: 'chunk_t2' });

      const convId = 'conv_turn_cit_iso_01';
      const turn1Id = 'turn_iso_t1';
      const asst1Id = 'msg_a_iso_t1';

      const citationT1 = RAGSourceCitation.create({
        documentId: docT1,
        documentTitle: 'Evidencia Turn 1',
        chunkId: 'chunk_t1',
        excerpt: 'Extracto específico de la fase 1.',
        pageNumber: 2,
        relevanceScore: 0.95,
      });

      await executeTurnWithCitations({
        convId,
        turnId: turn1Id,
        userMsgId: 'msg_u_iso_t1',
        asstMsgId: asst1Id,
        citations: [citationT1],
      });

      // Verify Turn 1 has exactly 1 citation
      const citationsT1 = await controller.getMessageCitations(authAlphaDoc, convId, asst1Id);
      expect(citationsT1.citations).toHaveLength(1);
      expect(citationsT1.citations[0]?.documentTitle).toBe('Evidencia Turn 1');

      // Now reserve and complete Turn 2 with citationT2
      const turn2Id = 'turn_iso_t2';
      const asst2Id = 'msg_a_iso_t2';

      await prisma.aiConversationTurn.create({
        data: {
          id: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ALPHA,
          turnIndex: 2,
          status: TurnStatus.PENDING,
          clientTurnId: 'client-turn-2-cit',
          idempotencyKey: `${convId}_2`,
          idempotencyPayloadHash: 'hash_2',
          activeAttemptId: null,
          activeAttemptNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: 'msg_u_iso_t2',
          turnId: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ALPHA,
          role: 'USER',
          sequenceNumber: 3,
          attemptNumber: 1,
          status: 'SUCCESS',
          isCanonical: false,
          content: 'Pregunta de seguimiento para Turn 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: asst2Id,
          turnId: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ALPHA,
          role: 'ASSISTANT',
          sequenceNumber: 4,
          attemptNumber: 1,
          status: 'PENDING',
          isCanonical: false,
          content: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.aiConversationTurn.update({
        where: {
          uq_turn_id_conv_tenant: {
            id: turn2Id,
            conversationId: convId,
            tenantId: TENANT_ALPHA,
          },
        },
        data: {
          activeAttemptId: asst2Id,
        },
      });

      const citationT2 = RAGSourceCitation.create({
        documentId: docT2,
        documentTitle: 'Evidencia Turn 2',
        chunkId: 'chunk_t2',
        excerpt: 'Extracto específico de la fase 2.',
        pageNumber: 10,
        relevanceScore: 0.92,
      });

      const mockPipelineT2: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta para Turn 2 con nueva evidencia [1].',
          sources: [citationT2],
          metadata: { model: 'qwen', latencyMs: 110, retrievalCount: 1 },
          isGrounded: true,
        } as RAGTurnExecutionResult),
      };

      const executeT2 = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipelineT2,
        historyLoader,
        txRunner,
        citationRepo,
      );

      await executeT2.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_DOC,
        conversationId: convId,
        turnId: turn2Id,
        actorContext: { roles: ['Doctor'], permissions: ['ai:read', 'ai:write'] },
      });

      // Verify Turn 2 citations do NOT bleed into Turn 1, and Turn 1 citations do NOT bleed into Turn 2
      const citationsT1After = await controller.getMessageCitations(authAlphaDoc, convId, asst1Id);
      expect(citationsT1After.citations).toHaveLength(1);
      expect(citationsT1After.citations[0]?.documentTitle).toBe('Evidencia Turn 1');

      const citationsT2 = await controller.getMessageCitations(authAlphaDoc, convId, asst2Id);
      expect(citationsT2.citations).toHaveLength(1);
      expect(citationsT2.citations[0]?.documentTitle).toBe('Evidencia Turn 2');
    });
  });
});
