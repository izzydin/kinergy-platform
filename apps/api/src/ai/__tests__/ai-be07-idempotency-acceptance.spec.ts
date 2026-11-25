import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  CancelConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  PrivilegedInspectConversationUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  DuplicateClientTurnPayloadMismatchError,
  InvalidTurnInputError,
  PersistenceConflictError,
  AiPayloadHasher,
  TurnStatus,
  GenerationStatus,
  IAiTurnDispatcherPort,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { AiTurnDispatcherService } from '../services/generation/ai-turn-dispatcher.service';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';
import {
  CreateConversationRequestDto,
  ReserveTurnRequestDto,
} from '../conversation/dtos/ai-conversation.dtos';

/**
 * AI-09.3-BE.07.04 — Turn Idempotency & Duplicate-Request Acceptance
 *
 * Verifies against real PostgreSQL:
 * 1. Initial Conversation Idempotency (replay, mismatch rejection, prompt content isolation)
 * 2. Subsequent Turn Idempotency across Lifecycle States (PENDING, STREAMING, COMPLETED, CANCELLED)
 * 3. Canonical Payload Hashing (whitespace normalization, CRLF normalization, metadata sorting, unicode)
 * 4. Duplicate Dispatch & Execution Suppression (in-flight deduplication, completed turn skip)
 * 5. Response Consistency & DTO Information Hiding (no leak of internal hashes or lease tokens)
 * 6. Failure Recovery & Response Loss Simulation (client timeout retry, recovery without duplicate rows)
 */
describe('AI-09.3-BE.07.04: Turn Idempotency & Duplicate-Request Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase: ReserveConversationTurnUseCase;
  let executeUseCase: ExecuteConversationTurnUseCase;
  let cancelUseCase: CancelConversationTurnUseCase;
  let getConvUseCase: GetConversationUseCase;
  let listConvUseCase: ListConversationsUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let updateTitleUseCase: UpdateConversationTitleUseCase;
  let archiveConvUseCase: ArchiveConversationUseCase;
  let inspectUseCase: PrivilegedInspectConversationUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let persistUseCase: PersistMessageStateUseCase;
  let dispatcher: AiTurnDispatcherService;
  let controller: AiConversationController;

  const TENANT_ID = 'tenant_idemp_test';
  const USER_ID = 'usr_idemp_physio_01';

  const PRINCIPAL_USER: TrustedAiContext = {
    actorId: USER_ID,
    tenantId: TENANT_ID,
    roles: ['Trainer'],
    permissions: [],
    email: 'physio@idemp.com',
  };

  const mockDispatcher: IAiTurnDispatcherPort = {
    dispatchTurn: jest.fn().mockResolvedValue({
      turnId: 'mock-idemp-turn',
      dispatched: true,
      status: 'DISPATCHED',
    }),
    cancelTurn: jest.fn().mockResolvedValue(true),
    isTurnActive: jest.fn().mockReturnValue(false),
  };

  let ragExecutionCount = 0;
  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(async (cmd: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
        ragExecutionCount++;
        return {
          outcome: 'SUCCESS',
          content: `Canonical answer for turn prompt: ${cmd.userPrompt}`,
          isGrounded: true,
          sources: [
            {
              documentId: 'doc_idemp_verified',
              documentTitle: 'Guía Clínica de Idempotencia',
              chunkId: 'chk_idemp_01',
              relevanceScore: 0.98,
              pageNumber: 1,
              headingPath: ['Idempotency', 'Replay Safety'],
            },
          ],
          metadata: {
            model: 'test-model',
            retrievalCount: 1,
            latencyMs: 30,
            totalTokens: 120,
          },
        };
      }),
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
    executeUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );
    reserveUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );
    cancelUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      mockDispatcher,
    );
    getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
    listConvUseCase = new ListConversationsUseCase(convRepo);
    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    updateTitleUseCase = new UpdateConversationTitleUseCase(convRepo);
    archiveConvUseCase = new ArchiveConversationUseCase(convRepo, turnRepo);
    inspectUseCase = new PrivilegedInspectConversationUseCase(convRepo, messageRepo, auditRepo);

    controller = new AiConversationController(
      createUseCase,
      reserveUseCase,
      getConvUseCase,
      listConvUseCase,
      getHistoryUseCase,
      updateTitleUseCase,
      archiveConvUseCase,
      inspectUseCase,
      cancelUseCase,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    ragExecutionCount = 0;
    jest.clearAllMocks();
    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
  });

  // =========================================================================
  // TASK 1: Initial Conversation Idempotency
  // =========================================================================
  describe('Task 1: Initial Conversation Idempotency', () => {
    it('recovers the existing logical conversation and turn when identical initial request is retried', async () => {
      const clientTurnId = 'turn_init_retry_01';
      const prompt = 'Plan de carga excéntrica para rodilla';

      // 1. Initial submission
      const firstResult = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId,
        userPrompt: prompt,
        title: 'Tendinopatía Rotuliana',
      });

      expect(firstResult.isIdempotentReplay).toBe(false);
      expect(firstResult.idempotencyOutcome).toBe('CREATED');
      expect(firstResult.turnIndex).toBe(1);

      // 2. Client retries with exact same clientTurnId and payload
      const retryResult = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId,
        userPrompt: prompt,
        title: 'Tendinopatía Rotuliana',
      });

      expect(retryResult.isIdempotentReplay).toBe(true);
      expect(retryResult.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(retryResult.conversationId).toBe(firstResult.conversationId);
      expect(retryResult.turnId).toBe(firstResult.turnId);
      expect(retryResult.userMessageId).toBe(firstResult.userMessageId);
      expect(retryResult.assistantAttemptId).toBe(firstResult.assistantAttemptId);

      // 3. PostgreSQL Database Assertions: Exactly 1 conversation, 1 turn, 2 messages
      const convCount = await prisma.aiConversation.count({
        where: { tenantId: TENANT_ID },
      });
      expect(convCount).toBe(1);

      const turnCount = await prisma.aiConversationTurn.count({
        where: { tenantId: TENANT_ID },
      });
      expect(turnCount).toBe(1);

      const msgCount = await prisma.aiConversationMessage.count({
        where: { tenantId: TENANT_ID },
      });
      expect(msgCount).toBe(2);
    });

    it('rejects initial turn retry with the same clientTurnId but a conflicting prompt with 409 Conflict', async () => {
      const clientTurnId = 'turn_init_conflict_01';

      // 1. First submission
      await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId,
        userPrompt: 'Prompt original para evaluación',
      });

      // 2. Retry with modified prompt text
      await expect(
        createUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId,
          userPrompt: 'Prompt completamente diferente con la misma clave',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });

    it('does NOT deduplicate across different clientTurnIds even when prompt text is identical (preserves user intent)', async () => {
      const prompt = '¿Cuáles son los criterios de alta deportiva tras LCA?';

      // Two distinct client requests submitting the same query under different client turn IDs
      const conv1 = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_client_session_A',
        userPrompt: prompt,
      });

      const conv2 = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_client_session_B',
        userPrompt: prompt,
      });

      expect(conv1.conversationId).not.toBe(conv2.conversationId);
      expect(conv1.turnId).not.toBe(conv2.turnId);
      expect(conv1.isIdempotentReplay).toBe(false);
      expect(conv2.isIdempotentReplay).toBe(false);

      const totalConvs = await prisma.aiConversation.count({
        where: { tenantId: TENANT_ID },
      });
      expect(totalConvs).toBe(2);
    });
  });

  // =========================================================================
  // TASK 2: Subsequent Turn Idempotency Across Lifecycle States
  // =========================================================================
  describe('Task 2: Subsequent Turn Idempotency Across Lifecycle States', () => {
    it('recovers existing subsequent turn when identical request is retried in PENDING status', async () => {
      // Create conversation with turn 1 completed
      const init = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_subseq_init',
        userPrompt: 'Turn 1 base',
      });
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Reserve turn 2
      const turn2First = await reserveUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        clientTurnId: 'turn_subseq_turn2_key',
        userPrompt: 'Continuación clínica para turno 2',
      });
      expect(turn2First.isIdempotentReplay).toBe(false);

      // Retry turn 2 while still PENDING
      const turn2Retry = await reserveUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        clientTurnId: 'turn_subseq_turn2_key',
        userPrompt: 'Continuación clínica para turno 2',
      });

      expect(turn2Retry.isIdempotentReplay).toBe(true);
      expect(turn2Retry.turnId).toBe(turn2First.turnId);
      expect(turn2Retry.turnIndex).toBe(2);
      expect(turn2Retry.turnStatus).toBe(TurnStatus.PENDING);
    });

    it('recovers existing subsequent turn when retried after turn has COMPLETED', async () => {
      const init = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_completed_init',
        userPrompt: 'Pregunta base',
      });

      // Complete turn
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Client retries initial turn reservation after completion
      const replay = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_completed_init',
        userPrompt: 'Pregunta base',
      });

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.turnStatus).toBe(TurnStatus.COMPLETED);
      expect(replay.turnId).toBe(init.turnId);
    });

    it('recovers existing subsequent turn when retried after turn was CANCELLED', async () => {
      const init = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_cancelled_init',
        userPrompt: 'Pregunta que será cancelada',
      });

      // Cancel turn
      await cancelUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
      });

      // Client retries reservation
      const replay = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_cancelled_init',
        userPrompt: 'Pregunta que será cancelada',
      });

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(replay.turnId).toBe(init.turnId);
    });

    it('rejects subsequent turn retry with the same clientTurnId on a DIFFERENT conversation with PersistenceConflictError', async () => {
      // Conv A
      const convA = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_conv_A_shared_key',
        userPrompt: 'Pregunta para Conv A',
      });
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: convA.conversationId,
        turnId: convA.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Conv B
      const convB = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_conv_B_init',
        userPrompt: 'Pregunta para Conv B',
      });
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: convB.conversationId,
        turnId: convB.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Client attempts to use Conv A's clientTurnId on Conv B!
      await expect(
        reserveUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: convB.conversationId,
          clientTurnId: 'turn_conv_A_shared_key', // Belongs to Conv A!
          userPrompt: 'Pregunta para Conv A',
        }),
      ).rejects.toThrow(PersistenceConflictError);
    });
  });

  // =========================================================================
  // TASK 3: Canonical Payload Hashing Behavior
  // =========================================================================
  describe('Task 3: Canonical Payload Hashing Behavior', () => {
    it('normalizes CRLF newlines and leading/trailing whitespace into identical payload hash', () => {
      const hash1 = AiPayloadHasher.hash({ prompt: 'Test query' });
      const hash2 = AiPayloadHasher.hash({ prompt: '  Test query  ' });
      const hash3 = AiPayloadHasher.hash({ prompt: 'Test query\r\n' });
      const hash4 = AiPayloadHasher.hash({ prompt: '\r\n  Test query  \r\n' });

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      expect(hash3).toBe(hash4);
    });

    it('differentiates internal whitespace differences in prompt content', () => {
      const hash1 = AiPayloadHasher.hash({ prompt: 'Hello world' });
      const hash2 = AiPayloadHasher.hash({ prompt: 'Hello  world' });
      const hash3 = AiPayloadHasher.hash({ prompt: 'Hello\nworld' });

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('canonicalizes metadata key ordering at all recursive levels', () => {
      const hashA = AiPayloadHasher.hash({
        prompt: 'Query with metadata',
        metadata: {
          z_index: 10,
          a_protocol: 'standard',
          nested: { y: 'last', x: 'first' },
        },
      });

      const hashB = AiPayloadHasher.hash({
        prompt: 'Query with metadata',
        metadata: {
          nested: { x: 'first', y: 'last' },
          a_protocol: 'standard',
          z_index: 10,
        },
      });

      expect(hashA).toBe(hashB);
    });

    it('computes distinct hashes when metadata values change', () => {
      const hashA = AiPayloadHasher.hash({
        prompt: 'Query with metadata',
        metadata: { mode: 'fast' },
      });

      const hashB = AiPayloadHasher.hash({
        prompt: 'Query with metadata',
        metadata: { mode: 'deep' },
      });

      expect(hashA).not.toBe(hashB);
    });

    it('rejects empty or whitespace-only prompts with InvalidTurnInputError', async () => {
      await expect(
        createUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: 'turn_empty_prompt',
          userPrompt: '    ',
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('hashes unicode characters deterministically across runs', () => {
      const unicodePrompt = 'Protocolo de rehabilitación: rodilla izquierda 🦵 y tobillo 🦶';
      const hash1 = AiPayloadHasher.hash({ prompt: unicodePrompt });
      const hash2 = AiPayloadHasher.hash({ prompt: unicodePrompt });

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  // =========================================================================
  // TASK 4: Duplicate Dispatch and Worker Execution
  // =========================================================================
  describe('Task 4: Duplicate Dispatch & Execution Suppression', () => {
    it('suppresses duplicate in-flight dispatch delivery via AiTurnDispatcherService (returns ALREADY_ACTIVE)', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_dup_dispatch_01',
        userPrompt: 'Query to test duplicate dispatch',
      });

      // Dispatch 1
      const res1 = await dispatcher.dispatchTurn({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        attemptId: created.assistantAttemptId,
        attemptNumber: 1,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Dispatch 2 while Dispatch 1 is in-flight
      const res2 = await dispatcher.dispatchTurn({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        attemptId: created.assistantAttemptId,
        attemptNumber: 1,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Dispatch 1 was dispatched or already active
      expect(['DISPATCHED', 'ALREADY_ACTIVE']).toContain(res1.status);
      // Dispatch 2 MUST be recognized as already active
      expect(res2.status).toBe('ALREADY_ACTIVE');
      expect(res2.dispatched).toBe(false);
    });

    it('skips dispatch delivery when turn is already COMPLETED (returns ALREADY_COMPLETED)', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_completed_dispatch',
        userPrompt: 'Query completed first',
      });

      // Complete the turn
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Attempt dispatch of completed turn
      const dispatchResult = await dispatcher.dispatchTurn({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        attemptId: created.assistantAttemptId,
        attemptNumber: 1,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(dispatchResult.status).toBe('ALREADY_COMPLETED');
      expect(dispatchResult.dispatched).toBe(false);
    });

    it('returns canonical answer via fast-path without re-invoking RAG pipeline when ExecuteConversationTurnUseCase is called repeatedly on a completed turn', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_fast_path_exec',
        userPrompt: 'Query for fast path test',
      });

      // Execution 1: Calls RAG pipeline
      const exec1 = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(exec1.outcome).toBe('SUCCESS');
      expect(ragExecutionCount).toBe(1);

      // Execution 2: Fast-path return
      const exec2 = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(exec2.outcome).toBe('SUCCESS');
      expect(exec2.content).toBe(exec1.content);
      // RAG pipeline was NOT invoked a second time!
      expect(ragExecutionCount).toBe(1);
    });
  });

  // =========================================================================
  // TASK 5: Response Consistency & Information Hiding
  // =========================================================================
  describe('Task 5: Response Consistency & Information Hiding', () => {
    it('verifies that API responses strictly omit internal hashes, lease tokens, and DB transaction metadata', async () => {
      const reqDto: CreateConversationRequestDto = {
        clientTurnId: 'turn_info_hiding_01',
        userPrompt: 'Consulta médica para verificar ocultación de datos internos',
        title: 'Verificación de DTOs',
      };

      const apiResponse = await controller.createConversation(PRINCIPAL_USER, reqDto);

      // Verify exposed public fields
      expect(apiResponse.conversationId).toBeDefined();
      expect(apiResponse.turnId).toBeDefined();
      expect(apiResponse.userMessageId).toBeDefined();
      expect(apiResponse.assistantAttemptId).toBeDefined();
      expect(apiResponse.turnStatus).toBe('PENDING');
      expect(apiResponse.isIdempotentReplay).toBe(false);

      // Verify strict omission of internal secrets
      const rawResponse = apiResponse as unknown as Record<string, unknown>;
      expect(rawResponse).not.toHaveProperty('idempotencyPayloadHash');
      expect(rawResponse).not.toHaveProperty('leaseToken');
      expect(rawResponse).not.toHaveProperty('leaseOwnerInstanceId');
      expect(rawResponse).not.toHaveProperty('txId');
      expect(rawResponse).not.toHaveProperty('prismaId');
    });

    it('preserves response consistency when retrying turn reservation via controller', async () => {
      const init = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_ctrl_init',
        userPrompt: 'Turn 1 prompt',
      });
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      const reserveDto: ReserveTurnRequestDto = {
        clientTurnId: 'turn_ctrl_subseq_key',
        userPrompt: 'Prompt subsecuente para controlador',
      };

      const resp1 = await controller.reserveTurn(PRINCIPAL_USER, init.conversationId, reserveDto);
      expect(resp1.isIdempotentReplay).toBe(false);

      const resp2 = await controller.reserveTurn(PRINCIPAL_USER, init.conversationId, reserveDto);
      expect(resp2.isIdempotentReplay).toBe(true);
      expect(resp2.turnId).toBe(resp1.turnId);
      expect(resp2.userMessageId).toBe(resp1.userMessageId);
      expect(resp2.assistantAttemptId).toBe(resp1.assistantAttemptId);
    });
  });

  // =========================================================================
  // TASK 6: Failure Boundaries & Response Loss Simulation
  // =========================================================================
  describe('Task 6: Failure Boundaries & Response Loss Simulation', () => {
    it('recovers committed conversation when client disconnects or times out after database commit', async () => {
      const stableClientTurnId = 'turn_client_disconnect_timeout_01';
      const prompt = 'Plan de readaptación funcional tras lesión meniscal';

      // 1. Initial attempt commits to PostgreSQL
      const serverCommittedResult = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: stableClientTurnId,
        userPrompt: prompt,
      });

      // Simulate client experiencing a timeout / network disconnect before receiving server response.
      // 2. Client retries with the same clientTurnId
      const clientRetryResult = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: stableClientTurnId,
        userPrompt: prompt,
      });

      // Invariant: The retry seamlessly recovers the committed conversation and turn
      expect(clientRetryResult.isIdempotentReplay).toBe(true);
      expect(clientRetryResult.conversationId).toBe(serverCommittedResult.conversationId);
      expect(clientRetryResult.turnId).toBe(serverCommittedResult.turnId);
      expect(clientRetryResult.userMessageId).toBe(serverCommittedResult.userMessageId);

      // Invariant: Database maintains exactly 1 conversation aggregate
      const convs = await prisma.aiConversation.findMany({
        where: { tenantId: TENANT_ID },
      });
      expect(convs).toHaveLength(1);
    });

    it('recovers completed canonical answer when client retries after worker finalization commits', async () => {
      const stableClientTurnId = 'turn_finalized_retry_01';
      const prompt = 'Protocolo de retorno al deporte post-esguince';

      // 1. Initial submission
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: stableClientTurnId,
        userPrompt: prompt,
      });

      // 2. Worker executes and finalizes answer
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 3. Client retries initial reservation (e.g., page refresh or retry button)
      const retryResult = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: stableClientTurnId,
        userPrompt: prompt,
      });

      expect(retryResult.isIdempotentReplay).toBe(true);
      expect(retryResult.turnStatus).toBe(TurnStatus.COMPLETED);

      // Verify canonical history has exactly 2 messages
      const history = await getHistoryUseCase.execute({
        tenantId: TENANT_ID,
        conversationId: created.conversationId,
      });
      expect(history.messages).toHaveLength(2);
      expect(history.messages[1]?.isCanonical).toBe(true);
      expect(history.messages[1]?.status).toBe(GenerationStatus.SUCCESS);
    });
  });
});
