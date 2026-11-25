import { PrismaClient } from '@prisma/client';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  GetMessageHistoryUseCase,
  GetMessageCitationsUseCase,
  GetCitationDetailUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  RAGTurnExecutionResult,
  ConversationRole,
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
import { AiConversationResponseMapper } from '../conversation/mappers/ai-conversation-response.mapper';

/**
 * AI-09.4-CIT.03 — Answer Generation & Citation Persistence Integration Tests
 * Real PostgreSQL Integration & Contract Tests
 *
 * Verifies:
 * 1. End-to-end RAG retrieval provenance preservation across relational and jsonb persistence.
 * 2. Deterministic citation ordering by citationPosition ascending.
 * 3. Multiple citations per message preserving chunk-level granularity.
 * 4. Interrupted / cancelled / failed turn isolation (zero citations persisted).
 * 5. Transactional fencing & idempotency (no duplicate citations on replay).
 * 6. Historical message and citation retrieval resilience with snapshot preservation.
 */
describe('AI-09.4-CIT.03: Citation Provenance & Persistence Integration (PostgreSQL)', () => {
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

  const TENANT_ID = 'tenant_cit03_provenance';
  const USER_ID = 'usr_physio_cit03';

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
    );
    getCitationDetailUseCase = new GetCitationDetailUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      documentRepo,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-cit03-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "id" LIKE 'doc_cit03_%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-cit03-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "id" LIKE 'doc_cit03_%'`,
    );
  });

  async function seedKnowledgeDoc(
    docId: string,
    title: string,
    versionId?: string,
    chunkId?: string,
    chunkContent?: string,
  ) {
    const now = new Date();
    await prisma.knowledgeDocument.upsert({
      where: { id: docId },
      create: {
        id: docId,
        tenantId: TENANT_ID,
        title,
        uploadedBy: USER_ID,
        visibilityScope: 'ALL_STAFF',
        createdAt: now,
        updatedAt: now,
      },
      update: {
        title,
        deletedAt: null,
      },
    });

    const effectiveVerId = versionId ?? `ver_${docId}`;
    const validChecksum = 'a'.repeat(64);
    await prisma.documentVersion.upsert({
      where: { id: effectiveVerId },
      create: {
        id: effectiveVerId,
        documentId: docId,
        versionNumber: 1,
        originalFileName: 'doc.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: validChecksum,
        storageKey: `docs/${effectiveVerId}`,
        uploadedBy: USER_ID,
        createdAt: now,
      },
      update: {},
    });

    if (chunkId) {
      await prisma.knowledgeChunk.upsert({
        where: { id: chunkId },
        create: {
          id: chunkId,
          tenantId: TENANT_ID,
          documentId: docId,
          documentVersionId: effectiveVerId,
          sequence: 1,
          content: chunkContent ?? 'Test chunk content for RAG retrieval.',
          tokenCount: 50,
          provenance: {},
          checksum: validChecksum,
          createdAt: now,
        },
        update: {},
      });
    }
  }

  async function seedTurnInDb(options: {
    convId: string;
    turnId: string;
    turnIndex: number;
    userMsgId: string;
    asstMsgId: string;
    tenantId?: string;
    userPrompt?: string;
    turnStatus?: TurnStatus;
  }) {
    const tenantId = options.tenantId ?? TENANT_ID;
    const now = new Date();

    await prisma.aiConversation.upsert({
      where: {
        uq_conversation_id_tenant: {
          id: options.convId,
          tenantId,
        },
      },
      create: {
        id: options.convId,
        tenantId,
        userId: USER_ID,
        title: 'Citation Provenance Test Conversation',
        turnCounter: options.turnIndex,
        messageCounter: options.turnIndex * 2,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      update: {},
    });

    await prisma.aiConversationTurn.create({
      data: {
        id: options.turnId,
        conversationId: options.convId,
        tenantId,
        turnIndex: options.turnIndex,
        status: options.turnStatus ?? TurnStatus.PENDING,
        clientTurnId: `client-${options.turnId}`,
        idempotencyKey: `${options.convId}_${options.turnIndex}`,
        idempotencyPayloadHash: `hash_${options.turnIndex}`,
        activeAttemptId: null,
        activeAttemptNumber: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: options.userMsgId,
        turnId: options.turnId,
        conversationId: options.convId,
        tenantId,
        role: 'USER',
        sequenceNumber: (options.turnIndex - 1) * 2 + 1,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: false,
        content: options.userPrompt ?? 'Clinical protocol inquiry regarding knee meniscus.',
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: options.asstMsgId,
        turnId: options.turnId,
        conversationId: options.convId,
        tenantId,
        role: 'ASSISTANT',
        sequenceNumber: (options.turnIndex - 1) * 2 + 2,
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
          id: options.turnId,
          conversationId: options.convId,
          tenantId,
        },
      },
      data: {
        activeAttemptId: options.asstMsgId,
      },
    });
  }

  it('1. persists end-to-end RAG retrieval provenance atomically in both jsonb and relational tables', async () => {
    const convId = 'test-cit03-provenance-1';
    const turnId = 'test-cit03-turn-1';
    const userMsgId = 'test-cit03-umsg-1';
    const asstMsgId = 'test-cit03-amsg-1';
    const docId = 'doc_cit03_knee_protocol_01';
    const verId = 'ver_cit03_knee_v1';
    const chunkId = 'chunk_cit03_meniscus_sec2_05';

    await seedKnowledgeDoc(
      docId,
      'Guía de Rehabilitación Meniscal',
      verId,
      chunkId,
      'El protocolo de rehabilitación tras meniscectomía parcial prioriza la extensión pasiva completa en la fase aguda.',
    );
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const evidenceChunkExcerpt =
      'El protocolo de rehabilitación tras meniscectomía parcial prioriza la extensión pasiva completa en la fase aguda.';
    const source = RAGSourceCitation.create({
      documentId: docId,
      documentTitle: 'Guía de Rehabilitación Meniscal',
      chunkId,
      documentVersionId: verId,
      documentVersionNumber: 1,
      excerpt: evidenceChunkExcerpt,
      pageNumber: 22,
      headingPath: ['Fase Aguda', 'Control de Edema y Rango'],
      relevanceScore: 0.945,
      retrievalRank: 1,
      sourceStrategy: 'HYBRID',
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content:
          'En la fase aguda posterior a la meniscectomía, la prioridad es recuperar la extensión pasiva completa.',
        sources: [source],
        metadata: {
          model: 'qwen3:4b',
          latencyMs: 180,
          retrievalCount: 1,
          finishReason: 'stop',
        },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });

    expect(result.outcome).toBe('SUCCESS');
    expect(result.sources).toHaveLength(1);

    // 1. Verify jsonb persistence in ai_conversation_messages
    const dbMessage = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    expect(dbMessage).toBeDefined();
    expect(dbMessage?.status).toBe('SUCCESS');
    expect(dbMessage?.isCanonical).toBe(true);

    const sourcesJson = dbMessage?.sources as unknown as Array<Record<string, unknown>>;
    expect(sourcesJson).toHaveLength(1);
    expect(sourcesJson[0]).toMatchObject({
      documentId: docId,
      documentTitle: 'Guía de Rehabilitación Meniscal',
      chunkId,
      documentVersionId: verId,
      documentVersionNumber: 1,
      excerpt: evidenceChunkExcerpt,
      pageNumber: 22,
      headingPath: ['Fase Aguda', 'Control de Edema y Rango'],
      relevanceScore: 0.945,
      retrievalRank: 1,
      sourceStrategy: 'HYBRID',
    });

    // 2. Verify relational persistence in ai_conversation_citations
    const dbCitations = await prisma.aiConversationCitation.findMany({
      where: {
        tenantId: TENANT_ID,
        messageId: asstMsgId,
      },
      orderBy: { citationPosition: 'asc' },
    });
    expect(dbCitations).toHaveLength(1);
    const cit = dbCitations[0];
    expect(cit).toBeDefined();
    expect(cit?.documentId).toBe(docId);
    expect(cit?.documentTitleSnapshot).toBe('Guía de Rehabilitación Meniscal');
    expect(cit?.chunkId).toBe(chunkId);
    expect(cit?.documentVersionId).toBe(verId);
    expect(cit?.citationPosition).toBe(1);
    expect(cit?.excerpt).toBe(evidenceChunkExcerpt);
    expect(cit?.pageNumber).toBe(22);
    expect(cit?.headingPath).toEqual(['Fase Aguda', 'Control de Edema y Rango']);
    expect(cit?.relevanceScore).toBeCloseTo(0.945, 3);
    expect(cit?.retrievalRank).toBe(1);
    expect(cit?.sourceStrategy).toBe('HYBRID');
  });

  it('2. guarantees deterministic citation ordering by citationPosition matching retrieval rank', async () => {
    const convId = 'test-cit03-ordering-2';
    const turnId = 'test-cit03-turn-2';
    const userMsgId = 'test-cit03-umsg-2';
    const asstMsgId = 'test-cit03-amsg-2';
    const doc1 = 'doc_cit03_sports_01';
    const doc2 = 'doc_cit03_sports_02';
    const doc3 = 'doc_cit03_sports_03';

    await seedKnowledgeDoc(
      doc1,
      'Tratado de Fisioterapia Deportiva',
      undefined,
      'chunk_cit03_sp_01',
    );
    await seedKnowledgeDoc(doc2, 'Biomecánica Clínica Articular', undefined, 'chunk_cit03_bio_02');
    await seedKnowledgeDoc(
      doc3,
      'Criterios de Alta y Retorno Deportivo',
      undefined,
      'chunk_cit03_ret_03',
    );
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const sources = [
      RAGSourceCitation.create({
        documentId: doc1,
        documentTitle: 'Tratado de Fisioterapia Deportiva',
        chunkId: 'chunk_cit03_sp_01',
        excerpt: 'Primer extracto clasificado con mayor relevancia.',
        pageNumber: 45,
        relevanceScore: 0.98,
        retrievalRank: 1,
        sourceStrategy: 'HYBRID',
      }),
      RAGSourceCitation.create({
        documentId: doc2,
        documentTitle: 'Biomecánica Clínica Articular',
        chunkId: 'chunk_cit03_bio_02',
        excerpt: 'Segundo extracto clasificado como soporte secundario.',
        pageNumber: 110,
        relevanceScore: 0.89,
        retrievalRank: 2,
        sourceStrategy: 'HYBRID',
      }),
      RAGSourceCitation.create({
        documentId: doc3,
        documentTitle: 'Criterios de Alta y Retorno Deportivo',
        chunkId: 'chunk_cit03_ret_03',
        excerpt: 'Tercer extracto de soporte complementario.',
        pageNumber: 88,
        relevanceScore: 0.77,
        retrievalRank: 3,
        sourceStrategy: 'KEYWORD',
      }),
    ];

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Respuesta multi-fuente debidamente fundamentada.',
        sources,
        metadata: {
          model: 'qwen3:4b',
          latencyMs: 250,
          retrievalCount: 3,
          finishReason: 'stop',
        },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });

    const persistedCitations = await citationRepo.listByMessage(TENANT_ID, convId, asstMsgId);
    expect(persistedCitations).toHaveLength(3);

    // Verify strictly ascending citationPosition
    expect(persistedCitations[0]?.citationPosition).toBe(1);
    expect(persistedCitations[0]?.documentId).toBe(doc1);
    expect(persistedCitations[0]?.retrievalRank).toBe(1);

    expect(persistedCitations[1]?.citationPosition).toBe(2);
    expect(persistedCitations[1]?.documentId).toBe(doc2);
    expect(persistedCitations[1]?.retrievalRank).toBe(2);

    expect(persistedCitations[2]?.citationPosition).toBe(3);
    expect(persistedCitations[2]?.documentId).toBe(doc3);
    expect(persistedCitations[2]?.retrievalRank).toBe(3);
  });

  it('3. isolates interrupted, cancelled, or failed turns, persisting zero citations', async () => {
    const convId = 'test-cit03-cancelled-3';
    const turnId = 'test-cit03-turn-3';
    const userMsgId = 'test-cit03-umsg-3';
    const asstMsgId = 'test-cit03-amsg-3';
    const docId = 'doc_cit03_cancelled_src';

    await seedKnowledgeDoc(docId, 'Documento que no debe ser citado');
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    // Pipeline returns CANCELLED
    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'CANCELLED',
        content: '',
        sources: [
          RAGSourceCitation.create({
            documentId: docId,
            documentTitle: 'Documento que no debe ser citado',
            chunkId: 'chunk_cit03_c1',
            relevanceScore: 0.99,
          }),
        ],
        metadata: {
          model: 'qwen3:4b',
          latencyMs: 50,
          retrievalCount: 0,
          finishReason: 'cancelled',
        },
        isGrounded: false,
        errorMessage: 'Client disconnected during generation',
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });

    expect(result.outcome).toBe('CANCELLED');
    expect(result.sources).toHaveLength(0);

    // Verify NO citations in relational table
    const dbCitations = await prisma.aiConversationCitation.findMany({
      where: { tenantId: TENANT_ID, messageId: asstMsgId },
    });
    expect(dbCitations).toHaveLength(0);

    // Verify message sources is null/empty
    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    expect(dbMsg?.status).toBe('CANCELLED');
    expect(dbMsg?.isCanonical).toBe(false);
    expect(dbMsg?.sources).toBeNull();
  });

  it('4. enforces transactional idempotency: re-executing completed turn does not duplicate citations', async () => {
    const convId = 'test-cit03-idempotent-4';
    const turnId = 'test-cit03-turn-4';
    const userMsgId = 'test-cit03-umsg-4';
    const asstMsgId = 'test-cit03-amsg-4';
    const docId = 'doc_cit03_unique_01';

    await seedKnowledgeDoc(docId, 'Guía Única de Fisioterapia', undefined, 'chunk_cit03_u1');
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const source = RAGSourceCitation.create({
      documentId: docId,
      documentTitle: 'Guía Única de Fisioterapia',
      chunkId: 'chunk_cit03_u1',
      excerpt: 'Extracto original único verificado.',
      relevanceScore: 0.92,
      retrievalRank: 1,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Respuesta completada en primer intento.',
        sources: [source],
        metadata: { model: 'qwen3:4b', latencyMs: 150, retrievalCount: 1, finishReason: 'stop' },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    // First execution
    const firstExec = await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });
    expect(firstExec.outcome).toBe('SUCCESS');

    const initialCitations = await citationRepo.listByMessage(TENANT_ID, convId, asstMsgId);
    expect(initialCitations).toHaveLength(1);

    // Second execution (replay / retry)
    const replayExec = await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });
    expect(replayExec.outcome).toBe('SUCCESS');

    // Verify citation count has NOT increased
    const afterReplayCitations = await citationRepo.listByMessage(TENANT_ID, convId, asstMsgId);
    expect(afterReplayCitations).toHaveLength(1);
    expect(afterReplayCitations[0]?.id.value).toBe(initialCitations[0]?.id.value);
  });

  it('5. retrieves historical messages with complete citation provenance preserved', async () => {
    const convId = 'test-cit03-history-5';
    const turnId = 'test-cit03-turn-5';
    const userMsgId = 'test-cit03-umsg-5';
    const asstMsgId = 'test-cit03-amsg-5';
    const docId = 'doc_cit03_history_protocol';
    const verId = 'ver_cit03_hist_1';

    await seedKnowledgeDoc(
      docId,
      'Protocolo de Recuperación Muscular',
      verId,
      'chunk_cit03_hist_42',
    );
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const source = RAGSourceCitation.create({
      documentId: docId,
      documentTitle: 'Protocolo de Recuperación Muscular',
      chunkId: 'chunk_cit03_hist_42',
      documentVersionId: verId,
      documentVersionNumber: 1,
      excerpt: 'El descanso activo favorece la reducción de lactato sérico.',
      pageNumber: 18,
      headingPath: ['Fisiología', 'Recuperación Activa'],
      relevanceScore: 0.912,
      retrievalRank: 1,
      sourceStrategy: 'HYBRID',
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'El descanso activo es superior al reposo absoluto.',
        sources: [source],
        metadata: { model: 'qwen3:4b', latencyMs: 120, retrievalCount: 1, finishReason: 'stop' },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });

    // Execute message history query
    const historyResult = await getMessageHistoryUseCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      limit: 10,
    });

    expect(historyResult.messages).toHaveLength(2); // 1 User + 1 Assistant
    const asstMessage = historyResult.messages.find((m) => m.role === ConversationRole.ASSISTANT);
    expect(asstMessage).toBeDefined();
    expect(asstMessage?.sources).toBeDefined();

    // Serialize through AiConversationResponseMapper as API controller does
    const apiResponse = AiConversationResponseMapper.toMessageHistoryResponse(historyResult);
    const apiAsstMsg = apiResponse.messages.find((m) => m.role === ConversationRole.ASSISTANT);
    expect(apiAsstMsg?.sources).toHaveLength(1);

    const historyCitation = apiAsstMsg?.sources?.[0];
    expect(historyCitation).toMatchObject({
      documentId: docId,
      documentTitle: 'Protocolo de Recuperación Muscular',
      chunkId: 'chunk_cit03_hist_42',
      documentVersionId: verId,
      documentVersionNumber: 1,
      excerpt: 'El descanso activo favorece la reducción de lactato sérico.',
      pageNumber: 18,
      headingPath: ['Fisiología', 'Recuperación Activa'],
      relevanceScore: 0.912,
      retrievalRank: 1,
      sourceStrategy: 'HYBRID',
    });

    // Also verify dedicated citation listing endpoint use case
    const citationsListResult = await getMessageCitationsUseCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      messageId: asstMsgId,
    });
    expect(citationsListResult.citations).toHaveLength(1);
    expect(citationsListResult.citations[0]?.documentTitleSnapshot).toBe(
      'Protocolo de Recuperación Muscular',
    );
    expect(citationsListResult.citations[0]?.excerpt).toBe(
      'El descanso activo favorece la reducción de lactato sérico.',
    );
  });

  it('6. preserves citation snapshot resilience even if source document is soft-deleted or removed', async () => {
    const convId = 'test-cit03-resilience-6';
    const turnId = 'test-cit03-turn-6';
    const userMsgId = 'test-cit03-umsg-6';
    const asstMsgId = 'test-cit03-amsg-6';
    const documentId = 'doc_cit03_ephemeral_to_delete';

    await seedKnowledgeDoc(
      documentId,
      'Documento Efímero sobre Crioterapia',
      undefined,
      'chunk_cit03_crio_01',
    );
    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const source = RAGSourceCitation.create({
      documentId,
      documentTitle: 'Documento Efímero sobre Crioterapia',
      chunkId: 'chunk_cit03_crio_01',
      excerpt: 'La crioterapia debe aplicarse en intervalos no mayores a 15-20 minutos.',
      pageNumber: 3,
      relevanceScore: 0.93,
      retrievalRank: 1,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'La crioterapia tiene un límite de aplicación seguro.',
        sources: [source],
        metadata: { model: 'qwen3:4b', latencyMs: 110, retrievalCount: 1, finishReason: 'stop' },
        isGrounded: true,
      } as RAGTurnExecutionResult),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
      citationRepo,
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      turnId,
      userId: USER_ID,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:read'] },
    });

    // Simulate soft deletion of the document
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    // Read message citations
    const citationsResult = await getMessageCitationsUseCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      messageId: asstMsgId,
    });

    expect(citationsResult.citations).toHaveLength(1);
    const citation = citationsResult.citations[0];
    expect(citation).toBeDefined();
    // Document title snapshot and excerpt MUST survive unchanged
    expect(citation?.documentTitleSnapshot).toBe('Documento Efímero sobre Crioterapia');
    expect(citation?.excerpt).toBe(
      'La crioterapia debe aplicarse en intervalos no mayores a 15-20 minutos.',
    );
    expect(citation?.relevanceScore).toBeCloseTo(0.93, 2);

    // Detail query also succeeds without throwing DocumentNotFoundError
    const detail = await getCitationDetailUseCase.execute({
      tenantId: TENANT_ID,
      conversationId: convId,
      messageId: asstMsgId,
      citationId: citation!.id,
    });
    expect(detail.citation.documentTitleSnapshot).toBe('Documento Efímero sobre Crioterapia');
    expect(detail.citation.excerpt).toBe(
      'La crioterapia debe aplicarse en intervalos no mayores a 15-20 minutos.',
    );
    expect(detail.citation.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
    expect(detail.citation.canPreview).toBe(false);
  });
});
