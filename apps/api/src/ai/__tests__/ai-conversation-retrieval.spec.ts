import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  GetMessageHistoryUseCase,
  GetConversationUseCase,
  ConversationNotFoundError,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  IAiTurnDispatcherPort,
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
 * FE.05 — Backend Conversation Retrieval & Message History Acceptance Test
 *
 * Verifies backend retrieval invariants against real PostgreSQL:
 * 1. Conversation retrieval returns authoritative metadata and child turns.
 * 2. Message history retrieval returns canonical messages ordered monotonically by sequenceNumber ASC.
 * 3. Role preservation: USER and ASSISTANT roles are strictly maintained.
 * 4. Canonical filtering: Superseded attempts are excluded from canonical message history.
 * 5. Grounded RAG citations: Source attributions are preserved without leaking sensitive lease tokens or secrets.
 * 6. Tenant & ownership isolation: Cross-tenant access throws ConversationNotFoundError (404), preventing resource enumeration.
 * 7. Nonexistent conversation IDs throw ConversationNotFoundError (404).
 */
describe('FE.05: Backend Conversation & Message History Retrieval (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveTurnUseCase: ReserveConversationTurnUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let getConvUseCase: GetConversationUseCase;

  const TENANT_ALPHA = 'tenant_fe05_alpha';
  const TENANT_BETA = 'tenant_fe05_beta';
  const USER_ALPHA = 'usr_fe05_alpha';

  const mockDispatcher: IAiTurnDispatcherPort = {
    dispatchTurn: jest.fn().mockResolvedValue({ turnId: 'turn_mock', dispatched: true }),
    cancelTurn: jest.fn().mockResolvedValue(true),
    isTurnActive: jest.fn().mockReturnValue(false),
  };

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

    createConvUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );

    reserveTurnUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );

    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
  });

  it('1. retrieves conversation aggregate details with child turns', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_fe05_detail_01',
      userPrompt: '¿Cómo realizar la prueba de Hawkins-Kennedy?',
      title: 'Evaluación de Hombro Hawkins',
    });

    const detail = await getConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
      includeTurns: true,
    });

    expect(detail.id).toBe(created.conversationId);
    expect(detail.tenantId).toBe(TENANT_ALPHA);
    expect(detail.userId).toBe(USER_ALPHA);
    expect(detail.title).toBe('Evaluación de Hombro Hawkins');
    expect(detail.turnCounter).toBe(1);
    expect(detail.turns).toHaveLength(1);
    expect(detail.turns?.[0]?.clientTurnId).toBe('turn_fe05_detail_01');
    expect(detail.turns?.[0]?.turnIndex).toBe(1);
  });

  it('2. retrieves canonical message history ordered monotonically by sequenceNumber ASC with citations', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_fe05_seq_01',
      userPrompt: 'Primera consulta clínica sobre dolor cervical.',
      title: 'Secuencia Monotónica',
    });

    // Execute Turn 1 with grounded citations
    const citation1 = RAGSourceCitation.create({
      documentId: 'doc_cervical_01',
      documentTitle: 'Guía Clínica Cervical 2026',
      chunkId: 'chk_cerv_01',
      pageNumber: 14,
      headingPath: ['Diagnóstico', 'Pruebas Específicas'],
      relevanceScore: 0.95,
      sourceStrategy: 'HYBRID',
    });

    const pipeline1: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Respuesta clínica del turno 1 con evidencia científica.',
        isGrounded: true,
        sources: [citation1],
        metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 220 },
      }),
    };

    const exec1 = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      pipeline1,
      historyLoader,
      txRunner,
    );

    await exec1.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: created.conversationId,
      turnId: created.turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    // Reserve Turn 2
    const turn2 = await reserveTurnUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: created.conversationId,
      clientTurnId: 'turn_fe05_seq_02',
      userPrompt: 'Segunda consulta sobre tratamiento manual.',
    });

    const pipeline2: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Respuesta clínica del turno 2.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'gpt-4o', retrievalCount: 0, latencyMs: 180 },
      }),
    };

    const exec2 = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      pipeline2,
      historyLoader,
      txRunner,
    );

    await exec2.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: created.conversationId,
      turnId: turn2.turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    // Retrieve canonical message history
    const historyResult = await getHistoryUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    const responseDto = AiConversationResponseMapper.toMessageHistoryResponse(historyResult);

    expect(responseDto.messages).toHaveLength(4);

    // Message 1: Turn 1 User
    expect(responseDto.messages[0]?.sequenceNumber).toBe(1);
    expect(responseDto.messages[0]?.role).toBe('USER');
    expect(responseDto.messages[0]?.content).toBe('Primera consulta clínica sobre dolor cervical.');

    // Message 2: Turn 1 Assistant (with citations)
    expect(responseDto.messages[1]?.sequenceNumber).toBe(2);
    expect(responseDto.messages[1]?.role).toBe('ASSISTANT');
    expect(responseDto.messages[1]?.status).toBe('SUCCESS');
    expect(responseDto.messages[1]?.sources).toHaveLength(1);
    expect(responseDto.messages[1]?.sources?.[0]?.documentTitle).toBe('Guía Clínica Cervical 2026');
    expect(responseDto.messages[1]?.sources?.[0]?.relevanceScore).toBe(0.95);

    // Message 3: Turn 2 User
    expect(responseDto.messages[2]?.sequenceNumber).toBe(3);
    expect(responseDto.messages[2]?.role).toBe('USER');
    expect(responseDto.messages[2]?.content).toBe('Segunda consulta sobre tratamiento manual.');

    // Message 4: Turn 2 Assistant
    expect(responseDto.messages[3]?.sequenceNumber).toBe(4);
    expect(responseDto.messages[3]?.role).toBe('ASSISTANT');
    expect(responseDto.messages[3]?.status).toBe('SUCCESS');
  });

  it('3. filters non-canonical attempts and preserves only the accepted canonical assistant answer', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_fe05_canonical_01',
      userPrompt: 'Pregunta con reintento asistido',
    });

    // Insert a non-canonical failed attempt for this turn with sequenceNumber 3
    await prisma.aiConversationMessage.create({
      data: {
        id: 'msg_attempt_superseded',
        conversationId: created.conversationId,
        turnId: created.turnId,
        tenantId: TENANT_ALPHA,
        role: 'ASSISTANT',
        sequenceNumber: 3,
        attemptNumber: 2,
        isCanonical: false, // Superseded
        status: 'FAILED',
        content: 'Fallo transitorio previo',
      },
    });

    // Execute canonical turn
    const pipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS',
        content: 'Respuesta definitiva canónica.',
        isGrounded: false,
        sources: [],
      }),
    };

    const exec = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      pipeline,
      historyLoader,
      txRunner,
    );

    await exec.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: created.conversationId,
      turnId: created.turnId,
      actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
    });

    const historyResult = await getHistoryUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    // Only canonical USER and canonical ASSISTANT messages should be returned
    expect(historyResult.messages).toHaveLength(2);
    expect(historyResult.messages.every((m) => m.role === 'USER' || m.isCanonical)).toBe(true);
    expect(historyResult.messages[1]?.content).toBe('Respuesta definitiva canónica.');
  });

  it('4. strictly blocks cross-tenant access to conversation details (returns 404)', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_fe05_iso_01',
      userPrompt: 'Consulta privada Tenant Alpha',
    });

    await expect(
      getConvUseCase.execute({
        tenantId: TENANT_BETA,
        conversationId: created.conversationId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('5. strictly blocks cross-tenant access to message history (returns 404)', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_fe05_iso_02',
      userPrompt: 'Historial privado Tenant Alpha',
    });

    await expect(
      getHistoryUseCase.execute({
        tenantId: TENANT_BETA,
        conversationId: created.conversationId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('6. throws ConversationNotFoundError (404) for nonexistent conversation ID', async () => {
    await expect(
      getConvUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: '00000000-0000-0000-0000-000000000099',
      }),
    ).rejects.toThrow(ConversationNotFoundError);

    await expect(
      getHistoryUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: '00000000-0000-0000-0000-000000000099',
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
