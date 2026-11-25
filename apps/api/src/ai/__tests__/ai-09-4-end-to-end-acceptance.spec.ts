import { PrismaClient, VisibilityScope } from '@prisma/client';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  GetMessageHistoryUseCase,
  GetMessageCitationsUseCase,
  GetCitationDetailUseCase,
  GetCitationPreviewUseCase,
  GetCitationDocumentStreamUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  RAGTurnExecutionResult,
  IDocumentStoragePort,
  TenantOwnershipViolationError,
  ConversationNotFoundError,
  DocumentArchivedOrDeletedError,
  DocumentFileNotFoundInStorageError,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationCitationRepository,
  PrismaKnowledgeDocumentRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { PreviewTokenService } from '../services/preview-token.service';

/**
 * AI-09.4-CIT.09 — End-to-End Integration & Final Acceptance Test Suite
 *
 * Verifies all 9 mandatory acceptance scenarios (A through I) on real PostgreSQL:
 * Scenario A — Real RAG citation generation & persistence
 * Scenario B — Multiple citations & deterministic ordering
 * Scenario C — Source details & non-fabrication of metadata
 * Scenario D — Document preview & tokenized streaming
 * Scenario E — Historical conversation reconstruction
 * Scenario F — Document deletion & lifecycle status preservation
 * Scenario G — Unauthorized cross-user and cross-tenant access rejection
 * Scenario H — Multiple messages and continued conversations
 * Scenario I — Failure recovery & storage outage resilience
 */
describe('AI-09.4-CIT.09 — End-to-End Integration & Final Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let citationRepo: PrismaAiConversationCitationRepository;
  let documentRepo: PrismaKnowledgeDocumentRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let getMessageHistoryUseCase: GetMessageHistoryUseCase;
  let getMessageCitationsUseCase: GetMessageCitationsUseCase;
  let getCitationDetailUseCase: GetCitationDetailUseCase;
  let getCitationPreviewUseCase: GetCitationPreviewUseCase;
  let getCitationDocumentStreamUseCase: GetCitationDocumentStreamUseCase;
  let previewTokenService: PreviewTokenService;
  let storagePort: IDocumentStoragePort;

  const TENANT_ID = 'tenant_cit09_acceptance';
  const OTHER_TENANT_ID = 'tenant_cit09_intruder';
  const USER_A = 'usr_cit09_author_a';
  const USER_B = 'usr_cit09_other_b';

  const mockPdfBytes = Buffer.from('%PDF-1.4 official clinical protocol binary data');

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    citationRepo = new PrismaAiConversationCitationRepository(prisma);
    documentRepo = new PrismaKnowledgeDocumentRepository(prisma);
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
    getMessageHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    getMessageCitationsUseCase = new GetMessageCitationsUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      documentRepo,
    );
    getCitationDetailUseCase = new GetCitationDetailUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      documentRepo,
    );

    storagePort = {
      exists: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue({ data: mockPdfBytes }),
    };

    getCitationPreviewUseCase = new GetCitationPreviewUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      documentRepo,
      storagePort,
    );

    getCitationDocumentStreamUseCase = new GetCitationDocumentStreamUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      documentRepo,
      storagePort,
    );

    previewTokenService = new PreviewTokenService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-cit09-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "id" LIKE 'doc_cit09_%'`,
    );
    (storagePort.exists as jest.Mock).mockResolvedValue(true);
    (storagePort.download as jest.Mock).mockResolvedValue({ data: mockPdfBytes });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-cit09-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "id" LIKE 'doc_cit09_%'`,
    );
  });

  // Helper to seed a document with versions and chunks into PostgreSQL
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
    const tenantId = opts.tenantId ?? TENANT_ID;
    const now = new Date();
    const doc = await prisma.knowledgeDocument.upsert({
      where: { id: opts.docId },
      create: {
        id: opts.docId,
        tenantId,
        title: opts.title,
        uploadedBy: USER_A,
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
    const validChecksum = 'f'.repeat(64);
    await prisma.documentVersion.upsert({
      where: { id: effectiveVerId },
      create: {
        id: effectiveVerId,
        documentId: opts.docId,
        versionNumber: 1,
        originalFileName: `${opts.docId}.pdf`,
        mimeType: opts.mimeType ?? 'application/pdf',
        fileSize: 2048,
        checksum: validChecksum,
        storageKey: `docs/${effectiveVerId}`,
        uploadedBy: USER_A,
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
          tokenCount: 40,
          provenance: {},
          checksum: validChecksum,
          createdAt: now,
        },
        update: {},
      });
    }

    return doc;
  }

  // Helper to seed conversation turn structure in DB
  async function seedConversation(opts: {
    convId: string;
    turnId: string;
    turnIndex: number;
    userMsgId: string;
    asstMsgId: string;
    tenantId?: string;
    userId?: string;
    userPrompt?: string;
  }) {
    const tenantId = opts.tenantId ?? TENANT_ID;
    const userId = opts.userId ?? USER_A;
    const now = new Date();

    await prisma.aiConversation.upsert({
      where: {
        uq_conversation_id_tenant: {
          id: opts.convId,
          tenantId,
        },
      },
      create: {
        id: opts.convId,
        tenantId,
        userId,
        title: 'CIT.09 Acceptance Conversation',
        turnCounter: opts.turnIndex,
        messageCounter: opts.turnIndex * 2,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      update: {},
    });

    await prisma.aiConversationTurn.create({
      data: {
        id: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        turnIndex: opts.turnIndex,
        status: TurnStatus.PENDING,
        clientTurnId: `client-${opts.turnId}`,
        idempotencyKey: `${opts.convId}_${opts.turnIndex}`,
        idempotencyPayloadHash: `hash_${opts.turnIndex}`,
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
        sequenceNumber: (opts.turnIndex - 1) * 2 + 1,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: false,
        content: opts.userPrompt ?? 'Consulta clínica sobre patología meniscal.',
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
        sequenceNumber: (opts.turnIndex - 1) * 2 + 2,
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
  }

  describe('Scenario A — Real RAG Citation Generation & Relational Persistence', () => {
    it('generates answer, persists relational citations atomically, and preserves retrieval metadata', async () => {
      const convId = 'test-cit09-scen-a';
      const turnId = 'turn-cit09-scen-a';
      const userMsgId = 'msg-cit09-user-a';
      const asstMsgId = 'msg-cit09-asst-a';
      const docId = 'doc_cit09_meniscus';
      const versionId = 'ver_cit09_meniscus_v1';
      const chunkId = 'chunk_cit09_meniscus_42';

      await seedDocument({
        docId,
        title: 'Guía Clínica de Meniscopatías 2026',
        versionId,
        chunkId,
        chunkContent:
          'La crioterapia intermitente en fase aguda reduce el dolor significativamente.',
      });

      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const ragCitation = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Guía Clínica de Meniscopatías 2026',
        documentVersionId: versionId,
        chunkId,
        excerpt: 'La crioterapia intermitente en fase aguda reduce el dolor significativamente.',
        pageNumber: 14,
        headingPath: ['Fase Aguda', 'Crioterapia'],
        relevanceScore: 0.952,
        retrievalRank: 1,
        sourceStrategy: 'HYBRID',
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Se recomienda crioterapia intermitente en fase aguda [1].',
          sources: [ragCitation],
          metadata: { model: 'qwen3:4b', latencyMs: 120, retrievalCount: 1, finishReason: 'stop' },
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

      const turnResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      expect(turnResult.turnStatus).toBe(TurnStatus.COMPLETED);

      // Verify physical persistence in PostgreSQL table ai_conversation_citations
      const persistedCitations = await prisma.aiConversationCitation.findMany({
        where: { conversationId: convId, messageId: asstMsgId },
      });

      expect(persistedCitations).toHaveLength(1);
      const row = persistedCitations[0]!;
      expect(row.documentId).toBe(docId);
      expect(row.documentVersionId).toBe(versionId);
      expect(row.chunkId).toBe(chunkId);
      expect(row.citationPosition).toBe(1);
      expect(row.excerpt).toBe(
        'La crioterapia intermitente en fase aguda reduce el dolor significativamente.',
      );
      expect(row.pageNumber).toBe(14);
      expect(row.headingPath).toEqual(['Fase Aguda', 'Crioterapia']);
      expect(row.relevanceScore).toBeCloseTo(0.952, 3);
      expect(row.retrievalRank).toBe(1);
      expect(row.sourceStrategy).toBe('HYBRID');

      // Verify retrieval through use cases
      const messageCitations = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });

      expect(messageCitations.citations).toHaveLength(1);
      expect(messageCitations.citations[0]!.documentTitle).toBe(
        'Guía Clínica de Meniscopatías 2026',
      );
      expect(messageCitations.citations[0]!.previewStatus).toBe('DOCUMENT_AVAILABLE');
    });
  });

  describe('Scenario B — Multiple Citations & Deterministic Ordering', () => {
    it('retrieves and orders multiple citations deterministically by citationPosition ASC', async () => {
      const convId = 'test-cit09-scen-b';
      const turnId = 'turn-cit09-scen-b';
      const userMsgId = 'msg-cit09-user-b';
      const asstMsgId = 'msg-cit09-asst-b';

      const doc1 = 'doc_cit09_doc1';
      const doc2 = 'doc_cit09_doc2';

      await seedDocument({
        docId: doc1,
        title: 'Tratado de Fisioterapia A',
        chunkId: 'chunk_doc1_1',
      });
      await seedDocument({
        docId: doc2,
        title: 'Protocolo de Rehabilitación B',
        chunkId: 'chunk_doc2_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const cite1 = RAGSourceCitation.create({
        documentId: doc1,
        documentTitle: 'Tratado de Fisioterapia A',
        chunkId: 'chunk_doc1_1',
        excerpt: 'Extracto de Tratado A',
        pageNumber: 5,
        relevanceScore: 0.98,
        retrievalRank: 1,
      });

      const cite2 = RAGSourceCitation.create({
        documentId: doc2,
        documentTitle: 'Protocolo de Rehabilitación B',
        chunkId: 'chunk_doc2_1',
        excerpt: 'Extracto de Protocolo B',
        pageNumber: 18,
        relevanceScore: 0.88,
        retrievalRank: 2,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Evidencia A [1] y evidencia B [2].',
          sources: [cite1, cite2],
          metadata: { model: 'qwen3:4b', latencyMs: 140, retrievalCount: 2, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const result = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]!.citationPosition).toBe(1);
      expect(result.citations[0]!.documentId).toBe(doc1);
      expect(result.citations[1]!.citationPosition).toBe(2);
      expect(result.citations[1]!.documentId).toBe(doc2);
    });
  });

  describe('Scenario C — Source Details & Excerpt Fidelity', () => {
    it('returns exact source metadata, excerpt fidelity, and does not fabricate missing fields', async () => {
      const convId = 'test-cit09-scen-c';
      const turnId = 'turn-cit09-scen-c';
      const userMsgId = 'msg-cit09-user-c';
      const asstMsgId = 'msg-cit09-asst-c';
      const docId = 'doc_cit09_fidelity';

      await seedDocument({
        docId,
        title: 'Manual de Terapia Manual',
        versionId: 'ver_fid_1',
        chunkId: 'chunk_fid_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      // Citation with missing pageNumber and empty headingPath
      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Manual de Terapia Manual',
        documentVersionId: 'ver_fid_1',
        chunkId: 'chunk_fid_1',
        excerpt: 'Manipulación articular de grado I-II para analgesia.',
        pageNumber: undefined, // No page number available
        headingPath: [], // No heading path available
        relevanceScore: 0.92,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta con evidencia [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 100, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });
      const citationId = citationsResult.citations[0]!.id;

      const detail = await getCitationDetailUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
      });

      expect(detail.citation.documentTitle).toBe('Manual de Terapia Manual');
      expect(detail.citation.excerpt).toBe('Manipulación articular de grado I-II para analgesia.');
      // Invariant: Non-fabrication of missing metadata
      expect(detail.citation.pageNumber).toBeNull();
      expect(detail.citation.headingPath).toEqual([]);
      expect(detail.citation.originalFileName).toBe(`${docId}.pdf`);
      expect(detail.citation.mimeType).toBe('application/pdf');
    });
  });

  describe('Scenario D — Document Preview & Tokenized Streaming', () => {
    it('authorizes document preview, generates preview token, and streams binary representation safely', async () => {
      const convId = 'test-cit09-scen-d';
      const turnId = 'turn-cit09-scen-d';
      const userMsgId = 'msg-cit09-user-d';
      const asstMsgId = 'msg-cit09-asst-d';
      const docId = 'doc_cit09_previewable';

      await seedDocument({
        docId,
        title: 'Guía Clínica para Previsualización',
        versionId: 'ver_prev_1',
        chunkId: 'chunk_prev_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Guía Clínica para Previsualización',
        documentVersionId: 'ver_prev_1',
        chunkId: 'chunk_prev_1',
        excerpt: 'Extracto previsualizable.',
        pageNumber: 8,
        headingPath: ['Sección A'],
        relevanceScore: 0.94,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 90, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });
      const citationId = citationsResult.citations[0]!.id;

      // 1. Request Preview Availability
      const previewResult = await getCitationPreviewUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
        userRoles: ['Physiotherapist'],
      });

      expect(previewResult.preview.canPreview).toBe(true);
      expect(previewResult.preview.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(previewResult.preview.supportedFormat).toBe(true);
      expect(previewResult.preview.downloadAllowed).toBe(true);

      // 2. Generate HMAC Preview Token
      const token = previewTokenService.generateToken({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
        documentId: docId,
      });

      // 3. Verify Token Integrity
      const tokenVerify = previewTokenService.verifyToken(token, {
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
      });
      expect(tokenVerify.valid).toBe(true);
      expect(tokenVerify.claims?.documentId).toBe(docId);

      // 4. Stream Document Content
      const streamResult = await getCitationDocumentStreamUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
        userRoles: ['Physiotherapist'],
      });

      expect(streamResult.data).toEqual(mockPdfBytes);
      expect(streamResult.mimeType).toBe('application/pdf');
      expect(streamResult.originalFileName).toBe(`${docId}.pdf`);
      expect(streamResult.pageNumber).toBe(8);
    });
  });

  describe('Scenario E — Historical Conversation Reconstruction', () => {
    it('reconstructs citations on historical conversation retrieval without LLM text parsing', async () => {
      const convId = 'test-cit09-scen-e';
      const turnId = 'turn-cit09-scen-e';
      const userMsgId = 'msg-cit09-user-e';
      const asstMsgId = 'msg-cit09-asst-e';
      const docId = 'doc_cit09_historical';

      await seedDocument({
        docId,
        title: 'Guía Clínica Histórica',
        chunkId: 'chunk_hist_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Guía Clínica Histórica',
        chunkId: 'chunk_hist_1',
        excerpt: 'Extracto histórico inmutable.',
        pageNumber: 21,
        relevanceScore: 0.96,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta histórica [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 110, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      // Historical Message History Retrieval
      const history = await getMessageHistoryUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
      });

      expect(history.messages).toHaveLength(2);
      const asstMsg = history.messages.find((m) => m.role === 'ASSISTANT');
      expect(asstMsg).toBeDefined();
      const sources = asstMsg!.sources as Array<{
        documentTitle: string;
        pageNumber: number;
        excerpt: string;
      }>;
      expect(sources).toHaveLength(1);
      expect(sources[0]!.documentTitle).toBe('Guía Clínica Histórica');
      expect(sources[0]!.pageNumber).toBe(21);
      expect(sources[0]!.excerpt).toBe('Extracto histórico inmutable.');
    });
  });

  describe('Scenario F — Document Deletion & Lifecycle Status', () => {
    it('preserves answer and citations as DOCUMENT_SOFT_DELETED and blocks stream when document is deleted', async () => {
      const convId = 'test-cit09-scen-f';
      const turnId = 'turn-cit09-scen-f';
      const userMsgId = 'msg-cit09-user-f';
      const asstMsgId = 'msg-cit09-asst-f';
      const docId = 'doc_cit09_to_delete';

      await seedDocument({
        docId,
        title: 'Documento Clínico a Eliminar',
        chunkId: 'chunk_del_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Documento Clínico a Eliminar',
        chunkId: 'chunk_del_1',
        excerpt: 'Extracto de documento efímero.',
        pageNumber: 12,
        relevanceScore: 0.91,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 95, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      // Soft-delete the document in PostgreSQL
      await prisma.knowledgeDocument.update({
        where: { id: docId },
        data: { deletedAt: new Date() },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });
      const citation = citationsResult.citations[0]!;

      expect(citation.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
      expect(citation.canPreview).toBe(false);
      expect(citation.excerpt).toBe('Extracto de documento efímero.'); // Excerpt preserved

      // Preview endpoint fails closed
      const preview = await getCitationPreviewUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId: citation.id,
      });
      expect(preview.preview.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
      expect(preview.preview.canPreview).toBe(false);
      expect(preview.preview.downloadAllowed).toBe(false);

      // Stream endpoint throws DocumentArchivedOrDeletedError
      await expect(
        getCitationDocumentStreamUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_A,
          conversationId: convId,
          messageId: asstMsgId,
          citationId: citation.id,
        }),
      ).rejects.toThrow(DocumentArchivedOrDeletedError);
    });
  });

  describe('Scenario G — Unauthorized Cross-User and Cross-Tenant Access', () => {
    it('strictly denies cross-user and cross-tenant access to citation detail, preview, and streaming', async () => {
      const convId = 'test-cit09-scen-g';
      const turnId = 'turn-cit09-scen-g';
      const userMsgId = 'msg-cit09-user-g';
      const asstMsgId = 'msg-cit09-asst-g';
      const docId = 'doc_cit09_secure_vault';

      await seedDocument({
        docId,
        title: 'Documento Clínico Confidencial',
        chunkId: 'chunk_sec_1',
      });
      await seedConversation({
        convId,
        turnId,
        turnIndex: 1,
        userMsgId,
        asstMsgId,
        userId: USER_A,
      });

      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Documento Clínico Confidencial',
        chunkId: 'chunk_sec_1',
        excerpt: 'Datos confidenciales de rehabilitación.',
        pageNumber: 3,
        relevanceScore: 0.99,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta confidencial [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 80, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        userId: USER_A,
      });
      const citationId = citationsResult.citations[0]!.id;

      // 1. Cross-User within same tenant attempts access (User B trying to view User A's citation)
      await expect(
        getMessageCitationsUseCase.execute({
          tenantId: TENANT_ID,
          conversationId: convId,
          messageId: asstMsgId,
          userId: USER_B, // Intruder
          userRoles: ['Physiotherapist'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);

      await expect(
        getCitationDetailUseCase.execute({
          tenantId: TENANT_ID,
          conversationId: convId,
          messageId: asstMsgId,
          citationId,
          userId: USER_B, // Intruder
          userRoles: ['Physiotherapist'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);

      await expect(
        getCitationPreviewUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_B, // Intruder
          conversationId: convId,
          messageId: asstMsgId,
          citationId,
          userRoles: ['Physiotherapist'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);

      await expect(
        getCitationDocumentStreamUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_B, // Intruder
          conversationId: convId,
          messageId: asstMsgId,
          citationId,
          userRoles: ['Physiotherapist'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);

      // 2. Cross-Tenant access rejection
      await expect(
        getCitationPreviewUseCase.execute({
          tenantId: OTHER_TENANT_ID, // Foreign tenant
          userId: USER_A,
          conversationId: convId,
          messageId: asstMsgId,
          citationId,
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // 3. Forged Preview Token Rejection
      const validToken = previewTokenService.generateToken({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
        documentId: docId,
      });

      // Tampered token payload
      const tamperedToken = validToken.substring(0, validToken.length - 4) + 'abcd';
      const verifyTampered = previewTokenService.verifyToken(tamperedToken, {
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
      });
      expect(verifyTampered.valid).toBe(false);
      expect(verifyTampered.error).toBe('Token signature verification failed');
    });
  });

  describe('Scenario H — Multiple Messages & Continued Conversations', () => {
    it('maintains independent citation associations across continued conversation turns', async () => {
      const convId = 'test-cit09-scen-h';
      const doc1 = 'doc_cit09_turn1_doc';
      const doc2 = 'doc_cit09_turn2_doc';

      await seedDocument({ docId: doc1, title: 'Documento Turno 1', chunkId: 'chunk_h_1' });
      await seedDocument({ docId: doc2, title: 'Documento Turno 2', chunkId: 'chunk_h_2' });

      // Turn 1
      const turn1Id = 'turn-cit09-h-1';
      const user1MsgId = 'msg-cit09-u1';
      const asst1MsgId = 'msg-cit09-a1';
      await seedConversation({
        convId,
        turnId: turn1Id,
        turnIndex: 1,
        userMsgId: user1MsgId,
        asstMsgId: asst1MsgId,
      });

      const cite1 = RAGSourceCitation.create({
        documentId: doc1,
        documentTitle: 'Documento Turno 1',
        chunkId: 'chunk_h_1',
        excerpt: 'Extracto de Turno 1',
        pageNumber: 1,
        relevanceScore: 0.95,
        retrievalRank: 1,
      });

      const mockPipeline1: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta 1 [1].',
          sources: [cite1],
          metadata: { model: 'qwen3:4b', latencyMs: 100, retrievalCount: 1, finishReason: 'stop' },
          isGrounded: true,
        } as RAGTurnExecutionResult),
      };

      const executeUseCase1 = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipeline1,
        historyLoader,
        txRunner,
        citationRepo,
      );

      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId: turn1Id,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      // Turn 2
      const turn2Id = 'turn-cit09-h-2';
      const user2MsgId = 'msg-cit09-u2';
      const asst2MsgId = 'msg-cit09-a2';

      const now = new Date();
      await prisma.aiConversationTurn.create({
        data: {
          id: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ID,
          turnIndex: 2,
          status: TurnStatus.PENDING,
          clientTurnId: `client-${turn2Id}`,
          idempotencyKey: `${convId}_2`,
          idempotencyPayloadHash: 'hash_2',
          activeAttemptId: null,
          activeAttemptNumber: 1,
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: user2MsgId,
          turnId: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ID,
          role: 'USER',
          sequenceNumber: 3,
          attemptNumber: 1,
          status: 'SUCCESS',
          isCanonical: false,
          content: 'Segunda pregunta de seguimiento.',
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: asst2MsgId,
          turnId: turn2Id,
          conversationId: convId,
          tenantId: TENANT_ID,
          role: 'ASSISTANT',
          sequenceNumber: 4,
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
            id: turn2Id,
            conversationId: convId,
            tenantId: TENANT_ID,
          },
        },
        data: {
          activeAttemptId: asst2MsgId,
        },
      });

      const cite2 = RAGSourceCitation.create({
        documentId: doc2,
        documentTitle: 'Documento Turno 2',
        chunkId: 'chunk_h_2',
        excerpt: 'Extracto de Turno 2',
        pageNumber: 2,
        relevanceScore: 0.89,
        retrievalRank: 1,
      });

      const mockPipeline2: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta 2 [1].',
          sources: [cite2],
          metadata: { model: 'qwen3:4b', latencyMs: 105, retrievalCount: 1, finishReason: 'stop' },
          isGrounded: true,
        } as RAGTurnExecutionResult),
      };

      const executeUseCase2 = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipeline2,
        historyLoader,
        txRunner,
        citationRepo,
      );

      await executeUseCase2.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId: turn2Id,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      // Verify independently retrieved citations per message
      const citations1 = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asst1MsgId,
      });
      const citations2 = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asst2MsgId,
      });

      expect(citations1.citations).toHaveLength(1);
      expect(citations1.citations[0]!.documentId).toBe(doc1);
      expect(citations1.citations[0]!.excerpt).toBe('Extracto de Turno 1');

      expect(citations2.citations).toHaveLength(1);
      expect(citations2.citations[0]!.documentId).toBe(doc2);
      expect(citations2.citations[0]!.excerpt).toBe('Extracto de Turno 2');

      // Verify complete historical reconstruction maintains both sets
      const history = await getMessageHistoryUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
      });
      expect(history.messages).toHaveLength(4);
      const msg1 = history.messages.find((m) => m.id === asst1MsgId);
      const msg2 = history.messages.find((m) => m.id === asst2MsgId);
      const sources1 = msg1!.sources as Array<{ documentId: string }>;
      const sources2 = msg2!.sources as Array<{ documentId: string }>;
      expect(sources1[0]!.documentId).toBe(doc1);
      expect(sources2[0]!.documentId).toBe(doc2);
    });
  });

  describe('Scenario I — Failure Recovery & Storage Resilience', () => {
    it('handles retrieval with zero results without fabricating citations', async () => {
      const convId = 'test-cit09-scen-i1';
      const turnId = 'turn-cit09-scen-i1';
      const userMsgId = 'msg-cit09-u-i1';
      const asstMsgId = 'msg-cit09-a-i1';

      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      // Pipeline executed on ungrounded/general knowledge without retrieval matches
      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta general sin fuentes específicas de la clínica.',
          sources: [], // Zero sources
          metadata: { model: 'qwen3:4b', latencyMs: 70, retrievalCount: 0, finishReason: 'stop' },
          isGrounded: false,
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });

      expect(citationsResult.citations).toHaveLength(0);
      expect(citationsResult.totalCitations).toBe(0);

      const dbRows = await prisma.aiConversationCitation.findMany({
        where: { conversationId: convId, messageId: asstMsgId },
      });
      expect(dbRows).toHaveLength(0); // Zero hallucinated citations in database
    });

    it('handles physical storage file absence gracefully with EXCERPT_ONLY without crashing', async () => {
      const convId = 'test-cit09-scen-i2';
      const turnId = 'turn-cit09-scen-i2';
      const userMsgId = 'msg-cit09-u-i2';
      const asstMsgId = 'msg-cit09-a-i2';
      const docId = 'doc_cit09_missing_storage_file';

      await seedDocument({
        docId,
        title: 'Documento con Almacenamiento Inaccesible',
        chunkId: 'chunk_miss_1',
      });
      await seedConversation({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

      const cite = RAGSourceCitation.create({
        documentId: docId,
        documentTitle: 'Documento con Almacenamiento Inaccesible',
        chunkId: 'chunk_miss_1',
        excerpt: 'Extracto preservado en base de datos.',
        pageNumber: 4,
        relevanceScore: 0.93,
        retrievalRank: 1,
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Respuesta [1].',
          sources: [cite],
          metadata: { model: 'qwen3:4b', latencyMs: 85, retrievalCount: 1, finishReason: 'stop' },
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

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        turnId,
        userId: USER_A,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
      });

      const citationsResult = await getMessageCitationsUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
      });
      const citationId = citationsResult.citations[0]!.id;

      // Simulate storage outage: file missing in S3/Local object store
      (storagePort.exists as jest.Mock).mockResolvedValue(false);

      const preview = await getCitationPreviewUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        citationId,
      });

      expect(preview.preview.previewStatus).toBe('EXCERPT_ONLY');
      expect(preview.preview.canPreview).toBe(false);
      expect(preview.preview.downloadAllowed).toBe(false);
      expect(preview.preview.excerpt).toBe('Extracto preservado en base de datos.');

      // Streaming fails with DocumentFileNotFoundInStorageError
      await expect(
        getCitationDocumentStreamUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_A,
          conversationId: convId,
          messageId: asstMsgId,
          citationId,
        }),
      ).rejects.toThrow(DocumentFileNotFoundInStorageError);
    });
  });
});
