import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  CancelConversationTurnUseCase,
  PrivilegedInspectConversationUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnStatus,
  GenerationStatus,
  ConversationRole,
  ConversationNotFoundError,
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
import { AiTurnDispatcherService, AiTurnGenerationWorker } from '../services/generation';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';
import {
  CreateConversationRequestDto,
  ReserveTurnRequestDto,
} from '../conversation/dtos/ai-conversation.dtos';

/**
 * AI-09.3-BE.07.07 — Final Security & Integration Acceptance Suite (PostgreSQL)
 *
 * Comprehensive end-to-end acceptance covering:
 * - Workflow A: Initial Conversation Lifecycle & Idempotency
 * - Workflow B: Multi-Turn Conversation, Context Loading & Chronological History
 * - Workflow C: Independent Users, Cross-Tenant Isolation & Privileged Audit
 * - Workflow D: Controlled Worker Interruption, Lease Recovery & Reconnection
 * - Direct Database Invariant Assertions: Partial indexes, uniqueness, and check constraints
 */
describe('AI-09.3-BE.07.07: Final Security & Integration Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase: ReserveConversationTurnUseCase;
  let executeUseCase: ExecuteConversationTurnUseCase;
  let getConvUseCase: GetConversationUseCase;
  let listConvUseCase: ListConversationsUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let inspectUseCase: PrivilegedInspectConversationUseCase;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;

  let dispatcher: AiTurnDispatcherService;
  let worker: AiTurnGenerationWorker;
  let controller: AiConversationController;

  let TENANT_ALPHA: string;
  let TENANT_BETA: string;
  let USER_ALPHA_1: string;
  let USER_ALPHA_2: string;
  let USER_ALPHA_OWNER: string;
  let USER_BETA_1: string;

  let PRINCIPAL_ALPHA_1: TrustedAiContext;
  let PRINCIPAL_ALPHA_2: TrustedAiContext;
  let PRINCIPAL_ALPHA_OWNER: TrustedAiContext;
  let PRINCIPAL_BETA_1: TrustedAiContext;

  let ragExecutionLog: Array<{ prompt: string; historyCount: number }> = [];

  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(
        async (command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
          ragExecutionLog.push({
            prompt: command.userPrompt,
            historyCount: command.canonicalHistory?.length ?? 0,
          });

          return {
            outcome: 'SUCCESS',
            content: `Grounded clinical answer for: ${command.userPrompt}`,
            isGrounded: true,
            sources: [
              {
                documentId: 'doc_final_protocol_01',
                documentTitle: 'Guía Clínica de Readaptación Funcional',
                chunkId: 'chk_final_01',
                relevanceScore: 0.97,
                pageNumber: 2,
                headingPath: ['Rehabilitación', 'Criterios de Progresión'],
              },
            ],
            metadata: {
              model: 'clinical-reasoning-v1',
              retrievalCount: 1,
              latencyMs: 30,
              totalTokens: 125,
            },
          };
        },
      ),
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
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 5000,
      staleThresholdMs: 0,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    reserveUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
    listConvUseCase = new ListConversationsUseCase(convRepo);
    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    inspectUseCase = new PrivilegedInspectConversationUseCase(convRepo, messageRepo, auditRepo);

    controller = new AiConversationController(
      createUseCase,
      reserveUseCase,
      getConvUseCase,
      listConvUseCase,
      getHistoryUseCase,
      null as unknown as UpdateConversationTitleUseCase,
      null as unknown as ArchiveConversationUseCase,
      inspectUseCase,
      null as unknown as CancelConversationTurnUseCase,
    );
  });

  afterAll(async () => {
    if (dispatcher) {
      await dispatcher.abortAndDrainAll('TEARDOWN');
    }
    if (worker) {
      await worker.onApplicationShutdown('TEARDOWN');
    }
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (dispatcher) {
      await dispatcher.abortAndDrainAll('TEARDOWN');
    }
    if (worker) {
      await worker.onApplicationShutdown('TEARDOWN');
    }

    if (prisma && TENANT_ALPHA && TENANT_BETA) {
      await prisma.$executeRaw`
        DELETE FROM "ai_conversations" WHERE "tenant_id" IN (${TENANT_ALPHA}, ${TENANT_BETA})
      `;
      await prisma.$executeRaw`
        DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN (${TENANT_ALPHA}, ${TENANT_BETA})
      `;
    }
  });

  beforeEach(async () => {
    ragExecutionLog = [];
    jest.clearAllMocks();

    if (dispatcher) {
      await dispatcher.abortAndDrainAll('TEARDOWN');
    }
    if (worker) {
      await worker.onApplicationShutdown('TEARDOWN');
    }

    const testId = `be07_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    TENANT_ALPHA = `tenant_final_alpha_${testId}`;
    TENANT_BETA = `tenant_final_beta_${testId}`;
    USER_ALPHA_1 = `usr_physio_alpha_01_${testId}`;
    USER_ALPHA_2 = `usr_physio_alpha_02_${testId}`;
    USER_ALPHA_OWNER = `usr_owner_alpha_${testId}`;
    USER_BETA_1 = `usr_physio_beta_01_${testId}`;

    PRINCIPAL_ALPHA_1 = {
      actorId: USER_ALPHA_1,
      tenantId: TENANT_ALPHA,
      roles: ['Trainer'],
      permissions: [],
      email: `alpha1_${testId}@kinergy.com`,
    };

    PRINCIPAL_ALPHA_2 = {
      actorId: USER_ALPHA_2,
      tenantId: TENANT_ALPHA,
      roles: ['Trainer'],
      permissions: [],
      email: `alpha2_${testId}@kinergy.com`,
    };

    PRINCIPAL_ALPHA_OWNER = {
      actorId: USER_ALPHA_OWNER,
      tenantId: TENANT_ALPHA,
      roles: ['Owner'],
      permissions: ['ai.conversations.audit'],
      email: `owner_${testId}@kinergy.com`,
    };

    PRINCIPAL_BETA_1 = {
      actorId: USER_BETA_1,
      tenantId: TENANT_BETA,
      roles: ['Trainer'],
      permissions: [],
      email: `beta1_${testId}@kinergy.com`,
    };

    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 5000,
      staleThresholdMs: 0,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    reserveUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    controller = new AiConversationController(
      createUseCase,
      reserveUseCase,
      getConvUseCase,
      listConvUseCase,
      getHistoryUseCase,
      null as unknown as UpdateConversationTitleUseCase,
      null as unknown as ArchiveConversationUseCase,
      inspectUseCase,
      null as unknown as CancelConversationTurnUseCase,
    );
  });

  // =========================================================================
  // WORKFLOW A: Initial Conversation Lifecycle, Grounding & Idempotency
  // =========================================================================
  describe('Workflow A: Initial Conversation Lifecycle, Grounding & Idempotency', () => {
    it('executes complete first-turn workflow and recovers idempotently on client retry', async () => {
      const clientTurnId = 'turn_workflow_a_01';
      const prompt = 'Plan de carga excéntrica para tendinopatía aquilea en fase inicial';
      const title = 'Tendinopatía Aquilea';

      // 1. Submit initial conversation via controller (simulates authenticated REST API request)
      const createReq: CreateConversationRequestDto = {
        clientTurnId,
        userPrompt: prompt,
        title,
      };

      const response = await controller.createConversation(PRINCIPAL_ALPHA_1, createReq);

      expect(response.conversationId).toBeDefined();
      expect(response.turnId).toBeDefined();
      expect(response.turnIndex).toBe(1);
      expect(response.turnStatus).toBe(TurnStatus.PENDING);
      expect(response.isIdempotentReplay).toBe(false);

      // 2. Await asynchronous worker completion in PostgreSQL
      for (let attempt = 0; attempt < 40; attempt++) {
        const turn = await turnRepo.findById(
          TENANT_ALPHA,
          response.conversationId,
          response.turnId,
        );
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // 3. Verify PostgreSQL database state
      const turnInDb = await turnRepo.findById(
        TENANT_ALPHA,
        response.conversationId,
        response.turnId,
      );
      expect(turnInDb?.status).toBe(TurnStatus.COMPLETED);
      expect(turnInDb?.completedAt).not.toBeNull();

      // 4. Verify canonical message history
      const history = await controller.getMessageHistory(
        PRINCIPAL_ALPHA_1,
        response.conversationId,
        {
          limit: 10,
        },
      );

      expect(history.messages).toHaveLength(2);
      expect(history.messages[0]?.role).toBe(ConversationRole.USER);
      expect(history.messages[0]?.content).toBe(prompt);
      expect(history.messages[0]?.sequenceNumber).toBe(1);

      expect(history.messages[1]?.role).toBe(ConversationRole.ASSISTANT);
      expect(history.messages[1]?.isCanonical).toBe(true);
      expect(history.messages[1]?.status).toBe(GenerationStatus.SUCCESS);
      expect(history.messages[1]?.sequenceNumber).toBe(2);
      expect(history.messages[1]?.content).toContain('Grounded clinical answer');
      expect(history.messages[1]?.sources).toHaveLength(1);
      expect(history.messages[1]?.sources?.[0]?.documentId).toBe('doc_final_protocol_01');

      // 5. Client retries initial submission with exact same clientTurnId
      const replayResponse = await controller.createConversation(PRINCIPAL_ALPHA_1, createReq);

      expect(replayResponse.isIdempotentReplay).toBe(true);
      expect(replayResponse.conversationId).toBe(response.conversationId);
      expect(replayResponse.turnId).toBe(response.turnId);
      expect(replayResponse.userMessageId).toBe(response.userMessageId);
      expect(replayResponse.assistantAttemptId).toBe(response.assistantAttemptId);

      // 6. Assert zero duplicate records in PostgreSQL
      const convCount = await prisma.aiConversation.count({
        where: { tenantId: TENANT_ALPHA },
      });
      const turnCount = await prisma.aiConversationTurn.count({
        where: { tenantId: TENANT_ALPHA },
      });
      const msgCount = await prisma.aiConversationMessage.count({
        where: { tenantId: TENANT_ALPHA },
      });

      expect(convCount).toBe(1);
      expect(turnCount).toBe(1);
      expect(msgCount).toBe(2);
    });
  });

  // =========================================================================
  // WORKFLOW B: Multi-Turn Conversation, Context Loading & Chronology
  // =========================================================================
  describe('Workflow B: Multi-Turn Conversation, Context Loading & Chronology', () => {
    it('executes sequential turns, passes preceding history to RAG pipeline, and enforces monotonic sequence numbers', async () => {
      // 1. Create Turn 1
      const conv = await createUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        clientTurnId: 'turn_multi_t1',
        userPrompt: 'Turno 1: Evaluación de rango articular de rodilla',
      });

      // Complete Turn 1
      await executeUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        conversationId: conv.conversationId,
        turnId: conv.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 2. Reserve Turn 2 via controller
      const reserveDto: ReserveTurnRequestDto = {
        clientTurnId: 'turn_multi_t2',
        userPrompt: 'Turno 2: ¿Cuáles son las banderas rojas a considerar?',
      };

      const turn2Response = await controller.reserveTurn(
        PRINCIPAL_ALPHA_1,
        conv.conversationId,
        reserveDto,
      );

      expect(turn2Response.turnIndex).toBe(2);
      expect(turn2Response.turnStatus).toBe(TurnStatus.PENDING);

      // Await Turn 2 execution in PostgreSQL
      for (let attempt = 0; attempt < 40; attempt++) {
        const turn = await turnRepo.findById(
          TENANT_ALPHA,
          conv.conversationId,
          turn2Response.turnId,
        );
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // 3. Verify canonical history loading: RAG pipeline received preceding canonical messages
      const lastRagExecution = ragExecutionLog[ragExecutionLog.length - 1];
      expect(lastRagExecution).toBeDefined();
      expect(lastRagExecution?.prompt).toContain('Turno 2');
      // Turn 2 execution received preceding history (Turn 1 user + Turn 1 assistant)
      expect(lastRagExecution?.historyCount).toBe(2);

      // 4. Verify chronological message history in PostgreSQL
      const history = await controller.getMessageHistory(PRINCIPAL_ALPHA_1, conv.conversationId, {
        limit: 10,
      });

      expect(history.messages).toHaveLength(4);
      expect(history.messages.map((m) => m.sequenceNumber)).toEqual([1, 2, 3, 4]);
      expect(history.messages.map((m) => m.role)).toEqual([
        ConversationRole.USER,
        ConversationRole.ASSISTANT,
        ConversationRole.USER,
        ConversationRole.ASSISTANT,
      ]);

      // Both assistant messages are canonical and SUCCESS
      const assistantMessages = history.messages.filter(
        (m) => m.role === ConversationRole.ASSISTANT,
      );
      expect(assistantMessages).toHaveLength(2);
      expect(assistantMessages.every((m) => m.isCanonical)).toBe(true);
      expect(assistantMessages.every((m) => m.status === GenerationStatus.SUCCESS)).toBe(true);

      // 5. Verify conversation activity metadata in PostgreSQL
      const convInDb = await prisma.aiConversation.findUnique({
        where: { id: conv.conversationId },
      });
      expect(convInDb?.turnCounter).toBe(2);
      expect(convInDb?.messageCounter).toBe(4);
      expect(convInDb?.lastActivityAt).not.toBeNull();
    });
  });

  // =========================================================================
  // WORKFLOW C: Independent Users, Cross-Tenant Isolation & Privileged Audit
  // =========================================================================
  describe('Workflow C: Independent Users, Cross-Tenant Isolation & Privileged Audit', () => {
    it('enforces same-tenant sharing, cross-tenant isolation, and fail-closed privileged audit', async () => {
      // 1. User Alpha 1 creates conversation in Tenant Alpha
      const convAlpha = await createUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        clientTurnId: 'turn_iso_alpha_01',
        userPrompt: 'Protocolo de reeducación postural',
        title: 'Reeducación Postural',
      });

      // 2. User Alpha 2 (same tenant) can list and view conversation (tenant-shared model)
      const detailSameTenant = await controller.getConversation(
        PRINCIPAL_ALPHA_2,
        convAlpha.conversationId,
      );
      expect(detailSameTenant.id).toBe(convAlpha.conversationId);
      expect(detailSameTenant.title).toBe('Reeducación Postural');

      // 3. User Beta 1 (different tenant) attempts access -> 404 Not Found (zero existence leakage)
      await expect(
        controller.getConversation(PRINCIPAL_BETA_1, convAlpha.conversationId),
      ).rejects.toThrow(ConversationNotFoundError);

      await expect(
        controller.getMessageHistory(PRINCIPAL_BETA_1, convAlpha.conversationId, {}),
      ).rejects.toThrow(ConversationNotFoundError);

      await expect(
        controller.reserveTurn(PRINCIPAL_BETA_1, convAlpha.conversationId, {
          clientTurnId: 'turn_beta_illegal_subseq',
          userPrompt: 'Intento ilegal de turno en otro tenant',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // 4. Authorized Owner inspects conversation with clinical reason -> audit log persisted
      const inspectResult = await controller.auditInspect(
        PRINCIPAL_ALPHA_OWNER,
        convAlpha.conversationId,
        { reason: 'Supervisión de calidad de fisioterapia para certificación ISO' },
      );

      expect(inspectResult.auditLogId).toBeDefined();
      expect(inspectResult.conversation.id).toBe(convAlpha.conversationId);

      const auditLog = await prisma.aiConversationAuditLog.findUnique({
        where: { id: inspectResult.auditLogId },
      });
      expect(auditLog?.tenantId).toBe(TENANT_ALPHA);
      expect(auditLog?.conversationId).toBe(convAlpha.conversationId);
      expect(auditLog?.inspectorUserId).toBe(USER_ALPHA_OWNER);
      expect(auditLog?.reason).toBe(
        'Supervisión de calidad de fisioterapia para certificación ISO',
      );

      // 5. Ensure background turn generation completes cleanly before concluding test
      for (let attempt = 0; attempt < 40; attempt++) {
        const turn = await turnRepo.findById(
          TENANT_ALPHA,
          convAlpha.conversationId,
          convAlpha.turnId,
        );
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await dispatcher.awaitAllActive();
    });
  });

  // =========================================================================
  // WORKFLOW D: Controlled Failure, Lease Recovery & Reconnection
  // =========================================================================
  describe('Workflow D: Controlled Failure, Lease Recovery & Reconnection', () => {
    it('recovers an interrupted worker turn, finalizes canonical answer, and clears lease fields', async () => {
      // 1. Create turn without immediate execution (simulates crash after commit)
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        clientTurnId: 'turn_recovery_workflow_01',
        userPrompt: 'Manejo fisioterapéutico de esguince de tobillo grado 3',
      });

      // 2. Simulate worker crash after leasing: set to STREAMING with expired lease
      await turnRepo.updateStatus(TENANT_ALPHA, created.conversationId, created.turnId, {
        status: TurnStatus.STREAMING,
      });
      await prisma.aiConversationMessage.update({
        where: { id: created.assistantAttemptId },
        data: {
          status: 'STREAMING',
          leaseToken: 'lease_crashed_worker_999',
          leaseOwnerInstanceId: 'dead_pod_x',
          leaseExpiresAt: new Date(Date.now() - 360_000), // expired 6 mins ago
        },
      });

      // 3. Restarted recovery worker polls for pending/stalled turns
      const recoveryStats = await worker.poll();
      expect(recoveryStats.recoveredStalled).toBe(1);

      // 4. Await completion of recovered turn
      for (let attempt = 0; attempt < 40; attempt++) {
        const turn = await turnRepo.findById(TENANT_ALPHA, created.conversationId, created.turnId);
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await dispatcher.awaitAllActive();

      // 5. Verify database integrity in PostgreSQL
      const completedTurn = await turnRepo.findById(
        TENANT_ALPHA,
        created.conversationId,
        created.turnId,
      );
      expect(completedTurn?.status).toBe(TurnStatus.COMPLETED);

      const assistantMsg = await prisma.aiConversationMessage.findUnique({
        where: { id: created.assistantAttemptId },
      });
      expect(assistantMsg?.status).toBe('SUCCESS');
      expect(assistantMsg?.isCanonical).toBe(true);
      // Hardening invariant: lease fields MUST be cleared on terminal transition
      expect(assistantMsg?.leaseToken).toBeNull();
      expect(assistantMsg?.leaseOwnerInstanceId).toBeNull();
      expect(assistantMsg?.leaseExpiresAt).toBeNull();

      // 6. Client retries original request -> recovers canonical answer seamlessly
      const replay = await controller.createConversation(PRINCIPAL_ALPHA_1, {
        clientTurnId: 'turn_recovery_workflow_01',
        userPrompt: 'Manejo fisioterapéutico de esguince de tobillo grado 3',
      });
      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.turnStatus).toBe(TurnStatus.COMPLETED);
    });
  });

  // =========================================================================
  // TASK 6: Direct PostgreSQL Database Invariant Assertions
  // =========================================================================
  describe('Task 6: Direct PostgreSQL Database Invariant Assertions', () => {
    it('verifies all relational constraints, partial indexes, and check constraints against PostgreSQL', async () => {
      // Use offline use case to avoid racing background dispatch during direct constraint verification
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        clientTurnId: 'turn_invariants_proof_01',
        userPrompt: 'Verificación de invariantes en PostgreSQL',
      });

      // Complete turn
      await executeUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA_1,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Invariant 1: Single user message per turn (uq_turn_single_user_message)
      await expect(
        prisma.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "status", "created_at", "updated_at"
          ) VALUES (
            'msg_illegal_dup_user', ${created.turnId}, ${created.conversationId}, ${TENANT_ALPHA}, 'USER', 99, 1, 'SUCCESS', NOW(), NOW()
          )
        `,
      ).rejects.toThrow(/23505|uq_turn_single_user_message/i);

      // Invariant 2: Single canonical assistant message per turn (uq_turn_single_canonical_assistant)
      await expect(
        prisma.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "created_at", "updated_at"
          ) VALUES (
            'msg_illegal_second_canonical', ${created.turnId}, ${created.conversationId}, ${TENANT_ALPHA}, 'ASSISTANT', 100, 2, TRUE, 'SUCCESS', NOW(), NOW()
          )
        `,
      ).rejects.toThrow(/23505|uq_turn_single_canonical_assistant/i);

      // Invariant 3: Canonical requires success check constraint (chk_canonical_requires_success)
      await expect(
        prisma.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "created_at", "updated_at"
          ) VALUES (
            'msg_illegal_canonical_failed', ${created.turnId}, ${created.conversationId}, ${TENANT_ALPHA}, 'ASSISTANT', 101, 3, TRUE, 'FAILED', NOW(), NOW()
          )
        `,
      ).rejects.toThrow(/23514|chk_canonical_requires_success/i);

      // Invariant 4: Terminal attempt has no active lease (chk_terminal_attempt_no_active_lease)
      await expect(
        prisma.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "lease_token", "created_at", "updated_at"
          ) VALUES (
            'msg_illegal_lease_on_success', ${created.turnId}, ${created.conversationId}, ${TENANT_ALPHA}, 'ASSISTANT', 102, 4, FALSE, 'SUCCESS', 'active_lease_tok', NOW(), NOW()
          )
        `,
      ).rejects.toThrow(/23514|chk_terminal_attempt_no_active_lease/i);

      // Invariant 5: Unique clientTurnId per tenant (uq_turn_tenant_client_turn_id)
      await expect(
        prisma.$executeRaw`
          INSERT INTO "ai_conversation_turns" (
            "id", "conversation_id", "tenant_id", "turn_index", "client_turn_id", "idempotency_key", "idempotency_payload_hash", "status", "created_at", "updated_at"
          ) VALUES (
            'turn_illegal_dup_key', ${created.conversationId}, ${TENANT_ALPHA}, 99, 'turn_invariants_proof_01', 'idemp_key_dup', 'hash_dup', 'PENDING', NOW(), NOW()
          )
        `,
      ).rejects.toThrow(
        /23505|uq_turn_tenant_client_turn_id|ai_conversation_turns_tenant_id_client_turn_id_key/i,
      );
    });
  });
});
