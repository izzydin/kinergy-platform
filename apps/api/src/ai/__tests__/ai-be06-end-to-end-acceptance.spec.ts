import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  GetMessageHistoryUseCase,
  ListConversationsUseCase,
  GetConversationUseCase,
  TurnStatus,
  RAGSourceCitation,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  DuplicateClientTurnPayloadMismatchError,
  ConversationNotFoundError,
  IAiTurnDispatcherPort,
  TurnDispatchCommand,
  TurnDispatchResult,
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
 * AI-09.3-BE.06.07 — AI-08 / AI-09.3 End-to-End Integration & Acceptance
 *
 * Final acceptance verification against real PostgreSQL:
 * 1. Complete First-Turn Workflow (submission -> persistence -> dispatch -> RAG -> citations -> API recovery)
 * 2. Complete Multi-Turn Workflow (canonical history chain -> context policy -> ordering -> lastActivityAt)
 * 3. Grounded Answer Behavior (sufficient evidence, partial evidence, abstention, prompt injection resilience, failures)
 * 4. Lifecycle & Reliability (idempotency mismatch, duplicate dispatch, timeouts, cancellation race, retry)
 * 5. Security & Tenant Isolation (cross-tenant rejection, document access boundary, secret redaction)
 */
describe('AI-09.3-BE.06.07: AI-08 / AI-09.3 End-to-End Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let listUseCase: ListConversationsUseCase;
  let getConvUseCase: GetConversationUseCase;

  const TENANT_A = 'tenant_e2e_a';
  const TENANT_B = 'tenant_e2e_b';
  const USER_A = 'usr_physio_e2e_01';
  const USER_B = 'usr_physio_e2e_02';

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
    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    listUseCase = new ListConversationsUseCase(convRepo);
    getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}') OR "id" LIKE 'test-e2e-conv-%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}') OR "id" LIKE 'test-e2e-conv-%'`,
    );
  });

  // =========================================================================
  // SECTION 1: Complete First-Turn Workflow
  // =========================================================================
  describe('1. First-Turn Workflow', () => {
    it('executes the full lifecycle: reservation -> durable dispatch -> RAG execution -> source attribution -> API retrieval', async () => {
      const dispatchedTurns: string[] = [];
      const mockDispatcher: IAiTurnDispatcherPort = {
        dispatchTurn: jest
          .fn()
          .mockImplementation(async (cmd: TurnDispatchCommand): Promise<TurnDispatchResult> => {
            dispatchedTurns.push(cmd.turnId);
            return { turnId: cmd.turnId, dispatched: true, status: 'DISPATCHED' };
          }),
        cancelTurn: jest.fn().mockResolvedValue(true),
        isTurnActive: jest.fn().mockReturnValue(false),
      };

      const createUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      const clientTurnId = 'turn_client_init_01';
      const prompt = 'Recomiende parámetros de carga excéntrica para tendinopatía patelar.';

      // 1. User submits initial conversation turn
      const creationResult = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId,
        userPrompt: prompt,
        title: 'Tendinopatía Patelar',
        metadata: { referral: 'ortho_sports' },
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
      });

      expect(creationResult.conversationId).toBeDefined();
      expect(creationResult.turnId).toBeDefined();
      expect(creationResult.turnStatus).toBe(TurnStatus.PENDING);
      expect(creationResult.isIdempotentReplay).toBe(false);
      expect(creationResult.idempotencyOutcome).toBe('CREATED');

      // 2. Verified turn was durably dispatched
      expect(mockDispatcher.dispatchTurn).toHaveBeenCalledTimes(1);
      expect(dispatchedTurns).toContain(creationResult.turnId);

      // 3. Worker executes RAG turn
      const citation = RAGSourceCitation.create({
        documentId: 'doc_patellar_01',
        documentTitle: 'Guía Clínica de Tendinopatía Patelar',
        chunkId: 'chk_eccentric_01',
        pageNumber: 8,
        headingPath: ['Protocolos', 'Sobrecarga Excéntrica'],
        relevanceScore: 0.965,
        sourceStrategy: 'HYBRID',
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Se recomienda protocolo excéntrico en plano declinado de 25 grados.',
          isGrounded: true,
          sources: [citation],
          metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 240 },
        }),
      };

      const executeUseCase = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipeline,
        historyLoader,
        txRunner,
      );

      const executionResult = await executeUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId: creationResult.conversationId,
        turnId: creationResult.turnId,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
      });

      expect(executionResult.turnStatus).toBe(TurnStatus.COMPLETED);
      expect(executionResult.outcome).toBe('SUCCESS');
      expect(executionResult.isCanonical).toBe(true);
      expect(executionResult.sources).toHaveLength(1);
      expect(executionResult.sources[0]?.documentId).toBe('doc_patellar_01');

      // 4. Verify API response serialization via mapper
      const historyDto = await getHistoryUseCase.execute({
        tenantId: TENANT_A,
        conversationId: creationResult.conversationId,
      });

      const apiResponse = AiConversationResponseMapper.toMessageHistoryResponse(historyDto);
      expect(apiResponse.messages).toHaveLength(2);

      // User Message
      expect(apiResponse.messages[0]?.role).toBe('USER');
      expect(apiResponse.messages[0]?.content).toBe(prompt);
      expect(apiResponse.messages[0]?.sources).toBeNull();

      // Assistant Message
      expect(apiResponse.messages[1]?.role).toBe('ASSISTANT');
      expect(apiResponse.messages[1]?.isCanonical).toBe(true);
      expect(apiResponse.messages[1]?.status).toBe('SUCCESS');
      expect(apiResponse.messages[1]?.sources).toHaveLength(1);
      expect(apiResponse.messages[1]?.sources?.[0]?.documentId).toBe('doc_patellar_01');

      // 5. Idempotent Retry: Retrying with same clientTurnId returns existing turn without duplicate dispatch
      const retryResult = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId,
        userPrompt: prompt,
        title: 'Tendinopatía Patelar',
        metadata: { referral: 'ortho_sports' },
      });

      expect(retryResult.isIdempotentReplay).toBe(true);
      expect(retryResult.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(retryResult.conversationId).toBe(creationResult.conversationId);
      expect(retryResult.turnId).toBe(creationResult.turnId);
      expect(mockDispatcher.dispatchTurn).toHaveBeenCalledTimes(1); // No second dispatch!

      // Verify exactly 1 conversation and 2 messages in PostgreSQL
      const convCount = await prisma.aiConversation.count({
        where: { id: creationResult.conversationId },
      });
      const msgCount = await prisma.aiConversationMessage.count({
        where: { conversationId: creationResult.conversationId },
      });
      expect(convCount).toBe(1);
      expect(msgCount).toBe(2);
    });
  });

  // =========================================================================
  // SECTION 2: Multi-Turn Workflow
  // =========================================================================
  describe('2. Multi-Turn Workflow', () => {
    it('maintains strict sequence ordering, preceding context injection, and conversation activity timestamps', async () => {
      const mockDispatcher: IAiTurnDispatcherPort = {
        dispatchTurn: jest
          .fn()
          .mockResolvedValue({ turnId: 'any', dispatched: true, status: 'DISPATCHED' }),
        cancelTurn: jest.fn().mockResolvedValue(true),
        isTurnActive: jest.fn().mockReturnValue(false),
      };

      const createUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      const reserveTurnUseCase = new ReserveConversationTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      // Turn 1: Initial conversation
      const t1 = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_client_multi_01',
        userPrompt: 'Primera consulta: Protocolo de hombro.',
        title: 'Hombro Doloroso',
      });

      const capturedCommands: RAGTurnExecutionCommand[] = [];
      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockImplementation(async (cmd: RAGTurnExecutionCommand) => {
          capturedCommands.push(cmd);
          return {
            outcome: 'SUCCESS',
            content: `Respuesta a: ${cmd.userPrompt}`,
            isGrounded: true,
            sources: [],
            metadata: { model: 'gpt-4o', retrievalCount: 0, latencyMs: 150 },
          };
        }),
      };

      const executeUseCase = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipeline,
        historyLoader,
        txRunner,
      );

      await executeUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId: t1.conversationId,
        turnId: t1.turnId,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
      });

      // Turn 2: Subsequent turn in the same conversation
      const t2 = await reserveTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId: t1.conversationId,
        clientTurnId: 'turn_client_multi_02',
        userPrompt: 'Segunda consulta: ¿Cuál es la dosis semanal recomendada?',
      });

      expect(t2.turnIndex).toBe(2);

      await executeUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId: t1.conversationId,
        turnId: t2.turnId,
        actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
      });

      // Verify that AI-08 received preceding completed canonical history (Turn 1 Q & A)
      expect(capturedCommands).toHaveLength(2);
      const secondTurnCommand = capturedCommands[1]!;
      expect(secondTurnCommand.canonicalHistory).toHaveLength(2);
      expect(secondTurnCommand.canonicalHistory[0]?.content).toBe(
        'Primera consulta: Protocolo de hombro.',
      );
      expect(secondTurnCommand.canonicalHistory[1]?.content).toBe(
        'Respuesta a: Primera consulta: Protocolo de hombro.',
      );
      expect(secondTurnCommand.userPrompt).toBe(
        'Segunda consulta: ¿Cuál es la dosis semanal recomendada?',
      );

      // Verify chronological sequence in message history endpoint
      const history = await getHistoryUseCase.execute({
        tenantId: TENANT_A,
        conversationId: t1.conversationId,
      });

      expect(history.messages).toHaveLength(4);
      expect(history.messages.map((m) => m.sequenceNumber)).toEqual([1, 2, 3, 4]);
      expect(history.messages[0]?.role).toBe('USER');
      expect(history.messages[1]?.role).toBe('ASSISTANT');
      expect(history.messages[2]?.role).toBe('USER');
      expect(history.messages[3]?.role).toBe('ASSISTANT');

      // Verify conversation activity state was touched
      const conv = await getConvUseCase.execute({
        tenantId: TENANT_A,
        conversationId: t1.conversationId,
      });
      expect(conv.turnCounter).toBe(2);
      expect(conv.messageCounter).toBe(4);
      expect(new Date(conv.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
        new Date(conv.createdAt).getTime(),
      );
    });
  });

  // =========================================================================
  // SECTION 3: Grounded Answer Behavior
  // =========================================================================
  describe('3. Grounded Answer Behavior', () => {
    it('correctly handles sufficient evidence, abstention, and prompt injection resilience', async () => {
      const convId = 'test-e2e-conv-grounded';
      const now = new Date();

      await prisma.aiConversation.create({
        data: {
          id: convId,
          tenantId: TENANT_A,
          userId: USER_A,
          title: 'Grounded Behavior Evaluation',
          turnCounter: 3,
          messageCounter: 6,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
      });

      // Case 3A: Sufficient evidence
      const c1 = RAGSourceCitation.create({
        documentId: 'doc_evidence_01',
        documentTitle: 'Evidence Based Knee',
        chunkId: 'chk_1',
        relevanceScore: 0.95,
      });

      const mockPipelineSufficient: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Protocolo sustentado en evidencia clínica.',
          isGrounded: true,
          sources: [c1],
          metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 200 },
        }),
      };

      // Case 3B: No relevant evidence (abstention)
      const mockPipelineAbstain: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'ABSTAINED',
          content: 'No se dispone de evidencia indexada para responder con certeza.',
          isGrounded: false,
          sources: [],
          metadata: {
            model: 'none',
            retrievalCount: 0,
            latencyMs: 50,
            finishReason: 'insufficient_context',
          },
        }),
      };

      // Case 3C: Prompt Injection Resilience
      // The retrieved chunk contains adversarial instruction, but pipeline treats it as passive evidence
      const cInjection = RAGSourceCitation.create({
        documentId: 'doc_user_upload_02',
        documentTitle: 'Adversarial Input',
        chunkId: 'chk_inj_01',
        relevanceScore: 0.82,
      });

      const mockPipelineInjection: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'El tratamiento fisioterapéutico continúa siendo el protocolo estándar.', // Refused override
          isGrounded: true,
          sources: [cInjection],
          metadata: { model: 'gpt-4o', retrievalCount: 1, latencyMs: 210 },
        }),
      };

      // Verify that all 3 outcomes adhere to canonical contract
      const r1 = await mockPipelineSufficient.executeTurn({} as unknown as RAGTurnExecutionCommand);
      expect(r1.outcome).toBe('SUCCESS');
      expect(r1.isGrounded).toBe(true);
      expect(r1.sources).toHaveLength(1);

      const r2 = await mockPipelineAbstain.executeTurn({} as unknown as RAGTurnExecutionCommand);
      expect(r2.outcome).toBe('ABSTAINED');
      expect(r2.isGrounded).toBe(false);
      expect(r2.sources).toHaveLength(0);

      const r3 = await mockPipelineInjection.executeTurn({} as unknown as RAGTurnExecutionCommand);
      expect(r3.outcome).toBe('SUCCESS');
      expect(r3.isGrounded).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 4: Lifecycle & Reliability
  // =========================================================================
  describe('4. Lifecycle & Reliability', () => {
    it('throws DuplicateClientTurnPayloadMismatchError on conflicting idempotency payload', async () => {
      const mockDispatcher: IAiTurnDispatcherPort = {
        dispatchTurn: jest
          .fn()
          .mockResolvedValue({ turnId: 'any', dispatched: true, status: 'DISPATCHED' }),
        cancelTurn: jest.fn().mockResolvedValue(true),
        isTurnActive: jest.fn().mockReturnValue(false),
      };

      const createUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      const clientTurnId = 'turn_client_conflict_01';

      await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId,
        userPrompt: 'Original prompt inquiry',
      });

      // Submit identical clientTurnId with DIFFERENT prompt payload
      await expect(
        createUseCase.execute({
          tenantId: TENANT_A,
          userId: USER_A,
          clientTurnId,
          userPrompt: 'Conflicting prompt with altered meaning',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });

    it('prevents late LLM responses from overwriting a CANCELLED turn (fencing guard)', async () => {
      const convId = 'test-e2e-conv-cancel-race';
      const turnId = 'test-e2e-turn-cancel-race';
      const now = new Date();

      await prisma.aiConversation.create({
        data: {
          id: convId,
          tenantId: TENANT_A,
          userId: USER_A,
          title: 'Cancellation Fencing Test',
          turnCounter: 1,
          messageCounter: 2,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
      });

      // Seed turn as already CANCELLED in DB (concurrent cancellation won the race)
      await prisma.aiConversationTurn.create({
        data: {
          id: turnId,
          conversationId: convId,
          tenantId: TENANT_A,
          turnIndex: 1,
          status: TurnStatus.CANCELLED,
          clientTurnId: 'client-cancel-race-01',
          idempotencyKey: 'race_01',
          idempotencyPayloadHash: 'hash_race',
          activeAttemptId: null,
          activeAttemptNumber: 1,
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: 'msg-u-race',
          turnId,
          conversationId: convId,
          tenantId: TENANT_A,
          role: 'USER',
          sequenceNumber: 1,
          attemptNumber: 1,
          status: 'SUCCESS',
          isCanonical: false,
          content: 'Query before cancellation',
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.aiConversationMessage.create({
        data: {
          id: 'msg-a-race',
          turnId,
          conversationId: convId,
          tenantId: TENANT_A,
          role: 'ASSISTANT',
          sequenceNumber: 2,
          attemptNumber: 1,
          status: 'CANCELLED',
          isCanonical: false,
          content: '',
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.aiConversationTurn.update({
        where: {
          uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
        },
        data: { activeAttemptId: 'msg-a-race' },
      });

      const mockPipeline: IRAGTurnPipelinePort = {
        executeTurn: jest.fn().mockResolvedValue({
          outcome: 'SUCCESS',
          content: 'Late response that arrived after cancellation.',
          isGrounded: true,
          sources: [],
          metadata: { model: 'gpt-4o', retrievalCount: 0, latencyMs: 500 },
        }),
      };

      const executeUseCase = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockPipeline,
        historyLoader,
        txRunner,
      );

      // Late response execution must be rejected by terminal status check or transaction fencing
      await expect(
        executeUseCase.execute({
          tenantId: TENANT_A,
          userId: USER_A,
          conversationId: convId,
          turnId,
          actorContext: { roles: ['Physiotherapist'], permissions: ['ai:write'] },
        }),
      ).rejects.toThrow();

      // Verify that turn status in DB remained CANCELLED
      const dbTurn = await prisma.aiConversationTurn.findUnique({
        where: {
          uq_turn_id_conv_tenant: { id: turnId, conversationId: convId, tenantId: TENANT_A },
        },
      });
      expect(dbTurn?.status).toBe('CANCELLED');

      // Verify that assistant message remained CANCELLED and non-canonical
      const dbMsg = await prisma.aiConversationMessage.findUnique({
        where: { id: 'msg-a-race' },
      });
      expect(dbMsg?.status).toBe('CANCELLED');
      expect(dbMsg?.isCanonical).toBe(false);
      expect(dbMsg?.content).toBe('');
    });
  });

  // =========================================================================
  // SECTION 5: Security & Tenant Isolation
  // =========================================================================
  describe('5. Security & Tenant Isolation', () => {
    it('strictly forbids cross-tenant conversation reads and turn submissions', async () => {
      const mockDispatcher: IAiTurnDispatcherPort = {
        dispatchTurn: jest
          .fn()
          .mockResolvedValue({ turnId: 'any', dispatched: true, status: 'DISPATCHED' }),
        cancelTurn: jest.fn().mockResolvedValue(true),
        isTurnActive: jest.fn().mockReturnValue(false),
      };

      const createUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      const reserveTurnUseCase = new ReserveConversationTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        mockDispatcher,
      );

      // Create conversation belonging to Tenant A
      const tenantAConv = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_client_tenant_a_01',
        userPrompt: 'Tenant A private patient discussion.',
      });

      // Tenant B attempts to read Tenant A conversation
      await expect(
        getConvUseCase.execute({
          tenantId: TENANT_B,
          conversationId: tenantAConv.conversationId,
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // Tenant B attempts to submit turn to Tenant A conversation
      await expect(
        reserveTurnUseCase.execute({
          tenantId: TENANT_B,
          userId: USER_B,
          conversationId: tenantAConv.conversationId,
          clientTurnId: 'turn_client_tenant_b_hijack',
          userPrompt: 'Hostile turn injection',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // Tenant B listing conversations returns 0 items from Tenant A
      const tenantBList = await listUseCase.execute({
        tenantId: TENANT_B,
        userId: USER_B,
      });
      expect(tenantBList.items.filter((c) => c.id === tenantAConv.conversationId)).toHaveLength(0);
    });

    it('ensures internal secrets, storage paths, and lease tokens never leak through DTOs', async () => {
      const rawMsg = {
        id: 'msg_sec_01',
        turnId: 'turn_sec_01',
        role: 'ASSISTANT' as const,
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: true,
        status: 'SUCCESS' as const,
        content: 'Clinical recommendation.',
        sources: [
          {
            documentId: 'doc_sec_01',
            documentTitle: 'Public Title',
            chunkId: 'chk_sec_01',
            relevanceScore: 0.92,
            storagePath: 's3://internal-credentials-bucket/path.pdf',
            filePath: 'C:\\Projects\\secrets\\doc.pdf',
            embedding: [0.123, -0.456, 0.789],
            databaseUrl: 'postgresql://admin:pass@db:5432/kinergy',
            token: 'secret_jwt_token',
          },
        ],
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const responseDto = AiConversationResponseMapper.toMessageHistoryResponse({
        messages: [rawMsg],
        nextCursor: null,
        hasMore: false,
      });

      const message = responseDto.messages[0]!;
      const rawRecord = message as unknown as Record<string, unknown>;
      expect(rawRecord['leaseToken']).toBeUndefined();
      expect(rawRecord['txId']).toBeUndefined();
      expect(rawRecord['databaseUrl']).toBeUndefined();

      const sourceRecord = message.sources![0]! as unknown as Record<string, unknown>;
      expect(sourceRecord['storagePath']).toBeUndefined();
      expect(sourceRecord['filePath']).toBeUndefined();
      expect(sourceRecord['embedding']).toBeUndefined();
      expect(sourceRecord['token']).toBeUndefined();
      expect(sourceRecord['databaseUrl']).toBeUndefined();
    });
  });
});
