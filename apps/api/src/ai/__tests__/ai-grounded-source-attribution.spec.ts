import { PrismaClient } from '@prisma/client';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  AiSourceAttributionService,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { AiConversationResponseMapper } from '../conversation/mappers/ai-conversation-response.mapper';

/**
 * AI-09.3-BE.06.06 — Grounded Source Attribution & Canonical Response Metadata
 * Real PostgreSQL Integration & Contract Tests
 *
 * Verifies:
 * 1. One retrieved source
 * 2. Multiple retrieved sources
 * 3. No relevant sources (abstention)
 * 4. Duplicate source references
 * 5. Invalid source metadata
 * 6. Source attribution associated with the correct assistant message
 * 7. Retry without duplicate attribution
 * 8. Failed and cancelled generation
 * 9. Cross-tenant source isolation
 * 10. Safe API serialization (internal fields stripped)
 * 11. No fabricated citations
 * 12. Backward compatibility of existing response DTOs
 */
describe('AI-09.3-BE.06.06: Grounded Source Attribution & Response Metadata (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;

  const TENANT_A = 'tenant_attribution_a';
  const USER_ID = 'usr_physio_attr_01';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    txRunner = new PrismaAiConversationTransactionRunner(
      prisma,
      convRepo,
      turnRepo,
      messageRepo,
      auditRepo,
    );
    persistUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-attr-%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-attr-%'`,
    );
  });

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
    const tenantId = options.tenantId ?? TENANT_A;
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
        title: 'Attribution Test Conversation',
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
        content: options.userPrompt ?? 'Clinical protocol query',
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
        sequenceNumber: options.turnIndex * 2,
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

  it('1. persists and attributes exactly one retrieved source', async () => {
    const convId = 'test-conv-attr-1';
    const turnId = 'test-conv-attr-turn-1';
    const userMsgId = 'test-conv-attr-u1';
    const asstMsgId = 'test-conv-attr-a1';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const citation = RAGSourceCitation.create({
      documentId: 'doc_acl_guide_01',
      documentTitle: 'Guía Clínica de Rehabilitación LCA',
      chunkId: 'chk_acl_phase1_01',
      pageNumber: 12,
      headingPath: ['Fase Aguda', 'Crioterapia y Movilidad'],
      relevanceScore: 0.945,
      sourceStrategy: 'HYBRID',
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Para la fase aguda de LCA se recomienda crioterapia y movilidad activa.',
        isGrounded: true,
        sources: [citation],
        metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 250 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.turnStatus).toBe(TurnStatus.COMPLETED);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.documentId).toBe('doc_acl_guide_01');

    // Verify in PostgreSQL
    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    expect(dbMsg).not.toBeNull();
    expect(dbMsg?.status).toBe('SUCCESS');
    expect(dbMsg?.isCanonical).toBe(true);

    const persistedSources = dbMsg?.sources as Array<Record<string, unknown>>;
    expect(persistedSources).toHaveLength(1);
    expect(persistedSources[0]?.['documentId']).toBe('doc_acl_guide_01');
    expect(persistedSources[0]?.['pageNumber']).toBe(12);
  });

  it('2. persists and preserves multiple distinct retrieved sources', async () => {
    const convId = 'test-conv-attr-2';
    const turnId = 'test-conv-attr-turn-2';
    const userMsgId = 'test-conv-attr-u2';
    const asstMsgId = 'test-conv-attr-a2';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const citations = [
      RAGSourceCitation.create({
        documentId: 'doc_tendon_01',
        documentTitle: 'Tendinopatía Rotuliana',
        chunkId: 'chk_tendon_01',
        pageNumber: 5,
        headingPath: ['Carga Isométrica'],
        relevanceScore: 0.92,
        sourceStrategy: 'SEMANTIC',
      }),
      RAGSourceCitation.create({
        documentId: 'doc_tendon_02',
        documentTitle: 'Manual Ecográfico Musculoesquelético',
        chunkId: 'chk_echo_02',
        pageNumber: 34,
        headingPath: ['Patología Tendinosa', 'Grosor'],
        relevanceScore: 0.86,
        sourceStrategy: 'KEYWORD',
      }),
    ];

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'La carga isométrica reduce el dolor en tendinopatías rotulianas.',
        isGrounded: true,
        sources: citations,
        metadata: { model: 'gpt-4o', retrievalCount: 2, latencyMs: 310 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.sources).toHaveLength(2);

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    const persisted = dbMsg?.sources as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.['chunkId']).toBe('chk_tendon_01');
    expect(persisted[1]?.['chunkId']).toBe('chk_echo_02');
  });

  it('3. handles no relevant sources (abstention) with clean empty attribution', async () => {
    const convId = 'test-conv-attr-3';
    const turnId = 'test-conv-attr-turn-3';
    const userMsgId = 'test-conv-attr-u3';
    const asstMsgId = 'test-conv-attr-a3';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'ABSTAINED',
        content: 'No se encontró documentación clínica suficiente para responder.',
        isGrounded: false,
        sources: [],
        metadata: {
          model: 'none',
          retrievalCount: 0,
          latencyMs: 40,
          finishReason: 'insufficient_context',
        },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.outcome).toBe('ABSTAINED');
    expect(result.sources).toHaveLength(0);

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    // In PostgreSQL, absence of citations is safely stored as null
    expect(dbMsg?.sources).toBeNull();
  });

  it('4. deduplicates duplicate source references before persistence', async () => {
    const convId = 'test-conv-attr-4';
    const turnId = 'test-conv-attr-turn-4';
    const userMsgId = 'test-conv-attr-u4';
    const asstMsgId = 'test-conv-attr-a4';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const rawDuplicateSources = [
      {
        documentId: 'doc_dup_01',
        documentTitle: 'Shoulder Protocols',
        chunkId: 'chk_dup_01',
        pageNumber: 10,
        headingPath: ['Stage 1'],
        relevanceScore: 0.75,
        sourceStrategy: 'SEMANTIC',
      },
      {
        documentId: 'doc_dup_01',
        documentTitle: 'Shoulder Protocols',
        chunkId: 'chk_dup_01',
        pageNumber: 10,
        headingPath: ['Stage 1'],
        relevanceScore: 0.95, // higher score wins
        sourceStrategy: 'HYBRID',
      },
    ];

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Protocolos de hombro validados.',
        isGrounded: true,
        sources: rawDuplicateSources as unknown as RAGSourceCitation[],
        metadata: { model: 'gpt-4o', retrievalCount: 2, latencyMs: 200 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.sources).toHaveLength(1);

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    const persisted = dbMsg?.sources as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.['relevanceScore']).toBe(0.95);
  });

  it('5. safely filters out invalid or malformed source metadata without corrupting persistence', async () => {
    const convId = 'test-conv-attr-5';
    const turnId = 'test-conv-attr-turn-5';
    const userMsgId = 'test-conv-attr-u5';
    const asstMsgId = 'test-conv-attr-a5';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const mixedQualitySources = [
      {
        documentId: 'doc_valid_01',
        documentTitle: 'Valid Document',
        chunkId: 'chk_valid_01',
        pageNumber: 4,
        relevanceScore: 0.88,
      },
      {
        documentId: '', // invalid empty documentId
        documentTitle: 'Missing Doc ID',
        chunkId: 'chk_invalid_01',
        relevanceScore: 0.9,
      },
      {
        documentId: 'doc_invalid_02',
        documentTitle: 'Missing Chunk ID',
        chunkId: '', // invalid empty chunkId
        relevanceScore: 0.9,
      },
      {
        documentId: 'doc_invalid_03',
        documentTitle: 'Invalid Score',
        chunkId: 'chk_03',
        relevanceScore: 'NaN' as unknown as number,
      },
    ];

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Valid content with sanitized sources.',
        isGrounded: true,
        sources: mixedQualitySources as unknown as RAGSourceCitation[],
        metadata: { model: 'gpt-4o', retrievalCount: 4, latencyMs: 180 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.documentId).toBe('doc_valid_01');

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    const persisted = dbMsg?.sources as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
  });

  it('6. associates source attribution strictly with the canonical assistant message (not user message)', async () => {
    const convId = 'test-conv-attr-6';
    const turnId = 'test-conv-attr-turn-6';
    const userMsgId = 'test-conv-attr-u6';
    const asstMsgId = 'test-conv-attr-a6';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const citation = RAGSourceCitation.create({
      documentId: 'doc_asst_only_01',
      documentTitle: 'Assistant Attribution Test',
      chunkId: 'chk_asst_01',
      relevanceScore: 0.91,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Assistant answer content.',
        isGrounded: true,
        sources: [citation],
        metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 150 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    // Verify user message does NOT contain sources
    const userMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: userMsgId },
    });
    expect(userMsg?.sources).toBeNull();
    expect(userMsg?.role).toBe('USER');

    // Verify assistant message DOES contain sources
    const asstMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    expect(asstMsg?.role).toBe('ASSISTANT');
    expect(asstMsg?.isCanonical).toBe(true);
    expect(asstMsg?.sources).not.toBeNull();
  });

  it('7. recovers citations idempotently on retry without duplication', async () => {
    const convId = 'test-conv-attr-7';
    const turnId = 'test-conv-attr-turn-7';
    const userMsgId = 'test-conv-attr-u7';
    const asstMsgId = 'test-conv-attr-a7';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const citation = RAGSourceCitation.create({
      documentId: 'doc_idempotent_01',
      documentTitle: 'Idempotency Source',
      chunkId: 'chk_idem_01',
      relevanceScore: 0.88,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Original completion.',
        isGrounded: true,
        sources: [citation],
        metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 100 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    // Initial Execution
    const firstResult = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });
    expect(firstResult.sources).toHaveLength(1);
    expect(mockPipeline.executeTurn).toHaveBeenCalledTimes(1);

    // Retry / Fast-path Replay
    const secondResult = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    // Pipeline should NOT be called again
    expect(mockPipeline.executeTurn).toHaveBeenCalledTimes(1);
    expect(secondResult.sources).toHaveLength(1);
    expect(secondResult.sources[0]?.documentId).toBe('doc_idempotent_01');

    // Total messages in database must still be exactly 2 (1 user, 1 assistant)
    const messageCount = await prisma.aiConversationMessage.count({
      where: { conversationId: convId },
    });
    expect(messageCount).toBe(2);
  });

  it('8. does not persist or expose source attribution for failed or cancelled generation', async () => {
    const convId = 'test-conv-attr-8';
    const turnId = 'test-conv-attr-turn-8';
    const userMsgId = 'test-conv-attr-u8';
    const asstMsgId = 'test-conv-attr-a8';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const spuriousCitation = RAGSourceCitation.create({
      documentId: 'doc_spurious_01',
      documentTitle: 'Spurious Citation on Failure',
      chunkId: 'chk_spurious_01',
      relevanceScore: 0.99,
    });

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'FAILED',
        content: '',
        isGrounded: false,
        sources: [spuriousCitation], // Pipeline errored out but attached spurious citations
        metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 50 },
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: 'Generation timed out.',
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.turnStatus).toBe(TurnStatus.FAILED);
    expect(result.sources).toHaveLength(0); // Safely stripped!

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    expect(dbMsg?.status).toBe('FAILED');
    expect(dbMsg?.isCanonical).toBe(false);
    expect(dbMsg?.sources).toBeNull(); // Never stored for failed attempt!
  });

  it('9. enforces cross-tenant source isolation when executionConfig.documentIds restricts access', async () => {
    const convId = 'test-conv-attr-9';
    const turnId = 'test-conv-attr-turn-9';
    const userMsgId = 'test-conv-attr-u9';
    const asstMsgId = 'test-conv-attr-a9';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    const citations = [
      RAGSourceCitation.create({
        documentId: 'doc_tenant_a_authorized',
        documentTitle: 'Authorized Tenant A Protocol',
        chunkId: 'chk_auth_01',
        relevanceScore: 0.92,
      }),
      RAGSourceCitation.create({
        documentId: 'doc_tenant_b_foreign',
        documentTitle: 'Leaked Cross-Tenant Document',
        chunkId: 'chk_leak_01',
        relevanceScore: 0.98,
      }),
    ];

    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Cross-tenant boundary test.',
        isGrounded: true,
        sources: citations,
        metadata: { model: 'gpt-4o', retrievalCount: 2, latencyMs: 200 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      executionConfig: {
        documentIds: ['doc_tenant_a_authorized'], // Only Tenant A document allowed
      },
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.documentId).toBe('doc_tenant_a_authorized');

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    const persisted = dbMsg?.sources as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.['documentId']).toBe('doc_tenant_a_authorized');
  });

  it('10. strips unsafe internal fields before serialization and API exposure', async () => {
    const rawDangerousSource = {
      documentId: 'doc_safe_01',
      documentTitle: 'Safe Clinical Guide',
      chunkId: 'chk_safe_01',
      pageNumber: 3,
      relevanceScore: 0.91,
      sourceStrategy: 'HYBRID',
      storagePath: 's3://internal-credentials-bucket/path.pdf',
      filePath: 'C:\\Projects\\kinergy\\secret.txt',
      embedding: [0.12, 0.34, -0.56],
      token: 'jwt_admin_token',
      databaseUrl: 'postgres://root:secret@db/prod',
    };

    const sanitized = AiSourceAttributionService.validateAndSanitize([rawDangerousSource]);
    const persisted = AiSourceAttributionService.serializeForPersistence(sanitized);

    expect(persisted).toHaveLength(1);
    const item = persisted[0]!;
    expect(item['documentId']).toBe('doc_safe_01');
    expect(item['storagePath']).toBeUndefined();
    expect(item['filePath']).toBeUndefined();
    expect(item['embedding']).toBeUndefined();
    expect(item['token']).toBeUndefined();
    expect(item['databaseUrl']).toBeUndefined();

    // Map through API Response Mapper
    const apiResponse = AiConversationResponseMapper.toMessageHistoryResponse({
      messages: [
        {
          id: 'msg_01',
          turnId: 'turn_01',
          role: 'ASSISTANT' as const,
          sequenceNumber: 2,
          attemptNumber: 1,
          isCanonical: true,
          status: 'SUCCESS' as const,
          content: 'Answer content',
          sources: persisted,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const msg = apiResponse.messages[0]!;
    expect(msg.sources).toHaveLength(1);
    const apiSource = msg.sources![0]! as unknown as Record<string, unknown>;
    expect(apiSource['documentId']).toBe('doc_safe_01');
    expect(apiSource['storagePath']).toBeUndefined();
    expect(apiSource['embedding']).toBeUndefined();
  });

  it('11. does not promote hallucinated or textual citations in prose to structured citations', async () => {
    const convId = 'test-conv-attr-11';
    const turnId = 'test-conv-attr-turn-11';
    const userMsgId = 'test-conv-attr-u11';
    const asstMsgId = 'test-conv-attr-a11';

    await seedTurnInDb({ convId, turnId, turnIndex: 1, userMsgId, asstMsgId });

    // LLM generated prose claims [Document 99: Fake Study], but retrieval returned zero sources
    const mockPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'De acuerdo con el estudio [Document 99: Fake Study], se recomienda reposo.',
        isGrounded: false,
        sources: [], // Structured evidence pool has 0 items!
        metadata: { model: 'gpt-4o', retrievalCount: 0, latencyMs: 120 },
      }),
    };

    const useCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockPipeline,
      historyLoader,
      txRunner,
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      userId: USER_ID,
      conversationId: convId,
      turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    // Provenance must remain empty because model hallucination is never accepted as provenance
    expect(result.sources).toHaveLength(0);

    const dbMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: asstMsgId },
    });
    // In PostgreSQL, absence of citations is safely stored as null
    expect(dbMsg?.sources).toBeNull();
  });

  it('12. preserves backward compatibility of existing response DTOs', async () => {
    const rawSources = [
      {
        documentId: 'doc_compat_01',
        documentTitle: 'Compat Title',
        chunkId: 'chk_compat_01',
        relevanceScore: 0.85,
      },
    ];

    const historyResult = {
      messages: [
        {
          id: 'msg_compat_01',
          turnId: 'turn_compat_01',
          role: 'ASSISTANT' as const,
          sequenceNumber: 2,
          attemptNumber: 1,
          isCanonical: true,
          status: 'SUCCESS' as const,
          content: 'Compatibility verification message',
          sources: rawSources,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    const mapped = AiConversationResponseMapper.toMessageHistoryResponse(historyResult);

    expect(mapped).toBeDefined();
    expect(mapped.messages).toHaveLength(1);
    const msg = mapped.messages[0]!;
    expect(msg.sources).not.toBeNull();
    expect(msg.sources).toHaveLength(1);
    expect(msg.sources![0]!.documentId).toBe('doc_compat_01');
    expect(msg.sources![0]!.chunkId).toBe('chk_compat_01');
    expect(msg.sources![0]!.relevanceScore).toBe(0.85);
  });
});
